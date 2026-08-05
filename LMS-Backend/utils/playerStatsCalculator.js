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

        // 3. БОЛЬШОЙ АГРЕГИРУЮЩИЙ ЗАПРОС (полевые игроки + вратари)
        await client.query(`
            WITH ValidGames AS (
                -- Только завершенные матчи без технических результатов
                SELECT
                    g.id,
                    g.home_team_id,
                    g.away_team_id,
                    g.home_score,
                    g.away_score,
                    -- Настройки таймера нужны для конвертации времени периода в абсолютное
                    COALESCE(gt.period_length, 20)  AS period_length,
                    COALESCE(gt.ot_length,     5)   AS ot_length,
                    COALESCE(gt.periods_count, 3)   AS periods_count,
                    -- Общая продолжительность матча в секундах (для расчёта minutes_played)
                    (
                        COALESCE(gt.period_length, 20) *
                        COALESCE(gt.periods_count, 3)  * 60
                        + CASE
                            WHEN g.end_type IN ('ot', 'so')
                            THEN COALESCE(gt.ot_length, 5) * 60
                            ELSE 0
                          END
                    ) AS total_seconds
                FROM games g
                LEFT JOIN game_timers gt ON g.id = gt.game_id
                WHERE g.division_id = $1
                  AND g.status = 'finished'
                  AND g.is_technical IS NULL
            ),
            -- Регламентная длина матча из настроек дивизиона (для нормировки КН)
            DivisionReg AS (
                SELECT
                    COALESCE(d.reg_periods_count,   3)  AS reg_periods_count,
                    COALESCE(d.reg_period_length,  20)  AS reg_period_length,
                    COALESCE(d.playoff_periods_count,  3)  AS playoff_periods_count,
                    COALESCE(d.playoff_period_length, 20)  AS playoff_period_length
                FROM divisions d WHERE d.id = $1
            ),

            -- ─── ПОЛЕВЫЕ ИГРОКИ ──────────────────────────────────────────────

            GamesPlayed AS (
                SELECT gr.player_id, gr.team_id, COUNT(DISTINCT gr.game_id) AS gp
                FROM game_rosters gr
                JOIN ValidGames vg ON gr.game_id = vg.id
                WHERE gr.is_in_lineup = true
                GROUP BY gr.player_id, gr.team_id
            ),
            Goals AS (
                SELECT ge.scorer_id AS player_id, ge.team_id, COUNT(ge.id) AS g
                FROM game_events ge
                JOIN ValidGames vg ON ge.game_id = vg.id
                WHERE ge.event_type = 'goal' AND ge.scorer_id IS NOT NULL
                GROUP BY ge.scorer_id, ge.team_id
            ),
            Assists AS (
                SELECT player_id, team_id, COUNT(*) AS a
                FROM (
                    SELECT assist1_id AS player_id, team_id
                    FROM game_events ge
                    JOIN ValidGames vg ON ge.game_id = vg.id
                    WHERE event_type = 'goal' AND assist1_id IS NOT NULL
                    UNION ALL
                    SELECT assist2_id AS player_id, team_id
                    FROM game_events ge
                    JOIN ValidGames vg ON ge.game_id = vg.id
                    WHERE event_type = 'goal' AND assist2_id IS NOT NULL
                ) sub
                GROUP BY player_id, team_id
            ),
            Penalties AS (
                SELECT ge.penalty_player_id AS player_id, ge.team_id, SUM(ge.penalty_minutes) AS pim
                FROM game_events ge
                JOIN ValidGames vg ON ge.game_id = vg.id
                WHERE ge.event_type = 'penalty' AND ge.penalty_player_id IS NOT NULL
                GROUP BY ge.penalty_player_id, ge.team_id
            ),
            PlusMinus AS (
                SELECT gpm.player_id, gpm.team_id AS player_team_id,
                       SUM(CASE WHEN gpm.team_id = ge.team_id THEN 1 ELSE -1 END) AS pm
                FROM game_plus_minus gpm
                JOIN game_events ge ON gpm.event_id = ge.id
                JOIN ValidGames vg ON ge.game_id = vg.id
                GROUP BY gpm.player_id, gpm.team_id
            ),

            -- ─── ВРАТАРСКАЯ СТАТИСТИКА ───────────────────────────────────────

            -- Конвертируем время каждого гола в единую шкалу с game_goalie_log
            -- и сразу прокидываем флаг from_shot (был ли гол с броска в створ).
            GoalsAbsTime AS (
                SELECT
                    ge.id          AS event_id,
                    ge.game_id,
                    ge.team_id     AS scoring_team_id,
                    vg.home_team_id,
                    vg.away_team_id,
                    ge.time_seconds AS abs_time,
                    COALESCE(ge.from_shot, true) AS from_shot
                FROM game_events ge
                JOIN ValidGames vg ON ge.game_id = vg.id
                -- Только обычные голы; буллиты (goal_strength = 'ps', shootout_*)
                -- в статистику вратаря НЕ идут
                WHERE ge.event_type = 'goal'
                  AND ge.goal_strength <> 'ps'
            ),

            -- Для каждого гола находим вратаря, стоявшего в воротах в этот момент.
            -- Берём последнюю запись goalie_log с time_seconds <= abs_time гола.
            GoalToGoalie AS (
                SELECT DISTINCT ON (ga.event_id)
                    ga.event_id,
                    ga.game_id,
                    ga.scoring_team_id,
                    ga.home_team_id,
                    ga.away_team_id,
                    ga.from_shot,
                    -- Вратарь команды, которая пропустила (противоположная scoring_team_id)
                    CASE
                        WHEN ga.scoring_team_id = ga.home_team_id THEN gl.away_goalie_id
                        ELSE                                           gl.home_goalie_id
                    END AS conceding_goalie_id,
                    -- Сама пропустившая команда: без неё статистика вратаря, сыгравшего
                    -- в дивизионе за две команды, целиком попадала бы в обе его заявки
                    CASE
                        WHEN ga.scoring_team_id = ga.home_team_id THEN ga.away_team_id
                        ELSE                                           ga.home_team_id
                    END AS conceding_team_id
                FROM GoalsAbsTime ga
                JOIN game_goalie_log gl
                    ON  gl.game_id      = ga.game_id
                    AND gl.time_seconds <= ga.abs_time
                ORDER BY ga.event_id, gl.time_seconds DESC
            ),

            -- Все пропущенные шайбы вратаря (для GA и КН)
            GoaliesGA AS (
                SELECT conceding_goalie_id AS player_id, conceding_team_id AS team_id, COUNT(*) AS ga
                FROM GoalToGoalie
                WHERE conceding_goalie_id IS NOT NULL
                GROUP BY conceding_goalie_id, conceding_team_id
            ),

            -- Только голы С БРОСКА (нужны для shots_against / save_percent).
            -- Голы без броска (автоголы, добивания вне створа и т.п.)
            -- в знаменатель процента отражённых бросков НЕ идут.
            GoaliesGAFromShot AS (
                SELECT conceding_goalie_id AS player_id, conceding_team_id AS team_id, COUNT(*) AS ga_fs
                FROM GoalToGoalie
                WHERE conceding_goalie_id IS NOT NULL
                  AND from_shot = true
                GROUP BY conceding_goalie_id, conceding_team_id
            ),

            -- ─── БРОСКИ В СТВОР ВРАТАРЮ ─────────────────────────────────────
            -- В game_shots_by_goalie.shots_count хранятся ВСЕ броски в створ
            -- на данного вратаря за период (то, что ввёл секретарь).
            -- Отражённые броски вычисляются ниже как (shots_against − ga_from_shot).
            GoaliesShotsAgainst AS (
                -- gsb.team_id — команда вратаря (не бросавшей стороны)
                SELECT gsb.goalie_id AS player_id, gsb.team_id, SUM(gsb.shots_count) AS sa
                FROM game_shots_by_goalie gsb
                JOIN ValidGames vg ON gsb.game_id = vg.id
                WHERE gsb.goalie_id IS NOT NULL
                GROUP BY gsb.goalie_id, gsb.team_id
            ),

            -- ─── МИНУТЫ ИГРЫ ВРАТАРЯ ─────────────────────────────────────────
            -- Строим интервалы дежурств из goalie_log.
            -- Для каждой записи «конец интервала» = время следующей записи в том же матче,
            -- для последней — total_seconds матча.
            GoalieIntervals AS (
                SELECT
                    gl.game_id,
                    gl.home_goalie_id,
                    gl.away_goalie_id,
                    -- Команду вратаря журнал не хранит, она однозначно определяется стороной
                    vg.home_team_id,
                    vg.away_team_id,
                    gl.time_seconds                                              AS interval_start,
                    COALESCE(
                        LEAD(gl.time_seconds) OVER (
                            PARTITION BY gl.game_id ORDER BY gl.time_seconds
                        ),
                        vg.total_seconds
                    )                                                            AS interval_end
                FROM game_goalie_log gl
                JOIN ValidGames vg ON gl.game_id = vg.id
            ),
            GoalieMinutes AS (
                -- Домашний вратарь
                SELECT home_goalie_id AS player_id, home_team_id AS team_id,
                       SUM(GREATEST(interval_end - interval_start, 0)) AS secs
                FROM GoalieIntervals
                WHERE home_goalie_id IS NOT NULL
                GROUP BY home_goalie_id, home_team_id
                UNION ALL
                -- Гостевой вратарь
                SELECT away_goalie_id AS player_id, away_team_id AS team_id,
                       SUM(GREATEST(interval_end - interval_start, 0)) AS secs
                FROM GoalieIntervals
                WHERE away_goalie_id IS NOT NULL
                GROUP BY away_goalie_id, away_team_id
            ),
            GoalieMinutesAgg AS (
                -- После UNION ALL суммируем: один вратарь мог играть за клуб и дома, и в гостях
                SELECT player_id, team_id, SUM(secs) AS total_secs
                FROM GoalieMinutes
                GROUP BY player_id, team_id
            ),

            -- ─── СУХИЕ МАТЧИ (строгий НХЛ-стиль) ────────────────────────────
            -- Shutout засчитывается только если:
            --   1. Вратарь единственный стоял в матче за свою команду
            --      (ровно одна запись в goalie_log с его id для данного матча)
            --   2. Команда пропустила 0 голов
            -- При смене вратарей никто shutout не получает.

            -- Считаем, сколько уникальных вратарей стояло за каждую сторону в каждом матче
            GoalieCountPerSide AS (
                SELECT
                    game_id,
                    COUNT(DISTINCT home_goalie_id)
                        FILTER (WHERE home_goalie_id IS NOT NULL) AS home_goalie_count,
                    COUNT(DISTINCT away_goalie_id)
                        FILTER (WHERE away_goalie_id IS NOT NULL) AS away_goalie_count
                FROM game_goalie_log
                GROUP BY game_id
            ),
            Shutouts AS (
                -- Домашний вратарь
                SELECT gl.home_goalie_id AS player_id, vg.home_team_id AS team_id, COUNT(DISTINCT gl.game_id) AS sho
                FROM game_goalie_log gl
                JOIN ValidGames vg ON gl.game_id = vg.id
                JOIN GoalieCountPerSide gc ON gc.game_id = gl.game_id
                WHERE gl.home_goalie_id IS NOT NULL
                  AND gc.home_goalie_count = 1   -- единственный вратарь в матче
                  AND vg.away_score = 0          -- хозяева не пропустили
                GROUP BY gl.home_goalie_id, vg.home_team_id
                UNION ALL
                -- Гостевой вратарь
                SELECT gl.away_goalie_id AS player_id, vg.away_team_id AS team_id, COUNT(DISTINCT gl.game_id) AS sho
                FROM game_goalie_log gl
                JOIN ValidGames vg ON gl.game_id = vg.id
                JOIN GoalieCountPerSide gc ON gc.game_id = gl.game_id
                WHERE gl.away_goalie_id IS NOT NULL
                  AND gc.away_goalie_count = 1   -- единственный вратарь в матче
                  AND vg.home_score = 0          -- гости не пропустили
                GROUP BY gl.away_goalie_id, vg.away_team_id
            ),
            ShutoutsAgg AS (
                SELECT player_id, team_id, SUM(sho) AS total_sho
                FROM Shutouts
                GROUP BY player_id, team_id
            )

            -- ─── ИТОГОВОЕ ОБНОВЛЕНИЕ ─────────────────────────────────────────
            UPDATE player_statistics ps
            SET
                games_played           = COALESCE(gp.gp,  0),
                goals                  = COALESCE(g.g,    0),
                assists                = COALESCE(a.a,    0),
                points                 = COALESCE(g.g, 0) + COALESCE(a.a, 0),
                penalty_minutes        = COALESCE(p.pim,  0),
                plus_minus             = COALESCE(pm.pm,  0),

                -- Вратарская статистика
                -- GA — все пропущенные шайбы (включая без броска), для отображения и для КН.
                goals_against          = COALESCE(gga.ga,  0),
                -- Броски в створ по вратарю — то, что ввёл секретарь (game_shots_by_goalie).
                shots_against          = COALESCE(gsa.sa,  0),
                -- Отражённые броски = (все броски в створ) − (только голы С БРОСКА).
                -- Голы без броска (рикошет от конька и т.п.) не считаются ни как
                -- бросок в створ, ни как пропущенный отражаемый — они только в goals_against.
                saves                  = GREATEST(COALESCE(gsa.sa, 0) - COALESCE(gfs.ga_fs, 0), 0),
                save_percent           = CASE
                                             WHEN COALESCE(gsa.sa, 0) > 0
                                             THEN ROUND(
                                                 GREATEST(COALESCE(gsa.sa, 0) - COALESCE(gfs.ga_fs, 0), 0)::numeric
                                                 / COALESCE(gsa.sa, 0) * 100, 2
                                             )
                                             ELSE 0.00
                                         END,
                goals_against_average  = CASE
                                             WHEN COALESCE(gm.total_secs, 0) > 0
                                             THEN ROUND(
                                                 COALESCE(gga.ga, 0)::numeric
                                                 / COALESCE(gm.total_secs, 0)
                                                 -- Нормируем на регламентную длину матча дивизиона (сек)
                                                 -- stageType учитывается: reg vs playoff регламенты разные
                                                 * (dr.reg_periods_count * dr.reg_period_length * 60), 2
                                             )
                                             ELSE 0.00
                                         END,
                shutouts               = COALESCE(sho.total_sho, 0),
                minutes_played         = COALESCE(gm.total_secs, 0),

                updated_at             = NOW()

            FROM tournament_rosters tr
            JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
            CROSS JOIN DivisionReg dr

            LEFT JOIN GamesPlayed  gp  ON gp.player_id  = tr.player_id AND gp.team_id = tt.team_id
            LEFT JOIN Goals        g   ON g.player_id   = tr.player_id AND g.team_id  = tt.team_id
            LEFT JOIN Assists      a   ON a.player_id   = tr.player_id AND a.team_id  = tt.team_id
            LEFT JOIN Penalties    p   ON p.player_id   = tr.player_id AND p.team_id  = tt.team_id
            LEFT JOIN PlusMinus    pm  ON pm.player_id  = tr.player_id AND pm.player_team_id = tt.team_id
            -- Вратарские показатели присоединяются по паре «игрок + команда», как и полевые:
            -- у вратаря, сыгравшего в дивизионе за две команды, две заявки, и каждая должна
            -- получить только свою часть, а не сумму по обеим
            LEFT JOIN GoaliesGA           gga ON gga.player_id = tr.player_id AND gga.team_id = tt.team_id
            LEFT JOIN GoaliesGAFromShot   gfs ON gfs.player_id = tr.player_id AND gfs.team_id = tt.team_id
            LEFT JOIN GoaliesShotsAgainst gsa ON gsa.player_id = tr.player_id AND gsa.team_id = tt.team_id
            LEFT JOIN GoalieMinutesAgg gm  ON gm.player_id  = tr.player_id AND gm.team_id  = tt.team_id
            LEFT JOIN ShutoutsAgg  sho ON sho.player_id = tr.player_id AND sho.team_id = tt.team_id

            WHERE ps.tournament_roster_id = tr.id
              AND tt.division_id = $1;
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
