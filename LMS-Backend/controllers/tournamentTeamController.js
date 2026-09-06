import pool from '../config/db.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';
import { recalculateDivisionStandings } from '../utils/standingsCalculator.js';
import { assertApplicationRosterAllowed, assertPlayersAllowedInDivision, loadDivisionQualificationRules } from '../utils/qualificationAccess.js';

/**
 * Роли представителя в турнирной заявке — те же три, что и в Team-Room
 * (см. MgrSeasonController.TOURNAMENT_ROLES). Главный тренер команды (head_coach)
 * подаётся в заявку обычным 'coach': разделения на главного и рядового в заявке нет.
 * Один человек может занимать несколько ролей — на каждую заводится своя строка
 * в tournament_team_roles.
 */
const TOURNAMENT_ROLES = ['team_manager', 'team_admin', 'coach'];
const toTournamentRole = (teamRole) => (teamRole === 'head_coach' ? 'coach' : teamRole);

export const getTournamentTeamRoster = async (req, res) => {
    try {
        const { id } = req.params;

        // Дисквалификации и квалификации привязаны к user_id + league_id (не к сезонной
        // заявке), поэтому сперва резолвим лигу этой турнирной команды — она одна на весь
        // запрос. Дивизион нужен для пометки о расхождении с его списком допуска.
        const leagueRes = await pool.query(`
            SELECT s.league_id, div.id AS division_id
            FROM tournament_teams tt
            JOIN divisions div ON tt.division_id = div.id
            JOIN seasons s ON div.season_id = s.id
            WHERE tt.id = $1
        `, [id]);
        const leagueId = leagueRes.rows[0]?.league_id || null;
        const divisionId = leagueRes.rows[0]?.division_id || null;

        // 1. Получаем игроков ростера (с оптимизированным получением фото и дисквалификаций)
        const result = await pool.query(`
            SELECT
                tr.id as tournament_roster_id,
                tr.player_id,
                tr.application_status,
                tr.insurance_url,
                tr.insurance_expires_at,
                tr.medical_url,
                tr.medical_expires_at,
                tr.consent_url,
                tr.consent_expires_at,
                tr.is_fee_paid,
                tr.jersey_number,
                tr.position,
                tr.is_captain,
                tr.is_assistant,
                tr.period_end,
                tr.updated_at,
                u.first_name,
                u.last_name,
                u.middle_name,
                u.avatar_url as user_avatar_url,
                tm_photo.photo_url as team_member_photo_url,

                -- Квалификация лиговая: одна на человека во всей лиге, заявка её не хранит.
                -- Поэтому в старом дивизионе бейдж меняется вместе с текущей квалификацией,
                -- а прежняя остаётся в истории (qualification_prev_short_name для подсказки).
                uq.qualification_id,
                lq.short_name as qualification_short_name,
                uq.assigned_at as qualification_assigned_at,
                prev_qual.short_name as qualification_prev_short_name,

                -- Расхождение: действующая квалификация не входит в список допущенных этим
                -- дивизионом. Пустой список ограничений не ставит, поэтому первый EXISTS
                -- обязателен. Игрока это ниоткуда не выкидывает (правила проверяются в момент
                -- заявки, а не задним числом) — пометка нужна лиге, чтобы понимать, откуда
                -- в любительском дивизионе взялся мастер.
                (EXISTS (SELECT 1 FROM division_qualifications dq WHERE dq.division_id = $3)
                 AND NOT EXISTS (
                    SELECT 1 FROM division_qualifications dq
                    WHERE dq.division_id = $3
                      AND dq.qualification_id IS NOT DISTINCT FROM uq.qualification_id
                )) as qualification_conflict,

                -- Личные наказания + командный штраф (ограничивает всех, кроме тренеров)
                user_active_disqualifications(tr.player_id, $2) as active_disqualifications

            FROM tournament_rosters tr
            JOIN users u ON tr.player_id = u.id
            JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
            LEFT JOIN user_qualifications uq
                   ON uq.user_id = tr.player_id AND uq.league_id = $2 AND uq.ended_at IS NULL
            LEFT JOIN league_qualifications lq ON lq.id = uq.qualification_id

            -- Предыдущая квалификация — последняя закрытая строка истории. Строки идут
            -- последовательно (старую закрыли, новую вставили), поэтому она и есть та,
            -- с которой сменили.
            LEFT JOIN LATERAL (
                SELECT plq.short_name
                FROM user_qualifications puq
                JOIN league_qualifications plq ON plq.id = puq.qualification_id
                WHERE puq.user_id = tr.player_id AND puq.league_id = $2 AND puq.ended_at IS NOT NULL
                ORDER BY puq.ended_at DESC
                LIMIT 1
            ) prev_qual ON true

            -- Оптимизация: берем последнее фото без сканирования всей таблицы на каждую строку
            LEFT JOIN LATERAL (
                SELECT photo_url
                FROM team_members
                WHERE user_id = u.id AND team_id = tt.team_id AND photo_url IS NOT NULL
                ORDER BY id DESC LIMIT 1
            ) tm_photo ON true

            WHERE tr.tournament_team_id = $1
            -- Порядок по умолчанию — как в протоколе: вратари, защитники, нападающие,
            -- внутри группы по алфавиту ФИО. Игроки без позиции падают в конец.
            -- Сортировка по клику в шапке таблицы это перебивает.
            ORDER BY
                CASE tr.position
                    WHEN 'goalie'  THEN 1
                    WHEN 'defense' THEN 2
                    WHEN 'forward' THEN 3
                    ELSE 4
                END,
                u.last_name, u.first_name, u.middle_name
        `, [id, leagueId, divisionId]);

        // 2. Получаем представителей (staff) команды из ТУРНИРНОЙ заявки (tournament_team_roles)
        const staffResult = await pool.query(`
            SELECT
                ttr.user_id as player_id,
                MIN(ttr.id) as tournament_team_role_id,
                u.first_name,
                u.last_name,
                u.middle_name,
                u.phone,
                u.avatar_url as user_avatar_url,
                tm.photo_url as team_member_photo_url,
                string_agg(ttr.tournament_role, ', ') as roles,
                user_active_disqualifications(ttr.user_id, $2) as active_disqualifications
            FROM tournament_team_roles ttr
            JOIN users u ON ttr.user_id = u.id
            JOIN tournament_teams tt ON ttr.tournament_team_id = tt.id
            LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tt.team_id AND tm.left_at IS NULL
            WHERE ttr.tournament_team_id = $1 AND ttr.left_at IS NULL
            GROUP BY ttr.user_id, u.first_name, u.last_name, u.middle_name, u.phone, u.avatar_url, tm.photo_url
            ORDER BY u.last_name, u.first_name
        `, [id, leagueId]);

        res.json({ success: true, data: result.rows, staff: staffResult.rows });
    } catch (err) {
        console.error('Ошибка получения ростера:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки состава' });
    }
};

