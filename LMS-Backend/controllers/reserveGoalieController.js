import pool from '../config/db.js';

/**
 * Пул резервных вратарей дивизиона и их статистика.
 *
 * Пул — просто справочник кандидатов: кого команда может пригласить на матч,
 * если её собственный вратарь не выходит. Факт участия в матче живёт в
 * game_rosters.is_reserve_goalie, статистика — в reserve_goalie_game_statistics.
 * Поэтому вратаря можно убрать из пула в любой момент: сыгранные им матчи и
 * статистика от этого не пропадут, и удаление ничего не ломает.
 *
 * Правила допуска на конкретный матч (лимит на команду, запрет двух матчей
 * подряд) живут не здесь, а в LMS-Backend/utils/reserveGoalies.js — их одинаково
 * применяют шторка состава и сохранение состава.
 */

const loadDivision = async (divisionId) => {
    const { rows } = await pool.query(
        `SELECT d.id, d.reserve_goalie_max_per_game, d.reserve_goalie_block_back_to_back,
                l.reserve_goalies_enabled
         FROM divisions d
         JOIN seasons s ON s.id = d.season_id
         JOIN leagues l ON l.id = s.league_id
         WHERE d.id = $1`,
        [divisionId]
    );
    return rows[0] || null;
};

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

/**
 * Пул дивизиона + сводная статистика резервных вратарей.
 *
 * Статистика собирается по фактическим выходам, а не по текущему пулу: вратарь
 * мог сыграть и потом быть исключённым из списка — его матчи всё равно
 * показываются, иначе цифры дивизиона молча уменьшались бы задним числом.
 * Стадии (регулярка/плей-офф) не разделяются: резервный вратарь — разовая
 * подмена, дробить его и без того короткую строку не на что.
 */
export const getReserveGoalies = async (req, res) => {
    try {
        const { divisionId } = req.params;

        const division = await loadDivision(divisionId);
        if (!division) {
            return res.status(404).json({ success: false, error: 'Дивизион не найден' });
        }

        const [poolRes, statsRes] = await Promise.all([
            pool.query(
                // added_by в выборку не идёт: кто именно из сотрудников лиги добавил
                // вратаря, в интерфейсе не нужно. Колонка остаётся как след в базе.
                `SELECT drg.id, drg.player_id, drg.jersey_number, drg.note, drg.created_at,
                        u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone,
                        to_char(u.birth_date, 'YYYY-MM-DD') AS birth_date,
                        -- Сыграл ли он уже за кого-то в этом дивизионе: по такому
                        -- вратарю удаление из пула стоит делать осознанно.
                        (SELECT COUNT(*)::int FROM reserve_goalie_game_statistics r
                          WHERE r.division_id = drg.division_id AND r.player_id = drg.player_id) AS games_played
                 FROM division_reserve_goalies drg
                 JOIN users u ON u.id = drg.player_id
                 WHERE drg.division_id = $1
                 ORDER BY u.last_name, u.first_name`,
                [divisionId]
            ),

            pool.query(
                `SELECT r.player_id,
                        u.first_name, u.last_name, u.middle_name, u.avatar_url,
                        COUNT(*)::int                                        AS games_played,
                        COALESCE(SUM(r.goalie_goals_against), 0)::int         AS goals_against,
                        COALESCE(SUM(r.goalie_saves), 0)::int                 AS saves,
                        COALESCE(SUM(r.goalie_shots_against), 0)::int         AS shots_against,
                        COUNT(*) FILTER (WHERE r.goalie_shutout)::int         AS shutouts,
                        COALESCE(SUM(r.goalie_seconds), 0)::int               AS goalie_seconds,
                        COALESCE(SUM(r.assists), 0)::int                      AS assists,
                        COALESCE(SUM(r.penalty_minutes), 0)::int              AS penalty_minutes,
                        COUNT(*) FILTER (WHERE r.goalie_decision IN ('win', 'ot_win'))::int  AS wins,
                        COUNT(*) FILTER (WHERE r.goalie_decision IN ('loss', 'ot_loss'))::int AS losses,
                        -- Ведёт ли лига броски хотя бы в части его матчей: по этому
                        -- флагу фронт решает, показать цифру или прочерк — ноль в
                        -- колонке бросков читался бы как результат.
                        bool_or(r.shots_is_official)                          AS tracks_shots,
                        bool_or(r.data_incomplete)                            AS data_incomplete,
                        (SELECT json_agg(json_build_object(
                                    'team_id', x.team_id,
                                    'team_name', COALESCE(t.short_name, t.name),
                                    'games', x.cnt
                                ) ORDER BY x.cnt DESC, COALESCE(t.short_name, t.name))
                           FROM (SELECT r2.team_id, COUNT(*)::int AS cnt
                                   FROM reserve_goalie_game_statistics r2
                                  WHERE r2.division_id = r.division_id AND r2.player_id = r.player_id
                                  GROUP BY r2.team_id) x
                           JOIN teams t ON t.id = x.team_id)                  AS teams,
                        EXISTS (SELECT 1 FROM division_reserve_goalies drg
                                 WHERE drg.division_id = r.division_id AND drg.player_id = r.player_id) AS in_pool
                 FROM reserve_goalie_game_statistics r
                 JOIN users u ON u.id = r.player_id
                 WHERE r.division_id = $1
                 GROUP BY r.division_id, r.player_id, u.first_name, u.last_name, u.middle_name, u.avatar_url
                 ORDER BY games_played DESC, u.last_name`,
                [divisionId]
            ),
        ]);

        res.json({
            success: true,
            data: poolRes.rows,
            stats: statsRes.rows,
            settings: {
                enabled: division.reserve_goalies_enabled,
                max_per_game: division.reserve_goalie_max_per_game,
                block_back_to_back: division.reserve_goalie_block_back_to_back,
            },
        });
    } catch (err) {
        console.error('Ошибка получения резервных вратарей:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки резервных вратарей' });
    }
};

