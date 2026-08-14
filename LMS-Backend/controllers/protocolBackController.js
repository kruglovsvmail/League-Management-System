import pool from '../config/db.js';

// ==========================================
// ОБОРОТНАЯ СТОРОНА ПРОТОКОЛА
// ==========================================
// Всё, что печатается на второй странице протокола и не выводится из событий матча:
// результаты проверки игроков и текстовые блоки замечаний/уведомлений.
// Заполняется в панели секретаря, читается шаблоном протокола (src/protocols/).

// Значения колонки «Результат» в таблице проверки игроков.
export const CHECK_RESULTS = {
    match: 'Соответствует',
    mismatch: 'Не соответствует',
    not_presented: 'Не предъявил',
};

const emptyNotes = {
    referee_notes: '',
    inspector_notes: '',
    medical_notes: '',
    home_protest_filed: null,
    home_protest_text: '',
    away_protest_filed: null,
    away_protest_text: '',
};

// Игроки и персонал турнирной заявки обеих команд — из них секретарь выбирает
// представителей проверяемой и проверяющей команды. Один человек может быть
// одновременно и игроком, и персоналом (играющий тренер), поэтому схлопываем по
// пользователю: иначе он попадёт в список дважды.
const fetchTeamMembers = async (divisionId, homeTeamId, awayTeamId) => {
    const { rows } = await pool.query(`
        WITH members AS (
            SELECT tt.team_id, tr.player_id AS user_id, false AS is_staff
            FROM tournament_rosters tr
            JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
            WHERE tt.division_id = $1 AND tt.team_id IN ($2, $3) AND tr.period_end IS NULL
            UNION ALL
            SELECT tt.team_id, ttr.user_id, true AS is_staff
            FROM tournament_team_roles ttr
            JOIN tournament_teams tt ON tt.id = ttr.tournament_team_id
            WHERE tt.division_id = $1 AND tt.team_id IN ($2, $3) AND ttr.left_at IS NULL
        )
        SELECT m.team_id, m.user_id AS id, u.last_name, u.first_name, u.middle_name,
               bool_or(m.is_staff) AS is_staff
        FROM members m
        JOIN users u ON u.id = m.user_id
        GROUP BY m.team_id, m.user_id, u.last_name, u.first_name, u.middle_name
        ORDER BY u.last_name ASC, u.first_name ASC
    `, [divisionId, homeTeamId, awayTeamId]);

    const format = (r) => `${r.last_name} ${r.first_name ? r.first_name[0] + '.' : ''}${r.middle_name ? r.middle_name[0] + '.' : ''}`.trim();
    const result = { home: [], away: [] };
    rows.forEach(r => {
        const entry = { id: r.id, name: format(r), isStaff: r.is_staff };
        if (r.team_id === homeTeamId) result.home.push(entry);
        if (r.team_id === awayTeamId) result.away.push(entry);
    });
    return result;
};

// Читает оборот протокола вместе со справочниками, нужными форме секретаря.
// Экспортируется отдельно от HTTP-обёртки: тем же пользуется сборка данных для PDF.
export const fetchProtocolBack = async (gameId) => {
    const notesRes = await pool.query('SELECT * FROM game_protocol_notes WHERE game_id = $1', [gameId]);
    const checksRes = await pool.query(`
        SELECT c.id, c.sort_order, c.team_id, c.player_id, c.jersey_number, c.check_result,
               c.checked_rep_id, c.checking_rep_id,
               p.last_name AS player_last_name, p.first_name AS player_first_name,
               cd.last_name AS checked_last_name, cd.first_name AS checked_first_name, cd.middle_name AS checked_middle_name,
               cg.last_name AS checking_last_name, cg.first_name AS checking_first_name, cg.middle_name AS checking_middle_name
        FROM game_player_checks c
        LEFT JOIN users p ON p.id = c.player_id
        LEFT JOIN users cd ON cd.id = c.checked_rep_id
        LEFT JOIN users cg ON cg.id = c.checking_rep_id
        WHERE c.game_id = $1
        ORDER BY c.sort_order ASC, c.id ASC
    `, [gameId]);

    const shortName = (last, first, middle) => last
        ? `${last} ${first ? first[0] + '.' : ''}${middle ? middle[0] + '.' : ''}`.trim()
        : '';

    return {
        notes: { ...emptyNotes, ...(notesRes.rows[0] || {}) },
        checks: checksRes.rows.map(r => ({
            id: r.id,
            team_id: r.team_id,
            player_id: r.player_id,
            jersey_number: r.jersey_number,
            check_result: r.check_result,
            checked_rep_id: r.checked_rep_id,
            checking_rep_id: r.checking_rep_id,
            player_name: shortName(r.player_last_name, r.player_first_name, null),
            checked_rep_name: shortName(r.checked_last_name, r.checked_first_name, r.checked_middle_name),
            checking_rep_name: shortName(r.checking_last_name, r.checking_first_name, r.checking_middle_name),
        })),
    };
};

