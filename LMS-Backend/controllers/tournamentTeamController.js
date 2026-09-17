import pool from '../config/db.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import ExcelJS from 'exceljs';
import s3 from '../config/s3.js';
import { recalculateDivisionStandings } from '../utils/standingsCalculator.js';
import { assertApplicationRosterAllowed, assertPlayersAllowedInDivision, loadDivisionQualificationRules } from '../utils/qualificationAccess.js';
import { isLeagueOwner } from '../utils/leagueOwners.js';
import { syncClubMembershipOnTeamJoin } from '../utils/clubMembership.js';
import { alignPersonAdmission } from '../utils/personAdmission.js';

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
                -- Дата рождения нужна значкам экипировки по возрасту («ушк» и «к»)
                to_char(u.birth_date, 'YYYY-MM-DD') AS birth_date,
                -- Документы допуска лежат на паре «заявка + человек» (tournament_person_docs):
                -- у играющего представителя они одни и те же и в составе, и в штабе.
                -- Согласие на ПД — исключение: оно принадлежит паре «человек + лига»
                -- (user_league_consents) и переезжает с человеком из команды в команду.
                tpd.insurance_url,
                tpd.insurance_expires_at,
                tpd.medical_url,
                tpd.medical_expires_at,
                ulc.consent_url,
                ulc.consent_expires_at,
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
                -- Пока игрок допущен, лига везде показывает слепок фотографии, снятый в
                -- момент допуска: фото в команде руководитель меняет когда угодно, и без
                -- слепка на площадку под чужим именем мог бы выйти другой человек.
                COALESCE(tr.photo_snapshot_url, tm_photo.photo_url) as team_member_photo_url,

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
            LEFT JOIN tournament_person_docs tpd
                   ON tpd.tournament_team_id = tr.tournament_team_id AND tpd.user_id = tr.player_id
            LEFT JOIN user_league_consents ulc
                   ON ulc.user_id = tr.player_id AND ulc.league_id = $2
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
                user_active_disqualifications(ttr.user_id, $2) as active_disqualifications,
                -- Тумблер допуска представителя. Строка заводится лениво, по первому щелчку,
                -- поэтому её отсутствие и есть «не допущен» (tournament_staff_admission).
                COALESCE(BOOL_OR(tsa.is_admitted), false) as is_admitted,
                -- Дивизион требует документы и с представителей — по тем же флагам,
                -- что и с игроков. Играющий тренер видит здесь ровно то же, что в составе.
                MAX(tpd.insurance_url) as insurance_url,
                MAX(tpd.insurance_expires_at) as insurance_expires_at,
                MAX(tpd.medical_url) as medical_url,
                MAX(tpd.medical_expires_at) as medical_expires_at,
                -- Согласие — на человека в лиге (user_league_consents), не на заявку
                MAX(ulc.consent_url) as consent_url,
                MAX(ulc.consent_expires_at) as consent_expires_at
            FROM tournament_team_roles ttr
            JOIN users u ON ttr.user_id = u.id
            JOIN tournament_teams tt ON ttr.tournament_team_id = tt.id
            LEFT JOIN tournament_person_docs tpd
                   ON tpd.tournament_team_id = ttr.tournament_team_id AND tpd.user_id = ttr.user_id
            LEFT JOIN user_league_consents ulc
                   ON ulc.user_id = ttr.user_id AND ulc.league_id = $2
            LEFT JOIN tournament_staff_admission tsa
                   ON tsa.tournament_team_id = ttr.tournament_team_id AND tsa.user_id = ttr.user_id
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
//
// Откуда берутся игроки — решает глобальный параметр лиги leagues.league_roster_global_search
// (Команды → Лиги у глобального админа). Выключен: только из игрового состава команды.
// Включён: поиск по всей базе пользователей; найденного вне игрового состава сервер
// сам вводит в команду и её состав (enrollPlayerIntoTeam), пишет об этом текстовый
// журнал league_roster_additions (journalLeagueAdditions), а владельцам и руководителю
// команды уходит push и окно в Team-Room (notifyTeamAboutLeagueAdditions).
// Представители в обоих режимах — только из штаба команды.

