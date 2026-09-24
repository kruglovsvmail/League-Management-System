// LMS-Backend/utils/penaltyGroups.js
//
// ─── ВИДЫ ШТРАФОВ И ГРУППЫ СТРОК ───────────────────────────────────────────────
//
// Один штраф в протоколе может занимать несколько строк: «2+2» — две строки по 2,
// «2+10» — двойка и десятка, «5+20» — пятёрка и двадцатка. Каждая строка — своё
// событие в game_events (со своей причиной, началом и окончанием), а вместе их держит
// penalty_group_id (id первой строки) и penalty_group_seq (порядок). Вид штрафа целиком
// (penalty_kind) записан на каждой строке группы — по нему собирается подпись плашки,
// фраза диктора и редактор группы в панели секретаря.
//
// Что даёт модель «строка = событие»: сумма штрафных минут по периодам — обычный
// SUM(penalty_minutes); PDF и панель печатают строки как есть; табло OBS ведёт одну
// позицию на группу (см. calculateOnIcePenalties на фронте).
//
// Строки одной группы идут цепочкой: следующая начинается, когда закончилась
// предыдущая. Исключение — двадцатка в составе 5+20: у неё начало = время нарушения,
// окончания нет (удалён до конца матча).
//
// Классы строк (penalty_class): minor — малый (слот меньшинства), major — большой
// (слот меньшинства, голом не закрывается), misconduct — дисциплинарный 10 минут
// (без слота), game_misconduct — до конца матча (без слота, без окончания),
// penalty_shot — штрафной бросок (без времени). Старые записи (до групп) хранят ещё
// double_minor (одна строка на 4 минуты) и match (одна строка на 25) — их читаем
// через фолбэки, новых таких не создаём.

// display — что печатается на плашке события; rows — строки протокола по порядку.
// Причина у штрафа одна — панель пишет её в строки меньшинства; десятка в «2+10»/«4+10»
// и двадцатка в «5+20» получают дисциплинарную причину сами (см. PENALTY_KINDS в
// LMS-Frontend/src/components/GameLiveDesk/GameDeskShared.jsx).
export const PENALTY_KINDS = {
    minor:                   { display: '2',    rows: [{ minutes: 2,  cls: 'minor' }] },
    double_minor:            { display: '4',    rows: [{ minutes: 2,  cls: 'minor' }, { minutes: 2, cls: 'minor' }] },
    misconduct:              { display: '10',   rows: [{ minutes: 10, cls: 'misconduct' }] },
    minor_misconduct:        { display: '2+10', rows: [{ minutes: 2,  cls: 'minor' }, { minutes: 10, cls: 'misconduct' }] },
    double_minor_misconduct: { display: '4+10', rows: [{ minutes: 2,  cls: 'minor' }, { minutes: 2, cls: 'minor' }, { minutes: 10, cls: 'misconduct' }] },
    game_misconduct:         { display: '20',   rows: [{ minutes: 20, cls: 'game_misconduct' }] },
    major:                   { display: '5+20', rows: [{ minutes: 5,  cls: 'major' }, { minutes: 20, cls: 'game_misconduct' }] },
    penalty_shot:            { display: 'ШБ',   rows: [{ minutes: 0,  cls: 'penalty_shot' }] },
};

// Вид для записей без penalty_kind — по классу и минутам, как их писала старая панель.
// match и одиночный major (5 без 20) — виды, которых больше не заводят, но в старых
// протоколах они остались и должны читаться.
export const legacyPenaltyKind = (penaltyClass, penaltyMinutes) => {
    const m = parseInt(penaltyMinutes, 10);
    if (penaltyClass === 'penalty_shot') return 'penalty_shot';
    if (penaltyClass === 'double_minor' || m === 4) return 'double_minor';
    if (penaltyClass === 'match' || m === 25) return 'match';
    if (penaltyClass === 'major' || m === 5) return 'legacy_major';
    if (penaltyClass === 'misconduct' || m === 10) return 'misconduct';
    if (penaltyClass === 'game_misconduct' || m === 20) return 'game_misconduct';
    return 'minor';
};

const LEGACY_DISPLAY = { match: '5+20', legacy_major: '5' };

export const penaltyKindDisplay = (kind) => PENALTY_KINDS[kind]?.display ?? LEGACY_DISPLAY[kind] ?? '';

// Подзапрос со строками группы — подключается к любому запросу по game_events с
// алиасом ge. Отдаёт все строки группы по порядку: причины (наименование, сокращение,
// падеж из справочника лиги), минуты и класс. По ним decoratePenaltyEvent собирает
// подпись плашки и фразу диктора для ПЕРВОЙ строки группы.
export const PENALTY_GROUP_LATERAL = `
    LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
                   'seq', pgr.penalty_group_seq,
                   'minutes', pgr.penalty_minutes,
                   'class', pgr.penalty_class,
                   'violation', pgr.penalty_violation,
                   'code', pgr.penalty_violation_code,
                   'accusative', pgt.tts_accusative
               ) ORDER BY pgr.penalty_group_seq, pgr.id) AS rows
        FROM game_events pgr
        LEFT JOIN penalty_types pgt ON pgt.id = pgr.penalty_reason_id
        WHERE pgr.penalty_group_id = ge.penalty_group_id
    ) pg ON ge.event_type = 'penalty' AND ge.penalty_group_id IS NOT NULL
`;

