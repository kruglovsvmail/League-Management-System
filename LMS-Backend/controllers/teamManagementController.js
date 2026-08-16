import pool from '../config/db.js';
import s3 from '../config/s3.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { syncClubMembershipOnTeamJoin, canOfferClubExclusion, removeFromClubOnly, CLUB_EXCLUSION_OFFER_PREDICATE } from '../utils/clubMembership.js';
import { assertPlayersAllowedInDivision, assertApplicationRosterAllowed, loadDivisionQualificationRules } from '../utils/qualificationAccess.js';

/**
 * Роли представителя в турнирной заявке — их ровно три. В ролях внутри команды (team_roles)
 * дополнительно есть head_coach, но в заявке главный тренер и тренер подаются одной ролью 'coach'.
 * Один человек может занимать несколько ролей сразу: на каждую заводится своя строка
 * в tournament_team_roles (уникальность по тройке заявка+человек+роль).
 */
export const TOURNAMENT_ROLES = ['team_manager', 'team_admin', 'coach'];

const toTournamentRole = (teamRole) => (teamRole === 'head_coach' ? 'coach' : teamRole);

const normalizeTournamentRoles = (roles) => {
    if (!Array.isArray(roles)) return [];
    return [...new Set(roles.map(toTournamentRole))].filter(r => TOURNAMENT_ROLES.includes(r));
};

