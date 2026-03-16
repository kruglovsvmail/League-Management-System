import pool from '../config/db.js';

// --- ПОЛУЧЕНИЕ ХОДА МАТЧА (СОБЫТИЯ) ---
export const getGameEvents = async (req, res) => {
    try {
        const { gameId } = req.params;
        const query = `
            SELECT 
                ge.id, ge.period, ge.time_seconds, ge.event_type, ge.goal_strength, 
                ge.penalty_violation, ge.penalty_minutes, ge.penalty_class,
                t.id as team_id, t.name as team_name, t.logo_url as team_logo,
                su.id as primary_player_id, su.last_name as primary_last_name, su.first_name as primary_first_name,
                a1.id as assist1_id, a1.last_name as assist1_last_name, a1.first_name as assist1_first_name,
                a2.id as assist2_id, a2.last_name as assist2_last_name, a2.first_name as assist2_first_name
            FROM game_events ge
            JOIN teams t ON ge.team_id = t.id
            LEFT JOIN users su ON COALESCE(ge.scorer_id, ge.penalty_player_id) = su.id
            LEFT JOIN users a1 ON ge.assist1_id = a1.id
            LEFT JOIN users a2 ON ge.assist2_id = a2.id
            WHERE ge.game_id = $1
            ORDER BY 
                CASE WHEN ge.period = '1' THEN 1 
                     WHEN ge.period = '2' THEN 2 
                     WHEN ge.period = '3' THEN 3 
                     WHEN ge.period = 'OT' THEN 4 
                     WHEN ge.period = 'SO' THEN 5 ELSE 6 END DESC,
                ge.time_seconds DESC
        `;
        const result = await pool.query(query, [gameId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка загрузки событий матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// --- ДОБАВЛЕНИЕ СОБЫТИЯ (ГОЛ / ШТРАФ) И ПЛЮС/МИНУС ---
export const createGameEvent = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        const {
            period, time_seconds, event_type, team_id,
            player_id, assist1_id, assist2_id, goal_strength,
            penalty_violation, penalty_minutes, penalty_class,
            plus_players, minus_players, opponent_id
        } = req.body;

        await client.query('BEGIN');

        // 1. Записываем событие в таблицу game_events
        const eventRes = await client.query(`
            INSERT INTO game_events (
                game_id, period, time_seconds, event_type, team_id,
                scorer_id, assist1_id, assist2_id, goal_strength,
                penalty_player_id, penalty_violation, penalty_minutes, penalty_class
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id
        `, [
            gameId, period, time_seconds, event_type, team_id,
            event_type === 'goal' ? player_id : null, 
            assist1_id || null, assist2_id || null, goal_strength || null,
            event_type === 'penalty' ? player_id : null,
            penalty_violation || null, penalty_minutes || null, penalty_class || null
        ]);

        const eventId = eventRes.rows[0].id;

        // 2. Если это ГОЛ — обновляем счет матча и пишем статистику полезности (+/-)
        if (event_type === 'goal') {
            
            const gameRes = await client.query('SELECT home_team_id FROM games WHERE id = $1', [gameId]);
            if (gameRes.rows.length > 0) {
                const isHome = gameRes.rows[0].home_team_id === parseInt(team_id);
                if (isHome) {
                    await client.query('UPDATE games SET home_score = home_score + 1 WHERE id = $1', [gameId]);
                } else {
                    await client.query('UPDATE games SET away_score = away_score + 1 WHERE id = $1', [gameId]);
                }
            }

            // Массовая запись "Плюсов"
            if (plus_players && plus_players.length > 0) {
                const plusValues = [];
                const plusParams = [];
                let pIdx = 1;
                plus_players.forEach(p_id => {
                    plusValues.push(`($${pIdx++}, $${pIdx++}, $${pIdx++})`);
                    plusParams.push(eventId, team_id, p_id);
                });
                await client.query(`INSERT INTO game_plus_minus (event_id, team_id, player_id) VALUES ${plusValues.join(', ')}`, plusParams);
            }

            // Массовая запись "Минусов"
            if (minus_players && minus_players.length > 0 && opponent_id) {
                const minusValues = [];
                const minusParams = [];
                let mIdx = 1;
                minus_players.forEach(p_id => {
                    minusValues.push(`($${mIdx++}, $${mIdx++}, $${mIdx++})`);
                    minusParams.push(eventId, opponent_id, p_id);
                });
                await client.query(`INSERT INTO game_plus_minus (event_id, team_id, player_id) VALUES ${minusValues.join(', ')}`, minusParams);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, eventId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка сохранения события матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения события' });
    } finally {
        client.release();
    }
};

// --- УДАЛЕНИЕ СОБЫТИЯ (С ОТКАТОМ СЧЕТА) ---
export const deleteGameEvent = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId, eventId } = req.params;

        await client.query('BEGIN');

        // 1. Узнаем тип события и команду, чтобы понять, надо ли откатывать счет
        const evRes = await client.query('SELECT event_type, team_id FROM game_events WHERE id = $1', [eventId]);
        
        if (evRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Событие не найдено' });
        }

        const { event_type, team_id } = evRes.rows[0];

        // 2. Если это гол — откатываем счет в таблице games
        if (event_type === 'goal') {
            const gameRes = await client.query('SELECT home_team_id FROM games WHERE id = $1', [gameId]);
            if (gameRes.rows.length > 0) {
                const isHome = gameRes.rows[0].home_team_id === team_id;
                if (isHome) {
                    await client.query('UPDATE games SET home_score = GREATEST(home_score - 1, 0) WHERE id = $1', [gameId]);
                } else {
                    await client.query('UPDATE games SET away_score = GREATEST(away_score - 1, 0) WHERE id = $1', [gameId]);
                }
            }
        }

        // 3. Удаляем само событие (game_plus_minus удалятся каскадно)
        await client.query('DELETE FROM game_events WHERE id = $1', [eventId]);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка удаления события матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления события' });
    } finally {
        client.release();
    }
};