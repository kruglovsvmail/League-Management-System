import pool from '../config/db.js';

// 1. Получение списка всех трансферов
export const getTransfers = async (req, res) => {
    try {
        const { seasonId } = req.params;
        
        const result = await pool.query(`
            SELECT 
                rr.id, rr.division_id, rr.team_id, rr.player_id, 
                rr.request_type, rr.status, rr.created_at, rr.resolved_at, 
                
                CASE WHEN rr.request_type = 'add' THEN rr.jersey_number 
                ELSE (
                    SELECT tr.jersey_number FROM tournament_rosters tr 
                    JOIN tournament_teams tt ON tr.tournament_team_id = tt.id 
                    WHERE tt.division_id = rr.division_id AND tt.team_id = rr.team_id 
                      AND tr.player_id = rr.player_id AND tr.application_status = 'approved' 
                    ORDER BY tr.id DESC LIMIT 1
                ) END as jersey_number,
                
                CASE WHEN rr.request_type = 'add' THEN rr.position 
                ELSE (
                    SELECT tr.position FROM tournament_rosters tr 
                    JOIN tournament_teams tt ON tr.tournament_team_id = tt.id 
                    WHERE tt.division_id = rr.division_id AND tt.team_id = rr.team_id 
                      AND tr.player_id = rr.player_id AND tr.application_status = 'approved' 
                    ORDER BY tr.id DESC LIMIT 1
                ) END as position,

                u.first_name, u.last_name, u.middle_name, u.birth_date, u.avatar_url,
                t.name AS team_name, t.city AS team_city, t.logo_url AS team_logo,
                d.name AS division_name, d.application_start, d.application_end, d.transfer_start, d.transfer_end,
                tm.photo_url AS member_photo,
                
                COALESCE((
                    SELECT COUNT(*) FROM game_rosters gr 
                    JOIN games g ON gr.game_id = g.id 
                    WHERE gr.player_id = rr.player_id AND gr.team_id = rr.team_id AND g.division_id = rr.division_id
                ), 0) as games_played

            FROM roster_requests rr
            JOIN users u ON rr.player_id = u.id
            JOIN teams t ON rr.team_id = t.id
            JOIN divisions d ON rr.division_id = d.id
            LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = t.id
            WHERE d.season_id = $1
            ORDER BY rr.created_at DESC
        `, [seasonId]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения трансферов:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки трансферов' });
    }
};

// 2. Функция обработки действий по трансферу
export const handleTransferAction = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); 
        const { id } = req.params;
        const { action } = req.body;
        const userId = req.user.id;

        const transferRes = await client.query(`
            SELECT rr.*, d.application_start, d.application_end, d.transfer_start, d.transfer_end,
                   (SELECT global_role FROM users WHERE id = $1) as user_role,
                   (SELECT id FROM tournament_teams WHERE division_id = rr.division_id AND team_id = rr.team_id LIMIT 1) as tournament_team_id,
                   (SELECT COUNT(*) FROM game_rosters gr JOIN games g ON gr.game_id = g.id WHERE gr.player_id = rr.player_id AND gr.team_id = rr.team_id AND g.division_id = rr.division_id) as games_played
            FROM roster_requests rr
            JOIN divisions d ON rr.division_id = d.id
            WHERE rr.id = $2
        `, [userId, id]);

        if (transferRes.rows.length === 0) throw new Error('Заявка не найдена');
        const tr = transferRes.rows[0];

        const now = new Date();
        const appStart = tr.application_start ? new Date(tr.application_start) : null;
        const appEnd = tr.application_end ? new Date(tr.application_end) : null;
        const trStart = tr.transfer_start ? new Date(tr.transfer_start) : null;
        const trEnd = tr.transfer_end ? new Date(tr.transfer_end) : null;

        const isAppWindow = appStart && appEnd && now >= appStart && now <= appEnd;
        const isTrWindow = trStart && trEnd && now >= trStart && now <= trEnd;
        const isWindowOpen = isAppWindow || isTrWindow;
        const isAdmin = tr.user_role === 'admin';

        let targetDate = new Date();
        if (!isWindowOpen) {
            let maxDate = 0;
            if (appEnd) maxDate = Math.max(maxDate, appEnd.getTime());
            if (trEnd) maxDate = Math.max(maxDate, trEnd.getTime());
            if (maxDate > 0) targetDate = new Date(maxDate);
        }

        if (action === 'accept') {
            if (!isWindowOpen && !isAdmin) throw new Error('Нет прав: окно заявок закрыто');
            
            if (tr.request_type === 'add') {
                if (!tr.tournament_team_id) throw new Error('Команда не заявлена в турнир');
                await client.query(`
                    INSERT INTO tournament_rosters (tournament_team_id, player_id, application_status, period_start, position, jersey_number)
                    VALUES ($1, $2, 'declined', $3, $4, $5)
                `, [tr.tournament_team_id, tr.player_id, targetDate, tr.position, tr.jersey_number]);
            } else if (tr.request_type === 'remove') {
                await client.query(`
                    UPDATE tournament_rosters SET period_end = $1 
                    WHERE tournament_team_id = $2 AND player_id = $3 AND period_end IS NULL
                `, [targetDate, tr.tournament_team_id, tr.player_id]);
            }
            await client.query(`UPDATE roster_requests SET status = 'approved', resolved_at = NOW() WHERE id = $1`, [id]);
        } 
        else if (action === 'reject') {
            if (!isWindowOpen && !isAdmin) throw new Error('Нет прав: окно заявок закрыто');
            await client.query(`UPDATE roster_requests SET status = 'rejected', resolved_at = NOW() WHERE id = $1`, [id]);
        }
        else if (action === 'revert') {
            if (tr.request_type === 'add') {
                if (Number(tr.games_played) > 0) throw new Error('Игрок уже сыграл матчи. Возврат невозможен.');
                if (!isWindowOpen && !isAdmin) throw new Error('Нет прав: окно заявок закрыто');
                
                await client.query(`
                    DELETE FROM tournament_rosters 
                    WHERE id = (
                        SELECT id FROM tournament_rosters 
                        WHERE tournament_team_id = $1 AND player_id = $2 
                        ORDER BY id DESC LIMIT 1
                    )
                `, [tr.tournament_team_id, tr.player_id]);
            } else if (tr.request_type === 'remove') {
                await client.query(`
                    UPDATE tournament_rosters SET period_end = NULL 
                    WHERE tournament_team_id = $1 AND player_id = $2
                `, [tr.tournament_team_id, tr.player_id]);
            }
            await client.query(`UPDATE roster_requests SET status = 'pending', resolved_at = NULL WHERE id = $1`, [id]);
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка обработки заявки:', err);
        res.status(400).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

// 3. Получение доступных игроков для модалки создания заявки
export const getAvailablePlayers = async (req, res) => {
    try {
        const { divisionId, teamId, type } = req.query;
        let players = [];
        let takenNumbers = [];

        if (type === 'add') {
            const pRes = await pool.query(`
                SELECT u.id, u.first_name, u.last_name, u.middle_name, u.birth_date, u.avatar_url,
                       tr_base.position, tm.photo_url
                FROM team_members tm
                JOIN users u ON tm.user_id = u.id
                LEFT JOIN team_rosters tr_base ON tr_base.member_id = tm.id
                WHERE tm.team_id = $1 AND tm.left_at IS NULL
                  AND u.id NOT IN (
                      SELECT player_id FROM tournament_rosters tr
                      JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
                      WHERE tt.division_id = $2 AND tt.team_id = $1 AND tr.period_end IS NULL
                  )
            `, [teamId, divisionId]);
            players = pRes.rows;

            // ИЗМЕНЕНИЕ: Собираем занятые номера ИЗ СОСТАВА + ИЗ ЗАЯВОК НА РАССМОТРЕНИИ
            const numRes = await pool.query(`
                SELECT tr.jersey_number FROM tournament_rosters tr
                JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
                WHERE tt.division_id = $1 AND tt.team_id = $2 AND tr.period_end IS NULL AND tr.jersey_number IS NOT NULL
                
                UNION
                
                SELECT rr.jersey_number FROM roster_requests rr
                WHERE rr.division_id = $1 AND rr.team_id = $2 AND rr.request_type = 'add' AND rr.status = 'pending' AND rr.jersey_number IS NOT NULL
            `, [divisionId, teamId]);
            takenNumbers = numRes.rows.map(r => r.jersey_number);
            
        } else {
            const pRes = await pool.query(`
                SELECT u.id, u.first_name, u.last_name, u.middle_name, u.birth_date, u.avatar_url,
                       tr.position, tm.photo_url
                FROM tournament_rosters tr
                JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
                JOIN users u ON tr.player_id = u.id
                LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tt.team_id
                WHERE tt.division_id = $2 AND tt.team_id = $1 AND tr.period_end IS NULL
            `, [teamId, divisionId]);
            players = pRes.rows;
        }

        res.json({ success: true, players, takenNumbers });
    } catch (err) {
        console.error('Ошибка загрузки игроков:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// 4. Создание заявки
export const createTransferRequest = async (req, res) => {
    try {
        const { divisionId, teamId, playerId, requestType, jerseyNumber, position } = req.body;
        
        const check = await pool.query(`
            SELECT id FROM roster_requests 
            WHERE division_id = $1 AND team_id = $2 AND player_id = $3 AND status = 'pending'
        `, [divisionId, teamId, playerId]);
        
        if (check.rows.length > 0) return res.status(400).json({ success: false, error: 'Заявка уже на рассмотрении' });

        await pool.query(`
            INSERT INTO roster_requests (division_id, team_id, player_id, request_type, jersey_number, position)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [divisionId, teamId, playerId, requestType, jerseyNumber || null, position || null]);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка создания заявки:', err);
        res.status(500).json({ success: false, error: 'Ошибка создания заявки' });
    }
};