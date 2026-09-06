import pool from '../config/db.js';

export const getUsers = async (req, res) => {
  try {
    // Получаем параметры для пагинации и поиска с фронта
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    // Фильтр по команде: вводится название (или аббревиатура) — выдаём весь её состав.
    // Работает вместе с поиском по ФИО, а не вместо него.
    const teamSearch = req.query.team || '';
    // Квалификация лиговая, а справочник — общий по системе. Поэтому колонка показывает
    // квалификацию в ТЕКУЩЕЙ выбранной лиге: её id фронт передаёт параметром. Без него
    // (или у человека из чужой лиги) в колонке просто прочерк.
    const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;

    // Справочник — это люди из команд. Сотрудники лиги, судьи и служебные аккаунты
    // членства в team_members не имеют и в выдачу не попадают.
    // Членство засчитываем любое, в том числе прошлое (left_at IS NOT NULL): ушедший
    // из команды игрок остаётся в справочнике вместе со своим профилем и историей.
    let whereCondition = `WHERE EXISTS (SELECT 1 FROM team_members tm_any WHERE tm_any.user_id = u.id)`;
    let params = [limit, offset, leagueId];

    if (search) {
      // Ищем по имени, фамилии или отчеству
      params.push(`%${search}%`);
      whereCondition += ` AND (u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length} OR u.middle_name ILIKE $${params.length})`;
    }

    if (teamSearch) {
      // Только действующее членство (left_at IS NULL): фильтр должен совпадать с колонкой
      // «Команды», где показаны текущие команды человека. Иначе по названию находились бы
      // те, кто ушёл из команды год назад и её логотипа в строке уже не имеет.
      params.push(`%${teamSearch}%`);
      whereCondition += ` AND EXISTS (
          SELECT 1 FROM team_members tm_f
          JOIN teams t_f ON t_f.id = tm_f.team_id
          WHERE tm_f.user_id = u.id AND tm_f.left_at IS NULL
            AND (t_f.name ILIKE $${params.length} OR t_f.short_name ILIKE $${params.length})
      )`;
    }

    // current_teams — команды, в которых пользователь числится прямо сейчас
    // (team_members без left_at), может быть несколько — для колонки логотипов
    const result = await pool.query(`
      SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.middle_name,
          u.birth_date,
          u.avatar_url as user_avatar,
          tm_latest.photo_url as tm_photo_url,
          (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'city', t.city, 'logo_url', t.logo_url) ORDER BY t.name)
           FROM team_members tm
           JOIN teams t ON t.id = tm.team_id
           WHERE tm.user_id = u.id AND tm.left_at IS NULL) as current_teams,
          (SELECT json_build_object('id', lq.id, 'name', lq.name, 'short_name', lq.short_name, 'description', lq.description)
           FROM user_qualifications uq
           JOIN league_qualifications lq ON lq.id = uq.qualification_id
           WHERE uq.user_id = u.id AND uq.league_id = $3::int AND uq.ended_at IS NULL) as qualification
      FROM users u
      LEFT JOIN (
          SELECT DISTINCT ON (user_id) user_id, photo_url
          FROM team_members WHERE photo_url IS NOT NULL ORDER BY user_id, id DESC
      ) tm_latest ON tm_latest.user_id = u.id
      ${whereCondition}
      ORDER BY u.last_name, u.first_name
      LIMIT $1 OFFSET $2
    `, params);

    res.json({ success: true, data: result.rows, hasMore: result.rows.length === limit });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Не удалось загрузить пользователей' });
  }
};

export const getTeams = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let searchCondition = '';
    let params = [limit, offset];
    if (search) {
      searchCondition = `WHERE t.name ILIKE $3 OR t.city ILIKE $3`;
      params.push(`%${search}%`);
    }

    const result = await pool.query(`
      SELECT 
          t.id, t.name, t.short_name, t.city, t.logo_url, t.description,
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
      ${searchCondition}
      ORDER BY t.name
      LIMIT $1 OFFSET $2
    `, params);
    
    res.json({ success: true, data: result.rows, hasMore: result.rows.length === limit });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Не удалось загрузить команды' });
  }
};

export const getArenas = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let searchCondition = '';
    let params = [limit, offset];
    if (search) {
      searchCondition = `WHERE name ILIKE $3 OR city ILIKE $3`;
      params.push(`%${search}%`);
    }

    const result = await pool.query(`SELECT * FROM arenas ${searchCondition} ORDER BY name LIMIT $1 OFFSET $2`, params);
    res.json({ success: true, data: result.rows, hasMore: result.rows.length === limit });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Не удалось загрузить арены' });
  }
};