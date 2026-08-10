import pool from '../config/db.js';
import {
    METRIC_DEFS,
    METRIC_KEYS,
    metricFitsPlayerType,
    metricAvailableInDivision,
    metricUnavailableReason,
} from '../utils/nominationMetrics.js';
import { calculateNomination } from '../utils/nominationCalculator.js';

const SCOPES = ['division', 'team'];
const PLAYER_TYPES = ['skater', 'goalie', 'all'];
const POSITION_FILTERS = ['all', 'forward', 'defense'];
const STAGE_TYPES = ['regular', 'playoff', 'all'];
const SORT_ORDERS = ['asc', 'desc'];

// Флаги учёта нужны и для валидации, и для отдачи на фронт — там по ним
// гасятся недоступные показатели в выпадающем списке.
const DIVISION_FLAGS_SQL = `
    SELECT id, name, tournament_type,
           reg_track_plus_minus, playoff_track_plus_minus,
           reg_track_shots, playoff_track_shots
    FROM divisions WHERE id = $1
`;

/**
 * Проверка тела запроса. Возвращает { error } либо { value } с нормализованными
 * полями — дальше в SQL уходят только они, ничего из req.body напрямую.
 */
function validate(body, division) {
    const name = (body.name || '').trim();
    if (!name) return { error: 'Укажите название номинации' };
    if (name.length > 120) return { error: 'Название не длиннее 120 символов' };

    const scope = body.scope;
    if (!SCOPES.includes(scope)) return { error: 'Некорректная область розыгрыша' };

    const playerType = body.player_type;
    if (!PLAYER_TYPES.includes(playerType)) return { error: 'Некорректный тип игрока' };

    const stageType = body.stage_type;
    if (!STAGE_TYPES.includes(stageType)) return { error: 'Некорректная стадия' };

    // Амплуа есть только у полевых: у вратарей оно одно, у «всех» — не определено.
    let positionFilter = body.position_filter || 'all';
    if (!POSITION_FILTERS.includes(positionFilter)) return { error: 'Некорректное амплуа' };
    if (playerType !== 'skater') positionFilter = 'all';

    const sortOrder = body.sort_order;
    if (!SORT_ORDERS.includes(sortOrder)) return { error: 'Некорректное направление сортировки' };

    const metric = body.metric;
    if (!METRIC_KEYS.includes(metric)) return { error: 'Неизвестный основной показатель' };
    if (!metricFitsPlayerType(metric, playerType)) {
        return { error: `Показатель «${METRIC_DEFS[metric].label}» неприменим к выбранному типу игрока` };
    }
    if (!metricAvailableInDivision(metric, division, stageType)) {
        return { error: metricUnavailableReason(metric, division, stageType) };
    }

    // Тай-брейки: тот же белый список, плюс те же ограничения по типу игрока и
    // учёту в дивизионе — иначе через второстепенный критерий можно протащить
    // ровно тот показатель, который запрещён основным.
    //
    // У каждого критерия своё направление: «меньше штрафа» и «больше штрафа» —
    // это разные номинации, одного общего порядка тут не хватает. Формат
    // элемента — { metric, order }; голая строка принимается как совместимость
    // и разворачивается в направление показателя по умолчанию.
    const rawTiebreakers = Array.isArray(body.tiebreakers) ? body.tiebreakers : [];
    const tiebreakers = [];
    const seenTiebreakers = new Set();
    for (const item of rawTiebreakers) {
        const key = typeof item === 'string' ? item : item?.metric;
        if (!METRIC_KEYS.includes(key)) return { error: 'Неизвестный второстепенный показатель' };
        if (key === metric) continue;                 // дубль основного бессмыслен
        if (seenTiebreakers.has(key)) continue;
        if (!metricFitsPlayerType(key, playerType)) {
            return { error: `Показатель «${METRIC_DEFS[key].label}» неприменим к выбранному типу игрока` };
        }
        if (!metricAvailableInDivision(key, division, stageType)) {
            return { error: metricUnavailableReason(key, division, stageType) };
        }

        const order = typeof item === 'string' ? METRIC_DEFS[key].order : item?.order;
        if (!SORT_ORDERS.includes(order)) {
            return { error: `Укажите направление для показателя «${METRIC_DEFS[key].label}»` };
        }

        seenTiebreakers.add(key);
        tiebreakers.push({ metric: key, order });
    }

    const minGames = Number.isInteger(body.min_games) ? body.min_games : parseInt(body.min_games, 10) || 0;
    if (minGames < 0 || minGames > 200) return { error: 'Минимум матчей — от 0 до 200' };

    // display_order клиент не присылает: при создании он выставляется в конец
    // списка, при обновлении не трогается.
    return {
        value: {
            name, scope, playerType, positionFilter, stageType,
            metric, sortOrder, tiebreakers, minGames,
        },
    };
}