// GET /games/:gameId/protocol-back
export const getProtocolBack = async (req, res) => {
    try {
        const { gameId } = req.params;
        const gameRes = await pool.query(
            'SELECT division_id, home_team_id, away_team_id FROM games WHERE id = $1',
            [gameId]
        );
        if (gameRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });
        const game = gameRes.rows[0];

        const data = await fetchProtocolBack(gameId);
        const teamMembers = await fetchTeamMembers(game.division_id, game.home_team_id, game.away_team_id);

        res.json({ success: true, data: { ...data, teamMembers } });
    } catch (err) {
        console.error('Ошибка получения оборота протокола:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// Строка проверки игрока из тела запроса. Пустые значения приводим к NULL:
// секретарь может добавить строку и заполнить её не целиком.
const readCheckRow = (row, index) => ({
    sort_order: index,
    team_id: row.team_id || null,
    player_id: row.player_id || null,
    // Номер храним снимком строкой, а не ссылкой на game_rosters: протокол должен
    // печататься так, как его записал секретарь, даже если игрока потом убрали из состава.
    // Строкой — потому что номер не обязан быть числом («00»).
    jersey_number: row.jersey_number === '' || row.jersey_number === null || row.jersey_number === undefined
        ? null
        : String(row.jersey_number).trim().slice(0, 4),
    check_result: Object.keys(CHECK_RESULTS).includes(row.check_result) ? row.check_result : null,
    checked_rep_id: row.checked_rep_id || null,
    checking_rep_id: row.checking_rep_id || null,
});

// Строка считается пустой, если в ней нет ни одного заполненного поля, — такие не храним.
const isEmptyCheckRow = (row) => !row.team_id && !row.player_id && !row.check_result
    && !row.checked_rep_id && !row.checking_rep_id;

const readFlag = (value) => (value === true || value === false ? value : null);
const readText = (value) => (typeof value === 'string' ? value.trim() : '');

// PUT /games/:gameId/protocol-back
// Форма сохраняется целиком: замечания перезаписываются, строки проверки игроков
// заменяются присланным набором. Частичного сохранения нет — иначе пришлось бы
// разбираться, какую строку секретарь удалил, а какую просто не прислал.
export const saveProtocolBack = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        const { notes = {}, checks = [] } = req.body;

        if (!Array.isArray(checks)) {
            return res.status(400).json({ success: false, error: 'Некорректный формат таблицы проверки игроков' });
        }

        await client.query('BEGIN');

        await client.query(`
            INSERT INTO game_protocol_notes (
                game_id, referee_notes, inspector_notes, medical_notes,
                home_protest_filed, home_protest_text, away_protest_filed, away_protest_text,
                updated_by, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (game_id) DO UPDATE SET
                referee_notes = EXCLUDED.referee_notes,
                inspector_notes = EXCLUDED.inspector_notes,
                medical_notes = EXCLUDED.medical_notes,
                home_protest_filed = EXCLUDED.home_protest_filed,
                home_protest_text = EXCLUDED.home_protest_text,
                away_protest_filed = EXCLUDED.away_protest_filed,
                away_protest_text = EXCLUDED.away_protest_text,
                updated_by = EXCLUDED.updated_by,
                updated_at = NOW()
        `, [
            gameId,
            readText(notes.referee_notes),
            readText(notes.inspector_notes),
            readText(notes.medical_notes),
            readFlag(notes.home_protest_filed),
            readText(notes.home_protest_text),
            readFlag(notes.away_protest_filed),
            readText(notes.away_protest_text),
            req.user?.id || null,
        ]);

        await client.query('DELETE FROM game_player_checks WHERE game_id = $1', [gameId]);

        const rows = checks.map(readCheckRow).filter(row => !isEmptyCheckRow(row));
        for (const row of rows) {
            await client.query(`
                INSERT INTO game_player_checks (
                    game_id, sort_order, team_id, player_id, jersey_number,
                    check_result, checked_rep_id, checking_rep_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [gameId, row.sort_order, row.team_id, row.player_id, row.jersey_number,
                row.check_result, row.checked_rep_id, row.checking_rep_id]);
        }

        await client.query('COMMIT');

        const data = await fetchProtocolBack(gameId);
        res.json({ success: true, data });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка сохранения оборота протокола:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения' });
    } finally {
        client.release();
    }
};
