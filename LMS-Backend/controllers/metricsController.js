import pool from '../config/db.js';

const PAGE_LABELS = {
  calendar: 'Календарь',
  event_details: 'Детали события',
  my_teams: 'Мои команды',
  tournaments: 'Турниры/Лиги',
};

const labelFor = (page) => PAGE_LABELS[page] || page;

// Часовой пояс клуба, по которому считаются календарные сутки в метриках
// (совпадает с дефолтом push_subscriptions.timezone и pushService.js).
const CLUB_TIMEZONE = 'Europe/Moscow';

// Извлекает "YYYY-MM-DD" из локальных компонентов даты (getFullYear/getMonth/getDate),
// а НЕ через toISOString() — тот конвертирует в UTC и сдвигает календарный день назад
// на любом сервере, где локальный часовой пояс опережает UTC (что и было причиной бага
// "сегодняшние визиты не попадают в график"). Работает корректно для дат, уже
// извлечённых из Postgres (pg парсит DATE через локальные компоненты, поэтому
// getFullYear/getMonth/getDate всегда воспроизводят исходный Y-M-D один в один).
const toDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Возвращает {year, month, day} текущей календарной даты по часовому поясу клуба
// (Europe/Moscow) — независимо от таймзоны окружения, в котором фактически запущен
// процесс Node (TZ сервера явно не задан). Используется только чтобы правильно
// определить "сегодня" при выборе диапазона по умолчанию (неделя/месяц).
const todayInClubTimezone = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
};

// ── GET /api/metrics/summary ─────────────────────────────────────────────
export const getSummary = async (req, res) => {
  try {
    const totalsRes = await pool.query(
      `SELECT COALESCE(SUM(visit_count), 0) AS total_visits, COUNT(DISTINCT user_id) AS unique_users FROM page_visits`
    );

    const byPageRes = await pool.query(
      `SELECT page, SUM(visit_count) AS total_visits, COUNT(DISTINCT user_id) AS unique_users
       FROM page_visits
       GROUP BY page
       ORDER BY total_visits DESC`
    );

    const byPage = byPageRes.rows.map((r) => ({
      page: r.page,
      label: labelFor(r.page),
      total_visits: Number(r.total_visits),
      unique_users: Number(r.unique_users),
    }));

    res.json({
      success: true,
      total_visits: Number(totalsRes.rows[0].total_visits),
      unique_users: Number(totalsRes.rows[0].unique_users),
      top_page: byPage[0] || null,
      by_page: byPage,
    });
  } catch (err) {
    console.error('Ошибка в metricsController.getSummary:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке сводки метрик' });
  }
};

// Разрешённые колонки сортировки для /top-users — белый список, чтобы нельзя было
// подставить произвольный SQL через query-параметр.
const TOP_USERS_SORT_COLUMNS = {
  last_visited: { expr: 'last_visited_at', nulls: 'LAST', defaultDir: 'DESC' },
  name: { expr: 'u.last_name, u.first_name', defaultDir: 'ASC' },
  visits: { expr: 'total_visits', defaultDir: 'DESC' },
  push: { expr: 'push_device_count', defaultDir: 'DESC' },
};