const COMPOSITION_EDITABLE_STATUSES = ['pending', 'approved'];
const POSITIONS = ['goalie', 'defense', 'forward'];

const MANAGED_APP_SQL = `
    SELECT tt.id, tt.team_id, tt.division_id, tt.status, tt.paper_roster_league_url,
           d.name AS division_name, d.digital_applications_only, d.league_managed_roster,
           d.application_start, d.application_end, d.transfer_start, d.transfer_end,
           s.league_id,
           s.name AS season_name,
           l.name AS league_name,
           -- Глобальный параметр лиги (Команды → Лиги у глобального админа): шторка ищет
           -- игроков по всей базе пользователей, а не по игровому составу команды
           l.league_roster_global_search,
           t.name AS team_name,
           -- Как только в дивизионе сыгран хотя бы один матч (любой командой), строку из
           -- заявки больше не удаляем: на неё смотрят протоколы и статистика. Вместо
           -- удаления — отзаявка через period_end.
           EXISTS (SELECT 1 FROM games g WHERE g.division_id = d.id AND g.status = 'finished') AS division_has_games
    FROM tournament_teams tt
    JOIN divisions d ON tt.division_id = d.id
    JOIN seasons s ON d.season_id = s.id
    JOIN leagues l ON l.id = s.league_id
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
//
// isOwner — владелец лиги: его не держат ни сроки (окна кампании и трансферов), ни статус
// заявки, ни отсутствие утверждённого заявочного листа. Единственное, что остаётся в силе, —
// устройство дивизиона: если состав заявки ведёт команда, у лиги там просто нет своих данных
// для правки, и это не запрет, который можно продавить.
const compositionBlockReason = (app, { isOwner = false } = {}) => {
    if (app.digital_applications_only) return 'В цифровом дивизионе состав заявки ведёт команда';
    if (!app.league_managed_roster) return 'В этом дивизионе состав заявки ведёт команда';
    if (isOwner) return null;
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
                   -- Дата рождения нужна значкам экипировки по возрасту («ушк» и «к»)
                   to_char(u.birth_date, 'YYYY-MM-DD') AS birth_date,
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
                   to_char(u.birth_date, 'YYYY-MM-DD') AS birth_date,
                   tr.is_captain, tr.is_assistant, tr.application_status,
                   u.first_name, u.last_name, u.middle_name, u.avatar_url,
                   -- Уже заявленного показываем по снимку из заявки; пока команда не допущена
                   -- (снимка нет) — по живому фото в составе команды
                   COALESCE(tr.photo_snapshot_url, tm.photo_url) AS photo_url
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
                // Режим общей базы: слева вместо игрового состава команды — поиск по всем
                // пользователям платформы (см. searchTournamentTeamRosterCandidates)
                global_search: !!app.league_roster_global_search,
                block_reason: compositionBlockReason(app, { isOwner: await isLeagueOwner(pool, app.league_id, req.user?.id) })
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
 * GET /tournament-teams/:id/roster-candidates?q=
 * Поиск игроков для шторки «Состав заявки» по всей базе пользователей платформы.
 * Работает только в лигах с league_roster_global_search: в обычном режиме кандидаты —
 * это игровой состав команды, и он целиком приходит из roster-pool.
 *
 * Ищем по ФИО: каждое слово запроса должно найтись в фамилии, имени или отчестве.
 * К каждому найденному отдаём его команды (для логотипов с подсказкой) и положение
 * в ЭТОЙ команде: в игровом составе / в команде без состава / не в команде. Последние
 * два при сохранении заявки попадут в команду и её игровой состав автоматически.
 * Тех, кто уже в действующем составе этой заявки, не показываем — они справа.
 */
export const searchTournamentTeamRosterCandidates = async (req, res) => {
    try {
        const { id } = req.params;

        const appRes = await pool.query(MANAGED_APP_SQL, [id]);
        if (appRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Заявка не найдена' });
        }
        const app = appRes.rows[0];
        if (!app.league_roster_global_search) {
            return res.status(400).json({ success: false, error: 'В этой лиге поиск по общей базе пользователей выключен' });
        }

        // Без запроса список не отдаём: общая база — это все пользователи платформы.
        // Слов берём не больше четырёх: фамилия, имя, отчество — больше в ФИО не бывает.
        const words = String(req.query.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 4);
        if (words.join('').length < 2) {
            return res.json({ success: true, data: [] });
        }

        const params = [app.team_id, app.league_id, app.division_id, id];
        const wordConditions = words.map(word => {
            // % и _ внутри ILIKE — маски, а не буквы; экранируем, чтобы «Ив_» не стало шаблоном
            params.push(`%${word.replace(/[\\%_]/g, '\\$&')}%`);
            const n = params.length;
            return `(u.last_name ILIKE $${n} OR u.first_name ILIKE $${n} OR u.middle_name ILIKE $${n})`;
        });

        const { rows } = await pool.query(`
            SELECT u.id AS player_id, u.first_name, u.last_name, u.middle_name,
                   u.avatar_url, u.phone,
                   to_char(u.birth_date, 'YYYY-MM-DD') AS birth_date,
                   -- Фото в составе этой команды есть только у её членов; остальным — аватар
                   tm.photo_url,
                   (tm.id IS NOT NULL) AS in_team,
                   (tr.id IS NOT NULL) AS in_team_roster,
                   tr.position, tr.jersey_number,
                   uq.qualification_id, lq.name AS qualification_name, lq.short_name AS qualification_short_name,
                   user_active_disqualifications(u.id, $2) AS active_disqualifications,
                   -- Все команды человека — логотипами с подсказкой «название, город»
                   COALESCE((
                       SELECT json_agg(json_build_object(
                                  'id', t.id, 'name', t.name, 'city', t.city, 'logo_url', t.logo_url
                              ) ORDER BY t.name)
                       FROM team_members tmx
                       JOIN teams t ON t.id = tmx.team_id
                       WHERE tmx.user_id = u.id AND tmx.left_at IS NULL
                   ), '[]'::json) AS teams,
                   -- Уже заявлен за другую команду этого дивизиона: не запрет, а пометка —
                   -- решение за лигой, как и у резервных вратарей
                   (SELECT json_agg(DISTINCT t.name)
                      FROM tournament_rosters trx
                      JOIN tournament_teams ttx ON ttx.id = trx.tournament_team_id
                      JOIN teams t ON t.id = ttx.team_id
                     WHERE trx.player_id = u.id
                       AND ttx.division_id = $3
                       AND ttx.id <> $4
                       AND trx.period_end IS NULL) AS division_teams
            FROM users u
            LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $1 AND tm.left_at IS NULL
            LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
            LEFT JOIN user_qualifications uq
                   ON uq.user_id = u.id AND uq.league_id = $2 AND uq.ended_at IS NULL
            LEFT JOIN league_qualifications lq ON lq.id = uq.qualification_id
            WHERE u.status <> 'banned'
              AND ${wordConditions.join(' AND ')}
              AND NOT EXISTS (
                  SELECT 1 FROM tournament_rosters trc
                  WHERE trc.tournament_team_id = $4 AND trc.player_id = u.id AND trc.period_end IS NULL
              )
            ORDER BY u.last_name, u.first_name, u.middle_name
            LIMIT 25
        `, params);

        // Та же подсказка о квалификации, что и у игрового состава в roster-pool
        const qualRules = await loadDivisionQualificationRules(pool, app.division_id);
        const allowedQualIds = new Set((qualRules?.allowed || []).map(q => q.id));
        const data = rows.map(person => {
            if (!qualRules?.enabled) return { ...person, qual_block_reason: null };
            const isAllowed = person.qualification_id
                ? allowedQualIds.has(person.qualification_id)
                : qualRules.allowsNone;
            return {
                ...person,
                qual_block_reason: isAllowed ? null : `${person.qualification_name || 'Квалификации нет'} — не допускается`
            };
        });

        res.json({ success: true, data });
    } catch (err) {
        console.error('Ошибка поиска игроков по общей базе для заявки:', err);
        res.status(500).json({ success: false, error: 'Ошибка поиска' });
    }
};

/**
 * Лига вводит человека в команду и её игровой состав (режим league_roster_global_search).
 * Членство создаётся или переоткрывается, команда в клубе тянет его и в базу клуба.
 * Номер в игровом составе — первый свободный (1..99); амплуа — то, что лига поставила
 * в заявке. Уже состоящему в игровом составе сюда попадать незачем: вызывающий код
 * зовёт хелпер только для тех, кого в составе нет.
 */
const enrollPlayerIntoTeam = async (client, teamId, userId, position) => {
    const tmRes = await client.query(
        'SELECT id, left_at FROM team_members WHERE team_id = $1 AND user_id = $2',
        [teamId, userId]
    );
    let memberId;
    if (tmRes.rows.length === 0) {
        const ins = await client.query(
            'INSERT INTO team_members (team_id, user_id, joined_at) VALUES ($1, $2, CURRENT_DATE) RETURNING id',
            [teamId, userId]
        );
        memberId = ins.rows[0].id;
    } else {
        memberId = tmRes.rows[0].id;
        if (tmRes.rows[0].left_at !== null) {
            await client.query(
                'UPDATE team_members SET left_at = NULL, joined_at = CURRENT_DATE WHERE id = $1',
                [memberId]
            );
        }
    }
    await syncClubMembershipOnTeamJoin(teamId, userId, client);

    // Первый свободный номер среди действующих строк игрового состава. Все 99 заняты —
    // случай невозможный на практике, но тогда номер останется пустым, а не упадёт запрос.
    const numRes = await client.query(`
        SELECT g.n
        FROM generate_series(1, 99) AS g(n)
        WHERE NOT EXISTS (
            SELECT 1 FROM team_rosters tr
            WHERE tr.team_id = $1 AND tr.left_at IS NULL AND tr.jersey_number = g.n
        )
        ORDER BY g.n
        LIMIT 1
    `, [teamId]);
    const jerseyNumber = numRes.rows[0]?.n ?? null;

    const teamRes = await client.query('SELECT club_id FROM teams WHERE id = $1', [teamId]);
    const clubId = teamRes.rows[0]?.club_id || null;

    // Строка ростера уникальна по членству: у ранее выведенного из состава она осталась
    // с датой в left_at — переоткрываем её, а не заводим вторую
    await client.query(`
        INSERT INTO team_rosters (club_id, team_id, member_id, position, jersey_number, joined_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (member_id) DO UPDATE
        SET left_at = NULL, club_id = EXCLUDED.club_id, team_id = EXCLUDED.team_id,
            position = EXCLUDED.position, jersey_number = EXCLUDED.jersey_number,
            is_captain = false, is_assistant = false, joined_at = NOW()
    `, [clubId, teamId, memberId, position, jerseyNumber]);

    return { memberId, jerseyNumber };
};

/**
 * Журнал league_roster_additions: кого лига ввела в команду из LMS, кто это сделал и
 * когда. Только для тех, кого в игровом составе команды не было, — обычное внесение
 * в заявку сюда не пишется. Нигде не показывается, нужен, чтобы потом найти концы.
 *
 * Всё текстом, без ссылок на id: уведомления (league_roster_notices) уходят вместе
 * с заявкой, аккаунты удаляются, команды переименовываются — а журнал должен читаться
 * и через год. Телефоны — потому что это логин: по ФИО тёзок не различить.
 */
const journalLeagueAdditions = async (client, app, playerIds, addedBy) => {
    const playersRes = await client.query(
        `SELECT id, last_name, first_name, middle_name, phone
           FROM users WHERE id = ANY($1::int[])
          ORDER BY last_name, first_name`,
        [playerIds]
    );
    const staffRes = addedBy
        ? await client.query('SELECT last_name, first_name, middle_name, phone FROM users WHERE id = $1', [addedBy])
        : { rows: [] };
    const staff = staffRes.rows[0] || null;
    const person = (u) => [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(' ').trim();

    for (const player of playersRes.rows) {
        await client.query(`
            INSERT INTO league_roster_additions
                (league_name, season_name, division_name, team_name,
                 player_name, player_phone, added_by_name, added_by_phone)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            app.league_name, app.season_name, app.division_name, app.team_name,
            person(player), player.phone || null,
            staff ? person(staff) : null, staff?.phone || null
        ]);
    }
};

