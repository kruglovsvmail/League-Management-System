// LMS-Backend/controllers/GameLiveDeskController.js
import pool from '../config/db.js';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';
import { getLeagueIdForGame } from '../utils/leagueLookup.js';
import { ARENA_STATIC_AUDIO_FILES, arenaAudioFileExists } from '../utils/arenaAudioFiles.js';
import { recalculatePlayerGameStats } from '../utils/playerGameStatsCalculator.js';
import { PENALTY_KINDS, PENALTY_GROUP_LATERAL, PENALTY_GROUP_COLUMNS, decoratePenaltyEvent } from '../utils/penaltyGroups.js';

/**
 * ─── ШТРАФНОЙ БРОСОК ПО ХОДУ МАТЧА ───────────────────────────────────────────
 *
 * Одна строка во «Взятии ворот», три возможных типа события:
 *   pending_ps — назначен, исход ещё не отмечен;
 *   goal + goal_strength='ps' — реализован, шайба идёт в счёт матча;
 *   failed_ps  — не реализован, счёт не меняется.
 *
 * Строка не самостоятельна: её порождает штраф вида «ШБ» (penalty_class =
 * 'penalty_shot') у команды-нарушителя, и linked_event_id хранит ссылку на него.
 * Правка времени штрафа двигает строку, удаление штрафа или его переквалификация
 * в обычное удаление убирает строку — иначе во «Взятии ворот» останется бросок,
 * которого никто не назначал. Обратная переквалификация (минуты → ШБ) строку
 * заводит, как и создание штрафа.
 */
const PENALTY_SHOT_ROW_TYPES = ['pending_ps', 'failed_ps'];

/** Заводит строку броска у соперника нарушителя — вторую половину пары. */
const createPenaltyShotRow = async (client, gameId, penaltyEventId, penalizedTeamId, period, timeSeconds) => {
    const gameRes = await client.query('SELECT home_team_id, away_team_id FROM games WHERE id = $1', [gameId]);
    if (gameRes.rows.length === 0) return;

    // Бросок пробивает соперник нарушителя. Время берётся из штрафа, а не с
    // таймера: секретарь имеет право завести удаление задним числом.
    const { home_team_id, away_team_id } = gameRes.rows[0];
    const shootingTeamId = parseInt(penalizedTeamId, 10) === home_team_id ? away_team_id : home_team_id;

    await client.query(`
        INSERT INTO game_events (game_id, period, time_seconds, event_type, team_id, goal_strength, linked_event_id)
        VALUES ($1, $2, $3, 'pending_ps', $4, 'ps', $5)
    `, [gameId, period, timeSeconds || 0, shootingTeamId, penaltyEventId]);
};

/**
 * Кто наказан и кто отбывает — поля штрафа из запроса панели.
 *
 * Штраф накладывается на игрока, на команду («К») или на официального представителя
 * («ОПК»). У двух последних игрока-нарушителя нет: penalty_player_id остаётся NULL,
 * и в личную статистику минуты никому не идут — только в командный штраф (ровно так
 * же, как раньше вёл себя пустой выбор «-»). Диктор и графика по NULL уже говорят
 * «командный штраф», представителя отдельно не выделяем.
 *
 * penalty_served_by_id — кто сидит на скамейке за нарушителя (за команду, за
 * представителя, за вратаря, за травмированного или за удалённого до конца матча).
 * Только фиксация в протоколе: ни штрафы, ни минуты отбывающему не считаются.
 *
 * Для не-штрафов всё NULL — колонки штрафные.
 */
const PENALTY_OFFENDER_TYPES = ['player', 'team', 'official'];
const penaltyOffenderFields = (eventType, playerId, offenderType, servedById) => {
    if (eventType !== 'penalty') return { playerId: null, offenderType: null, servedById: null };
    // Тип не прислали (старый клиент) — восстанавливаем по наличию игрока
    const type = PENALTY_OFFENDER_TYPES.includes(offenderType)
        ? offenderType
        : (playerId ? 'player' : 'team');
    return {
        playerId: type === 'player' ? (playerId || null) : null,
        offenderType: type,
        servedById: servedById || null,
    };
};

/**
 * Правка счёта матча на ±1. Вынесено отдельно, потому что дёргается из трёх мест:
 * создание гола, удаление гола и смена исхода штрафного броска (не реализован ↔
 * реализован — это гол, появляющийся и исчезающий без создания события).
 */
const shiftGameScore = async (client, gameId, teamId, delta) => {
    const gameRes = await client.query('SELECT home_team_id FROM games WHERE id = $1', [gameId]);
    if (gameRes.rows.length === 0) return;

    const isHome = gameRes.rows[0].home_team_id === parseInt(teamId, 10);
    const column = isHome ? 'home_score' : 'away_score';
    // GREATEST не даёт уйти в минус, если счёт и событие успели разъехаться.
    await client.query(
        `UPDATE games SET ${column} = GREATEST(${column} + $2, 0) WHERE id = $1`,
        [gameId, delta]
    );
};

/**
 * Убирает строки броска, привязанные к штрафу. Удаляем явно, а не каскадом БД, —
 * реализованный бросок это гол, и счёт матча надо уменьшить. Дёргается и при
 * удалении штрафа «ШБ», и при его переквалификации в обычный: в обоих случаях
 * назначения броска больше нет.
 */
const deletePenaltyShotRows = async (client, gameId, penaltyEventId) => {
    const linkedRes = await client.query(
        'SELECT id, event_type, team_id FROM game_events WHERE linked_event_id = $1',
        [penaltyEventId]
    );
    for (const linked of linkedRes.rows) {
        if (linked.event_type === 'goal') {
            await shiftGameScore(client, gameId, linked.team_id, -1);
        }
        await client.query('DELETE FROM game_events WHERE id = $1', [linked.id]);
    }
};

/**
 * Вспомогательная функция для установки флага необходимости пересчета статистики.
 * Срабатывает только если матч уже находится в статусе 'finished'.
 *
 * Здесь же сразу пересчитывается боксскор матча (player_game_statistics): флаг
 * needs_recalc относится к тяжёлым дивизионным пересчётам, которые ждут нажатия
 * кнопки, а боксскор стоит десятки строк и должен быть свежим всегда — из него
 * читают все витрины.
 */
const triggerRecalcFlag = async (clientOrPool, gameId) => {
    const res = await clientOrPool.query(
        `UPDATE games SET needs_recalc = true WHERE id = $1 AND status = 'finished'`,
        [gameId]
    );

    // rowCount = 0 означает, что матч ещё идёт или не начат: в боксскор попадают
    // только завершённые матчи, писать нечего.
    if (res.rowCount > 0) {
        // Клиент в транзакции отличаем от пула по наличию release(): если правка
        // пришла внутри чужой транзакции, пересчёт должен идти тем же клиентом,
        // иначе он не увидит ещё не закоммиченное событие.
        const isClient = typeof clientOrPool.release === 'function';
        await recalculatePlayerGameStats(gameId, isClient ? clientOrPool : null);
    }
};