// ── GET /api/metrics/top-users?page=1&search=иванов&sort=last_visited&dir=desc ───
// Постраничный список пользователей (15 на страницу) с поиском по имени/фамилии.
// Сортировка серверная — применяется до пагинации, поэтому корректно упорядочивает
// вообще всех пользователей, а не только тех, что видны на текущей странице.
export const getTopUsers = async (req, res) => {
  try {
    const PAGE_SIZE = 15;
    const pageNum = Math.max(1, Number(req.query.page) || 1);
    const search = (req.query.search || '').trim();

    const sortKey = TOP_USERS_SORT_COLUMNS[req.query.sort] ? req.query.sort : 'last_visited';
    const sortCol = TOP_USERS_SORT_COLUMNS[sortKey];
    const direction = req.query.dir === 'asc' ? 'ASC' : req.query.dir === 'desc' ? 'DESC' : sortCol.defaultDir;
    // Для составной сортировки "name" (last_name, first_name) направление применяется к обеим частям
    const orderByExpr = sortCol.expr
      .split(',')
      .map((part) => `${part.trim()} ${direction}${sortCol.nulls ? ` NULLS ${sortCol.nulls}` : ''}`)
      .join(', ');

    // Один и тот же фильтр для подсчёта страниц и для выборки данных
    const searchWhere = `($1 = '' OR u.first_name ILIKE '%' || $1 || '%' OR u.last_name ILIKE '%' || $1 || '%'
                          OR (u.first_name || ' ' || u.last_name) ILIKE '%' || $1 || '%'
                          OR (u.last_name || ' ' || u.first_name) ILIKE '%' || $1 || '%')`;

    const countRes = await pool.query(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM page_visits pv
       JOIN users u ON u.id = pv.user_id
       WHERE ${searchWhere}`,
      [search]
    );
    const total = Number(countRes.rows[0].total);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // last_visited_at — MAX по page_visits (4 инструментированных раздела Team-Room) и
    // u.last_seen_at (обновляется middleware verifyToken на КАЖДЫЙ авторизованный запрос,
    // в любом бэкенде) — берём более позднее из двух: так одиночный сбой fire-and-forget
    // запроса usePageVisit (протухший токен, сетевой сбой) не занижает дату последнего визита.
    const { rows } = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.avatar_url,
              SUM(pv.visit_count) AS total_visits,
              GREATEST(MAX(pv.last_visited_at), u.last_seen_at) AS last_visited_at,
              COALESCE(ps.device_count, 0) AS push_device_count
       FROM page_visits pv
       JOIN users u ON u.id = pv.user_id
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS device_count
         FROM push_subscriptions
         GROUP BY user_id
       ) ps ON ps.user_id = u.id
       WHERE ${searchWhere}
       GROUP BY u.id, u.first_name, u.last_name, u.avatar_url, u.last_seen_at, ps.device_count
       ORDER BY ${orderByExpr}, u.id ASC
       LIMIT $2 OFFSET $3`,
      [search, PAGE_SIZE, (pageNum - 1) * PAGE_SIZE]
    );

    // Команды (активное членство, left_at IS NULL) для пользователей этой страницы — с логотипом
    const userIds = rows.map((r) => r.id);
    let teamsByUser = new Map();
    if (userIds.length > 0) {
      const teamsRes = await pool.query(
        `SELECT tm.user_id, t.id AS team_id, t.name, t.short_name, t.logo_url
         FROM team_members tm
         JOIN teams t ON t.id = tm.team_id
         WHERE tm.user_id = ANY($1) AND tm.left_at IS NULL
         ORDER BY t.name`,
        [userIds]
      );
      teamsByUser = teamsRes.rows.reduce((map, r) => {
        const list = map.get(r.user_id) || [];
        list.push({ id: r.team_id, name: r.name, short_name: r.short_name, logo_url: r.logo_url });
        map.set(r.user_id, list);
        return map;
      }, new Map());
    }

    res.json({
      success: true,
      users: rows.map((r) => ({
        ...r,
        total_visits: Number(r.total_visits),
        push_device_count: Number(r.push_device_count),
        teams: teamsByUser.get(r.id) || [],
      })),
      total,
      totalPages,
      page: pageNum,
      sort: sortKey,
      dir: direction.toLowerCase(),
    });
  } catch (err) {
    console.error('Ошибка в metricsController.getTopUsers:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке топа пользователей' });
  }
};

