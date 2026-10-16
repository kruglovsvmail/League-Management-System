import pool from '../config/db.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';
import { RESERVE_GOALIE_PHOTO_SQL, reserveDocsSql } from '../utils/reserveGoalies.js';
import { logPersonEvents } from '../utils/personLog.js';

/**
 * Резервные вратари лиги — вкладка «Резерв. вратари» в «Управлении лигой».
 *
 * Вратарь принадлежит лиге (league_reserve_goalies), а в каких дивизионах он может
 * играть — отмечается галочками по сезонам (league_reserve_goalie_divisions). Это
 * только справочник кандидатов: факт участия в матче живёт в
 * game_rosters.is_reserve_goalie, статистика — в reserve_goalie_game_statistics.
 * Поэтому вратаря можно выключить или убрать в любой момент: сыгранные им матчи
 * и статистика от этого не пропадут.
 *
 * Правила допуска на конкретный матч (тумблер «Активен», документы, лимит на команду,
 * запрет двух матчей подряд, дисквалификации) живут не здесь, а в
 * LMS-Backend/utils/reserveGoalies.js — их одинаково применяют шторка состава и
 * сохранение состава. TR и ТФХ повторяют их в своих запросах списка.
 *
 * Права проверены по лиге из URL, поэтому каждая запись обязана принадлежать именно
 * ей: иначе достаточно подставить свою лигу и чужой reserveId (или чужой дивизион),
 * чтобы править список другой лиги.
 */

const DOCS_BUCKET = 'hockeyeco-uploads';

// Медсправка и полис резерва. Это один документ на человека: тот же файл лежит у
// вратаря в резерве (league_reserve_goalies) и в его заявках команд
// (tournament_person_docs). Загрузка в резерве раскладывает его по заявкам выбранного
// сезона (здесь), загрузка в заявке команды — в резерв (триггер
// reserve_goalie_docs_from_application в базе, он ловит и LMS, и Team Room).
// Согласия тут нет: оно на «человек + сезон» и лежит в user_season_consents, общее
// с заявками и так.
const OWN_DOC_TYPES = ['medical', 'insurance'];

// Ключи файлов резерва. Метка времени — чтобы при замене менялась ссылка (браузер не
// покажет старую картинку из кэша), и чтобы новый файл не затирал прежний, на который
// ещё может ссылаться заявка другого сезона.
const photoKey = (reserveId, ext) => `uploads/reserve_goalie_${reserveId}_photo_${Date.now()}.${ext}`;
const docKey = (reserveId, type, ext) => `uploads/reserve_goalie_${reserveId}_${type}_${Date.now()}.${ext}`;
const consentKey = (reserveId, userId, seasonId, ext) => `uploads/reserve_goalie_${reserveId}_${userId}_consent_s${seasonId}.${ext}`;