export const getGameEvents = async (req, res) => {
    try {
        const { gameId } = req.params;
        const query = `
            SELECT
                ge.id, ge.period, ge.time_seconds, ge.event_type, ge.goal_strength,
                ge.penalty_violation, ge.penalty_violation_code, ge.penalty_reason_id,
                ge.penalty_minutes, ge.penalty_class, ge.penalty_end_time,
                -- Кто наказан (игрок / команда «К» / представитель «ОПК») и кто отбывает
                -- на скамейке за другого — номер отбывающего панель берёт из заявки по id
                ge.penalty_offender_type, ge.penalty_served_by_id,
                -- Обоюдное удаление: ссылка на парный штраф другой команды (в первой строке
                -- группы) и незаполненный двойник — нарушитель и причина ещё не вписаны
                ge.penalty_pair_id, ge.penalty_unfilled,
                ge.against_goalie_id, ge.from_shot, ge.linked_event_id,
                -- Вид штрафа и строки его группы (2+2, 2+10 …): по ним панель рисует
                -- цепочку строк, а плашка и диктор получают все причины разом
                ${PENALTY_GROUP_COLUMNS},
                pt.tts_accusative as penalty_accusative,
                t.id as team_id, COALESCE(tt_ev.snap_name, t.name) as team_name, COALESCE(tt_ev.snap_logo_url, t.logo_url) as team_logo,
                COALESCE(tt_ev.snap_pronunciation, t.pronunciation) as team_pronunciation,

                su.id as primary_player_id, su.last_name as primary_last_name,
                su.first_name as primary_first_name, su.avatar_url as primary_avatar_url,
                su.pronunciation as primary_pronunciation,
                COALESCE(tr_su.photo_snapshot_url, tm_su.photo_url) as primary_photo_url,
                gr_su.jersey_number as primary_jersey_number,
                gr_su.position_in_line as primary_position,

                a1.id as assist1_id, a1.last_name as assist1_last_name,
                a1.first_name as assist1_first_name, a1.avatar_url as assist1_avatar_url,
                a1.pronunciation as assist1_pronunciation,
                COALESCE(tr_a1.photo_snapshot_url, tm_a1.photo_url) as assist1_photo_url,
                gr_a1.jersey_number as assist1_jersey_number,

                a2.id as assist2_id, a2.last_name as assist2_last_name,
                a2.first_name as assist2_first_name, a2.avatar_url as a2_avatar_url,
                a2.pronunciation as assist2_pronunciation,
                COALESCE(tr_a2.photo_snapshot_url, tm_a2.photo_url) as assist2_photo_url,
                gr_a2.jersey_number as assist2_jersey_number,

                EXISTS (SELECT 1 FROM game_plus_minus gpm WHERE gpm.event_id = ge.id) as has_plus_minus

            FROM game_events ge
            JOIN games g_ev ON g_ev.id = ge.game_id
            LEFT JOIN teams t ON ge.team_id = t.id
            -- Заявка команды в дивизион этого матча: фото участников события берём из неё
            -- (снимок на момент допуска), а не из текущего фото в составе команды
            LEFT JOIN tournament_teams tt_ev ON tt_ev.team_id = ge.team_id AND tt_ev.division_id = g_ev.division_id
            LEFT JOIN penalty_types pt ON pt.id = ge.penalty_reason_id
            ${PENALTY_GROUP_LATERAL}

            LEFT JOIN users su ON COALESCE(ge.scorer_id, ge.penalty_player_id) = su.id
            LEFT JOIN team_members tm_su ON tm_su.user_id = su.id AND tm_su.team_id = ge.team_id
            LEFT JOIN game_rosters gr_su ON gr_su.game_id = ge.game_id AND gr_su.player_id = su.id AND gr_su.team_id = ge.team_id
            LEFT JOIN tournament_rosters tr_su ON tr_su.tournament_team_id = tt_ev.id AND tr_su.player_id = su.id AND tr_su.period_end IS NULL

            LEFT JOIN users a1 ON ge.assist1_id = a1.id
            LEFT JOIN team_members tm_a1 ON tm_a1.user_id = a1.id AND tm_a1.team_id = ge.team_id
            LEFT JOIN game_rosters gr_a1 ON gr_a1.game_id = ge.game_id AND gr_a1.player_id = a1.id AND gr_a1.team_id = ge.team_id
            LEFT JOIN tournament_rosters tr_a1 ON tr_a1.tournament_team_id = tt_ev.id AND tr_a1.player_id = a1.id AND tr_a1.period_end IS NULL

            LEFT JOIN users a2 ON ge.assist2_id = a2.id
            LEFT JOIN team_members tm_a2 ON tm_a2.user_id = a2.id AND tm_a2.team_id = ge.team_id
            LEFT JOIN game_rosters gr_a2 ON gr_a2.game_id = ge.game_id AND gr_a2.player_id = a2.id AND gr_a2.team_id = ge.team_id
            LEFT JOIN tournament_rosters tr_a2 ON tr_a2.tournament_team_id = tt_ev.id AND tr_a2.player_id = a2.id AND tr_a2.period_end IS NULL
            
            WHERE ge.game_id = $1
            ORDER BY 
                CASE WHEN ge.period = '1' THEN 1 
                     WHEN ge.period = '2' THEN 2 
                     WHEN ge.period = '3' THEN 3 
                     WHEN ge.period = '4' THEN 4
                     WHEN ge.period = '5' THEN 5
                     WHEN ge.period = 'OT' THEN 99 
                     WHEN ge.period = 'SO' THEN 100 ELSE 101 END ASC,
                ge.time_seconds ASC,
                -- При равном времени порядок задаёт id — то есть очерёдность ввода.
                -- Ради этого и нужен: штраф вида «ШБ» и порождённая им строка броска
                -- стоят на одной секунде, и без id пара выпадала бы в произвольном
                -- порядке, показывая исход броска раньше самого нарушения.
                ge.id ASC
        `;
        const result = await pool.query(query, [gameId]);
        res.json({ success: true, data: result.rows.map(decoratePenaltyEvent) });
    } catch (err) {
        console.error('Ошибка загрузки событий матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

/**
 * ─── ШТРАФ КАК ГРУППА СТРОК ─────────────────────────────────────────────────
 *
 * Секретарь выбирает вид (2, 2+2, 2+10, 4+10, 10, 20, 5+20, ШБ), а строк протокола
 * получается столько, сколько у вида (см. PENALTY_KINDS). Панель присылает их
 * готовыми — с началом, окончанием и причиной каждой, — а здесь они пишутся одной
 * транзакцией и связываются penalty_group_id (id первой строки) и penalty_group_seq.
 *
 * Правка группы не пересоздаёт строки, а обновляет их по месту (по seq): id первой
 * строки — это и id группы, и ключ, по которому эфир и дикторы помнят, что событие
 * уже показано. Пересоздание заставило бы их объявить штраф заново.
 */
const readPenaltyGroupBody = (body) => {
    const kind = body?.penalty_kind;
    const spec = PENALTY_KINDS[kind];
    if (!spec) return { error: 'Неизвестный вид штрафа' };

    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length !== spec.rows.length) {
        return { error: `Для вида «${spec.display}» нужно строк: ${spec.rows.length}` };
    }

    // Минуты и класс каждой строки — по виду, что бы ни прислал клиент: от них зависят
    // и слоты меньшинства, и статистика.
    const normalized = rows.map((r, i) => ({
        period: r.period || body.period,
        time_seconds: parseInt(r.time_seconds, 10) || 0,
        penalty_end_time: r.penalty_end_time === null || r.penalty_end_time === undefined ? null : parseInt(r.penalty_end_time, 10),
        penalty_minutes: spec.rows[i].minutes,
        penalty_class: spec.rows[i].cls,
        penalty_violation: r.penalty_violation || null,
        penalty_violation_code: r.penalty_violation_code || null,
        penalty_reason_id: r.penalty_reason_id || null,
        penalty_served_by_id: r.penalty_served_by_id || null,
    }));

    if (normalized.some(r => penaltyEndsBeforeStart(r.time_seconds, r.penalty_end_time))) {
        return { error: PENALTY_END_BEFORE_START };
    }

    return { kind, spec, rows: normalized };
};

// Окончание удаления раньше его начала — ошибка ввода, а не данные: ни рассчитанное
// панелью, ни вписанное секретарём руками (настройка лиги sec_penalty_manual_end) таким
// быть не может, а записанное сломало бы отсчёт на табло и статистику «пропущено в
// меньшинстве». Равное началу допустимо — так записан штраф вида «ШБ».
const PENALTY_END_BEFORE_START = 'Окончание удаления не может быть раньше его начала';
const penaltyEndsBeforeStart = (start, end) =>
    end !== null && end !== undefined && end !== '' && parseInt(end, 10) < (parseInt(start, 10) || 0);

const PENALTY_ROW_INSERT = `
    INSERT INTO game_events (
        game_id, period, time_seconds, event_type, team_id,
        penalty_player_id, penalty_violation, penalty_violation_code, penalty_reason_id,
        penalty_minutes, penalty_class, penalty_end_time,
        penalty_offender_type, penalty_served_by_id,
        penalty_kind, penalty_group_id, penalty_group_seq, penalty_unfilled
    ) VALUES ($1, $2, $3, 'penalty', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id
`;

const penaltyRowParams = (gameId, teamId, who, kind, groupId, seq, r, unfilled = false) => [
    gameId, r.period, r.time_seconds, teamId,
    who.playerId, r.penalty_violation, r.penalty_violation_code, r.penalty_reason_id,
    r.penalty_minutes, r.penalty_class, r.penalty_end_time,
    who.offenderType, r.penalty_served_by_id || null,
    kind, groupId, seq, unfilled,
];

// Строки группы, какие есть сейчас, по порядку. Старая запись (до групп) — одиночная
// строка без penalty_group_id: правится как группа из одной строки.
const loadPenaltyGroup = async (client, gameId, groupId) => (await client.query(`
    SELECT id, penalty_group_seq, penalty_class, team_id, penalty_pair_id, penalty_unfilled
    FROM game_events
    WHERE game_id = $1 AND event_type = 'penalty'
      AND (penalty_group_id = $2 OR (id = $2 AND penalty_group_id IS NULL))
    ORDER BY penalty_group_seq NULLS FIRST, id
`, [gameId, groupId])).rows;

// Новая группа. Первая строка — без группы: её id и есть id группы, проставляем после вставки
const insertPenaltyGroup = async (client, gameId, teamId, who, kind, rows, unfilled = false) => {
    const first = await client.query(PENALTY_ROW_INSERT, penaltyRowParams(gameId, teamId, who, kind, null, 1, rows[0], unfilled));
    const groupId = first.rows[0].id;
    await client.query('UPDATE game_events SET penalty_group_id = $1 WHERE id = $1', [groupId]);
    for (let i = 1; i < rows.length; i++) {
        await client.query(PENALTY_ROW_INSERT, penaltyRowParams(gameId, teamId, who, kind, groupId, i + 1, rows[i], unfilled));
    }
    return groupId;
};

// Правка группы по месту (по seq): недостающие строки дописываются, лишние уходят
// (вид стал короче: 2+10 → 2)
const rewritePenaltyGroup = async (client, gameId, existing, teamId, who, kind, rows, unfilled = false) => {
    const firstId = existing[0].id;
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const target = existing[i];
        if (target) {
            await client.query(`
                UPDATE game_events SET
                    period = $1, time_seconds = $2, team_id = $3,
                    penalty_player_id = $4, penalty_violation = $5, penalty_violation_code = $6, penalty_reason_id = $7,
                    penalty_minutes = $8, penalty_class = $9, penalty_end_time = $10,
                    penalty_offender_type = $11, penalty_served_by_id = $12,
                    penalty_kind = $13, penalty_group_id = $14, penalty_group_seq = $15, penalty_unfilled = $16
                WHERE id = $17
            `, [
                r.period, r.time_seconds, teamId,
                who.playerId, r.penalty_violation, r.penalty_violation_code, r.penalty_reason_id,
                r.penalty_minutes, r.penalty_class, r.penalty_end_time,
                who.offenderType, r.penalty_served_by_id || null,
                kind, firstId, i + 1, unfilled,
                target.id,
            ]);
        } else {
            await client.query(PENALTY_ROW_INSERT, penaltyRowParams(gameId, teamId, who, kind, firstId, i + 1, r, unfilled));
        }
    }
    const extraIds = existing.slice(rows.length).map(r => r.id);
    if (extraIds.length > 0) {
        await client.query('DELETE FROM game_events WHERE id = ANY($1::int[])', [extraIds]);
    }
};

/**
 * ─── ОБОЮДНОЕ УДАЛЕНИЕ ───────────────────────────────────────────────────────
 *
 * Пара — две группы штрафа разных команд, связанные penalty_pair_id: в первой строке
 * каждой лежит id первой строки другой. Секретарь ставит галочку «Обоюдное» в окне
 * вида штрафа (если лига её показывает — sec_coincident_penalties), и второй команде
 * заводится двойник того же вида и с тем же временем, но без нарушителя и причины
 * (penalty_unfilled): в протоколе у него «?», а отсчёт на табло идёт сразу. Нарушителя
 * и причину судья дописывает потом, вид тоже может сменить.
 *
 * Время у пары общее: панель присылает вместе с правкой одной группы и строки второй
 * (pair), и обе пишутся одной транзакцией. Режимы pair.mode:
 *   'create' — пары ещё нет, заводим двойника;
 *   'mirror' — двойник ещё пустой: повторяет вид и строки правленой группы целиком;
 *   'times'  — вторая сторона уже заполнена: меняются только начало и окончание её строк.
 * Снять галочку — значит разорвать пару: связанный штраф удаляется целиком (unpair).
 * Удаление любого штрафа пары удаляет оба (deleteGameEvent).
 *
 * Что пара значит для игры, считает панель: обоюдные строки одинакового размера голом
 * не прекращаются и большинства не дают (coincidentRowIds в GameDeskShared.jsx).
 */
const UNFILLED_WHO = { playerId: null, offenderType: null };

const deletePenaltyGroupRows = (client, gameId, groupId) => client.query(
    `DELETE FROM game_events WHERE game_id = $1 AND event_type = 'penalty' AND (penalty_group_id = $2 OR id = $2)`,
    [gameId, groupId]
);

// Вторая сторона пары после сохранения группы groupId команды teamId. → { error } | undefined
const savePenaltyPair = async (client, gameId, groupId, teamId, pair, period) => {
    const partnerId = (await client.query('SELECT penalty_pair_id FROM game_events WHERE id = $1', [groupId])).rows[0]?.penalty_pair_id || null;

    if (!partnerId) {
        const parsed = readPenaltyGroupBody({ penalty_kind: pair.penalty_kind, rows: pair.rows, period });
        if (parsed.error) return { error: parsed.error };
        // Штрафной бросок назначают одной команде — пары у него не бывает
        if (parsed.kind === 'penalty_shot') return;
        const gameRes = await client.query('SELECT home_team_id, away_team_id FROM games WHERE id = $1', [gameId]);
        const { home_team_id, away_team_id } = gameRes.rows[0] || {};
        const opponentId = Number(teamId) === home_team_id ? away_team_id : Number(teamId) === away_team_id ? home_team_id : null;
        if (!opponentId) return { error: 'Не найдена вторая команда матча' };
        const twinId = await insertPenaltyGroup(client, gameId, opponentId, UNFILLED_WHO, parsed.kind, parsed.rows, true);
        await client.query('UPDATE game_events SET penalty_pair_id = $2 WHERE id = $1', [groupId, twinId]);
        await client.query('UPDATE game_events SET penalty_pair_id = $2 WHERE id = $1', [twinId, groupId]);
        return;
    }

    const partner = await loadPenaltyGroup(client, gameId, partnerId);
    if (partner.length === 0) return;

    if (pair.mode === 'mirror') {
        // Двойника успели заполнить с другого устройства — его вид и строки не трогаем
        if (!partner[0].penalty_unfilled) return;
        const parsed = readPenaltyGroupBody({ penalty_kind: pair.penalty_kind, rows: pair.rows, period });
        if (parsed.error) return { error: parsed.error };
        if (parsed.kind === 'penalty_shot') return;
        await rewritePenaltyGroup(client, gameId, partner, partner[0].team_id, UNFILLED_WHO, parsed.kind, parsed.rows, true);
        return;
    }

    // 'times': только начало и окончание строк заполненной стороны, по порядку
    const times = Array.isArray(pair.rows) ? pair.rows : [];
    for (let i = 0; i < partner.length && i < times.length; i++) {
        const time = parseInt(times[i].time_seconds, 10) || 0;
        const end = times[i].penalty_end_time === null || times[i].penalty_end_time === undefined ? null : parseInt(times[i].penalty_end_time, 10);
        if (penaltyEndsBeforeStart(time, end)) return { error: PENALTY_END_BEFORE_START };
        await client.query(
            'UPDATE game_events SET time_seconds = $1, penalty_end_time = $2, period = COALESCE($3, period) WHERE id = $4',
            [time, end, times[i].period || null, partner[i].id]
        );
    }
};

export const createPenaltyGroup = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        const { team_id, player_id, penalty_offender_type } = req.body;

        const parsed = readPenaltyGroupBody(req.body);
        if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });
        const { kind, rows } = parsed;

        const who = penaltyOffenderFields('penalty', player_id, penalty_offender_type, null);

        await client.query('BEGIN');

        const groupId = await insertPenaltyGroup(client, gameId, team_id, who, kind, rows);

        if (kind === 'penalty_shot') {
            await createPenaltyShotRow(client, gameId, groupId, team_id, rows[0].period, rows[0].time_seconds);
        }

        // Галочка «Обоюдное»: второй команде — двойник без нарушителя и причины
        if (req.body.pair) {
            const pairResult = await savePenaltyPair(client, gameId, groupId, team_id, req.body.pair, req.body.period);
            if (pairResult?.error) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, error: pairResult.error });
            }
        }

        await triggerRecalcFlag(client, gameId);
        await client.query('COMMIT');
        res.json({ success: true, groupId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка сохранения штрафа:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения штрафа' });
    } finally {
        client.release();
    }
};

