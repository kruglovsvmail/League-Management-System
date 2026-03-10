import pool from '../config/db.js';

export const getUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
          u.id, 
          u.first_name, 
          u.last_name, 
          u.middle_name, 
          u.birth_date, 
          u.avatar_url as user_avatar,
          (
              SELECT tm.photo_url 
              FROM team_members tm 
              WHERE tm.user_id = u.id AND tm.photo_url IS NOT NULL 
              ORDER BY tm.id DESC LIMIT 1
          ) as tm_photo_url,
          last_game_team.logo_url as last_team_logo,
          last_game_team.name as last_team_name,
          last_game_team.city as last_team_city
      FROM users u
      LEFT JOIN LATERAL (
          SELECT t.logo_url, t.name, t.city
          FROM game_rosters gr
          JOIN games g ON g.id = gr.game_id
          JOIN teams t ON t.id = gr.team_id
          WHERE gr.player_id = u.id AND g.status = 'finished'
          ORDER BY g.game_date DESC NULLS LAST
          LIMIT 1
      ) last_game_team ON true
      ORDER BY u.last_name, u.first_name
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Ошибка при получении пользователей:', error);
    res.status(500).json({ success: false, error: 'Не удалось загрузить пользователей' });
  }
};

export const getTeams = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
          t.id, t.logo_url, t.name, t.short_name, t.city,
          COALESCE(ts.official_games_played, 0) as official_games_played, 
          COALESCE(ts.official_wins, 0) as official_wins, 
          COALESCE(ts.official_draws, 0) as official_draws, 
          COALESCE(ts.official_losses, 0) as official_losses, 
          COALESCE(ts.official_goals_for, 0) as official_goals_for, 
          COALESCE(ts.official_goals_against, 0) as official_goals_against,
          COALESCE(ts.friendly_games_played, 0) as friendly_games_played, 
          COALESCE(ts.friendly_wins, 0) as friendly_wins, 
          COALESCE(ts.friendly_draws, 0) as friendly_draws, 
          COALESCE(ts.friendly_losses, 0) as friendly_losses, 
          COALESCE(ts.friendly_goals_for, 0) as friendly_goals_for, 
          COALESCE(ts.friendly_goals_against, 0) as friendly_goals_against
      FROM teams t
      LEFT JOIN team_statistics ts ON ts.team_id = t.id
      ORDER BY t.name
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Ошибка при получении команд:', error);
    res.status(500).json({ success: false, error: 'Не удалось загрузить команды' });
  }
};

export const getArenas = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, city, address, status 
      FROM arenas 
      WHERE status = 'active'
      ORDER BY name
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Ошибка при получении арен:', error);
    res.status(500).json({ success: false, error: 'Не удалось загрузить арены' });
  }
};