// Удаляем из бакета только файлы самого резерва: ссылка на чужой объект (например,
// согласие, загруженное в заявке команды) удаляться не должна.
const deleteOwnFile = async (url, reserveId) => {
    const key = (url || '').replace(/^\//, '');
    if (!key.startsWith(`uploads/reserve_goalie_${reserveId}_`)) return;
    await s3
        .send(new DeleteObjectCommand({ Bucket: DOCS_BUCKET, Key: key }))
        .catch((err) => console.error('Не удалось удалить прежний файл резервного вратаря:', err.message));
};

// Медсправку и полис из бакета удаляем, только когда на файл больше никто не ссылается:
// один и тот же файл лежит и в резерве, и в заявках команд (в том числе прошлых сезонов).
// Старые колонки документов в tournament_rosters тоже учитываем — их ещё могут читать.
const deleteIfUnreferenced = async (url) => {
    const key = (url || '').replace(/^\//, '');
    if (!key.startsWith('uploads/')) return;
    const { rowCount } = await pool.query(`
        SELECT 1 FROM tournament_person_docs WHERE medical_url = $1 OR insurance_url = $1 OR consent_url = $1
        UNION ALL
        SELECT 1 FROM league_reserve_goalies WHERE medical_url = $1 OR insurance_url = $1 OR photo_url = $1
        UNION ALL
        SELECT 1 FROM tournament_rosters WHERE medical_url = $1 OR insurance_url = $1 OR consent_url = $1
        UNION ALL
        SELECT 1 FROM user_season_consents WHERE consent_url = $1
        LIMIT 1
    `, [url]);
    if (rowCount > 0) return;
    await s3
        .send(new DeleteObjectCommand({ Bucket: DOCS_BUCKET, Key: key }))
        .catch((err) => console.error('Не удалось удалить прежний файл документа:', err.message));
};

// Заявки человека в сезоне — игроком или представителем. Туда ложится медсправка
// и полис, загруженные в резерве.
const loadSeasonApplicationIds = async (userId, seasonId) => {
    const { rows } = await pool.query(`
        SELECT tt.id
          FROM tournament_teams tt
          JOIN divisions d ON d.id = tt.division_id
         WHERE d.season_id = $2
           AND (EXISTS (SELECT 1 FROM tournament_rosters tr
                         WHERE tr.tournament_team_id = tt.id AND tr.player_id = $1 AND tr.period_end IS NULL)
             OR EXISTS (SELECT 1 FROM tournament_team_roles ttr
                         WHERE ttr.tournament_team_id = tt.id AND ttr.user_id = $1 AND ttr.left_at IS NULL))
    `, [userId, seasonId]);
    return rows.map(r => r.id);
};

// Медсправка и полис, уже лежащие в заявках человека в командах этой лиги, — сразу
// в резерв при добавлении. Триггер reserve_goalie_docs_sync копирует только новые
// загрузки в заявке, и справка, загруженная до того, как человека взяли в резерв, иначе
// в резерве не появилась бы никогда. Если заявок несколько (разные команды, сезоны),
// берётся документ, который действует дольше всех (без срока — дольше всех), — по тому
// же правилу засчитываются документы при допуске (utils/reserveGoalies.js). Время правки
// заявки тут не годится: оно меняется от любого документа, хоть от согласия.
const copyApplicationDocs = async (reserveId) => {
    for (const type of OWN_DOC_TYPES) {
        await pool.query(`
            UPDATE league_reserve_goalies lrg
               SET ${type}_url = x.url, ${type}_expires_at = x.expires_at, updated_at = NOW()
              FROM (SELECT tpd.${type}_url AS url, tpd.${type}_expires_at AS expires_at
                      FROM league_reserve_goalies r
                      JOIN tournament_person_docs tpd ON tpd.user_id = r.player_id AND tpd.${type}_url IS NOT NULL
                      JOIN tournament_teams tt ON tt.id = tpd.tournament_team_id
                      JOIN divisions d ON d.id = tt.division_id
                      JOIN seasons s ON s.id = d.season_id AND s.league_id = r.league_id
                     WHERE r.id = $1
                     ORDER BY tpd.${type}_expires_at DESC NULLS FIRST, tpd.updated_at DESC, tpd.id DESC
                     LIMIT 1) x
             WHERE lrg.id = $1 AND lrg.${type}_url IS NULL
        `, [reserveId]);
    }
};

const fileExt = (file) => (file.originalname.split('.').pop() || 'bin').toLowerCase();

// Номер по умолчанию: пустая строка — это «не задан», а не ноль
const readJerseyNumber = (raw) => {
    if (raw === undefined || raw === null || raw === '') return null;
    const num = Number(raw);
    if (!Number.isInteger(num) || num < 0 || num > 99) return NaN;
    return num;
};

const readNote = (raw) => {
    const note = typeof raw === 'string' ? raw.trim() : '';
    return note ? note.slice(0, 255) : null;
};

// Срок документа из формы: 'YYYY-MM-DD', пусто — без срока, undefined — не присылали
const readExpires = (raw) => {
    if (raw === undefined) return undefined;
    if (raw === null || raw === '' || raw === 'null') return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : NaN;
};

const loadReserve = async (leagueId, reserveId) => {
    const { rows } = await pool.query(
        `SELECT * FROM league_reserve_goalies WHERE id = $1 AND league_id = $2`,
        [reserveId, leagueId]
    );
    return rows[0] || null;
};

const seasonBelongsToLeague = async (seasonId, leagueId) => {
    const { rowCount } = await pool.query('SELECT 1 FROM seasons WHERE id = $1 AND league_id = $2', [seasonId, leagueId]);
    return rowCount > 0;
};

// Заявлен ли человек в каком-нибудь составе или штабе этого сезона. Тогда его согласие
// на сезон ведётся в заявке, и очищать его из вкладки резерва нельзя — оно пропало бы
// и из заявки команды.
const hasApplicationInSeasonSql = (userExpr, seasonExpr) => `
    EXISTS (
        SELECT 1 FROM tournament_rosters tr_a
          JOIN tournament_teams tt_a ON tt_a.id = tr_a.tournament_team_id
          JOIN divisions d_a ON d_a.id = tt_a.division_id
         WHERE tr_a.player_id = ${userExpr} AND d_a.season_id = ${seasonExpr} AND tr_a.period_end IS NULL
        UNION ALL
        SELECT 1 FROM tournament_team_roles ttr_a
          JOIN tournament_teams tt_a ON tt_a.id = ttr_a.tournament_team_id
          JOIN divisions d_a ON d_a.id = tt_a.division_id
         WHERE ttr_a.user_id = ${userExpr} AND d_a.season_id = ${seasonExpr} AND ttr_a.left_at IS NULL
    )`;

// ==========================================
// ПАРАМЕТРЫ (шторка «Параметры» на вкладке)
// ==========================================

const SETTINGS_COLUMNS = `
    reserve_goalies_enabled, reserve_goalie_dq_games_enabled, reserve_goalie_own_dq_blocks,
    reserve_goalie_max_per_game, reserve_goalie_block_back_to_back, reserve_goalie_block_with_own_goalie,
    reserve_goalie_req_med_cert, reserve_goalie_req_insurance, reserve_goalie_req_consent`;

export const getReserveGoalieSettings = async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT ${SETTINGS_COLUMNS} FROM leagues WHERE id = $1`, [req.params.leagueId]);
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Лига не найдена' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('Ошибка загрузки параметров резервных вратарей:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки параметров' });
    }
};

export const updateReserveGoalieSettings = async (req, res) => {
    try {
        const { leagueId } = req.params;
        const b = req.body || {};

        const maxPerGame = Number(b.reserve_goalie_max_per_game);
        if (!Number.isInteger(maxPerGame) || maxPerGame < 1 || maxPerGame > 3) {
            return res.status(400).json({ success: false, error: 'Резервных вратарей на матч — от 1 до 3' });
        }

        // Шторка всегда шлёт все поля разом, поэтому без COALESCE: ровно то, что видел человек
        const { rows } = await pool.query(
            `UPDATE leagues SET
                reserve_goalies_enabled = $2,
                reserve_goalie_dq_games_enabled = $3,
                reserve_goalie_own_dq_blocks = $4,
                reserve_goalie_max_per_game = $5,
                reserve_goalie_block_back_to_back = $6,
                reserve_goalie_req_med_cert = $7,
                reserve_goalie_req_insurance = $8,
                reserve_goalie_req_consent = $9,
                reserve_goalie_block_with_own_goalie = $10
              WHERE id = $1
              RETURNING ${SETTINGS_COLUMNS}`,
            [leagueId,
             !!b.reserve_goalies_enabled, !!b.reserve_goalie_dq_games_enabled, !!b.reserve_goalie_own_dq_blocks,
             maxPerGame, !!b.reserve_goalie_block_back_to_back,
             !!b.reserve_goalie_req_med_cert, !!b.reserve_goalie_req_insurance, !!b.reserve_goalie_req_consent,
             !!b.reserve_goalie_block_with_own_goalie]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Лига не найдена' });

        res.json({ success: true, data: rows[0], message: 'Параметры сохранены' });
    } catch (err) {
        console.error('Ошибка сохранения параметров резервных вратарей:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения параметров' });
    }
};

// ==========================================
// СПИСОК
// ==========================================

/**
 * Резервные вратари лиги глазами выбранного сезона: отметки дивизионов этого сезона
 * и документы на этот сезон. Сам вратарь и его тумблер — общие на все сезоны.
 *
 * Сезон не передан — берётся активный, иначе самый поздний: так вкладка сразу
 * открывается на текущем сезоне.
 */
export const getReserveGoalies = async (req, res) => {
    try {
        const { leagueId } = req.params;

        const [settingsRes, seasonsRes] = await Promise.all([
            pool.query(`SELECT ${SETTINGS_COLUMNS} FROM leagues WHERE id = $1`, [leagueId]),
            pool.query(
                `SELECT id, name, is_active FROM seasons WHERE league_id = $1
                  ORDER BY is_active DESC NULLS LAST, start_date DESC NULLS LAST, id DESC`,
                [leagueId]
            ),
        ]);
        if (settingsRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Лига не найдена' });
        }

        const seasons = seasonsRes.rows;
        const requested = Number(req.query.season_id);
        const season = seasons.find(s => s.id === requested) || seasons[0] || null;
        const seasonId = season?.id ?? null;

        const docs = reserveDocsSql('$2');

        const [goaliesRes, divisionsRes] = await Promise.all([
            pool.query(
                // added_by в выборку не идёт: кто именно из сотрудников лиги добавил
                // вратаря, в интерфейсе не нужно. Колонка остаётся как след в базе.
                `SELECT lrg.id, lrg.player_id, lrg.jersey_number, lrg.note, lrg.is_active, lrg.created_at,
                        lrg.photo_url AS league_photo_url,
                        lrg.medical_url AS own_medical_url,
                        to_char(lrg.medical_expires_at, 'YYYY-MM-DD') AS own_medical_expires_at,
                        lrg.insurance_url AS own_insurance_url,
                        to_char(lrg.insurance_expires_at, 'YYYY-MM-DD') AS own_insurance_expires_at,
                        u.first_name, u.last_name, u.middle_name, u.phone,
                        to_char(u.birth_date, 'YYYY-MM-DD') AS birth_date,
                        ${RESERVE_GOALIE_PHOTO_SQL} AS avatar_url,
                        ${docs.columns},
                        COALESCE((SELECT array_agg(lrgd.division_id ORDER BY lrgd.division_id)
                                    FROM league_reserve_goalie_divisions lrgd
                                    JOIN divisions d_s ON d_s.id = lrgd.division_id
                                   WHERE lrgd.reserve_goalie_id = lrg.id AND d_s.season_id = $2), '{}') AS division_ids,
                        ${hasApplicationInSeasonSql('lrg.player_id', '$2')} AS has_application,
                        -- Сыграл ли он уже резервным в этой лиге: по такому вратарю
                        -- удаление из списка стоит делать осознанно
                        (SELECT COUNT(*)::int FROM reserve_goalie_game_statistics r
                          WHERE r.league_id = lrg.league_id AND r.player_id = lrg.player_id) AS games_played
                   FROM league_reserve_goalies lrg
                   JOIN users u ON u.id = lrg.player_id
                   ${docs.joins}
                  WHERE lrg.league_id = $1
                  ORDER BY u.last_name, u.first_name`,
                [leagueId, seasonId]
            ),
            pool.query(
                `SELECT id, name, short_name, is_tournament, logo_url
                   FROM divisions WHERE season_id = $1
                  ORDER BY is_tournament, name`,
                [seasonId]
            ),
        ]);

        res.json({
            success: true,
            data: goaliesRes.rows,
            seasons,
            season_id: seasonId,
            divisions: divisionsRes.rows,
            settings: settingsRes.rows[0],
        });
    } catch (err) {
        console.error('Ошибка получения резервных вратарей:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки резервных вратарей' });
    }
};

/**
 * Поиск кандидатов по общей базе пользователей.
 *
 * Ограничений по составу нет по решению лиги: резервным вратарём можно назначить
 * кого угодно, включая игрока, уже заявленного за команду лиги. Такие совпадения
 * не отсекаются, а показываются подписью — решение за администратором.
 */
export const getReserveGoalieCandidates = async (req, res) => {
    try {
        const { leagueId } = req.params;
        const search = (req.query.search || '').trim();
        const seasonId = Number(req.query.season_id) || null;

        // Без запроса список не отдаём: общая база — это все пользователи платформы
        if (search.length < 2) {
            return res.json({ success: true, data: [] });
        }

        const { rows } = await pool.query(
            `SELECT u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone,
                    to_char(u.birth_date, 'YYYY-MM-DD') AS birth_date,
                    (SELECT json_agg(COALESCE(t.short_name, t.name) ORDER BY t.name)
                       FROM team_members tm
                       JOIN teams t ON t.id = tm.team_id
                      WHERE tm.user_id = u.id AND tm.left_at IS NULL)        AS current_teams,
                    -- Заявлен ли он прямо сейчас за команду лиги в выбранном сезоне
                    (SELECT json_agg(DISTINCT COALESCE(tt.snap_short_name, tt.snap_name, t.short_name, t.name))
                       FROM tournament_rosters tr
                       JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
                       JOIN divisions d ON d.id = tt.division_id
                       JOIN teams t ON t.id = tt.team_id
                      WHERE tr.player_id = u.id
                        AND d.season_id = $3
                        AND tr.application_status = 'approved'
                        AND tr.period_end IS NULL)                           AS league_teams
             FROM users u
             WHERE (u.first_name ILIKE $2 OR u.last_name ILIKE $2 OR u.phone ILIKE $2 OR u.email ILIKE $2)
               AND NOT EXISTS (SELECT 1 FROM league_reserve_goalies lrg
                                WHERE lrg.league_id = $1 AND lrg.player_id = u.id)
             ORDER BY u.last_name, u.first_name
             LIMIT 20`,
            [leagueId, `%${search}%`, seasonId]
        );

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Ошибка поиска кандидатов в резервные вратари:', err);
        res.status(500).json({ success: false, error: 'Ошибка поиска' });
    }
};

// ==========================================
// ВРАТАРЬ
// ==========================================

export const addReserveGoalie = async (req, res) => {
    try {
        const { leagueId } = req.params;
        const { player_id, jersey_number, note } = req.body;

        if (!player_id) {
            return res.status(400).json({ success: false, error: 'Игрок не выбран' });
        }

        const jersey = readJerseyNumber(jersey_number);
        if (Number.isNaN(jersey)) {
            return res.status(400).json({ success: false, error: 'Игровой номер должен быть числом от 0 до 99' });
        }

        const { rows } = await pool.query(
            `INSERT INTO league_reserve_goalies (league_id, player_id, jersey_number, note, added_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [leagueId, player_id, jersey, readNote(note), req.user?.id || null]
        );

        // Вратарь уже добавлен — не подтянулись документы, значит, их просто загрузят
        // во вкладке. Падать из-за этого незачем
        await copyApplicationDocs(rows[0].id)
            .catch((err) => console.error('Не удалось подтянуть документы из заявки в резерв:', err));

        res.json({ success: true, id: rows[0].id, message: 'Резервный вратарь добавлен' });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, error: 'Этот вратарь уже есть в резерве лиги' });
        }
        if (err.code === '23503') {
            return res.status(400).json({ success: false, error: 'Пользователь не найден' });
        }
        console.error('Ошибка добавления резервного вратаря:', err);
        res.status(500).json({ success: false, error: 'Ошибка добавления резервного вратаря' });
    }
};

