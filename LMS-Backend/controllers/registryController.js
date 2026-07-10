import pool from '../config/db.js';
import s3 from '../config/s3.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import * as xlsx from 'xlsx';

// --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: Генерация 5-значного кода ---
const generateVirtualCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Поиск существующих пользователей с совпадающей Фамилией+Именем (без учёта
// регистра, без учёта Отчества — намеренно, чтобы не пропустить тёзку без
// заполненного отчества в базе). НЕ блокирует создание — база как позволяла,
// так и позволяет полных тёзок; это только предупреждение для админа.
// candidates: [{ first_name, last_name }] — возвращает плоский список найденных
// совпадений с полем query_idx (0-based), указывающим на индекс в candidates,
// т.к. одно и то же ФИО может встретиться в кандидатах несколько раз (импорт).
const findNameDuplicates = async (clientOrPool, candidates) => {
    if (!candidates.length) return [];
    const firstNames = candidates.map(c => c.first_name || '');
    const lastNames = candidates.map(c => c.last_name || '');

    const { rows } = await clientOrPool.query(`
        SELECT
            (q.idx - 1)::int AS query_idx,
            u.id, u.first_name, u.last_name, u.middle_name,
            u.birth_date, u.phone, u.virtual_code,
            COALESCE(
                (SELECT json_agg(t.name ORDER BY t.name)
                   FROM "public"."team_members" tm
                   JOIN "public"."teams" t ON t.id = tm.team_id
                  WHERE tm.user_id = u.id),
                '[]'
            ) AS teams
        FROM unnest($1::text[], $2::text[]) WITH ORDINALITY AS q(first_name, last_name, idx)
        JOIN "public"."users" u
          ON LOWER(u.first_name) = LOWER(q.first_name)
         AND LOWER(u.last_name)  = LOWER(q.last_name)
        ORDER BY q.idx
    `, [firstNames, lastNames]);

    return rows;
};

// Проверка дублей по ФИ для формы ручного добавления одного пользователя.
// body: { candidates: [{ first_name, last_name }] }
export const checkUserNameDuplicates = async (req, res) => {
    try {
        const candidates = Array.isArray(req.body?.candidates) ? req.body.candidates : [];
        if (!candidates.length) return res.json({ success: true, matches: {} });

        const rows = await findNameDuplicates(pool, candidates.map(c => ({
            first_name: c.first_name || '', last_name: c.last_name || '',
        })));

        const matches = {};
        rows.forEach(r => {
            const key = String(r.query_idx);
            if (!matches[key]) matches[key] = [];
            matches[key].push({
                id: r.id, first_name: r.first_name, last_name: r.last_name, middle_name: r.middle_name,
                birth_date: r.birth_date, phone: r.phone, virtual_code: r.virtual_code, teams: r.teams,
            });
        });

        res.json({ success: true, matches });
    } catch (err) {
        console.error('Ошибка проверки дублей по ФИ:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
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
        const { name, city, address, status, timezone } = req.body;
        const result = await pool.query(
            'INSERT INTO arenas (name, city, address, status, timezone) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, city, address, status || 'active', timezone || 'Europe/Moscow']
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const updateArena = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, city, address, status, timezone } = req.body;
        await pool.query(
            'UPDATE arenas SET name = $1, city = $2, address = $3, status = $4, timezone = $5 WHERE id = $6',
            [name, city, address, status, timezone || 'Europe/Moscow', id]
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
        const { name, short_name, description, city, website, pronunciation } = req.body;
        const result = await pool.query(
            'INSERT INTO leagues (name, short_name, description, city, website, slug, pronunciation) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [name, short_name, description, city, website, `temp-slug-${Date.now()}`, pronunciation || null]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const updateLeague = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, short_name, description, city, website, pronunciation } = req.body;
        await pool.query(
            'UPDATE leagues SET name = $1, short_name = $2, description = $3, city = $4, website = $5, pronunciation = $6 WHERE id = $7',
            [name, short_name, description, city, website, pronunciation || null, id]
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
        const { name, short_name, description, city, is_virtual, color_home_1, color_home_2, color_away_1, color_away_2, pronunciation } = req.body;
        const result = await pool.query(
            `INSERT INTO teams (name, short_name, description, city, is_virtual, color_home_1, color_home_2, color_away_1, color_away_2, pronunciation)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [name, short_name, description, city, is_virtual || false, color_home_1 || null, color_home_2 || null, color_away_1 || null, color_away_2 || null, pronunciation || null]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const updateTeam = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, short_name, description, city, is_virtual, color_home_1, color_home_2, color_away_1, color_away_2, pronunciation } = req.body;
        await pool.query(
            `UPDATE teams
             SET name = $1, short_name = $2, description = $3, city = $4, is_virtual = $5,
                 color_home_1 = $6, color_home_2 = $7, color_away_1 = $8, color_away_2 = $9, pronunciation = $10
             WHERE id = $11`,
            [name, short_name, description, city, is_virtual, color_home_1 || null, color_home_2 || null, color_away_1 || null, color_away_2 || null, pronunciation || null, id]
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

        // current_teams — команды, где пользователь состоит сейчас (left_at IS NULL),
        // с лого/городом для колонки логотипов в таблице реестра
        let query = `SELECT id, first_name, last_name, middle_name, email, phone, virtual_code, avatar_url, birth_date, gender, height, weight, grip, pronunciation,
            (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'city', t.city, 'logo_url', t.logo_url) ORDER BY t.name)
             FROM team_members tm
             JOIN teams t ON t.id = tm.team_id
             WHERE tm.user_id = users.id AND tm.left_at IS NULL) AS current_teams
            FROM users WHERE 1=1`;
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

        // Счётчики (Всего/Реал/Вирт) считаем только на первой странице — учитывают поиск, но не фильтр типа
        let counts = null;
        if (page === 1) {
            let countQuery = `SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE virtual_code IS NULL)::int AS real,
                COUNT(*) FILTER (WHERE virtual_code IS NOT NULL)::int AS virtual
                FROM users WHERE 1=1`;
            const countParams = [];
            if (search) {
                countQuery += ` AND (first_name ILIKE $1 OR last_name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1 OR virtual_code ILIKE $1)`;
                countParams.push(`%${search}%`);
            }
            const countRes = await pool.query(countQuery, countParams);
            counts = countRes.rows[0];
        }

        res.json({ success: true, data: result.rows, hasMore: result.rows.length === limit, counts });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const createUser = async (req, res) => {
    try {
        let { first_name, last_name, middle_name, email, phone, is_virtual, birth_date, gender, height, weight, grip, pronunciation } = req.body;
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
            `INSERT INTO users (first_name, last_name, middle_name, email, phone, virtual_code, birth_date, gender, height, weight, grip, pronunciation)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
            [first_name, last_name, middle_name, email, phone || null, virtual_code, birth_date || null, gender || null, height || null, weight || null, grip || null, pronunciation || null]
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
    } catch (err) {
        if (err.constraint === 'users_phone_unique') {
            return res.status(400).json({ success: false, error: `Номер телефона ${req.body.phone} уже зарегистрирован в системе` });
        }
        if (err.constraint === 'users_email_key') {
            return res.status(400).json({ success: false, error: `Email ${req.body.email} уже зарегистрирован в системе` });
        }
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        let { first_name, last_name, middle_name, email, phone, is_virtual, birth_date, gender, height, weight, grip, pronunciation } = req.body;
        
        const userRes = await pool.query('SELECT virtual_code FROM users WHERE id = $1', [id]);
        let current_code = userRes.rows[0].virtual_code;
        let final_code = current_code;
        let shouldClearCredentials = false;

        // Если переводим РЕАЛЬНОГО пользователя в ВИРТУАЛЬНОГО
        if (is_virtual && !current_code) {
            final_code = generateVirtualCode(); 
            shouldClearCredentials = true; // Ставим флаг на затирку доступов

            // Генерируем новую фейковую почту, чтобы освободить реальный email пользователя
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const dateStr = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
            email = `temp_${dateStr}_${crypto.randomBytes(4).toString('hex')}@users.lms`;
            
        } else if (!is_virtual) {
            final_code = null; 
        }

        // Если почта пустая и это не процесс конвертации (обработанный выше)
        if (!email || email.trim() === '') {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const dateStr = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
            email = `${dateStr}_${id}@users.lms`;
        }

        // Динамическое формирование запроса для затирки пароля и ЭЦП
        let query = `
            UPDATE users
            SET first_name = $1, last_name = $2, middle_name = $3, email = $4, phone = $5, virtual_code = $6, birth_date = $7, gender = $8, height = $9, weight = $10, grip = $11, pronunciation = $12
        `;

        if (shouldClearCredentials) {
            query += `, password_hash = NULL, sign_pin_hash = NULL`;
        }

        query += ` WHERE id = $13`;

        await pool.query(query, [
            first_name,
            last_name,
            middle_name,
            email,
            phone || null,
            final_code,
            birth_date || null,
            gender || null,
            height || null,
            weight || null,
            grip || null,
            pronunciation || null,
            id
        ]);

        res.json({ success: true });
    } catch (err) {
        if (err.constraint === 'users_phone_unique') {
            return res.status(400).json({ success: false, error: `Номер телефона ${req.body.phone} уже зарегистрирован за другим пользователем` });
        }
        if (err.constraint === 'users_email_key') {
            return res.status(400).json({ success: false, error: `Email ${req.body.email} уже зарегистрирован за другим пользователем` });
        }
        res.status(500).json({ success: false, error: err.message });
    }
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

// ==========================================
//               ИМПОРТ ИЗ EXCEL
// ==========================================
// Шаг 1/2 импорта: парсит Excel и подбирает совпадения по ФИ для каждой строки,
// НИЧЕГО не пишет в базу. Фронт показывает ревью (тёзки — на explicit решение
// Добавить/Пропустить по каждой), затем шлёт финальный список в confirmUserImport.
export const previewUserImport = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'Файл не найден' });

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });

        let rawRows = [];
        for (const sheetName of workbook.SheetNames) {
            const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
            if (sheetData && sheetData.length > 0) {
                rawRows = sheetData;
                break;
            }
        }

        if (!rawRows || rawRows.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Excel файл пуст (нет строк с данными).'
            });
        }

        const firstRowKeys = Object.keys(rawRows[0]).map(k => k.toLowerCase().trim());
        const hasValidHeaders = firstRowKeys.some(k =>
            k === 'имя' || k === 'first_name' || k === 'фамилия' || k === 'last_name'
        );

        if (!hasValidHeaders) {
            return res.status(400).json({
                success: false,
                error: 'В первой строке файла не найдены правильные заголовки.'
            });
        }

        const rows = rawRows.map(row => {
            const cleanRow = {};
            for (const key in row) {
                cleanRow[key.trim()] = row[key];
            }
            return cleanRow;
        });

        const parsedRows = rows.map(row => {
            const firstName = row['Имя'] || row['first_name'] || 'БезИмени';
            const lastName = row['Фамилия'] || row['last_name'] || 'БезФамилии';
            const middleName = row['Отчество'] || row['middle_name'] || null;
            let email = row['Email'] || row['email'] || null;
            const phone = row['Телефон'] || row['phone'] || null;
            const isVirtual = String(row['Виртуальный'] || '').toLowerCase() === 'да' || row['is_virtual'] === true;

            const rawBirthDate = row['Дата рождения'] || row['birth_date'] || null;
            let parsedBirthDate = null;

            if (rawBirthDate) {
                if (typeof rawBirthDate === 'number') {
                    const d = new Date(Math.round((rawBirthDate - 25569) * 86400 * 1000));
                    if (!isNaN(d.getTime())) {
                        parsedBirthDate = d.toISOString().split('T')[0];
                    }
                } else if (typeof rawBirthDate === 'string') {
                    const parts = rawBirthDate.split(/[.,/ -]/);
                    if (parts.length === 3) {
                        let [day, month, year] = parts;
                        if (year.length === 2) year = '20' + year;
                        if (year.length === 4) {
                            parsedBirthDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                    }
                }
            }

            const rawHeight = row['Рост'] || row['height'] || null;
            const parsedHeight = rawHeight ? parseInt(String(rawHeight).replace(/\D/g, ''), 10) : null;

            const rawWeight = row['Вес'] || row['weight'] || null;
            const parsedWeight = rawWeight ? parseInt(String(rawWeight).replace(/\D/g, ''), 10) : null;

            return {
                first_name: firstName,
                last_name: lastName,
                middle_name: middleName,
                email: email || null,
                phone: phone ? String(phone) : null,
                is_virtual: isVirtual,
                birth_date: parsedBirthDate,
                height: parsedHeight || null,
                weight: parsedWeight || null,
            };
        });

        const dupRows = await findNameDuplicates(pool, parsedRows.map(r => ({
            first_name: r.first_name, last_name: r.last_name,
        })));
        const matchesByIdx = {};
        dupRows.forEach(r => {
            const key = String(r.query_idx);
            if (!matchesByIdx[key]) matchesByIdx[key] = [];
            matchesByIdx[key].push({
                id: r.id, first_name: r.first_name, last_name: r.last_name, middle_name: r.middle_name,
                birth_date: r.birth_date, phone: r.phone, virtual_code: r.virtual_code, teams: r.teams,
            });
        });

        const resultRows = parsedRows.map((row, idx) => ({
            ...row,
            matches: matchesByIdx[String(idx)] || [],
        }));

        res.json({ success: true, rows: resultRows });
    } catch (err) {
        console.error('Ошибка предпросмотра импорта:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера при разборе файла' });
    }
};

