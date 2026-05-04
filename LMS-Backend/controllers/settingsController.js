import pool from '../config/db.js';

// --- ПЕРСОНАЛ ---

// Поиск пользователя по телефону для добавления
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

// Получение списка персонала лиги
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
      -- ИЗМЕНЕНИЕ ЗДЕСЬ: ls.status = 'active' заменено на ls.end_date IS NULL
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

    // ИЗМЕНЕНИЕ ЗДЕСЬ: "Увольнение" через проставление end_date вместо status = 'fired'
    await client.query(
      `UPDATE league_staff SET end_date = CURRENT_DATE, updated_at = NOW() 
       WHERE user_id = $1 AND league_id = $2 AND end_date IS NULL`, 
      [userId, leagueId]
    );

    if (roles && roles.length > 0) {
      for (const role of roles) {
        // ИЗМЕНЕНИЕ ЗДЕСЬ: Убран status из INSERT, добавлен end_date = NULL при UPDATE
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

// Получение активных квалификаций
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

// Создание квалификации
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

// "Мягкое" удаление квалификации
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

// Получить все арены платформы
export const getAllSettingsArenas = async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, name, city, address FROM arenas WHERE status = 'active' ORDER BY city, name`);
    res.json({ success: true, arenas: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Получить арены, привязанные к конкретной лиге
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

// Добавить или удалить арену из лиги
export const toggleLeagueArena = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { arenaId, action } = req.body; // action может быть 'add' или 'remove'

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