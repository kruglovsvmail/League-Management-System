import { DEFAULT_TIMEZONE } from './defaultTimezone.js';

/**
 * Правила резервных вратарей — в одном месте.
 *
 * Механика: у лиги есть список резервных вратарей (league_reserve_goalies), и у
 * каждого отмечено, в каких дивизионах он может играть (league_reserve_goalie_divisions).
 * Команда приглашает такого вратаря на матч, если её собственный не выходит.
 * Договариваются офлайн, а секретарь перед матчем вписывает вратаря в состав через
 * шторку «Состав на матч». Все настройки механики — у лиги (вкладка «Резерв. вратари»
 * → «Параметры»), у дивизионов своих нет.
 *
 * Один и тот же набор проверок нужен в двух местах: шторка показывает секретарю,
 * кого можно взять и почему нельзя остальных, а сохранение состава обязано те же
 * ограничения не пропустить (шторка — это подсказка, а не защита). Поэтому оба
 * эндпоинта ходят сюда, а не считают правила каждый по-своему.
 *
 * ГРАНДФАЗЕР. Вратарь, уже вписанный в состав ЭТОГО матча, проходит все проверки
 * молча. Иначе секретарь не смог бы поправить номер в старом протоколе после того,
 * как лига выключила вратаря, у него истёк документ, лига подняла правило «два матча
 * подряд» или изменила лимит — правила проверяются в момент добавления, а не задним числом.
 */

// Контекст матча + настройки механики. Одна строка, если матч официальный
// (division_id заполнен), иначе ноль — механика существует только в дивизионах.
// game_day — календарный день матча: на него проверяются сроки документов. Матч без
// даты проверяется на сегодня.
const CTX_SQL = `
    SELECT g.id                                   AS game_id,
           g.division_id,
           g.game_date,
           d.season_id,
           s.league_id,
           to_char(COALESCE(g.game_date, now()) AT TIME ZONE '${DEFAULT_TIMEZONE}', 'YYYY-MM-DD') AS game_day,
           l.reserve_goalies_enabled              AS enabled,
           l.reserve_goalie_own_dq_blocks         AS own_dq_blocks,
           l.reserve_goalie_max_per_game          AS max_per_game,
           l.reserve_goalie_block_back_to_back    AS block_back_to_back,
           l.reserve_goalie_block_with_own_goalie AS block_with_own_goalie,
           l.reserve_goalie_req_med_cert          AS req_medical,
           l.reserve_goalie_req_insurance         AS req_insurance,
           l.reserve_goalie_req_consent           AS req_consent
    FROM games g
    JOIN divisions d ON d.id = g.division_id
    JOIN seasons   s ON s.id = d.season_id
    JOIN leagues   l ON l.id = s.league_id
    WHERE g.id = $1
`;

// Предыдущий по календарю матч этой команды в этом же дивизионе — тот, с которым
// сравнивается правило «два матча подряд». Берётся именно ближайший предыдущий,
// а не ближайший сыгранный: если в нём состав не заполняли, вратарь в нём играть
// не мог, и правило не срабатывает. Сравнение пары (дата, id) разводит матчи,
// поставленные на одну и ту же дату и время.
const PREV_GAME_SQL = `
    SELECT pg.id,
           pg.game_date,
           COALESCE(tt.snap_short_name, tt.snap_name, t.short_name, t.name) AS opponent_name
    FROM games pg
    LEFT JOIN teams t
           ON t.id = CASE WHEN pg.home_team_id = $2 THEN pg.away_team_id ELSE pg.home_team_id END
    LEFT JOIN tournament_teams tt
           ON tt.division_id = pg.division_id AND tt.team_id = t.id
    WHERE pg.division_id = $3
      AND (pg.home_team_id = $2 OR pg.away_team_id = $2)
      AND pg.id <> $1
      AND pg.status <> 'cancelled'
      AND pg.game_date IS NOT NULL
      AND (pg.game_date, pg.id) < ($4::timestamptz, $1::int)
    ORDER BY pg.game_date DESC, pg.id DESC
    LIMIT 1
`;

