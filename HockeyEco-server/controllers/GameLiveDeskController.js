import pool from '../config/db.js';

// --- ПОЛУЧЕНИЕ ХОДА МАТЧА (СОБЫТИЯ) ---
export const getGameEvents = async (req, res) => {
    try {
        const { gameId } = req.params;
        const query = `
            SELECT 
                ge.id, ge.period, ge.time_seconds, ge.event_type, ge.goal_strength, 
                ge.penalty_violation, ge.penalty_minutes, ge.penalty_class, ge.penalty_end_time,
                t.id as team_id, t.name as team_name, t.logo_url as team_logo,
                
                -- Главное действующее лицо
                su.id as primary_player_id, su.last_name as primary_last_name, 
                su.first_name as primary_first_name, su.avatar_url as primary_avatar_url,
                tm_su.photo_url as primary_photo_url,
                
                -- Первый ассистент
                a1.id as assist1_id, a1.last_name as assist1_last_name, 
                a1.first_name as assist1_first_name, a1.avatar_url as assist1_avatar_url,
                tm_a1.photo_url as assist1_photo_url,
                
                -- Второй ассистент
                a2.id as assist2_id, a2.last_name as assist2_last_name, 
                a2.first_name as assist2_first_name, a2.avatar_url as assist2_avatar_url,
                tm_a2.photo_url as assist2_photo_url,
                
                -- Есть ли заполненный показатель полезности
                EXISTS (SELECT 1 FROM game_plus_minus gpm WHERE gpm.event_id = ge.id) as has_plus_minus
                
            FROM game_events ge
            LEFT JOIN teams t ON ge.team_id = t.id
            
            LEFT JOIN users su ON COALESCE(ge.scorer_id, ge.penalty_player_id) = su.id
            LEFT JOIN team_members tm_su ON tm_su.user_id = su.id AND tm_su.team_id = ge.team_id
            
            LEFT JOIN users a1 ON ge.assist1_id = a1.id
            LEFT JOIN team_members tm_a1 ON tm_a1.user_id = a1.id AND tm_a1.team_id = ge.team_id
            
            LEFT JOIN users a2 ON ge.assist2_id = a2.id
            LEFT JOIN team_members tm_a2 ON tm_a2.user_id = a2.id AND tm_a2.team_id = ge.team_id
            
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

// --- ДОБАВЛЕНИЕ СОБЫТИЯ И ОБНОВЛЕНИЕ СЧЕТА ---
export const createGameEvent = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        const {
            period, time_seconds, event_type, team_id,
            player_id, assist1_id, assist2_id, goal_strength,
            penalty_violation, penalty_minutes, penalty_class, penalty_end_time
        } = req.body;

        await client.query('BEGIN');

        const eventRes = await client.query(`
            INSERT INTO game_events (
                game_id, period, time_seconds, event_type, team_id,
                scorer_id, assist1_id, assist2_id, goal_strength,
                penalty_player_id, penalty_violation, penalty_minutes, penalty_class, penalty_end_time
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
        `, [
            gameId, period, time_seconds, event_type, team_id || null,
            event_type === 'goal' ? player_id : null, 
            assist1_id || null, assist2_id || null, goal_strength || null,
            event_type === 'penalty' ? player_id : null,
            penalty_violation || null, penalty_minutes || null, penalty_class || null, penalty_end_time || null
        ]);

        const eventId = eventRes.rows[0].id;

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

// --- РЕДАКТИРОВАНИЕ СОБЫТИЯ ---
export const updateGameEvent = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId, eventId } = req.params;
        const {
            period, time_seconds, event_type, team_id,
            player_id, assist1_id, assist2_id, goal_strength,
            penalty_violation, penalty_minutes, penalty_class, penalty_end_time
        } = req.body;

        await client.query('BEGIN');

        const oldEvRes = await client.query('SELECT event_type, team_id FROM game_events WHERE id = $1', [eventId]);
        if (oldEvRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Событие не найдено' });
        }
        
        const oldEvent = oldEvRes.rows[0];

        if (oldEvent.event_type === 'goal' && event_type === 'goal' && oldEvent.team_id !== parseInt(team_id)) {
            const gameRes = await client.query('SELECT home_team_id FROM games WHERE id = $1', [gameId]);
            if (gameRes.rows.length > 0) {
                const homeTeamId = gameRes.rows[0].home_team_id;

                if (oldEvent.team_id === homeTeamId) {
                    await client.query('UPDATE games SET home_score = GREATEST(home_score - 1, 0) WHERE id = $1', [gameId]);
                } else {
                    await client.query('UPDATE games SET away_score = GREATEST(away_score - 1, 0) WHERE id = $1', [gameId]);
                }

                if (parseInt(team_id) === homeTeamId) {
                    await client.query('UPDATE games SET home_score = home_score + 1 WHERE id = $1', [gameId]);
                } else {
                    await client.query('UPDATE games SET away_score = away_score + 1 WHERE id = $1', [gameId]);
                }
            }
        }

        await client.query(`
            UPDATE game_events SET
                period = $1, time_seconds = $2, team_id = $3,
                scorer_id = $4, assist1_id = $5, assist2_id = $6, goal_strength = $7,
                penalty_player_id = $8, penalty_violation = $9, penalty_minutes = $10, penalty_class = $11, penalty_end_time = $12
            WHERE id = $13
        `, [
            period, time_seconds, team_id || null,
            event_type === 'goal' ? player_id : null, assist1_id || null, assist2_id || null, goal_strength || null,
            event_type === 'penalty' ? player_id : null, penalty_violation || null, penalty_minutes || null, penalty_class || null, penalty_end_time || null,
            eventId
        ]);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка обновления события матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка обновления события' });
    } finally {
        client.release();
    }
};

// --- УДАЛЕНИЕ СОБЫТИЯ ---
export const deleteGameEvent = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId, eventId } = req.params;

        await client.query('BEGIN');

        const evRes = await client.query('SELECT event_type, team_id FROM game_events WHERE id = $1', [eventId]);
        
        if (evRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Событие не найдено' });
        }

        const { event_type, team_id } = evRes.rows[0];

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

// --- ОБНОВЛЕНИЕ НАСТРОЕК ТАЙМЕРА ---
export const updateTimerSettings = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { period_length, ot_length } = req.body;

        await pool.query(`
            UPDATE game_timers 
            SET period_length = $1, ot_length = $2 
            WHERE game_id = $3
        `, [period_length, ot_length, gameId]);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления настроек таймера:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// --- ПОЛУЧЕНИЕ ИГРОКОВ НА ЛЬДУ (+/-) ---
export const getEventPlusMinus = async (req, res) => {
    try {
        const { eventId } = req.params;
        const result = await pool.query('SELECT team_id, player_id FROM game_plus_minus WHERE event_id = $1', [eventId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения +/-:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// --- СОХРАНЕНИЕ ИГРОКОВ НА ЛЬДУ (+/-) ---
export const saveEventPlusMinus = async (req, res) => {
    const client = await pool.connect();
    try {
        const { eventId } = req.params;
        const { plus_players, minus_players, scoring_team_id, conceding_team_id } = req.body;

        await client.query('BEGIN');

        await client.query('DELETE FROM game_plus_minus WHERE event_id = $1', [eventId]);

        if (plus_players && plus_players.length > 0) {
            const plusValues = [];
            const plusParams = [];
            let pIdx = 1;
            plus_players.forEach(p_id => {
                plusValues.push(`($${pIdx++}, $${pIdx++}, $${pIdx++})`);
                plusParams.push(eventId, scoring_team_id, p_id);
            });
            await client.query(`INSERT INTO game_plus_minus (event_id, team_id, player_id) VALUES ${plusValues.join(', ')}`, plusParams);
        }

        if (minus_players && minus_players.length > 0) {
            const minusValues = [];
            const minusParams = [];
            let mIdx = 1;
            minus_players.forEach(p_id => {
                minusValues.push(`($${mIdx++}, $${mIdx++}, $${mIdx++})`);
                minusParams.push(eventId, conceding_team_id, p_id);
            });
            await client.query(`INSERT INTO game_plus_minus (event_id, team_id, player_id) VALUES ${minusValues.join(', ')}`, minusParams);
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка сохранения +/-:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения' });
    } finally {
        client.release();
    }
};