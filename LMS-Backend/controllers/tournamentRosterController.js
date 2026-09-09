import pool from '../config/db.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';

const DOCS_BUCKET = 'hockeyeco-uploads';

// Типы документов, которые бывают общими на команду: одна бумага со списком игроков внутри.
// Тем же словом названы колонки в tournament_rosters (medical_url / medical_expires_at).
// Согласия тут нет намеренно: его подписывает каждый лично, общего согласия не бывает.
const BULK_DOC_TYPES = ['medical', 'insurance'];

const DOC_TYPES = ['medical', 'insurance', 'consent'];

// Ключ файла документа: пара «заявка + человек». Так же он устроен и в Team-Room.
const personDocKey = (appId, userId, type) => `uploads/tournament_person_${appId}_${userId}_${type}`;

// Ключ файлов, загруженных до переезда документов на человека: они лежат от строки ростера.
const legacyDocKey = (type) => new RegExp(`^uploads/tournament_rosters_\\d+_${type}`);

// Прежний файл документа в S3 после замены или очистки. Вызывать строго ПОСЛЕ успешной
// записи в БД: иначе сбой на UPDATE оставил бы заявку со ссылкой на уже удалённый файл.
const deleteReplacedDoc = async (previousUrl, newUrl, appId, userId, type) => {
    const key = (previousUrl || '').replace(/^\//, '');
    if (!key || `/${key}` === newUrl) return;

    // Трогаем только файлы этого же слота документа — своего формата ключа или старого,
    // от строки ростера. Ссылка на что-то постороннее удаляться не должна.
    const isOwn = key.startsWith(personDocKey(appId, userId, type)) || legacyDocKey(type).test(key);
    if (!isOwn) return;

    await s3
        .send(new DeleteObjectCommand({ Bucket: DOCS_BUCKET, Key: key }))
        .catch((err) => console.error(`Не удалось удалить прежний файл (${type}):`, err.message));
};

// Человек должен быть в этой заявке — игроком или представителем.
const assertPersonInApplication = async (appId, userId) => {
    const { rowCount } = await pool.query(`
        SELECT 1 FROM tournament_rosters
         WHERE tournament_team_id = $1 AND player_id = $2 AND period_end IS NULL
        UNION ALL
        SELECT 1 FROM tournament_team_roles
         WHERE tournament_team_id = $1 AND user_id = $2 AND left_at IS NULL
         LIMIT 1
    `, [appId, userId]);
    return rowCount > 0;
};

export const updateTournamentRosterStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { application_status } = req.body;

        await pool.query(
            `UPDATE tournament_rosters SET application_status = $1, updated_at = NOW() WHERE id = $2`,
            [application_status, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка смены статуса ростера:', err);
        res.status(500).json({ success: false, error: 'Ошибка смены статуса' });
    }
};

// Квалификация больше не хранится в заявке: она принадлежит паре «человек + лига»
// (user_qualifications) и меняется через PUT /leagues/:leagueId/users/:userId/qualification
// в qualificationController.

export const updateTournamentRosterFee = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_fee_paid } = req.body;
        
        await pool.query(
            'UPDATE tournament_rosters SET is_fee_paid = $1, updated_at = NOW() WHERE id = $2', 
            [is_fee_paid, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка сохранения статуса взноса:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения статуса взноса' });
    }
};

