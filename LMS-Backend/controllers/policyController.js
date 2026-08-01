import pool from '../config/db.js';

/**
 * Актуальная опубликованная версия Политики обработки персональных данных.
 *
 * Публичный эндпоинт (без авторизации) — текст нужен на странице входа, в шторке
 * согласия при активации аккаунта, то есть до того, как у человека появится токен.
 *
 * Таблица policy_versions общая с Team-Room: документ ведётся в одном месте, оба
 * приложения показывают одну и ту же актуальную версию (см. TR-Backend/controllers/
 * PolicyController.js — там же живут статус согласия и его фиксация для авторизованных).
 */
export const getCurrentPolicy = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, version, title, content, published_at
       FROM policy_versions
       WHERE is_published = true
       ORDER BY published_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Политика ещё не опубликована' });
    }

    res.json({ success: true, policy: result.rows[0] });
  } catch (err) {
    console.error('Ошибка получения политики:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
