// LMS-Backend/utils/gameSchedule.js
//
// Расписание матча лиги. Организатор вписывает арену, дату и время по отдельности
// (games.arena_id, draft_date, draft_time) в любом сочетании: только дату, арену и
// время без даты и т.п. Дата и время — «стенные часы» арены, без часового пояса.
//
// Точный момент начала (games.game_date, timestamptz) из черновика считает только
// сервер, и только когда известны все три: (дата + время) по поясу арены из
// справочника arenas. Чего-то не хватает — game_date пуст. По game_date работает всё
// остальное: календарь и пуши Team-Room, окно секретаря, дедлайны заявки.
//
// Черновик не стирается и после того, как момент посчитан: при смене арены момент
// пересчитывается от тех же цифр по поясу новой арены, и «19:30» остаётся 19:30 по
// местным часам. Браузер момент не считает — у него под рукой только список арен лиги.

// Черновик всегда отдаём строками 'YYYY-MM-DD' и 'HH:MM': голый date драйвер pg
// превращает в полночь по часам процесса и на серверах в другом поясе сдвигает день.
export const DRAFT_SELECT = `to_char(g.draft_date, 'YYYY-MM-DD') AS draft_date, to_char(g.draft_time, 'HH24:MI') AS draft_time`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Пустая строка и null — «не назначено». Иначе строго 'YYYY-MM-DD' / 'HH:MM'.
// Возвращает { value } или { error }.
export const normalizeDraftDate = (v) => {
    if (v === null || v === '') return { value: null };
    if (typeof v !== 'string' || !DATE_RE.test(v)) return { error: 'Неверный формат даты матча' };
    return { value: v };
};

export const normalizeDraftTime = (v) => {
    if (v === null || v === '') return { value: null };
    const t = typeof v === 'string' ? v.slice(0, 5) : v;
    if (typeof t !== 'string' || !TIME_RE.test(t)) return { error: 'Неверный формат времени матча' };
    return { value: t };
};

// Пересчитывает game_date из черновика и пояса арены. NULL в любом из трёх даёт NULL.
export const syncGameStart = async (db, gameId) => {
    const { rows } = await db.query(`
        UPDATE games g
        SET game_date = (g.draft_date + g.draft_time) AT TIME ZONE (SELECT a.timezone FROM arenas a WHERE a.id = g.arena_id)
        WHERE g.id = $1
        RETURNING g.game_date
    `, [gameId]);
    return rows[0]?.game_date ?? null;
};

export const SCHEDULE_INCOMPLETE_ERROR = 'Сначала назначьте матчу арену, дату и время в расписании.';