/**
 * Номер, заметка и тумблер «Активен». Присылать можно любое из полей по отдельности:
 * тумблер в строке таблицы шлёт только себя и не должен затирать номер.
 */
export const updateReserveGoalie = async (req, res) => {
    try {
        const { leagueId, reserveId } = req.params;
        const { jersey_number, note, is_active } = req.body;

        const sets = [];
        const values = [];
        const push = (sql, value) => { values.push(value); sets.push(`${sql} = $${values.length}`); };

        if (jersey_number !== undefined) {
            const jersey = readJerseyNumber(jersey_number);
            if (Number.isNaN(jersey)) {
                return res.status(400).json({ success: false, error: 'Игровой номер должен быть числом от 0 до 99' });
            }
            push('jersey_number', jersey);
        }
        if (note !== undefined) push('note', readNote(note));
        if (is_active !== undefined) push('is_active', !!is_active);

        if (sets.length === 0) return res.json({ success: true });

        values.push(reserveId, leagueId);
        const { rowCount } = await pool.query(
            `UPDATE league_reserve_goalies
                SET ${sets.join(', ')}, updated_at = NOW()
              WHERE id = $${values.length - 1} AND league_id = $${values.length}`,
            values
        );

        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Вратарь не найден в резерве этой лиги' });
        }

        res.json({ success: true, message: 'Изменения сохранены' });
    } catch (err) {
        console.error('Ошибка изменения резервного вратаря:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения' });
    }
};

