import pool from '../config/db.js';
import transporter from '../config/mail.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PERMISSIONS, ROLES } from '../utils/permissions.js';

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
    'SELECT id, first_name, last_name, middle_name, email, phone, avatar_url, global_role, birth_date, sign_pin_hash FROM users WHERE id = $1', 
    [userId]
  );

  if (userResult.rows.length === 0) return null;
  const user = userResult.rows[0];

  let leaguesResult;

  if (user.global_role === ROLES.GLOBAL_ADMIN) {
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
    hasSignPin: !!user.sign_pin_hash, // Флаг для фронтенда: установлен ли PIN-код ЭЦП
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
    // Добавили прием signPin из фронтенда
    const { email, phone, password, avatarUrl, signPin } = req.body;

    await pool.query(
      'UPDATE users SET email = $1, phone = $2, avatar_url = $3 WHERE id = $4',
      [email, phone, avatarUrl, userId]
    );

    // Обновление пароля
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);
    }

    // Обновление PIN-кода для ЭЦП
    if (signPin) {
      const hashedPin = await bcrypt.hash(signPin, 10);
      await pool.query('UPDATE users SET sign_pin_hash = $1 WHERE id = $2', [hashedPin, userId]);
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

/**
 * Вспомогательная функция для извлечения ID лиги из различных параметров маршрута
 * Эта функция является "определителем контекста" для запроса.
 */
const getLeagueIdFromContext = async (req) => {
  // Прямая передача leagueId в параметрах или теле
  if (req.params.leagueId) return req.params.leagueId;
  if (req.body.leagueId) return req.body.leagueId;

  // Извлечение через seasonId
  if (req.params.seasonId || req.body.seasonId) {
    const id = req.params.seasonId || req.body.seasonId;
    const res = await pool.query('SELECT league_id FROM seasons WHERE id = $1', [id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  // Извлечение через divisionId (или просто id, если это маршрут дивизиона)
  if (req.params.divisionId || req.body.divisionId || (req.baseUrl.includes('/divisions') && req.params.id)) {
    const id = req.params.divisionId || req.body.divisionId || req.params.id;
    const res = await pool.query(`
      SELECT s.league_id FROM divisions d
      JOIN seasons s ON d.season_id = s.id
      WHERE d.id = $1
    `, [id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  // Извлечение через gameId
  if (req.params.gameId || req.body.gameId) {
    const id = req.params.gameId || req.body.gameId;
    const res = await pool.query(`
      SELECT s.league_id FROM games g
      JOIN divisions d ON g.division_id = d.id
      JOIN seasons s ON d.season_id = s.id
      WHERE g.id = $1
    `, [id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  // Извлечение через transfer_id (заявка на трансфер)
  if (req.baseUrl.includes('/transfers') && req.params.id) {
    const res = await pool.query(`
      SELECT s.league_id FROM roster_requests rr
      JOIN divisions d ON rr.division_id = d.id
      JOIN seasons s ON d.season_id = s.id
      WHERE rr.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }
  
  // Извлечение через ID заявки игрока на турнир (tournament_rosters)
  if (req.body.tournament_roster_id || (req.baseUrl.includes('/tournament-rosters') && req.params.id)) {
    const id = req.body.tournament_roster_id || req.params.id;
    const res = await pool.query(`
      SELECT s.league_id FROM tournament_rosters tr
      JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
      JOIN divisions div ON tt.division_id = div.id
      JOIN seasons s ON div.season_id = s.id
      WHERE tr.id = $1
    `, [id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }
  
  // Извлечение через id дисквалификации
  if (req.baseUrl.includes('/disqualifications') && req.params.id) {
     const res = await pool.query(`
      SELECT s.league_id FROM disqualifications d
      JOIN tournament_rosters tr ON d.tournament_roster_id = tr.id
      JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
      JOIN divisions div ON tt.division_id = div.id
      JOIN seasons s ON div.season_id = s.id
      WHERE d.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  // Извлечение через команду турнира (tournament_teams)
  if (req.baseUrl.includes('/tournament-teams') && req.params.id) {
    const res = await pool.query(`
      SELECT s.league_id FROM tournament_teams tt
      JOIN divisions d ON tt.division_id = d.id
      JOIN seasons s ON d.season_id = s.id
      WHERE tt.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  return null;
};

/**
 * Универсальный Middleware для проверки прав (RBAC)
 * @param {string} permissionKey Ключ из PERMISSIONS (например, 'DIVISIONS_DELETE')
 */
export const requirePermission = (permissionKey) => async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // 1. Проверка на Глобального Администратора (Абсолютный доступ ко всему)
    const userRes = await pool.query('SELECT global_role FROM users WHERE id = $1', [userId]);
    if (userRes.rows[0]?.global_role === ROLES.GLOBAL_ADMIN) {
      return next();
    }

    // 2. Получаем список разрешенных ролей для данного действия
    const allowedRoles = PERMISSIONS[permissionKey];

    // Если массив allowedRoles пустой, значит доступ разрешен ТОЛЬКО глобальному админу
    if (!allowedRoles || allowedRoles.length === 0) {
      return res.status(403).json({ success: false, error: 'Доступ разрешен только глобальному администратору' });
    }

    // 3. Определяем контекст лиги для текущего запроса
    const leagueId = await getLeagueIdFromContext(req);
    
    if (!leagueId) {
      console.warn(`[RBAC] Не удалось определить leagueId для маршрута: ${req.originalUrl}`);
      return res.status(400).json({ success: false, error: 'Невозможно определить контекст лиги для проверки прав' });
    }

    // 4. Собираем все роли пользователя в текущей лиге
    let userRoles = [];

    // 4a. Роли из штата лиги (league_staff)
    const staffRes = await pool.query(
      'SELECT role FROM league_staff WHERE user_id = $1 AND league_id = $2 AND end_date IS NULL',
      [userId, leagueId]
    );
    userRoles = staffRes.rows.map(row => row.role);

    // 4b. Роли из конкретного матча (game_referee, game_media), если в контексте есть gameId
    const gameId = req.params.gameId || req.body.gameId;
    if (gameId) {
      // Ищем роли в game_referee
      const refRes = await pool.query(
        'SELECT role FROM game_referee WHERE game_id = $1 AND user_id = $2',
        [gameId, userId]
      );
      
      // ИСПРАВЛЕННЫЙ МАППИНГ: Переводим роли из БД в системные константы
      refRes.rows.forEach(r => {
        if (['head_1', 'head_2'].includes(r.role)) userRoles.push(ROLES.GAME_HEAD);
        if (['linesman_1', 'linesman_2'].includes(r.role)) userRoles.push(ROLES.GAME_LINESMAN);
        if (r.role === 'scorekeeper') userRoles.push(ROLES.GAME_SECRETARY);
      });

      // Ищем роли в game_media
      const mediaRes = await pool.query(
        'SELECT id FROM game_media WHERE game_id = $1 AND user_id = $2',
        [gameId, userId]
      );
      if (mediaRes.rows.length > 0) {
        userRoles.push(ROLES.GAME_MEDIA);
      }
    }

    // 5. Проверка пересечения имеющихся ролей с разрешенными
    const hasAccess = userRoles.some(role => allowedRoles.includes(role));

    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Отказано в доступе: недостаточно прав' });
    }

    // Доступ разрешен
    next();
  } catch (err) {
    console.error('[RBAC Error]:', err);
    res.status(500).json({ success: false, error: 'Системная ошибка проверки прав доступа' });
  }
};