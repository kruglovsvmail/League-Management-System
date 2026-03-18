import pool from '../config/db.js';
import transporter from '../config/mail.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return res.status(401).json({ success: false, error: 'Отсутствует токен доступа' });
  }

  const secret = process.env.JWT_SECRET || 'dev_secret_key';

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Недействительный или просроченный токен' });
    }
    req.user = decoded; 
    next();
  });
};

export const lookupPhone = async (req, res) => {
  try {
    const { phone } = req.body;
    const result = await pool.query('SELECT first_name FROM users WHERE phone = $1', [phone]);

    if (result.rows.length > 0) {
      res.json({ success: true, firstName: result.rows[0].first_name });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const fetchUserProfile = async (userId) => {
  const userResult = await pool.query(
    'SELECT id, first_name, last_name, middle_name, email, phone, avatar_url, global_role, birth_date FROM users WHERE id = $1', 
    [userId]
  );

  if (userResult.rows.length === 0) return null;
  const user = userResult.rows[0];

  let leaguesResult;

  if (user.global_role === 'admin') {
    leaguesResult = await pool.query(`
      SELECT id, name, short_name, city, logo_url, 'admin' as role 
      FROM leagues
    `);
  } else {
    leaguesResult = await pool.query(`
      SELECT l.id, l.name, l.short_name, l.city, l.logo_url, string_agg(ls.role, ', ') as role
      FROM league_staff ls
      JOIN leagues l ON ls.league_id = l.id
      WHERE ls.user_id = $1 AND ls.end_date IS NULL
      GROUP BY l.id, l.name, l.short_name, l.city, l.logo_url
    `, [user.id]);
  }

  return { 
    id: user.id, 
    firstName: user.first_name, 
    lastName: user.last_name, 
    middleName: user.middle_name || '', 
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatar_url,
    birthDate: user.birth_date, 
    globalRole: user.global_role, 
    leagues: leaguesResult.rows
  };
};

export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    const result = await pool.query('SELECT id, password_hash FROM users WHERE phone = $1', [phone]);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password_hash || '');
      
      if (isMatch) {
        const userData = await fetchUserProfile(user.id);
        const secret = process.env.JWT_SECRET || 'dev_secret_key';
        const token = jwt.sign({ id: user.id }, secret, { expiresIn: '7d' });
        res.json({ success: true, user: userData, token });
      } else {
        res.status(401).json({ success: false, error: 'Неверный пароль' });
      }
    } else {
      res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const userId = req.user.id; 
    const userData = await fetchUserProfile(userId);
    if (!userData) return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    res.json({ success: true, user: userData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { email, phone, password, avatarUrl } = req.body;

    await pool.query(
      'UPDATE users SET email = $1, phone = $2, avatar_url = $3 WHERE id = $4',
      [email, phone, avatarUrl, userId]
    );

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);
    }

    res.json({ success: true, message: 'Профиль обновлен' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { phone, email } = req.body;
    const result = await pool.query('SELECT id, first_name FROM users WHERE phone = $1 AND email = $2', [phone, email]);

    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Пользователь с такими данными не найден' });
    }

    const user = result.rows[0];
    const newPassword = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, user.id]);

    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; background-color: #F8F9FA; padding: 40px 20px; color: #2C2C2E;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; padding: 40px 30px; border: 1px solid #E5E5EA; text-align: center;">
          <h2 style="margin-top: 0; font-size: 26px; color: #2C2C2E;">HockeyEco <span style="color: #FF7A00;">LMS</span></h2>
          <p style="text-align: left; margin-top: 30px;">Здравствуйте, <strong>${user.first_name}</strong>!</p>
          <p style="text-align: left;">Ваш новый код для входа:</p>
          <div style="margin: 30px 0; background-color: #FFF5EB; color: #FF7A00; font-size: 32px; font-weight: 800; padding: 15px; border-radius: 12px; border: 2px dashed #FF7A00; letter-spacing: 5px;">
            ${newPassword}
          </div>
          <p style="font-size: 12px; color: #8E8E93; margin-top: 30px;">С уважением, команда HockeyEco</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: '"HockeyEco LMS" <kruglov.svmail@yandex.ru>',
      to: email,
      subject: 'Ваш новый пароль | HockeyEco LMS',
      html: htmlTemplate
    });

    res.json({ success: true, message: 'Новый пароль отправлен на почту' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при отправке письма' });
  }
};

// ==========================================
// БЛОК ОХРАННИКОВ (СИСТЕМА ПРАВ RBAC)
// ==========================================

// Глобальный админ (Только для суперадминов)
export const requireGlobalAdmin = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRes = await pool.query('SELECT global_role FROM users WHERE id = $1', [userId]);
    if (userRes.rows[0]?.global_role === 'admin') return next();
    
    return res.status(403).json({ success: false, error: 'Доступ разрешен только глобальному администратору' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Ошибка проверки прав доступа' });
  }
};

