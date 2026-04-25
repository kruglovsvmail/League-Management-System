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

    const statsQuery = `
      SELECT
        s.name as season_name, 
        s.is_active as is_current,
        
        l.short_name as league_name,
        l.name as league_full_name,
        l.logo_url as league_logo,
        l.city as league_city,
        
        d.name as division_name,
        
        t.name as team_name,
        t.name as team_full_name,
        t.logo_url as team_logo,
        t.city as team_city,
        
        tr.position,
        lq.short_name as qual_name,
        lq.name as qual_full_name,
        lq.description as qual_description,
        
        ps.games_played as gp, 
        ps.goals as g, 
        ps.assists as a, 
        ps.points as pts, 
        ps.plus_minus as pm, 
        ps.penalty_minutes as pim,
        ps.shots_against as sa, 
        ps.goals_against as ga, 
        ps.saves as sv, 
        ps.save_percent as svp
      FROM player_statistics ps
      JOIN tournament_rosters tr ON ps.tournament_roster_id = tr.id
      JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
      JOIN teams t ON tt.team_id = t.id
      JOIN divisions d ON tt.division_id = d.id
      JOIN seasons s ON d.season_id = s.id
      JOIN leagues l ON s.league_id = l.id
      LEFT JOIN league_qualifications lq ON tr.qualification_id = lq.id
      WHERE tr.player_id = $1
      ORDER BY s.start_date DESC
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