export const updatePenaltyGroup = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId, groupId } = req.params;
        const { team_id, player_id, penalty_offender_type } = req.body;

        const parsed = readPenaltyGroupBody(req.body);
        if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });
        const { kind, rows } = parsed;

        // Двойник обоюдного удаления, у которого судья ещё не вписал нарушителя, остаётся
        // незаполненным: не игрок и не командный штраф, а «?»
        const unfilled = !!req.body.unfilled;
        const who = unfilled ? UNFILLED_WHO : penaltyOffenderFields('penalty', player_id, penalty_offender_type, null);

        await client.query('BEGIN');

        const existing = await loadPenaltyGroup(client, gameId, groupId);
        if (existing.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Штраф не найден' });
        }
        const firstRow = existing[0];

        const wasPenaltyShot = firstRow.penalty_class === 'penalty_shot';
        const isPenaltyShot = kind === 'penalty_shot';

        await rewritePenaltyGroup(client, gameId, existing, team_id, who, kind, rows, unfilled);

        // Строка броска живёт ровно столько, сколько штраф остаётся «ШБ» (см. updateGameEvent)
        if (wasPenaltyShot && !isPenaltyShot) {
            await deletePenaltyShotRows(client, gameId, firstRow.id);
        } else if (!wasPenaltyShot && isPenaltyShot) {
            await createPenaltyShotRow(client, gameId, firstRow.id, team_id, rows[0].period, rows[0].time_seconds);
        } else if (isPenaltyShot) {
            await client.query(
                `UPDATE game_events SET period = $1, time_seconds = $2 WHERE linked_event_id = $3`,
                [rows[0].period, rows[0].time_seconds, firstRow.id]
            );
        }

        // Обоюдное удаление: галочку сняли — связанный штраф другой команды уходит
        // целиком; иначе вторая сторона пары получает свои строки той же транзакцией
        if (req.body.unpair && firstRow.penalty_pair_id) {
            await deletePenaltyGroupRows(client, gameId, firstRow.penalty_pair_id);
            await client.query('UPDATE game_events SET penalty_pair_id = NULL WHERE id = $1', [firstRow.id]);
        } else if (req.body.pair) {
            const pairResult = await savePenaltyPair(client, gameId, firstRow.id, team_id, req.body.pair, req.body.period);
            if (pairResult?.error) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, error: pairResult.error });
            }
        }

        await triggerRecalcFlag(client, gameId);
        await client.query('COMMIT');
        res.json({ success: true, groupId: firstRow.id });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка правки штрафа:', err);
        res.status(500).json({ success: false, error: 'Ошибка правки штрафа' });
    } finally {
        client.release();
    }
};

