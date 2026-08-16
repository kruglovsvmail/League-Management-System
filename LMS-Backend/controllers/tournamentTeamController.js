import pool from '../config/db.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';
import { recalculateDivisionStandings } from '../utils/standingsCalculator.js';
import { assertApplicationRosterAllowed } from '../utils/qualificationAccess.js';

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