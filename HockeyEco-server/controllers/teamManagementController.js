import pool from '../config/db.js';
import s3 from '../config/s3.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export const searchTeams = async (req, res) => {
    try {
        const { q } = req.query;
        let query = 'SELECT id, name, short_name, city, logo_url FROM teams';
        let values = [];
        
        if (q && q !== 'undefined' && q !== 'null') {
            query += ' WHERE name ILIKE $1 OR city ILIKE $1';
            values.push(`%${q}%`);
        }
        query += ' ORDER BY name ASC LIMIT 20';
        
        const result = await pool.query(query, values);
        res.json({ success: true, data: result.rows });
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

        const baseRes = await pool.query(`
            SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone, u.birth_date, u.virtual_code,
                   tm.photo_url, tm.joined_at, tm.id as member_id
            FROM team_members tm
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL
            ORDER BY u.last_name ASC
        `, [teamId]);

        const rosterRes = await pool.query(`
            SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url,
                   tm.photo_url, tr.id as roster_id, tr.jersey_number, tr.position, tr.is_captain, tr.is_assistant, tr.joined_at
            FROM team_rosters tr
            JOIN team_members tm ON tr.member_id = tm.id
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = $1 AND tr.left_at IS NULL AND tm.left_at IS NULL
        `, [teamId]);

        const staffRes = await pool.query(`
            SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone,
                   tm.photo_url, tm.id as member_id, MIN(tr.joined_at) as joined_at,
                   STRING_AGG(tr.role, ', ' ORDER BY tr.role) as roles
            FROM team_roles tr
            JOIN team_members tm ON tr.member_id = tm.id
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = $1 AND tr.left_at IS NULL AND tm.left_at IS NULL
            GROUP BY u.id, tm.id, tm.photo_url, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone
        `, [teamId]);

        res.json({ success: true, base: baseRes.rows, roster: rosterRes.rows, staff: staffRes.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const addTeamMember = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { teamId } = req.params;
        const { userId, type, position, jerseyNumber, roles, action, isCaptain, isAssistant } = req.body; 

        let memberId;
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

        if (action === 'remove_club') {
            await client.query(`UPDATE team_members SET left_at = NOW() WHERE id = $1`, [memberId]);
            await client.query(`UPDATE team_rosters SET left_at = NOW(), position = NULL, jersey_number = NULL, is_captain = false, is_assistant = false WHERE member_id = $1`, [memberId]);
            await client.query(`UPDATE team_roles SET left_at = NOW() WHERE member_id = $1`, [memberId]);
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
                
                // Оптимизация Bulk Insert для ролей
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
        res.json({ success: true });
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
        const fileName = `uploads/teams_${teamId}_users_${userId}_photo.${ext}`;
        
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
                       'app_start', d.application_start, 'app_end', d.application_end
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

export const getTeamApplications = async (req, res) => {
    try {
        const { teamId } = req.params;
        const result = await pool.query(`
            SELECT tt.id, tt.status, tt.created_at, 
                   d.name as division_name, d.end_date as division_end_date,
                   s.name as season_name, 
                   l.name as league_name, l.logo_url as league_logo,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', tr.id, 'player_id', tr.player_id, 'jersey_number', tr.jersey_number,
                           'position', tr.position, 'is_captain', tr.is_captain, 'is_assistant', tr.is_assistant,
                           'application_status', tr.application_status,
                           'medical_url', tr.medical_url, 'insurance_url', tr.insurance_url,
                           'medical_expires_at', tr.medical_expires_at, 'insurance_expires_at', tr.insurance_expires_at,
                           'first_name', u.first_name, 'last_name', u.last_name, 'middle_name', u.middle_name,
                           'user_avatar_url', u.avatar_url,
                           'team_member_photo_url', tm.photo_url
                       ) ORDER BY u.last_name ASC)
                       FROM tournament_rosters tr
                       JOIN users u ON tr.player_id = u.id
                       LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tt.team_id
                       WHERE tr.tournament_team_id = tt.id AND tr.period_end IS NULL), 
                   '[]'::json) as roster
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
        const { divisionId, playerIds } = req.body;

        const checkApp = await client.query(`SELECT id FROM tournament_teams WHERE team_id = $1 AND division_id = $2`, [teamId, divisionId]);
        if (checkApp.rows.length > 0) throw new Error('Заявка в этот дивизион уже существует');

        const appRes = await client.query(
            `INSERT INTO tournament_teams (division_id, team_id, status) VALUES ($1, $2, 'draft') RETURNING id`,
            [divisionId, teamId]
        );
        const appId = appRes.rows[0].id;

        // ОПТИМИЗАЦИЯ N+1: Вставляем всех игроков одним SQL-запросом (INSERT INTO ... SELECT)
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
        await pool.query(`UPDATE tournament_teams SET status = 'pending' WHERE id = $1`, [appId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const addPlayerToApplication = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { teamId, appId } = req.params;
        const { playerIds } = req.body;
        
        if (playerIds && playerIds.length > 0) {
            // ОПТИМИЗАЦИЯ N+1: Решаем задачу через Bulk Updates & Inserts
            
            // 1. Получаем данные обо всех запрашиваемых игроках одним запросом
            const pRes = await client.query(`
                SELECT tm.user_id as pid, tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant 
                FROM team_rosters tr 
                JOIN team_members tm ON tr.member_id = tm.id
                WHERE tm.team_id = $1 AND tm.user_id = ANY($2::int[])
            `, [teamId, playerIds]);
            
            // 2. Проверяем, кто уже есть в заявке (чтобы воскресить)
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

            // Распределяем игроков: кого обновить, а кого вставить
            for (const row of pRes.rows) {
                if (existingPids.has(row.pid)) {
                    updateValues.push(`($${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++})`);
                    updateParams.push(appId, row.pid, row.position, row.jersey_number, row.is_captain || false, row.is_assistant || false);
                } else {
                    insertValues.push(`($${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++})`);
                    insertParams.push(appId, row.pid, row.position, row.jersey_number, row.is_captain || false, row.is_assistant || false);
                }
            }

            // Выполняем массовое обновление одним запросом (UPSERT/VALUES паттерн)
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

            // Выполняем массовую вставку одним запросом
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
        res.status(500).json({ success: false, error: err.message }); 
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