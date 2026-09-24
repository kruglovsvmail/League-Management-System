import pool from '../config/db.js';

// ─── ПОДПИСКИ TEAM ROOM ──────────────────────────────────────────────────────
// Раздел «Подписки» в LMS, только глобальный админ (PERMISSIONS.SUBSCRIPTIONS_ACCESS).
//
// Подписка — одна дата на человека, users.subscription_expires_at. Её двигают оплата
// в TR (вебхук ЮKassa: от большей из «дата» и «сейчас» плюс срок тарифа) и пробный
// период при регистрации (тоже большая из двух). Здесь её смотрят и меняют руками:
// отмеченным, всем по фильтру списка или составу выбранных команд.
//
// Каждое ручное изменение пишется в журнал: subscription_operations — одна строка на
// действие, subscription_changes — было/стало по каждому, чья дата реально поменялась.
// По журналу операцию можно отменить (undoSubscriptionOperation).
//
// Дата читается через ::timestamptz: колонка может оказаться timestamp без пояса, и тогда
// драйвер pg прочёл бы её по часам процесса (в проде UTC), а не по часам сессии базы,
// которая её писала.

const EXPIRES = 'u.subscription_expires_at::timestamptz';

// Статусы — те же, что видит человек в TR (TR-Frontend/src/utils/subscription.js):
// меньше недели до конца — «истекает», это всё ещё действующая подписка.
const STATUS_WHERE = {
  active: `${EXPIRES} > now()`,
  expiring: `${EXPIRES} > now() AND ${EXPIRES} <= now() + interval '7 days'`,
  expired: `${EXPIRES} <= now()`,
  never: 'u.subscription_expires_at IS NULL',
};

const SORTS = {
  name: 'u.last_name ASC NULLS LAST, u.first_name ASC NULLS LAST, u.id ASC',
  expires_asc: 'u.subscription_expires_at ASC NULLS LAST, u.id ASC',
  expires_desc: 'u.subscription_expires_at DESC NULLS LAST, u.id ASC',
};

// Отмеченных галочками больше этого — пусть выбирают «всех по фильтру»: список id
// такого размера из браузера не нужен, фильтр сервер соберёт сам.
const MAX_EXPLICIT_USERS = 5000;
const MAX_EXTEND = { days: 3660, months: 120 };
const MAX_COMMENT = 500;

const uniqueIds = (list) => [...new Set((Array.isArray(list) ? list : []).map(Number).filter(Number.isInteger))];

/**
 * Условие фильтра списка на users u. Одна функция и для списка, и для «всех по фильтру»
 * при массовом изменении: иначе «выбрать всех (142)» и то, к чему применилось,
 * разошлись бы. withStatus: false — для счётчиков над списком, они сами делят по статусу.
 */
const buildFilterWhere = (filter, params, { withStatus = true } = {}) => {
  const where = [];

  const q = String(filter?.q || '').trim();
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where.push(`(concat_ws(' ', u.last_name, u.first_name, u.middle_name) ILIKE ${p} OR u.phone ILIKE ${p} OR u.email ILIKE ${p})`);
  }

  // 1 — реальные, 2 — виртуальные: как в Реестре, по коду активации
  const type = Number(filter?.type) || 0;
  if (type === 1) where.push('u.virtual_code IS NULL');
  if (type === 2) where.push('u.virtual_code IS NOT NULL');

  // Команда — все, кто к ней относится сейчас: участники и владельцы
  const teamId = Number(filter?.teamId) || null;
  if (teamId) {
    params.push(teamId);
    const p = `$${params.length}`;
    where.push(`(EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = u.id AND tm.team_id = ${p} AND tm.left_at IS NULL)
             OR EXISTS (SELECT 1 FROM team_owners o WHERE o.user_id = u.id AND o.team_id = ${p}))`);
  }

  if (withStatus && STATUS_WHERE[filter?.status]) where.push(STATUS_WHERE[filter.status]);

  return where.length ? where.join(' AND ') : 'TRUE';
};