// Шаг 2/2 импорта: принимает уже разобранный и отревьюженный на фронте список
// строк (только те, что реально нужно создать — новые + подтверждённые тёзки)
// и вставляет их одной транзакцией, как раньше делал одношаговый importUsers.
export const confirmUserImport = async (req, res) => {
    const client = await pool.connect();
    try {
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
        if (!rows.length) {
            client.release();
            return res.status(400).json({ success: false, error: 'Нет строк для импорта' });
        }

        let importedCount = 0;
        await client.query('BEGIN');

        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
            const row = rows[rowIdx];
            let email = row.email;
            let needsEmailUpdate = false;

            if (!email || String(email).trim() === '') {
                email = `temp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}@users.lms`;
                needsEmailUpdate = true;
            }

            const virtual_code = row.is_virtual ? generateVirtualCode() : null;

            let result;
            try {
                result = await client.query(
                    `INSERT INTO users (first_name, last_name, middle_name, email, phone, virtual_code, birth_date, height, weight)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                    [row.first_name, row.last_name, row.middle_name || null, email, row.phone || null, virtual_code, row.birth_date || null, row.height || null, row.weight || null]
                );
            } catch (insertErr) {
                insertErr._rowNum = rowIdx;
                insertErr._phone = row.phone || '';
                throw insertErr;
            }

            const newId = result.rows[0].id;

            if (needsEmailUpdate) {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const dateStr = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

                const finalEmail = `${dateStr}_${newId}@users.lms`;
                await client.query('UPDATE users SET email = $1 WHERE id = $2', [finalEmail, newId]);
            }

            importedCount++;
        }

        await client.query('COMMIT');
        res.json({ success: true, count: importedCount, message: `Успешно импортировано ${importedCount} пользователей` });

    } catch (err) {
        await client.query('ROLLBACK');
        if (err.constraint === 'users_phone_unique') {
            return res.status(400).json({ success: false, error: `Строка ${(err._rowNum || 0) + 1}: номер телефона ${err._phone || ''} уже зарегистрирован в системе. Импорт отменён.` });
        }
        if (err.constraint === 'users_email_key') {
            return res.status(400).json({ success: false, error: `Строка ${(err._rowNum || 0) + 1}: email уже зарегистрирован в системе. Импорт отменён.` });
        }
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};