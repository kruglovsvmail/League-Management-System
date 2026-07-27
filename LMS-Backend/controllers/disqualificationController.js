import pool from '../config/db.js';

// Получение списка всех дисквалификаций для конкретного сезона
export const getSeasonDisqualifications = async (req, res) => {
    try {
        const { seasonId } = req.params;

        const result = await pool.query(`
            SELECT
                d.id,
                d.target_type,
                d.tournament_roster_id,
                d.tournament_team_role_id,
                d.tournament_team_id,
                COALESCE(tr.player_id, ttr.user_id) as player_id,
                d.reason,
                d.penalty_type,
                d.games_assigned,
                d.games_served,
                d.penalty_amount,
                d.penalty_amount_paid,
                d.penalty_logic,
                d.start_date,
                d.end_date,
                d.status,
                COALESCE(u_player.first_name, u_staff.first_name) as first_name,
                COALESCE(u_player.last_name, u_staff.last_name) as last_name,
                COALESCE(u_player.middle_name, u_staff.middle_name) as middle_name,
                COALESCE(u_player.avatar_url, u_staff.avatar_url) as avatar_url,
                ttr.tournament_role as staff_role,
                COALESCE(
                    (SELECT photo_url FROM team_members tm WHERE tm.user_id = u_player.id AND tm.team_id = t.id AND tm.photo_url IS NOT NULL ORDER BY id DESC LIMIT 1),
                    (SELECT photo_url FROM team_members tm WHERE tm.user_id = u_staff.id AND tm.team_id = t.id AND tm.photo_url IS NOT NULL ORDER BY id DESC LIMIT 1)
                ) as member_photo,
                t.name as team_name,
                t.logo_url as team_logo,
                div.name as division_name,
                dec.id as sdk_decision_id,
                dec.meeting_id as sdk_meeting_id,
                COALESCE(dec.violation_code_snapshot, vt.code) as sdk_violation_code,
                COALESCE(dec.violation_title_snapshot, vt.title) as sdk_violation_title,
                sm.sequence_number as sdk_meeting_number
            FROM disqualifications d
            LEFT JOIN tournament_rosters tr ON d.tournament_roster_id = tr.id
            LEFT JOIN users u_player ON tr.player_id = u_player.id
            LEFT JOIN tournament_team_roles ttr ON d.tournament_team_role_id = ttr.id
            LEFT JOIN users u_staff ON ttr.user_id = u_staff.id
            JOIN tournament_teams tt ON tt.id = COALESCE(tr.tournament_team_id, ttr.tournament_team_id, d.tournament_team_id)
            JOIN teams t ON tt.team_id = t.id
            JOIN divisions div ON tt.division_id = div.id
            LEFT JOIN sdk_meeting_decisions dec ON dec.disqualification_id = d.id
            LEFT JOIN sdk_violation_types vt ON dec.violation_type_id = vt.id
            LEFT JOIN sdk_meetings sm ON dec.meeting_id = sm.id
            WHERE div.season_id = $1
            ORDER BY d.created_at DESC
        `, [seasonId]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения списка штрафов:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
    }
};

// Создание нового штрафа/дисквалификации (используется в лигах с "лайт" режимом, без заседаний СДК)
export const createDisqualification = async (req, res) => {
    try {
        const {
            target_type, tournament_roster_id, tournament_team_role_id, tournament_team_id,
            reason, penalty_games, penalty_amount, penalty_logic, start_date
        } = req.body;

        const targetType = target_type || 'player';

        if (!reason || !start_date) {
            return res.status(400).json({ success: false, error: 'Не заполнены обязательные поля' });
        }
        if (targetType === 'player' && !tournament_roster_id) {
            return res.status(400).json({ success: false, error: 'Не выбран игрок-нарушитель' });
        }
        if (targetType === 'staff' && !tournament_team_role_id) {
            return res.status(400).json({ success: false, error: 'Не выбран представитель команды' });
        }
        if (targetType === 'team' && !tournament_team_id) {
            return res.status(400).json({ success: false, error: 'Не выбрана команда' });
        }

        // Для цели "команда" допустим только денежный штраф — счётчик матчей для неё не имеет смысла
        const safePenaltyGames = targetType === 'team' ? null : (penalty_games || null);

        if (!safePenaltyGames && !penalty_amount) {
            return res.status(400).json({ success: false, error: 'Укажите матчи и/или сумму штрафа' });
        }

        // Тип наказания для фильтра в списке: как и в решениях СДК — 'games', если есть матчи, иначе 'manual'
        const penaltyType = safePenaltyGames ? 'games' : 'manual';

        const result = await pool.query(`
            INSERT INTO disqualifications
                (target_type, tournament_roster_id, tournament_team_role_id, tournament_team_id,
                 reason, penalty_type, games_assigned, games_served, penalty_amount, penalty_logic, start_date, status)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, 'active')
            RETURNING id
        `, [
            targetType,
            targetType === 'player' ? tournament_roster_id : null,
            targetType === 'staff' ? tournament_team_role_id : null,
            targetType === 'team' ? tournament_team_id : null,
            reason,
            penaltyType,
            safePenaltyGames,
            penalty_amount || null,
            (safePenaltyGames && penalty_amount) ? (penalty_logic || 'and') : null,
            start_date
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