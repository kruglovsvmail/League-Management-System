import pool from '../config/db.js';
import s3 from '../config/s3.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import * as xlsx from 'xlsx';
import { syncClubMembershipOnTeamJoin } from '../utils/clubMembership.js';

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
        const { name, short_name, description, city, is_virtual, ui_color, color_home_1, color_home_2, color_away_1, color_away_2, pronunciation } = req.body;
        const result = await pool.query(
            `INSERT INTO teams (name, short_name, description, city, is_virtual, ui_color, color_home_1, color_home_2, color_away_1, color_away_2, pronunciation)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [name, short_name, description, city, is_virtual || false, ui_color || null, color_home_1 || null, color_home_2 || null, color_away_1 || null, color_away_2 || null, pronunciation || null]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export const updateTeam = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, short_name, description, city, is_virtual, ui_color, color_home_1, color_home_2, color_away_1, color_away_2, pronunciation } = req.body;
        await pool.query(
            `UPDATE teams
             SET name = $1, short_name = $2, description = $3, city = $4, is_virtual = $5,
                 ui_color = $6, color_home_1 = $7, color_home_2 = $8, color_away_1 = $9, color_away_2 = $10, pronunciation = $11
             WHERE id = $12`,
            [name, short_name, description, city, is_virtual, ui_color || null, color_home_1 || null, color_home_2 || null, color_away_1 || null, color_away_2 || null, pronunciation || null, id]
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

// Диапазон виртуальных номеров для карточек без реального телефона: +70000000001–+70000000999.
// Префикс "000" намеренно не пересекается ни с одним реальным операторским кодом
// (900/990 и т.п. — настоящие префиксы сотовых операторов, 000 — нет).
const VIRTUAL_PHONE_PREFIX = '+70000000';
const VIRTUAL_PHONE_MAX = 999;

// ── GET /api/registry/users/next-virtual-phone ───────────────────────────
// Возвращает следующий свободный номер в виртуальном диапазоне (для кнопки
// "Подставить номер" в форме создания виртуального пользователя).
export const getNextVirtualPhone = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT MAX(phone) AS last_phone FROM users WHERE phone LIKE $1`,
            [`${VIRTUAL_PHONE_PREFIX}%`]
        );
        const lastSuffix = rows[0].last_phone
            ? parseInt(rows[0].last_phone.slice(VIRTUAL_PHONE_PREFIX.length), 10)
            : 0;
        const nextSuffix = lastSuffix + 1;

        if (nextSuffix > VIRTUAL_PHONE_MAX) {
            return res.status(409).json({
                success: false,
                error: `Виртуальные номера в диапазоне ${VIRTUAL_PHONE_PREFIX}001–${VIRTUAL_PHONE_PREFIX}${VIRTUAL_PHONE_MAX} закончились`,
            });
        }

        const phone = `${VIRTUAL_PHONE_PREFIX}${String(nextSuffix).padStart(3, '0')}`;
        res.json({ success: true, phone });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Кто уже занимает этот номер или почту.
//
// С появлением самостоятельной регистрации в Team Room это стало обычным случаем:
// человек завёл аккаунт сам, а руководитель, не зная об этом, пытается создать ему
// карточку заново. Раньше он получал глухое «номер уже зарегистрирован» и не понимал,
// что делать. Теперь называем, кто это, и объясняем: такого человека надо не создавать,
// а найти в реестре и добавить в команду — иначе появится дубль, а вся статистика
// и история останутся на первой карточке.
const findFieldOwner = async (field, value, excludeId = null) => {
    if (!value) return null;
    const { rows } = await pool.query(
        `SELECT id, first_name, last_name, middle_name, virtual_code IS NULL AS activated
         FROM users
         WHERE ${field === 'email' ? 'LOWER(email) = LOWER($1)' : 'phone = $1'}
           AND ($2::int IS NULL OR id <> $2::int)
         LIMIT 1`,
        [value, excludeId]
    );
    return rows[0] || null;
};

const conflictResponse = (res, label, value, owner) => {
    const name = [owner.last_name, owner.first_name, owner.middle_name].filter(Boolean).join(' ');
    return res.status(400).json({
        success: false,
        error: `${label} ${value} уже занят: ${name}. Не создавайте карточку заново — найдите этого человека в реестре и добавьте в команду, иначе появится дубль, а статистика останется на первой карточке.`,
        existingUser: { id: owner.id, name, activated: owner.activated }
    });
};

