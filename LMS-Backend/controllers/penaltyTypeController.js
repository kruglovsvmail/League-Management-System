import pool from '../config/db.js';

// ==========================================
// СПРАВОЧНИК ПРИЧИН УДАЛЕНИЯ (penalty_types)
// ==========================================
// Свой набор на каждый сезон. Заполняется лигой в настройках («Справочники» ->
// «Причины удалений») и используется панелью секретаря при записи удаления.
// Не путать с sdk_violation_types — там пункты регламента и санкции СДК.

const COLUMNS = 'id, season_id, number, code, title, tts_accusative, created_at, updated_at';

// Пункт справочника из тела запроса. number приводим к числу: фронт шлёт строку из input.
const readBody = (body) => ({
  number: Number.parseInt(body.number, 10),
  code: (body.code || '').trim(),
  title: (body.title || '').trim(),
  tts_accusative: (body.tts_accusative || '').trim() || null,
});

const validate = ({ number, code, title }) => {
  if (!Number.isInteger(number) || number < 1) return 'Номер должен быть целым числом больше нуля';
  if (!code) return 'Укажите сокращение';
  if (code.length > 20) return 'Сокращение не длиннее 20 символов';
  if (!title) return 'Укажите полное наименование';
  return null;
};

// Нарушение UNIQUE по (season_id, number) / (season_id, title) переводим в понятный текст,
// иначе наружу уходит «duplicate key value violates unique constraint».
const conflictMessage = (err) => {
  if (err.code !== '23505') return null;
  if (String(err.constraint).includes('number')) return 'Пункт с таким номером уже есть в этом сезоне';
  if (String(err.constraint).includes('title')) return 'Пункт с таким наименованием уже есть в этом сезоне';
  return 'Такой пункт уже есть в этом сезоне';
};

// GET /seasons/:seasonId/penalty-types
export const getPenaltyTypes = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM penalty_types WHERE season_id = $1 ORDER BY number ASC, id ASC`,
      [seasonId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Ошибка получения справочника причин удаления:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// GET /games/:gameId/penalty-types
// Справочник сезона, к которому относится матч, — для панели секретаря.
// Пустой массив здесь означает «лига справочник не заполнила»: фронт в этом случае
// показывает встроенный список причин, чтобы протокол всё равно можно было вести.
export const getPenaltyTypesForGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { rows } = await pool.query(`
      SELECT ${COLUMNS.split(', ').map(c => `pt.${c}`).join(', ')}
      FROM penalty_types pt
      JOIN divisions d ON d.season_id = pt.season_id
      JOIN games g ON g.division_id = d.id
      WHERE g.id = $1
      ORDER BY pt.number ASC, pt.id ASC
    `, [gameId]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Ошибка получения справочника причин удаления для матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// POST /seasons/:seasonId/penalty-types
export const createPenaltyType = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const item = readBody(req.body);
    const invalid = validate(item);
    if (invalid) return res.status(400).json({ success: false, error: invalid });

    const { rows } = await pool.query(
      `INSERT INTO penalty_types (season_id, number, code, title, tts_accusative)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [seasonId, item.number, item.code, item.title, item.tts_accusative]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    const conflict = conflictMessage(err);
    if (conflict) return res.status(400).json({ success: false, error: conflict });
    console.error('Ошибка создания причины удаления:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// PUT /penalty-types/:id
export const updatePenaltyType = async (req, res) => {
  try {
    const { id } = req.params;
    const item = readBody(req.body);
    const invalid = validate(item);
    if (invalid) return res.status(400).json({ success: false, error: invalid });

    const { rows } = await pool.query(
      `UPDATE penalty_types
       SET number = $1, code = $2, title = $3, tts_accusative = $4, updated_at = NOW()
       WHERE id = $5 RETURNING ${COLUMNS}`,
      [item.number, item.code, item.title, item.tts_accusative, id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Пункт не найден' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    const conflict = conflictMessage(err);
    if (conflict) return res.status(400).json({ success: false, error: conflict });
    console.error('Ошибка изменения причины удаления:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// DELETE /penalty-types/:id
// Удаление жёсткое. У уже записанных удалений обнулится penalty_reason_id
// (ON DELETE SET NULL), но снимки penalty_violation и penalty_violation_code останутся —
// протокол напечатается ровно так, как его записали.
export const deletePenaltyType = async (req, res) => {
  try {
    const { id } = req.params;
    const usedRes = await pool.query(
      'SELECT COUNT(*)::int AS used FROM game_events WHERE penalty_reason_id = $1',
      [id]
    );
    const { rows } = await pool.query('DELETE FROM penalty_types WHERE id = $1 RETURNING id', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Пункт не найден' });
    res.json({ success: true, affectedEvents: usedRes.rows[0].used });
  } catch (err) {
    console.error('Ошибка удаления причины удаления:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// POST /seasons/:seasonId/penalty-types/copy  { fromSeasonId }
// Переносит справочник из другого сезона. Пункты, чей номер или наименование уже заняты
// в текущем сезоне, пропускаются — так кнопку можно нажать повторно без дублей.
export const copyPenaltyTypes = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const { fromSeasonId } = req.body;

    if (!fromSeasonId) return res.status(400).json({ success: false, error: 'Не выбран сезон-источник' });
    if (String(fromSeasonId) === String(seasonId)) {
      return res.status(400).json({ success: false, error: 'Нельзя скопировать справочник сезона в него же' });
    }

    const { rows } = await pool.query(`
      INSERT INTO penalty_types (season_id, number, code, title, tts_accusative)
      SELECT $1, src.number, src.code, src.title, src.tts_accusative
      FROM penalty_types src
      WHERE src.season_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM penalty_types dst
          WHERE dst.season_id = $1 AND (dst.number = src.number OR dst.title = src.title)
        )
      RETURNING id
    `, [seasonId, fromSeasonId]);

    res.json({ success: true, copied: rows.length });
  } catch (err) {
    console.error('Ошибка копирования справочника причин удаления:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