// Фото резервного вратаря в лиговых списках: сначала фото, загруженное лигой
// специально для резерва, иначе заявочный снимок в этой лиге (фото на момент
// допуска). Личный аватар аккаунта не показываем — так решено сознательно: в лиге
// человека узнают по фото, которое лига видела сама. lrg — алиас league_reserve_goalies.
export const RESERVE_GOALIE_PHOTO_SQL = `
    COALESCE(
        lrg.photo_url,
        (SELECT tr_ph.photo_snapshot_url
           FROM tournament_rosters tr_ph
           JOIN tournament_teams tt_ph ON tt_ph.id = tr_ph.tournament_team_id
           JOIN divisions d_ph ON d_ph.id = tt_ph.division_id
           JOIN seasons s_ph ON s_ph.id = d_ph.season_id
          WHERE tr_ph.player_id = lrg.player_id AND s_ph.league_id = lrg.league_id
            AND tr_ph.photo_snapshot_url IS NOT NULL
          ORDER BY tr_ph.id DESC LIMIT 1)
    )`;

/**
 * Документ допуска резервного вратаря на сезон — медсправка или полис.
 *
 * Кандидатов два вида, и они равноправны: свой документ (загружен лигой во вкладке
 * «Резерв. вратари», лежит в league_reserve_goalies) и документы из заявок этого
 * человека в командах того же сезона (tournament_person_docs) — лига так решила,
 * чтобы не загружать одну и ту же справку дважды. Из всех берётся тот, что действует
 * дольше всего (без срока — дольше всех), при равенстве — свой. Если лучший истёк,
 * истекли и остальные, так что для проверки «действует ли» другого не нужно.
 *
 * lrg — алиас league_reserve_goalies, seasonExpr — SQL-выражение с id сезона.
 */
const docLateral = (type, alias, seasonExpr) => `
    LEFT JOIN LATERAL (
        SELECT x.url, x.expires_at, x.source, x.team_name
          FROM (
                SELECT lrg.${type}_url AS url, lrg.${type}_expires_at AS expires_at,
                       'own'::text AS source, NULL::text AS team_name, 0 AS prio
                 WHERE lrg.${type}_url IS NOT NULL
                UNION ALL
                SELECT tpd.${type}_url, tpd.${type}_expires_at, 'application'::text,
                       COALESCE(tt_doc.snap_short_name, tt_doc.snap_name, t_doc.short_name, t_doc.name), 1
                  FROM tournament_person_docs tpd
                  JOIN tournament_teams tt_doc ON tt_doc.id = tpd.tournament_team_id
                  JOIN divisions d_doc ON d_doc.id = tt_doc.division_id
                  LEFT JOIN teams t_doc ON t_doc.id = tt_doc.team_id
                 WHERE tpd.user_id = lrg.player_id
                   AND d_doc.season_id = ${seasonExpr}
                   AND tpd.${type}_url IS NOT NULL
               ) x
         ORDER BY x.expires_at DESC NULLS FIRST, x.prio
         LIMIT 1
    ) ${alias} ON true`;

/**
 * Документы резервного вратаря на сезон — куски запроса, которые подклеиваются
 * к выборке из league_reserve_goalies lrg. Согласие одно на «человек + сезон»
 * (user_season_consents): подписанное в своей команде засчитывается само.
 *
 * *_source: 'own' — документ загружен лигой для резерва, 'application' — взят из
 * заявки команды (*_team — какой). Фронт по нему решает, можно ли документ менять
 * во вкладке: из заявки он только показывается.
 */
export const reserveDocsSql = (seasonExpr) => ({
    joins: `
        ${docLateral('medical', 'doc_med', seasonExpr)}
        ${docLateral('insurance', 'doc_ins', seasonExpr)}
        LEFT JOIN user_season_consents doc_cons
               ON doc_cons.user_id = lrg.player_id AND doc_cons.season_id = ${seasonExpr}`,
    columns: `
        doc_med.url                                        AS medical_url,
        to_char(doc_med.expires_at, 'YYYY-MM-DD')          AS medical_expires_at,
        doc_med.source                                     AS medical_source,
        doc_med.team_name                                  AS medical_team,
        doc_ins.url                                        AS insurance_url,
        to_char(doc_ins.expires_at, 'YYYY-MM-DD')          AS insurance_expires_at,
        doc_ins.source                                     AS insurance_source,
        doc_ins.team_name                                  AS insurance_team,
        doc_cons.consent_url                               AS consent_url,
        to_char(doc_cons.consent_expires_at, 'YYYY-MM-DD') AS consent_expires_at`,
});