export const createGameEvent = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        const {
            period, time_seconds, event_type, team_id,
            player_id, assist1_id, assist2_id, goal_strength,
            penalty_violation, penalty_violation_code, penalty_reason_id,
            penalty_minutes, penalty_class, penalty_end_time,
            against_goalie_id, from_shot, linked_event_id,
            penalty_offender_type, penalty_served_by_id
        } = req.body;

        if (event_type === 'penalty' && penaltyEndsBeforeStart(time_seconds, penalty_end_time)) {
            return res.status(400).json({ success: false, error: PENALTY_END_BEFORE_START });
        }

        await client.query('BEGIN');

        const isGoalEvent = (event_type === 'goal');
        const isShootoutEvent = (event_type === 'shootout_goal' || event_type === 'shootout_miss');
        const penaltyWho = penaltyOffenderFields(event_type, player_id, penalty_offender_type, penalty_served_by_id);
        // Штрафной бросок по ходу матча: бьющий хранится в scorer_id так же, как
        // автор гола — реализованный бросок становится обычным голом с ИС «ШБ»,
        // и игрок при смене типа события никуда переезжать не должен.
        const isPenaltyShotRow = PENALTY_SHOT_ROW_TYPES.includes(event_type);

        // from_shot имеет смысл только для голов в основное время;
        // для прочих типов оставляем default БД (true).
        const fromShotValue = isGoalEvent ? (from_shot !== false) : true;

        const eventRes = await client.query(`
            INSERT INTO game_events (
                game_id, period, time_seconds, event_type, team_id,
                scorer_id, assist1_id, assist2_id, goal_strength,
                penalty_player_id, penalty_violation, penalty_violation_code, penalty_reason_id,
                penalty_minutes, penalty_class, penalty_end_time,
                against_goalie_id, from_shot, linked_event_id,
                penalty_offender_type, penalty_served_by_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING id
        `, [
            gameId, period, time_seconds || 0, event_type, team_id || null,
            (isGoalEvent || isShootoutEvent || isPenaltyShotRow) ? player_id : null,
            assist1_id || null, assist2_id || null, goal_strength || null,
            penaltyWho.playerId,
            // Причина сохраняется снимком (наименование + сокращение) плюс ссылкой на пункт
            // справочника: пункт могут удалить, а протокол должен печататься как записан.
            penalty_violation || null, penalty_violation_code || null, penalty_reason_id || null,
            penalty_minutes || null, penalty_class || null, penalty_end_time || null,
            against_goalie_id || null, fromShotValue, linked_event_id || null,
            penaltyWho.offenderType, penaltyWho.servedById
        ]);

        const eventId = eventRes.rows[0].id;

        if (event_type === 'goal') {
            await shiftGameScore(client, gameId, team_id, 1);
        }

        // Штраф вида «ШБ» сам по себе неполон: назначенный бросок обязан появиться
        // строкой во «Взятии ворот» у соперника. Заводим её здесь, в одной
        // транзакции со штрафом, — состояния «штраф есть, броска нет» быть не должно.
        if (event_type === 'penalty' && penalty_class === 'penalty_shot') {
            await createPenaltyShotRow(client, gameId, eventId, team_id, period, time_seconds);
        }

        // Если матч завершен, помечаем, что нужен пересчет
        await triggerRecalcFlag(client, gameId);

        await client.query('COMMIT');
        res.json({ success: true, eventId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка сохранения события матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения события' });
    } finally {
        client.release();
    }
};