async function loadDivision(divisionId) {
    const { rows } = await pool.query(DIVISION_FLAGS_SQL, [divisionId]);
    return rows[0] || null;
}

/**
 * Список номинаций дивизиона + справочник показателей.
 * Справочник отдаём вместе со списком, чтобы фронт не держал вторую копию
 * реестра: доступность метрик зависит от флагов дивизиона и стадии, а это
 * знание должно жить в одном месте — здесь.
 */
export const getNominations = async (req, res) => {
    try {
        const { divisionId } = req.params;

        const division = await loadDivision(divisionId);
        if (!division) {
            return res.status(404).json({ success: false, error: 'Дивизион не найден' });
        }

        const { rows } = await pool.query(
            `SELECT id, division_id, name, scope, player_type, position_filter, stage_type,
                    metric, sort_order, tiebreakers, min_games, display_order
             FROM division_nominations
             WHERE division_id = $1
             ORDER BY display_order, id`,
            [divisionId]
        );

        // Для каждой стадии — свой набор доступности: показатель может быть
        // разрешён в регулярке и запрещён в плей-офф.
        const metrics = METRIC_KEYS.map(key => {
            const def = METRIC_DEFS[key];
            const availability = {};
            for (const stage of STAGE_TYPES) {
                availability[stage] = metricAvailableInDivision(key, division, stage)
                    ? { available: true }
                    : { available: false, reason: metricUnavailableReason(key, division, stage) };
            }
            return { key, label: def.label, appliesTo: def.appliesTo, defaultOrder: def.order, availability };
        });

        res.json({ success: true, data: rows, metrics });
    } catch (err) {
        console.error('Ошибка получения номинаций:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки номинаций' });
    }
};

export const createNomination = async (req, res) => {
    try {
        const { divisionId } = req.params;

        const division = await loadDivision(divisionId);
        if (!division) {
            return res.status(404).json({ success: false, error: 'Дивизион не найден' });
        }

        const { error, value } = validate(req.body, division);
        if (error) return res.status(400).json({ success: false, error });

        const { rows } = await pool.query(
            `INSERT INTO division_nominations
               (division_id, name, scope, player_type, position_filter, stage_type,
                metric, sort_order, tiebreakers, min_games, display_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10,
                     COALESCE((SELECT MAX(display_order) + 1 FROM division_nominations WHERE division_id = $1), 0))
             RETURNING id`,
            [divisionId, value.name, value.scope, value.playerType, value.positionFilter, value.stageType,
             value.metric, value.sortOrder, JSON.stringify(value.tiebreakers), value.minGames]
        );

        res.json({ success: true, id: rows[0].id, message: 'Номинация создана' });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, error: 'Номинация с таким названием в этом дивизионе уже есть' });
        }
        console.error('Ошибка создания номинации:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения номинации' });
    }
};