export const searchTeams = async (req, res) => {
    try {
        const { q } = req.query;
        // Команд в системе больше, чем помещается на экран — отдаём страницами
        // и вместе с ними общее количество, чтобы фронт нарисовал пагинацию
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const offset = (page - 1) * limit;
        // Помимо базовых полей отдаём счётчики для карточек выбора команды:
        // размер базы/ростера, активные заявки в лиги и последняя активность
        // участников в Team-Room (максимум page_visits.last_visited_at).
        let query = `
            SELECT t.id, t.name, t.short_name, t.city, t.logo_url,
                (t.owner_id IS NOT NULL) AS has_owner,
                (SELECT COUNT(*)::int FROM team_members tm
                 WHERE tm.team_id = t.id AND tm.left_at IS NULL) AS base_count,
                (SELECT COUNT(*)::int FROM team_rosters tr
                 JOIN team_members tm ON tr.member_id = tm.id
                 WHERE tr.team_id = t.id AND tr.left_at IS NULL AND tm.left_at IS NULL) AS roster_count,
                (SELECT COUNT(*)::int FROM tournament_teams tt
                 JOIN divisions d ON tt.division_id = d.id
                 WHERE tt.team_id = t.id AND tt.status = 'approved'
                   AND (d.end_date IS NULL OR d.end_date >= NOW())) AS active_apps_count,
                (SELECT MAX(pv.last_visited_at) FROM page_visits pv
                 JOIN team_members tm ON tm.user_id = pv.user_id
                 WHERE tm.team_id = t.id AND tm.left_at IS NULL) AS last_activity
            FROM teams t`;
        let values = [];

        let where = '';
        if (q && q !== 'undefined' && q !== 'null') {
            where = ' WHERE t.name ILIKE $1 OR t.city ILIKE $1';
            values.push(`%${q}%`);
        }
        query += where;
        query += ` ORDER BY t.name ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

        const [result, countResult] = await Promise.all([
            pool.query(query, [...values, limit, offset]),
            pool.query(`SELECT COUNT(*)::int AS total FROM teams t${where}`, values)
        ]);

        res.json({
            success: true,
            data: result.rows,
            total: countResult.rows[0].total,
            page,
            limit
        });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const searchUsers = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 3) return res.json({ success: true, data: [] });

        const result = await pool.query(`
            SELECT id, first_name, last_name, middle_name, phone, avatar_url, birth_date 
            FROM users 
            WHERE phone ILIKE $1 OR last_name ILIKE $1 OR first_name ILIKE $1 
            ORDER BY last_name ASC LIMIT 10
        `, [`%${q}%`]);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const getTeamMembers = async (req, res) => {
    try {
        const { teamId } = req.params;

        // is_virtual = у пользователя нет пароля: аккаунт заведён менеджером,
        // человек ни разу не входил в систему сам (та же логика, что в Метрике)
        const baseRes = await pool.query(`
            SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone, u.birth_date, u.virtual_code,
                   (u.password_hash IS NULL) as is_virtual,
                   tm.photo_url, tm.joined_at, tm.id as member_id,
                   -- Предлагать ли при исключении убрать человека ещё и из базы клуба.
                   -- Условие зеркалит canOfferClubExclusion (utils/clubMembership.js).
                   (${CLUB_EXCLUSION_OFFER_PREDICATE.replaceAll('%USER%', 'u.id')}) AS offer_club_exclusion
            FROM team_members tm
            JOIN users u ON tm.user_id = u.id
            JOIN teams t ON t.id = tm.team_id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL
            ORDER BY u.last_name ASC
        `, [teamId]);

        const rosterRes = await pool.query(`
            SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url,
                   (u.password_hash IS NULL) as is_virtual,
                   tm.photo_url, tr.id as roster_id, tr.jersey_number, tr.position, tr.is_captain, tr.is_assistant, tr.joined_at
            FROM team_rosters tr
            JOIN team_members tm ON tr.member_id = tm.id
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = $1 AND tr.left_at IS NULL AND tm.left_at IS NULL
        `, [teamId]);

        const staffRes = await pool.query(`
            SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone,
                   (u.password_hash IS NULL) as is_virtual,
                   tm.photo_url, tm.id as member_id, MIN(tr.joined_at) as joined_at,
                   STRING_AGG(tr.role, ', ' ORDER BY tr.role) as roles
            FROM team_roles tr
            JOIN team_members tm ON tr.member_id = tm.id
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = $1 AND tr.left_at IS NULL AND tm.left_at IS NULL
            GROUP BY u.id, tm.id, tm.photo_url, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone, u.password_hash
        `, [teamId]);

        // Владелец команды (teams.owner_id) — отдельная сущность, а не роль в штабе:
        // он может вообще не числиться в team_members, поэтому берём его прямым JOIN
        // от teams, а не из выборок выше.
        const ownerRes = await pool.query(`
            SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.phone, u.avatar_url,
                   (u.password_hash IS NULL) as is_virtual
            FROM teams t
            JOIN users u ON u.id = t.owner_id
            WHERE t.id = $1
        `, [teamId]);

        res.json({
            success: true,
            base: baseRes.rows,
            roster: rosterRes.rows,
            staff: staffRes.rows,
            owner: ownerRes.rows[0] || null
        });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

/**
 * Назначение или снятие владельца команды (teams.owner_id) из LMS.
 * Владелец у команды ровно один — колонка перезаписывается, а не дополняется,
 * так что отдельная проверка на «уже есть владелец» не нужна.
 * Членом команды он быть не обязан: в Team-Room owner_id — самостоятельное основание
 * для роли OWNER и доступа к команде, даже без записи в team_members.
 * userId = null снимает владельца.
 */
export const setTeamOwner = async (req, res) => {
    try {
        const { teamId } = req.params;
        const { userId } = req.body;
        const nextOwnerId = (userId === null || userId === undefined || userId === '') ? null : parseInt(userId, 10);

        if (nextOwnerId !== null && Number.isNaN(nextOwnerId)) {
            return res.status(400).json({ success: false, error: 'Некорректный пользователь' });
        }

        const teamRes = await pool.query('SELECT id FROM teams WHERE id = $1', [teamId]);
        if (teamRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Команда не найдена' });
        }

        // Заблокированный аккаунт владельцем быть не может: он всё равно не пройдёт вход
        // в Team-Room, а команда осталась бы с формальным, но нерабочим владельцем.
        if (nextOwnerId !== null) {
            const userRes = await pool.query(`SELECT id FROM users WHERE id = $1 AND status = 'active'`, [nextOwnerId]);
            if (userRes.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Пользователь не найден или заблокирован' });
            }
        }

        await pool.query('UPDATE teams SET owner_id = $1, updated_at = NOW() WHERE id = $2', [nextOwnerId, teamId]);

        const ownerRes = nextOwnerId === null ? { rows: [] } : await pool.query(`
            SELECT id as user_id, first_name, last_name, middle_name, phone, avatar_url,
                   (password_hash IS NULL) as is_virtual
            FROM users WHERE id = $1
        `, [nextOwnerId]);

        res.json({ success: true, owner: ownerRes.rows[0] || null });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const addTeamMember = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { teamId } = req.params;
        const { userId, type, position, jerseyNumber, roles, action, isCaptain, isAssistant, alsoRemoveFromClub } = req.body;

        let memberId;
        let removedFromClub = false;
        const tmRes = await client.query('SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
        if (tmRes.rows.length > 0) {
            memberId = tmRes.rows[0].id;
            if (action !== 'remove_club' && action !== 'remove') {
                await client.query('UPDATE team_members SET left_at = NULL WHERE id = $1', [memberId]);
            }
        } else {
            const insertTm = await client.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) RETURNING id', [teamId, userId]);
            memberId = insertTm.rows[0].id;
        }

        // Появление в составе команды (в том числе через ростер или штаб — там членство
        // создаётся тут же) тянет человека в общую базу клуба, если команда в клубе
        if (action !== 'remove_club' && action !== 'remove') {
            await syncClubMembershipOnTeamJoin(teamId, userId, client);
        }

        if (action === 'remove_club') {
            await client.query(`UPDATE team_members SET left_at = NOW() WHERE id = $1`, [memberId]);
            await client.query(`UPDATE team_rosters SET left_at = NOW(), position = NULL, jersey_number = NULL, is_captain = false, is_assistant = false WHERE member_id = $1`, [memberId]);
            await client.query(`UPDATE team_roles SET left_at = NOW() WHERE member_id = $1`, [memberId]);

            // Галочка «убрать и из клуба» — только если команда была единственной
            // ниточкой человека к клубу. Условие перепроверяем: клиент мог прислать зря.
            if (alsoRemoveFromClub && await canOfferClubExclusion(teamId, userId, client)) {
                const { rows: clubRows } = await client.query('SELECT club_id FROM teams WHERE id = $1', [teamId]);
                if (clubRows[0]?.club_id) {
                    await removeFromClubOnly(clubRows[0].club_id, userId, client);
                    removedFromClub = true;
                }
            }
        }
        else if (action === 'remove') {
            if (type === 'player') {
                await client.query(`UPDATE team_rosters SET left_at = NOW(), position = NULL, jersey_number = NULL, is_captain = false, is_assistant = false WHERE team_id = $1 AND member_id = $2`, [teamId, memberId]);
            }
        } 
        else {
            if (type === 'player') {
                const checkNum = await client.query(`SELECT id FROM team_rosters WHERE team_id = $1 AND jersey_number = $2 AND left_at IS NULL AND member_id != $3`, [teamId, jerseyNumber, memberId]);
                if (checkNum.rows.length > 0) throw new Error(`Номер ${jerseyNumber} уже занят в этой команде`);

                await client.query(`
                    INSERT INTO team_rosters (team_id, member_id, position, jersey_number, is_captain, is_assistant)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (member_id) DO UPDATE 
                    SET position = $3, jersey_number = $4, is_captain = $5, is_assistant = $6, left_at = NULL
                `, [teamId, memberId, position, jerseyNumber, isCaptain || false, isAssistant || false]);
            } 
            else if (type === 'staff' && Array.isArray(roles)) {
                await client.query(`UPDATE team_roles SET left_at = NOW() WHERE member_id = $1 AND left_at IS NULL`, [memberId]);
                
                if (roles.length > 0) {
                    const rValues = [];
                    const rParams = [];
                    let rIdx = 1;
                    roles.forEach(role => {
                        rValues.push(`($${rIdx++}, $${rIdx++})`);
                        rParams.push(memberId, role);
                    });
                    await client.query(`
                        INSERT INTO team_roles (member_id, role) VALUES ${rValues.join(', ')}
                        ON CONFLICT (member_id, role) DO UPDATE SET left_at = NULL
                    `, rParams);
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, removedFromClub });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
    } finally { client.release(); }
};

export const uploadMemberPhoto = async (req, res) => {
    try {
        const { teamId, userId } = req.params;
        if (!req.file) return res.status(400).json({ success: false, error: 'Файл не найден' });
        const ext = req.file.originalname.split('.').pop();
        const fileName = `uploads/teams_${teamId}_users_${userId}_photo_${Date.now()}.${ext}`;
        
        await s3.send(new PutObjectCommand({
            Bucket: 'hockeyeco-uploads', Key: fileName, Body: req.file.buffer, ContentType: req.file.mimetype
        }));

        const shortUrl = `/${fileName}`;
        await pool.query(`UPDATE team_members SET photo_url = $1 WHERE team_id = $2 AND user_id = $3`, [shortUrl, teamId, userId]);
        res.json({ success: true, url: shortUrl });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const deleteMemberPhoto = async (req, res) => {
    try {
        const { teamId, userId } = req.params;
        await pool.query(`UPDATE team_members SET photo_url = NULL WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const getAvailableLeaguesAndDivisions = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT l.id as league_id, l.name as league_name, l.logo_url as league_logo,
                   json_agg(json_build_object(
                       'id', d.id, 'name', d.name, 
                       'app_start', d.application_start, 'app_end', d.application_end,
                       'digital_applications_only', d.digital_applications_only
                   )) as divisions
            FROM divisions d
            JOIN seasons s ON d.season_id = s.id
            JOIN leagues l ON s.league_id = l.id
            WHERE NOW() BETWEEN d.application_start AND d.application_end
            GROUP BY l.id, l.name, l.logo_url
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// GET /teams-manage/:teamId/qual-eligibility?divisionId=
// Кого из состава команды не пропустит квалификация в этот дивизион. Шторки добавления
// игроков красят таких серым и показывают причину — но это подсказка, а не защита:
// сохранение проверяет допуск само (assertPlayersAllowedInDivision).
export const getQualificationEligibility = async (req, res) => {
    try {
        const { teamId } = req.params;
        const divisionId = req.query.divisionId ? Number(req.query.divisionId) : null;

        const rules = await loadDivisionQualificationRules(pool, divisionId);
        if (!rules || !rules.enabled) {
            return res.json({ success: true, enabled: false, blocked: {} });
        }

        const { rows } = await pool.query(`
            SELECT tm.user_id, lq.short_name
            FROM team_members tm
            LEFT JOIN user_qualifications uq
                   ON uq.user_id = tm.user_id AND uq.league_id = $2 AND uq.ended_at IS NULL
            LEFT JOIN league_qualifications lq ON lq.id = uq.qualification_id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM division_qualifications dq
                  WHERE dq.division_id = $3
                    AND dq.qualification_id IS NOT DISTINCT FROM uq.qualification_id
              )
        `, [teamId, rules.leagueId, divisionId]);

        const blocked = {};
        rows.forEach(row => {
            blocked[row.user_id] = `${row.short_name || 'Без квалификации'} — не допущены в этот дивизион`;
        });

        res.json({ success: true, enabled: true, blocked });
    } catch (err) {
        console.error('Ошибка проверки допуска по квалификациям:', err);
        res.status(500).json({ success: false, error: 'Ошибка проверки допуска по квалификациям' });
    }
};

export const getTeamApplications = async (req, res) => {
    try {
        const { teamId } = req.params;
        const result = await pool.query(`
            SELECT tt.id, tt.status, tt.created_at, tt.paper_roster_team_url, tt.paper_roster_league_url,
                   tt.division_id,
                   d.name as division_name, d.end_date as division_end_date, d.digital_applications_only,
                   s.name as season_name, 
                   l.name as league_name, l.logo_url as league_logo,
                   
                   -- Игроки
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', tr.id, 'player_id', tr.player_id, 'jersey_number', tr.jersey_number,
                           'position', tr.position, 'is_captain', tr.is_captain, 'is_assistant', tr.is_assistant,
                           'application_status', tr.application_status,
                           'medical_url', tr.medical_url, 'insurance_url', tr.insurance_url, 'consent_url', tr.consent_url,
                           'medical_expires_at', tr.medical_expires_at, 'insurance_expires_at', tr.insurance_expires_at, 'consent_expires_at', tr.consent_expires_at,
                           'first_name', u.first_name, 'last_name', u.last_name, 'middle_name', u.middle_name,
                           'user_avatar_url', u.avatar_url,
                           'team_member_photo_url', tm.photo_url
                       ) ORDER BY u.last_name ASC)
                       FROM tournament_rosters tr
                       JOIN users u ON tr.player_id = u.id
                       LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tt.team_id
                       WHERE tr.tournament_team_id = tt.id AND tr.period_end IS NULL), 
                   '[]'::json) as roster,

                   -- Персонал
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', ttr.id,
                           'user_id', ttr.user_id,
                           'role', ttr.tournament_role,
                           'first_name', u.first_name, 'last_name', u.last_name, 'middle_name', u.middle_name,
                           'user_avatar_url', u.avatar_url,
                           'team_member_photo_url', tm.photo_url
                       ) ORDER BY u.last_name ASC)
                       FROM tournament_team_roles ttr
                       JOIN users u ON ttr.user_id = u.id
                       LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tt.team_id
                       WHERE ttr.tournament_team_id = tt.id AND ttr.left_at IS NULL), 
                   '[]'::json) as staff

            FROM tournament_teams tt
            JOIN divisions d ON tt.division_id = d.id
            JOIN seasons s ON d.season_id = s.id
            JOIN leagues l ON s.league_id = l.id
            WHERE tt.team_id = $1
            ORDER BY tt.created_at DESC
        `, [teamId]);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const createTeamApplication = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { teamId } = req.params;
        let { divisionId, playerIds } = req.body;

        if (typeof playerIds === 'string') {
            try { playerIds = JSON.parse(playerIds); } catch(e) { playerIds = []; }
        }

        const checkApp = await client.query(`SELECT id FROM tournament_teams WHERE team_id = $1 AND division_id = $2`, [teamId, divisionId]);
        if (checkApp.rows.length > 0) throw new Error('Заявка в этот дивизион уже существует');

        await assertPlayersAllowedInDivision(client, divisionId, playerIds);

        const status = req.file ? 'pending' : 'draft';

        const appRes = await client.query(
            `INSERT INTO tournament_teams (division_id, team_id, status) VALUES ($1, $2, $3) RETURNING id`,
            [divisionId, teamId, status]
        );
        const appId = appRes.rows[0].id;

        if (req.file) {
            const ext = req.file.originalname.split('.').pop();
            const fileName = `uploads/paper_application_tournament_teams_${appId}.${ext}`;

            await s3.send(new PutObjectCommand({
                Bucket: 'hockeyeco-uploads',
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype
            }));

            const url = `/${fileName}`;
            await client.query(`UPDATE tournament_teams SET paper_roster_team_url = $1 WHERE id = $2`, [url, appId]);
        }

        if (playerIds && playerIds.length > 0) {
            await client.query(`
                INSERT INTO tournament_rosters (tournament_team_id, player_id, position, jersey_number, is_captain, is_assistant)
                SELECT $1, tm.user_id, tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant 
                FROM team_rosters tr 
                JOIN team_members tm ON tr.member_id = tm.id
                WHERE tm.team_id = $2 AND tm.user_id = ANY($3::int[])
            `, [appId, teamId, playerIds]);
        }

        await client.query('COMMIT');
        res.json({ success: true, applicationId: appId });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
    } finally { client.release(); }
};

export const deleteTeamApplication = async (req, res) => {
    try {
        const { appId } = req.params;
        await pool.query(`DELETE FROM tournament_teams WHERE id = $1`, [appId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const sendApplicationForReview = async (req, res) => {
    try {
        const { appId } = req.params;

        // Состав мог быть собран до того, как лига сменила игроку квалификацию или список
        // допущенных в дивизион — поэтому перед отправкой проверяем заявку целиком.
        await assertApplicationRosterAllowed(pool, appId);

        const checkRes = await pool.query(`
            SELECT
                tt.paper_roster_league_url,
                d.digital_applications_only,
                (SELECT COUNT(*) FROM tournament_team_roles WHERE tournament_team_id = tt.id AND left_at IS NULL) as staff_count
            FROM tournament_teams tt
            JOIN divisions d ON tt.division_id = d.id
            WHERE tt.id = $1
        `, [appId]);

        if (checkRes.rows.length > 0) {
            const appData = checkRes.rows[0];
            
            if (appData.digital_applications_only || appData.paper_roster_league_url !== null) {
                if (parseInt(appData.staff_count) === 0) {
                    throw new Error('Нельзя отправить заявку: необходимо добавить хотя бы одного представителя команды (тренера или менеджера).');
                }
            }
        }

        await pool.query(`UPDATE tournament_teams SET status = 'pending' WHERE id = $1`, [appId]);
        res.json({ success: true });
        
    } catch (err) { 
        res.status(400).json({ success: false, error: err.message }); 
    }
};

export const addPlayerToApplication = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { teamId, appId } = req.params;
        const { playerIds } = req.body;
        
        const checkApp = await client.query(`
            SELECT tt.division_id, tt.paper_roster_league_url, d.digital_applications_only
            FROM tournament_teams tt
            JOIN divisions d ON tt.division_id = d.id
            WHERE tt.id = $1
        `, [appId]);

        if (checkApp.rows.length > 0) {
            const appData = checkApp.rows[0];
            if (!appData.digital_applications_only && !appData.paper_roster_league_url) {
                throw new Error('Добавление игроков заблокировано: ожидается проверка бумажной заявки лигой');
            }
            await assertPlayersAllowedInDivision(client, appData.division_id, playerIds);
        }

        if (playerIds && playerIds.length > 0) {
            const pRes = await client.query(`
                SELECT tm.user_id as pid, tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant 
                FROM team_rosters tr 
                JOIN team_members tm ON tr.member_id = tm.id
                WHERE tm.team_id = $1 AND tm.user_id = ANY($2::int[])
            `, [teamId, playerIds]);
            
            const checkRes = await client.query(`
                SELECT player_id FROM tournament_rosters WHERE tournament_team_id = $1 AND player_id = ANY($2::int[])
            `, [appId, playerIds]);
            const existingPids = new Set(checkRes.rows.map(r => r.player_id));

            const insertValues = [];
            const insertParams = [];
            let insertIdx = 1;

            const updateValues = [];
            const updateParams = [];
            let updateIdx = 1;

            for (const row of pRes.rows) {
                if (existingPids.has(row.pid)) {
                    updateValues.push(`($${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++})`);
                    updateParams.push(appId, row.pid, row.position, row.jersey_number, row.is_captain || false, row.is_assistant || false);
                } else {
                    insertValues.push(`($${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++})`);
                    insertParams.push(appId, row.pid, row.position, row.jersey_number, row.is_captain || false, row.is_assistant || false);
                }
            }

            if (updateValues.length > 0) {
                await client.query(`
                    UPDATE tournament_rosters AS tr
                    SET period_end = NULL,
                        application_status = 'pending',
                        position = v.position,
                        jersey_number = v.jersey_number::int,
                        is_captain = v.is_captain::boolean,
                        is_assistant = v.is_assistant::boolean,
                        updated_at = NOW()
                    FROM (VALUES ${updateValues.join(', ')}) AS v(app_id, pid, position, jersey_number, is_captain, is_assistant)
                    WHERE tr.tournament_team_id = v.app_id::int AND tr.player_id = v.pid::int
                `, updateParams);
            }

            if (insertValues.length > 0) {
                await client.query(`
                    INSERT INTO tournament_rosters (tournament_team_id, player_id, position, jersey_number, is_captain, is_assistant)
                    VALUES ${insertValues.join(', ')}
                `, insertParams);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        // status у ошибки ставят проверки допуска: их текст нужно показать команде как есть,
        // а не прятать за общей 500-й
        res.status(err.status || 500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

export const removePlayerFromApplication = async (req, res) => {
    try {
        const { rosterId } = req.params;
        await pool.query(`DELETE FROM tournament_rosters WHERE id = $1`, [rosterId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const addStaffToApplication = async (req, res) => {
    const client = await pool.connect();
    try {
        const { appId } = req.params;
        const { userId, roles } = req.body;

        if (!userId) return res.status(400).json({ success: false, error: 'User ID обязателен' });

        await client.query('BEGIN');

        // roles — ПОЛНЫЙ набор ролей человека в заявке: он может быть одновременно
        // руководителем, тренером и администратором (по строке на каждую роль).
        // Пустой набор = убрать из заявки совсем.
        const nextRoles = normalizeTournamentRoles(roles);

        await client.query(`
            UPDATE tournament_team_roles
            SET left_at = NOW()
            WHERE tournament_team_id = $1 AND user_id = $2 AND left_at IS NULL
              AND NOT (tournament_role = ANY($3::varchar[]))
        `, [appId, userId, nextRoles]);

        if (nextRoles.length > 0) {
            // Уникальность по тройке заявка+человек+роль: повторное добавление ранее снятой
            // роли переоткрывает ту же строку вместо создания дубля.
            await client.query(`
                INSERT INTO tournament_team_roles (tournament_team_id, user_id, tournament_role)
                SELECT $1, $2, r FROM unnest($3::varchar[]) AS r
                ON CONFLICT (tournament_team_id, user_id, tournament_role) DO UPDATE SET left_at = NULL
            `, [appId, userId, nextRoles]);
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка добавления персонала в заявку:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

// Без :role — человек убирается из заявки целиком, с :role — снимается только эта его роль
export const removeStaffFromApplication = async (req, res) => {
    try {
        const { appId, userId, role } = req.params;
        const roleFilter = TOURNAMENT_ROLES.includes(role) ? role : null;
        await pool.query(`
            UPDATE tournament_team_roles
            SET left_at = NOW()
            WHERE tournament_team_id = $1 AND user_id = $2 AND left_at IS NULL
              AND ($3::varchar IS NULL OR tournament_role = $3)
        `, [appId, userId, roleFilter]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления персонала из заявки:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};