export const createUser = async (req, res) => {
    try {
        let { first_name, last_name, middle_name, email, phone, is_virtual, birth_date, gender, height, weight, grip, pronunciation } = req.body;
        let virtual_code = null;

        if (is_virtual) {
            virtual_code = generateVirtualCode();
        }

        // Проверяем занятость ДО вставки: так мы можем назвать, кто занимает номер,
        // а не отдавать безымянную ошибку уникального индекса
        if (phone) {
            const phoneOwner = await findFieldOwner('phone', phone);
            if (phoneOwner) return conflictResponse(res, 'Номер', phone, phoneOwner);
        }
        if (email && email.trim() !== '') {
            const emailOwner = await findFieldOwner('email', email.trim());
            if (emailOwner) return conflictResponse(res, 'Email', email.trim(), emailOwner);
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
            const owner = await findFieldOwner('phone', req.body.phone, Number(req.params.id));
            if (owner) return conflictResponse(res, 'Номер', req.body.phone, owner);
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
        const fileName = `uploads/${entity}_${id}_${type}_${Date.now()}.${ext}`;
        
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
// Файл формы: Фамилия, Имя, Отчество, Дата рождения, Рост, Вес, Телефон, Email,
// Команда, Виртуальный. Порядок колонок роли не играет — строки разбираются по
// заголовкам, английские ключи (first_name, phone, team_id...) тоже принимаются.

// Телефон — это логин, поэтому в базе он строго +7XXXXXXXXXX. В файле же разрешаем
// всё, что похоже на российский номер: 79220005675, +7 (922) 000-56-75, 89220005675,
// 9220005675. Excel часто отдаёт номер числом — String() у 11-значного числа даёт
// цифры без экспоненты. А вот «7,922E+10» текстом — уже потерянные цифры, это ошибка.
const normalizeImportPhone = (raw) => {
    if (raw === null || raw === undefined || String(raw).trim() === '') return { phone: null, error: null };
    const str = typeof raw === 'number' ? String(Math.round(raw)) : String(raw).trim();
    const digits = str.replace(/\D/g, '');
    if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
        return { phone: `+7${digits.slice(1)}`, error: null };
    }
    if (digits.length === 10) {
        return { phone: `+7${digits}`, error: null };
    }
    return { phone: null, error: `Некорректный телефон «${str}» — нужно 11 цифр, например 79220005675` };
};

// Колонка «Команда» — id команды из реестра. Пусто — без привязки.
const parseImportTeamId = (raw) => {
    if (raw === null || raw === undefined || String(raw).trim() === '') return { teamId: null, error: null };
    const str = String(raw).trim();
    const id = Number(str.replace(/\s/g, ''));
    if (!Number.isInteger(id) || id <= 0) {
        return { teamId: null, error: `Некорректный id команды «${str}» — нужно целое число из реестра команд` };
    }
    return { teamId: id, error: null };
};

// Excel хранит дату числом дней с 1900 года, но человек может вписать и текстом
// «25.08.1990» (или через «/», «-», пробел; год из двух цифр — как 20xx).
const parseImportBirthDate = (raw) => {
    if (!raw) return null;
    if (typeof raw === 'number') {
        const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    }
    if (typeof raw === 'string') {
        // Уже ISO (так строки приходят обратно с ревью) — отдаём как есть
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
        const parts = raw.trim().split(/[.,/ -]/);
        if (parts.length === 3) {
            let [day, month, year] = parts;
            if (year.length === 2) year = '20' + year;
            if (year.length === 4) return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
    }
    return null;
};

const parseImportInt = (raw) => {
    if (raw === null || raw === undefined || String(raw).trim() === '') return null;
    const n = parseInt(String(raw).replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
};

// Одна строка файла -> карточка пользователя + ошибки разбора (телефон, команда).
// Общая для предпросмотра и подтверждения: на втором шаге фронт присылает уже
// разобранные строки, но сервер разбирает их заново — доверять клиенту незачем.
const parseImportRow = (row) => {
    const get = (...keys) => {
        for (const key of keys) {
            if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
        }
        return null;
    };

    const errors = [];
    const { phone, error: phoneError } = normalizeImportPhone(get('Телефон', 'phone'));
    if (phoneError) errors.push(phoneError);
    const { teamId, error: teamError } = parseImportTeamId(get('Команда', 'team_id'));
    if (teamError) errors.push(teamError);

    const rawVirtual = get('Виртуальный', 'is_virtual');
    const isVirtual = rawVirtual === true || String(rawVirtual || '').trim().toLowerCase() === 'да';

    const email = get('Email', 'email');

    return {
        first_name: String(get('Имя', 'first_name') || 'БезИмени').trim(),
        last_name: String(get('Фамилия', 'last_name') || 'БезФамилии').trim(),
        middle_name: get('Отчество', 'middle_name') ? String(get('Отчество', 'middle_name')).trim() : null,
        email: email ? String(email).trim() : null,
        phone,
        is_virtual: isVirtual,
        birth_date: parseImportBirthDate(get('Дата рождения', 'birth_date')),
        height: parseImportInt(get('Рост', 'height')),
        weight: parseImportInt(get('Вес', 'weight')),
        team_id: teamId,
        errors,
    };
};

// Ошибки, которые видны только на всём наборе строк: несуществующие команды,
// повторы телефона и email внутри файла. Дописывает errors и team_name прямо в строки.
const validateImportRows = async (db, rows) => {
    const teamIds = [...new Set(rows.map(r => r.team_id).filter(Boolean))];
    const teamNames = new Map();
    if (teamIds.length > 0) {
        const { rows: teams } = await db.query('SELECT id, name FROM teams WHERE id = ANY($1::int[])', [teamIds]);
        teams.forEach(t => teamNames.set(t.id, t.name));
    }

    const phoneRows = new Map();
    const emailRows = new Map();
    rows.forEach((row, idx) => {
        if (row.phone) phoneRows.set(row.phone, [...(phoneRows.get(row.phone) || []), idx]);
        if (row.email) emailRows.set(row.email.toLowerCase(), [...(emailRows.get(row.email.toLowerCase()) || []), idx]);
    });

    // Номер строки в файле: заголовок — первая, данные начинаются со второй
    const fileLine = (idx) => idx + 2;

    rows.forEach((row, idx) => {
        row.team_name = row.team_id ? (teamNames.get(row.team_id) || null) : null;
        if (row.team_id && !teamNames.has(row.team_id)) {
            row.errors.push(`Команда с id ${row.team_id} не найдена в реестре`);
        }
        if (row.phone && phoneRows.get(row.phone).length > 1) {
            const others = phoneRows.get(row.phone).filter(i => i !== idx).map(fileLine);
            row.errors.push(`Телефон ${row.phone} повторяется в файле (строка ${others.join(', ')})`);
        }
        if (row.email && emailRows.get(row.email.toLowerCase()).length > 1) {
            const others = emailRows.get(row.email.toLowerCase()).filter(i => i !== idx).map(fileLine);
            row.errors.push(`Email ${row.email} повторяется в файле (строка ${others.join(', ')})`);
        }
    });
};

// Шаг 1/2 импорта: парсит Excel и подбирает совпадения для каждой строки, НИЧЕГО
// не пишет в базу. Фронт показывает ревью: строки с ошибками разбора блокируют
// импорт целиком (файл надо исправить), строки с уже занятым телефоном пропускаются
// (телефон — уникальный логин, второго такого быть не может), тёзки по ФИ — на
// явное решение Добавить/Пропустить по каждой. Затем финальный список уходит
// в confirmUserImport.
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

        const parsedRows = rows.map(parseImportRow);
        await validateImportRows(pool, parsedRows);

        // Тёзки по Фамилии+Имени — предупреждение, решает админ
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

        // Занятые телефоны и email — это уже не тёзка, а тот же человек (телефон — логин).
        // Такие строки в базу не пойдут, но админу надо видеть, кто это.
        const phones = [...new Set(parsedRows.map(r => r.phone).filter(Boolean))];
        const emails = [...new Set(parsedRows.map(r => r.email && r.email.toLowerCase()).filter(Boolean))];
        const takenByPhone = new Map();
        const takenByEmail = new Map();
        if (phones.length > 0 || emails.length > 0) {
            const { rows: existing } = await pool.query(`
                SELECT u.id, u.first_name, u.last_name, u.middle_name, u.birth_date, u.phone, u.email, u.virtual_code,
                       COALESCE((SELECT json_agg(t.name ORDER BY t.name)
                                   FROM team_members tm JOIN teams t ON t.id = tm.team_id
                                  WHERE tm.user_id = u.id), '[]') AS teams
                FROM users u
                WHERE u.phone = ANY($1::text[]) OR LOWER(u.email) = ANY($2::text[])
            `, [phones, emails]);
            existing.forEach(u => {
                if (u.phone) takenByPhone.set(u.phone, u);
                if (u.email) takenByEmail.set(u.email.toLowerCase(), u);
            });
        }

        const resultRows = parsedRows.map((row, idx) => {
            const phoneMatch = row.phone ? takenByPhone.get(row.phone) || null : null;
            const emailMatch = row.email ? takenByEmail.get(row.email.toLowerCase()) || null : null;
            return {
                ...row,
                matches: matchesByIdx[String(idx)] || [],
                phone_match: phoneMatch,
                // Занятый email при свободном телефоне — это, скорее всего, опечатка в
                // файле, а не тот же человек: блокируем как ошибку строки
                errors: emailMatch && !phoneMatch
                    ? [...row.errors, `Email ${row.email} уже зарегистрирован (${emailMatch.last_name} ${emailMatch.first_name}, ID ${emailMatch.id})`]
                    : row.errors,
            };
        });

        res.json({ success: true, rows: resultRows });
    } catch (err) {
        console.error('Ошибка предпросмотра импорта:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера при разборе файла' });
    }
};

// Шаг 2/2 импорта: принимает отревьюженный на фронте список строк (новые + явно
// подтверждённые тёзки) и вставляет их одной транзакцией. Строки разбираются и
// проверяются заново: телефон снова нормализуется, команды перепроверяются — если
// что-то не сходится, импорт отменяется целиком с указанием строки, как и при
// дубле телефона в базе.
export const confirmUserImport = async (req, res) => {
    const client = await pool.connect();
    try {
        // Клиент отдаётся в пул в finally — освобождать его в ранних return нельзя,
        // повторный release роняет процесс уже после отправки ответа
        const incoming = Array.isArray(req.body?.rows) ? req.body.rows : [];
        if (!incoming.length) {
            return res.status(400).json({ success: false, error: 'Нет строк для импорта' });
        }

        // Строки уже в разобранном виде (ключи first_name, phone, team_id...) — parseImportRow
        // понимает и их. Порядок строк в списке — не порядок в файле (часть отфильтрована
        // на ревью), поэтому в сообщениях называем человека, а не номер строки.
        const rows = incoming.map(parseImportRow);
        await validateImportRows(client, rows);
        const broken = rows.find(r => r.errors.length > 0);
        if (broken) {
            return res.status(400).json({
                success: false,
                error: `${broken.last_name} ${broken.first_name}: ${broken.errors[0]}. Импорт отменён.`
            });
        }

        let importedCount = 0;
        let boundCount = 0;
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
                insertErr._who = `${row.last_name} ${row.first_name}`;
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

            // Колонка «Команда»: только в базу команды (team_members), без игрового состава
            // и штаба — их команда ведёт сама. Команда в клубе тянет человека и в базу клуба.
            if (row.team_id) {
                await client.query(
                    'INSERT INTO team_members (team_id, user_id, joined_at) VALUES ($1, $2, CURRENT_DATE)',
                    [row.team_id, newId]
                );
                await syncClubMembershipOnTeamJoin(row.team_id, newId, client);
                boundCount++;
            }

            importedCount++;
        }

        await client.query('COMMIT');
        const boundNote = boundCount > 0 ? `, привязано к командам: ${boundCount}` : '';
        res.json({ success: true, count: importedCount, message: `Успешно импортировано ${importedCount} пользователей${boundNote}` });

    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        if (err.constraint === 'users_phone_unique') {
            return res.status(400).json({ success: false, error: `${err._who || 'Строка'}: номер телефона ${err._phone || ''} уже зарегистрирован в системе. Импорт отменён.` });
        }
        if (err.constraint === 'users_email_key') {
            return res.status(400).json({ success: false, error: `${err._who || 'Строка'}: email уже зарегистрирован в системе. Импорт отменён.` });
        }
        console.error('Ошибка импорта пользователей:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};