export const updateTournamentTeamStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Допуск команды — последняя точка, где состав ещё можно не пропустить. К этому
        // моменту он мог перестать соответствовать правилам: и квалификацию игроку, и список
        // допущенных в дивизион лига меняет в любой момент после подачи заявки.
        if (status === 'approved') {
            await assertApplicationRosterAllowed(pool, id);
        }

        const { rows } = await pool.query(
            `UPDATE tournament_teams SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING division_id`,
            [status, id]
        );

        // Смена статуса заявки команды (допуск/отклонение) меняет состав дивизиона,
        // поэтому таблицу нужно пересчитать сразу, а не ждать следующего сыгранного матча.
        // Личную статистику здесь пересчитывать больше не нужно: прежний кэш заводил
        // пустые строки под каждую одобренную заявку, а в player_game_statistics строка
        // появляется только когда игрок реально вышел на матч.
        const divisionId = rows[0]?.division_id;
        if (divisionId) {
            try {
                await recalculateDivisionStandings(divisionId);
            } catch (calcErr) {
                console.error('Ошибка пересчета таблицы после смены статуса команды:', calcErr);
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка смены статуса команды:', err);
        // status ставит проверка допуска по квалификациям — её текст объясняет, кого именно
        // не пропустили, и должен дойти до лиги как есть
        res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка смены статуса команды' });
    }
};

