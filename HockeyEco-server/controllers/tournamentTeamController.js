import pool from '../config/db.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';

export const getTournamentTeamRoster = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Получаем игроков ростера (с оптимизированным получением фото и дисквалификаций)
        const result = await pool.query(`
            SELECT
                tr.id as tournament_roster_id,
                tr.player_id,
                tr.application_status,
                tr.qualification_id,
                tr.insurance_url,
                tr.insurance_expires_at,
                tr.medical_url,
                tr.medical_expires_at,
                tr.consent_url,
                tr.consent_expires_at,
                tr.is_fee_paid,
                tr.jersey_number,
                tr.position,
                tr.is_captain,
                tr.is_assistant,
                tr.period_end,
                tr.updated_at,
                u.first_name,
                u.last_name,
                u.middle_name,
                u.avatar_url as user_avatar_url,
                tm_photo.photo_url as team_member_photo_url,
                lq.short_name as qualification_short_name,
                
                -- Оптимизированный сбор активных дисквалификаций
                COALESCE(dq.active_disqualifications, '[]'::json) as active_disqualifications

            FROM tournament_rosters tr
            JOIN users u ON tr.player_id = u.id
            JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
            LEFT JOIN league_qualifications lq ON tr.qualification_id = lq.id
            
            -- Оптимизация: берем последнее фото без сканирования всей таблицы на каждую строку
            LEFT JOIN LATERAL (
                SELECT photo_url 
                FROM team_members 
                WHERE user_id = u.id AND team_id = tt.team_id AND photo_url IS NOT NULL 
                ORDER BY id DESC LIMIT 1
            ) tm_photo ON true

            -- Оптимизация: собираем дисквалификации в один проход
            LEFT JOIN (
                SELECT 
                    tournament_roster_id, 
                    json_agg(
                        json_build_object(
                            'status', status,
                            'penalty_type', penalty_type,
                            'games_assigned', games_assigned,
                            'games_served', games_served,
                            'end_date', end_date,
                            'reason', reason
                        )
                    ) as active_disqualifications
                FROM disqualifications
                WHERE status = 'active'
                GROUP BY tournament_roster_id
            ) dq ON dq.tournament_roster_id = tr.id

            WHERE tr.tournament_team_id = $1
            ORDER BY u.last_name, u.first_name
        `, [id]);

        // 2. Получаем представителей (staff) команды из ТУРНИРНОЙ заявки (tournament_team_roles)
        const staffResult = await pool.query(`
            SELECT
                ttr.user_id as player_id,
                u.first_name,
                u.last_name,
                u.middle_name,
                u.phone,
                u.avatar_url as user_avatar_url,
                tm.photo_url as team_member_photo_url,
                string_agg(ttr.tournament_role, ', ') as roles
            FROM tournament_team_roles ttr
            JOIN users u ON ttr.user_id = u.id
            JOIN tournament_teams tt ON ttr.tournament_team_id = tt.id
            LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tt.team_id AND tm.left_at IS NULL
            WHERE ttr.tournament_team_id = $1 AND ttr.left_at IS NULL
            GROUP BY ttr.user_id, u.first_name, u.last_name, u.middle_name, u.phone, u.avatar_url, tm.photo_url
            ORDER BY u.last_name, u.first_name
        `, [id]);

        res.json({ success: true, data: result.rows, staff: staffResult.rows });
    } catch (err) {
        console.error('Ошибка получения ростера:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки состава' });
    }
};

export const updateTournamentTeamStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await pool.query(`UPDATE tournament_teams SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка смены статуса команды:', err);
        res.status(500).json({ success: false, error: 'Ошибка смены статуса команды' });
    }
};

export const updateTournamentTeamCustomData = async (req, res) => {
    try {
        const { id } = req.params;
        const { custom_description, custom_jersey_light_url, custom_jersey_dark_url, custom_team_photo_url } = req.body;
        
        let updates = [];
        let values = [];
        let counter = 1;

        if (custom_description !== undefined) {
            updates.push(`custom_description = $${counter++}`);
            values.push(custom_description);
        }
        if (custom_jersey_light_url !== undefined) {
            updates.push(`custom_jersey_light_url = $${counter++}`);
            values.push(custom_jersey_light_url);
        }
        if (custom_jersey_dark_url !== undefined) {
            updates.push(`custom_jersey_dark_url = $${counter++}`);
            values.push(custom_jersey_dark_url);
        }
        if (custom_team_photo_url !== undefined) {
            updates.push(`custom_team_photo_url = $${counter++}`);
            values.push(custom_team_photo_url);
        }

        if (updates.length > 0) {
            values.push(id);
            await pool.query(`UPDATE tournament_teams SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${counter}`, values);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления данных турнирной команды:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения данных' });
    }
};

export const uploadTournamentTeamFile = async (req, res) => {
    try {
        const { id, type } = req.params;
        if (!req.file) return res.status(400).json({ success: false, error: 'Файл не найден' });
        
        const ext = req.file.originalname.split('.').pop();
        let fileName = `uploads/tournament_teams_${id}_custom_${type}_url.${ext}`;
        let dbColumn = `custom_${type}_url`;

        if (type === 'paper_league') {
            fileName = `uploads/paper_application_tournament_teams_${id}_league.${ext}`;
            dbColumn = 'paper_roster_league_url';
        } else if (type === 'paper_team') {
            fileName = `uploads/paper_application_tournament_teams_${id}.${ext}`;
            dbColumn = 'paper_roster_team_url';
        }

        await s3.send(new PutObjectCommand({
            Bucket: 'hockeyeco-uploads',
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }));

        const url = `/${fileName}`;
        await pool.query(`UPDATE tournament_teams SET ${dbColumn} = $1 WHERE id = $2`, [url, id]);

        res.json({ success: true, url: url });
    } catch (err) {
        console.error('Ошибка загрузки файла команды турнира:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteTournamentTeamLeaguePaper = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE tournament_teams SET paper_roster_league_url = NULL WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления файла лиги:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления файла' });
    }
};