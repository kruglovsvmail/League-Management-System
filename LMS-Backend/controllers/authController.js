import pool from '../config/db.js';
import transporter from '../config/mail.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PERMISSIONS, ROLES } from '../utils/permissions.js';
import { generateTempPassword, validatePassword } from '../utils/password.js';
import { checkLoginAllowed, recordLoginFailure, clearLoginFailures, getRequestIp } from '../utils/loginGuard.js';

// Текст отказа для тех, кто не числится ни в одной лиге. Вынесен в константу, потому
// что используется и при входе, и на всех трёх шагах активации аккаунта.
const NO_LEAGUE_ACCESS_ERROR =
  'Доступ запрещён. Вы не числитесь сотрудником ни одной лиги. Если вы уверены в обратном — обратитесь к администратору лиги.';

/**
 * Право работать в LMS: незакрытая запись в штате хотя бы одной лиги либо глобальный
 * админ платформы. Сервисные аккаунты сюда не попадают — они проверяются отдельной
 * веткой по league_service_accounts.
 *
 * Тот же принцип, что и в Team-Room: там вход требует членства в команде/клубе. Без
 * этой проверки любой виртуальный игрок из глобального реестра (а их там сотни) мог бы
 * завести себе вход в админку лиги и попасть в систему с пустым списком лиг.
 */
const hasLeagueAccess = async (userId, globalRole) => {
  if (globalRole === ROLES.GLOBAL_ADMIN) return true;
  const result = await pool.query(
    `SELECT 1 FROM league_staff WHERE user_id = $1 AND end_date IS NULL LIMIT 1`,
    [userId]
  );
  return result.rows.length > 0;
};

// last_seen_at намеренно НЕ обновляется отсюда: эта колонка используется в метриках
// как "последний визит в Team-Room", и активность в LMS-админке не должна туда попадать
// (иначе админ, просто открывший эту страницу метрик, всплывал бы наверх списка).
// Обновляет last_seen_at только Team-Room\TR-Backend\middleware\auth.js.
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