const checkLeagueRoleHelper = async (req, res, next, leagueId, allowedRoles) => {
  const userId = req.user.id;
  const userRes = await pool.query('SELECT global_role FROM users WHERE id = $1', [userId]);
  if (userRes.rows[0]?.global_role === 'admin') return next(); // Суперадмин может всё

  const result = await pool.query(
    'SELECT role FROM league_staff WHERE user_id = $1 AND league_id = $2',
    [userId, leagueId]
  );
  
  const userRoles = result.rows.map(row => row.role);
  const hasAccess = userRoles.some(role => allowedRoles.includes(role));

  if (!hasAccess) {
    return res.status(403).json({ success: false, error: 'Отказано в доступе: недостаточно прав' });
  }
  next();
};

export const requireLeagueRole = (allowedRoles) => async (req, res, next) => {
  try {
    const { leagueId } = req.params;
    await checkLeagueRoleHelper(req, res, next, leagueId, allowedRoles);
  } catch (err) { res.status(500).json({ success: false, error: 'Ошибка проверки прав доступа' }); }
};

export const requireRoleBySeason = (allowedRoles) => async (req, res, next) => {
  try {
    const { seasonId } = req.params;
    const result = await pool.query('SELECT league_id FROM seasons WHERE id = $1', [seasonId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Сезон не найден' });
    await checkLeagueRoleHelper(req, res, next, result.rows[0].league_id, allowedRoles);
  } catch (err) { res.status(500).json({ success: false, error: 'Ошибка проверки прав' }); }
};

// Права на основе Division ID
export const requireRoleByDivision = (allowedRoles) => async (req, res, next) => {
  try {
    const divisionId = req.params.id || req.params.divisionId;
    const result = await pool.query(`
      SELECT s.league_id FROM divisions d
      JOIN seasons s ON d.season_id = s.id
      WHERE d.id = $1
    `, [divisionId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Дивизион не найден' });
    await checkLeagueRoleHelper(req, res, next, result.rows[0].league_id, allowedRoles);
  } catch (err) { res.status(500).json({ success: false, error: 'Ошибка проверки прав' }); }
};

export const requireRoleByTransfer = (allowedRoles) => async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT s.league_id FROM roster_requests rr
      JOIN divisions d ON rr.division_id = d.id
      JOIN seasons s ON d.season_id = s.id
      WHERE rr.id = $1
    `, [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Заявка не найдена' });
    await checkLeagueRoleHelper(req, res, next, result.rows[0].league_id, allowedRoles);
  } catch (err) { res.status(500).json({ success: false, error: 'Ошибка проверки прав' }); }
};

export const requireRoleForTransferCreate = (allowedRoles) => async (req, res, next) => {
  try {
    const { divisionId } = req.body;
    if (!divisionId) return res.status(400).json({ success: false, error: 'Не передан divisionId' });
    const result = await pool.query(`
      SELECT s.league_id FROM divisions d
      JOIN seasons s ON d.season_id = s.id
      WHERE d.id = $1
    `, [divisionId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Дивизион не найден' });
    await checkLeagueRoleHelper(req, res, next, result.rows[0].league_id, allowedRoles);
  } catch (err) { res.status(500).json({ success: false, error: 'Ошибка проверки прав' }); }
};

export const requireRoleByDisqualification = (allowedRoles) => async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT s.league_id FROM disqualifications d
      JOIN tournament_rosters tr ON d.tournament_roster_id = tr.id
      JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
      JOIN divisions div ON tt.division_id = div.id
      JOIN seasons s ON div.season_id = s.id
      WHERE d.id = $1
    `, [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Штраф не найден' });
    await checkLeagueRoleHelper(req, res, next, result.rows[0].league_id, allowedRoles);
  } catch (err) { res.status(500).json({ success: false, error: 'Ошибка проверки прав' }); }
};

export const requireRoleForDisqualificationCreate = (allowedRoles) => async (req, res, next) => {
  try {
    const { tournament_roster_id } = req.body;
    if (!tournament_roster_id) return res.status(400).json({ success: false, error: 'Не передан tournament_roster_id' });
    const result = await pool.query(`
      SELECT s.league_id FROM tournament_rosters tr
      JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
      JOIN divisions div ON tt.division_id = div.id
      JOIN seasons s ON div.season_id = s.id
      WHERE tr.id = $1
    `, [tournament_roster_id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Заявка игрока не найдена' });
    await checkLeagueRoleHelper(req, res, next, result.rows[0].league_id, allowedRoles);
  } catch (err) { res.status(500).json({ success: false, error: 'Ошибка проверки прав' }); }
};

export const requireRoleByGame = (allowedRoles) => async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const result = await pool.query(`
      SELECT s.league_id 
      FROM games g
      JOIN divisions d ON g.division_id = d.id
      JOIN seasons s ON d.season_id = s.id
      WHERE g.id = $1
    `, [gameId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });
    await checkLeagueRoleHelper(req, res, next, result.rows[0].league_id, allowedRoles);
  } catch (err) { res.status(500).json({ success: false, error: 'Ошибка проверки прав' }); }
};

// ОХРАННИК: Статус матча (Админы лиги + ДЕЙСТВУЮЩИЕ Главные судьи + Секретарь)
export const requireGameStatusAccess = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRes = await pool.query('SELECT global_role FROM users WHERE id = $1', [userId]);
    if (userRes.rows[0]?.global_role === 'admin') return next();

    const { gameId } = req.params;

    // 1. Узнаем лигу матча
    const leagueRes = await pool.query(`
        SELECT s.league_id 
        FROM games g
        JOIN divisions d ON g.division_id = d.id
        JOIN seasons s ON d.season_id = s.id
        WHERE g.id = $1
    `, [gameId]);

    if (leagueRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });
    const leagueId = leagueRes.rows[0].league_id;

    // 2. Получаем АКТИВНЫЕ роли юзера в этой лиге (где end_date IS NULL)
    const staffRes = await pool.query(`
        SELECT role FROM league_staff
        WHERE user_id = $1 AND league_id = $2 AND end_date IS NULL
    `, [userId, leagueId]);

    const userRoles = staffRes.rows.map(r => r.role);

    // 3. Если он админ или менеджер лиги — пускаем сразу
    if (userRoles.includes('top_manager') || userRoles.includes('league_admin')) {
        return next();
    }

    // 4. ЗАЩИТА: Если он ДЕЙСТВУЮЩИЙ судья в этой лиге, только тогда проверяем назначение на матч
    if (userRoles.includes('referee')) {
        const refRes = await pool.query(`
            SELECT 1 FROM game_referee 
            WHERE game_id = $1 AND user_id = $2 AND role IN ('head_1', 'head_2', 'scorekeeper')
        `, [gameId, userId]);

        if (refRes.rows.length > 0) return next();
    }

    return res.status(403).json({ success: false, error: 'Доступ запрещен. Вы не являетесь действующим администратором или судьей.' });
  } catch (err) {
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// ОХРАННИК: Протокол и Ростеры (Админы лиги + ДЕЙСТВУЮЩИЙ Секретарь)
export const requireGameProtocolAccess = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRes = await pool.query('SELECT global_role FROM users WHERE id = $1', [userId]);
    if (userRes.rows[0]?.global_role === 'admin') return next();

    const { gameId } = req.params;

    // 1. Узнаем лигу матча
    const leagueRes = await pool.query(`
        SELECT s.league_id 
        FROM games g
        JOIN divisions d ON g.division_id = d.id
        JOIN seasons s ON d.season_id = s.id
        WHERE g.id = $1
    `, [gameId]);

    if (leagueRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });
    const leagueId = leagueRes.rows[0].league_id;

    // 2. Получаем АКТИВНЫЕ роли юзера в этой лиге
    const staffRes = await pool.query(`
        SELECT role FROM league_staff
        WHERE user_id = $1 AND league_id = $2 AND end_date IS NULL
    `, [userId, leagueId]);

    const userRoles = staffRes.rows.map(r => r.role);

    // 3. Менеджеров и админов пускаем
    if (userRoles.includes('top_manager') || userRoles.includes('league_admin')) {
        return next();
    }

    // 4. ЗАЩИТА: Только если он ДЕЙСТВУЮЩИЙ судья, проверяем, секретарь ли он на этом матче
    if (userRoles.includes('referee')) {
        const refRes = await pool.query(`
            SELECT 1 FROM game_referee 
            WHERE game_id = $1 AND user_id = $2 AND role = 'scorekeeper'
        `, [gameId, userId]);

        if (refRes.rows.length > 0) return next();
    }

    return res.status(403).json({ success: false, error: 'Доступ к ведению протокола запрещен.' });
  } catch (err) {
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// ОХРАННИК: Права на основе Tournament Team ID
export const requireRoleByTournamentTeam = (allowedRoles) => async (req, res, next) => {
  try {
    const teamId = req.params.id;
    const result = await pool.query(`
      SELECT s.league_id FROM tournament_teams tt
      JOIN divisions d ON tt.division_id = d.id
      JOIN seasons s ON d.season_id = s.id
      WHERE tt.id = $1
    `, [teamId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Команда турнира не найдена' });
    await checkLeagueRoleHelper(req, res, next, result.rows[0].league_id, allowedRoles);
  } catch (err) { res.status(500).json({ success: false, error: 'Ошибка проверки прав' }); }
};

// ОХРАННИК: Права на основе Tournament Roster ID
export const requireRoleByTournamentRoster = (allowedRoles) => async (req, res, next) => {
  try {
    const rosterId = req.params.id;
    const result = await pool.query(`
      SELECT s.league_id FROM tournament_rosters tr
      JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
      JOIN divisions d ON tt.division_id = d.id
      JOIN seasons s ON d.season_id = s.id
      WHERE tr.id = $1
    `, [rosterId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Игрок в заявке не найден' });
    await checkLeagueRoleHelper(req, res, next, result.rows[0].league_id, allowedRoles);
  } catch (err) { res.status(500).json({ success: false, error: 'Ошибка проверки прав' }); }
};