export const updateTournamentTeamCustomData = async (req, res) => {
    try {
        const { id } = req.params;
        const { custom_description, custom_jersey_light_url, custom_jersey_dark_url, custom_team_photo_url } = req.body;
        
        let updates = [];
        let values = [];
        let counter = 1;

        if (custom_description !== undefined) {
            updates.push(`custom_description = $${counter++}`);
            values.push(custom_description);
        }
        if (custom_jersey_light_url !== undefined) {
            updates.push(`custom_jersey_light_url = $${counter++}`);
            values.push(custom_jersey_light_url);
        }
        if (custom_jersey_dark_url !== undefined) {
            updates.push(`custom_jersey_dark_url = $${counter++}`);
            values.push(custom_jersey_dark_url);
        }
        if (custom_team_photo_url !== undefined) {
            updates.push(`custom_team_photo_url = $${counter++}`);
            values.push(custom_team_photo_url);
        }

        if (updates.length > 0) {
            values.push(id);
            await pool.query(`UPDATE tournament_teams SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${counter}`, values);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления данных турнирной команды:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения данных' });
    }
};

export const uploadTournamentTeamFile = async (req, res) => {
    try {
        const { id, type } = req.params;
        if (!req.file) return res.status(400).json({ success: false, error: 'Файл не найден' });
        
        const ext = req.file.originalname.split('.').pop();
        let fileName = `uploads/tournament_teams_${id}_custom_${type}_url.${ext}`;
        let dbColumn = `custom_${type}_url`;

        if (type === 'paper_league') {
            fileName = `uploads/paper_application_tournament_teams_${id}_league.${ext}`;
            dbColumn = 'paper_roster_league_url';
        } else if (type === 'paper_team') {
            fileName = `uploads/paper_application_tournament_teams_${id}.${ext}`;
            dbColumn = 'paper_roster_team_url';
        }

        await s3.send(new PutObjectCommand({
            Bucket: 'hockeyeco-uploads',
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }));

        const url = `/${fileName}`;
        await pool.query(`UPDATE tournament_teams SET ${dbColumn} = $1 WHERE id = $2`, [url, id]);

        res.json({ success: true, url: url });
    } catch (err) {
        console.error('Ошибка загрузки файла команды турнира:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteTournamentTeamLeaguePaper = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE tournament_teams SET paper_roster_league_url = NULL WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления файла лиги:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления файла' });
    }
};

// ============================================================================
// РЕЖИМ «СОСТАВ ЗАЯВКИ ВЕДЁТ ЛИГА» (divisions.league_managed_roster)
// ============================================================================
//
// Бумажный дивизион с этим флагом работает так: команда подаёт заявку сканом
// заявочного листа, лига проверяет его и прикрепляет утверждённый — и дальше
// вносит игроков и представителей в заявку САМА, из раздела «Дивизионы».
// Команда состав не трогает ни в одном статусе (Team-Room это запрещает
// отдельно, см. MgrSeasonController.assertCompositionEditable).
//
// Окно правки: только заявочная кампания или трансферное окно дивизиона.
// Статусы: 'pending' и 'approved' — это время лиги. В 'revision' заявка
// возвращена команде (исправить скан, номера и документы), и состав в этот
// момент не редактирует никто.

const COMPOSITION_EDITABLE_STATUSES = ['pending', 'approved'];
const POSITIONS = ['goalie', 'defense', 'forward'];

const MANAGED_APP_SQL = `
    SELECT tt.id, tt.team_id, tt.division_id, tt.status, tt.paper_roster_league_url,
           d.name AS division_name, d.digital_applications_only, d.league_managed_roster,
           d.application_start, d.application_end, d.transfer_start, d.transfer_end,
           s.league_id,
           t.name AS team_name,
           -- Как только в дивизионе сыгран хотя бы один матч (любой командой), строку из
           -- заявки больше не удаляем: на неё смотрят протоколы и статистика. Вместо
           -- удаления — отзаявка через period_end.
           EXISTS (SELECT 1 FROM games g WHERE g.division_id = d.id AND g.status = 'finished') AS division_has_games
    FROM tournament_teams tt
    JOIN divisions d ON tt.division_id = d.id
    JOIN seasons s ON d.season_id = s.id
    JOIN teams t ON tt.team_id = t.id
    WHERE tt.id = $1
`;