export const lookupLogin = async (req, res) => {
  try {
    const { login } = req.body;
    const result = await pool.query('SELECT name FROM league_service_accounts WHERE login = $1 AND is_active = true', [login]);

    if (result.rows.length > 0) {
      res.json({ success: true, firstName: result.rows[0].name });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const fetchUserProfile = async (userId) => {
  const userResult = await pool.query(
    'SELECT id, first_name, last_name, middle_name, email, phone, avatar_url, global_role, birth_date, sign_pin_hash, lms_sidebar_layout FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) return null;
  const user = userResult.rows[0];

  // ЕСЛИ ЭТО СЕРВИСНЫЙ (ТЕНЕВОЙ) АККАУНТ
  if (user.global_role === 'service') {
    const saResult = await pool.query(`
      SELECT lsa.id, lsa.league_id, lsa.account_type, lsa.name, lsa.photo_url,
             l.name as league_name, l.short_name as league_short, l.city as league_city, l.logo_url as league_logo,
             l.sec_access_before_hours, l.sec_access_after_hours
      FROM league_service_accounts lsa
      JOIN leagues l ON lsa.league_id = l.id
      WHERE lsa.user_id = $1 AND lsa.is_active = true
    `, [user.id]);

    if (saResult.rows.length === 0) return null;

    const sa = saResult.rows[0];
    return {
      id: user.id,
      isServiceAccount: true,
      firstName: sa.name,
      lastName: '',
      middleName: '',
      email: user.email,
      phone: '',
      avatarUrl: sa.photo_url,
      birthDate: null,
      globalRole: 'service',
      hasSignPin: false,
      leagues: [{
        id: sa.league_id,
        name: sa.league_name,
        short_name: sa.league_short,
        city: sa.league_city,
        logo_url: sa.league_logo,
        role: `service_${sa.account_type}`,
        sec_access_before_hours: sa.sec_access_before_hours,
        sec_access_after_hours: sa.sec_access_after_hours
      }]
    };
  }

  // ОБЫЧНЫЙ ПОЛЬЗОВАТЕЛЬ
  let leaguesResult;
  if (user.global_role === ROLES.GLOBAL_ADMIN) {
    leaguesResult = await pool.query(`
      SELECT id, name, short_name, city, logo_url, 'admin' as role,
             sec_access_before_hours, sec_access_after_hours, disqualification_mode,
             reserve_goalies_enabled, reserve_goalie_dq_games_enabled, reserve_goalie_own_dq_blocks
      FROM leagues
    `);
  } else {
    leaguesResult = await pool.query(`
      SELECT l.id, l.name, l.short_name, l.city, l.logo_url,
             l.sec_access_before_hours, l.sec_access_after_hours, l.disqualification_mode,
             l.reserve_goalies_enabled, l.reserve_goalie_dq_games_enabled, l.reserve_goalie_own_dq_blocks,
             string_agg(ls.role, ', ') as role
      FROM league_staff ls
      JOIN leagues l ON ls.league_id = l.id
      WHERE ls.user_id = $1 AND ls.end_date IS NULL
      GROUP BY l.id, l.name, l.short_name, l.city, l.logo_url, l.sec_access_before_hours, l.sec_access_after_hours, l.disqualification_mode,
               l.reserve_goalies_enabled, l.reserve_goalie_dq_games_enabled, l.reserve_goalie_own_dq_blocks
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
    hasSignPin: !!user.sign_pin_hash,
    // Раскладка бокового меню под себя: порядок пунктов, скрытые пункты и разделители.
    // null — пользователь ничего не настраивал, фронт покажет порядок по умолчанию.
    sidebarLayout: user.lms_sidebar_layout || null,
    leagues: leaguesResult.rows
  };
};

export const login = async (req, res) => {
  try {
    const { phone, login: serviceLogin, password } = req.body;
    let user;
    let isMatch = false;

    // Лимит проверяем ДО обращения к базе и bcrypt: ограничение защищает не только от
    // подбора пароля, но и от того, чтобы перебор съедал процессор контейнера на
    // хешировании. Сервисные аккаунты считаем по их логину — номера у них нет.
    const guardKey = serviceLogin ? `service:${serviceLogin}` : phone;
    const requestIp = getRequestIp(req);
    if (guardKey) {
      const guard = await checkLoginAllowed(guardKey, requestIp);
      if (!guard.allowed) {
        return res.status(429).json({ success: false, error: guard.error });
      }
    }

    if (serviceLogin) {
      const result = await pool.query(`
        SELECT lsa.user_id as id, lsa.password_hash, lsa.is_active
        FROM league_service_accounts lsa
        WHERE lsa.login = $1
      `, [serviceLogin]);

      if (result.rows.length > 0) {
        if (!result.rows[0].is_active) {
           return res.status(403).json({ success: false, error: 'Сервисный аккаунт деактивирован' });
        }
        user = result.rows[0];
        isMatch = await bcrypt.compare(password, user.password_hash || '');
      }
    } else if (phone) {
      const result = await pool.query(
        'SELECT id, password_hash, virtual_code, status, global_role FROM users WHERE phone = $1',
        [phone]
      );
      if (result.rows.length > 0) {
        user = result.rows[0];

        // Развёрнутые объяснения возвращаем парой error + message: фронт по наличию
        // message понимает, что текст длинный и его надо показать отдельным блоком,
        // а не однострочной подписью под полями
        if (user.status !== 'active') {
          return res.status(403).json({
            success: false,
            error: 'ACCOUNT_BLOCKED',
            message: 'Аккаунт заблокирован. Обратитесь к администратору лиги.'
          });
        }

        // Аккаунт заведён (или переведён обратно) как виртуальный: пароля нет, есть
        // секретный код. Вместо «неверных учётных данных» объясняем, что делать.
        if (!user.password_hash && user.virtual_code) {
          return res.status(403).json({
            success: false,
            error: 'ACCOUNT_RESET',
            message: 'Ваш аккаунт заведён как виртуальный или был переведён в виртуальный. Нажмите «Активировать аккаунт» и возьмите у администратора лиги актуальный секретный код от этого аккаунта.'
          });
        }

        if (!(await hasLeagueAccess(user.id, user.global_role))) {
          return res.status(403).json({ success: false, error: 'ACCESS_DENIED', message: NO_LEAGUE_ACCESS_ERROR });
        }

        isMatch = await bcrypt.compare(password, user.password_hash || '');
      }
    }

    if (user && isMatch) {
      // Снятие статуса «виртуальный» после первого успешного входа активированного
      // аккаунта — ровно как в Team-Room. Пока код жив, им можно переактивировать
      // аккаунт на чужую почту и пароль.
      if (!serviceLogin && user.virtual_code) {
        await pool.query('UPDATE users SET virtual_code = NULL WHERE id = $1 AND virtual_code IS NOT NULL', [user.id]);
      }

      const userData = await fetchUserProfile(user.id);
      if (!userData) {
         return res.status(403).json({ success: false, error: 'Аккаунт недоступен или заблокирован' });
      }
      const secret = process.env.JWT_SECRET || 'dev_secret_key';
      const token = jwt.sign({ id: user.id }, secret, { expiresIn: '30d' });
      // Пароль подошёл — счётчик неудач обнуляем, чтобы пара опечаток не оставляла
      // человека с висящей блокировкой на четверть часа.
      if (guardKey) await clearLoginFailures(guardKey);

      res.json({ success: true, user: userData, token });
    } else {
      if (guardKey) await recordLoginFailure(guardKey, requestIp, 'lms');
      res.status(401).json({ success: false, error: 'Неверные учетные данные' });
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
    const { email, phone, password, avatarUrl, signPin, sidebarLayout } = req.body;

    await pool.query(
      'UPDATE users SET email = $1, phone = $2, avatar_url = $3 WHERE id = $4',
      [email, phone, avatarUrl, userId]
    );

    // Раскладка бокового меню. Пишем только то, что пришло массивом: шторка профиля
    // шлёт её всегда, а прочие клиенты поле не знают — им затирать чужую настройку нечем.
    // Хранится белым списком полей, чтобы в jsonb не уехало содержимое запроса целиком.
    if (Array.isArray(sidebarLayout)) {
      const cleaned = sidebarLayout
        .filter(entry => entry && (entry.type === 'divider' || typeof entry.key === 'string'))
        .map(entry => (entry.type === 'divider'
          ? { type: 'divider' }
          : { type: 'item', key: entry.key, hidden: !!entry.hidden }));

      await pool.query(
        'UPDATE users SET lms_sidebar_layout = $1 WHERE id = $2',
        [JSON.stringify(cleaned), userId]
      );
    }

    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ success: false, error: passwordError });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);
    }

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

    // Виртуальному аккаунту сбрасывать нечего: пароля у него нет, а почта в карточке
    // временная. Такому человеку нужна активация, а не восстановление.
    const virtualCheck = await pool.query(
      `SELECT virtual_code, password_hash FROM users WHERE phone = $1 AND status = 'active'`,
      [phone]
    );
    if (virtualCheck.rows.length > 0) {
      const candidate = virtualCheck.rows[0];
      if (!candidate.password_hash && candidate.virtual_code) {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_RESET',
          message: 'Восстановление недоступно. Ваш аккаунт заведён как виртуальный или был переведён в виртуальный. Нажмите «Активировать аккаунт» и возьмите у администратора лиги актуальный секретный код от этого аккаунта.'
        });
      }
    }

    const result = await pool.query('SELECT id, first_name FROM users WHERE phone = $1 AND email = $2', [phone, email]);

    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Пользователь с такими данными не найден' });
    }

    const user = result.rows[0];
    const newPassword = generateTempPassword();
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
// АКТИВАЦИЯ АККАУНТА (легализация виртуального профиля сотрудника лиги)
//
// Логика повторяет Team-Room (TR-Backend/controllers/authController.js): телефон →
// секретный код от карточки → ФИО/почта/согласие с политикой → сгенерированный пароль
// письмом. Отличие одно и намеренное: в LMS активироваться может только тот, кто
// числится в штате лиги (см. hasLeagueAccess).
// ==========================================

/**
 * Шаг 1. Проверка, что по номеру есть виртуальная карточка, которую можно активировать.
 */
export const regCheckPhone = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Телефон обязателен' });

    const result = await pool.query(
      'SELECT id, virtual_code, status, global_role FROM users WHERE phone = $1',
      [phone]
    );

    // Регистрация новых людей с улицы не предусмотрена: карточку заводит лига
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь с таким номером не найден. Обратитесь к администратору лиги.'
      });
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Аккаунт заблокирован. Обратитесь к администратору лиги.' });
    }

    // Сервисные (теневые) аккаунты лиги входят по логину, телефона у них нет
    if (user.global_role === 'service') {
      return res.status(403).json({
        success: false,
        error: 'Сервисные аккаунты активации не требуют — войдите по логину и паролю, выданным лигой.'
      });
    }

    // Признак виртуального аккаунта — только наличие кода, как в Team-Room. Пароль
    // намеренно не смотрим: код гасится при первом успешном входе, и пока он жив,
    // активацию можно пройти заново — это штатный путь, если письмо с паролем не дошло.
    if (!user.virtual_code) {
      return res.status(400).json({
        success: false,
        error: 'Этот номер телефона уже активирован. Если забыли пароль — воспользуйтесь восстановлением.'
      });
    }

    if (!(await hasLeagueAccess(user.id, user.global_role))) {
      return res.status(403).json({ success: false, error: NO_LEAGUE_ACCESS_ERROR });
    }

    return res.json({ success: true, status: 'virtual' });
  } catch (err) {
    console.error('regCheckPhone error:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

/**
 * Шаг 2. Проверка секретного кода и выдача данных карточки для предзаполнения формы.
 */
export const regVerifyCode = async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ success: false, error: 'Введите код' });

    // Коды генерируются в верхнем регистре (registryController.generateVirtualCode),
    // поэтому регистр ввода не должен иметь значения
    const normalizedCode = String(code).trim().toUpperCase();

    const result = await pool.query(
      `SELECT id, first_name, last_name, middle_name, global_role
       FROM users
       WHERE phone = $1 AND virtual_code = $2 AND status = 'active'`,
      [phone, normalizedCode]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Неверный секретный код' });
    }

    const user = result.rows[0];

    if (!(await hasLeagueAccess(user.id, user.global_role))) {
      return res.status(403).json({ success: false, error: NO_LEAGUE_ACCESS_ERROR });
    }

    return res.json({
      success: true,
      user: {
        first_name: user.first_name,
        last_name: user.last_name,
        middle_name: user.middle_name
      }
    });
  } catch (err) {
    console.error('regVerifyCode error:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

/**
 * Шаг 3. Легализация профиля: запись реальных данных, генерация пароля, письмо.
 */
export const register = async (req, res) => {
  const client = await pool.connect();
  try {
    const { phone, virtualCode, email, firstName, lastName, middleName, birthDate, policyAccepted } = req.body;

    if (!lastName || !firstName || !email) {
      return res.status(400).json({ success: false, error: 'Фамилия, Имя и Email обязательны' });
    }

    const normalizedCode = String(virtualCode || '').trim().toUpperCase();
    const newPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const finalBirthDate = birthDate || null;

    await client.query('BEGIN');

    const check = await client.query(
      `SELECT id, global_role FROM users
       WHERE phone = $1 AND virtual_code = $2 AND status = 'active'
       FOR UPDATE`,
      [phone, normalizedCode]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Неверный код или профиль не найден' });
    }

    const registeredUserId = check.rows[0].id;

    if (!(await hasLeagueAccess(registeredUserId, check.rows[0].global_role))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: NO_LEAGUE_ACCESS_ERROR });
    }

    // Проверяем занятость почты, исключая собственную запись: администратор лиги мог
    // заранее вписать в карточку настоящий email, и человек вправе ввести его же
    const emailCheck = await client.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, registeredUserId]);
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Этот Email уже привязан к другому аккаунту' });
    }

    // Дата рождения через COALESCE: форма активации её не спрашивает, и пустое значение
    // не должно затирать то, что администратор лиги уже вписал в карточку
    await client.query(
      `UPDATE users
       SET email = $1, first_name = $2, last_name = $3, middle_name = $4,
           birth_date = COALESCE($5, birth_date), password_hash = $6
       WHERE id = $7`,
      [email, firstName, lastName, middleName || null, finalBirthDate, passwordHash, registeredUserId]
    );

    await client.query('COMMIT');

    // Фиксация согласия с политикой обработки ПД, данного чекбоксом при активации.
    // Best-effort: сбой записи согласия не должен ломать саму активацию.
    if (policyAccepted) {
      try {
        const versionRes = await pool.query(
          'SELECT id FROM policy_versions WHERE is_published = true ORDER BY published_at DESC LIMIT 1'
        );
        if (versionRes.rows.length > 0) {
          const forwarded = req.headers['x-forwarded-for'];
          const clientIp = forwarded ? String(forwarded).split(',')[0].trim() : (req.ip || null);
          await pool.query(
            `INSERT INTO user_consents (user_id, policy_version_id, ip, user_agent, source)
             VALUES ($1, $2, $3, $4, 'registration')
             ON CONFLICT (user_id, policy_version_id) DO NOTHING`,
            [registeredUserId, versionRes.rows[0].id, clientIp, (req.headers['user-agent'] || '').slice(0, 255)]
          );
        }
      } catch (consentErr) {
        console.error('Не удалось зафиксировать согласие при активации:', consentErr.message);
      }
    }

    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; background-color: #F8F9FA; padding: 40px 20px; color: #2C2C2E;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; padding: 40px 30px; border: 1px solid #E5E5EA; text-align: center;">
          <h2 style="margin-top: 0; font-size: 26px; color: #2C2C2E;">HockeyEco <span style="color: #FF7A00;">LMS</span></h2>
          <p style="text-align: left; margin-top: 30px;">Здравствуйте, <strong>${firstName}</strong>!</p>
          <p style="text-align: left;">Ваш аккаунт в системе управления лигой успешно активирован.</p>
          <p style="text-align: left;">Ваш пароль для входа:</p>
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
      subject: 'Активация аккаунта | HockeyEco LMS',
      html: htmlTemplate
    });

    res.json({ success: true, message: 'Пароль отправлен на почту' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.constraint === 'users_email_key') {
      return res.status(400).json({ success: false, error: 'Этот Email уже привязан к другому аккаунту' });
    }
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
  } finally {
    client.release();
  }
};

const getLeagueIdFromContext = async (req) => {
  if (req.params.leagueId) return req.params.leagueId;
  if (req.body.leagueId) return req.body.leagueId;

  if (req.params.seasonId || req.body.seasonId) {
    const id = req.params.seasonId || req.body.seasonId;
    const res = await pool.query('SELECT league_id FROM seasons WHERE id = $1', [id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  if (req.params.divisionId || req.body.divisionId || (req.originalUrl.includes('/divisions') && req.params.id)) {
    const id = req.params.divisionId || req.body.divisionId || req.params.id;
    const res = await pool.query(`
      SELECT s.league_id FROM divisions d
      JOIN seasons s ON d.season_id = s.id
      WHERE d.id = $1
    `, [id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

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

  if (req.originalUrl.includes('/transfers') && req.params.id) {
    const res = await pool.query(`
      SELECT s.league_id FROM roster_requests rr
      JOIN divisions d ON rr.division_id = d.id
      JOIN seasons s ON d.season_id = s.id
      WHERE rr.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }
  
  if (req.body.tournament_roster_id || (req.originalUrl.includes('/tournament-rosters') && req.params.id)) {
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
  
  if (req.originalUrl.includes('/disqualifications') && req.params.id) {
     const res = await pool.query(`SELECT league_id FROM disqualifications WHERE id = $1`, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  if (req.originalUrl.includes('/disqualifications/history')) {
    const { target_type, tournament_roster_id, tournament_team_role_id, tournament_team_id } = req.query;
    if (target_type === 'staff' && tournament_team_role_id) {
      const res = await pool.query(`
        SELECT s.league_id FROM tournament_team_roles ttr
        JOIN tournament_teams tt ON ttr.tournament_team_id = tt.id
        JOIN divisions d ON tt.division_id = d.id
        JOIN seasons s ON d.season_id = s.id
        WHERE ttr.id = $1
      `, [tournament_team_role_id]);
      if (res.rows.length > 0) return res.rows[0].league_id;
    } else if (target_type === 'team' && tournament_team_id) {
      const res = await pool.query(`
        SELECT s.league_id FROM tournament_teams tt
        JOIN divisions d ON tt.division_id = d.id
        JOIN seasons s ON d.season_id = s.id
        WHERE tt.id = $1
      `, [tournament_team_id]);
      if (res.rows.length > 0) return res.rows[0].league_id;
    } else if (tournament_roster_id) {
      const res = await pool.query(`
        SELECT s.league_id FROM tournament_rosters tr
        JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
        JOIN divisions d ON tt.division_id = d.id
        JOIN seasons s ON d.season_id = s.id
        WHERE tr.id = $1
      `, [tournament_roster_id]);
      if (res.rows.length > 0) return res.rows[0].league_id;
    }
  }

  if (req.originalUrl.includes('/tournament-teams') && req.params.id) {
    const res = await pool.query(`
      SELECT s.league_id FROM tournament_teams tt
      JOIN divisions d ON tt.division_id = d.id
      JOIN seasons s ON d.season_id = s.id
      WHERE tt.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  // --- СДК (Спортивно-дисциплинарный комитет) ---

  if (req.params.meetingId || req.body.meeting_id) {
    const id = req.params.meetingId || req.body.meeting_id;
    const res = await pool.query('SELECT league_id FROM sdk_meetings WHERE id = $1', [id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  if (req.originalUrl.includes('/sdk/meetings') && req.params.id) {
    const res = await pool.query('SELECT league_id FROM sdk_meetings WHERE id = $1', [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  if (req.originalUrl.includes('/sdk/meeting-decisions') && req.params.id) {
    const res = await pool.query(`
      SELECT m.league_id FROM sdk_meeting_decisions d
      JOIN sdk_meetings m ON d.meeting_id = m.id
      WHERE d.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  if (req.originalUrl.includes('/sdk/decision-members') && req.params.id) {
    const res = await pool.query(`
      SELECT m.league_id FROM sdk_decision_members dm
      JOIN sdk_meeting_decisions d ON dm.decision_id = d.id
      JOIN sdk_meetings m ON d.meeting_id = m.id
      WHERE dm.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  if (req.originalUrl.includes('/sdk/meeting-members') && req.params.id) {
    const res = await pool.query(`
      SELECT m.league_id FROM sdk_meeting_members mm
      JOIN sdk_meetings m ON mm.meeting_id = m.id
      WHERE mm.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  if (req.originalUrl.includes('/sdk/meeting-documents') && req.params.id) {
    const res = await pool.query(`
      SELECT m.league_id FROM sdk_meeting_documents doc
      JOIN sdk_meetings m ON doc.meeting_id = m.id
      WHERE doc.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  if (req.originalUrl.includes('/sdk/venues') && req.params.id) {
    const res = await pool.query(`
      SELECT s.league_id FROM sdk_venues v
      JOIN seasons s ON v.season_id = s.id
      WHERE v.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  if (req.originalUrl.includes('/sdk/commission-members') && req.params.id) {
    const res = await pool.query(`
      SELECT s.league_id FROM sdk_commission_members cm
      JOIN seasons s ON cm.season_id = s.id
      WHERE cm.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  if (req.originalUrl.includes('/sdk/violation-types') && req.params.id) {
    const res = await pool.query(`
      SELECT s.league_id FROM sdk_violation_types vt
      JOIN seasons s ON vt.season_id = s.id
      WHERE vt.id = $1
    `, [req.params.id]);
    if (res.rows.length > 0) return res.rows[0].league_id;
  }

  return null;
};

export const requirePermission = (permissionKey) => async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const userRes = await pool.query('SELECT global_role FROM users WHERE id = $1', [userId]);
    const globalRole = userRes.rows[0]?.global_role;

    if (globalRole === ROLES.GLOBAL_ADMIN) {
      return next();
    }

    const allowedRoles = PERMISSIONS[permissionKey];

    if (!allowedRoles || allowedRoles.length === 0) {
      return res.status(403).json({ success: false, error: 'Доступ разрешен только глобальному администратору' });
    }

    const leagueId = await getLeagueIdFromContext(req);
    
    if (!leagueId) {
      console.warn(`[RBAC] Не удалось определить leagueId для маршрута: ${req.originalUrl}`);
      return res.status(400).json({ success: false, error: 'Невозможно определить контекст лиги для проверки прав' });
    }

    let userRoles = [];

    if (globalRole === 'service') {
      const saRes = await pool.query(
        'SELECT account_type FROM league_service_accounts WHERE user_id = $1 AND league_id = $2 AND is_active = true', 
        [userId, leagueId]
      );
      if (saRes.rows.length > 0) {
        userRoles.push(`service_${saRes.rows[0].account_type}`);
      }
    } else {
      const staffRes = await pool.query(
        'SELECT role FROM league_staff WHERE user_id = $1 AND league_id = $2 AND end_date IS NULL',
        [userId, leagueId]
      );
      userRoles = staffRes.rows.map(row => row.role);
    }

    const gameId = req.params.gameId || req.body.gameId;
    
    if (gameId) {
      const matchStaffRes = await pool.query(
        'SELECT role FROM game_staff WHERE game_id = $1 AND user_id = $2',
        [gameId, userId]
      );
      
      matchStaffRes.rows.forEach(r => {
        if (['main-1', 'main-2'].includes(r.role)) userRoles.push(ROLES.GAME_MAIN);
        if (['linesman-1', 'linesman-2'].includes(r.role)) userRoles.push(ROLES.GAME_LINESMAN);
        if (r.role === 'secretary') userRoles.push(ROLES.GAME_SECRETARY);
        if (r.role === 'timekeeper') userRoles.push(ROLES.GAME_TIMEKEEPER);
        if (r.role === 'informant') userRoles.push(ROLES.GAME_INFORMANT);
        if (r.role === 'broadcaster') userRoles.push(ROLES.GAME_BROADCASTER);
        if (['commentator-1', 'commentator-2'].includes(r.role)) userRoles.push(ROLES.GAME_COMMENTATOR);
      });
    }

    const hasAccess = userRoles.some(role => allowedRoles.includes(role));

    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Отказано в доступе: недостаточно прав' });
    }

    next();
  } catch (err) {
    console.error('[RBAC Error]:', err);
    res.status(500).json({ success: false, error: 'Системная ошибка проверки прав доступа' });
  }
};