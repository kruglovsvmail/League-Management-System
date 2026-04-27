import pool from '../config/db.js';

export const recalculatePlayerStatistics = async (divisionId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Создаем записи в player_statistics для всех одобренных заявок турнира, 
        // если их еще нет (ON CONFLICT DO NOTHING)
        await client.query(`
            INSERT INTO player_statistics (tournament_roster_id)
            SELECT tr.id
            FROM tournament_rosters tr
            JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
            WHERE tt.division_id = $1 AND tr.application_status = 'approved'
            ON CONFLICT (tournament_roster_id) DO NOTHING
        `, [divisionId]);

        // 2. ИДЕМПОТЕНТНОСТЬ: Сбрасываем всю статистику в 0 для этого дивизиона
        // Это позволяет легко "откатывать" статистику, если матч перевели из "Завершен" в другой статус
        await client.query(`
            UPDATE player_statistics ps
            SET games_played = 0, goals = 0, assists = 0, points = 0,
                plus_minus = 0, penalty_minutes = 0, shots_against = 0,
                goals_against = 0, saves = 0, save_percent = 0.00,
                goals_against_average = 0.00, shutouts = 0, minutes_played = 0,
                updated_at = NOW()
            FROM tournament_rosters tr
            JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
            WHERE ps.tournament_roster_id = tr.id AND tt.division_id = $1
        `, [divisionId]);

        // 3. БОЛЬШОЙ АГРЕГИРУЮЩИЙ ЗАПРОС
        // PostgreSQL сделает это мгновенно, не загружая оперативную память Node.js
        await client.query(`
            WITH ValidGames AS (
                -- Берем только завершенные матчи без технических результатов
                SELECT id, home_team_id, away_team_id, home_score, away_score
                FROM games 
                WHERE division_id = $1 AND status = 'finished' AND is_technical IS NULL
            ),
            GamesPlayed AS (
                -- Игры: только если игрок был в протоколе (is_in_lineup = true)
                SELECT gr.player_id, gr.team_id, COUNT(DISTINCT gr.game_id) as gp
                FROM game_rosters gr
                JOIN ValidGames vg ON gr.game_id = vg.id
                WHERE gr.is_in_lineup = true
                GROUP BY gr.player_id, gr.team_id
            ),
            Goals AS (
                -- Голы
                SELECT ge.scorer_id AS player_id, ge.team_id, COUNT(ge.id) as g
                FROM game_events ge
                JOIN ValidGames vg ON ge.game_id = vg.id
                WHERE ge.event_type = 'goal' AND ge.scorer_id IS NOT NULL
                GROUP BY ge.scorer_id, ge.team_id
            ),
            Assists AS (
                -- Передачи (схлопываем assist1 и assist2 в одну колонку)
                SELECT player_id, team_id, COUNT(*) as a
                FROM (
                    SELECT assist1_id as player_id, team_id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE event_type = 'goal' AND assist1_id IS NOT NULL
                    UNION ALL
                    SELECT assist2_id as player_id, team_id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE event_type = 'goal' AND assist2_id IS NOT NULL
                ) sub
                GROUP BY player_id, team_id
            ),
            Penalties AS (
                -- Штрафное время
                SELECT ge.penalty_player_id AS player_id, ge.team_id, SUM(ge.penalty_minutes) as pim
                FROM game_events ge
                JOIN ValidGames vg ON ge.game_id = vg.id
                WHERE ge.event_type = 'penalty' AND ge.penalty_player_id IS NOT NULL
                GROUP BY ge.penalty_player_id, ge.team_id
            ),
            PlusMinus AS (
                -- Показатель полезности
                SELECT gpm.player_id, gpm.team_id AS player_team_id,
                       SUM(CASE WHEN gpm.team_id = ge.team_id THEN 1 ELSE -1 END) as pm
                FROM game_plus_minus gpm
                JOIN game_events ge ON gpm.event_id = ge.id
                JOIN ValidGames vg ON ge.game_id = vg.id
                GROUP BY gpm.player_id, gpm.team_id
            ),
            GoaliesGA AS (
                -- Вратари: Пропущенные шайбы
                SELECT ge.against_goalie_id AS player_id, COUNT(ge.id) as ga
                FROM game_events ge
                JOIN ValidGames vg ON ge.game_id = vg.id
                WHERE ge.event_type = 'goal' AND ge.against_goalie_id IS NOT NULL
                GROUP BY ge.against_goalie_id
            ),
            Shutouts AS (
                -- Вратари: Сухие матчи (был заявлен вратарем и команда пропустила 0)
                SELECT gr.player_id, gr.team_id, COUNT(DISTINCT gr.game_id) as sho
                FROM game_rosters gr
                JOIN ValidGames vg ON gr.game_id = vg.id
                WHERE gr.is_in_lineup = true AND gr.position_in_line = 'G'
                  AND (
                      (gr.team_id = vg.home_team_id AND vg.away_score = 0) OR
                      (gr.team_id = vg.away_team_id AND vg.home_score = 0)
                  )
                GROUP BY gr.player_id, gr.team_id
            )
            
            -- ИТОГОВОЕ ОБНОВЛЕНИЕ ТАБЛИЦЫ
            UPDATE player_statistics ps
            SET games_played = COALESCE(gp.gp, 0),
                goals = COALESCE(g.g, 0),
                assists = COALESCE(a.a, 0),
                points = COALESCE(g.g, 0) + COALESCE(a.a, 0),
                penalty_minutes = COALESCE(p.pim, 0),
                plus_minus = COALESCE(pm.pm, 0),
                goals_against = COALESCE(gga.ga, 0),
                shutouts = COALESCE(sho.sho, 0),
                updated_at = NOW()
            FROM tournament_rosters tr
            JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
            LEFT JOIN GamesPlayed gp ON gp.player_id = tr.player_id AND gp.team_id = tt.team_id
            LEFT JOIN Goals g ON g.player_id = tr.player_id AND g.team_id = tt.team_id
            LEFT JOIN Assists a ON a.player_id = tr.player_id AND a.team_id = tt.team_id
            LEFT JOIN Penalties p ON p.player_id = tr.player_id AND p.team_id = tt.team_id
            LEFT JOIN PlusMinus pm ON pm.player_id = tr.player_id AND pm.player_team_id = tt.team_id
            LEFT JOIN GoaliesGA gga ON gga.player_id = tr.player_id
            LEFT JOIN Shutouts sho ON sho.player_id = tr.player_id AND sho.team_id = tt.team_id
            WHERE ps.tournament_roster_id = tr.id AND tt.division_id = $1;
        `, [divisionId]);

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка при пересчете статистики игроков:', error);
        throw error;
    } finally {
        client.release();
    }
};