/**
 * Кому применяется действие → { where } на users u или { error }:
 *   users  — отмеченные галочками id;
 *   filter — все, кто подходит под фильтр списка (пустой фильтр — вообще все);
 *   teams  — состав выбранных команд: игроки (действующая строка team_rosters), а с
 *            includeStaff ещё штаб (team_roles) и владельцы (team_owners).
 */
const resolveTarget = (target, params) => {
  if (target?.type === 'users') {
    const ids = uniqueIds(target.userIds);
    if (ids.length === 0) return { error: 'Никто не отмечен' };
    if (ids.length > MAX_EXPLICIT_USERS) return { error: `Отмечено больше ${MAX_EXPLICIT_USERS} — выберите «всех по фильтру»` };
    params.push(ids);
    return { where: `u.id = ANY($${params.length}::int[])` };
  }

  if (target?.type === 'filter') {
    return { where: buildFilterWhere(target.filter || {}, params) };
  }

  if (target?.type === 'teams') {
    const teamIds = uniqueIds(target.teamIds);
    if (teamIds.length === 0) return { error: 'Не выбрана ни одна команда' };
    params.push(teamIds);
    const p = `$${params.length}::int[]`;
    const players = `EXISTS (SELECT 1 FROM team_members tm
                               JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
                              WHERE tm.user_id = u.id AND tm.left_at IS NULL AND tm.team_id = ANY(${p}))`;
    if (!target.includeStaff) return { where: players };
    return {
      where: `(${players}
            OR EXISTS (SELECT 1 FROM team_members tm
                         JOIN team_roles ro ON ro.member_id = tm.id AND ro.left_at IS NULL
                        WHERE tm.user_id = u.id AND tm.left_at IS NULL AND tm.team_id = ANY(${p}))
            OR EXISTS (SELECT 1 FROM team_owners o WHERE o.user_id = u.id AND o.team_id = ANY(${p})))`,
    };
  }

  return { error: 'Не выбрано, кому применить' };
};

/**
 * Действие из тела запроса → { type, ... } или { error }:
 *   extend  — продлить на amount дней/месяцев, как оплата: от большей из «дата» и «сейчас»;
 *   set     — дата окончания until (ISO-момент: конец выбранного дня по часам того, кто
 *             ставит, — его считает браузер). noShorten — у кого дата позже, не трогать;
 *   disable — закончить подписку сейчас (у кого её нет или она уже истекла — без изменений).
 */
const parseAction = (action) => {
  if (action?.type === 'extend') {
    const unit = action.unit === 'days' || action.unit === 'months' ? action.unit : null;
    const amount = Number(action.amount);
    if (!unit || !Number.isInteger(amount) || amount < 1 || amount > MAX_EXTEND[unit]) {
      return { error: `Срок продления — целое число: от 1 до ${MAX_EXTEND.days} дней или до ${MAX_EXTEND.months} месяцев` };
    }
    return { type: 'extend', amount, unit };
  }

  if (action?.type === 'set') {
    const until = new Date(action.until);
    if (Number.isNaN(until.getTime()) || until.getFullYear() < 2000 || until.getFullYear() > 2100) {
      return { error: 'Некорректная дата окончания' };
    }
    return { type: 'set', until: until.toISOString(), noShorten: action.noShorten !== false };
  }

  if (action?.type === 'disable') return { type: 'disable' };

  return { error: 'Неизвестное действие' };
};

// Новая дата для строки t (t.old — текущая дата человека). Всё считается в SQL одним
// now() на транзакцию: у всех затронутых «сейчас» одно и то же.
const newValueSql = (action, params) => {
  if (action.type === 'extend') {
    params.push(action.amount);
    const p = `$${params.length}::int`;
    const interval = action.unit === 'months' ? `make_interval(months => ${p})` : `make_interval(days => ${p})`;
    return `GREATEST(COALESCE(t.old, now()), now()) + ${interval}`;
  }
  if (action.type === 'set') {
    params.push(action.until);
    const p = `$${params.length}::timestamptz`;
    return action.noShorten ? `GREATEST(COALESCE(t.old, ${p}), ${p})` : p;
  }
  return 'CASE WHEN t.old > now() THEN now() ELSE t.old END';
};