export const updateGameEvent = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId, eventId } = req.params;
        const {
            period, time_seconds, event_type, team_id,
            player_id, assist1_id, assist2_id, goal_strength,
            penalty_violation, penalty_violation_code, penalty_reason_id,
            penalty_minutes, penalty_class, penalty_end_time,
            against_goalie_id, from_shot,
            penalty_offender_type, penalty_served_by_id
        } = req.body;

        if (event_type === 'penalty' && penaltyEndsBeforeStart(time_seconds, penalty_end_time)) {
            return res.status(400).json({ success: false, error: PENALTY_END_BEFORE_START });
        }

        await client.query('BEGIN');

        const oldEvRes = await client.query('SELECT event_type, team_id, penalty_class, penalty_unfilled FROM game_events WHERE id = $1', [eventId]);
        if (oldEvRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Событие не найдено' });
        }

        const oldEvent = oldEvRes.rows[0];

        // Строка незаполненного двойника обоюдного удаления (правка одной строки — причина
        // продолжения или окончание) так и остаётся «?»: без присланного нарушителя
        // penaltyOffenderFields записал бы её командным штрафом
        const staysUnfilled = event_type === 'penalty' && !!oldEvent.penalty_unfilled
            && !player_id && !PENALTY_OFFENDER_TYPES.includes(penalty_offender_type);
        const penaltyWho = staysUnfilled
            ? { playerId: null, offenderType: null, servedById: penalty_served_by_id || null }
            : penaltyOffenderFields(event_type, player_id, penalty_offender_type, penalty_served_by_id);

        // Счёт правится по фактическому изменению «был гол / стал гол». Одним
        // правилом закрываются оба случая: перенос гола другой команде и смена
        // исхода штрафного броска (pending_ps/failed_ps ↔ goal), где событие
        // остаётся тем же, а шайба в счёте появляется или пропадает.
        const wasGoal = oldEvent.event_type === 'goal';
        const isGoalEvent = (event_type === 'goal');
        if (wasGoal) await shiftGameScore(client, gameId, oldEvent.team_id, -1);
        if (isGoalEvent) await shiftGameScore(client, gameId, team_id, 1);

        const isShootoutEvent = (event_type === 'shootout_goal' || event_type === 'shootout_miss');
        const isPenaltyShotRow = PENALTY_SHOT_ROW_TYPES.includes(event_type);

        // from_shot имеет смысл только для голов в основное время;
        // для прочих типов оставляем true (default БД).
        const fromShotValue = isGoalEvent ? (from_shot !== false) : true;

        await client.query(`
    UPDATE game_events SET
        period = $1, time_seconds = $2, team_id = $3,
        scorer_id = $4, assist1_id = $5, assist2_id = $6, goal_strength = $7,
        penalty_player_id = $8, penalty_violation = $9, penalty_minutes = $10, penalty_class = $11, penalty_end_time = $12,
        against_goalie_id = $13, event_type = $15, from_shot = $16,
        penalty_violation_code = $17, penalty_reason_id = $18,
        penalty_offender_type = $19, penalty_served_by_id = $20, penalty_unfilled = $21
    WHERE id = $14
`, [
    period, time_seconds || 0, team_id || null,
    (isGoalEvent || isShootoutEvent || isPenaltyShotRow) ? player_id : null, assist1_id || null, assist2_id || null, goal_strength || null,
    penaltyWho.playerId, penalty_violation || null, penalty_minutes || null, penalty_class || null, penalty_end_time || null,
    against_goalie_id || null,
    eventId,
    event_type,
    fromShotValue,
    penalty_violation_code || null, penalty_reason_id || null,
    penaltyWho.offenderType, penaltyWho.servedById, staysUnfilled
]);

        // Строка броска живёт ровно столько, сколько штраф остаётся «ШБ».
        // Смотрим на переход класса, а не только на новое значение: секретарь
        // может переквалифицировать штраф в обе стороны.
        const wasPenaltyShot = oldEvent.event_type === 'penalty' && oldEvent.penalty_class === 'penalty_shot';
        const isPenaltyShot = event_type === 'penalty' && penalty_class === 'penalty_shot';

        if (wasPenaltyShot && !isPenaltyShot) {
            // ШБ стал обычным удалением — бросок, которого никто не назначал,
            // уходит вместе с голом и шайбой в счёте, если его успели реализовать.
            await deletePenaltyShotRows(client, gameId, eventId);
        } else if (!wasPenaltyShot && isPenaltyShot) {
            // Обычное удаление стало ШБ — заводим строку броска так же, как при
            // создании штрафа, иначе будет «штраф есть, броска нет».
            await createPenaltyShotRow(client, gameId, eventId, team_id, period, time_seconds);
        } else if (isPenaltyShot) {
            // Секретарь поправил время штрафа «ШБ» — строка броска обязана поехать
            // следом, иначе бросок окажется в другом периоде, чем нарушение.
            await client.query(
                `UPDATE game_events SET period = $1, time_seconds = $2 WHERE linked_event_id = $3`,
                [period, time_seconds || 0, eventId]
            );
        }

        await triggerRecalcFlag(client, gameId);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка обновления события матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка обновления события' });
    } finally {
        client.release();
    }
};

