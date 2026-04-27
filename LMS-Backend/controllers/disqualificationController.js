import pool from '../config/db.js';

// Получение списка всех дисквалификаций для конкретного сезона
export const getSeasonDisqualifications = async (req, res) => {
    try {
        const { seasonId } = req.params;

        const result = await pool.query(`
            SELECT 
                d.id,
                d.tournament_roster_id,
                tr.player_id,
                d.reason,
                d.penalty_type,
                d.games_assigned,
                d.games_served,
                d.start_date,
                d.end_date,
                d.status,
                u.first_name,
                u.last_name,
                u.middle_name,
                u.avatar_url,
                (SELECT photo_url FROM team_members tm WHERE tm.user_id = u.id AND tm.team_id = tt.team_id AND tm.photo_url IS NOT NULL ORDER BY id DESC LIMIT 1) as member_photo,
                t.name as team_name,
                t.logo_url as team_logo,
                div.name as division_name
            FROM disqualifications d
            JOIN tournament_rosters tr ON d.tournament_roster_id = tr.id
            JOIN users u ON tr.player_id = u.id
            JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
            JOIN teams t ON tt.team_id = t.id
            JOIN divisions div ON tt.division_id = div.id
            WHERE div.season_id = $1
            ORDER BY d.created_at DESC
        `, [seasonId]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения списка штрафов:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
    }
};

// Создание нового штрафа/дисквалификации
export const createDisqualification = async (req, res) => {
    try {
        const { tournament_roster_id, reason, penalty_type, games_assigned, start_date, end_date } = req.body;

        if (!tournament_roster_id || !reason || !penalty_type || !start_date) {
            return res.status(400).json({ success: false, error: 'Не заполнены обязательные поля' });
        }

        const result = await pool.query(`
            INSERT INTO disqualifications 
                (tournament_roster_id, reason, penalty_type, games_assigned, start_date, end_date, status)
            VALUES 
                ($1, $2, $3, $4, $5, $6, 'active')
            RETURNING id
        `, [
            tournament_roster_id, 
            reason, 
            penalty_type, 
            games_assigned || null, 
            start_date, 
            end_date || null
        ]);

        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Ошибка создания штрафа:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения штрафа' });
    }
};

// Изменение статуса (отмена администратором или пометка как "отбыл")
export const updateDisqualificationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // Ожидаем 'completed' или 'cancelled'

        if (!['completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Неверный статус' });
        }

        await pool.query(`
            UPDATE disqualifications 
            SET status = $1, updated_at = NOW() 
            WHERE id = $2
        `, [status, id]);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления статуса штрафа:', err);
        res.status(500).json({ success: false, error: 'Ошибка обновления статуса' });
    }
};