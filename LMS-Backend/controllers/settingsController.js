import pool from '../config/db.js';
import bcrypt from 'bcrypt';

import path from 'path';
import s3 from '../config/s3.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// ==========================================
// ПАРАМЕТРЫ ЛИГИ (ГЛОБАЛЬНЫЕ НАСТРОЙКИ)
// ==========================================
export const getLeaguePreferences = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const result = await pool.query(
      'SELECT sec_access_before_hours, sec_access_after_hours FROM leagues WHERE id = $1', 
      [leagueId]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateLeaguePreferences = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { sec_access_before_hours, sec_access_after_hours } = req.body;
    
    await pool.query(
      'UPDATE leagues SET sec_access_before_hours = $1, sec_access_after_hours = $2 WHERE id = $3',
      [sec_access_before_hours, sec_access_after_hours, leagueId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// --- ПЕРСОНАЛ ---

export const lookupUserByPhone = async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, error: 'Номер не передан' });

    const query = `
      SELECT id, first_name, last_name, middle_name, birth_date, avatar_url, phone 
      FROM users WHERE phone = $1
    `;
    const result = await pool.query(query, [phone]);
    
    if (result.rows.length > 0) {
      res.json({ success: true, user: result.rows[0] });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getLeagueStaff = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const query = `
      SELECT 
        u.id as user_id, u.first_name, u.last_name, u.middle_name, 
        u.birth_date, u.avatar_url, u.phone,
        string_agg(ls.role, ', ') as roles,
        MAX(ls.updated_at) as updated_at
      FROM league_staff ls
      JOIN users u ON ls.user_id = u.id
      WHERE ls.league_id = $1 AND ls.end_date IS NULL
      GROUP BY u.id, u.first_name, u.last_name, u.middle_name, u.birth_date, u.avatar_url, u.phone
      ORDER BY u.last_name, u.first_name
    `;
    const result = await pool.query(query, [leagueId]);
    res.json({ success: true, staff: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateLeagueStaff = async (req, res) => {
  const client = await pool.connect();
  try {
    const { leagueId } = req.params;
    const { userId, roles } = req.body;

    await client.query('BEGIN');

    await client.query(
      `UPDATE league_staff SET end_date = CURRENT_DATE, updated_at = NOW() 
       WHERE user_id = $1 AND league_id = $2 AND end_date IS NULL`, 
      [userId, leagueId]
    );

    if (roles && roles.length > 0) {
      for (const role of roles) {
        await client.query(
          `INSERT INTO league_staff (user_id, league_id, role, start_date)
           VALUES ($1, $2, $3, CURRENT_DATE)
           ON CONFLICT (user_id, league_id, role) 
           DO UPDATE SET end_date = NULL, updated_at = NOW()`,
          [userId, leagueId, role]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

// --- КВАЛИФИКАЦИИ ---

export const getSettingsQualifications = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const result = await pool.query(
      `SELECT * FROM league_qualifications 
       WHERE league_id = $1 AND status = 'active' 
       ORDER BY name`, 
      [leagueId]
    );
    res.json({ success: true, qualifications: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createQualification = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { name, shortName, description } = req.body;

    const query = `
      INSERT INTO league_qualifications (league_id, name, short_name, description, status) 
      VALUES ($1, $2, $3, $4, 'active') RETURNING id
    `;
    const result = await pool.query(query, [leagueId, name, shortName, description]);
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteQualification = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE league_qualifications SET status = 'archive' WHERE id = $1`, 
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// --- АРЕНЫ ЛИГИ ---

export const getAllSettingsArenas = async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, name, city, address FROM arenas WHERE status = 'active' ORDER BY city, name`);
    res.json({ success: true, arenas: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getLeagueSettingsArenas = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const result = await pool.query(`
      SELECT a.id, a.name, a.city, a.address
      FROM arenas a
      JOIN league_arenas la ON a.id = la.arena_id
      WHERE la.league_id = $1 AND a.status = 'active'
      ORDER BY a.city, a.name
    `, [leagueId]);
    res.json({ success: true, arenas: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const toggleLeagueArena = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { arenaId, action } = req.body; 

    if (action === 'add') {
      await pool.query(
        `INSERT INTO league_arenas (league_id, arena_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [leagueId, arenaId]
      );
    } else if (action === 'remove') {
      await pool.query(
        `DELETE FROM league_arenas WHERE league_id = $1 AND arena_id = $2`,
        [leagueId, arenaId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==========================================
// СЕРВИСНЫЕ АККАУНТЫ ЛИГИ (ОБЩИЙ ДОСТУП)
// ==========================================

export const getLeagueServiceAccounts = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const result = await pool.query(`
      SELECT id, user_id, login, account_type, name, description, photo_url, is_active, created_at 
      FROM league_service_accounts 
      WHERE league_id = $1
      ORDER BY created_at DESC
    `, [leagueId]);
    res.json({ success: true, accounts: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createLeagueServiceAccount = async (req, res) => {
  const client = await pool.connect();
  try {
    const { leagueId } = req.params;
    const { name, login, password, account_type, description } = req.body;

    const loginCheck = await client.query('SELECT id FROM league_service_accounts WHERE login = $1', [login]);
    if (loginCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Этот логин уже занят. Придумайте другой.' });
    }

    await client.query('BEGIN');

    const now = new Date();
    const technicalEmail = `service_${Date.now()}@lms.local`;
    const passwordHash = await bcrypt.hash(password, 10);

    // 1. Создаем пользователя
    const userRes = await client.query(
      `INSERT INTO users (email, first_name, global_role, status) 
       VALUES ($1, $2, 'service', 'active') RETURNING id`,
      [technicalEmail, name]
    );
    const userId = userRes.rows[0].id;

    // 2. Создаем аккаунт и получаем его ID
    const accRes = await client.query(
      `INSERT INTO league_service_accounts (user_id, league_id, login, password_hash, account_type, name, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, leagueId, login, passwordHash, account_type, name, description] // ИСПРАВЛЕНО: Добавлен name перед description
    );
    const newAccountId = accRes.rows[0].id;

    // 3. Загружаем фото в S3, если есть файл
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const s3Key = `uploads/service_accounts_${newAccountId}_logo${ext}`;

      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME || process.env.S3_BUCKET,
        Key: s3Key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      }));

      // 4. Обновляем URL в БД
      await client.query(`UPDATE league_service_accounts SET photo_url = $1 WHERE id = $2`, [`/${s3Key}`, newAccountId]);
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка создания сервисного аккаунта:', err); // Добавил логирование, чтобы в будущем было видно ошибку в консоли сервера
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

export const updateLeagueServiceAccount = async (req, res) => {
  const client = await pool.connect();
  try {
    const { leagueId, id } = req.params;
    const { name, login, password, account_type, description, is_active, clear_photo } = req.body;

    const loginCheck = await client.query('SELECT id FROM league_service_accounts WHERE login = $1 AND id != $2', [login, id]);
    if (loginCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Этот логин уже занят.' });
    }

    await client.query('BEGIN');

    const accRes = await client.query('SELECT user_id, photo_url FROM league_service_accounts WHERE id = $1 AND league_id = $2', [id, leagueId]);
    if (accRes.rows.length === 0) throw new Error('Аккаунт не найден');
    const userId = accRes.rows[0].user_id;
    const oldPhotoUrl = accRes.rows[0].photo_url;

    await client.query('UPDATE users SET first_name = $1 WHERE id = $2', [name, userId]);

    let updateQuery = `
      UPDATE league_service_accounts 
      SET name = $1, login = $2, account_type = $3, description = $4, is_active = $5, updated_at = NOW()
    `;
    const queryParams = [name, login, account_type, description, is_active === 'true' || is_active === true];
    let paramIndex = 6;

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updateQuery += `, password_hash = $${paramIndex++}`;
      queryParams.push(passwordHash);
    }

    // Если запросили очистку фото
    if (clear_photo === 'true') {
      updateQuery += `, photo_url = NULL`;
      if (oldPhotoUrl) {
         try {
            await s3.send(new DeleteObjectCommand({
               Bucket: process.env.S3_BUCKET_NAME || process.env.S3_BUCKET,
               Key: oldPhotoUrl.replace(/^\//, '') // Убираем слэш в начале
            }));
         } catch(e) { console.error('Ошибка удаления из S3:', e); }
      }
    } 
    // Если прилетел новый файл - загружаем и переписываем
    else if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const s3Key = `uploads/service_accounts_${id}_logo${ext}`;

      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME || process.env.S3_BUCKET,
        Key: s3Key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      }));

      updateQuery += `, photo_url = $${paramIndex++}`;
      queryParams.push(`/${s3Key}`);
    }

    updateQuery += ` WHERE id = $${paramIndex++} AND league_id = $${paramIndex}`;
    queryParams.push(id, leagueId);

    await client.query(updateQuery, queryParams);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

export const deleteLeagueServiceAccount = async (req, res) => {
  try {
    const { leagueId, id } = req.params;
    
    const accRes = await pool.query('SELECT user_id, photo_url FROM league_service_accounts WHERE id = $1 AND league_id = $2', [id, leagueId]);
    if (accRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Аккаунт не найден' });
    }
    const { user_id, photo_url } = accRes.rows[0];

    // Удаляем фото из S3
    if (photo_url) {
        try {
            await s3.send(new DeleteObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME || process.env.S3_BUCKET,
                Key: photo_url.replace(/^\//, '')
            }));
        } catch(e) { console.error('Ошибка удаления из S3:', e); }
    }

    // Удаление пользователя каскадно удалит и аккаунт (если настроены FK), но лучше удалять явно, 
    // либо полагаться на каскад БД. В нашем коде БД: ON DELETE CASCADE.
    await pool.query('DELETE FROM users WHERE id = $1', [user_id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};