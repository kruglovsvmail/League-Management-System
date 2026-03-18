import pool from '../config/db.js';
import s3 from '../config/s3.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

// --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: Генерация 5-значного кода ---
const generateVirtualCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// --- ВСПОМОГАТЕЛЬНАЯ КАРТА ФАЙЛОВ ---
const FILE_MAP = {
    'arenas:logo': ['arenas', 'logo_url'],
    'leagues:logo': ['leagues', 'logo_url'],
    'teams:logo': ['teams', 'logo_url'],
    'teams:jersey_light': ['teams', 'jersey_light_url'],
    'teams:jersey_dark': ['teams', 'jersey_dark_url'],
    'users:avatar': ['users', 'avatar_url']
};

// ==========================================
//                   АРЕНЫ
// ==========================================
export const getArenas = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let query = 'SELECT * FROM arenas WHERE 1=1';
        const params = [];
        let paramIdx = 1;

        if (search) {
            query += ` AND (name ILIKE $${paramIdx} OR city ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }

        query += ` ORDER BY name ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows, hasMore: result.rows.length === limit });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const createArena = async (req, res) => {
    try {
        const { name, city, address, status } = req.body;
        const result = await pool.query(
            'INSERT INTO arenas (name, city, address, status) VALUES ($1, $2, $3, $4) RETURNING id',
            [name, city, address, status || 'active']
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const updateArena = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, city, address, status } = req.body;
        await pool.query(
            'UPDATE arenas SET name = $1, city = $2, address = $3, status = $4 WHERE id = $5',
            [name, city, address, status, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ==========================================
//                   ЛИГИ
// ==========================================
export const getLeagues = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let query = 'SELECT * FROM leagues WHERE 1=1';
        const params = [];
        let paramIdx = 1;

        if (search) {
            query += ` AND (name ILIKE $${paramIdx} OR city ILIKE $${paramIdx} OR short_name ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }

        query += ` ORDER BY name ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows, hasMore: result.rows.length === limit });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const createLeague = async (req, res) => {
    try {
        const { name, short_name, description, city, website } = req.body;
        const result = await pool.query(
            'INSERT INTO leagues (name, short_name, description, city, website, slug) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [name, short_name, description, city, website, `temp-slug-${Date.now()}`] 
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const updateLeague = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, short_name, description, city, website } = req.body;
        await pool.query(
            'UPDATE leagues SET name = $1, short_name = $2, description = $3, city = $4, website = $5 WHERE id = $6',
            [name, short_name, description, city, website, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ==========================================
//                  СЕЗОНЫ
// ==========================================
export const getSeasons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let query = `
            SELECT s.*, l.name as league_name 
            FROM seasons s 
            LEFT JOIN leagues l ON s.league_id = l.id 
            WHERE 1=1
        `;
        const params = [];
        let paramIdx = 1;

        if (search) {
            query += ` AND (s.name ILIKE $${paramIdx} OR l.name ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }

        query += ` ORDER BY s.start_date DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows, hasMore: result.rows.length === limit });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const createSeason = async (req, res) => {
    try {
        const { league_id, name, start_date, end_date, is_active } = req.body;
        const result = await pool.query(
            'INSERT INTO seasons (league_id, name, start_date, end_date, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [league_id, name, start_date || null, end_date || null, is_active || false]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const updateSeason = async (req, res) => {
    try {
        const { id } = req.params;
        const { league_id, name, start_date, end_date, is_active } = req.body;
        await pool.query(
            'UPDATE seasons SET league_id = $1, name = $2, start_date = $3, end_date = $4, is_active = $5 WHERE id = $6',
            [league_id, name, start_date || null, end_date || null, is_active, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ==========================================
//                  КОМАНДЫ
// ==========================================
export const getTeams = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const type = parseInt(req.query.type) || 0; // 0=Все, 1=Реальные, 2=Виртуальные

        let query = 'SELECT * FROM teams WHERE 1=1';
        const params = [];
        let paramIdx = 1;

        if (search) {
            query += ` AND (name ILIKE $${paramIdx} OR city ILIKE $${paramIdx} OR short_name ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }

        if (type === 1) { // Реальные
            query += ` AND is_virtual = false`;
        } else if (type === 2) { // Виртуальные
            query += ` AND is_virtual = true`;
        }

        query += ` ORDER BY name ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows, hasMore: result.rows.length === limit });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const createTeam = async (req, res) => {
    try {
        const { name, short_name, description, city, is_virtual } = req.body;
        const result = await pool.query(
            'INSERT INTO teams (name, short_name, description, city, is_virtual) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, short_name, description, city, is_virtual || false]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const updateTeam = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, short_name, description, city, is_virtual } = req.body;
        await pool.query(
            'UPDATE teams SET name = $1, short_name = $2, description = $3, city = $4, is_virtual = $5 WHERE id = $6',
            [name, short_name, description, city, is_virtual, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ==========================================
//               ПОЛЬЗОВАТЕЛИ
// ==========================================
export const getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const type = parseInt(req.query.type) || 0; // 0=Все, 1=Реальные, 2=Виртуальные

        let query = 'SELECT id, first_name, last_name, middle_name, email, phone, virtual_code, avatar_url, birth_date, gender, height, weight, grip FROM users WHERE 1=1';
        const params = [];
        let paramIdx = 1;

        if (search) {
            query += ` AND (first_name ILIKE $${paramIdx} OR last_name ILIKE $${paramIdx} OR phone ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR virtual_code ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }

        if (type === 1) { // Реальные (нет виртуального кода)
            query += ` AND virtual_code IS NULL`;
        } else if (type === 2) { // Виртуальные (есть код)
            query += ` AND virtual_code IS NOT NULL`;
        }

        query += ` ORDER BY id DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows, hasMore: result.rows.length === limit });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const createUser = async (req, res) => {
    try {
        let { first_name, last_name, middle_name, email, phone, is_virtual, birth_date, gender, height, weight, grip } = req.body;
        let virtual_code = null;

        if (is_virtual) {
            virtual_code = generateVirtualCode();
        }

        let needsEmailUpdate = false;

        if (!email || email.trim() === '') {
            email = `temp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}@users.lms`;
            needsEmailUpdate = true; 
        }

        const result = await pool.query(
            `INSERT INTO users (first_name, last_name, middle_name, email, phone, virtual_code, birth_date, gender, height, weight, grip) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [first_name, last_name, middle_name, email, phone || null, virtual_code, birth_date || null, gender || null, height || null, weight || null, grip || null]
        );
        
        const newId = result.rows[0].id;

        if (needsEmailUpdate) {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const dateStr = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
            
            const finalEmail = `${dateStr}_${newId}@users.lms`;
            await pool.query('UPDATE users SET email = $1 WHERE id = $2', [finalEmail, newId]);
        }

        res.json({ success: true, id: newId });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        let { first_name, last_name, middle_name, email, phone, is_virtual, birth_date, gender, height, weight, grip } = req.body;
        
        const userRes = await pool.query('SELECT virtual_code FROM users WHERE id = $1', [id]);
        let current_code = userRes.rows[0].virtual_code;
        let final_code = current_code;

        if (is_virtual && !current_code) {
            final_code = generateVirtualCode(); 
        } else if (!is_virtual) {
            final_code = null; 
        }

        if (!email || email.trim() === '') {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const dateStr = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
            email = `${dateStr}_${id}@users.lms`;
        }

        await pool.query(
            `UPDATE users SET first_name = $1, last_name = $2, middle_name = $3, email = $4, phone = $5, virtual_code = $6, birth_date = $7, gender = $8, height = $9, weight = $10, grip = $11 
             WHERE id = $12`,
            [first_name, last_name, middle_name, email, phone || null, final_code, birth_date || null, gender || null, height || null, weight || null, grip || null, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ==========================================
//        УПРАВЛЕНИЕ ФАЙЛАМИ (S3)
// ==========================================

export const uploadRegistryFile = async (req, res) => {
    try {
        const { entity, id, type } = req.params; 
        if (!req.file) return res.status(400).json({ success: false, error: 'Файл не найден' });

        const ext = req.file.originalname.split('.').pop();
        const fileName = `uploads/${entity}_${id}_${type}.${ext}`;
        
        await s3.send(new PutObjectCommand({
            Bucket: 'hockeyeco-uploads',
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }));

        const shortUrl = `/${fileName}`;
        const config = FILE_MAP[`${entity}:${type}`];

        if (config) {
            await pool.query(`UPDATE ${config[0]} SET ${config[1]} = $1 WHERE id = $2`, [shortUrl, id]);
        }
        
        res.json({ success: true, url: shortUrl });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const deleteRegistryFile = async (req, res) => {
    try {
        const { entity, id, type } = req.params;
        const config = FILE_MAP[`${entity}:${type}`];
        
        if (config) {
            await pool.query(`UPDATE ${config[0]} SET ${config[1]} = NULL WHERE id = $1`, [id]);
            res.json({ success: true, message: 'Файл успешно сброшен' });
        } else {
            res.status(400).json({ success: false, error: 'Конфигурация не найдена' });
        }
    } catch (err) { 
        console.error('Ошибка удаления файла:', err);
        res.status(500).json({ success: false, error: err.message }); 
    }
};