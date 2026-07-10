import pool from '../config/db.js';

// Список матчей вне лиг (division_id IS NULL) — товарищеские PWA, товарищеские
// с внешним соперником и матчи внешних турниров, которые команды создают сами
// в Team-Room, без участия лиги. Доступ — только глобальный админ (см.
// PERMISSIONS.LEAGUELESS_MATCHES_ACCESS = [] в routes/leaguelessGamesRoutes.js).
// Таких матчей могут быть тысячи, поэтому — постраничная выдача (20/страница)
// + фильтры по типу/статусу/названию команды.
export const getLeaguelessGames = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const { gameType, status, search } = req.query;

    const conditions = ['g.division_id IS NULL'];
    const params = [];

    if (gameType) {
      params.push(gameType);
      conditions.push(`g.game_type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`g.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(ht.name ILIKE $${idx} OR at.name ILIKE $${idx} OR eo.name ILIKE $${idx})`);
    }

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const query = `
      SELECT
        g.id, g.game_date, g.status, g.game_type, g.home_score, g.away_score,
        g.home_team_id, g.away_team_id, g.away_external_id,
        ht.name AS home_team_name, ht.logo_url AS home_team_logo,
        COALESCE(at.name, eo.name) AS away_team_name,
        COALESCE(at.logo_url, eo.logo_url) AS away_team_logo,
        -- Арена может быть выбрана из справочника (arena_id) либо указана вручную
        -- свободным текстом (games.location) — эти два способа взаимоисключающие.
        -- Город известен только для арены из справочника.
        COALESCE(a.name, g.location) AS arena_name,
        a.city AS arena_city,
        COUNT(*) OVER()::int AS total_count
      FROM "public"."games" g
      LEFT JOIN "public"."teams" ht ON g.home_team_id = ht.id
      LEFT JOIN "public"."teams" at ON g.away_team_id = at.id
      LEFT JOIN "public"."external_opponents" eo ON g.away_external_id = eo.id
      LEFT JOIN "public"."arenas" a ON g.arena_id = a.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY g.game_date DESC NULLS LAST, g.id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const { rows } = await pool.query(query, params);
    const total = rows[0]?.total_count || 0;

    res.json({
      success: true,
      data: rows.map(({ total_count, ...row }) => row),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('Ошибка получения списка матчей вне лиг:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
