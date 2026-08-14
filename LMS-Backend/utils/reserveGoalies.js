import pool from '../config/db.js';

/**
 * Правила резервных вратарей дивизиона — в одном месте.
 *
 * Механика: у каждого дивизиона есть пул вратарей (division_reserve_goalies),
 * которых команда может пригласить на матч, если её собственный вратарь не
 * выходит. Договариваются офлайн, а секретарь перед матчем вписывает вратаря
 * в состав через шторку «Состав на матч».
 *
 * Один и тот же набор проверок нужен в двух местах: шторка показывает секретарю,
 * кого можно взять и почему нельзя остальных, а сохранение состава обязано те же
 * ограничения не пропустить (шторка — это подсказка, а не защита). Поэтому оба
 * эндпоинта ходят сюда, а не считают правила каждый по-своему.
 *
 * ГРАНДФАЗЕР. Вратарь, уже вписанный в состав ЭТОГО матча, проходит все проверки
 * молча. Иначе секретарь не смог бы поправить номер в старом протоколе после того,
 * как лига выключила механику, подняла правило «два матча подряд» или изменила
 * лимит — правила проверяются в момент добавления, а не задним числом.
 */

// Контекст матча + настройки механики. Одна строка, если матч официальный
// (division_id заполнен), иначе ноль — механика существует только в дивизионах.
const CTX_SQL = `
    SELECT g.id                                   AS game_id,
           g.division_id,
           g.game_date,
           s.league_id,
           l.reserve_goalies_enabled              AS enabled,
           l.reserve_goalie_own_dq_blocks         AS own_dq_blocks,
           d.reserve_goalie_max_per_game          AS max_per_game,
           d.reserve_goalie_block_back_to_back    AS block_back_to_back
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
           COALESCE(t.short_name, t.name) AS opponent_name
    FROM games pg
    LEFT JOIN teams t
           ON t.id = CASE WHEN pg.home_team_id = $2 THEN pg.away_team_id ELSE pg.home_team_id END
    WHERE pg.division_id = $3
      AND (pg.home_team_id = $2 OR pg.away_team_id = $2)
      AND pg.id <> $1
      AND pg.status <> 'cancelled'
      AND pg.game_date IS NOT NULL
      AND (pg.game_date, pg.id) < ($4::timestamptz, $1::int)
    ORDER BY pg.game_date DESC, pg.id DESC
    LIMIT 1
`;

const formatGameDate = (value) => {
    if (!value) return '';
    return new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric',
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
 *   goalies: object[],           — пул дивизиона с причиной блокировки у каждого
 *   alreadyInRoster: Set<number> — кто из них уже вписан в состав этого матча
 * }>}
 */
export const loadReserveGoaliesForGame = async (db, gameId, teamId) => {
    const empty = { enabled: false, maxPerGame: 0, blockBackToBack: false, goalies: [], alreadyInRoster: new Set() };

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

    const { rows: poolRows } = await db.query(
        `SELECT drg.id, drg.player_id, drg.jersey_number, drg.note,
                u.first_name, u.last_name, u.middle_name, u.avatar_url,
                user_active_disqualifications(drg.player_id, $2) AS active_disqualifications
         FROM division_reserve_goalies drg
         JOIN users u ON u.id = drg.player_id
         WHERE drg.division_id = $1
         ORDER BY u.last_name, u.first_name`,
        [ctx.division_id, ctx.league_id]
    );

    const goalies = poolRows.map(row => {
        const playerId = Number(row.player_id);
        let blockReason = null;

        // Уже в составе — проверки не применяем (см. грандфазер в шапке файла)
        if (!alreadyInRoster.has(playerId)) {
            if (dqBlocksReserveAppearance(row.active_disqualifications, base.ownDqBlocks)) {
                blockReason = row.active_disqualifications.some(d => d.is_reserve_goalie)
                    ? 'Отбывает дисквалификацию, полученную резервным вратарём'
                    : 'Дисквалифицирован — в протокол включить нельзя';
            } else if (base.blockBackToBack && prevPlayers.has(playerId)) {
                blockReason = `Играл резервным в предыдущем матче этой команды (${formatGameDate(prevGame.game_date)}`
                    + `${prevGame.opponent_name ? `, ${prevGame.opponent_name}` : ''})`
                    + ' — правило дивизиона запрещает два матча подряд';
            }
        }

        return { ...row, player_id: playerId, is_in_roster: alreadyInRoster.has(playerId), block_reason: blockReason };
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
 * @returns {Promise<string|null>} текст ошибки или null, если всё чисто
 */
export const validateReserveGoalies = async (db, gameId, teamId, reservePlayerIds) => {
    const ids = [...new Set((reservePlayerIds || []).map(Number).filter(Boolean))];
    if (ids.length === 0) return null;

    const { enabled, maxPerGame, goalies, alreadyInRoster } = await loadReserveGoaliesForGame(db, gameId, teamId);

    // Новые — те, кого в составе этого матча ещё не было. Только они проверяются.
    const added = ids.filter(id => !alreadyInRoster.has(id));

    if (!enabled && added.length > 0) {
        return 'Механика резервных вратарей у лиги выключена';
    }

    const poolById = new Map(goalies.map(g => [g.player_id, g]));

    for (const id of added) {
        const goalie = poolById.get(id);
        if (!goalie) {
            return 'Резервным вратарём можно заявить только игрока из списка этого дивизиона';
        }
        if (goalie.block_reason) {
            return `${goalie.last_name} ${goalie.first_name}: ${goalie.block_reason}`;
        }
    }

    // Пул дивизиона общий, и в него может попасть игрок, заявленный за одну из его
    // команд. Для СВОЕЙ команды он не резервный, а обычный игрок заявки: иначе его
    // статистика уехала бы из личной в резервную, а в протоколе он оказался бы
    // дважды — строкой заявки и строкой резерва.
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
