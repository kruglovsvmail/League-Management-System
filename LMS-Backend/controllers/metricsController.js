import pool from '../config/db.js';

const PAGE_LABELS = {
  calendar: 'Календарь',
  event_details: 'Детали события',
  my_teams: 'Мои команды',
  tournaments: 'Турниры/Лиги',
};

const labelFor = (page) => PAGE_LABELS[page] || page;

// Извлекает "YYYY-MM-DD" из локальных компонентов даты (getFullYear/getMonth/getDate),
// а НЕ через toISOString() — тот конвертирует в UTC и сдвигает календарный день назад
// на любом сервере, где локальный часовой пояс опережает UTC (что и было причиной бага
// "сегодняшние визиты не попадают в график").
const toDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

// ── GET /api/metrics/top-users?limit=20 ──────────────────────────────────
export const getTopUsers = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const { rows } = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.avatar_url,
              SUM(pv.visit_count) AS total_visits,
              MAX(pv.last_visited_at) AS last_visited_at
       FROM page_visits pv
       JOIN users u ON u.id = pv.user_id
       GROUP BY u.id, u.first_name, u.last_name, u.avatar_url
       ORDER BY total_visits DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      users: rows.map((r) => ({ ...r, total_visits: Number(r.total_visits) })),
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

// ── GET /api/metrics/daily?page=all&range=week|month|custom&from=&to= ────
export const getDaily = async (req, res) => {
  try {
    const page = req.query.page || 'all';
    const { from, to } = req.query;

    let startDate, endDate;

    if (req.query.range === 'custom' && from && to) {
      startDate = new Date(`${from}T00:00:00`);
      endDate = new Date(`${to}T00:00:00`);
    } else {
      const rangeDays = req.query.range === 'month' ? 30 : 7;
      endDate = new Date();
      endDate.setHours(0, 0, 0, 0);
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
      [startStr, endStr, page]
    );

    // Строим полный список дат (включая нулевые дни без визитов)
    const dates = [];
    for (let i = 0; i < diffDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      dates.push(toDateStr(d));
    }

    const pagesInvolved = page === 'all' ? Object.keys(PAGE_LABELS) : [page];

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

    // Суммарные линии по дате (для счётчика пика), отдельно для визитов и уникальных
    const sumByDate = (field) => dates.map((d) =>
      rows.filter((r) => toDateStr(r.visit_date) === d).reduce((sum, r) => sum + Number(r[field]), 0)
    );
    const totalsVisits = sumByDate('visit_count');
    const totalsUnique = sumByDate('unique_count');

    const peakOf = (totals) => {
      let peak = { date: null, count: 0 };
      totals.forEach((count, idx) => {
        if (count > peak.count) peak = { date: dates[idx], count };
      });
      return peak;
    };

    res.json({
      success: true,
      dates,
      series,
      totals: { visits: totalsVisits, unique: totalsUnique },
      peak: { visits: peakOf(totalsVisits), unique: peakOf(totalsUnique) },
    });
  } catch (err) {
    console.error('Ошибка в metricsController.getDaily:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке графика посещений' });
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

    const distributionRes = await pool.query(
      `SELECT
         CASE WHEN device_count >= 3 THEN '3+' ELSE device_count::text END AS bucket,
         COUNT(*) AS user_count
       FROM (
         SELECT user_id, COUNT(*) AS device_count
         FROM push_subscriptions
         GROUP BY user_id
       ) sub
       GROUP BY bucket
       ORDER BY bucket`
    );

    const distribution = distributionRes.rows.map((r) => ({
      bucket: r.bucket,
      label: r.bucket === '3+' ? '3+ устройства' : r.bucket === '1' ? '1 устройство' : `${r.bucket} устройства`,
      user_count: Number(r.user_count),
    }));

    res.json({
      success: true,
      total_audience: totalAudience,
      subscribed_users: subscribedUsers,
      coverage_pct: totalAudience > 0 ? Math.round((subscribedUsers / totalAudience) * 1000) / 10 : 0,
      distribution,
    });
  } catch (err) {
    console.error('Ошибка в metricsController.getPushStats:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке статистики push-подписок' });
  }
};
