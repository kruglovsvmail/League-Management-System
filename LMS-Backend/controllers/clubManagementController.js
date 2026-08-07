import pool from '../config/db.js';

/**
 * Управление клубами из LMS (глобальный админ).
 *
 * Клуб — организация над командами: у него есть общая база людей (club_members),
 * штаб (club_roles), владелец (clubs.owner_id) и набор команд (teams.club_id).
 * Игрового ростера у клуба нет — номера и амплуа живут в командах.
 */

// Клубные роли: те же три, что и в Team-Room
export const CLUB_ROLES = ['top_manager', 'club_admin', 'coach'];

const normalizeClubRoles = (roles) => {
    if (!Array.isArray(roles)) return [];
    return [...new Set(roles)].filter(r => CLUB_ROLES.includes(r));
};

export const searchClubs = async (req, res) => {
    try {
        const { q } = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const offset = (page - 1) * limit;

        // Счётчики для карточек выбора клуба: размер общей базы, число команд
        // и последняя активность людей клуба в Team-Room
        let query = `
            SELECT c.id, c.name, c.city, c.logo_url,
                (c.owner_id IS NOT NULL) AS has_owner,
                (SELECT COUNT(*)::int FROM club_members cm
                 WHERE cm.club_id = c.id AND cm.left_at IS NULL) AS members_count,
                (SELECT COUNT(*)::int FROM teams t WHERE t.club_id = c.id) AS teams_count,
                (SELECT COUNT(*)::int FROM club_roles cr
                 JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
                 WHERE cr.club_id = c.id AND cr.left_at IS NULL AND cm.left_at IS NULL) AS staff_count,
                (SELECT MAX(pv.last_visited_at) FROM page_visits pv
                 JOIN club_members cm ON cm.user_id = pv.user_id
                 WHERE cm.club_id = c.id AND cm.left_at IS NULL) AS last_activity
            FROM clubs c`;
        let values = [];

        let where = '';
        if (q && q !== 'undefined' && q !== 'null') {
            where = ' WHERE c.name ILIKE $1 OR c.city ILIKE $1';
            values.push(`%${q}%`);
        }
        query += where;
        query += ` ORDER BY c.name ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

        const [result, countResult] = await Promise.all([
            pool.query(query, [...values, limit, offset]),
            pool.query(`SELECT COUNT(*)::int AS total FROM clubs c${where}`, values)
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

/**
 * Состав, штаб, команды и владелец клуба одним запросом — так же, как getTeamMembers.
 * У каждого человека отдаём команды ЭТОГО клуба, в которых он активен: по ним
 * видно, кто играет, а кто пока в резерве, и что заденет исключение из клуба.
 */
export const getClubDetails = async (req, res) => {
    try {
        const { clubId } = req.params;

        const clubRes = await pool.query(`
            SELECT id, name, city, description, logo_url, color_1, color_2, owner_id, created_at
            FROM clubs WHERE id = $1
        `, [clubId]);

        if (clubRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Клуб не найден' });
        }

        // is_virtual = у пользователя нет пароля: аккаунт заведён менеджером
        const membersRes = await pool.query(`
            SELECT u.id AS user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url,
                   u.phone, u.birth_date, u.virtual_code,
                   (u.password_hash IS NULL) AS is_virtual,
                   cm.id AS member_id, cm.joined_at,
                   (
                     SELECT STRING_AGG(cr.role, ', ' ORDER BY cr.role)
                     FROM club_roles cr
                     WHERE cr.club_id = cm.club_id AND cr.user_id = u.id AND cr.left_at IS NULL
                   ) AS roles,
                   COALESCE((
                     SELECT JSON_AGG(JSON_BUILD_OBJECT('id', t.id, 'name', t.name) ORDER BY t.name)
                     FROM team_members tm
                     JOIN teams t ON t.id = tm.team_id
                     WHERE tm.user_id = u.id AND tm.left_at IS NULL AND t.club_id = cm.club_id
                   ), '[]'::json) AS teams
            FROM club_members cm
            JOIN users u ON cm.user_id = u.id
            WHERE cm.club_id = $1 AND cm.left_at IS NULL
            ORDER BY u.last_name ASC
        `, [clubId]);

        // Штаб — это те же люди из состава, у кого есть активная клубная роль
        const staffRes = await pool.query(`
            SELECT u.id AS user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone,
                   (u.password_hash IS NULL) AS is_virtual,
                   cm.id AS member_id, MIN(cr.created_at) AS joined_at,
                   STRING_AGG(cr.role, ', ' ORDER BY cr.role) AS roles
            FROM club_roles cr
            JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
            JOIN users u ON u.id = cr.user_id
            WHERE cr.club_id = $1 AND cr.left_at IS NULL AND cm.left_at IS NULL
            GROUP BY u.id, cm.id
            ORDER BY u.last_name ASC
        `, [clubId]);

        const teamsRes = await pool.query(`
            SELECT t.id, t.name, t.short_name, t.city, t.logo_url,
                (t.owner_id IS NOT NULL) AS has_owner,
                (SELECT COUNT(*)::int FROM team_members tm
                 WHERE tm.team_id = t.id AND tm.left_at IS NULL) AS base_count
            FROM teams t
            WHERE t.club_id = $1
            ORDER BY t.name ASC
        `, [clubId]);

        // Владелец клуба — свойство самого клуба: в общей базе он может не числиться
        const ownerRes = await pool.query(`
            SELECT u.id AS user_id, u.first_name, u.last_name, u.middle_name, u.phone, u.avatar_url,
                   (u.password_hash IS NULL) AS is_virtual
            FROM clubs c
            JOIN users u ON u.id = c.owner_id
            WHERE c.id = $1
        `, [clubId]);

        res.json({
            success: true,
            club: clubRes.rows[0],
            members: membersRes.rows,
            staff: staffRes.rows,
            teams: teamsRes.rows,
            owner: ownerRes.rows[0] || null
        });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

/**
 * Назначение или снятие владельца клуба (clubs.owner_id).
 * Владелец у клуба ровно один — колонка перезаписывается. Членом клуба он быть
 * не обязан, как и владелец команды.
 */
export const setClubOwner = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { userId } = req.body;
        const nextOwnerId = (userId === null || userId === undefined || userId === '') ? null : parseInt(userId, 10);

        if (nextOwnerId !== null && Number.isNaN(nextOwnerId)) {
            return res.status(400).json({ success: false, error: 'Некорректный пользователь' });
        }

        const clubRes = await pool.query('SELECT id FROM clubs WHERE id = $1', [clubId]);
        if (clubRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Клуб не найден' });
        }

        // Заблокированный аккаунт владельцем быть не может — он не пройдёт вход в Team-Room
        if (nextOwnerId !== null) {
            const userRes = await pool.query(`SELECT id FROM users WHERE id = $1 AND status = 'active'`, [nextOwnerId]);
            if (userRes.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Пользователь не найден или заблокирован' });
            }
        }

        await pool.query('UPDATE clubs SET owner_id = $1 WHERE id = $2', [nextOwnerId, clubId]);

        const ownerRes = nextOwnerId === null ? { rows: [] } : await pool.query(`
            SELECT id AS user_id, first_name, last_name, middle_name, phone, avatar_url,
                   (password_hash IS NULL) AS is_virtual
            FROM users WHERE id = $1
        `, [nextOwnerId]);

        res.json({ success: true, owner: ownerRes.rows[0] || null });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

/**
 * Добавление человека в общую базу клуба или восстановление ранее ушедшего.
 * Роли при восстановлении не возвращаются — их назначают заново, иначе к человеку
 * молча вернулись бы старые полномочия.
 */
export const addClubMember = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { userId, roles } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, error: 'Не передан пользователь' });
        }

        const clubRes = await pool.query('SELECT id FROM clubs WHERE id = $1', [clubId]);
        if (clubRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Клуб не найден' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const existing = await client.query(
                'SELECT id, left_at FROM club_members WHERE club_id = $1 AND user_id = $2',
                [clubId, userId]
            );

            if (existing.rows.length > 0) {
                await client.query(
                    'UPDATE club_members SET left_at = NULL, joined_at = CURRENT_DATE WHERE id = $1',
                    [existing.rows[0].id]
                );
            } else {
                await client.query(
                    'INSERT INTO club_members (club_id, user_id, joined_at) VALUES ($1, $2, CURRENT_DATE)',
                    [clubId, userId]
                );
            }

            // Человека можно добавить сразу со штабными ролями — из вкладки «Штаб»
            const wantedRoles = normalizeClubRoles(roles);
            for (const role of wantedRoles) {
                await client.query(`
                    INSERT INTO club_roles (club_id, user_id, role, created_at, left_at)
                    VALUES ($1, $2, $3, NOW(), NULL)
                    ON CONFLICT (club_id, user_id, role) DO UPDATE SET left_at = NULL
                `, [clubId, userId, role]);
            }

            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally { client.release(); }

        res.json({ success: true });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

/**
 * Исключение из клуба — каскадом, ровно как в Team-Room:
 * закрываем датой членство в клубе, клубные полномочия, а также членство,
 * игровые карточки и полномочия в командах ЭТОГО клуба. Команды других клубов
 * и самостоятельные команды не трогаем: человек может играть где-то ещё.
 */
export const removeClubMember = async (req, res) => {
    const client = await pool.connect();
    try {
        const { clubId, userId } = req.params;
        await client.query('BEGIN');

        const { rows: affectedTeams } = await client.query(`
            SELECT t.id, t.name
            FROM team_members tm
            JOIN teams t ON t.id = tm.team_id
            WHERE tm.user_id = $1 AND tm.left_at IS NULL AND t.club_id = $2
            ORDER BY t.name
        `, [userId, clubId]);

        await client.query(
            'UPDATE club_members SET left_at = CURRENT_DATE WHERE club_id = $1 AND user_id = $2 AND left_at IS NULL',
            [clubId, userId]
        );

        await client.query(
            'UPDATE club_roles SET left_at = CURRENT_DATE WHERE club_id = $1 AND user_id = $2 AND left_at IS NULL',
            [clubId, userId]
        );

        await client.query(`
            UPDATE team_rosters tr
            SET left_at = CURRENT_DATE
            FROM team_members tm, teams t
            WHERE tr.member_id = tm.id AND t.id = tm.team_id
              AND tm.user_id = $1 AND t.club_id = $2 AND tr.left_at IS NULL
        `, [userId, clubId]);

        await client.query(`
            UPDATE team_roles trole
            SET left_at = CURRENT_DATE
            FROM team_members tm, teams t
            WHERE trole.member_id = tm.id AND t.id = tm.team_id
              AND tm.user_id = $1 AND t.club_id = $2 AND trole.left_at IS NULL
        `, [userId, clubId]);

        await client.query(`
            UPDATE team_members tm
            SET left_at = CURRENT_DATE
            FROM teams t
            WHERE t.id = tm.team_id AND tm.user_id = $1 AND t.club_id = $2 AND tm.left_at IS NULL
        `, [userId, clubId]);

        await client.query('COMMIT');
        res.json({ success: true, affectedTeams });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
    } finally { client.release(); }
};

/**
 * Назначение и снятие клубных ролей.
 * Роль работает только у активного члена клуба (так её читает Team-Room),
 * поэтому человеку вне состава роль не назначаем — сообщаем об этом явно.
 */
export const setClubMemberRoles = async (req, res) => {
    const client = await pool.connect();
    try {
        const { clubId, userId } = req.params;
        const wantedRoles = normalizeClubRoles(req.body?.roles);

        const memberRes = await client.query(
            'SELECT id FROM club_members WHERE club_id = $1 AND user_id = $2 AND left_at IS NULL',
            [clubId, userId]
        );
        if (memberRes.rows.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Человек не состоит в составе клуба — сначала добавьте его в клуб'
            });
        }

        await client.query('BEGIN');

        await client.query(`
            UPDATE club_roles SET left_at = CURRENT_DATE
            WHERE club_id = $1 AND user_id = $2 AND left_at IS NULL AND role <> ALL($3)
        `, [clubId, userId, wantedRoles]);

        for (const role of wantedRoles) {
            await client.query(`
                INSERT INTO club_roles (club_id, user_id, role, created_at, left_at)
                VALUES ($1, $2, $3, NOW(), NULL)
                ON CONFLICT (club_id, user_id, role) DO UPDATE SET left_at = NULL
            `, [clubId, userId, role]);
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
    } finally { client.release(); }
};

/**
 * Поиск команд для привязки к клубу. Вместе с командой отдаём её текущий клуб —
 * админ должен видеть, что забирает команду у другой организации.
 */
export const searchTeamsForClub = async (req, res) => {
    try {
        const { q } = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

        let query = `
            SELECT t.id, t.name, t.short_name, t.city, t.logo_url, t.club_id,
                   c.name AS club_name
            FROM teams t
            LEFT JOIN clubs c ON c.id = t.club_id`;
        const values = [];

        if (q && q !== 'undefined' && q !== 'null') {
            query += ' WHERE t.name ILIKE $1 OR t.city ILIKE $1';
            values.push(`%${q}%`);
        }
        query += ` ORDER BY t.name ASC LIMIT $${values.length + 1}`;

        const result = await pool.query(query, [...values, limit]);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

/**
 * Привязка существующей команды к клубу (teams.club_id).
 *
 * Действующие игроки команды автоматически попадают в общую базу клуба: команда
 * в клубе — значит её люди в клубе, иначе они видели бы клубные события, но не
 * могли на них отметиться. Ранее ушедших из клуба возвращаем, клубные роли им
 * при этом не восстанавливаем.
 */
export const attachTeamToClub = async (req, res) => {
    const client = await pool.connect();
    try {
        const { clubId } = req.params;
        const { teamId } = req.body;

        if (!teamId) {
            return res.status(400).json({ success: false, error: 'Не передана команда' });
        }

        const clubRes = await client.query('SELECT id FROM clubs WHERE id = $1', [clubId]);
        if (clubRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Клуб не найден' });
        }

        const teamRes = await client.query('SELECT id, club_id FROM teams WHERE id = $1', [teamId]);
        if (teamRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Команда не найдена' });
        }
        if (String(teamRes.rows[0].club_id) === String(clubId)) {
            return res.status(400).json({ success: false, error: 'Команда уже привязана к этому клубу' });
        }

        await client.query('BEGIN');

        await client.query('UPDATE teams SET club_id = $1, updated_at = NOW() WHERE id = $2', [clubId, teamId]);

        // Тех, кто уже активен в клубе, запрос не трогает и в счётчик не берёт
        const insertRes = await client.query(`
            INSERT INTO club_members (club_id, user_id, joined_at)
            SELECT $1, tm.user_id, CURRENT_DATE
            FROM team_members tm
            WHERE tm.team_id = $2 AND tm.left_at IS NULL
            ON CONFLICT (club_id, user_id)
            DO UPDATE SET left_at = NULL, joined_at = CURRENT_DATE
            WHERE club_members.left_at IS NOT NULL
            RETURNING id
        `, [clubId, teamId]);
        const addedMembers = insertRes.rowCount;

        await client.query('COMMIT');
        res.json({ success: true, addedMembers });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
    } finally { client.release(); }
};

/**
 * Отвязка команды от клуба. Команда остаётся в системе как самостоятельная,
 * её состав, ростер и заявки не затрагиваются — исчезает только зонтик клуба.
 *
 * Вместе с командой из базы клуба уходят её люди — кроме тех, кого держит в клубе
 * что-то ещё: активное членство в другой команде клуба, клубная роль или владение
 * клубом. Обычное исключение из клуба у нас каскадное (закрывает и команды клуба),
 * но здесь каскад применять нельзя: команда уже уходит целиком, и он вышиб бы
 * людей из их же состава. Поэтому закрываем только запись в club_members.
 */
export const detachTeamFromClub = async (req, res) => {
    const client = await pool.connect();
    try {
        const { clubId, teamId } = req.params;

        const teamRes = await client.query('SELECT id, club_id FROM teams WHERE id = $1', [teamId]);
        if (teamRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Команда не найдена' });
        }
        if (String(teamRes.rows[0].club_id) !== String(clubId)) {
            return res.status(400).json({ success: false, error: 'Эта команда не принадлежит выбранному клубу' });
        }

        await client.query('BEGIN');

        const removedRes = await client.query(`
            UPDATE club_members cm
            SET left_at = CURRENT_DATE
            WHERE cm.club_id = $1
              AND cm.left_at IS NULL
              AND cm.user_id IN (
                SELECT tm.user_id FROM team_members tm
                WHERE tm.team_id = $2 AND tm.left_at IS NULL
              )
              AND NOT EXISTS (
                SELECT 1 FROM club_roles cr
                WHERE cr.club_id = $1 AND cr.user_id = cm.user_id AND cr.left_at IS NULL
              )
              AND NOT EXISTS (
                SELECT 1 FROM clubs c WHERE c.id = $1 AND c.owner_id = cm.user_id
              )
              AND NOT EXISTS (
                SELECT 1 FROM team_members tm2
                JOIN teams t2 ON t2.id = tm2.team_id
                WHERE tm2.user_id = cm.user_id AND tm2.left_at IS NULL
                  AND t2.club_id = $1 AND t2.id <> $2
              )
            RETURNING cm.user_id
        `, [clubId, teamId]);

        await client.query('UPDATE teams SET club_id = NULL, updated_at = NOW() WHERE id = $1', [teamId]);

        await client.query('COMMIT');
        res.json({ success: true, removedMembers: removedRes.rowCount });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
    } finally { client.release(); }
};
