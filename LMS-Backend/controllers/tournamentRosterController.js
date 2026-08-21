import pool from '../config/db.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';

const DOCS_BUCKET = 'hockeyeco-uploads';

// Прежний файл документа в S3 после замены или очистки. Раньше он оставался в бакете
// навсегда: «очистить документ» обнуляло только ссылку в базе, а новый скан ложился
// рядом, если у него другое расширение — или если согласие до этого подписали на сайте
// лиги, где в имя файла добавляется случайный хвост.
//
// Вызывать строго ПОСЛЕ успешной записи в БД: иначе сбой на UPDATE оставил бы заявку
// со ссылкой на уже удалённый файл.
const deleteReplacedDoc = async (previousUrl, newUrl, rosterId, type) => {
    const key = (previousUrl || '').replace(/^\//, '');
    if (!key || `/${key}` === newUrl) return;
    // Трогаем только «свои» файлы этой заявки: в колонке теоретически может оказаться
    // ссылка на что-то постороннее, и удалять её вслепую нельзя.
    if (!key.startsWith(`uploads/tournament_rosters_${rosterId}_${type}`)) return;

    await s3
        .send(new DeleteObjectCommand({ Bucket: DOCS_BUCKET, Key: key }))
        .catch((err) => console.error(`Не удалось удалить прежний файл (${type}):`, err.message));
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

export const uploadTournamentRosterDocs = async (req, res) => {
    try {
        const { id } = req.params; 
        const { 
            player_id, 
            insurance_cleared, medical_cleared, consent_cleared, 
            insurance_expires_at, medical_expires_at, consent_expires_at 
        } = req.body; 
        
        if (!player_id) return res.status(400).json({ success: false, error: 'Не передан player_id' });

        // Ссылки на текущие файлы читаем до записи: после UPDATE узнать, что лежало
        // раньше, уже неоткуда, а старые объекты надо убрать из бакета.
        const previousRes = await pool.query(
            'SELECT insurance_url, medical_url, consent_url FROM tournament_rosters WHERE id = $1',
            [id]
        );
        const previous = previousRes.rows[0] || {};

        let insuranceUrl = undefined;
        let medicalUrl = undefined;
        let consentUrl = undefined;

        const uploadFileToS3 = async (file, type) => {
            const ext = file.originalname.split('.').pop();
            const rawFileName = `tournament_rosters_${id}_${type}.${ext}`;
            const s3Key = `uploads/${rawFileName}`;
            await s3.send(new PutObjectCommand({
                Bucket: DOCS_BUCKET,
                Key: s3Key,
                Body: file.buffer, 
                ContentType: file.mimetype 
            }));
            return `/${s3Key}`;
        };

        const files = req.files || {}; // Защита от undefined

        if (insurance_cleared === 'true') insuranceUrl = null;
        else if (files['insurance'] && files['insurance'].length > 0) insuranceUrl = await uploadFileToS3(files['insurance'][0], 'insurance');

        if (medical_cleared === 'true') medicalUrl = null;
        else if (files['medical'] && files['medical'].length > 0) medicalUrl = await uploadFileToS3(files['medical'][0], 'medical');

        if (consent_cleared === 'true') consentUrl = null;
        else if (files['consent'] && files['consent'].length > 0) consentUrl = await uploadFileToS3(files['consent'][0], 'consent');

        const updates = ['updated_at = NOW()'];
        const values = [];
        let counter = 1;

        if (insuranceUrl !== undefined) { updates.push(`insurance_url = $${counter++}`); values.push(insuranceUrl); }
        if (insurance_expires_at !== undefined) { updates.push(`insurance_expires_at = $${counter++}`); values.push(insurance_expires_at || null); }
        
        if (medicalUrl !== undefined) { updates.push(`medical_url = $${counter++}`); values.push(medicalUrl); }
        if (medical_expires_at !== undefined) { updates.push(`medical_expires_at = $${counter++}`); values.push(medical_expires_at || null); }
        
        if (consentUrl !== undefined) { updates.push(`consent_url = $${counter++}`); values.push(consentUrl); }
        if (consent_expires_at !== undefined) { updates.push(`consent_expires_at = $${counter++}`); values.push(consent_expires_at || null); }

        if (updates.length > 1) {
            values.push(id);
            await pool.query(`UPDATE tournament_rosters SET ${updates.join(', ')} WHERE id = $${counter}`, values);

            if (insuranceUrl !== undefined) await deleteReplacedDoc(previous.insurance_url, insuranceUrl, id, 'insurance');
            if (medicalUrl !== undefined) await deleteReplacedDoc(previous.medical_url, medicalUrl, id, 'medical');
            if (consentUrl !== undefined) await deleteReplacedDoc(previous.consent_url, consentUrl, id, 'consent');
        }
        res.json({ success: true, insurance_url: insuranceUrl, medical_url: medicalUrl, consent_url: consentUrl });
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