export const deleteGameEvent = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId, eventId } = req.params;

        await client.query('BEGIN');

        const evRes = await client.query('SELECT event_type, team_id, penalty_class, penalty_group_id FROM game_events WHERE id = $1', [eventId]);

        if (evRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Событие не найдено' });
        }

        const { event_type, team_id, penalty_class, penalty_group_id } = evRes.rows[0];

        if (event_type === 'goal') {
            await shiftGameScore(client, gameId, team_id, -1);
        }

        // Штраф вида «ШБ» уносит с собой строку броска: без назначения бросок
        // не существует.
        if (event_type === 'penalty' && penalty_class === 'penalty_shot') {
            await deletePenaltyShotRows(client, gameId, eventId);
        }

        // Обоюдное удаление удаляется парой: связанный штраф другой команды уходит тоже.
        // Ссылка на пару лежит в первой строке группы.
        if (event_type === 'penalty') {
            const pairRes = await client.query('SELECT penalty_pair_id FROM game_events WHERE id = $1', [penalty_group_id || eventId]);
            const partnerId = pairRes.rows[0]?.penalty_pair_id;
            if (partnerId) await deletePenaltyGroupRows(client, gameId, partnerId);
        }

        // Штраф удаляется целиком, всеми строками группы: «только десятка из 2+10» —
        // это смена вида через правку, а не удаление строки.
        if (event_type === 'penalty' && penalty_group_id) {
            await client.query('DELETE FROM game_events WHERE penalty_group_id = $1', [penalty_group_id]);
        } else {
            await client.query('DELETE FROM game_events WHERE id = $1', [eventId]);
        }

        await triggerRecalcFlag(client, gameId);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка удаления события матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления события' });
    } finally {
        client.release();
    }
};