// Тело запроса preview/apply → { action, target } или { error }
const parseChangeRequest = (body) => {
  const action = parseAction(body?.action);
  if (action.error) return { error: action.error };
  const check = resolveTarget(body?.target, []);
  if (check.error) return { error: check.error };
  return { action, target: body.target };
};

// Что записать в журнал про действие и про «кому». Id отмеченных не храним — кого
// затронуло, видно по subscription_changes; названия команд храним словами, чтобы журнал
// читался и после переименования.
const actionForJournal = (action) => {
  if (action.type === 'extend') return { amount: action.amount, unit: action.unit };
  if (action.type === 'set') return { until: action.until, noShorten: action.noShorten };
  return {};
};

const targetForJournal = async (client, target) => {
  if (target.type === 'users') return { type: 'users', count: uniqueIds(target.userIds).length };

  if (target.type === 'teams') {
    const teamIds = uniqueIds(target.teamIds);
    const { rows } = await client.query('SELECT name FROM teams WHERE id = ANY($1::int[]) ORDER BY name', [teamIds]);
    return { type: 'teams', teamIds, teamNames: rows.map(r => r.name), includeStaff: !!target.includeStaff };
  }

  const f = target.filter || {};
  const teamId = Number(f.teamId) || null;
  let teamName = null;
  if (teamId) {
    const { rows } = await client.query('SELECT name FROM teams WHERE id = $1', [teamId]);
    teamName = rows[0]?.name || null;
  }
  return {
    type: 'filter',
    filter: { status: STATUS_WHERE[f.status] ? f.status : 'all', type: Number(f.type) || 0, teamId, q: String(f.q || '').trim() },
    teamName,
  };
};

// Вернуть прежнюю дату можно, только если её с тех пор никто не трогал: у человека ровно
// та дата, что поставила операция, и после неё над ним не было действующей операции
// (отменённые и сами отмены не в счёт — своё действие они уже вернули). Оплата или пробный
// период при активации дату сдвигают — такие отпадают на первом же условии.
const REVERTABLE = `
      u.subscription_expires_at::timestamptz IS NOT DISTINCT FROM ch.new_expires_at
  AND NOT EXISTS (
        SELECT 1 FROM subscription_changes later
          JOIN subscription_operations lo ON lo.id = later.operation_id
         WHERE later.user_id = ch.user_id
           AND later.operation_id > ch.operation_id
           AND lo.action <> 'undo'
           AND lo.undone_at IS NULL
      )`;

