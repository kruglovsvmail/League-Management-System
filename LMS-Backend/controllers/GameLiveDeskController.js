// LMS-Backend/controllers/GameLiveDeskController.js
import pool from '../config/db.js';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';
import { getLeagueIdForGame } from '../utils/leagueLookup.js';
import { ARENA_STATIC_AUDIO_FILES, arenaAudioFileExists } from '../utils/arenaAudioFiles.js';

/**
 * Вспомогательная функция для установки флага необходимости пересчета статистики.
 * Срабатывает только если матч уже находится в статусе 'finished'.
 */
const triggerRecalcFlag = async (clientOrPool, gameId) => {
    await clientOrPool.query(
        `UPDATE games SET needs_recalc = true WHERE id = $1 AND status = 'finished'`, 
        [gameId]
    );
};

export const getGameEvents = async (req, res) => {
    try {
        const { gameId } = req.params;
        const query = `
            SELECT
                ge.id, ge.period, ge.time_seconds, ge.event_type, ge.goal_strength,
                ge.penalty_violation, ge.penalty_minutes, ge.penalty_class, ge.penalty_end_time,
                ge.against_goalie_id, ge.from_shot,
                t.id as team_id, t.name as team_name, t.logo_url as team_logo,
                t.pronunciation as team_pronunciation,

                su.id as primary_player_id, su.last_name as primary_last_name,
                su.first_name as primary_first_name, su.avatar_url as primary_avatar_url,
                su.pronunciation as primary_pronunciation,
                tm_su.photo_url as primary_photo_url,
                gr_su.jersey_number as primary_jersey_number,
                gr_su.position_in_line as primary_position,

                a1.id as assist1_id, a1.last_name as assist1_last_name,
                a1.first_name as assist1_first_name, a1.avatar_url as assist1_avatar_url,
                a1.pronunciation as assist1_pronunciation,
                tm_a1.photo_url as assist1_photo_url,
                gr_a1.jersey_number as assist1_jersey_number,

                a2.id as assist2_id, a2.last_name as assist2_last_name,
                a2.first_name as assist2_first_name, a2.avatar_url as a2_avatar_url,
                a2.pronunciation as assist2_pronunciation,
                tm_a2.photo_url as assist2_photo_url,
                gr_a2.jersey_number as assist2_jersey_number,

                EXISTS (SELECT 1 FROM game_plus_minus gpm WHERE gpm.event_id = ge.id) as has_plus_minus

            FROM game_events ge
            LEFT JOIN teams t ON ge.team_id = t.id

            LEFT JOIN users su ON COALESCE(ge.scorer_id, ge.penalty_player_id) = su.id
            LEFT JOIN team_members tm_su ON tm_su.user_id = su.id AND tm_su.team_id = ge.team_id
            LEFT JOIN game_rosters gr_su ON gr_su.game_id = ge.game_id AND gr_su.player_id = su.id AND gr_su.team_id = ge.team_id

            LEFT JOIN users a1 ON ge.assist1_id = a1.id
            LEFT JOIN team_members tm_a1 ON tm_a1.user_id = a1.id AND tm_a1.team_id = ge.team_id
            LEFT JOIN game_rosters gr_a1 ON gr_a1.game_id = ge.game_id AND gr_a1.player_id = a1.id AND gr_a1.team_id = ge.team_id

            LEFT JOIN users a2 ON ge.assist2_id = a2.id
            LEFT JOIN team_members tm_a2 ON tm_a2.user_id = a2.id AND tm_a2.team_id = ge.team_id
            LEFT JOIN game_rosters gr_a2 ON gr_a2.game_id = ge.game_id AND gr_a2.player_id = a2.id AND gr_a2.team_id = ge.team_id
            
            WHERE ge.game_id = $1
            ORDER BY 
                CASE WHEN ge.period = '1' THEN 1 
                     WHEN ge.period = '2' THEN 2 
                     WHEN ge.period = '3' THEN 3 
                     WHEN ge.period = '4' THEN 4
                     WHEN ge.period = '5' THEN 5
                     WHEN ge.period = 'OT' THEN 99 
                     WHEN ge.period = 'SO' THEN 100 ELSE 101 END ASC,
                ge.time_seconds ASC
        `;
        const result = await pool.query(query, [gameId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка загрузки событий матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const createGameEvent = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        const {
            period, time_seconds, event_type, team_id,
            player_id, assist1_id, assist2_id, goal_strength,
            penalty_violation, penalty_minutes, penalty_class, penalty_end_time,
            against_goalie_id, from_shot
        } = req.body;

        await client.query('BEGIN');

        const isGoalEvent = (event_type === 'goal');
        const isShootoutEvent = (event_type === 'shootout_goal' || event_type === 'shootout_miss');

        // from_shot имеет смысл только для голов в основное время;
        // для прочих типов оставляем default БД (true).
        const fromShotValue = isGoalEvent ? (from_shot !== false) : true;

        const eventRes = await client.query(`
            INSERT INTO game_events (
                game_id, period, time_seconds, event_type, team_id,
                scorer_id, assist1_id, assist2_id, goal_strength,
                penalty_player_id, penalty_violation, penalty_minutes, penalty_class, penalty_end_time,
                against_goalie_id, from_shot
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id
        `, [
            gameId, period, time_seconds || 0, event_type, team_id || null,
            (isGoalEvent || isShootoutEvent) ? player_id : null,
            assist1_id || null, assist2_id || null, goal_strength || null,
            event_type === 'penalty' ? player_id : null,
            penalty_violation || null, penalty_minutes || null, penalty_class || null, penalty_end_time || null,
            against_goalie_id || null, fromShotValue
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

        // Если матч завершен, помечаем, что нужен пересчет
        await triggerRecalcFlag(client, gameId);

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

export const updateGameEvent = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId, eventId } = req.params;
        const {
            period, time_seconds, event_type, team_id,
            player_id, assist1_id, assist2_id, goal_strength,
            penalty_violation, penalty_minutes, penalty_class, penalty_end_time,
            against_goalie_id, from_shot
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

        const isGoalEvent = (event_type === 'goal');
        const isShootoutEvent = (event_type === 'shootout_goal' || event_type === 'shootout_miss');

        // from_shot имеет смысл только для голов в основное время;
        // для прочих типов оставляем true (default БД).
        const fromShotValue = isGoalEvent ? (from_shot !== false) : true;

await client.query(`
    UPDATE game_events SET
        period = $1, time_seconds = $2, team_id = $3,
        scorer_id = $4, assist1_id = $5, assist2_id = $6, goal_strength = $7,
        penalty_player_id = $8, penalty_violation = $9, penalty_minutes = $10, penalty_class = $11, penalty_end_time = $12,
        against_goalie_id = $13, event_type = $15, from_shot = $16
    WHERE id = $14
`, [
    period, time_seconds || 0, team_id || null,
    (isGoalEvent || isShootoutEvent) ? player_id : null, assist1_id || null, assist2_id || null, goal_strength || null,
    event_type === 'penalty' ? player_id : null, penalty_violation || null, penalty_minutes || null, penalty_class || null, penalty_end_time || null,
    against_goalie_id || null,
    eventId,
    event_type,
    fromShotValue
]);

        await triggerRecalcFlag(client, gameId);

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

        await triggerRecalcFlag(client, gameId);

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

export const updateTimerSettings = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { period_length, ot_length, so_length, periods_count, track_plus_minus, auto_stop_on_event, arena_announcer } = req.body;

        // COALESCE: этот роут вызывается и с полным набором (батч-сохранение "Утвердить настройки"),
        // и с одним только arena_announcer (мгновенное сохранение тумблера диктора арены) —
        // отсутствующие поля не должны затирать то, что уже есть в БД.
        await pool.query(`
            UPDATE game_timers SET
                period_length = COALESCE($1, period_length),
                ot_length = COALESCE($2, ot_length),
                so_length = COALESCE($3, so_length),
                periods_count = COALESCE($4, periods_count),
                track_plus_minus = COALESCE($5, track_plus_minus),
                auto_stop_on_event = COALESCE($6, auto_stop_on_event),
                arena_announcer = COALESCE($7::jsonb, arena_announcer)
            WHERE game_id = $8
        `, [
            period_length ?? null, ot_length ?? null, so_length ?? null, periods_count ?? null,
            track_plus_minus ?? null, auto_stop_on_event ?? null,
            arena_announcer !== undefined ? JSON.stringify(arena_announcer) : null,
            gameId
        ]);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления настроек таймера:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

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

export const saveEventPlusMinus = async (req, res) => {
    const client = await pool.connect();
    try {
        const { eventId } = req.params;
        const { plus_players, minus_players, scoring_team_id, conceding_team_id } = req.body;

        await client.query('BEGIN');

        // Находим ID игры для флага пересчета
        const gameIdRes = await client.query('SELECT game_id FROM game_events WHERE id = $1', [eventId]);
        const gameId = gameIdRes.rows[0]?.game_id;

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

        if (gameId) await triggerRecalcFlag(client, gameId);

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

export const updateShootoutStatus = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { status } = req.body; 
        
        await pool.query(
            'UPDATE game_timers SET shootout_status = $1 WHERE game_id = $2',
            [status, gameId]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления статуса буллитов:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const finishShootout = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        await client.query('BEGIN');

        const gameRes = await client.query('SELECT home_team_id, away_team_id FROM games WHERE id = $1', [gameId]);
        if (gameRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }
        const game = gameRes.rows[0];

        // ОПЕЧАТКА УБРАНА: Чистый вызов client.query
        const allGoalsRes = await client.query(`
            SELECT team_id, event_type 
            FROM game_events 
            WHERE game_id = $1 AND event_type IN ('goal', 'shootout_goal')
        `, [gameId]);
        
        let homeReg = 0, awayReg = 0;
        let homeSO = 0, awaySO = 0;

        allGoalsRes.rows.forEach(e => {
            if (e.event_type === 'goal') {
                if (e.team_id === game.home_team_id) homeReg++;
                else if (e.team_id === game.away_team_id) awayReg++;
            } else if (e.event_type === 'shootout_goal') {
                if (e.team_id === game.home_team_id) homeSO++;
                else if (e.team_id === game.away_team_id) awaySO++;
            }
        });

        if (homeSO === awaySO) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Счет в серии равный. Выявите победителя.' });
        }

        let finalHome = homeReg;
        let finalAway = awayReg;

        if (homeSO > awaySO) finalHome++;
        else finalAway++;

        await client.query(
            'UPDATE games SET home_score = $2, away_score = $3, end_type = $4 WHERE id = $1', 
            [gameId, finalHome, finalAway, 'so']
        );

        await client.query(
            'UPDATE game_timers SET shootout_status = $1 WHERE game_id = $2',
            ['finished_win', gameId]
        );

        await triggerRecalcFlag(client, gameId);

        await client.query('COMMIT');
        res.json({ success: true, winner: homeSO > awaySO ? 'home' : 'away' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка завершения серии буллитов:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    } finally {
        client.release();
    }
};

export const reopenShootout = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        await client.query('BEGIN');

        const gameRes = await client.query('SELECT home_team_id, away_team_id FROM games WHERE id = $1', [gameId]);
        if (gameRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }
        const game = gameRes.rows[0];

        // ОПЕЧАТКА УБРАНА: Чистый вызов client.query
        const allGoalsRes = await client.query(`
            SELECT team_id 
            FROM game_events 
            WHERE game_id = $1 AND event_type = 'goal'
        `, [gameId]);
        
        let homeReg = 0, awayReg = 0;

        allGoalsRes.rows.forEach(e => {
            if (e.team_id === game.home_team_id) homeReg++;
            else if (e.team_id === game.away_team_id) awayReg++;
        });

        await client.query(
            'UPDATE games SET home_score = $2, away_score = $3, end_type = NULL WHERE id = $1', 
            [gameId, homeReg, awayReg]
        );

        await client.query(
            'UPDATE game_timers SET shootout_status = $1 WHERE game_id = $2',
            ['pending', gameId]
        );

        await triggerRecalcFlag(client, gameId);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка переоткрытия серии буллитов:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    } finally {
        client.release();
    }
};

export const saveGoalieLog = async (req, res) => {
    try {
        const { gameId } = req.params;
        const {
            id, time_seconds, home_goalie_id, away_goalie_id,
            home_goalie_unspecified, away_goalie_unspecified,
        } = req.body;

        if (id) {
            await pool.query(`
                UPDATE game_goalie_log
                SET time_seconds = $1, home_goalie_id = $2, away_goalie_id = $3,
                    home_goalie_unspecified = $4, away_goalie_unspecified = $5
                WHERE id = $6 AND game_id = $7
            `, [time_seconds, home_goalie_id || null, away_goalie_id || null,
                !!home_goalie_unspecified, !!away_goalie_unspecified, id, gameId]);
        } else {
            await pool.query(`
                INSERT INTO game_goalie_log (game_id, time_seconds, home_goalie_id, away_goalie_id, home_goalie_unspecified, away_goalie_unspecified)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [gameId, time_seconds, home_goalie_id || null, away_goalie_id || null,
                !!home_goalie_unspecified, !!away_goalie_unspecified]);
        }

        await triggerRecalcFlag(pool, gameId);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка сохранения лога вратарей:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const deleteGoalieLog = async (req, res) => {
    try {
        const { gameId, logId } = req.params;
        
        const countRes = await pool.query('SELECT COUNT(*) as count FROM game_goalie_log WHERE game_id = $1', [gameId]);
        const totalLogs = parseInt(countRes.rows[0].count, 10);

        if (totalLogs <= 1) {
            return res.status(400).json({ success: false, error: 'Нельзя удалить единственную запись. Вы можете только отредактировать её.' });
        }
        
        await pool.query('DELETE FROM game_goalie_log WHERE id = $1 AND game_id = $2', [logId, gameId]);
        await triggerRecalcFlag(pool, gameId);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления лога вратарей:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// Получить броски в створ по вратарям для матча
// shots_count = ВСЕ броски в створ на этого вратаря за период (не только отражённые).
// Отражённые броски (saves) считаются на лету как (shots_count − голы against
// этого вратаря в этом матче с from_shot = true).
export const getGoalieShotsSummary = async (req, res) => {
    const { gameId } = req.params;
    try {
        const result = await pool.query(`
            SELECT id, goalie_id, team_id, period, shots_count
            FROM game_shots_by_goalie
            WHERE game_id = $1
            ORDER BY team_id, goalie_id, period
        `, [gameId]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения бросков по вратарям:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// Сохранить количество бросков в створ на конкретного вратаря за период.
// shots_count хранит ВСЕ броски в створ (включая те, что стали голами с броска).
// Командные броски в створ вычисляются как сумма по вратарям соперника + голы в пустые.
export const saveGoalieShotsSummary = async (req, res) => {
    const { gameId } = req.params;
    const { goalie_id, team_id, period, shots_count } = req.body;

    if (!team_id || !period) {
        return res.status(400).json({ success: false, error: 'team_id и period обязательны' });
    }

    try {
        if (goalie_id) {
            await pool.query(`
                INSERT INTO game_shots_by_goalie (game_id, goalie_id, team_id, period, shots_count)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (game_id, goalie_id, period)
                DO UPDATE SET shots_count = EXCLUDED.shots_count
            `, [gameId, goalie_id, team_id, period, shots_count ?? 0]);
        } else {
            // goalie_id = NULL (пустые ворота либо «не указан» — секретарь различает
            // их через team_id/сторону на фронте, здесь это просто «броски без
            // привязки к конкретному вратарю»). UNIQUE(game_id, goalie_id, period) не
            // ловит повторные NULL — Postgres считает каждый NULL уникальным — поэтому
            // апдейтим вручную по team_id, а не полагаемся на ON CONFLICT.
            const upd = await pool.query(`
                UPDATE game_shots_by_goalie
                SET shots_count = $1
                WHERE game_id = $2 AND goalie_id IS NULL AND team_id = $3 AND period = $4
            `, [shots_count ?? 0, gameId, team_id, period]);
            if (upd.rowCount === 0) {
                await pool.query(`
                    INSERT INTO game_shots_by_goalie (game_id, goalie_id, team_id, period, shots_count)
                    VALUES ($1, NULL, $2, $3, $4)
                `, [gameId, team_id, period, shots_count ?? 0]);
            }
        }

        await triggerRecalcFlag(pool, gameId);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка сохранения бросков по вратарю:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const getGameAudioUrl = async (req, res) => {
    try {
        const { gameId } = req.params;

        const gameRes = await pool.query(`
            SELECT s.league_id
            FROM games g
            JOIN divisions d ON g.division_id = d.id
            JOIN seasons s ON d.season_id = s.id
            WHERE g.id = $1
        `, [gameId]);

        if (gameRes.rows.length === 0) {
            return res.json({ success: true, url: `https://s3.twcstorage.ru/hockeyeco-uploads/audio/league-default/Intro.mp3?t=${Date.now()}` });
        }

        const leagueId = gameRes.rows[0].league_id;
        const leagueKey = `audio/league-${leagueId}/Intro.mp3`;

        try {
            await s3.send(new HeadObjectCommand({
                Bucket: 'hockeyeco-uploads',
                Key: leagueKey
            }));
            return res.json({ success: true, url: `https://s3.twcstorage.ru/hockeyeco-uploads/${leagueKey}?t=${Date.now()}` });
        } catch (e) {
            return res.json({ success: true, url: `https://s3.twcstorage.ru/hockeyeco-uploads/audio/league-default/Intro.mp3?t=${Date.now()}` });
        }
    } catch (err) {
        console.error('Ошибка получения аудио URL:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// Проверка наличия статичных PA-файлов диктора арены (сирена/предупреждения) для лиги матча.
// Используется настройками секретарской панели перед включением тумблера диктора.
export const getArenaAudioFiles = async (req, res) => {
    try {
        const { gameId } = req.params;
        const leagueId = await getLeagueIdForGame(gameId);

        if (!leagueId) {
            const files = Object.fromEntries(ARENA_STATIC_AUDIO_FILES.map(f => [f, false]));
            return res.json({ success: true, files });
        }

        const entries = await Promise.all(
            ARENA_STATIC_AUDIO_FILES.map(async (f) => [f, await arenaAudioFileExists(leagueId, f)])
        );
        res.json({ success: true, files: Object.fromEntries(entries) });
    } catch (err) {
        console.error('Ошибка проверки аудиофайлов диктора арены:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};