// POST /tournament-teams/:id/person-docs/:userId (multipart: insurance?, medical?, consent?)
//
// Документы допуска лежат на паре «заявка + человек» (tournament_person_docs), а не на
// строке состава: представитель команды может быть заявлен и игроком, и справка у него
// одна на обе роли. Поэтому эндпоинт адресуется человеком, а не строкой ростера.
export const uploadTournamentRosterDocs = async (req, res) => {
    try {
        const { id: appId, userId } = req.params;
        const {
            insurance_cleared, medical_cleared, consent_cleared,
            insurance_expires_at, medical_expires_at, consent_expires_at
        } = req.body;

        if (!(await assertPersonInApplication(appId, userId))) {
            return res.status(404).json({ success: false, error: 'Этот человек не заявлен в составе или штабе заявки' });
        }

        // Ссылки на текущие файлы читаем до записи: после UPDATE узнать, что лежало
        // раньше, уже неоткуда, а старые объекты надо убрать из бакета.
        const previousRes = await pool.query(
            `SELECT insurance_url, medical_url, consent_url FROM tournament_person_docs
              WHERE tournament_team_id = $1 AND user_id = $2`,
            [appId, userId]
        );
        const previous = previousRes.rows[0] || {};

        const cleared = { insurance: insurance_cleared, medical: medical_cleared, consent: consent_cleared };
        const expires = { insurance: insurance_expires_at, medical: medical_expires_at, consent: consent_expires_at };

        const files = req.files || {};
        const urls = {};
        const patch = {};

        for (const type of DOC_TYPES) {
            if (cleared[type] === 'true') {
                urls[type] = null;
            } else if (files[type] && files[type].length > 0) {
                const file = files[type][0];
                const ext = file.originalname.split('.').pop();
                const s3Key = `${personDocKey(appId, userId, type)}.${ext}`;
                await s3.send(new PutObjectCommand({
                    Bucket: DOCS_BUCKET,
                    Key: s3Key,
                    Body: file.buffer,
                    ContentType: file.mimetype
                }));
                urls[type] = `/${s3Key}`;
            }

            if (urls[type] !== undefined) patch[`${type}_url`] = urls[type];
            if (expires[type] !== undefined) patch[`${type}_expires_at`] = expires[type] || null;
        }

        const columns = Object.keys(patch);
        if (columns.length > 0) {
            const insertCols = ['tournament_team_id', 'user_id', ...columns];
            const values = [appId, userId, ...columns.map(c => patch[c])];
            const placeholders = values.map((_, i) => `$${i + 1}`);
            const updates = columns.map(c => `${c} = EXCLUDED.${c}`);

            await pool.query(`
                INSERT INTO tournament_person_docs (${insertCols.join(', ')})
                VALUES (${placeholders.join(', ')})
                ON CONFLICT ON CONSTRAINT tournament_person_docs_unique
                DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()
            `, values);

            for (const type of DOC_TYPES) {
                if (urls[type] !== undefined) {
                    await deleteReplacedDoc(previous[`${type}_url`], urls[type], appId, userId, type);
                }
            }
        }

        res.json({ success: true, insurance_url: urls.insurance, medical_url: urls.medical, consent_url: urls.consent });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения файлов' });
    }
};

export const updateTournamentRosterInline = async (req, res) => {
    try {
        const { id } = req.params;
        const { position, jersey_number, is_captain, is_assistant } = req.body;
        
        const updates = [];
        const values = [];
        let counter = 1;

        if (position !== undefined) { updates.push(`position = $${counter++}`); values.push(position); }
        if (jersey_number !== undefined) { updates.push(`jersey_number = $${counter++}`); values.push(jersey_number !== '' ? jersey_number : null); }
        if (is_captain !== undefined) { updates.push(`is_captain = $${counter++}`); values.push(is_captain); }
        if (is_assistant !== undefined) { updates.push(`is_assistant = $${counter++}`); values.push(is_assistant); }

        if (updates.length > 0) {
            values.push(id);
            await pool.query(`UPDATE tournament_rosters SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${counter}`, values);
            
            // Если игрок стал капитаном, убираем капитанство у остальных в этой же заявке
            if (is_captain === true) {
                await pool.query(`
                    UPDATE tournament_rosters SET is_captain = false 
                    WHERE tournament_team_id = (SELECT tournament_team_id FROM tournament_rosters WHERE id = $1) 
                    AND id != $1
                `, [id]);
            }
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: 'Ошибка сохранения данных игрока' }); }
};