// Колонки, которые запрос должен отдать рядом с PENALTY_GROUP_LATERAL
export const PENALTY_GROUP_COLUMNS = `
    ge.penalty_kind, ge.penalty_group_id, ge.penalty_group_seq,
    pg.rows AS penalty_group_rows
`;

const uniqueNonEmpty = (values) => {
    const seen = new Set();
    return values.filter(v => {
        const s = String(v || '').trim();
        if (!s || seen.has(s)) return false;
        seen.add(s);
        return true;
    });
};

/**
 * Дополняет строку события полями группы:
 *   penalty_kind               — вид (у старых записей вычисляется по классу и минутам);
 *   penalty_display            — подпись плашки: «4», «2+10», «5+20», «ШБ»;
 *   penalty_reasons            — причины всех строк группы без повторов (наименования);
 *   penalty_reasons_text       — они же через « / » — для плашки и списков;
 *   penalty_reasons_accusative — падежи причин для диктора (только заполненные);
 *   penalty_accusative         — падеж причины самой строки (для одиночных записей).
 * Строки, которых нет в группе (старые записи), описываются сами собой.
 */
export const decoratePenaltyEvent = (row) => {
    if (!row || row.event_type !== 'penalty') return row;

    const groupRows = Array.isArray(row.penalty_group_rows) && row.penalty_group_rows.length > 0
        ? row.penalty_group_rows
        : [{ violation: row.penalty_violation, code: row.penalty_violation_code, accusative: row.penalty_accusative ?? null }];

    const kind = row.penalty_kind || legacyPenaltyKind(row.penalty_class, row.penalty_minutes);
    const reasons = uniqueNonEmpty(groupRows.map(r => r.violation));
    const accusatives = uniqueNonEmpty(groupRows.map(r => r.accusative));

    const { penalty_group_rows, ...rest } = row;
    return {
        ...rest,
        penalty_kind: kind,
        penalty_display: penaltyKindDisplay(kind) || String(row.penalty_minutes ?? ''),
        penalty_reasons: reasons,
        penalty_reasons_text: reasons.join(' / '),
        penalty_reasons_accusative: accusatives,
        penalty_accusative: row.penalty_accusative ?? (groupRows[0]?.accusative ?? null),
    };
};


/**
 * Порядок строк штрафов в протоколе: по времени первой строки группы, а строки одной
 * группы — подряд, по seq. Вторая двойка у 2+2 начинается позже, и без этого между
 * строками одной группы вклинивалось бы чужое удаление, начавшееся в промежутке.
 */
export const sortPenaltyRows = (penalties) => {
  const key = (p) => p.penalty_group_id ?? p.id;
  const seqOf = (p) => Number(p.penalty_group_seq) || 1;
  const first = new Map();
  penalties.forEach(p => {
    const k = key(p);
    const cur = first.get(k);
    if (!cur || seqOf(p) < cur.seq) first.set(k, { seq: seqOf(p), time: parseInt(p.time_seconds, 10) || 0, id: p.id });
  });
  return [...penalties].sort((a, b) => {
    const fa = first.get(key(a)), fb = first.get(key(b));
    return fa.time - fb.time || fa.id - fb.id || seqOf(a) - seqOf(b) || a.id - b.id;
  });
};

// Строки-продолжения группы (вторая двойка, десятка, двадцатка) в эфир и диктору не
// идут — плашка и фраза одна на группу, от первой строки.
export const isPenaltyContinuationRow = (row) =>
    row?.event_type === 'penalty' && row.penalty_group_id != null && Number(row.penalty_group_seq) > 1;


// ─── ОТРЕЗКИ МЕНЬШИНСТВА ───────────────────────────────────────────────────────
// Зеркало calculatePenaltyTimelines и calculateOnIcePenalties из
// LMS-Frontend/src/components/GameLiveDesk/GameDeskShared.jsx. По ним сервер подаёт бип
// перед концом удаления (диктор арены, timerHandler.js) — в те же моменты, когда у
// секретаря гаснут бейджи под таймером. Правите расчёт там — правьте и здесь.

// Классы строк, занимающие слот меньшинства. Старые записи (одна строка на 4 или 25
// минут, класс double_minor/match) — тоже слот: там вся группа лежала в одной строке.
const ON_ICE_CLASSES = ['minor', 'major', 'double_minor', 'match'];
const isOnIceRow = (p) => {
    if (p?.penalty_class) return ON_ICE_CLASSES.includes(p.penalty_class);
    return [2, 4, 5, 25].includes(parseInt(p?.penalty_minutes, 10));
};