// ── GET /api/metrics/user/:userId ────────────────────────────────────────
export const getUserDetail = async (req, res) => {
  try {
    const { userId } = req.params;

    const userRes = await pool.query(
      `SELECT id, first_name, last_name, avatar_url FROM users WHERE id = $1`,
      [userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    const visitsRes = await pool.query(
      `SELECT page, visit_count, last_visited_at FROM page_visits WHERE user_id = $1 ORDER BY visit_count DESC`,
      [userId]
    );

    res.json({
      success: true,
      user: userRes.rows[0],
      visits: visitsRes.rows.map((r) => ({ ...r, label: labelFor(r.page), visit_count: Number(r.visit_count) })),
    });
  } catch (err) {
    console.error('Ошибка в metricsController.getUserDetail:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке карточки пользователя' });
  }
};

// ── GET /api/metrics/daily?page=all|total|<раздел>&range=week|month|custom&from=&to= ────
// page='all' — четыре линии разделов + пятая суммарная «Общие»;
// page='total' — только суммарная линия «Общие»;
// page=<раздел> — одна линия конкретного раздела.
export const getDaily = async (req, res) => {
  try {
    const page = req.query.page || 'all';
    // Для SQL-фильтров «Общие» эквивалентны «все разделы» — отличается только сборка серий
    const pageFilter = page === 'total' ? 'all' : page;
    const { from, to } = req.query;

    let startDate, endDate;

    if (req.query.range === 'custom' && from && to) {
      startDate = new Date(`${from}T00:00:00`);
      endDate = new Date(`${to}T00:00:00`);
    } else {
      const rangeDays = req.query.range === 'month' ? 30 : 7;
      // «Сегодня» — по часовому поясу клуба (Europe/Moscow), а не по таймзоне сервера,
      // на котором фактически запущен процесс (TZ там не задан явно).
      const today = todayInClubTimezone();
      endDate = new Date(today.year, today.month - 1, today.day);
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - (rangeDays - 1));
    }

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return res.status(400).json({ success: false, error: 'Некорректный диапазон дат' });
    }

    // Ограничиваем период разумным максимумом, чтобы не улететь в аномально тяжёлый запрос
    const diffDays = Math.round((endDate - startDate) / 86400000) + 1;
    if (diffDays > 366) {
      return res.status(400).json({ success: false, error: 'Диапазон не может превышать 366 дней' });
    }

    const startStr = toDateStr(startDate);
    const endStr = toDateStr(endDate);

    const { rows } = await pool.query(
      `SELECT page, visit_date, visit_count, unique_count
       FROM page_visits_daily
       WHERE visit_date >= $1 AND visit_date <= $2
         AND ($3::text = 'all' OR page = $3)
       ORDER BY visit_date ASC`,
      [startStr, endStr, pageFilter]
    );

    // Строим полный список дат (включая нулевые дни без визитов)
    const dates = [];
    for (let i = 0; i < diffDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      dates.push(toDateStr(d));
    }

    // 'total' — только суммарная линия, разделы не строим
    const pagesInvolved = page === 'all' ? Object.keys(PAGE_LABELS) : page === 'total' ? [] : [page];

    const series = pagesInvolved.map((p) => {
      const pageRows = rows.filter((r) => r.page === p);
      const visitsMap = new Map(pageRows.map((r) => [toDateStr(r.visit_date), Number(r.visit_count)]));
      const uniqueMap = new Map(pageRows.map((r) => [toDateStr(r.visit_date), Number(r.unique_count)]));
      return {
        page: p,
        label: labelFor(p),
        visits: dates.map((d) => visitsMap.get(d) || 0),
        unique: dates.map((d) => uniqueMap.get(d) || 0),
      };
    });

    // Суммарная линия «Общие»: при «Все разделы» — пятой к разделам, при 'total' — единственной.
    // Визиты — сумма по разделам за день. Уникальные — честный COUNT(DISTINCT user_id) за день по
    // сырой таблице page_visits_daily_seen: складывать unique_count разделов нельзя,
    // один человек в нескольких разделах за день задвоился бы (та же ловушка, что была с «пиком»).
    if (page === 'all' || page === 'total') {
      const visitsByDate = new Map();
      rows.forEach((r) => {
        const key = toDateStr(r.visit_date);
        visitsByDate.set(key, (visitsByDate.get(key) || 0) + Number(r.visit_count));
      });

      const dailyUniqueRes = await pool.query(
        `SELECT visit_date, COUNT(DISTINCT user_id) AS uniq
         FROM page_visits_daily_seen
         WHERE visit_date >= $1 AND visit_date <= $2
         GROUP BY visit_date`,
        [startStr, endStr]
      );
      const uniqueByDate = new Map(dailyUniqueRes.rows.map((r) => [toDateStr(r.visit_date), Number(r.uniq)]));

      series.push({
        page: 'total',
        label: 'Общие',
        visits: dates.map((d) => visitsByDate.get(d) || 0),
        unique: dates.map((d) => uniqueByDate.get(d) || 0),
      });
    }

    // Итоги за отображаемый период. Визиты — простая сумма.
    // Уникальные считаем по сырой таблице page_visits_daily_seen (user_id + дата + раздел):
    // суммировать unique_count из page_visits_daily нельзя — один человек, зашедший в несколько
    // разделов (или в несколько дней), задвоился бы, и итог превышал бы реальное число людей.
    const totalVisits = rows.reduce((sum, r) => sum + Number(r.visit_count), 0);

    const uniqueRes = await pool.query(
      `SELECT COUNT(DISTINCT user_id) AS unique_users
       FROM page_visits_daily_seen
       WHERE visit_date >= $1 AND visit_date <= $2
         AND ($3::text = 'all' OR page = $3)`,
      [startStr, endStr, pageFilter]
    );

    res.json({
      success: true,
      dates,
      series,
      range_totals: {
        visits: totalVisits,
        unique_users: Number(uniqueRes.rows[0].unique_users),
      },
    });
  } catch (err) {
    console.error('Ошибка в metricsController.getDaily:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке графика посещений' });
  }
};