// ── GET /api/subscriptions/users ──────────────────────────────────────────
// Список с фильтрами и постраничной подгрузкой; на первой странице — счётчики по статусам
// (с теми же фильтрами, кроме самого статуса).
export const getSubscriptionUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const filter = { q: req.query.q, type: req.query.type, teamId: req.query.teamId, status: req.query.status };
    const order = SORTS[req.query.sort] || SORTS.name;

    const params = [];
    const where = buildFilterWhere(filter, params);
    params.push(limit, (page - 1) * limit);

    const { rows } = await pool.query(`
      SELECT u.id, u.last_name, u.first_name, u.middle_name, u.phone, u.avatar_url,
             (u.virtual_code IS NOT NULL) AS is_virtual,
             ${EXPIRES} AS subscription_expires_at,
             u.last_seen_at::timestamptz AS last_seen_at,
             lp.paid_at AS last_paid_at, lp.amount AS last_paid_amount,
             (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'city', t.city, 'logo_url', t.logo_url) ORDER BY t.name)
                FROM team_members tm
                JOIN teams t ON t.id = tm.team_id
               WHERE tm.user_id = u.id AND tm.left_at IS NULL) AS current_teams
        FROM users u
        LEFT JOIN LATERAL (
          SELECT so.paid_at::timestamptz AS paid_at, so.amount
            FROM subscription_orders so
           WHERE so.user_id = u.id AND so.status = 'paid'
           ORDER BY so.paid_at DESC NULLS LAST
           LIMIT 1
        ) lp ON true
       WHERE ${where}
       ORDER BY ${order}
       LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    let counts = null;
    if (page === 1) {
      const countParams = [];
      const countWhere = buildFilterWhere(filter, countParams, { withStatus: false });
      const countRes = await pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE ${STATUS_WHERE.active})::int AS active,
               COUNT(*) FILTER (WHERE ${STATUS_WHERE.expiring})::int AS expiring,
               COUNT(*) FILTER (WHERE ${STATUS_WHERE.expired})::int AS expired,
               COUNT(*) FILTER (WHERE ${STATUS_WHERE.never})::int AS never
          FROM users u
         WHERE ${countWhere}
      `, countParams);
      counts = countRes.rows[0];
    }

    res.json({ success: true, data: rows, hasMore: rows.length === limit, counts });
  } catch (err) {
    console.error('Ошибка списка подписок:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// ── GET /api/subscriptions/teams ──────────────────────────────────────────
// Команды для фильтра и для «по командам» — только те, где сейчас кто-то есть
export const getSubscriptionTeams = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.id, t.name, t.city, t.logo_url
        FROM teams t
       WHERE EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.left_at IS NULL)
          OR EXISTS (SELECT 1 FROM team_owners o WHERE o.team_id = t.id)
       ORDER BY t.name
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Ошибка списка команд для подписок:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// ── POST /api/subscriptions/preview ───────────────────────────────────────
// Что произойдёт, без записи: сколько затронет, у скольких дата поменяется, у скольких
// сократится — и сколько из сокращённых платили сами.
export const previewSubscriptionChange = async (req, res) => {
  try {
    const parsed = parseChangeRequest(req.body);
    if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });

    const params = [];
    const { where } = resolveTarget(parsed.target, params);
    const newExpr = newValueSql(parsed.action, params);

    const { rows } = await pool.query(`
      WITH t AS (
        SELECT u.id, ${EXPIRES} AS old FROM users u WHERE ${where}
      ),
      c AS (SELECT t.id, t.old, ${newExpr} AS new FROM t)
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE c.new IS DISTINCT FROM c.old)::int AS changed,
             COUNT(*) FILTER (WHERE c.old IS NOT NULL AND c.new < c.old)::int AS shortened,
             COUNT(*) FILTER (WHERE c.old IS NOT NULL AND c.new < c.old
                                AND EXISTS (SELECT 1 FROM subscription_orders so
                                             WHERE so.user_id = c.id AND so.status = 'paid'))::int AS shortened_paid
        FROM c
    `, params);

    res.json({ success: true, ...rows[0] });
  } catch (err) {
    console.error('Ошибка предпросмотра изменения подписок:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// ── POST /api/subscriptions/apply ─────────────────────────────────────────
// Применить и записать в журнал. Строки пользователей блокируются на время операции:
// оплата, пришедшая в ту же секунду, подождёт и продлит уже новую дату, а не затрётся.
// Если дата ни у кого не поменялась, операция в журнал не пишется.
export const applySubscriptionChange = async (req, res) => {
  const parsed = parseChangeRequest(req.body);
  if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });
  const comment = String(req.body?.comment || '').trim().slice(0, MAX_COMMENT) || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const target = await targetForJournal(client, parsed.target);
    const { rows: opRows } = await client.query(`
      INSERT INTO subscription_operations (admin_id, action, params, comment)
      VALUES ($1, $2, $3::jsonb, $4)
      RETURNING id
    `, [req.user.id, parsed.action.type, JSON.stringify({ ...actionForJournal(parsed.action), target }), comment]);
    const operationId = opRows[0].id;

    const params = [operationId];
    const { where } = resolveTarget(parsed.target, params);
    const newExpr = newValueSql(parsed.action, params);

    // В журнал идёт дата в том виде, как она легла в users: её потом сверяет отмена
    const { rowCount } = await client.query(`
      WITH t AS (
        SELECT u.id, ${EXPIRES} AS old
          FROM users u
         WHERE ${where}
           FOR UPDATE OF u
      ),
      c AS (SELECT t.id, t.old, ${newExpr} AS new FROM t),
      upd AS (
        UPDATE users u SET subscription_expires_at = c.new
          FROM c
         WHERE u.id = c.id AND c.new IS DISTINCT FROM c.old
        RETURNING u.id, c.old, ${EXPIRES} AS stored
      )
      INSERT INTO subscription_changes (operation_id, user_id, old_expires_at, new_expires_at)
      SELECT $1, upd.id, upd.old, upd.stored FROM upd
    `, params);

    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.json({ success: true, operationId: null, changed: 0 });
    }

    await client.query('UPDATE subscription_operations SET affected_count = $2 WHERE id = $1', [operationId, rowCount]);
    await client.query('COMMIT');
    res.json({ success: true, operationId, changed: rowCount });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Ошибка изменения подписок:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