// Окно правки состава: заявочная кампания ИЛИ трансферное окно. Пара дат считается
// заданной только целиком; если не задано ни одно окно — ограничивать нечем, и правка
// открыта (так же трактует даты карточка дивизиона в LMS).
const isRosterWindowOpen = (app) => {
    const now = Date.now();
    const within = (start, end) => {
        if (!start || !end) return null;
        return now >= new Date(start).getTime() && now <= new Date(end).getTime();
    };
    const inApplication = within(app.application_start, app.application_end);
    const inTransfer = within(app.transfer_start, app.transfer_end);
    if (inApplication === null && inTransfer === null) return true;
    return inApplication === true || inTransfer === true;
};

// Почему лига не может править состав этой заявки прямо сейчас. null = может.
// Текст уходит и в шторку (подсказка), и в отказ сохранения — он должен объяснять причину.
const compositionBlockReason = (app) => {
    if (app.digital_applications_only) return 'В цифровом дивизионе состав заявки ведёт команда';
    if (!app.league_managed_roster) return 'В этом дивизионе состав заявки ведёт команда';
    if (!app.paper_roster_league_url) return 'Сначала прикрепите утверждённый заявочный лист';
    if (!COMPOSITION_EDITABLE_STATUSES.includes(app.status)) {
        return 'Состав редактируется только у заявок на проверке и допущенных';
    }
    if (!isRosterWindowOpen(app)) return 'Заявочная кампания и трансферное окно закрыты';
    return null;
};

/**
 * GET /tournament-teams/:id/roster-pool
 * Данные для шторки «Состав заявки»: слева — игровой состав и штаб команды,
 * справа — то, что уже в заявке. Отдаётся и когда правка сейчас закрыта: шторка
 * в этом случае открывается на просмотр и показывает причину.
 */