// ── GET /api/metrics/audience ────────────────────────────────────────────
// Сводка по аудитории из трёх частей:
// 1) Аккаунты — сколько всего в базе (только status='active'), из них активированных
//    (password_hash задан: сам зарегистрировался или заклеймил профиль) и виртуальных
//    (создан менеджером, человек ещё не пришёл).
// 2) DAU/WAU/MAU — уникальные посетители за сегодня / 7 дней / 30 дней + прилипчивость.
// 3) Охват — сколько игроков команд реально пользуются Team-Room.
export const getAudience = async (req, res) => {
  try {
    const pct = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

    const accountsRes = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE password_hash IS NOT NULL) AS activated,
         COUNT(*) FILTER (WHERE password_hash IS NULL) AS virtual
       FROM users
       WHERE status = 'active'`
    );
    const acc = accountsRes.rows[0];
    const accounts = {
      total: Number(acc.total),
      activated: Number(acc.activated),
      virtual: Number(acc.virtual),
      activated_pct: pct(Number(acc.activated), Number(acc.total)),
      virtual_pct: pct(Number(acc.virtual), Number(acc.total)),
    };

    // Границы суток — по часовому поясу клуба (Europe/Moscow), а не по таймзоне
    // сессии Postgres (CURRENT_DATE там обычно UTC).
    const activityRes = await pool.query(
      `SELECT
         COUNT(DISTINCT user_id) FILTER (WHERE visit_date = (now() AT TIME ZONE 'Europe/Moscow')::date) AS dau,
         COUNT(DISTINCT user_id) FILTER (WHERE visit_date >= (now() AT TIME ZONE 'Europe/Moscow')::date - 6) AS wau,
         COUNT(DISTINCT user_id) AS mau
       FROM page_visits_daily_seen
       WHERE visit_date >= (now() AT TIME ZONE 'Europe/Moscow')::date - 29`
    );
    const act = activityRes.rows[0];
    const activity = {
      dau: Number(act.dau),
      wau: Number(act.wau),
      mau: Number(act.mau),
      stickiness_pct: pct(Number(act.dau), Number(act.mau)),
    };

    const coverageRes = await pool.query(
      `SELECT
         COUNT(DISTINCT tm.user_id) AS total_players,
         COUNT(DISTINCT tm.user_id) FILTER (WHERE pv.user_id IS NOT NULL) AS ever_visited,
         COUNT(DISTINCT tm.user_id) FILTER (WHERE pv.last_visit >= NOW() - INTERVAL '30 days') AS active_30d
       FROM team_members tm
       LEFT JOIN (
         SELECT user_id, MAX(last_visited_at) AS last_visit
         FROM page_visits
         GROUP BY user_id
       ) pv ON pv.user_id = tm.user_id
       WHERE tm.left_at IS NULL`
    );
    const cov = coverageRes.rows[0];
    const coverage = {
      total_players: Number(cov.total_players),
      ever_visited: Number(cov.ever_visited),
      ever_pct: pct(Number(cov.ever_visited), Number(cov.total_players)),
      active_30d: Number(cov.active_30d),
      active_30d_pct: pct(Number(cov.active_30d), Number(cov.total_players)),
    };

    res.json({ success: true, accounts, activity, coverage });
  } catch (err) {
    console.error('Ошибка в metricsController.getAudience:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке сводки аудитории' });
  }
};

// ── GET /api/metrics/engagement ──────────────────────────────────────────
// Глубина использования: сколько пользователей задействуют 1, 2, 3 или все 4 раздела приложения.
export const getEngagement = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sections_count, COUNT(*) AS user_count
       FROM (
         SELECT user_id, COUNT(DISTINCT page) AS sections_count
         FROM page_visits
         GROUP BY user_id
       ) t
       GROUP BY sections_count
       ORDER BY sections_count`
    );

    const plural = (n) => (n === 1 ? 'раздел' : n >= 2 && n <= 4 ? 'раздела' : 'разделов');

    res.json({
      success: true,
      distribution: rows.map((r) => ({
        sections: Number(r.sections_count),
        label: `${r.sections_count} ${plural(Number(r.sections_count))}`,
        user_count: Number(r.user_count),
      })),
    });
  } catch (err) {
    console.error('Ошибка в metricsController.getEngagement:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке глубины использования' });
  }
};

// ── GET /api/metrics/push ─────────────────────────────────────────────────
// Знаменатель — только пользователи, состоящие хотя бы в одной команде (аудитория Team-Room),
// а не все users системы (там ещё судьи/медиа/админы лиги, которым push не актуален).
export const getPushStats = async (req, res) => {
  try {
    const audienceRes = await pool.query(
      `SELECT COUNT(DISTINCT user_id) AS total FROM team_members`
    );
    const totalAudience = Number(audienceRes.rows[0].total);

    const subscribedRes = await pool.query(
      `SELECT COUNT(DISTINCT user_id) AS subscribed FROM push_subscriptions`
    );
    const subscribedUsers = Number(subscribedRes.rows[0].subscribed);

    // Кто именно подписан — смотри колонку "Push" в /metrics/top-users
    // (там же можно отсортировать пользователей по наличию подписки).
    res.json({
      success: true,
      total_audience: totalAudience,
      subscribed_users: subscribedUsers,
      coverage_pct: totalAudience > 0 ? Math.round((subscribedUsers / totalAudience) * 1000) / 10 : 0,
    });
  } catch (err) {
    console.error('Ошибка в metricsController.getPushStats:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке статистики push-подписок' });
  }
};
