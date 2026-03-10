import pool from '../config/db.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';

export const getSeasons = async (req, res) => {
    try {
        const { leagueId } = req.params;
        const result = await pool.query(
            `SELECT id, name, is_active FROM seasons WHERE league_id = $1 ORDER BY start_date DESC`, 
            [leagueId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения сезонов:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки сезонов' });
    }
};

export const getDivisions = async (req, res) => {
    try {
        const { seasonId } = req.params;
        const result = await pool.query(`
            SELECT 
                d.*,
                (SELECT COUNT(*) FROM tournament_teams tt WHERE tt.division_id = d.id AND tt.status = 'approved') as approved_teams_count,
                (SELECT COUNT(*) FROM tournament_rosters tr 
                 JOIN tournament_teams tt ON tr.tournament_team_id = tt.id 
                 WHERE tt.division_id = d.id 
                   AND tt.status = 'approved' 
                   AND tr.application_status = 'approved' 
                   AND tr.period_end IS NULL) as approved_players_count,
                (SELECT COUNT(*) FROM games g WHERE g.division_id = d.id AND g.status = 'finished') as finished_games_count,
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'id', tt.id,
                        'team_id', t.id,
                        'status', tt.status,
                        'name', t.name,
                        'short_name', t.short_name,
                        'city', t.city,
                        'logo_url', t.logo_url,
                        'custom_jersey_light_url', tt.custom_jersey_light_url,
                        'custom_jersey_dark_url', tt.custom_jersey_dark_url,
                        'jersey_light_url', t.jersey_light_url,
                        'jersey_dark_url', t.jersey_dark_url,
                        'custom_description', tt.custom_description,
                        'description', t.description,
                        'custom_team_photo_url', tt.custom_team_photo_url,
                        'team_photo_url', t.team_photo_url,
                        'players_count', (
                            SELECT COUNT(*) FROM tournament_rosters tr2 
                            WHERE tr2.tournament_team_id = tt.id AND tr2.application_status = 'approved' AND tr2.period_end IS NULL
                        ),
                        'avg_age', (
                            SELECT ROUND(AVG(EXTRACT(YEAR FROM age(CURRENT_DATE, u.birth_date))))
                            FROM tournament_rosters tr3 
                            JOIN users u ON tr3.player_id = u.id 
                            WHERE tr3.tournament_team_id = tt.id AND tr3.application_status = 'approved' AND tr3.period_end IS NULL
                        )
                    ) ORDER BY t.name)
                    FROM tournament_teams tt
                    JOIN teams t ON tt.team_id = t.id
                    WHERE tt.division_id = d.id
                ), '[]'::json) as teams
            FROM divisions d
            WHERE d.season_id = $1
            ORDER BY d.id
        `, [seasonId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения дивизионов:', err);
        res.status(500).json({ success: false, error: 'Ошибка получения дивизионов' });
    }
};

export const createDivision = async (req, res) => {
    try {
        const { seasonId } = req.params;
        const {
            name, short_name, tournament_type, start_date, end_date,
            application_start, application_end, transfer_start, transfer_end,
            description, points_win_reg, points_win_ot, points_draw,
            points_loss_ot, points_loss_reg, ranking_criteria,
            playoff_start_round, has_third_place,
            wins_needed_1_8, wins_needed_1_4, wins_needed_1_2,
            wins_needed_final, wins_needed_3rd
        } = req.body;

        const result = await pool.query(`
            INSERT INTO divisions (
                season_id, name, short_name, tournament_type,
                start_date, end_date, application_start, application_end,
                transfer_start, transfer_end, description,
                points_win_reg, points_win_ot, points_draw,
                points_loss_ot, points_loss_reg, ranking_criteria,
                playoff_start_round, has_third_place,
                wins_needed_1_8, wins_needed_1_4, wins_needed_1_2,
                wins_needed_final, wins_needed_3rd,
                is_published
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, false)
            RETURNING id
        `, [
            seasonId, name, short_name, tournament_type,
            start_date || null, end_date || null,
            application_start || null, application_end || null,
            transfer_start || null, transfer_end || null,
            description,
            points_win_reg, points_win_ot, points_draw,
            points_loss_ot, points_loss_reg,
            ranking_criteria ? JSON.stringify(ranking_criteria) : null,
            playoff_start_round, has_third_place,
            wins_needed_1_8, wins_needed_1_4, wins_needed_1_2,
            wins_needed_final, wins_needed_3rd
        ]);

        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Ошибка создания дивизиона:', err);
        res.status(500).json({ success: false, error: 'Ошибка создания дивизиона' });
    }
};

export const updateDivision = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, short_name, tournament_type, start_date, end_date, application_start, application_end,
            transfer_start, transfer_end, description, points_win_reg, points_win_ot, points_draw, points_loss_ot,
            points_loss_reg, ranking_criteria, playoff_start_round, has_third_place, wins_needed_1_8, wins_needed_1_4,
            wins_needed_1_2, wins_needed_final, wins_needed_3rd
        } = req.body;
        await pool.query(`
            UPDATE divisions SET 
                name = $1, short_name = $2, tournament_type = $3, start_date = $4, end_date = $5,
                application_start = $6, application_end = $7, transfer_start = $8, transfer_end = $9,
                description = $10, points_win_reg = $11, points_win_ot = $12, points_draw = $13,
                points_loss_ot = $14, points_loss_reg = $15, ranking_criteria = $16, playoff_start_round = $17,
                has_third_place = $18, wins_needed_1_8 = $19, wins_needed_1_4 = $20, wins_needed_1_2 = $21,
                wins_needed_final = $22, wins_needed_3rd = $23
            WHERE id = $24
        `, [
            name, short_name, tournament_type, start_date || null, end_date || null, application_start || null, application_end || null,
            transfer_start || null, transfer_end || null, description, points_win_reg, points_win_ot, points_draw,
            points_loss_ot, points_loss_reg, ranking_criteria ? JSON.stringify(ranking_criteria) : null, playoff_start_round, has_third_place,
            wins_needed_1_8, wins_needed_1_4, wins_needed_1_2, wins_needed_final, wins_needed_3rd, id
        ]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления дивизиона:', err);
        res.status(500).json({ success: false, error: 'Ошибка обновления дивизиона' });
    }
};

export const updateDivisionPublish = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_published } = req.body;
        await pool.query(`UPDATE divisions SET is_published = $1 WHERE id = $2`, [is_published, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка публикации:', err);
        res.status(500).json({ success: false, error: 'Ошибка смены статуса публикации' });
    }
};

export const deleteDivision = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`DELETE FROM divisions WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления дивизиона' });
    }
};

export const uploadDivisionFile = async (req, res) => {
    try {
        const { id, type } = req.params;
        if (!req.file) return res.status(400).json({ success: false, error: 'Файл не найден' });
        const ext = req.file.originalname.split('.').pop();
        const prefix = type === 'logo' ? 'logo' : 'regulations';
        const fileName = `uploads/${prefix}_divisions_${id}.${ext}`;
        await s3.send(new PutObjectCommand({
            Bucket: 'hockeyeco-uploads',
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }));
        const url = `https://s3.twcstorage.ru/hockeyeco-uploads/${fileName}`;
        const column = type === 'logo' ? 'logo_url' : 'regulations_url';
        await pool.query(`UPDATE divisions SET ${column} = $1 WHERE id = $2`, [url, id]);

        res.json({ success: true, url });
    } catch (err) {
        console.error('Ошибка загрузки файла дивизиона в S3:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getDivisionTeams = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT tt.id, tt.team_id, t.name 
            FROM tournament_teams tt
            JOIN teams t ON tt.team_id = t.id
            WHERE tt.division_id = $1 AND tt.status = 'approved'
            ORDER BY t.name
        `, [id]);
        res.json({ success: true, teams: result.rows });
    } catch (err) {
        console.error('Ошибка загрузки команд:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки команд' });
    }
};