const DOC_TEXTS = {
    medical:   { missing: 'Нет медсправки',                       expired: 'Истекла медсправка' },
    insurance: { missing: 'Нет страхового полиса',                expired: 'Истёк страховой полис' },
    consent:   { missing: 'Нет согласия на обработку данных',     expired: 'Истекло согласие на обработку данных' },
};

const isoToRu = (iso) => {
    const [year, month, day] = iso.split('-');
    return `${day}.${month}.${year}`;
};

/**
 * Какие документы лига требует от резервного вратаря — из строки leagues
 * (или из контекста матча с теми же именами полей).
 */
export const readReserveDocRequirements = (row) => ({
    medical: !!(row.reserve_goalie_req_med_cert ?? row.req_medical),
    insurance: !!(row.reserve_goalie_req_insurance ?? row.req_insurance),
    consent: !!(row.reserve_goalie_req_consent ?? row.req_consent),
});

/**
 * Мешают ли документы выйти на матч: текст причины или null.
 * Срок действует включительно (как в составе дивизиона), документ без срока
 * считается действующим. Проверяются только обязательные документы.
 *
 * @param {object} row — строка с колонками из reserveDocsSql
 * @param {{medical: boolean, insurance: boolean, consent: boolean}} required
 * @param {string} onDay — 'YYYY-MM-DD', день матча
 */
export const reserveDocsBlockReason = (row, required, onDay) => {
    for (const type of ['medical', 'insurance', 'consent']) {
        if (!required[type]) continue;
        const url = row[`${type}_url`];
        const expires = row[`${type}_expires_at`];
        if (!url) return DOC_TEXTS[type].missing;
        if (expires && expires < onDay) return `${DOC_TEXTS[type].expired} ${isoToRu(expires)}`;
    }
    return null;
};