/**
 * Поиск кандидатов в пул по общей базе пользователей.
 *
 * Ограничений по составу нет по решению лиги: резервным вратарём можно назначить
 * кого угодно, включая игрока, уже заявленного за команду этого дивизиона. Такие
 * совпадения не отсекаются, а показываются подписью — решение за администратором.
 */
export const getReserveGoalieCandidates = async (req, res) => {
    try {
        const { divisionId } = req.params;
        const search = (req.query.search || '').trim();

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
                    -- Заявлен ли он прямо сейчас за команду ЭТОГО дивизиона
                    (SELECT json_agg(DISTINCT COALESCE(t.short_name, t.name))
                       FROM tournament_rosters tr
                       JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
                       JOIN teams t ON t.id = tt.team_id
                      WHERE tr.player_id = u.id
                        AND tt.division_id = $1
                        AND tr.application_status = 'approved'
                        AND tr.period_end IS NULL)                           AS division_teams
             FROM users u
             WHERE (u.first_name ILIKE $2 OR u.last_name ILIKE $2 OR u.phone ILIKE $2 OR u.email ILIKE $2)
               AND NOT EXISTS (SELECT 1 FROM division_reserve_goalies drg
                                WHERE drg.division_id = $1 AND drg.player_id = u.id)
             ORDER BY u.last_name, u.first_name
             LIMIT 20`,
            [divisionId, `%${search}%`]
        );

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Ошибка поиска кандидатов в резервные вратари:', err);
        res.status(500).json({ success: false, error: 'Ошибка поиска' });
    }
};

export const addReserveGoalie = async (req, res) => {
    try {
        const { divisionId } = req.params;
        const { player_id, jersey_number, note } = req.body;

        if (!player_id) {
            return res.status(400).json({ success: false, error: 'Игрок не выбран' });
        }

        const division = await loadDivision(divisionId);
        if (!division) {
            return res.status(404).json({ success: false, error: 'Дивизион не найден' });
        }

        const jersey = readJerseyNumber(jersey_number);
        if (Number.isNaN(jersey)) {
            return res.status(400).json({ success: false, error: 'Игровой номер должен быть числом от 0 до 99' });
        }

        const { rows } = await pool.query(
            `INSERT INTO division_reserve_goalies (division_id, player_id, jersey_number, note, added_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [divisionId, player_id, jersey, readNote(note), req.user?.id || null]
        );

        res.json({ success: true, id: rows[0].id, message: 'Резервный вратарь добавлен' });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, error: 'Этот вратарь уже есть в списке дивизиона' });
        }
        if (err.code === '23503') {
            return res.status(400).json({ success: false, error: 'Пользователь не найден' });
        }
        console.error('Ошибка добавления резервного вратаря:', err);
        res.status(500).json({ success: false, error: 'Ошибка добавления резервного вратаря' });
    }
};

export const updateReserveGoalie = async (req, res) => {
    try {
        const { divisionId, reserveId } = req.params;
        const { jersey_number, note } = req.body;

        const jersey = readJerseyNumber(jersey_number);
        if (Number.isNaN(jersey)) {
            return res.status(400).json({ success: false, error: 'Игровой номер должен быть числом от 0 до 99' });
        }

        // Права проверены по дивизиону из URL, поэтому запись обязана принадлежать
        // именно ему: иначе достаточно подставить свой дивизион и чужой reserveId,
        // чтобы править список другой лиги.
        const { rowCount } = await pool.query(
            `UPDATE division_reserve_goalies
                SET jersey_number = $1, note = $2
              WHERE id = $3 AND division_id = $4`,
            [jersey, readNote(note), reserveId, divisionId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Запись не найдена в этом дивизионе' });
        }

        res.json({ success: true, message: 'Изменения сохранены' });
    } catch (err) {
        console.error('Ошибка изменения резервного вратаря:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения' });
    }
};

/**
 * Удаление из пула. Сыгранные матчи не трогаются: протокол — снимок на момент
 * матча (game_rosters.is_reserve_goalie), и статистика остаётся на месте.
 */
export const deleteReserveGoalie = async (req, res) => {
    try {
        const { divisionId, reserveId } = req.params;

        const { rowCount } = await pool.query(
            `DELETE FROM division_reserve_goalies WHERE id = $1 AND division_id = $2`,
            [reserveId, divisionId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Запись не найдена в этом дивизионе' });
        }

        res.json({ success: true, message: 'Вратарь убран из списка' });
    } catch (err) {
        console.error('Ошибка удаления резервного вратаря:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления' });
    }
};