export const updateNomination = async (req, res) => {
    try {
        const { divisionId, nominationId } = req.params;

        // Права проверены по дивизиону из URL, поэтому номинация обязана
        // принадлежать именно ему. Без этой сверки достаточно подставить свой
        // дивизион и чужой nominationId, чтобы править номинацию другой лиги.
        const { rows: owner } = await pool.query(
            'SELECT division_id FROM division_nominations WHERE id = $1',
            [nominationId]
        );
        if (owner.length === 0 || String(owner[0].division_id) !== String(divisionId)) {
            return res.status(404).json({ success: false, error: 'Номинация не найдена' });
        }

        const division = await loadDivision(divisionId);
        if (!division) {
            return res.status(404).json({ success: false, error: 'Дивизион не найден' });
        }

        const { error, value } = validate(req.body, division);
        if (error) return res.status(400).json({ success: false, error });

        await pool.query(
            `UPDATE division_nominations
                SET name = $1, scope = $2, player_type = $3, position_filter = $4,
                    stage_type = $5, metric = $6, sort_order = $7,
                    tiebreakers = $8::jsonb, min_games = $9
              WHERE id = $10`,
            [value.name, value.scope, value.playerType, value.positionFilter, value.stageType,
             value.metric, value.sortOrder, JSON.stringify(value.tiebreakers), value.minGames, nominationId]
        );

        res.json({ success: true, message: 'Номинация обновлена' });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, error: 'Номинация с таким названием в этом дивизионе уже есть' });
        }
        console.error('Ошибка обновления номинации:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения номинации' });
    }
};

/**
 * Витрина: номинации дивизиона вместе с рассчитанными участниками.
 * Отдаётся всем, кто видит дивизион, — это публичная часть, в отличие от
 * конструктора. Список полный; сколько строк показать сразу, решает фронт.
 */
export const getNominationResults = async (req, res) => {
    try {
        const { divisionId } = req.params;

        const { rows: nominations } = await pool.query(
            `SELECT id, division_id, name, scope, player_type, position_filter, stage_type,
                    metric, sort_order, tiebreakers, min_games
             FROM division_nominations
             WHERE division_id = $1
             ORDER BY display_order, id`,
            [divisionId]
        );

        // Номинаций на дивизион единицы, и каждая — лёгкий агрегат по индексу
        // (division_id, stage_type), поэтому считаем разом, не растягивая на запросы.
        const data = await Promise.all(nominations.map(async (n) => {
            const def = METRIC_DEFS[n.metric];
            let players = [];
            try {
                players = await calculateNomination(n);
            } catch (err) {
                // Одна сломанная номинация не должна ронять весь раздел
                console.error(`Ошибка расчёта номинации #${n.id}:`, err.message);
            }
            return {
                id: n.id,
                name: n.name,
                scope: n.scope,
                player_type: n.player_type,
                position_filter: n.position_filter,
                stage_type: n.stage_type,
                metric: n.metric,
                metric_label: def?.label || n.metric,
                metric_format: def?.format || 'int',
                sort_order: n.sort_order,
                min_games: n.min_games,
                players,
            };
        }));

        res.json({ success: true, data });
    } catch (err) {
        console.error('Ошибка расчёта номинаций:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки номинаций' });
    }
};

/**
 * Копирование всех номинаций дивизиона в остальные дивизионы и турниры того же
 * сезона. Сезон принадлежит лиге, так что фильтра по лиге не требуется —
 * season_id уже её задаёт.
 *
 * Две вещи, из-за которых это не простой INSERT ... SELECT:
 *  1) У приёмника могут быть выключены флаги учёта (±, броски). Такую номинацию
 *     конструктор создать не даёт, и копирование не должно её протаскивать —
 *     иначе в базе появятся строки, которые сама форма считает недопустимыми.
 *  2) Название уникально внутри дивизиона. Одноимённую номинацию не трогаем:
 *     перезапись молча снесла бы чужую настройку.
 * Всё, что не поехало, возвращаем списком — иначе пользователь решит, что
 * скопировалось everywhere, и недосчитается наград в паре дивизионов.
 */
