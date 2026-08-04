import pool from '../config/db.js';

export const getPlayerProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const infoQuery = `
      SELECT 
        u.id, u.first_name, u.last_name, u.middle_name, 
        u.birth_date, u.height, u.weight, u.grip, u.avatar_url,
        COALESCE(
          (
            SELECT json_agg(json_build_object('url', sub.photo_url, 'teamLogo', sub.logo_url))
            FROM (
              SELECT DISTINCT tm.photo_url, t.logo_url
              FROM team_members tm
              JOIN teams t ON tm.team_id = t.id
              WHERE tm.user_id = u.id AND tm.photo_url IS NOT NULL
            ) sub
          ),
          '[]'::json
        ) as team_photos
      FROM users u
      WHERE u.id = $1
    `;

    // Статистика игрока считается ЖИВЬЁМ (не из кэша player_statistics — тот остаётся общей
    // суммой для других потребителей), ОДНА строка на дивизион — сумма regular+playoff (по
    // явному решению пользователя, раньше стадии показывались раздельно, дробить больше не
    // нужно). Основа — та же логика, что и раньше (перенос из TR tournamentController.js),
    // посчитанная дважды (regular/playoff, отдельная пара LATERAL на каждую) и сложенная —
    // тот же приём, что уже применён в Team-Room/TR-Backend/controllers/playerController.js.
    // Маскирование: если у дивизиона на конкретной стадии выключен track_plus_minus/
    // track_shots, вклад ЭТОЙ стадии в сумму = 0 (не "—" на всю сумму, а именно 0).
    const statsQuery = `
      WITH base AS (
        SELECT
          tr.id AS tournament_roster_id,
          tr.position,
          tt.team_id,
          tt.division_id,
          t.name AS team_name,
          t.logo_url AS team_logo,
          t.city AS team_city,
          d.name AS division_name,
          d.short_name AS division_short_name,
          d.logo_url AS division_logo,
          d.reg_track_plus_minus, d.playoff_track_plus_minus,
          d.reg_track_shots, d.playoff_track_shots,
          COALESCE(d.reg_periods_count, 3) * COALESCE(d.reg_period_length, 20) * 60 AS norm_seconds,
          s.name AS season_name,
          s.is_active AS is_current,
          s.start_date,
          l.short_name AS league_name,
          l.name AS league_full_name,
          l.logo_url AS league_logo,
          l.city AS league_city,
          lq.short_name AS qual_name,
          lq.name AS qual_full_name,
          lq.description AS qual_description
        FROM tournament_rosters tr
        JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
        JOIN teams t ON tt.team_id = t.id
        JOIN divisions d ON tt.division_id = d.id
        JOIN seasons s ON d.season_id = s.id
        JOIN leagues l ON s.league_id = l.id
        LEFT JOIN league_qualifications lq ON tr.qualification_id = lq.id
        WHERE tr.player_id = $1
      ),
      agg AS (
        SELECT
          b.*,
          COALESCE(skater_reg.gp, 0) + COALESCE(skater_po.gp, 0) + COALESCE(goalie_reg.gp, 0) + COALESCE(goalie_po.gp, 0) AS gp,
          COALESCE(skater_reg.g, 0) + COALESCE(skater_po.g, 0) AS g,
          -- Передачи считаем и вратарю: в протоколе его можно поставить ассистентом.
          -- Голы и очки при этом остаются чисто полевыми — их у вратаря не показываем.
          COALESCE(skater_reg.a, 0) + COALESCE(skater_po.a, 0)
            + COALESCE(goalie_reg.a, 0) + COALESCE(goalie_po.a, 0) AS a,
          COALESCE(skater_reg.g, 0) + COALESCE(skater_po.g, 0) + COALESCE(skater_reg.a, 0) + COALESCE(skater_po.a, 0) AS pts,
          (
            CASE WHEN b.reg_track_plus_minus THEN COALESCE(skater_reg.pm, 0) ELSE 0 END
            + CASE WHEN b.playoff_track_plus_minus THEN COALESCE(skater_po.pm, 0) ELSE 0 END
          ) AS pm,
          COALESCE(skater_reg.pim, 0) + COALESCE(skater_po.pim, 0) + COALESCE(goalie_reg.pim, 0) + COALESCE(goalie_po.pim, 0) AS pim,
          COALESCE(goalie_reg.ga, 0) + COALESCE(goalie_po.ga, 0) AS ga,
          (
            CASE WHEN b.reg_track_shots THEN COALESCE(goalie_reg.sa, 0) ELSE 0 END
            + CASE WHEN b.playoff_track_shots THEN COALESCE(goalie_po.sa, 0) ELSE 0 END
          ) AS sa,
          (
            CASE WHEN b.reg_track_shots THEN COALESCE(goalie_reg.sv, 0) ELSE 0 END
            + CASE WHEN b.playoff_track_shots THEN COALESCE(goalie_po.sv, 0) ELSE 0 END
          ) AS sv,
          COALESCE(goalie_reg.sho, 0) + COALESCE(goalie_po.sho, 0) AS sho,
          COALESCE(goalie_reg.toi, 0) + COALESCE(goalie_po.toi, 0) AS toi
        FROM base b
        LEFT JOIN LATERAL (
          WITH ValidGames AS (
            SELECT g.id, g.home_team_id, g.away_team_id
            FROM games g
            WHERE g.division_id = b.division_id AND g.status = 'finished' AND g.is_technical IS NULL
              AND (CASE WHEN g.stage_type = 'playoff' THEN 'playoff' ELSE 'regular' END) = 'regular'
          )
          SELECT
            (SELECT COUNT(DISTINCT gr.game_id) FROM game_rosters gr JOIN ValidGames vg ON gr.game_id = vg.id
              WHERE gr.player_id = $1 AND gr.team_id = b.team_id AND gr.is_in_lineup = true AND gr.position_in_line != 'G') AS gp,
            (SELECT COUNT(*) FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id
              WHERE ge.event_type = 'goal' AND ge.scorer_id = $1 AND ge.team_id = b.team_id) AS g,
            (SELECT COUNT(*) FROM (
                SELECT ge.id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE ge.event_type = 'goal' AND ge.assist1_id = $1 AND ge.team_id = b.team_id
                UNION ALL
                SELECT ge.id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE ge.event_type = 'goal' AND ge.assist2_id = $1 AND ge.team_id = b.team_id
              ) sub) AS a,
            (SELECT COALESCE(SUM(ge.penalty_minutes), 0) FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id
              WHERE ge.event_type = 'penalty' AND ge.penalty_player_id = $1 AND ge.team_id = b.team_id) AS pim,
            (SELECT SUM(CASE WHEN gpm.team_id = ge.team_id THEN 1 ELSE -1 END) FROM game_plus_minus gpm
              JOIN game_events ge ON gpm.event_id = ge.id JOIN ValidGames vg ON ge.game_id = vg.id
              WHERE gpm.player_id = $1 AND gpm.team_id = b.team_id) AS pm
        ) skater_reg ON b.position != 'goalie'
        LEFT JOIN LATERAL (
          WITH ValidGames AS (
            SELECT g.id, g.home_team_id, g.away_team_id
            FROM games g
            WHERE g.division_id = b.division_id AND g.status = 'finished' AND g.is_technical IS NULL
              AND g.stage_type = 'playoff'
          )
          SELECT
            (SELECT COUNT(DISTINCT gr.game_id) FROM game_rosters gr JOIN ValidGames vg ON gr.game_id = vg.id
              WHERE gr.player_id = $1 AND gr.team_id = b.team_id AND gr.is_in_lineup = true AND gr.position_in_line != 'G') AS gp,
            (SELECT COUNT(*) FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id
              WHERE ge.event_type = 'goal' AND ge.scorer_id = $1 AND ge.team_id = b.team_id) AS g,
            (SELECT COUNT(*) FROM (
                SELECT ge.id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE ge.event_type = 'goal' AND ge.assist1_id = $1 AND ge.team_id = b.team_id
                UNION ALL
                SELECT ge.id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE ge.event_type = 'goal' AND ge.assist2_id = $1 AND ge.team_id = b.team_id
              ) sub) AS a,
            (SELECT COALESCE(SUM(ge.penalty_minutes), 0) FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id
              WHERE ge.event_type = 'penalty' AND ge.penalty_player_id = $1 AND ge.team_id = b.team_id) AS pim,
            (SELECT SUM(CASE WHEN gpm.team_id = ge.team_id THEN 1 ELSE -1 END) FROM game_plus_minus gpm
              JOIN game_events ge ON gpm.event_id = ge.id JOIN ValidGames vg ON ge.game_id = vg.id
              WHERE gpm.player_id = $1 AND gpm.team_id = b.team_id) AS pm
        ) skater_po ON b.position != 'goalie'
        LEFT JOIN LATERAL (
          WITH ValidGames AS (
            SELECT g.id, g.home_team_id, g.away_team_id, g.home_score, g.away_score,
                   COALESCE(gt.period_length, 20) AS period_length,
                   COALESCE(gt.ot_length, 5) AS ot_length,
                   COALESCE(gt.periods_count, 3) AS periods_count,
                   (COALESCE(gt.period_length, 20) * COALESCE(gt.periods_count, 3) * 60
                     + CASE WHEN g.end_type IN ('ot', 'so') THEN COALESCE(gt.ot_length, 5) * 60 ELSE 0 END) AS total_seconds
            FROM games g
            LEFT JOIN game_timers gt ON g.id = gt.game_id
            WHERE g.division_id = b.division_id AND g.status = 'finished' AND g.is_technical IS NULL
              AND (CASE WHEN g.stage_type = 'playoff' THEN 'playoff' ELSE 'regular' END) = 'regular'
          ),
          GoalsAbsTime AS (
            SELECT ge.id AS event_id, ge.game_id, ge.team_id AS scoring_team_id,
                   vg.home_team_id, vg.away_team_id, ge.time_seconds AS abs_time,
                   COALESCE(ge.from_shot, true) AS from_shot
            FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id
            WHERE ge.event_type = 'goal' AND ge.goal_strength <> 'ps'
          ),
          GoalToGoalie AS (
            SELECT DISTINCT ON (ga.event_id)
              ga.game_id, ga.from_shot,
              CASE WHEN ga.scoring_team_id = ga.home_team_id THEN gl.away_goalie_id ELSE gl.home_goalie_id END AS conceding_goalie_id
            FROM GoalsAbsTime ga
            JOIN game_goalie_log gl ON gl.game_id = ga.game_id AND gl.time_seconds <= ga.abs_time
            ORDER BY ga.event_id, gl.time_seconds DESC
          ),
          GoalieIntervals AS (
            SELECT gl.game_id, gl.home_goalie_id, gl.away_goalie_id, gl.time_seconds AS interval_start,
                   COALESCE(LEAD(gl.time_seconds) OVER (PARTITION BY gl.game_id ORDER BY gl.time_seconds), vg.total_seconds) AS interval_end
            FROM game_goalie_log gl JOIN ValidGames vg ON gl.game_id = vg.id
          ),
          GoalieCountPerSide AS (
            SELECT gl.game_id,
                   COUNT(DISTINCT gl.home_goalie_id) FILTER (WHERE gl.home_goalie_id IS NOT NULL) AS home_cnt,
                   COUNT(DISTINCT gl.away_goalie_id) FILTER (WHERE gl.away_goalie_id IS NOT NULL) AS away_cnt
            FROM game_goalie_log gl JOIN ValidGames vg ON vg.id = gl.game_id
            GROUP BY gl.game_id
          )
          SELECT
            (SELECT COUNT(DISTINCT gr.game_id) FROM game_rosters gr JOIN ValidGames vg ON gr.game_id = vg.id
              WHERE gr.player_id = $1 AND gr.team_id = b.team_id AND gr.is_in_lineup = true AND gr.position_in_line = 'G') AS gp,
            (SELECT COALESCE(SUM(ge.penalty_minutes), 0) FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id
              WHERE ge.event_type = 'penalty' AND ge.penalty_player_id = $1 AND ge.team_id = b.team_id) AS pim,
            (SELECT COUNT(*) FROM (
                SELECT ge.id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE ge.event_type = 'goal' AND ge.assist1_id = $1 AND ge.team_id = b.team_id
                UNION ALL
                SELECT ge.id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE ge.event_type = 'goal' AND ge.assist2_id = $1 AND ge.team_id = b.team_id
              ) sub) AS a,
            COALESCE((SELECT COUNT(*) FROM GoalToGoalie WHERE conceding_goalie_id = $1), 0) AS ga,
            GREATEST(
              COALESCE((SELECT SUM(gsb.shots_count) FROM game_shots_by_goalie gsb JOIN ValidGames vg ON gsb.game_id = vg.id WHERE gsb.goalie_id = $1), 0)
              - COALESCE((SELECT COUNT(*) FROM GoalToGoalie WHERE conceding_goalie_id = $1 AND from_shot = true), 0),
              0
            ) AS sv,
            COALESCE((SELECT SUM(gsb.shots_count) FROM game_shots_by_goalie gsb JOIN ValidGames vg ON gsb.game_id = vg.id WHERE gsb.goalie_id = $1), 0) AS sa,
            COALESCE((
              SELECT COUNT(DISTINCT gl.game_id) FROM game_goalie_log gl JOIN ValidGames vg ON gl.game_id = vg.id
              JOIN GoalieCountPerSide gc ON gc.game_id = gl.game_id
              WHERE (gl.home_goalie_id = $1 AND gc.home_cnt = 1 AND vg.away_score = 0)
                 OR (gl.away_goalie_id = $1 AND gc.away_cnt = 1 AND vg.home_score = 0)
            ), 0) AS sho,
            COALESCE((SELECT SUM(GREATEST(interval_end - interval_start, 0)) FROM GoalieIntervals WHERE home_goalie_id = $1 OR away_goalie_id = $1), 0) AS toi
        ) goalie_reg ON b.position = 'goalie'
        LEFT JOIN LATERAL (
          WITH ValidGames AS (
            SELECT g.id, g.home_team_id, g.away_team_id, g.home_score, g.away_score,
                   COALESCE(gt.period_length, 20) AS period_length,
                   COALESCE(gt.ot_length, 5) AS ot_length,
                   COALESCE(gt.periods_count, 3) AS periods_count,
                   (COALESCE(gt.period_length, 20) * COALESCE(gt.periods_count, 3) * 60
                     + CASE WHEN g.end_type IN ('ot', 'so') THEN COALESCE(gt.ot_length, 5) * 60 ELSE 0 END) AS total_seconds
            FROM games g
            LEFT JOIN game_timers gt ON g.id = gt.game_id
            WHERE g.division_id = b.division_id AND g.status = 'finished' AND g.is_technical IS NULL
              AND g.stage_type = 'playoff'
          ),
          GoalsAbsTime AS (
            SELECT ge.id AS event_id, ge.game_id, ge.team_id AS scoring_team_id,
                   vg.home_team_id, vg.away_team_id, ge.time_seconds AS abs_time,
                   COALESCE(ge.from_shot, true) AS from_shot
            FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id
            WHERE ge.event_type = 'goal' AND ge.goal_strength <> 'ps'
          ),
          GoalToGoalie AS (
            SELECT DISTINCT ON (ga.event_id)
              ga.game_id, ga.from_shot,
              CASE WHEN ga.scoring_team_id = ga.home_team_id THEN gl.away_goalie_id ELSE gl.home_goalie_id END AS conceding_goalie_id
            FROM GoalsAbsTime ga
            JOIN game_goalie_log gl ON gl.game_id = ga.game_id AND gl.time_seconds <= ga.abs_time
            ORDER BY ga.event_id, gl.time_seconds DESC
          ),
          GoalieIntervals AS (
            SELECT gl.game_id, gl.home_goalie_id, gl.away_goalie_id, gl.time_seconds AS interval_start,
                   COALESCE(LEAD(gl.time_seconds) OVER (PARTITION BY gl.game_id ORDER BY gl.time_seconds), vg.total_seconds) AS interval_end
            FROM game_goalie_log gl JOIN ValidGames vg ON gl.game_id = vg.id
          ),
          GoalieCountPerSide AS (
            SELECT gl.game_id,
                   COUNT(DISTINCT gl.home_goalie_id) FILTER (WHERE gl.home_goalie_id IS NOT NULL) AS home_cnt,
                   COUNT(DISTINCT gl.away_goalie_id) FILTER (WHERE gl.away_goalie_id IS NOT NULL) AS away_cnt
            FROM game_goalie_log gl JOIN ValidGames vg ON vg.id = gl.game_id
            GROUP BY gl.game_id
          )
          SELECT
            (SELECT COUNT(DISTINCT gr.game_id) FROM game_rosters gr JOIN ValidGames vg ON gr.game_id = vg.id
              WHERE gr.player_id = $1 AND gr.team_id = b.team_id AND gr.is_in_lineup = true AND gr.position_in_line = 'G') AS gp,
            (SELECT COALESCE(SUM(ge.penalty_minutes), 0) FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id
              WHERE ge.event_type = 'penalty' AND ge.penalty_player_id = $1 AND ge.team_id = b.team_id) AS pim,
            (SELECT COUNT(*) FROM (
                SELECT ge.id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE ge.event_type = 'goal' AND ge.assist1_id = $1 AND ge.team_id = b.team_id
                UNION ALL
                SELECT ge.id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE ge.event_type = 'goal' AND ge.assist2_id = $1 AND ge.team_id = b.team_id
              ) sub) AS a,
            COALESCE((SELECT COUNT(*) FROM GoalToGoalie WHERE conceding_goalie_id = $1), 0) AS ga,
            GREATEST(
              COALESCE((SELECT SUM(gsb.shots_count) FROM game_shots_by_goalie gsb JOIN ValidGames vg ON gsb.game_id = vg.id WHERE gsb.goalie_id = $1), 0)
              - COALESCE((SELECT COUNT(*) FROM GoalToGoalie WHERE conceding_goalie_id = $1 AND from_shot = true), 0),
              0
            ) AS sv,
            COALESCE((SELECT SUM(gsb.shots_count) FROM game_shots_by_goalie gsb JOIN ValidGames vg ON gsb.game_id = vg.id WHERE gsb.goalie_id = $1), 0) AS sa,
            COALESCE((
              SELECT COUNT(DISTINCT gl.game_id) FROM game_goalie_log gl JOIN ValidGames vg ON gl.game_id = vg.id
              JOIN GoalieCountPerSide gc ON gc.game_id = gl.game_id
              WHERE (gl.home_goalie_id = $1 AND gc.home_cnt = 1 AND vg.away_score = 0)
                 OR (gl.away_goalie_id = $1 AND gc.away_cnt = 1 AND vg.home_score = 0)
            ), 0) AS sho,
            COALESCE((SELECT SUM(GREATEST(interval_end - interval_start, 0)) FROM GoalieIntervals WHERE home_goalie_id = $1 OR away_goalie_id = $1), 0) AS toi
        ) goalie_po ON b.position = 'goalie'
      )
      SELECT
        season_name, is_current,
        league_name, league_full_name, league_logo, league_city,
        division_name, division_short_name, division_logo,
        team_name, team_name AS team_full_name, team_logo, team_city,
        position, qual_name, qual_full_name, qual_description,
        gp, g, a, pts, pm, pim, ga, sho, toi,
        sa, sv,
        -- Ведёт ли дивизион броски хотя бы на одной стадии: по нему фронт решает,
        -- показать цифру или прочерк в колонках БР/ОБ/%ОБ (0 там читался бы как результат)
        (COALESCE(reg_track_shots, false) OR COALESCE(playoff_track_shots, false)) AS tracks_shots,
        CASE WHEN sa > 0 THEN ROUND(sv::numeric / sa * 100, 2) ELSE 0.00 END AS svp,
        CASE WHEN toi > 0 THEN ROUND(ga::numeric / toi * norm_seconds, 2) ELSE 0.00 END AS gaa
      FROM agg
      WHERE gp > 0
      ORDER BY start_date DESC NULLS LAST
    `;

    const matchesQuery = `
      SELECT
        g.id as game_id,
        g.game_date,
        g.is_technical,
        g.end_type,
        s.name as season_name, 
        
        l.short_name as league_name, 
        l.name as league_full_name,
        l.logo_url as league_logo,
        l.city as league_city,
        
        d.name as division_name,
        d.short_name as division_short_name,
        d.logo_url as division_logo,
        g.stage_type,
        g.home_score, 
        g.away_score,
        g.home_team_id,
        g.away_team_id,
        
        t_home.short_name as home_team,
        t_home.name as home_team_full,
        t_home.logo_url as home_team_logo,
        t_home.city as home_team_city,
        
        t_away.short_name as away_team,
        t_away.name as away_team_full,
        t_away.logo_url as away_team_logo,
        t_away.city as away_team_city,
        
        gr.team_id as player_team_id,
        gr.position_in_line as position
      FROM game_rosters gr
      JOIN games g ON gr.game_id = g.id
      LEFT JOIN divisions d ON g.division_id = d.id
      LEFT JOIN seasons s ON d.season_id = s.id
      LEFT JOIN leagues l ON s.league_id = l.id
      JOIN teams t_home ON g.home_team_id = t_home.id
      LEFT JOIN teams t_away ON g.away_team_id = t_away.id
      WHERE gr.player_id = $1 AND g.status = 'finished'
      ORDER BY g.game_date DESC
    `;

    const [infoRes, statsRes, matchesRes] = await Promise.all([
      pool.query(infoQuery, [id]),
      pool.query(statsQuery, [id]),
      pool.query(matchesQuery, [id])
    ]);

    if (infoRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Игрок не найден' });
    }

    res.json({
      success: true,
      info: infoRes.rows[0],
      stats: statsRes.rows,
      matches: matchesRes.rows
    });
  } catch (err) {
    console.error('Ошибка профиля игрока:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};