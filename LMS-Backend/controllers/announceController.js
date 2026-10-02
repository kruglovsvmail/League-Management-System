// LMS-Backend/controllers/announceController.js
//
// Анонс матчей — картинки для соцсетей из расписания дивизиона (страница
// «Расписание матчей» → кнопка анонса). Шаблоны и материалы лиг — в src/announces/.
//
// Превью и готовая картинка строятся из одного и того же HTML: превью окно
// показывает в iframe, а готовую картинку снимает сервер в Chromium.
import pool from '../config/db.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { buildAnnouncePages } from '../src/announces/announce-factory.js';
import { renderAnnouncePngs } from '../utils/announceScreenshot.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const PUBLIC_BASE = 'https://s3.twcstorage.ru/hockeyeco-uploads';
const MAX_GAMES = 40;

const toAbsolute = (p) => {
    if (!p) return null;
    if (p.startsWith('http')) return p;
    return `${PUBLIC_BASE}/${p.startsWith('/') ? p.slice(1) : p}`;
};

const parseGameIds = (raw) => {
    if (!Array.isArray(raw)) return null;
    const ids = [...new Set(raw.map(Number))].filter(n => Number.isInteger(n) && n > 0);
    return ids.length > 0 && ids.length <= MAX_GAMES ? ids : null;
};

// Данные для шаблона — в нейтральном виде: как их нарисовать (регистр, формат
// даты, нужен ли город арены), решает сам шаблон лиги.
const loadAnnounceData = async (divisionId, gameIds) => {
    const divRes = await pool.query(`
        SELECT d.id, d.name, d.short_name, d.logo_url,
               l.id AS league_id, l.name AS league_name, l.short_name AS league_short,
               l.city AS league_city, l.logo_url AS league_logo
        FROM divisions d
        JOIN seasons s ON s.id = d.season_id
        JOIN leagues l ON l.id = s.league_id
        WHERE d.id = $1
    `, [divisionId]);
    if (divRes.rows.length === 0) return null;
    const div = divRes.rows[0];

    // Матчи только этого дивизиона: чужие id из запроса молча отбрасываются,
    // права проверены по дивизиону. Порядок — по времени начала.
    const gamesRes = await pool.query(`
        SELECT g.id, g.game_date, g.stage_type, g.stage_label, g.series_number, g.playoff_match_type,
               g.status, g.home_score, g.away_score, g.end_type, g.is_technical,
               a.name AS arena_name, a.city AS arena_city, a.timezone AS arena_timezone,
               COALESCE(tt_h.snap_name, ht.name) AS home_name,
               COALESCE(tt_h.snap_short_name, ht.short_name) AS home_short,
               COALESCE(tt_h.snap_city, ht.city) AS home_city,
               COALESCE(tt_h.snap_logo_url, ht.logo_url) AS home_logo,
               COALESCE(tt_a.snap_name, at.name) AS away_name,
               COALESCE(tt_a.snap_short_name, at.short_name) AS away_short,
               COALESCE(tt_a.snap_city, at.city) AS away_city,
               COALESCE(tt_a.snap_logo_url, at.logo_url) AS away_logo
        FROM games g
        LEFT JOIN teams ht ON ht.id = g.home_team_id
        LEFT JOIN teams at ON at.id = g.away_team_id
        LEFT JOIN tournament_teams tt_h ON tt_h.team_id = g.home_team_id AND tt_h.division_id = g.division_id
        LEFT JOIN tournament_teams tt_a ON tt_a.team_id = g.away_team_id AND tt_a.division_id = g.division_id
        LEFT JOIN arenas a ON a.id = g.arena_id
        WHERE g.division_id = $1 AND g.id = ANY($2::int[])
        ORDER BY g.game_date ASC NULLS LAST, g.game_number ASC NULLS LAST, g.id ASC
    `, [divisionId, gameIds]);

    const games = gamesRes.rows.map(r => {
        // Время — в поясе арены, как в карточке матча и в протоколе.
        const d = r.game_date ? dayjs.utc(r.game_date).tz(r.arena_timezone || 'UTC') : null;
        return {
            id: r.id,
            date: d ? {
                day: d.date(), month: d.month() + 1, year: d.year(), weekday: d.day(),
                hours: d.format('HH'), minutes: d.format('mm'),
            } : null,
            stage: {
                type: r.stage_type,
                label: r.stage_label,
                // series_number: в регулярке это тур, в плей-офф — номер матча в серии
                number: r.series_number,
                matchType: r.playoff_match_type,
            },
            // Счёт — только у сыгранного матча. endType: 'regular' | 'ot' | 'so' | 'tech'
            result: r.status === 'finished' ? {
                home: r.home_score ?? 0,
                away: r.away_score ?? 0,
                endType: r.end_type,
                technical: !!r.is_technical || r.end_type === 'tech',
            } : null,
            home: { name: r.home_name, shortName: r.home_short, city: r.home_city, logo: toAbsolute(r.home_logo) },
            away: { name: r.away_name, shortName: r.away_short, city: r.away_city, logo: toAbsolute(r.away_logo) },
            arena: r.arena_name ? { name: r.arena_name, city: r.arena_city } : null,
        };
    });

    return {
        league: {
            id: div.league_id, name: div.league_name, shortName: div.league_short,
            city: div.league_city, logo: toAbsolute(div.league_logo),
        },
        division: { id: div.id, name: div.name, shortName: div.short_name, logo: toAbsolute(div.logo_url) },
        games,
    };
};

const prepare = async (req, res) => {
    const gameIds = parseGameIds(req.body?.gameIds);
    if (!gameIds) {
        res.status(400).json({ success: false, error: `Выберите от 1 до ${MAX_GAMES} матчей` });
        return null;
    }
    const data = await loadAnnounceData(req.params.divisionId, gameIds);
    if (!data) {
        res.status(404).json({ success: false, error: 'Дивизион не найден' });
        return null;
    }
    if (data.games.length === 0) {
        res.status(400).json({ success: false, error: 'Выбранные матчи не найдены в этом дивизионе' });
        return null;
    }
    return buildAnnouncePages(data);
};

// POST /api/divisions/:divisionId/announce/preview — HTML картинок для превью.
export const previewAnnounce = async (req, res) => {
    try {
        const built = await prepare(req, res);
        if (!built) return;
        res.json({ success: true, ...built });
    } catch (err) {
        console.error('Ошибка превью анонса:', err);
        res.status(500).json({ success: false, error: 'Не удалось собрать анонс' });
    }
};

// POST /api/divisions/:divisionId/announce/render — готовые PNG (data-URI).
export const renderAnnounce = async (req, res) => {
    try {
        const built = await prepare(req, res);
        if (!built) return;
        const pngs = await renderAnnouncePngs(built.pages, built);
        res.json({
            success: true,
            images: pngs.map(buf => `data:image/png;base64,${buf.toString('base64')}`),
        });
    } catch (err) {
        console.error('Ошибка генерации анонса:', err);
        res.status(500).json({ success: false, error: 'Не удалось сгенерировать картинку' });
    }
};