export const copyNominationsToSeason = async (req, res) => {
    const client = await pool.connect();
    try {
        const { divisionId } = req.params;

        const { rows: srcRows } = await client.query(
            'SELECT id, season_id FROM divisions WHERE id = $1',
            [divisionId]
        );
        if (srcRows.length === 0) {
            return res.status(404).json({ success: false, error: 'Дивизион не найден' });
        }
        const seasonId = srcRows[0].season_id;

        const { rows: nominations } = await client.query(
            `SELECT name, scope, player_type, position_filter, stage_type,
                    metric, sort_order, tiebreakers, min_games, display_order
             FROM division_nominations
             WHERE division_id = $1
             ORDER BY display_order, id`,
            [divisionId]
        );
        if (nominations.length === 0) {
            return res.status(400).json({ success: false, error: 'В этом дивизионе нет номинаций для копирования' });
        }

        const { rows: targets } = await client.query(
            `SELECT id, name, reg_track_plus_minus, playoff_track_plus_minus,
                    reg_track_shots, playoff_track_shots
             FROM divisions
             WHERE season_id = $1 AND id <> $2
             ORDER BY name`,
            [seasonId, divisionId]
        );
        if (targets.length === 0) {
            return res.status(400).json({ success: false, error: 'В этом сезоне больше нет дивизионов и турниров' });
        }

        await client.query('BEGIN');

        let copied = 0;
        const skipped = [];

        for (const target of targets) {
            for (const n of nominations) {
                // Проверяем и основной показатель, и все тай-брейки: через
                // второстепенный критерий запрещённая метрика прошла бы так же.
                const usedMetrics = [
                    n.metric,
                    ...(Array.isArray(n.tiebreakers) ? n.tiebreakers : [])
                        .map(t => (typeof t === 'string' ? t : t?.metric))
                        .filter(Boolean),
                ];
                const blocked = usedMetrics.find(
                    key => !metricAvailableInDivision(key, target, n.stage_type)
                );
                if (blocked) {
                    skipped.push({
                        division: target.name,
                        nomination: n.name,
                        reason: `не ведётся учёт: ${METRIC_DEFS[blocked]?.label || blocked}`,
                    });
                    continue;
                }

                const { rowCount } = await client.query(
                    `INSERT INTO division_nominations
                       (division_id, name, scope, player_type, position_filter, stage_type,
                        metric, sort_order, tiebreakers, min_games, display_order)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
                     ON CONFLICT DO NOTHING`,
                    [target.id, n.name, n.scope, n.player_type, n.position_filter, n.stage_type,
                     n.metric, n.sort_order, JSON.stringify(n.tiebreakers), n.min_games, n.display_order]
                );

                if (rowCount === 1) copied += 1;
                else skipped.push({ division: target.name, nomination: n.name, reason: 'уже есть номинация с таким названием' });
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            copied,
            skipped,
            targets: targets.length,
            message: copied > 0
                ? `Скопировано номинаций: ${copied} (дивизионов и турниров: ${targets.length})`
                : 'Ничего не скопировано — во всех дивизионах эти номинации уже есть или недоступны',
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Ошибка копирования номинаций:', err);
        res.status(500).json({ success: false, error: 'Ошибка копирования номинаций' });
    } finally {
        client.release();
    }
};

export const deleteNomination = async (req, res) => {
    try {
        const { divisionId, nominationId } = req.params;
        // division_id в условии — не избыточность: права выданы на дивизион из
        // URL, и удалять можно только его собственную номинацию.
        const { rowCount } = await pool.query(
            'DELETE FROM division_nominations WHERE id = $1 AND division_id = $2',
            [nominationId, divisionId]
        );
        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Номинация не найдена' });
        }
        res.json({ success: true, message: 'Номинация удалена' });
    } catch (err) {
        console.error('Ошибка удаления номинации:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления номинации' });
    }
};