/**
 * Команда должна узнать, что лига ввела к ней людей без её участия. Два канала:
 *  - push владельцам и руководителю команды — через очередь scheduled_notifications,
 *    которую разбирает Team-Room (у LMS своего web-push нет, а ключи VAPID — у TR);
 *  - окно при первом заходе в Team-Room (league_roster_notices) — с подробностями,
 *    кто, кого и в какую заявку добавил. Строка на каждого получателя: у владельца и
 *    руководителя окно показывается независимо.
 * Всё внутри транзакции сохранения: если состав откатился, уведомлять не о чем.
 */
const notifyTeamAboutLeagueAdditions = async (client, app, playerIds, addedBy) => {
    const recipientsRes = await client.query(`
        SELECT DISTINCT user_id FROM (
            SELECT tow.user_id FROM team_owners tow WHERE tow.team_id = $1
            UNION
            SELECT tm.user_id
            FROM team_roles trole
            JOIN team_members tm ON tm.id = trole.member_id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL
              AND trole.left_at IS NULL AND trole.role = 'team_manager'
        ) r
    `, [app.team_id]);
    if (recipientsRes.rows.length === 0) return;

    const namesRes = await client.query(
        `SELECT last_name, first_name FROM users WHERE id = ANY($1::int[]) ORDER BY last_name, first_name`,
        [playerIds]
    );
    const names = namesRes.rows.map(u => `${u.last_name || ''} ${u.first_name || ''}`.trim());
    // В push длинный список не лезет: три фамилии, остальных — числом
    const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` и ещё ${names.length - 3}` : '');
    const payload = JSON.stringify({
        title: names.length === 1 ? 'Новый игрок от лиги' : 'Новые игроки от лиги',
        body: names.length === 1
            ? `В вашу команду «${app.team_name}» администрация лиги добавила игрока ${shown}`
            : `В вашу команду «${app.team_name}» администрация лиги добавила игроков: ${shown}`,
        url: '/my-team',
        tag: `league-roster-${app.id}-${Date.now()}`
    });

    for (const { user_id } of recipientsRes.rows) {
        await client.query(`
            INSERT INTO scheduled_notifications (type, target_user_id, team_id, send_at, payload)
            VALUES ('league_player_added', $1, $2, NOW(), $3)
        `, [user_id, app.team_id, payload]);
        await client.query(`
            INSERT INTO league_roster_notices (recipient_user_id, tournament_team_id, player_ids, added_by)
            VALUES ($1, $2, $3::int[], $4)
        `, [user_id, app.id, playerIds, addedBy || null]);
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

        const blockReason = compositionBlockReason(app, { isOwner: await isLeagueOwner(pool, app.league_id, req.user?.id) });
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
        // Кого лига только что ввела в игровой состав команды — о них команде сообщаем
        const joinedTeamIds = [];
        if (strangers.length > 0) {
            if (!app.league_roster_global_search) {
                const err = new Error('В заявку можно внести только игроков из игрового состава команды');
                err.status = 400;
                throw err;
            }

            // Режим общей базы: человека вне игрового состава лига добавляет в команду сама.
            // Заблокированный аккаунт в команду не попадёт — вход ему всё равно закрыт.
            const strangerIds = strangers.map(p => p.player_id);
            const usersRes = await client.query(
                `SELECT id FROM users WHERE id = ANY($1::int[]) AND status <> 'banned'`,
                [strangerIds]
            );
            if (usersRes.rows.length !== strangerIds.length) {
                const err = new Error('Пользователь не найден или заблокирован');
                err.status = 400;
                throw err;
            }

            // Допуск по квалификации отдельно не проверяем: ниже он проверяется для всех,
            // кто попадает в заявку, а отказ откатывает транзакцию вместе с членством.
            for (const player of strangers) {
                const position = player.position || 'forward';
                await enrollPlayerIntoTeam(client, app.team_id, player.player_id, position);
                teamPositions.set(player.player_id, position);
                joinedTeamIds.push(player.player_id);
            }
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
                    -- Возврат в заявку — снова недопущенный, поэтому старый слепок фото гасим
                    photo_snapshot_prev_url = tr.photo_snapshot_url,
                    photo_snapshot_url = NULL,
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

        // Играющий тренер: если у человека в этой заявке уже стоит допуск по одной сущности,
        // вторая, только что добавленная, подтягивается к нему (см. alignPersonAdmission)
        await alignPersonAdmission(client, id);

        // Введённые в команду люди: запись в журнал (найти концы), затем команде — push
        // и окно в Team-Room
        if (joinedTeamIds.length > 0) {
            await journalLeagueAdditions(client, app, joinedTeamIds, req.user?.id);
            await notifyTeamAboutLeagueAdditions(client, app, joinedTeamIds, req.user?.id);
        }

        await client.query('COMMIT');
        res.json({ success: true, added: addedIds.length, removed: removedIds.length, joined_team: joinedTeamIds.length });
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

// ============================================================================
// ВЫГРУЗКА ЗАЯВОЧНОГО ЛИСТА (EXCEL)
// ============================================================================
// Официальный заявочный лист команды в дивизион — файл, который лига печатает и
// подписывает. Оформление повторяет образец лиги («ОБР.xlsx») один в один: шрифты,
// размеры, ширины колонок, высоты строк, объединения, параметры печати. Внутри —
// только допущенные: игроки с application_status = 'approved' и не отзаявленные,
// представители с тумблером допуска. Кого лига не допустила, того в листе нет.

const APP_EXPORT_POSITION = { goalie: 'ВР', defense: 'ЗЩ', forward: 'НАП' };
const APP_EXPORT_ROLES = [
    { role: 'team_manager', label: 'Руководитель команды (подписант)' },
    { role: 'team_admin', label: 'Администратор команды (помощник руководителя/тренера)' },
    { role: 'coach', label: 'Тренер команды' },
];

// +79630688109 -> «8 (963) 068-81-09», как в образце
const formatAppExportPhone = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length !== 11) return phone || '';
    return `8 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
};

// Дата в Excel — число дней, и ExcelJS считает его от UTC-полуночи: собираем дату
// через Date.UTC, иначе часовой пояс контейнера сдвинет день рождения на сутки
const excelDate = (iso) => {
    if (!iso) return null;
    const [y, m, d] = String(iso).split('-').map(Number);
    return y && m && d ? new Date(Date.UTC(y, m - 1, d)) : null;
};

// Документы: все обязательные на месте — «✓», не все — дробью «в порядке / обязательных»
// (1/2, 0/3) мелким шрифтом. В порядке — документ есть и не просрочен; обязательные —
// по настройкам дивизиона. Дивизион без требований — «-».
const docsMark = (row, app, today) => {
    const ok = (url, expires) => !!url && (!expires || String(expires) >= today);
    const checks = [];
    if (app.req_med_cert) checks.push(ok(row.medical_url, row.medical_expires_at));
    if (app.req_insurance) checks.push(ok(row.insurance_url, row.insurance_expires_at));
    if (app.req_consent) checks.push(ok(row.consent_url, row.consent_expires_at));
    if (checks.length === 0) return { text: '-', small: false };
    const okCount = checks.filter(Boolean).length;
    if (okCount === checks.length) return { text: '✓', small: false };
    return { text: `${okCount}/${checks.length}`, small: true };
};

// Имя листа Excel: не длиннее 31 символа и без запрещённых знаков
const sheetTitle = (name) => (String(name || 'ЗАЯВКА').toUpperCase().replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31)) || 'ЗАЯВКА';

export const exportTournamentTeamApplication = async (req, res) => {
    try {
        const { id } = req.params;

        const appRes = await pool.query(`
            SELECT tt.id, t.name AS team_name,
                   d.name AS division_name, d.req_med_cert, d.req_insurance, d.req_consent,
                   s.name AS season_name, s.league_id
            FROM tournament_teams tt
            JOIN teams t ON t.id = tt.team_id
            JOIN divisions d ON d.id = tt.division_id
            JOIN seasons s ON s.id = d.season_id
            WHERE tt.id = $1
        `, [id]);
        if (appRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Заявка не найдена' });
        }
        const app = appRes.rows[0];

        // Порядок как в заявочном листе: вратари, защитники, нападающие; внутри — по алфавиту
        const { rows: players } = await pool.query(`
            SELECT tr.jersey_number, tr.position,
                   u.last_name, u.first_name, u.middle_name, u.height, u.weight,
                   to_char(u.birth_date, 'YYYY-MM-DD') AS birth_date,
                   tpd.medical_url, to_char(tpd.medical_expires_at, 'YYYY-MM-DD') AS medical_expires_at,
                   tpd.insurance_url, to_char(tpd.insurance_expires_at, 'YYYY-MM-DD') AS insurance_expires_at,
                   ulc.consent_url, to_char(ulc.consent_expires_at, 'YYYY-MM-DD') AS consent_expires_at,
                   lq.name AS qualification_name
            FROM tournament_rosters tr
            JOIN users u ON u.id = tr.player_id
            LEFT JOIN tournament_person_docs tpd
                   ON tpd.tournament_team_id = tr.tournament_team_id AND tpd.user_id = tr.player_id
            LEFT JOIN user_league_consents ulc
                   ON ulc.user_id = tr.player_id AND ulc.league_id = $2
            LEFT JOIN user_qualifications uq
                   ON uq.user_id = u.id AND uq.league_id = $2 AND uq.ended_at IS NULL
            LEFT JOIN league_qualifications lq ON lq.id = uq.qualification_id
            WHERE tr.tournament_team_id = $1
              AND tr.period_end IS NULL
              AND tr.application_status = 'approved'
            ORDER BY CASE tr.position WHEN 'goalie' THEN 1 WHEN 'defense' THEN 2 ELSE 3 END,
                     u.last_name, u.first_name, u.middle_name
        `, [id, app.league_id]);

        // Представители — только допущенные (tournament_staff_admission), по строке на роль
        const { rows: staff } = await pool.query(`
            SELECT ttr.tournament_role, u.last_name, u.first_name, u.middle_name, u.phone,
                   to_char(u.birth_date, 'YYYY-MM-DD') AS birth_date
            FROM tournament_team_roles ttr
            JOIN users u ON u.id = ttr.user_id
            JOIN tournament_staff_admission tsa
                 ON tsa.tournament_team_id = ttr.tournament_team_id AND tsa.user_id = ttr.user_id AND tsa.is_admitted
            WHERE ttr.tournament_team_id = $1 AND ttr.left_at IS NULL
            ORDER BY u.last_name, u.first_name
        `, [id]);

        const today = new Date().toISOString().slice(0, 10);
        const fullName = (p) => [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ');

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'HockeyEco';
        workbook.created = new Date();
        const sheet = workbook.addWorksheet(sheetTitle(app.division_name), {
            pageSetup: {
                paperSize: 9, orientation: 'landscape',
                margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
            },
            views: [{ zoomScale: 160 }],
        });
        sheet.columns = [
            { width: 8.71 }, { width: 8.71 }, { width: 8.71 }, { width: 40.71 },
            { width: 15.71 }, { width: 12.71 }, { width: 12.71 }, { width: 13.71 }, { width: 20.71 },
        ];

        const thin = { style: 'thin' };
        const box = { top: thin, left: thin, bottom: thin, right: thin };
        const font = (bold = false) => ({ name: 'Calibri', size: 12, bold });
        const center = { horizontal: 'center', vertical: 'middle' };
        const centerTop = { horizontal: 'center', vertical: 'top' };
        const leftTop = { horizontal: 'left', vertical: 'top' };

        // Строка 1: шапка листа. Название соревнования лига вписывает руками — так и в
        // образце. Заглушку красим жёлтым, чтобы её не забыли: фон у части ячейки Excel
        // не умеет, поэтому жёлтый — цвет шрифта этого фрагмента (rich text).
        const title = sheet.addRow(['']);
        sheet.mergeCells('A1:I1');
        title.height = 50.1;
        title.getCell(1).value = {
            richText: [
                { font: font(true), text: `ЗАЯВОЧНЫЙ ЛИСТ КОМАНДЫ ${String(app.team_name).toUpperCase()} ПРИНИМАЮЩЕЙ УЧАСТИЕ В ` },
                { font: { ...font(true), color: { argb: 'FFFFFF00' } }, text: '[ЗАПОЛНЯЕТСЯ ВРУЧНУЮ ЛИГОЙ]' },
                { font: font(true), text: `, СЕЗОН ${app.season_name}, ДИВИЗИОН ${String(app.division_name).toUpperCase()}` },
            ],
        };
        title.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        // Строка 2: заголовки таблицы игроков
        const head = sheet.addRow(['№п', '№м', 'Амплуа', 'ФИО полностью', 'Д/р полная', 'Рост', 'Вес', 'Док-ты', 'Квалификация']);
        head.height = 20.45;
        head.eachCell({ includeEmpty: true }, (cell, col) => {
            cell.font = font(true);
            cell.border = box;
            cell.alignment = col === 2 ? center : (col >= 8 ? { ...centerTop, wrapText: true } : centerTop);
        });

        // Игроки. Чего нет — прочерк, пустых клеток в листе не оставляем
        players.forEach((p, idx) => {
            const docs = docsMark(p, app, today);
            const row = sheet.addRow([
                idx + 1,
                p.jersey_number ?? '-',
                APP_EXPORT_POSITION[p.position] || '-',
                fullName(p) || '-',
                excelDate(p.birth_date) || '-',
                p.height ?? '-',
                p.weight ?? '-',
                docs.text,
                p.qualification_name || '-',
            ]);
            row.height = 15.75;
            row.eachCell({ includeEmpty: true }, (cell, col) => {
                // Дробь по документам — мелко, чтобы не спорила с галочками
                cell.font = col === 8 && docs.small ? { ...font(), size: 9 } : font();
                cell.border = box;
                cell.alignment = col === 4 ? leftTop : center;
                if (col === 5) cell.numFmt = 'mm-dd-yy';
                if (col === 6 || col === 7) cell.numFmt = '0';
            });
        });

        // Полоса «ДОПУСК» — место для визы лиги. Ровно 113 подчёркиваний: столько
        // влезает в ширину листа, 121 из образца уже не помещались
        const admit = sheet.addRow([`    ДОПУСК${'_'.repeat(113)}`]);
        admit.height = 15.75;
        sheet.mergeCells(`A${admit.number}:I${admit.number}`);
        admit.getCell(1).font = font(true);
        admit.getCell(1).alignment = { horizontal: 'center' };
        admit.eachCell({ includeEmpty: true }, cell => { cell.border = box; });

        // Заголовки блока представителей: колонка даты в образце без подписи
        const staffHead = sheet.addRow(['Занимаемая должность в команде', '', '', '', 'ФИО полностью', '', '', '', '№ телефона']);
        staffHead.height = 15.75;
        sheet.mergeCells(`A${staffHead.number}:D${staffHead.number}`);
        sheet.mergeCells(`E${staffHead.number}:G${staffHead.number}`);
        staffHead.eachCell({ includeEmpty: true }, (cell, col) => {
            cell.font = font(true);
            cell.border = box;
            // Пустая ячейка над датой в образце без горизонтального выравнивания
            cell.alignment = col === 8 ? { vertical: 'top' } : centerTop;
        });

        // Представители: строка на каждого допущенного, роли в порядке образца. Роль без
        // людей всё равно печатается — пустой строкой, чтобы вписать от руки
        APP_EXPORT_ROLES.forEach(({ role, label }) => {
            const people = staff.filter(s => s.tournament_role === role);
            const lines = people.length > 0 ? people : [null];
            lines.forEach(person => {
                const row = sheet.addRow([
                    label, '', '', '',
                    (person && fullName(person)) || '-', '', '',
                    (person && excelDate(person.birth_date)) || '-',
                    (person && formatAppExportPhone(person.phone)) || '-',
                ]);
                row.height = 15.75;
                sheet.mergeCells(`A${row.number}:D${row.number}`);
                sheet.mergeCells(`E${row.number}:G${row.number}`);
                row.eachCell({ includeEmpty: true }, (cell, col) => {
                    cell.font = font();
                    cell.border = box;
                    cell.alignment = col <= 7 ? leftTop : center;
                    if (col === 8) cell.numFmt = 'mm-dd-yy';
                });
            });
        });

        sheet.pageSetup.printArea = `A1:I${sheet.rowCount}`;

        const buffer = await workbook.xlsx.writeBuffer();
        const fileName = `Заявка - ${app.team_name} - ${app.division_name} - ${app.season_name}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="application.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error('Ошибка выгрузки заявочного листа:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