export const getTournamentTeamRosterPool = async (req, res) => {
    try {
        const { id } = req.params;

        const appRes = await pool.query(MANAGED_APP_SQL, [id]);
        if (appRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Заявка не найдена' });
        }
        const app = appRes.rows[0];
        const qualRules = await loadDivisionQualificationRules(pool, app.division_id);

        // Игровой состав команды целиком: шторка сама прячет тех, кто уже в заявке.
        const playersRes = await pool.query(`
            SELECT tm.user_id AS player_id, u.first_name, u.last_name, u.middle_name,
                   u.avatar_url, tm.photo_url,
                   tr.position, tr.jersey_number,
                   uq.qualification_id, lq.name AS qualification_name, lq.short_name AS qualification_short_name,
                   user_active_disqualifications(tm.user_id, $2) AS active_disqualifications
            FROM team_rosters tr
            JOIN team_members tm ON tr.member_id = tm.id
            JOIN users u ON tm.user_id = u.id
            LEFT JOIN user_qualifications uq
                   ON uq.user_id = tm.user_id AND uq.league_id = $2 AND uq.ended_at IS NULL
            LEFT JOIN league_qualifications lq ON lq.id = uq.qualification_id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL AND tr.left_at IS NULL
            ORDER BY u.last_name, u.first_name
        `, [app.team_id, app.league_id]);

        // Штаб команды: заявить представителем можно только того, кто числится в штате
        // команды (team_roles). Роли в команде подсказывают, какую роль подставить в заявке.
        const staffRes = await pool.query(`
            SELECT tm.user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url,
                   string_agg(trole.role, ',' ORDER BY trole.role) AS team_roles,
                   user_active_disqualifications(tm.user_id, $2) AS active_disqualifications
            FROM team_roles trole
            JOIN team_members tm ON trole.member_id = tm.id
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL AND trole.left_at IS NULL
            GROUP BY tm.user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url
            ORDER BY u.last_name, u.first_name
        `, [app.team_id, app.league_id]);

        const rosterRes = await pool.query(`
            SELECT tr.id AS tournament_roster_id, tr.player_id, tr.position, tr.jersey_number,
                   tr.is_captain, tr.is_assistant, tr.application_status,
                   u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url
            FROM tournament_rosters tr
            JOIN users u ON tr.player_id = u.id
            LEFT JOIN team_members tm ON tm.user_id = tr.player_id AND tm.team_id = $2 AND tm.left_at IS NULL
            WHERE tr.tournament_team_id = $1 AND tr.period_end IS NULL
            ORDER BY u.last_name, u.first_name
        `, [id, app.team_id]);

        const appStaffRes = await pool.query(`
            SELECT ttr.user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url,
                   string_agg(ttr.tournament_role, ',' ORDER BY ttr.tournament_role) AS roles
            FROM tournament_team_roles ttr
            JOIN users u ON ttr.user_id = u.id
            LEFT JOIN team_members tm ON tm.user_id = ttr.user_id AND tm.team_id = $2 AND tm.left_at IS NULL
            WHERE ttr.tournament_team_id = $1 AND ttr.left_at IS NULL
            GROUP BY ttr.user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url
            ORDER BY u.last_name, u.first_name
        `, [id, app.team_id]);

        // qual_block_reason — почему игрока нельзя добавить в эту заявку. Только подсказка
        // для шторки: сохранение проверяет допуск само (assertPlayersAllowedInDivision).
        const allowedQualIds = new Set((qualRules?.allowed || []).map(q => q.id));
        const players = playersRes.rows.map(player => {
            if (!qualRules?.enabled) return { ...player, qual_block_reason: null };
            const isAllowed = player.qualification_id
                ? allowedQualIds.has(player.qualification_id)
                : qualRules.allowsNone;
            return {
                ...player,
                qual_block_reason: isAllowed ? null : `${player.qualification_name || 'Квалификации нет'} — не допускается`
            };
        });

        res.json({
            success: true,
            application: {
                id: app.id,
                team_id: app.team_id,
                team_name: app.team_name,
                division_id: app.division_id,
                division_name: app.division_name,
                status: app.status,
                division_has_games: app.division_has_games,
                block_reason: compositionBlockReason(app)
            },
            players,
            staff: staffRes.rows,
            roster: rosterRes.rows,
            appStaff: appStaffRes.rows
        });
    } catch (err) {
        console.error('Ошибка загрузки состава команды для заявки:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки состава команды' });
    }
};

/**
 * PUT /tournament-teams/:id/roster-composition
 * Лига сохраняет состав заявки целиком: сервер приводит заявку к присланному набору.
 * players: [{ player_id, position, jersey_number, is_captain, is_assistant }]
 * staff:   [{ user_id, roles: ['team_manager'|'team_admin'|'coach', ...] }]
 */