// ── GET /api/subscriptions/operations ─────────────────────────────────────
// Журнал: свежие сверху, постранично
export const getSubscriptionOperations = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));

    const { rows } = await pool.query(`
      SELECT op.id, op.action, op.params, op.comment, op.affected_count, op.created_at,
             op.undo_of, op.undone_at,
             a.last_name AS admin_last_name, a.first_name AS admin_first_name,
             ub.last_name AS undone_by_last_name, ub.first_name AS undone_by_first_name
        FROM subscription_operations op
        LEFT JOIN users a ON a.id = op.admin_id
        LEFT JOIN users ub ON ub.id = op.undone_by
       ORDER BY op.id DESC
       LIMIT $1 OFFSET $2
    `, [limit, (page - 1) * limit]);

    res.json({ success: true, data: rows, hasMore: rows.length === limit });
  } catch (err) {
    console.error('Ошибка журнала подписок:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// Операцию можно отменить, если она не сама отмена и ещё не отменена
const loadUndoableOperation = async (client, operationId, { lock = false } = {}) => {
  const { rows } = await client.query(
    `SELECT id, action, undone_at FROM subscription_operations WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [operationId]
  );
  if (rows.length === 0) return { status: 404, error: 'Операция не найдена' };
  if (rows[0].action === 'undo') return { status: 400, error: 'Отмену отменить нельзя' };
  if (rows[0].undone_at) return { status: 400, error: 'Операция уже отменена' };
  return { operation: rows[0] };
};

// ── GET /api/subscriptions/operations/:id/undo-preview ────────────────────
// Скольким вернётся прежняя дата, а скольких отмена пропустит
export const previewUndoOperation = async (req, res) => {
  try {
    const operationId = Number(req.params.id);
    const check = await loadUndoableOperation(pool, operationId);
    if (check.error) return res.status(check.status).json({ success: false, error: check.error });

    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE ${REVERTABLE})::int AS revertable
        FROM subscription_changes ch
        JOIN users u ON u.id = ch.user_id
       WHERE ch.operation_id = $1
    `, [operationId]);

    const { total, revertable } = rows[0];
    res.json({ success: true, total, revertable, skipped: total - revertable });
  } catch (err) {
    console.error('Ошибка предпросмотра отмены операции подписок:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// ── POST /api/subscriptions/operations/:id/undo ───────────────────────────
// Вернуть прежние даты тем, кого с тех пор никто не трогал. Отмена сама пишется в журнал
// операцией undo (с было/стало), а исходная помечается отменённой. Если вернуть некому,
// ничего не пишем.
export const undoSubscriptionOperation = async (req, res) => {
  const operationId = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await loadUndoableOperation(client, operationId, { lock: true });
    if (check.error) {
      await client.query('ROLLBACK');
      return res.status(check.status).json({ success: false, error: check.error });
    }

    const { rows: totalRows } = await client.query(
      'SELECT COUNT(*)::int AS total FROM subscription_changes WHERE operation_id = $1',
      [operationId]
    );
    const total = totalRows[0].total;

    const { rows: undoRows } = await client.query(`
      INSERT INTO subscription_operations (admin_id, action, params, undo_of)
      VALUES ($1, 'undo', '{}'::jsonb, $2)
      RETURNING id
    `, [req.user.id, operationId]);
    const undoId = undoRows[0].id;

    const { rowCount } = await client.query(`
      WITH cand AS (
        SELECT ch.user_id, ch.old_expires_at, ${EXPIRES} AS cur
          FROM subscription_changes ch
          JOIN users u ON u.id = ch.user_id
         WHERE ch.operation_id = $1
           AND ${REVERTABLE}
           FOR UPDATE OF u
      ),
      upd AS (
        UPDATE users u SET subscription_expires_at = cand.old_expires_at
          FROM cand
         WHERE u.id = cand.user_id
        RETURNING u.id, cand.cur, ${EXPIRES} AS stored
      )
      INSERT INTO subscription_changes (operation_id, user_id, old_expires_at, new_expires_at)
      SELECT $2, upd.id, upd.cur, upd.stored FROM upd
    `, [operationId, undoId]);

    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Вернуть некому: у всех затронутых дату с тех пор меняли' });
    }

    const skipped = total - rowCount;
    await client.query(
      `UPDATE subscription_operations SET affected_count = $2, params = jsonb_build_object('skipped', $3::int) WHERE id = $1`,
      [undoId, rowCount, skipped]
    );
    await client.query(
      'UPDATE subscription_operations SET undone_at = now(), undone_by = $2 WHERE id = $1',
      [operationId, req.user.id]
    );
    await client.query('COMMIT');
    res.json({ success: true, reverted: rowCount, skipped });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Ошибка отмены операции подписок:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

// ── GET /api/subscriptions/users/:userId/history ──────────────────────────
// История человека: оплаты и ручные изменения, свежие сверху. Пробный период при
// регистрации нигде не записан — его в истории нет.
export const getSubscriptionUserHistory = async (req, res) => {
  try {
    const userId = Number(req.params.userId);

    const { rows: userRows } = await pool.query(`
      SELECT u.id, u.last_name, u.first_name, u.middle_name, u.phone,
             (u.virtual_code IS NOT NULL) AS is_virtual,
             ${EXPIRES} AS subscription_expires_at
        FROM users u
       WHERE u.id = $1
    `, [userId]);
    if (userRows.length === 0) return res.status(404).json({ success: false, error: 'Пользователь не найден' });

    const [payments, changes] = await Promise.all([
      pool.query(`
        SELECT so.id, so.paid_at::timestamptz AS at, so.amount, sp.name AS plan_name, sp.duration_months
          FROM subscription_orders so
          LEFT JOIN subscription_plans sp ON sp.id = so.plan_id
         WHERE so.user_id = $1 AND so.status = 'paid'
         ORDER BY so.id DESC
      `, [userId]),
      pool.query(`
        SELECT ch.id, ch.created_at AS at, ch.old_expires_at, ch.new_expires_at,
               op.id AS operation_id, op.action, op.params, op.comment, op.undo_of, op.undone_at,
               a.last_name AS admin_last_name, a.first_name AS admin_first_name
          FROM subscription_changes ch
          JOIN subscription_operations op ON op.id = ch.operation_id
          LEFT JOIN users a ON a.id = op.admin_id
         WHERE ch.user_id = $1
         ORDER BY ch.id DESC
      `, [userId]),
    ]);

    // Свежие сверху; при равном времени — по порядку записи (миллисекунды у JS грубее базы)
    const events = [
      ...payments.rows.map(p => ({ kind: 'payment', ...p })),
      ...changes.rows.map(c => ({ kind: 'change', ...c })),
    ].sort((a, b) => (new Date(b.at || 0) - new Date(a.at || 0)) || (b.id - a.id));

    res.json({ success: true, user: userRows[0], events });
  } catch (err) {
    console.error('Ошибка истории подписки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
