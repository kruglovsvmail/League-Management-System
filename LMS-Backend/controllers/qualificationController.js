import pool from '../config/db.js';

// Квалификация человека принадлежит паре «человек + лига» (user_qualifications), а не
// заявке в дивизион: присвоить её можно любому, даже тому, кто ещё ни за кого не заявлен,
// и действует она сразу во всех дивизионах и турнирах лиги, включая прошлые сезоны.
//
// История ведётся той же таблицей: действующая квалификация — строка с ended_at IS NULL,
// закрытые строки и есть история. Отдельного журнала нет.

// Действующая квалификация + вся история по человеку в лиге.
const HISTORY_SQL = `
    SELECT uq.id,
           uq.qualification_id,
           uq.assigned_at,
           uq.ended_at,
           uq.reason,
           lq.name        AS qualification_name,
           lq.short_name  AS qualification_short_name,
           TRIM(CONCAT_WS(' ', au.last_name, au.first_name)) AS assigned_by_name
    FROM user_qualifications uq
    JOIN league_qualifications lq ON lq.id = uq.qualification_id
    LEFT JOIN users au ON au.id = uq.assigned_by
    WHERE uq.user_id = $1 AND uq.league_id = $2
    ORDER BY uq.assigned_at DESC, uq.id DESC
`;

// Дивизионы и турниры лиги, где человек сейчас заявлен, вместе с их правилами допуска.
// Фронт по этому списку показывает в окне выбора, какие заявки перестанут соответствовать
// новой квалификации — ДО сохранения. Из турнира это никого не выкидывает, но лига должна
// видеть последствия заранее.
const ACTIVE_DIVISIONS_SQL = `
    SELECT d.id                       AS division_id,
           d.name                     AS division_name,
           d.is_tournament,
           s.name                     AS season_name,
           s.is_active                AS is_current_season,
           t.name                     AS team_name,
           COALESCE((
               SELECT array_agg(dq.qualification_id)
               FROM division_qualifications dq
               WHERE dq.division_id = d.id AND dq.qualification_id IS NOT NULL
           ), '{}')                   AS allowed_qualification_ids,
           EXISTS (
               SELECT 1 FROM division_qualifications dq
               WHERE dq.division_id = d.id AND dq.qualification_id IS NULL
           )                          AS allows_none,
           -- Пустой список = дивизион ограничений не ставит и в конфликты не попадает
           EXISTS (
               SELECT 1 FROM division_qualifications dq WHERE dq.division_id = d.id
           )                          AS has_restriction
    FROM tournament_rosters tr
    JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
    JOIN teams t ON t.id = tt.team_id
    JOIN divisions d ON d.id = tt.division_id
    JOIN seasons s ON s.id = d.season_id
    WHERE tr.player_id = $1
      AND s.league_id = $2
      AND tr.period_end IS NULL
      AND tr.application_status <> 'declined'
    ORDER BY s.start_date DESC NULLS LAST, d.name
`;

// GET /leagues/:leagueId/users/:userId/qualification
export const getUserQualification = async (req, res) => {
    try {
        const { leagueId, userId } = req.params;

        const [history, divisions] = await Promise.all([
            pool.query(HISTORY_SQL, [userId, leagueId]),
            pool.query(ACTIVE_DIVISIONS_SQL, [userId, leagueId]),
        ]);

        const current = history.rows.find(row => row.ended_at === null) || null;

        res.json({
            success: true,
            current,
            history: history.rows,
            divisions: divisions.rows,
        });
    } catch (err) {
        console.error('Ошибка получения квалификации пользователя:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки квалификации' });
    }
};

// PUT /leagues/:leagueId/users/:userId/qualification  { qualification_id, reason }
// qualification_id = null — снять квалификацию (текущая строка просто закрывается).
export const setUserQualification = async (req, res) => {
    const client = await pool.connect();
    try {
        const { leagueId, userId } = req.params;
        const { qualification_id, reason } = req.body;
        const qualId = qualification_id ? Number(qualification_id) : null;

        // Квалификация обязана быть из справочника ЭТОЙ лиги: id приходит с фронта,
        // и подменой его нельзя вытянуть чужую квалификацию в свою лигу.
        let shortName = null;
        if (qualId) {
            const { rows } = await client.query(
                'SELECT short_name FROM league_qualifications WHERE id = $1 AND league_id = $2',
                [qualId, leagueId]
            );
            if (rows.length === 0) {
                return res.status(400).json({ success: false, error: 'Квалификация не найдена в справочнике этой лиги' });
            }
            shortName = rows[0].short_name;
        }

        await client.query('BEGIN');

        const { rows: currentRows } = await client.query(
            `SELECT id, qualification_id FROM user_qualifications
             WHERE user_id = $1 AND league_id = $2 AND ended_at IS NULL
             FOR UPDATE`,
            [userId, leagueId]
        );
        const current = currentRows[0] || null;

        // Выбрали то же самое — выходим молча. Иначе каждое открытие окна выбора
        // плодило бы в истории пустые записи «МАСТЕР → МАСТЕР».
        if ((current?.qualification_id ?? null) === qualId) {
            await client.query('COMMIT');
            return res.json({ success: true, qualification_id: qualId, qualification_short_name: shortName, unchanged: true });
        }

        if (current) {
            await client.query('UPDATE user_qualifications SET ended_at = now() WHERE id = $1', [current.id]);
        }

        if (qualId) {
            await client.query(
                `INSERT INTO user_qualifications (user_id, league_id, qualification_id, assigned_by, reason)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, leagueId, qualId, req.user.id, reason?.trim() || null]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, qualification_id: qualId, qualification_short_name: shortName });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка сохранения квалификации:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения квалификации' });
    } finally {
        client.release();
    }
};

// DELETE /leagues/:leagueId/users/:userId/qualification/:entryId
// Убирает из истории одну ошибочную запись, не трогая остальные.
//
// Действующую квалификацию (ended_at IS NULL) удалить нельзя: она не история, а текущее
// состояние человека в лиге, и меняется выбором из списка. Чтобы стереть ошибочно
// присвоенную квалификацию целиком, сначала выберите другую (или «Без квалификации») —
// строка закроется, — а потом удалите её отсюда.
export const deleteUserQualificationEntry = async (req, res) => {
    try {
        const { leagueId, userId, entryId } = req.params;

        const { rowCount } = await pool.query(
            `DELETE FROM user_qualifications
             WHERE id = $1 AND user_id = $2 AND league_id = $3 AND ended_at IS NOT NULL`,
            [entryId, userId, leagueId]
        );

        if (rowCount === 0) {
            return res.status(400).json({
                success: false,
                error: 'Удалить можно только завершённую запись истории. Действующую квалификацию меняйте выбором из списка.'
            });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления записи истории квалификаций:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления записи истории' });
    }
};