// POST /tournament-teams/:id/roster-docs/bulk (multipart: file, type, expires_at, userIds)
//
// Командный документ — одна бумага со списком игроков внутри (типовой пример: медицинское
// заключение по приложению N2 к приказу Минздрава N 1144н). Отдельной сущности под неё в базе
// нет: файл раскладывается копиями по выбранным строкам состава, и дальше это обычные личные
// документы игроков — со своей плиткой, своим сроком и своим удалением у каждого.
//
// Получателей отмечает лига сама: в списке справки есть не все, а кого-то могли и не допустить.
// В списке и состав, и штаб: документы лежат на человеке, и играющий тренер в бумажной
// справке обычно идёт общей строкой.
export const bulkUploadTournamentRosterDocs = async (req, res) => {
    try {
        const { id } = req.params; // tournament_teams.id — заявка команды в дивизионе
        const { type, expires_at } = req.body;

        if (!BULK_DOC_TYPES.includes(type)) {
            return res.status(400).json({ success: false, error: 'Неизвестный тип документа' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Файл документа не передан' });
        }

        // userIds приходит строкой: запрос multipart, JSON в теле нет
        let userIds;
        try {
            userIds = JSON.parse(req.body.userIds || '[]');
        } catch {
            userIds = [];
        }
        userIds = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number).filter(Number.isInteger))];

        if (userIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Не выбран ни один человек' });
        }

        // Проверяем разом, что все выбранные действительно в этой заявке — игроками или
        // представителями, — и заодно забираем прежние файлы.
        const { rows } = await pool.query(`
            SELECT p.user_id, tpd.${type}_url AS previous_url
              FROM (
                SELECT DISTINCT player_id AS user_id FROM tournament_rosters
                 WHERE tournament_team_id = $1 AND period_end IS NULL
                UNION
                SELECT DISTINCT user_id FROM tournament_team_roles
                 WHERE tournament_team_id = $1 AND left_at IS NULL
              ) p
              LEFT JOIN tournament_person_docs tpd
                     ON tpd.tournament_team_id = $1 AND tpd.user_id = p.user_id
             WHERE p.user_id = ANY($2::int[])
        `, [id, userIds]);

        if (rows.length !== userIds.length) {
            return res.status(400).json({ success: false, error: 'Часть выбранных людей не найдена в этой заявке' });
        }

        // Файл кладём в бакет столько раз, сколько отмечено людей, — по ключу на человека.
        // Копия у каждого своя намеренно: ключи и удаление прежних файлов завязаны на пару
        // «заявка + человек», и одна общая ссылка на всех означала бы, что замена документа
        // у одного уносит файл у всех остальных.
        const ext = req.file.originalname.split('.').pop();
        const targets = rows.map(row => ({
            userId: row.user_id,
            previousUrl: row.previous_url,
            key: `${personDocKey(id, row.user_id, type)}.${ext}`,
        }));

        await Promise.all(targets.map(t => s3.send(new PutObjectCommand({
            Bucket: DOCS_BUCKET,
            Key: t.key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }))));

        await pool.query(`
            INSERT INTO tournament_person_docs (tournament_team_id, user_id, ${type}_url, ${type}_expires_at)
            SELECT $1, v.user_id, v.url, $2
              FROM unnest($3::int[], $4::text[]) AS v(user_id, url)
            ON CONFLICT ON CONSTRAINT tournament_person_docs_unique
            DO UPDATE SET ${type}_url = EXCLUDED.${type}_url,
                          ${type}_expires_at = EXCLUDED.${type}_expires_at,
                          updated_at = NOW()
        `, [id, expires_at || null, targets.map(t => t.userId), targets.map(t => `/${t.key}`)]);

        // Только после успешной записи: сбой на INSERT оставил бы заявку со ссылками на удалённое
        for (const t of targets) {
            await deleteReplacedDoc(t.previousUrl, `/${t.key}`, id, t.userId, type);
        }

        res.json({ success: true, updated: targets.length });
    } catch (err) {
        console.error('Ошибка массовой загрузки документа:', err);
        res.status(500).json({ success: false, error: 'Ошибка массовой загрузки документа' });
    }
};
