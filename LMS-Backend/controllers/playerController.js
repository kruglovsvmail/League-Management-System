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

    // Статистика игрока — агрегат боксскора player_game_statistics. ОДНА строка на
    // дивизион: сумма regular+playoff (по явному решению пользователя, раньше стадии
    // показывались раздельно). Стадии всё равно считаются отдельными парами LATERAL —
    // не ради вывода, а ради маскирования: флаги лиги у регулярки и плей-офф свои.
    //
    // Маскирование: если у дивизиона на конкретной стадии выключен track_plus_minus /
    // track_shots, вклад ЭТОЙ стадии в сумму = 0 (не "—" на всю сумму, а именно 0).
    //
    // Коэффициент надёжности (КН) не считается: показатель убран из системы целиком.
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
        -- Четыре выборки из боксскора player_game_statistics: полевые и вратарские
        -- показатели, каждая — по своей стадии. Раньше здесь было около 190 строк
        -- SQL с CTE по game_events, game_plus_minus, game_goalie_log и
        -- game_shots_by_goalie, которые пересчитывались при каждом открытии профиля.
        --
        -- Область — заявка игрока на турнир (b.tournament_roster_id): пара
        -- «игрок + команда» в конкретном дивизионе, как и в прежнем расчёте.
        -- Регулярка = всё, что не плей-офф: групповые этапы дивизиона раньше
        -- сваливались туда же через CASE ... ELSE 'regular'.
        LEFT JOIN LATERAL (
          -- Полевые показатели: регулярка (и групповые этапы)
          SELECT
            COUNT(*) FILTER (WHERE NOT pgs.is_goalie)::int AS gp,
            COALESCE(SUM(pgs.goals), 0)::int               AS g,
            COALESCE(SUM(pgs.assists), 0)::int             AS a,
            COALESCE(SUM(pgs.penalty_minutes), 0)::int     AS pim,
            COALESCE(SUM(pgs.plus_minus), 0)::int          AS pm
          FROM player_game_statistics pgs
          WHERE pgs.tournament_roster_id = b.tournament_roster_id
            AND pgs.stage_type <> 'playoff'
        ) skater_reg ON b.position != 'goalie'
        LEFT JOIN LATERAL (
          -- Полевые показатели: плей-офф
          SELECT
            COUNT(*) FILTER (WHERE NOT pgs.is_goalie)::int AS gp,
            COALESCE(SUM(pgs.goals), 0)::int               AS g,
            COALESCE(SUM(pgs.assists), 0)::int             AS a,
            COALESCE(SUM(pgs.penalty_minutes), 0)::int     AS pim,
            COALESCE(SUM(pgs.plus_minus), 0)::int          AS pm
          FROM player_game_statistics pgs
          WHERE pgs.tournament_roster_id = b.tournament_roster_id
            AND pgs.stage_type = 'playoff'
        ) skater_po ON b.position != 'goalie'
        LEFT JOIN LATERAL (
          -- Вратарские показатели: регулярка (и групповые этапы)
          SELECT
            -- Матчи вратаря — только те, где он реально стоял в воротах
            COUNT(*) FILTER (WHERE pgs.is_goalie)::int          AS gp,
            COALESCE(SUM(pgs.penalty_minutes), 0)::int          AS pim,
            COALESCE(SUM(pgs.assists), 0)::int                  AS a,
            COALESCE(SUM(pgs.goalie_goals_against), 0)::int     AS ga,
            COALESCE(SUM(pgs.goalie_saves), 0)::int             AS sv,
            COALESCE(SUM(pgs.goalie_shots_against), 0)::int     AS sa,
            COUNT(*) FILTER (WHERE pgs.goalie_shutout)::int     AS sho,
            COALESCE(SUM(pgs.goalie_seconds), 0)::int           AS toi
          FROM player_game_statistics pgs
          WHERE pgs.tournament_roster_id = b.tournament_roster_id
            AND pgs.stage_type <> 'playoff'
        ) goalie_reg ON b.position = 'goalie'
        LEFT JOIN LATERAL (
          -- Вратарские показатели: плей-офф
          SELECT
            -- Матчи вратаря — только те, где он реально стоял в воротах
            COUNT(*) FILTER (WHERE pgs.is_goalie)::int          AS gp,
            COALESCE(SUM(pgs.penalty_minutes), 0)::int          AS pim,
            COALESCE(SUM(pgs.assists), 0)::int                  AS a,
            COALESCE(SUM(pgs.goalie_goals_against), 0)::int     AS ga,
            COALESCE(SUM(pgs.goalie_saves), 0)::int             AS sv,
            COALESCE(SUM(pgs.goalie_shots_against), 0)::int     AS sa,
            COUNT(*) FILTER (WHERE pgs.goalie_shutout)::int     AS sho,
            COALESCE(SUM(pgs.goalie_seconds), 0)::int           AS toi
          FROM player_game_statistics pgs
          WHERE pgs.tournament_roster_id = b.tournament_roster_id
            AND pgs.stage_type = 'playoff'
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
        CASE WHEN sa > 0 THEN ROUND(sv::numeric / sa * 100, 2) ELSE 0.00 END AS svp
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