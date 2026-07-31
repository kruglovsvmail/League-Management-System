import pool from '../config/db.js';
import ExcelJS from 'exceljs';

// ==========================================
// ЖУРНАЛ РАБОТЫ СЕКРЕТАРЯ С ТАЙМЕРОМ
// ==========================================
// Пишется только для матчей тех дивизионов, где включён divisions.track_timer_log.
// Время фиксирует сервер (created_at): часы на устройстве секретаря могут быть сбиты
// или подкручены, а журнал существует именно для проверки секретаря.
// В выгрузке время показывается в таймзоне арены, где идёт матч, — так его сверяют
// с реальным ходом игры.

const ACTIONS = ['start', 'stop', 'adjust', 'set_time', 'change_period'];

const ACTION_LABELS = {
  start: 'Старт таймера',
  stop: 'Стоп таймера',
  adjust: 'Корректировка кнопкой',
  set_time: 'Ручной ввод времени',
  change_period: 'Смена периода',
};

const formatTimer = (seconds) => {
  const s = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Флаг берём из дивизиона под стадию матча не разделяя регулярку и плей-офф:
// это административный контроль, а не игровое правило.
const isLoggingEnabled = async (gameId) => {
  const { rows } = await pool.query(`
    SELECT COALESCE(d.track_timer_log, false) AS enabled
    FROM games g
    LEFT JOIN divisions d ON d.id = g.division_id
    WHERE g.id = $1
  `, [gameId]);
  return rows[0]?.enabled === true;
};

// POST /games/:gameId/timer-log
export const createTimerLogEntry = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { action, timer_seconds, delta_seconds, period } = req.body;

    if (!ACTIONS.includes(action)) {
      return res.status(400).json({ success: false, error: 'Неизвестное действие с таймером' });
    }

    // Тумблер выключен — молча ничего не пишем. Фронт тоже это проверяет, но полагаться
    // только на него нельзя: панель могла остаться открытой с момента, когда флаг был включён.
    if (!await isLoggingEnabled(gameId)) {
      return res.json({ success: true, skipped: true });
    }

    // Время не принимаем из запроса вовсе — его ставит сервер значением по умолчанию
    // для created_at. Иначе журнал можно было бы подделать с клиента.
    await pool.query(`
      INSERT INTO game_timer_log
        (game_id, user_id, action, timer_seconds, delta_seconds, period)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      gameId,
      req.user?.id || null,
      action,
      Math.max(0, parseInt(timer_seconds, 10) || 0),
      action === 'adjust' ? (parseInt(delta_seconds, 10) || 0) : null,
      period || null,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка записи журнала таймера:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// GET /games/:gameId/timer-log/export → CSV
export const exportTimerLog = async (req, res) => {
  try {
    const { gameId } = req.params;

    // Шапка файла: дивизион, команды, дата матча и арена. Таймзона арены — в ней
    // показываем время; нет арены или пояса — UTC.
    const infoRes = await pool.query(`
      SELECT COALESCE(a.timezone, 'UTC') AS tz,
             a.name AS arena_name,
             d.name AS division_name,
             s.name AS season_name,
             l.name AS league_name,
             ht.name AS home_team_name,
             at.name AS away_team_name,
             to_char(g.game_date AT TIME ZONE COALESCE(a.timezone, 'UTC'), 'DD.MM.YYYY HH24:MI') AS game_started
      FROM games g
      LEFT JOIN arenas a ON a.id = g.arena_id
      LEFT JOIN divisions d ON d.id = g.division_id
      LEFT JOIN seasons s ON s.id = d.season_id
      LEFT JOIN leagues l ON l.id = s.league_id
      LEFT JOIN teams ht ON ht.id = g.home_team_id
      LEFT JOIN teams at ON at.id = g.away_team_id
      WHERE g.id = $1
    `, [gameId]);
    if (infoRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }
    const info = infoRes.rows[0];
    const tz = info.tz;

    // Перевод в пояс арены делает Postgres: created_at — timestamptz, поэтому
    // AT TIME ZONE даёт корректное местное время без ручной возни со смещениями.
    const { rows } = await pool.query(`
      SELECT l.action, l.timer_seconds, l.delta_seconds, l.period,
             to_char(l.created_at AT TIME ZONE $2, 'DD.MM.YYYY HH24:MI:SS') AS arena_time,
             u.last_name, u.first_name
      FROM game_timer_log l
      LEFT JOIN users u ON u.id = l.user_id
      WHERE l.game_id = $1
      ORDER BY l.id ASC
    `, [gameId, tz]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HockeyEco';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Журнал таймера', {
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    sheet.columns = [
      { key: 'time',   width: 22 },
      { key: 'action', width: 26 },
      { key: 'timer',  width: 18 },
      { key: 'delta',  width: 12 },
      { key: 'period', width: 10 },
      { key: 'user',   width: 28 },
    ];

    const lastCol = sheet.columns.length;
    const wideCell = (rowIdx) => `A${rowIdx}:${String.fromCharCode(64 + lastCol)}${rowIdx}`;

    // ── Шапка: что за матч ──
    const titleRow = sheet.addRow(['Журнал работы с таймером']);
    sheet.mergeCells(wideCell(titleRow.number));
    titleRow.height = 26;
    titleRow.getCell(1).font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1F2933' } };
    titleRow.getCell(1).alignment = { vertical: 'middle' };

    const subtitle = [
      [info.league_name, info.season_name].filter(Boolean).join(' · '),
      info.division_name,
      [info.home_team_name, info.away_team_name].filter(Boolean).join(' — '),
      [info.game_started, info.arena_name].filter(Boolean).join(', '),
    ].filter(Boolean);

    subtitle.forEach(text => {
      const row = sheet.addRow([text]);
      sheet.mergeCells(wideCell(row.number));
      row.getCell(1).font = { name: 'Arial', size: 11, color: { argb: 'FF52606D' } };
    });

    // Матч мог остаться без арены — тогда время в UTC, и об этом лучше сказать прямо
    const tzRow = sheet.addRow([`Время указано в часовом поясе арены: ${tz}`]);
    sheet.mergeCells(wideCell(tzRow.number));
    tzRow.getCell(1).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF7B8794' } };

    sheet.addRow([]);

    // ── Заголовки таблицы ──
    const head = sheet.addRow(['Время', 'Действие', 'Время на таймере', 'Сдвиг, сек', 'Период', 'Секретарь']);
    head.height = 22;
    head.eachCell(cell => {
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2933' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF1F2933' } } };
    });

    // ── Строки ──
    rows.forEach((r, idx) => {
      const row = sheet.addRow([
        r.arena_time,
        ACTION_LABELS[r.action] || r.action,
        formatTimer(r.timer_seconds),
        r.delta_seconds == null ? '' : (r.delta_seconds > 0 ? `+${r.delta_seconds}` : String(r.delta_seconds)),
        r.period || '',
        [r.last_name, r.first_name].filter(Boolean).join(' '),
      ]);
      row.height = 18;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { name: 'Arial', size: 11, color: { argb: 'FF1F2933' } };
        // Время и показания таймера — моноширинным по центру, так столбик читается вертикально
        if (col === 1 || col === 3) cell.font = { name: 'Consolas', size: 11, color: { argb: 'FF1F2933' } };
        cell.alignment = { vertical: 'middle', horizontal: (col === 2 || col === 6) ? 'left' : 'center' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFD5DBE0' } } };
        // Зебра — глазу проще не соскользнуть на соседнюю строку
        if (idx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FA' } };
        }
      });
      // Корректировки подсвечиваем: ради них журнал и заводился
      if (r.action === 'adjust' || r.action === 'set_time') {
        row.getCell(2).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFC2410C' } };
        row.getCell(4).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFC2410C' } };
      }
    });

    if (rows.length === 0) {
      const empty = sheet.addRow(['По этому матчу действий с таймером не записано']);
      sheet.mergeCells(wideCell(empty.number));
      empty.getCell(1).font = { name: 'Arial', size: 11, italic: true, color: { argb: 'FF7B8794' } };
      empty.getCell(1).alignment = { horizontal: 'center' };
    }

    // Строк в шапке заранее не знаем — часть данных о матче может отсутствовать,
    // поэтому и закрепление, и фильтр вешаем на фактический номер строки заголовков.
    sheet.views = [{ state: 'frozen', ySplit: head.number }];
    sheet.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: lastCol } };

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `timer-log-game-${gameId}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Ошибка выгрузки журнала таймера:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
