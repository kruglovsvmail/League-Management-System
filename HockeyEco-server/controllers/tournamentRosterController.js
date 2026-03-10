import pool from '../config/db.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';

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

export const updateTournamentRosterQualification = async (req, res) => {
    try {
        const { id } = req.params;
        const { qualification_id } = req.body;
        
        await pool.query(
            'UPDATE tournament_rosters SET qualification_id = $1, updated_at = NOW() WHERE id = $2', 
            [qualification_id, id]
        );
        
        // Получаем короткое имя квалификации для обновления бейджа
        let short_name = null;
        if (qualification_id) {
            const q = await pool.query('SELECT short_name FROM league_qualifications WHERE id = $1', [qualification_id]);
            short_name = q.rows[0]?.short_name;
        }
        res.json({ success: true, qualification_short_name: short_name });
    } catch (err) {
        console.error('Ошибка сохранения квалификации:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения квалификации' });
    }
};

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

// СТРОГОЕ ФОРМИРОВАНИЕ ИМЕН И СОХРАНЕНИЕ ДОКУМЕНТОВ И ДАТ
export const uploadTournamentRosterDocs = async (req, res) => {
    try {
        const { id } = req.params; // tournament_rosters.id
        const { player_id, insurance_cleared, medical_cleared, insurance_expires_at, medical_expires_at } = req.body; 
        
        if (!player_id) {
            return res.status(400).json({ success: false, error: 'Не передан player_id' });
        }

        let insuranceUrl = undefined;
        let medicalUrl = undefined;

        // Вспомогательная функция (строгое имя)
        const uploadFileToS3 = async (file, type) => {
            const ext = file.originalname.split('.').pop();
            const rawFileName = `tournament_rosters_${id}_users_${player_id}_${type}.${ext}`;
            const s3Key = `uploads/${rawFileName}`;
            
            await s3.send(new PutObjectCommand({
                Bucket: 'hockeyeco-uploads',
                Key: s3Key,
                Body: file.buffer,
                ContentType: file.mimetype
            }));
            
            return s3Key;
        };

        // 1. Загружаем файлы, если они есть
        if (insurance_cleared === 'true') {
            insuranceUrl = null;
        } else if (req.files['insurance'] && req.files['insurance'].length > 0) {
            insuranceUrl = await uploadFileToS3(req.files['insurance'][0], 'insurance');
        }

        if (medical_cleared === 'true') {
            medicalUrl = null;
        } else if (req.files['medical'] && req.files['medical'].length > 0) {
            medicalUrl = await uploadFileToS3(req.files['medical'][0], 'medical');
        }

        // 2. Формируем единый динамический UPDATE запрос
        const updates = ['updated_at = NOW()'];
        const values = [];
        let counter = 1;

        if (insuranceUrl !== undefined) {
            updates.push(`insurance_url = $${counter++}`);
            values.push(insuranceUrl);
        }
        if (insurance_expires_at !== undefined) {
            updates.push(`insurance_expires_at = $${counter++}`);
            values.push(insurance_expires_at || null); // Если пришла пустая строка, пишем NULL
        }

        if (medicalUrl !== undefined) {
            updates.push(`medical_url = $${counter++}`);
            values.push(medicalUrl);
        }
        if (medical_expires_at !== undefined) {
            updates.push(`medical_expires_at = $${counter++}`);
            values.push(medical_expires_at || null);
        }

        // 3. Сохраняем в БД, если есть что обновлять
        if (updates.length > 1) {
            values.push(id);
            await pool.query(
                `UPDATE tournament_rosters SET ${updates.join(', ')} WHERE id = $${counter}`, 
                values
            );
        }

        res.json({ success: true, insurance_url: insuranceUrl, medical_url: medicalUrl });
    } catch (err) {
        console.error('Ошибка загрузки документов:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения файлов' });
    }
};