export const updateTimerSettings = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { period_length, ot_length, so_length, periods_count, auto_stop_on_event, arena_announcer, warmup_length, break_length } = req.body;

        // COALESCE: этот роут вызывается и с полным набором (батч-сохранение "Утвердить настройки"),
        // и с одним только arena_announcer (мгновенное сохранение тумблера диктора арены) —
        // отсутствующие поля не должны затирать то, что уже есть в БД.
        // Разминка и перерыв, записанные здесь, — своё значение матча: с этого момента он
        // не берёт их из дивизиона (NULL в строке значит «как в дивизионе»).
        await pool.query(`
            UPDATE game_timers SET
                period_length = COALESCE($1, period_length),
                ot_length = COALESCE($2, ot_length),
                so_length = COALESCE($3, so_length),
                periods_count = COALESCE($4, periods_count),
                auto_stop_on_event = COALESCE($5, auto_stop_on_event),
                arena_announcer = COALESCE($6::jsonb, arena_announcer),
                warmup_length = COALESCE($8, warmup_length),
                break_length = COALESCE($9, break_length)
            WHERE game_id = $7
        `, [
            period_length ?? null, ot_length ?? null, so_length ?? null, periods_count ?? null,
            auto_stop_on_event ?? null,
            arena_announcer !== undefined ? JSON.stringify(arena_announcer) : null,
            gameId,
            warmup_length ?? null, break_length ?? null
        ]);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления настроек таймера:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const getEventPlusMinus = async (req, res) => {
    try {
        const { eventId } = req.params;
        const result = await pool.query('SELECT team_id, player_id FROM game_plus_minus WHERE event_id = $1', [eventId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения +/-:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const saveEventPlusMinus = async (req, res) => {
    const client = await pool.connect();
    try {
        const { eventId } = req.params;
        const { plus_players, minus_players, scoring_team_id, conceding_team_id } = req.body;

        await client.query('BEGIN');

        // Находим ID игры для флага пересчета
        const gameIdRes = await client.query('SELECT game_id FROM game_events WHERE id = $1', [eventId]);
        const gameId = gameIdRes.rows[0]?.game_id;

        await client.query('DELETE FROM game_plus_minus WHERE event_id = $1', [eventId]);

        if (plus_players && plus_players.length > 0) {
            const plusValues = [];
            const plusParams = [];
            let pIdx = 1;
            plus_players.forEach(p_id => {
                plusValues.push(`($${pIdx++}, $${pIdx++}, $${pIdx++})`);
                plusParams.push(eventId, scoring_team_id, p_id);
            });
            await client.query(`INSERT INTO game_plus_minus (event_id, team_id, player_id) VALUES ${plusValues.join(', ')}`, plusParams);
        }

        if (minus_players && minus_players.length > 0) {
            const minusValues = [];
            const minusParams = [];
            let mIdx = 1;
            minus_players.forEach(p_id => {
                minusValues.push(`($${mIdx++}, $${mIdx++}, $${mIdx++})`);
                minusParams.push(eventId, conceding_team_id, p_id);
            });
            await client.query(`INSERT INTO game_plus_minus (event_id, team_id, player_id) VALUES ${minusValues.join(', ')}`, minusParams);
        }

        if (gameId) await triggerRecalcFlag(client, gameId);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка сохранения +/-:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения' });
    } finally {
        client.release();
    }
};

export const updateShootoutStatus = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { status } = req.body; 
        
        await pool.query(
            'UPDATE game_timers SET shootout_status = $1 WHERE game_id = $2',
            [status, gameId]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления статуса буллитов:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const finishShootout = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        await client.query('BEGIN');

        const gameRes = await client.query('SELECT home_team_id, away_team_id FROM games WHERE id = $1', [gameId]);
        if (gameRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }
        const game = gameRes.rows[0];

        // ОПЕЧАТКА УБРАНА: Чистый вызов client.query
        const allGoalsRes = await client.query(`
            SELECT team_id, event_type 
            FROM game_events 
            WHERE game_id = $1 AND event_type IN ('goal', 'shootout_goal')
        `, [gameId]);
        
        let homeReg = 0, awayReg = 0;
        let homeSO = 0, awaySO = 0;

        allGoalsRes.rows.forEach(e => {
            if (e.event_type === 'goal') {
                if (e.team_id === game.home_team_id) homeReg++;
                else if (e.team_id === game.away_team_id) awayReg++;
            } else if (e.event_type === 'shootout_goal') {
                if (e.team_id === game.home_team_id) homeSO++;
                else if (e.team_id === game.away_team_id) awaySO++;
            }
        });

        if (homeSO === awaySO) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Счет в серии равный. Выявите победителя.' });
        }

        let finalHome = homeReg;
        let finalAway = awayReg;

        if (homeSO > awaySO) finalHome++;
        else finalAway++;

        await client.query(
            'UPDATE games SET home_score = $2, away_score = $3, end_type = $4 WHERE id = $1', 
            [gameId, finalHome, finalAway, 'so']
        );

        await client.query(
            'UPDATE game_timers SET shootout_status = $1 WHERE game_id = $2',
            ['finished_win', gameId]
        );

        await triggerRecalcFlag(client, gameId);

        await client.query('COMMIT');
        res.json({ success: true, winner: homeSO > awaySO ? 'home' : 'away' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка завершения серии буллитов:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    } finally {
        client.release();
    }
};

export const reopenShootout = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        await client.query('BEGIN');

        const gameRes = await client.query('SELECT home_team_id, away_team_id FROM games WHERE id = $1', [gameId]);
        if (gameRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }
        const game = gameRes.rows[0];

        // ОПЕЧАТКА УБРАНА: Чистый вызов client.query
        const allGoalsRes = await client.query(`
            SELECT team_id 
            FROM game_events 
            WHERE game_id = $1 AND event_type = 'goal'
        `, [gameId]);
        
        let homeReg = 0, awayReg = 0;

        allGoalsRes.rows.forEach(e => {
            if (e.team_id === game.home_team_id) homeReg++;
            else if (e.team_id === game.away_team_id) awayReg++;
        });

        await client.query(
            'UPDATE games SET home_score = $2, away_score = $3, end_type = NULL WHERE id = $1', 
            [gameId, homeReg, awayReg]
        );

        await client.query(
            'UPDATE game_timers SET shootout_status = $1 WHERE game_id = $2',
            ['pending', gameId]
        );

        await triggerRecalcFlag(client, gameId);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка переоткрытия серии буллитов:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    } finally {
        client.release();
    }
};

export const saveGoalieLog = async (req, res) => {
    try {
        const { gameId } = req.params;
        const {
            id, time_seconds, home_goalie_id, away_goalie_id,
            home_goalie_unspecified, away_goalie_unspecified,
        } = req.body;

        if (id) {
            await pool.query(`
                UPDATE game_goalie_log
                SET time_seconds = $1, home_goalie_id = $2, away_goalie_id = $3,
                    home_goalie_unspecified = $4, away_goalie_unspecified = $5
                WHERE id = $6 AND game_id = $7
            `, [time_seconds, home_goalie_id || null, away_goalie_id || null,
                !!home_goalie_unspecified, !!away_goalie_unspecified, id, gameId]);
        } else {
            await pool.query(`
                INSERT INTO game_goalie_log (game_id, time_seconds, home_goalie_id, away_goalie_id, home_goalie_unspecified, away_goalie_unspecified)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [gameId, time_seconds, home_goalie_id || null, away_goalie_id || null,
                !!home_goalie_unspecified, !!away_goalie_unspecified]);
        }

        await triggerRecalcFlag(pool, gameId);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка сохранения лога вратарей:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const deleteGoalieLog = async (req, res) => {
    try {
        const { gameId, logId } = req.params;
        
        const countRes = await pool.query('SELECT COUNT(*) as count FROM game_goalie_log WHERE game_id = $1', [gameId]);
        const totalLogs = parseInt(countRes.rows[0].count, 10);

        if (totalLogs <= 1) {
            return res.status(400).json({ success: false, error: 'Нельзя удалить единственную запись. Вы можете только отредактировать её.' });
        }
        
        await pool.query('DELETE FROM game_goalie_log WHERE id = $1 AND game_id = $2', [logId, gameId]);
        await triggerRecalcFlag(pool, gameId);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления лога вратарей:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// Стартовая запись журнала вратарей по заявкам на матч.
//
// Если у команды в заявке на матч ровно один вратарь, кто начал матч в воротах,
// известно и без секретаря — заводить первую строку журнала руками он не должен.
// Панель дёргает маршрут при загрузке и при каждом изменении заявок/журнала, а
// правило одно:
//   • журнала нет вовсе → создаём запись на 00:00: сторона с единственным вратарём —
//     он, другая — «не указан», пока её заявка не даст ответ;
//   • первая запись есть, но сторона в ней «не указан» либо вписан игрок, которого
//     в заявке на матч уже нет (заявку пересобрали) → вписываем единственного вратаря.
// Осознанный выбор секретаря (вратарь из заявки, пустые ворота) не трогаем; при
// 0 или 2+ вратарях в заявке тоже ничего не делаем — тут решает секретарь.
// Удалённая стартовая запись сама не вернётся: последнюю запись журнала удалить
// нельзя (deleteGoalieLog), так что пустым после автозаписи он уже не бывает.
// Только для матчей, которые ещё не сыграны (scheduled/live): завершённый матч от
// одного открытия панели меняться не должен — иначе у старой игры без журнала
// появлялась бы запись, а с ней и пересчёт статистики.
// Маршрут идемпотентный: повторный вызов без изменений в заявках отвечает changed=false.
// Строка матча берётся FOR UPDATE: панель открывают с нескольких устройств разом, и
// без блокировки каждое вставило бы свою стартовую запись.
// (Убиралось 22.09.2026 по просьбе «никакой записи при старте», возвращено 23.09.2026
// по просьбе заказчика; с 25.09.2026 это настройка лиги sec_goalie_autofill — лига
// выключает её в «Параметрах», по умолчанию включена.)
export const autofillGoalieLog = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        await client.query('BEGIN');

        // У матча вне лиг (товарищеские, внешние турниры) лиги нет — там автозапись
        // работает, как работала до настройки
        const gameRes = await client.query(`
            SELECT g.home_team_id, g.away_team_id, g.status,
                   COALESCE(l.sec_goalie_autofill, true) AS goalie_autofill
            FROM games g
            LEFT JOIN divisions d ON d.id = g.division_id
            LEFT JOIN seasons s ON s.id = d.season_id
            LEFT JOIN leagues l ON l.id = s.league_id
            WHERE g.id = $1
            FOR UPDATE OF g
        `, [gameId]);
        if (gameRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }
        const { home_team_id, away_team_id, status, goalie_autofill } = gameRes.rows[0];
        if (!goalie_autofill || !['scheduled', 'live'].includes(status)) {
            await client.query('COMMIT');
            return res.json({ success: true, changed: false });
        }

        // Вратари в заявке на матч по сторонам. Резервный вратарь лиги тоже вратарь:
        // при своём вратаре плюс резервном в заявке их двое, и автозаполнения не будет.
        const goaliesRes = await client.query(`
            SELECT team_id, array_agg(player_id) AS player_ids
            FROM game_rosters
            WHERE game_id = $1 AND position_in_line = 'G'
            GROUP BY team_id
        `, [gameId]);
        const lineupGoalies = (teamId) =>
            goaliesRes.rows.find(r => String(r.team_id) === String(teamId))?.player_ids || [];
        const soleGoalie = (teamId) => {
            const ids = lineupGoalies(teamId);
            return ids.length === 1 ? ids[0] : null;
        };
        const homeSole = soleGoalie(home_team_id);
        const awaySole = soleGoalie(away_team_id);

        let changed = false;
        if (homeSole || awaySole) {
            const firstRes = await client.query(
                'SELECT * FROM game_goalie_log WHERE game_id = $1 ORDER BY time_seconds ASC, id ASC LIMIT 1',
                [gameId]
            );

            if (firstRes.rows.length === 0) {
                await client.query(`
                    INSERT INTO game_goalie_log (game_id, time_seconds, home_goalie_id, away_goalie_id, home_goalie_unspecified, away_goalie_unspecified)
                    VALUES ($1, 0, $2, $3, $4, $5)
                `, [gameId, homeSole, awaySole, !homeSole, !awaySole]);
                changed = true;
            } else {
                const first = firstRes.rows[0];
                // Сторона свободна для автозаполнения: «не указан» либо вписан игрок,
                // которого в текущей заявке на матч нет. Пустые ворота (id NULL без
                // флага) — осознанный выбор, его не трогаем.
                const isOpenSide = (unspecified, goalieId, teamId) =>
                    unspecified || (goalieId != null && !lineupGoalies(teamId).some(id => String(id) === String(goalieId)));
                const fillHome = !!homeSole && isOpenSide(first.home_goalie_unspecified, first.home_goalie_id, home_team_id);
                const fillAway = !!awaySole && isOpenSide(first.away_goalie_unspecified, first.away_goalie_id, away_team_id);

                if (fillHome || fillAway) {
                    await client.query(`
                        UPDATE game_goalie_log
                        SET home_goalie_id = $1, away_goalie_id = $2,
                            home_goalie_unspecified = $3, away_goalie_unspecified = $4
                        WHERE id = $5
                    `, [
                        fillHome ? homeSole : first.home_goalie_id,
                        fillAway ? awaySole : first.away_goalie_id,
                        fillHome ? false : first.home_goalie_unspecified,
                        fillAway ? false : first.away_goalie_unspecified,
                        first.id
                    ]);
                    changed = true;
                }
            }

            if (changed) await triggerRecalcFlag(client, gameId);
        }

        await client.query('COMMIT');
        res.json({ success: true, changed });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка автозаполнения журнала вратарей:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    } finally {
        client.release();
    }
};

export const getGoalieShotsSummary = async (req, res) => {
    const { gameId } = req.params;
    try {
        const result = await pool.query(`
            SELECT id, goalie_id, team_id, period, shots_count
            FROM game_shots_by_goalie
            WHERE game_id = $1
            ORDER BY team_id, goalie_id, period
        `, [gameId]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения бросков по вратарям:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// Сохранить количество бросков в створ на конкретного вратаря за период.
// shots_count хранит ВСЕ броски в створ (включая те, что стали голами с броска).
// Командные броски в створ вычисляются как сумма по вратарям соперника + голы в пустые.
export const saveGoalieShotsSummary = async (req, res) => {
    const { gameId } = req.params;
    const { goalie_id, team_id, period, shots_count } = req.body;

    if (!team_id || !period) {
        return res.status(400).json({ success: false, error: 'team_id и period обязательны' });
    }

    try {
        const flagRes = await pool.query(`
            SELECT CASE WHEN g.stage_type = 'playoff' THEN d.playoff_track_shots ELSE d.reg_track_shots END AS track_shots
            FROM games g
            LEFT JOIN divisions d ON d.id = g.division_id
            WHERE g.id = $1
        `, [gameId]);
        if (flagRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }
        if (flagRes.rows[0].track_shots === false) {
            return res.status(403).json({ success: false, error: 'Лига не ведёт статистику бросков для этого дивизиона' });
        }

        // Пустое значение (null/'') — это НЕ ноль, а «данные не введены»: строку
        // удаляем, чтобы агрегаторы статистики видели прочерк, а не результат 0.
        // Ноль остаётся полноценным значением («по этому вратарю не бросали»).
        // Зеркалит поведение TR (ShotsSheet: очистка ячейки убирает её из entries).
        const isCleared = shots_count === null || shots_count === undefined || shots_count === '';

        if (isCleared) {
            await pool.query(`
                DELETE FROM game_shots_by_goalie
                WHERE game_id = $1 AND team_id = $2 AND period = $3
                  AND goalie_id IS NOT DISTINCT FROM $4
            `, [gameId, team_id, period, goalie_id || null]);
        } else if (goalie_id) {
            await pool.query(`
                INSERT INTO game_shots_by_goalie (game_id, goalie_id, team_id, period, shots_count)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (game_id, goalie_id, period)
                DO UPDATE SET shots_count = EXCLUDED.shots_count
            `, [gameId, goalie_id, team_id, period, shots_count]);
        } else {
            // goalie_id = NULL (пустые ворота либо «не указан» — секретарь различает
            // их через team_id/сторону на фронте, здесь это просто «броски без
            // привязки к конкретному вратарю»). UNIQUE(game_id, goalie_id, period) не
            // ловит повторные NULL — Postgres считает каждый NULL уникальным — поэтому
            // апдейтим вручную по team_id, а не полагаемся на ON CONFLICT.
            const upd = await pool.query(`
                UPDATE game_shots_by_goalie
                SET shots_count = $1
                WHERE game_id = $2 AND goalie_id IS NULL AND team_id = $3 AND period = $4
            `, [shots_count, gameId, team_id, period]);
            if (upd.rowCount === 0) {
                await pool.query(`
                    INSERT INTO game_shots_by_goalie (game_id, goalie_id, team_id, period, shots_count)
                    VALUES ($1, NULL, $2, $3, $4)
                `, [gameId, team_id, period, shots_count]);
            }
        }

        await triggerRecalcFlag(pool, gameId);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка сохранения бросков по вратарю:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const getGameAudioUrl = async (req, res) => {
    try {
        const { gameId } = req.params;

        const gameRes = await pool.query(`
            SELECT s.league_id
            FROM games g
            JOIN divisions d ON g.division_id = d.id
            JOIN seasons s ON d.season_id = s.id
            WHERE g.id = $1
        `, [gameId]);

        if (gameRes.rows.length === 0) {
            return res.json({ success: true, url: `https://s3.twcstorage.ru/hockeyeco-uploads/audio/league-default/Intro.mp3?t=${Date.now()}` });
        }

        const leagueId = gameRes.rows[0].league_id;
        const leagueKey = `audio/league-${leagueId}/Intro.mp3`;

        try {
            await s3.send(new HeadObjectCommand({
                Bucket: 'hockeyeco-uploads',
                Key: leagueKey
            }));
            return res.json({ success: true, url: `https://s3.twcstorage.ru/hockeyeco-uploads/${leagueKey}?t=${Date.now()}` });
        } catch (e) {
            return res.json({ success: true, url: `https://s3.twcstorage.ru/hockeyeco-uploads/audio/league-default/Intro.mp3?t=${Date.now()}` });
        }
    } catch (err) {
        console.error('Ошибка получения аудио URL:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// Проверка наличия статичных PA-файлов диктора арены (сирена/предупреждения/бип) для лиги матча.
// Используется настройками секретарской панели перед включением тумблера диктора.
export const getArenaAudioFiles = async (req, res) => {
    try {
        const { gameId } = req.params;
        const leagueId = await getLeagueIdForGame(gameId);

        if (!leagueId) {
            const files = Object.fromEntries(ARENA_STATIC_AUDIO_FILES.map(f => [f, false]));
            return res.json({ success: true, files });
        }

        const entries = await Promise.all(
            ARENA_STATIC_AUDIO_FILES.map(async (f) => [f, await arenaAudioFileExists(leagueId, f)])
        );
        res.json({ success: true, files: Object.fromEntries(entries) });
    } catch (err) {
        console.error('Ошибка проверки аудиофайлов диктора арены:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};