const formatGameDate = (value) => {
    if (!value) return '';
    return new Intl.DateTimeFormat('ru-RU', {
        timeZone: DEFAULT_TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date(value));
};

/**
 * Мешает ли активная дисквалификация выйти резервным вратарём.
 *
 * Различаются два вида наказаний, и это различие — суть настройки лиги:
 *  • полученное ИМЕННО резервным вратарём (disqualifications.is_reserve_goalie)
 *    закрывает его везде и всегда. Иначе наказание обходилось бы одним звонком
 *    в другую команду — а именно от этого оно и защищает;
 *  • полученное в своей команде закрывает резервные выходы, только если лига
 *    включила тумблер reserve_goalie_own_dq_blocks. Выключен — лига считает, что
 *    отбывание бана в своей команде не мешает подработать вратарём у соседей.
 *
 * Командный штраф (is_team_wide) идёт по второму правилу: человек попал под него
 * как игрок своей команды, а не как резервный вратарь.
 */
export const dqBlocksReserveAppearance = (activeDisqualifications, ownDqBlocks) => {
    const list = Array.isArray(activeDisqualifications) ? activeDisqualifications : [];
    return list.some(d => d.is_reserve_goalie || ownDqBlocks);
};

/**
 * Всё, что нужно знать про резервных вратарей в контексте конкретного матча
 * и конкретной команды.
 *
 * @param {object} db — pool или уже открытый клиент транзакции
 * @param {number|string} gameId
 * @param {number|string} teamId
 * @returns {Promise<{
 *   enabled: boolean,            — включена ли механика у лиги
 *   maxPerGame: number,          — лимит резервных вратарей на команду в матче
 *   blockBackToBack: boolean,    — действует ли запрет двух матчей подряд
 *   blockWithOwnGoalie: boolean, — нельзя ли брать резервного, если в составе есть свой вратарь
 *   goalies: object[],           — вратари, отмеченные в дивизионе матча, с причиной блокировки
 *   alreadyInRoster: Set<number> — кто из резервных уже вписан в состав этого матча
 * }>}
 */
export const loadReserveGoaliesForGame = async (db, gameId, teamId) => {
    const empty = { enabled: false, maxPerGame: 0, blockBackToBack: false, blockWithOwnGoalie: false, goalies: [], alreadyInRoster: new Set() };

    if (!gameId || !teamId) return empty;

    const { rows: ctxRows } = await db.query(CTX_SQL, [gameId]);
    const ctx = ctxRows[0];
    // Матча нет либо он не в дивизионе (товарищеский, внешний турнир) — механики нет
    if (!ctx) return empty;

    // Кто из резервных уже в составе этого матча за эту команду. Нужен и для
    // грандфазера, и чтобы шторка не показывала их дважды — слева в пуле и
    // справа в составе.
    const { rows: inRosterRows } = await db.query(
        `SELECT player_id FROM game_rosters
         WHERE game_id = $1 AND team_id = $2 AND is_reserve_goalie`,
        [gameId, teamId]
    );
    const alreadyInRoster = new Set(inRosterRows.map(r => Number(r.player_id)));

    const base = {
        enabled: !!ctx.enabled,
        maxPerGame: Number(ctx.max_per_game) || 1,
        blockBackToBack: !!ctx.block_back_to_back,
        blockWithOwnGoalie: !!ctx.block_with_own_goalie,
        ownDqBlocks: !!ctx.own_dq_blocks,
        alreadyInRoster,
    };

    // Механика выключена — пул не отдаём вовсе, но уже вписанных вратарей
    // возвращаем (грандфазер), чтобы сохранение старого протокола не падало.
    if (!base.enabled) return { ...base, goalies: [] };

    const { rows: prevRows } = await db.query(PREV_GAME_SQL, [gameId, teamId, ctx.division_id, ctx.game_date]);
    const prevGame = prevRows[0] || null;

    // Кто играл резервным в предыдущем матче этой команды
    let prevPlayers = new Set();
    if (prevGame && base.blockBackToBack) {
        const { rows } = await db.query(
            `SELECT player_id FROM game_rosters
             WHERE game_id = $1 AND team_id = $2 AND is_reserve_goalie`,
            [prevGame.id, teamId]
        );
        prevPlayers = new Set(rows.map(r => Number(r.player_id)));
    }

    // Выключенных и вратарей без документов не прячем: секретарь должен видеть,
    // что человек есть в списке и почему его нельзя взять (в TR и на ТФХ их нет вовсе).
    const docs = reserveDocsSql('$3');
    const { rows: poolRows } = await db.query(
        `SELECT lrg.id, lrg.player_id, lrg.jersey_number, lrg.note, lrg.is_active,
                u.first_name, u.last_name, u.middle_name,
                ${RESERVE_GOALIE_PHOTO_SQL} AS avatar_url,
                ${docs.columns},
                user_active_disqualifications(lrg.player_id, $2) AS active_disqualifications
         FROM league_reserve_goalies lrg
         JOIN league_reserve_goalie_divisions lrgd
           ON lrgd.reserve_goalie_id = lrg.id AND lrgd.division_id = $1
         JOIN users u ON u.id = lrg.player_id
         ${docs.joins}
         WHERE lrg.league_id = $2
         ORDER BY u.last_name, u.first_name`,
        [ctx.division_id, ctx.league_id, ctx.season_id]
    );

    const required = readReserveDocRequirements(ctx);

    const goalies = poolRows.map(row => {
        const playerId = Number(row.player_id);
        let blockReason = null;

        // Уже в составе — проверки не применяем (см. грандфазер в шапке файла)
        if (!alreadyInRoster.has(playerId)) {
            const docsReason = reserveDocsBlockReason(row, required, ctx.game_day);

            if (!row.is_active) {
                blockReason = 'Выключен лигой';
            } else if (dqBlocksReserveAppearance(row.active_disqualifications, base.ownDqBlocks)) {
                blockReason = row.active_disqualifications.some(d => d.is_reserve_goalie)
                    ? 'Отбывает дисквалификацию, полученную резервным вратарём'
                    : 'Дисквалифицирован — в протокол включить нельзя';
            } else if (docsReason) {
                blockReason = `${docsReason} — без него лига не допускает резервного вратаря`;
            } else if (base.blockBackToBack && prevPlayers.has(playerId)) {
                blockReason = `Играл резервным в предыдущем матче этой команды (${formatGameDate(prevGame.game_date)}`
                    + `${prevGame.opponent_name ? `, ${prevGame.opponent_name}` : ''})`
                    + ' — правило лиги запрещает два матча подряд';
            }
        }

        // Документы шторке не нужны — она показывает только причину блокировки
        const {
            medical_url, medical_expires_at, medical_source, medical_team,
            insurance_url, insurance_expires_at, insurance_source, insurance_team,
            consent_url, consent_expires_at,
            ...goalie
        } = row;

        return { ...goalie, player_id: playerId, is_in_roster: alreadyInRoster.has(playerId), block_reason: blockReason };
    });

    return { ...base, goalies };
};

/**
 * Проверка состава перед записью в game_rosters.
 *
 * @param {object} db — клиент открытой транзакции сохранения состава
 * @param {number|string} gameId
 * @param {number|string} teamId
 * @param {number[]} reservePlayerIds — кого секретарь пометил резервным вратарём
 * @param {{hasOwnGoalie?: boolean}} lineup — есть ли в сохраняемом составе вратарь
 *        самой команды (не резервный). Нужен правилу лиги reserve_goalie_block_with_own_goalie:
 *        состав ещё не записан, поэтому судить можно только по присланному.
 * @returns {Promise<string|null>} текст ошибки или null, если всё чисто
 */
export const validateReserveGoalies = async (db, gameId, teamId, reservePlayerIds, { hasOwnGoalie = false } = {}) => {
    const ids = [...new Set((reservePlayerIds || []).map(Number).filter(Boolean))];
    if (ids.length === 0) return null;

    const { enabled, maxPerGame, blockWithOwnGoalie, goalies, alreadyInRoster } = await loadReserveGoaliesForGame(db, gameId, teamId);

    // Новые — те, кого в составе этого матча ещё не было. Только они проверяются.
    const added = ids.filter(id => !alreadyInRoster.has(id));

    if (!enabled && added.length > 0) {
        return 'Механика резервных вратарей у лиги выключена';
    }

    // Свой вратарь вышел — резервный не нужен. Только для добавляемых: вписанный раньше
    // остаётся, даже если лига включила правило позже или вратарь команды нашёлся потом.
    if (blockWithOwnGoalie && hasOwnGoalie && added.length > 0) {
        return 'В составе есть вратарь команды — по правилу лиги резервного вратаря добавить нельзя';
    }

    const poolById = new Map(goalies.map(g => [g.player_id, g]));

    for (const id of added) {
        const goalie = poolById.get(id);
        if (!goalie) {
            return 'Резервным вратарём можно заявить только вратаря, которого лига отметила в этом дивизионе';
        }
        if (goalie.block_reason) {
            return `${goalie.last_name} ${goalie.first_name}: ${goalie.block_reason}`;
        }
    }

    // В резерв лиги может попасть игрок, заявленный за одну из команд дивизиона. Для
    // СВОЕЙ команды он не резервный, а обычный игрок заявки: иначе его статистика
    // уехала бы из личной в резервную, а в протоколе он оказался бы дважды — строкой
    // заявки и строкой резерва.
    //
    // Проверяем только добавленных: вратарь мог сыграть резервным, а потом
    // заявиться в эту команду по-настоящему — старый протокол от этого не должен
    // переставать сохраняться.
    if (added.length > 0) {
        const { rows: ownRoster } = await db.query(
            `SELECT u.last_name, u.first_name
             FROM tournament_rosters tr
             JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
             JOIN games g ON g.division_id = tt.division_id
             JOIN users u ON u.id = tr.player_id
             WHERE g.id = $1
               AND tt.team_id = $2
               AND tr.player_id = ANY($3::int[])
               AND tr.application_status = 'approved'
               AND tr.period_end IS NULL`,
            [gameId, teamId, added]
        );
        if (ownRoster.length > 0) {
            const names = ownRoster.map(r => `${r.last_name} ${r.first_name}`).join(', ');
            return `Игрок заявлен за эту команду и включается в состав из заявки, а не резервным вратарём: ${names}`;
        }
    }

    // Лимит считается по итоговому составу целиком, а не только по добавленным:
    // иначе лимит можно было бы превысить, добавляя вратарей по одному.
    if (ids.length > maxPerGame) {
        return `На один матч команда может заявить не больше ${maxPerGame} резервных вратарей`;
    }

    return null;
};

export default { loadReserveGoaliesForGame, validateReserveGoalies };