/**
 * Отметка дивизиона: может ли вратарь играть в нём резервным.
 * PUT с { checked: true | false } — одна галочка за запрос, так быстрые щелчки
 * по разным дивизионам не затирают друг друга.
 */
export const setReserveGoalieDivision = async (req, res) => {
    try {
        const { leagueId, reserveId, divisionId } = req.params;
        const checked = !!req.body?.checked;

        const reserve = await loadReserve(leagueId, reserveId);
        if (!reserve) {
            return res.status(404).json({ success: false, error: 'Вратарь не найден в резерве этой лиги' });
        }

        const { rowCount: divOk } = await pool.query(
            `SELECT 1 FROM divisions d JOIN seasons s ON s.id = d.season_id
              WHERE d.id = $1 AND s.league_id = $2`,
            [divisionId, leagueId]
        );
        if (divOk === 0) {
            return res.status(404).json({ success: false, error: 'Дивизион не найден в этой лиге' });
        }

        if (checked) {
            await pool.query(
                `INSERT INTO league_reserve_goalie_divisions (reserve_goalie_id, division_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [reserveId, divisionId]
            );
        } else {
            await pool.query(
                `DELETE FROM league_reserve_goalie_divisions WHERE reserve_goalie_id = $1 AND division_id = $2`,
                [reserveId, divisionId]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка отметки дивизиона резервного вратаря:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения' });
    }
};

/**
 * Фото от лиги. Главнее заявочного снимка: лига ставит его, когда снимка нет
 * или он устарел. Без файла (DELETE) — фото убирается, снова показывается снимок.
 */
export const uploadReserveGoaliePhoto = async (req, res) => {
    try {
        const { leagueId, reserveId } = req.params;

        const reserve = await loadReserve(leagueId, reserveId);
        if (!reserve) {
            return res.status(404).json({ success: false, error: 'Вратарь не найден в резерве этой лиги' });
        }
        if (!req.file || !req.file.mimetype.startsWith('image/')) {
            return res.status(400).json({ success: false, error: 'Нужна картинка: JPG, PNG или WEBP' });
        }

        const key = photoKey(reserveId, fileExt(req.file));
        await s3.send(new PutObjectCommand({
            Bucket: DOCS_BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype,
        }));

        await pool.query(
            `UPDATE league_reserve_goalies SET photo_url = $1, updated_at = NOW() WHERE id = $2`,
            [`/${key}`, reserveId]
        );
        // Прежний файл — только после успешной записи, иначе строка осталась бы
        // со ссылкой на уже удалённый объект
        await deleteOwnFile(reserve.photo_url, reserveId);

        res.json({ success: true, photo_url: `/${key}` });
    } catch (err) {
        console.error('Ошибка загрузки фото резервного вратаря:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки фото' });
    }
};

export const deleteReserveGoaliePhoto = async (req, res) => {
    try {
        const { leagueId, reserveId } = req.params;

        const reserve = await loadReserve(leagueId, reserveId);
        if (!reserve) {
            return res.status(404).json({ success: false, error: 'Вратарь не найден в резерве этой лиги' });
        }

        await pool.query(`UPDATE league_reserve_goalies SET photo_url = NULL, updated_at = NOW() WHERE id = $1`, [reserveId]);
        await deleteOwnFile(reserve.photo_url, reserveId);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления фото резервного вратаря:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления фото' });
    }
};

/**
 * Документы резервного вратаря (multipart: medical?, insurance?, consent?;
 * *_cleared = 'true' — очистить; *_expires_at — срок; season_id — выбранный на вкладке сезон).
 *
 * Медсправка и полис — один документ на человека (см. OWN_DOC_TYPES): новый файл
 * ложится вратарю в резерв и во все его заявки команд выбранного сезона, заменяя там
 * прежний. Срок и очистка меняются там, где лежит этот же файл. Каждой задетой заявке —
 * запись в журнал человека, как при загрузке в самой заявке.
 *
 * Согласие — одно на «человек + сезон» (user_season_consents), общее с заявками.
 * Загрузить или заменить его отсюда можно, очистить — только если человек не заявлен
 * в этом сезоне ни в одну команду: иначе оно пропало бы и из его заявки.
 */
export const uploadReserveGoalieDocs = async (req, res) => {
    try {
        const { leagueId, reserveId } = req.params;
        const body = req.body || {};
        const files = req.files || {};

        const reserve = await loadReserve(leagueId, reserveId);
        if (!reserve) {
            return res.status(404).json({ success: false, error: 'Вратарь не найден в резерве этой лиги' });
        }

        const seasonId = Number(body.season_id) || null;
        if (seasonId && !(await seasonBelongsToLeague(seasonId, leagueId))) {
            return res.status(400).json({ success: false, error: 'Сезон не найден в этой лиге' });
        }
        const appIds = seasonId ? await loadSeasonApplicationIds(reserve.player_id, seasonId) : [];

        // --- Медсправка и полис: один файл в резерве и в заявках сезона ---
        const logEvents = [];
        const maybeOrphaned = [];

        for (const type of OWN_DOC_TYPES) {
            const expires = readExpires(body[`${type}_expires_at`]);
            if (Number.isNaN(expires)) {
                return res.status(400).json({ success: false, error: 'Некорректная дата окончания документа' });
            }
            const urlCol = `${type}_url`;
            const expCol = `${type}_expires_at`;
            const currentUrl = reserve[urlCol];
            const file = files[type]?.[0];

            if (body[`${type}_cleared`] === 'true') {
                // Очистка: убираем этот файл отовсюду, где он лежит в этом сезоне
                await pool.query(
                    `UPDATE league_reserve_goalies SET ${urlCol} = NULL, ${expCol} = NULL, updated_at = NOW() WHERE id = $1`,
                    [reserveId]
                );
                if (currentUrl && appIds.length > 0) {
                    const { rows } = await pool.query(
                        `UPDATE tournament_person_docs SET ${urlCol} = NULL, ${expCol} = NULL, updated_at = NOW()
                          WHERE user_id = $1 AND tournament_team_id = ANY($2::int[]) AND ${urlCol} = $3
                          RETURNING tournament_team_id`,
                        [reserve.player_id, appIds, currentUrl]
                    );
                    rows.forEach(r => logEvents.push({ appId: r.tournament_team_id, details: { type, cleared: true } }));
                }
                maybeOrphaned.push(currentUrl);
            } else if (file) {
                // Новый файл: в резерв и во все заявки сезона, вместо прежнего
                const key = docKey(reserveId, type, fileExt(file));
                const newUrl = `/${key}`;
                await s3.send(new PutObjectCommand({
                    Bucket: DOCS_BUCKET, Key: key, Body: file.buffer, ContentType: file.mimetype,
                }));

                const newExpires = expires === undefined ? null : expires;
                await pool.query(
                    `UPDATE league_reserve_goalies SET ${urlCol} = $1, ${expCol} = $2, updated_at = NOW() WHERE id = $3`,
                    [newUrl, newExpires, reserveId]
                );
                maybeOrphaned.push(currentUrl);

                if (appIds.length > 0) {
                    const { rows: prevRows } = await pool.query(
                        `SELECT ${urlCol} AS url FROM tournament_person_docs
                          WHERE user_id = $1 AND tournament_team_id = ANY($2::int[])`,
                        [reserve.player_id, appIds]
                    );
                    prevRows.forEach(r => maybeOrphaned.push(r.url));

                    await pool.query(
                        `INSERT INTO tournament_person_docs (tournament_team_id, user_id, ${urlCol}, ${expCol})
                         SELECT app_id, $2, $3, $4 FROM unnest($1::int[]) AS app_id
                         ON CONFLICT ON CONSTRAINT tournament_person_docs_unique
                         DO UPDATE SET ${urlCol} = EXCLUDED.${urlCol}, ${expCol} = EXCLUDED.${expCol}, updated_at = NOW()`,
                        [appIds, reserve.player_id, newUrl, newExpires]
                    );
                    appIds.forEach(appId => logEvents.push({ appId, details: { type, file: true, expires_at: newExpires } }));
                }
            } else if (expires !== undefined && currentUrl) {
                // Только срок: там, где лежит этот же файл
                await pool.query(
                    `UPDATE league_reserve_goalies SET ${expCol} = $1, updated_at = NOW() WHERE id = $2`,
                    [expires, reserveId]
                );
                if (appIds.length > 0) {
                    const { rows } = await pool.query(
                        `UPDATE tournament_person_docs SET ${expCol} = $1, updated_at = NOW()
                          WHERE user_id = $2 AND tournament_team_id = ANY($3::int[]) AND ${urlCol} = $4
                            AND ${expCol} IS DISTINCT FROM $1
                          RETURNING tournament_team_id`,
                        [expires, reserve.player_id, appIds, currentUrl]
                    );
                    rows.forEach(r => logEvents.push({ appId: r.tournament_team_id, details: { type, file: false, expires_at: expires } }));
                }
            }
        }

        await logPersonEvents(pool, logEvents.map(e => ({
            appId: e.appId, userId: reserve.player_id, action: 'doc', actorId: req.user?.id, details: e.details,
        })));

        // Только после всех записей: файл, на который ещё кто-то ссылается, остаётся
        for (const url of new Set(maybeOrphaned.filter(Boolean))) {
            await deleteIfUnreferenced(url);
        }

        // --- Согласие на сезон ---
        const consentFile = files.consent?.[0];
        const consentCleared = body.consent_cleared === 'true';
        const consentExpires = readExpires(body.consent_expires_at);
        if (Number.isNaN(consentExpires)) {
            return res.status(400).json({ success: false, error: 'Некорректная дата окончания согласия' });
        }

        if (consentFile || consentCleared || consentExpires !== undefined) {
            if (!seasonId) {
                return res.status(400).json({ success: false, error: 'Не выбран сезон согласия' });
            }

            const { rows: prevRows } = await pool.query(
                `SELECT consent_url FROM user_season_consents WHERE user_id = $1 AND season_id = $2`,
                [reserve.player_id, seasonId]
            );
            const previousUrl = prevRows[0]?.consent_url || null;

            if (consentCleared) {
                const { rows: appRows } = await pool.query(
                    `SELECT ${hasApplicationInSeasonSql('$1', '$2')} AS has_application`,
                    [reserve.player_id, seasonId]
                );
                if (appRows[0]?.has_application) {
                    return res.status(400).json({
                        success: false,
                        error: 'Человек заявлен в команду в этом сезоне — его согласие очищается в заявке команды',
                    });
                }
                await pool.query('DELETE FROM user_season_consents WHERE user_id = $1 AND season_id = $2', [reserve.player_id, seasonId]);
                await deleteOwnFile(previousUrl, reserveId);
            } else if (consentFile) {
                const key = consentKey(reserveId, reserve.player_id, seasonId, fileExt(consentFile));
                await s3.send(new PutObjectCommand({
                    Bucket: DOCS_BUCKET, Key: key, Body: consentFile.buffer, ContentType: consentFile.mimetype,
                }));
                await pool.query(
                    `INSERT INTO user_season_consents (user_id, season_id, consent_url, consent_expires_at, source)
                     VALUES ($1, $2, $3, $4, 'lms')
                     ON CONFLICT (user_id, season_id)
                     DO UPDATE SET consent_url = EXCLUDED.consent_url,
                                   consent_expires_at = CASE WHEN $5::boolean THEN EXCLUDED.consent_expires_at
                                                             ELSE user_season_consents.consent_expires_at END,
                                   source = 'lms',
                                   updated_at = NOW()`,
                    [reserve.player_id, seasonId, `/${key}`, consentExpires ?? null, consentExpires !== undefined]
                );
                if (previousUrl !== `/${key}`) await deleteOwnFile(previousUrl, reserveId);
            } else if (previousUrl) {
                // Только срок, файл прежний
                await pool.query(
                    `UPDATE user_season_consents SET consent_expires_at = $3, updated_at = NOW()
                      WHERE user_id = $1 AND season_id = $2`,
                    [reserve.player_id, seasonId, consentExpires]
                );
            }
        }

        res.json({ success: true, message: 'Документы сохранены' });
    } catch (err) {
        console.error('Ошибка сохранения документов резервного вратаря:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения документов' });
    }
};

/**
 * Удаление из резерва лиги. Сыгранные матчи не трогаются: протокол — снимок на момент
 * матча (game_rosters.is_reserve_goalie), и статистика остаётся на месте. Отметки
 * дивизионов уходят каскадом, фото резерва — из бакета. Медсправка и полис остаются
 * в заявках команд, если они там лежат: из бакета файл уходит, только когда на него
 * больше никто не ссылается. Согласие на сезон не трогаем: оно принадлежит человеку.
 */
export const deleteReserveGoalie = async (req, res) => {
    try {
        const { leagueId, reserveId } = req.params;

        const { rows } = await pool.query(
            `DELETE FROM league_reserve_goalies WHERE id = $1 AND league_id = $2
             RETURNING photo_url, medical_url, insurance_url`,
            [reserveId, leagueId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Вратарь не найден в резерве этой лиги' });
        }

        await deleteOwnFile(rows[0].photo_url, reserveId);
        for (const url of [rows[0].medical_url, rows[0].insurance_url]) {
            await deleteIfUnreferenced(url);
        }

        res.json({ success: true, message: 'Вратарь убран из резерва лиги' });
    } catch (err) {
        console.error('Ошибка удаления резервного вратаря:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления' });
    }
};
