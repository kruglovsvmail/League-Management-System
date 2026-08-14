import pool from '../config/db.js';

// Получение списка всех дисквалификаций для лиги (переживают смену сезона — не сезонный список)
export const getLeagueDisqualifications = async (req, res) => {
    try {
        const { leagueId } = req.params;

        const result = await pool.query(`
            SELECT
                d.id,
                d.target_type,
                d.user_id,
                d.team_id,
                d.league_id,
                d.reason,
                d.penalty_type,
                d.games_assigned,
                d.mandatory_games,
                d.additional_games,
                d.games_served,
                d.penalty_amount,
                d.penalty_amount_paid,
                d.penalty_logic,
                d.start_date,
                d.end_date,
                d.status,
                u.first_name,
                u.last_name,
                u.middle_name,
                u.avatar_url,
                staff_role.tournament_role as staff_role,
                (SELECT photo_url FROM team_members tm WHERE tm.user_id = u.id AND tm.team_id = d.team_id AND tm.photo_url IS NOT NULL ORDER BY id DESC LIMIT 1) as member_photo,
                t.name as team_name,
                t.logo_url as team_logo,
                cur_div.name as division_name,
                dec.id as sdk_decision_id,
                dec.meeting_id as sdk_meeting_id,
                COALESCE(dec.violation_code_snapshot, vt.code) as sdk_violation_code,
                COALESCE(dec.violation_title_snapshot, vt.title) as sdk_violation_title,
                sm.sequence_number as sdk_meeting_number
            FROM disqualifications d
            JOIN teams t ON d.team_id = t.id
            LEFT JOIN users u ON d.user_id = u.id
            -- "Текущий" (последний по сезону) дивизион этой команды в лиге — чисто для отображения контекста
            LEFT JOIN LATERAL (
                SELECT div.name
                FROM tournament_teams tt
                JOIN divisions div ON tt.division_id = div.id
                JOIN seasons s ON div.season_id = s.id
                WHERE tt.team_id = d.team_id AND s.league_id = d.league_id
                ORDER BY s.is_active DESC, s.start_date DESC
                LIMIT 1
            ) cur_div ON true
            -- Роль представителя (для отображения), если это дисквалификация представителя команды
            LEFT JOIN LATERAL (
                SELECT ttr.tournament_role
                FROM tournament_team_roles ttr
                JOIN tournament_teams tt ON ttr.tournament_team_id = tt.id
                JOIN divisions div ON tt.division_id = div.id
                JOIN seasons s ON div.season_id = s.id
                WHERE ttr.user_id = d.user_id AND tt.team_id = d.team_id AND s.league_id = d.league_id AND ttr.left_at IS NULL
                ORDER BY s.is_active DESC, s.start_date DESC
                LIMIT 1
            ) staff_role ON d.target_type = 'staff'
            LEFT JOIN sdk_meeting_decisions dec ON dec.disqualification_id = d.id
            LEFT JOIN sdk_violation_types vt ON dec.violation_type_id = vt.id
            LEFT JOIN sdk_meetings sm ON dec.meeting_id = sm.id
            WHERE d.league_id = $1
            ORDER BY d.created_at DESC
        `, [leagueId]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения списка штрафов:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
    }
};

// История дисквалификаций конкретного человека (по всем ролям, т.к. дисквал сквозной) или команды в лиге —
// используется в шторке создания решения СДК/лайт-дисквала, чтобы показать прошлые наказания выбранного нарушителя
export const getPersonDisqualificationHistory = async (req, res) => {
    try {
        const { target_type, tournament_roster_id, tournament_team_role_id, tournament_team_id } = req.query;

        let resolveRes;
        if (target_type === 'staff') {
            if (!tournament_team_role_id) return res.json({ success: true, data: [] });
            resolveRes = await pool.query(`
                SELECT ttr.user_id, tt.team_id, s.league_id
                FROM tournament_team_roles ttr
                JOIN tournament_teams tt ON ttr.tournament_team_id = tt.id
                JOIN divisions div ON tt.division_id = div.id
                JOIN seasons s ON div.season_id = s.id
                WHERE ttr.id = $1
            `, [tournament_team_role_id]);
        } else if (target_type === 'team') {
            if (!tournament_team_id) return res.json({ success: true, data: [] });
            resolveRes = await pool.query(`
                SELECT NULL::int as user_id, tt.team_id, s.league_id
                FROM tournament_teams tt
                JOIN divisions div ON tt.division_id = div.id
                JOIN seasons s ON div.season_id = s.id
                WHERE tt.id = $1
            `, [tournament_team_id]);
        } else {
            if (!tournament_roster_id) return res.json({ success: true, data: [] });
            resolveRes = await pool.query(`
                SELECT tr.player_id as user_id, tt.team_id, s.league_id
                FROM tournament_rosters tr
                JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
                JOIN divisions div ON tt.division_id = div.id
                JOIN seasons s ON div.season_id = s.id
                WHERE tr.id = $1
            `, [tournament_roster_id]);
        }

        if (resolveRes.rows.length === 0) {
            return res.json({ success: true, data: [] });
        }
        const { user_id: userId, team_id: teamId, league_id: leagueId } = resolveRes.rows[0];

        const result = await pool.query(`
            SELECT
                d.id, d.reason, d.status, d.start_date, d.end_date,
                d.games_assigned, d.games_served, d.penalty_amount, d.penalty_amount_paid, d.penalty_logic,
                COALESCE(dec.violation_code_snapshot, vt.code) as violation_code,
                COALESCE(dec.violation_title_snapshot, vt.title) as violation_title,
                COALESCE(seas_meeting.name, seas_range.name) as season_name
            FROM disqualifications d
            LEFT JOIN sdk_meeting_decisions dec ON dec.disqualification_id = d.id
            LEFT JOIN sdk_violation_types vt ON dec.violation_type_id = vt.id
            LEFT JOIN sdk_meetings sm ON dec.meeting_id = sm.id
            LEFT JOIN seasons seas_meeting ON sm.season_id = seas_meeting.id
            LEFT JOIN LATERAL (
                SELECT s.name FROM seasons s
                WHERE s.league_id = d.league_id AND d.start_date BETWEEN s.start_date AND COALESCE(s.end_date, d.start_date)
                ORDER BY s.start_date DESC LIMIT 1
            ) seas_range ON sm.id IS NULL
            WHERE d.league_id = $1
              AND (
                ($2::int IS NOT NULL AND d.user_id = $2)
                OR ($2::int IS NULL AND d.target_type = 'team' AND d.team_id = $3)
              )
            ORDER BY d.start_date DESC, d.created_at DESC
        `, [leagueId, userId, teamId]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения истории дисквалификаций:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
    }
};

// Создание нового штрафа/дисквалификации (используется в лигах с "лайт" режимом, без заседаний СДК)
export const createDisqualification = async (req, res) => {
    try {
        const {
            target_type, tournament_roster_id, tournament_team_role_id, tournament_team_id,
            reserve_player_id, reserve_game_id,
            reason, penalty_games, mandatory_games, additional_games, penalty_amount, penalty_logic, start_date
        } = req.body;

        const targetType = target_type || 'player';

        // Резервный вратарь — тот же target_type 'player' (в реестре наказание и так
        // хранится парой user_id + team_id, а не ссылкой на заявку), но приходит
        // не из состава команды, а из протокола конкретного матча: своей заявки
        // у него нет. Признаком служит пара «игрок + матч».
        const isReserveTarget = targetType === 'player' && !!reserve_player_id && !!reserve_game_id;

        if (!reason || !start_date) {
            return res.status(400).json({ success: false, error: 'Не заполнены обязательные поля' });
        }
        if (targetType === 'player' && !tournament_roster_id && !isReserveTarget) {
            return res.status(400).json({ success: false, error: 'Не выбран игрок-нарушитель' });
        }
        if (targetType === 'staff' && !tournament_team_role_id) {
            return res.status(400).json({ success: false, error: 'Не выбран представитель команды' });
        }
        if (targetType === 'team' && !tournament_team_id) {
            return res.status(400).json({ success: false, error: 'Не выбрана команда' });
        }

        // Дисквалификация теперь крепится к user_id + team_id (глобальные) + league_id, а не к сезонной заявке —
        // резолвим их из выбранной в форме сезонной строки состава.
        let resolveRes;
        if (isReserveTarget) {
            // Команда берётся из протокола матча — та, за которую он в нём выходил.
            // Именно по её календарю потом тикает счётчик отбытых матчей, поэтому
            // источником должна быть строка протокола, а не пул дивизиона: пул
            // может измениться, протокол — нет.
            resolveRes = await pool.query(`
                SELECT gr.player_id AS user_id, gr.team_id, s.league_id
                FROM game_rosters gr
                JOIN games g ON g.id = gr.game_id
                JOIN divisions div ON g.division_id = div.id
                JOIN seasons s ON div.season_id = s.id
                WHERE gr.game_id = $1 AND gr.player_id = $2 AND gr.is_reserve_goalie
            `, [reserve_game_id, reserve_player_id]);

            if (resolveRes.rows.length === 0) {
                return res.status(400).json({ success: false, error: 'В протоколе этого матча такой резервный вратарь не значится' });
            }
        } else if (targetType === 'player') {
            resolveRes = await pool.query(`
                SELECT tr.player_id as user_id, tt.team_id, s.league_id
                FROM tournament_rosters tr
                JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
                JOIN divisions div ON tt.division_id = div.id
                JOIN seasons s ON div.season_id = s.id
                WHERE tr.id = $1
            `, [tournament_roster_id]);
        } else if (targetType === 'staff') {
            resolveRes = await pool.query(`
                SELECT ttr.user_id, tt.team_id, s.league_id
                FROM tournament_team_roles ttr
                JOIN tournament_teams tt ON ttr.tournament_team_id = tt.id
                JOIN divisions div ON tt.division_id = div.id
                JOIN seasons s ON div.season_id = s.id
                WHERE ttr.id = $1
            `, [tournament_team_role_id]);
        } else {
            resolveRes = await pool.query(`
                SELECT NULL::int as user_id, tt.team_id, s.league_id
                FROM tournament_teams tt
                JOIN divisions div ON tt.division_id = div.id
                JOIN seasons s ON div.season_id = s.id
                WHERE tt.id = $1
            `, [tournament_team_id]);
        }

        if (resolveRes.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Не удалось определить команду/лигу нарушителя' });
        }
        const { user_id: resolvedUserId, team_id: resolvedTeamId, league_id: resolvedLeagueId } = resolveRes.rows[0];

        // Матчи резервному вратарю лига может отключить: тогда ему остаётся
        // только денежный штраф.
        if (isReserveTarget && (penalty_games || mandatory_games || additional_games)) {
            const { rows: leagueRows } = await pool.query(
                'SELECT reserve_goalie_dq_games_enabled FROM leagues WHERE id = $1',
                [resolvedLeagueId]
            );
            if (!leagueRows[0]?.reserve_goalie_dq_games_enabled) {
                return res.status(400).json({
                    success: false,
                    error: 'Лига не назначает резервным вратарям пропуск матчей — укажите денежный штраф',
                });
            }
        }

        // Для цели "команда" допустим только денежный штраф — счётчик матчей для неё не имеет смысла
        const safePenaltyGames = targetType === 'team' ? null : (penalty_games || null);
        const safeMandatoryGames = targetType === 'team' ? null : (mandatory_games || null);
        const safeAdditionalGames = targetType === 'team' ? null : (additional_games || null);

        if (!safePenaltyGames && !penalty_amount) {
            return res.status(400).json({ success: false, error: 'Укажите матчи и/или сумму штрафа' });
        }

        // Тип наказания для фильтра в списке: как и в решениях СДК — 'games', если есть матчи, иначе 'manual'
        const penaltyType = safePenaltyGames ? 'games' : 'manual';

        const result = await pool.query(`
            INSERT INTO disqualifications
                (target_type, user_id, team_id, league_id,
                 reason, penalty_type, games_assigned, mandatory_games, additional_games, games_served, penalty_amount, penalty_logic, start_date, status,
                 is_reserve_goalie)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, $12, 'active', $13)
            RETURNING id
        `, [
            targetType,
            resolvedUserId,
            resolvedTeamId,
            resolvedLeagueId,
            reason,
            penaltyType,
            safePenaltyGames,
            safeMandatoryGames,
            safeAdditionalGames,
            penalty_amount || null,
            (safePenaltyGames && penalty_amount) ? (penalty_logic || 'and') : null,
            start_date,
            isReserveTarget
        ]);

        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Ошибка создания штрафа:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения штрафа' });
    }
};

// Удаление дисквалификации (заменяет собой прежнее "списание"/отмену — статус "отменена" больше не используется).
// Статус "completed" теперь выставляется только автоматически (триггер disqualification_auto_complete
// по факту отбытых матчей и/или оплаты) — отдельного ручного эндпоинта для этого больше нет.
export const deleteDisqualification = async (req, res) => {
    try {
        const { id } = req.params;

        const sdkCheck = await pool.query(
            `SELECT id, meeting_id FROM sdk_meeting_decisions WHERE disqualification_id = $1`,
            [id]
        );
        const linkedSdkDecision = sdkCheck.rows[0];

        if (linkedSdkDecision) {
            return res.status(400).json({
                success: false,
                error: 'Эта дисквалификация назначена решением СДК. Удалить её можно только через удаление решения в заседании.',
                sdk_meeting_id: linkedSdkDecision.meeting_id
            });
        }

        await pool.query(`DELETE FROM disqualifications WHERE id = $1`, [id]);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления штрафа:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления' });
    }
};

// Отметка/снятие отметки об оплате денежного штрафа
export const toggleDisqualificationPaid = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE disqualifications SET penalty_amount_paid = NOT penalty_amount_paid, updated_at = NOW() WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка отметки оплаты штрафа:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения' });
    }
};
