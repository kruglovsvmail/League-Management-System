import pool from '../config/db.js';
import s3 from '../config/s3.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export const searchTeams = async (req, res) => {
    try {
        const { q } = req.query;
        
        console.log('\n--- 🔍 ЗАПРОС СПИСКА КОМАНД ---');
        console.log('Параметр поиска (q):', q === '' ? '[Пустая строка]' : q);
        
        let query = 'SELECT id, name, short_name, city, logo_url FROM teams';
        let values = [];
        
        // Защита от поиска текста "undefined" или "null", если с фронта прилетел кривой параметр
        if (q && q !== 'undefined' && q !== 'null') {
            query += ' WHERE name ILIKE $1 OR city ILIKE $1';
            values.push(`%${q}%`);
        }
        query += ' ORDER BY name ASC LIMIT 20';
        
        console.log('SQL запрос:', query);
        console.log('Значения:', values);
        
        const result = await pool.query(query, values);
        
        console.log(`✅ Найдено команд в БД: ${result.rows.length}`);
        console.log('-------------------------------\n');
        
        res.json({ success: true, data: result.rows });
    } catch (err) { 
        console.error('🔥 Ошибка в searchTeams:', err);
        res.status(500).json({ success: false, error: err.message }); 
    }
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

        // База команды (все активные team_members)
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
                   tm.photo_url, tr.jersey_number, tr.position, tr.is_captain, tr.is_assistant, tr.joined_at
            FROM team_rosters tr
            JOIN team_members tm ON tr.member_id = tm.id
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = $1 AND tr.left_at IS NULL AND tm.left_at IS NULL
        `, [teamId]);

        const staffRes = await pool.query(`
            SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone,
                   tm.photo_url, MIN(tr.joined_at) as joined_at,
                   STRING_AGG(tr.role, ', ' ORDER BY tr.role) as roles
            FROM team_roles tr
            JOIN team_members tm ON tr.member_id = tm.id
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = $1 AND tr.left_at IS NULL AND tm.left_at IS NULL
            GROUP BY u.id, tm.photo_url, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone
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
                await client.query(`
                    UPDATE team_rosters 
                    SET left_at = NOW(), position = NULL, jersey_number = NULL, is_captain = false, is_assistant = false
                    WHERE team_id = $1 AND member_id = $2
                `, [teamId, memberId]);
            }
        } 
        else {
            if (type === 'base') {
                // Активация прошла выше
            }
            else if (type === 'player') {
                const checkNum = await client.query(`
                    SELECT id FROM team_rosters 
                    WHERE team_id = $1 AND jersey_number = $2 AND left_at IS NULL AND member_id != $3
                `, [teamId, jerseyNumber, memberId]);
                
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
                for (const role of roles) {
                    await client.query(`
                        INSERT INTO team_roles (member_id, role) VALUES ($1, $2)
                        ON CONFLICT (member_id, role) DO UPDATE SET left_at = NULL
                    `, [memberId, role]);
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

export const uploadMemberPhoto = async (req, res) => {
    try {
        const { teamId, userId } = req.params;
        if (!req.file) return res.status(400).json({ success: false, error: 'Файл не найден' });

        const ext = req.file.originalname.split('.').pop();
        const fileName = `uploads/teams_${teamId}_users_${userId}_photo.${ext}`;
        
        await s3.send(new PutObjectCommand({
            Bucket: 'hockeyeco-uploads',
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
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