const penaltyGroupKey = (p) => p?.penalty_group_id ?? p?.id;

/**
 * Фактические начало и окончание каждой строки штрафа с учётом слотов меньшинства
 * и цепочек внутри группы.
 *
 * Слотов два на команду: третий малый штраф не начинается, пока не освободится
 * слот (стоит в очереди). Внутри группы строки идут цепочкой: следующая начинается,
 * когда закончилась предыдущая. Двадцатка у 5+20 стоит особняком: начало = время
 * нарушения, окончания нет (effEnd = null).
 *
 * Возвращает те же строки в исходном порядке с полями effStart, effEnd, onIce,
 * chainStart, chainEnd (границы отрезка меньшинства всей группы).
 */
export const calculatePenaltyTimelines = (penalties) => {
    const byId = new Map();
    const teams = new Map();
    penalties.forEach(p => {
        const teamKey = p.team_id ?? 'x';
        if (!teams.has(teamKey)) teams.set(teamKey, []);
        teams.get(teamKey).push(p);
    });

    teams.forEach(list => {
        // Группы в порядке начала первой строки; внутри группы — по seq
        const groups = new Map();
        list.forEach(p => {
            const key = penaltyGroupKey(p);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(p);
        });
        const ordered = [...groups.values()]
            .map(rows => rows.sort((a, b) => (Number(a.penalty_group_seq) || 1) - (Number(b.penalty_group_seq) || 1) || a.id - b.id))
            .sort((a, b) => parseInt(a[0].time_seconds, 10) - parseInt(b[0].time_seconds, 10) || a[0].id - b[0].id);

        const slots = [0, 0];
        ordered.forEach(rows => {
            let cursor = parseInt(rows[0].time_seconds, 10);
            if (isNaN(cursor)) cursor = 0;
            let chainStart = null;
            let chainEnd = null;
            let slotTaken = false;

            rows.forEach(p => {
                const start = parseInt(p.time_seconds, 10);
                const storedEnd = parseInt(p.penalty_end_time, 10);
                const onIce = isOnIceRow(p);

                if (p.penalty_class === 'penalty_shot') {
                    const s = isNaN(start) ? 0 : start;
                    byId.set(p.id, { ...p, effStart: s, effEnd: s, onIce: false, chainStart: null, chainEnd: null });
                    return;
                }
                if (p.penalty_class === 'game_misconduct' || isNaN(storedEnd)) {
                    // Удалён до конца матча: считается с момента нарушения, окончания нет
                    byId.set(p.id, { ...p, effStart: isNaN(start) ? cursor : start, effEnd: null, onIce: false, chainStart: null, chainEnd: null });
                    return;
                }

                const duration = Math.max(0, storedEnd - (isNaN(start) ? cursor : start));
                let effStart = cursor;
                if (onIce && !slotTaken) {
                    // Первая строка меньшинства ждёт свободный слот, остальные идут за ней цепочкой
                    slots.sort((a, b) => a - b);
                    if (slots[0] > effStart) effStart = slots[0];
                    slotTaken = true;
                }
                const effEnd = effStart + duration;
                if (onIce) {
                    if (chainStart === null) chainStart = effStart;
                    // У старого матч-штрафа одной строкой на 25 минут слот занят только 5
                    chainEnd = p.penalty_class === 'match' || parseInt(p.penalty_minutes, 10) === 25
                        ? effStart + Math.min(duration, 300)
                        : effEnd;
                }
                cursor = effEnd;
                byId.set(p.id, { ...p, effStart, effEnd, onIce, chainStart, chainEnd });
            });

            if (chainStart !== null) {
                slots.sort((a, b) => a - b);
                slots[0] = chainEnd;
                // Границы цепочки — одни на всю группу
                rows.forEach(p => {
                    const r = byId.get(p.id);
                    if (r && r.onIce) byId.set(p.id, { ...r, chainStart, chainEnd });
                });
            }
        });
    });

    return penalties.map(p => byId.get(p.id) || { ...p, effStart: 0, effEnd: 0, onIce: false, chainStart: null, chainEnd: null });
};

/**
 * Позиции меньшинства: одна на группу — отрезок целиком (у 2+2 это 4 минуты одним
 * отсчётом, у 2+10 — 2, у 5+20 — 5). Дисциплинарные сюда не входят.
 * Возвращает первую строку меньшинства каждой группы с effStart/effEnd = границы цепочки.
 */
export const calculateOnIcePenalties = (penalties) => {
    const rows = calculatePenaltyTimelines(penalties);
    const seen = new Set();
    return rows.filter(p => {
        if (!p.onIce || p.chainStart === null) return false;
        const key = penaltyGroupKey(p);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).map(p => ({ ...p, effStart: p.chainStart, effEnd: p.chainEnd }));
};