export const saveTournamentTeamComposition = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;

        const appRes = await client.query(MANAGED_APP_SQL, [id]);
        if (appRes.rows.length === 0) {
            const err = new Error('Заявка не найдена');
            err.status = 404;
            throw err;
        }
        const app = appRes.rows[0];

        const blockReason = compositionBlockReason(app);
        if (blockReason) {
            const err = new Error(blockReason);
            err.status = 400;
            throw err;
        }

        // --- Разбор запроса -------------------------------------------------
        // Один и тот же человек может прийти дважды (в шторке такого не бывает, но запрос
        // приходит извне) — оставляем последнюю запись о нём.
        const playersById = new Map();
        for (const raw of (Array.isArray(req.body.players) ? req.body.players : [])) {
            const playerId = Number(raw.player_id);
            if (!playerId) continue;
            const jersey = raw.jersey_number === '' || raw.jersey_number === null || raw.jersey_number === undefined
                ? null
                : Number(raw.jersey_number);
            playersById.set(playerId, {
                player_id: playerId,
                position: POSITIONS.includes(raw.position) ? raw.position : null,
                jersey_number: Number.isFinite(jersey) ? jersey : null,
                is_captain: !!raw.is_captain,
                is_assistant: !!raw.is_assistant
            });
        }
        const incomingPlayers = [...playersById.values()];

        const staffByUser = new Map();
        for (const raw of (Array.isArray(req.body.staff) ? req.body.staff : [])) {
            const userId = Number(raw.user_id);
            if (!userId) continue;
            const roles = [...new Set((Array.isArray(raw.roles) ? raw.roles : []).map(toTournamentRole))]
                .filter(role => TOURNAMENT_ROLES.includes(role));
            if (roles.length > 0) staffByUser.set(userId, roles);
        }
        const staffPairs = [...staffByUser.entries()].flatMap(([user_id, roles]) => roles.map(role => ({ user_id, role })));

        // --- Проверки состава -----------------------------------------------
        const captains = incomingPlayers.filter(p => p.is_captain).length;
        if (captains > 1) {
            const err = new Error('В заявке может быть только один капитан');
            err.status = 400;
            throw err;
        }
        if (incomingPlayers.filter(p => p.is_assistant).length > 2) {
            const err = new Error('Ассистентов капитана может быть не больше двух');
            err.status = 400;
            throw err;
        }

        const usedNumbers = new Map();
        for (const player of incomingPlayers) {
            if (player.jersey_number === null) continue;
            if (usedNumbers.has(player.jersey_number)) {
                const err = new Error(`Номер ${player.jersey_number} назначен нескольким игрокам`);
                err.status = 400;
                throw err;
            }
            usedNumbers.set(player.jersey_number, player.player_id);
        }

        // Заявить можно только того, кто состоит в игровом составе команды: без строки
        // в team_rosters у человека нет ни амплуа, ни номера, и в Team-Room он не игрок.
        const teamRosterRes = await client.query(`
            SELECT tm.user_id, tr.position
            FROM team_rosters tr
            JOIN team_members tm ON tr.member_id = tm.id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL AND tr.left_at IS NULL
        `, [app.team_id]);
        const teamPositions = new Map(teamRosterRes.rows.map(r => [r.user_id, r.position]));

        const strangers = incomingPlayers.filter(p => !teamPositions.has(p.player_id));
        if (strangers.length > 0) {
            const err = new Error('В заявку можно внести только игроков из игрового состава команды');
            err.status = 400;
            throw err;
        }

        // Амплуа не пришло — берём из состава команды (лига может его переопределить:
        // вратаря заявляют нападающим и наоборот).
        for (const player of incomingPlayers) {
            if (!player.position) player.position = teamPositions.get(player.player_id) || null;
        }

        const teamStaffRes = await client.query(`
            SELECT DISTINCT tm.user_id
            FROM team_roles trole
            JOIN team_members tm ON trole.member_id = tm.id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL AND trole.left_at IS NULL
        `, [app.team_id]);
        const teamStaffIds = new Set(teamStaffRes.rows.map(r => r.user_id));
        if ([...staffByUser.keys()].some(userId => !teamStaffIds.has(userId))) {
            const err = new Error('Представителем можно заявить только человека из штаба команды');
            err.status = 400;
            throw err;
        }

        // --- Разбор изменений -----------------------------------------------
        const currentRes = await client.query(
            `SELECT player_id, period_end FROM tournament_rosters WHERE tournament_team_id = $1`,
            [id]
        );
        const activeIds = new Set(currentRes.rows.filter(r => r.period_end === null).map(r => r.player_id));

        const incomingIds = new Set(incomingPlayers.map(p => p.player_id));
        const removedIds = [...activeIds].filter(playerId => !incomingIds.has(playerId));
        // Квалификацию проверяем только у тех, кто попадает в заявку сейчас: правила
        // действуют в момент заявки и задним числом никого не выкидывают.
        const addedIds = incomingPlayers.filter(p => !activeIds.has(p.player_id)).map(p => p.player_id);
        if (addedIds.length > 0) {
            await assertPlayersAllowedInDivision(client, app.division_id, addedIds);
        }

        const playersJson = JSON.stringify(incomingPlayers);

        if (incomingPlayers.length > 0) {
            // Уже активные: обновляем только карточку, допуск лиги не трогаем — его могли
            // снять вручную тумблером в составе дивизиона.
            await client.query(`
                UPDATE tournament_rosters tr
                SET position = x.position,
                    jersey_number = x.jersey_number,
                    is_captain = x.is_captain,
                    is_assistant = x.is_assistant,
                    updated_at = NOW()
                FROM jsonb_to_recordset($2::jsonb)
                     AS x(player_id int, position varchar, jersey_number int, is_captain boolean, is_assistant boolean)
                WHERE tr.tournament_team_id = $1 AND tr.player_id = x.player_id AND tr.period_end IS NULL
            `, [id, playersJson]);

            // Ранее отзаявленные: возвращаем в состав непропущенными. Допуск лига ставит
            // отдельно, тумблером в составе дивизиона: внесение в заявку и допуск к матчам —
            // разные решения, и второе не должно проставляться само.
            await client.query(`
                UPDATE tournament_rosters tr
                SET period_end = NULL,
                    application_status = 'pending',
                    position = x.position,
                    jersey_number = x.jersey_number,
                    is_captain = x.is_captain,
                    is_assistant = x.is_assistant,
                    updated_at = NOW()
                FROM jsonb_to_recordset($2::jsonb)
                     AS x(player_id int, position varchar, jersey_number int, is_captain boolean, is_assistant boolean)
                WHERE tr.tournament_team_id = $1 AND tr.player_id = x.player_id AND tr.period_end IS NOT NULL
            `, [id, playersJson]);

            // application_status не указываем — новый игрок заводится недопущенным, как и при
            // добавлении из Team-Room. Допуск лига проставляет отдельно.
            await client.query(`
                INSERT INTO tournament_rosters
                    (tournament_team_id, player_id, position, jersey_number, is_captain, is_assistant)
                SELECT $1, x.player_id, x.position, x.jersey_number, x.is_captain, x.is_assistant
                FROM jsonb_to_recordset($2::jsonb)
                     AS x(player_id int, position varchar, jersey_number int, is_captain boolean, is_assistant boolean)
                WHERE NOT EXISTS (
                    SELECT 1 FROM tournament_rosters tr
                    WHERE tr.tournament_team_id = $1 AND tr.player_id = x.player_id
                )
            `, [id, playersJson]);
        }

        if (removedIds.length > 0) {
            if (app.division_has_games) {
                // Матчи уже сыграны: строку сохраняем, игрок уходит в «Отзаявленные».
                await client.query(`
                    UPDATE tournament_rosters
                    SET period_end = CURRENT_DATE, updated_at = NOW()
                    WHERE tournament_team_id = $1 AND player_id = ANY($2::int[]) AND period_end IS NULL
                `, [id, removedIds]);
            } else {
                await client.query(`
                    DELETE FROM tournament_rosters
                    WHERE tournament_team_id = $1 AND player_id = ANY($2::int[]) AND period_end IS NULL
                `, [id, removedIds]);
            }
        }

        // --- Штаб -------------------------------------------------------------
        // Приводим состояние к присланному набору пар «человек + роль»: лишние роли
        // закрываем, недостающие открываем (повторное добавление переоткрывает ту же строку).
        const staffJson = JSON.stringify(staffPairs);
        await client.query(`
            UPDATE tournament_team_roles ttr
            SET left_at = NOW()
            WHERE ttr.tournament_team_id = $1 AND ttr.left_at IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS x(user_id int, role varchar)
                  WHERE x.user_id = ttr.user_id AND x.role = ttr.tournament_role
              )
        `, [id, staffJson]);

        if (staffPairs.length > 0) {
            await client.query(`
                INSERT INTO tournament_team_roles (tournament_team_id, user_id, tournament_role)
                SELECT $1, x.user_id, x.role
                FROM jsonb_to_recordset($2::jsonb) AS x(user_id int, role varchar)
                ON CONFLICT (tournament_team_id, user_id, tournament_role) DO UPDATE SET left_at = NULL
            `, [id, staffJson]);
        }

        await client.query('COMMIT');
        res.json({ success: true, added: addedIds.length, removed: removedIds.length });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка сохранения состава заявки лигой:', err);
        // status ставят проверки допуска и режима — их текст объясняет лиге причину отказа
        res.status(err.status || 500).json({
            success: false,
            error: err.status ? err.message : 'Ошибка сохранения состава заявки'
        });
    } finally {
        client.release();
    }
};