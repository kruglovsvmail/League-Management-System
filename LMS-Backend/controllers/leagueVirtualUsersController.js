// LMS-Backend/controllers/leagueVirtualUsersController.js
//
// Создание виртуального аккаунта владельцем лиги — форма под фильтрами в «Справочнике».
// Работает, только если глобальный администратор включил лиге тумблер
// leagues.allow_owner_virtual_users (Команды → Лиги → Глобальные параметры).
//
// Порядок такой же, как при регистрации в Team-Room: сначала ищем похожих (фамилия +
// имя, фамилия + год рождения) и показываем их, создаём — только после «Такого нет,
// создать». Занятый номер телефона — не похожий, а отказ: телефон — это логин.
//
// Секретный код показывается один раз, в ответе на создание; потом его в «Справочнике»
// не видно (у глобального администратора он есть в реестре). Кто, когда и для какой
// лиги создал аккаунт — в users.created_via / created_by_user_id / created_league_id.
import pool from '../config/db.js';
import { ROLES } from '../utils/permissions.js';
import {
    generateVirtualCode, nextVirtualPhone, VIRTUAL_PHONES_EXHAUSTED_ERROR, tempEmail, technicalEmail
} from '../utils/virtualAccounts.js';
import crypto from 'crypto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Тот же разбор, что у импорта: +7 (922) 000-56-75, 89220005675, 9220005675 → +79220005675
const normalizePhone = (raw) => {
    const str = String(raw ?? '').trim();
    if (!str) return { phone: null };
    const digits = str.replace(/\D/g, '');
    if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return { phone: `+7${digits.slice(1)}` };
    if (digits.length === 10) return { phone: `+7${digits}` };
    return { error: 'Некорректный номер телефона — нужно 10 цифр после +7' };
};

// null — можно, иначе текст отказа
const checkAccess = async (userId, leagueId) => {
    if (!leagueId) return 'Не выбрана лига';
    const { rows } = await pool.query(`
        SELECT u.global_role, l.allow_owner_virtual_users,
               EXISTS (SELECT 1 FROM league_owners lo WHERE lo.league_id = l.id AND lo.user_id = u.id) AS is_owner
          FROM users u CROSS JOIN leagues l
         WHERE u.id = $1 AND l.id = $2
    `, [userId, leagueId]);
    const r = rows[0];
    if (!r) return 'Лига не найдена';
    if (r.global_role !== ROLES.GLOBAL_ADMIN && !r.is_owner) return 'Создавать аккаунты может только владелец лиги';
    if (!r.allow_owner_virtual_users) return 'В этой лиге создание аккаунтов выключено';
    return null;
};

// ФИО и дата рождения обязательны, отчество и телефон — нет
const readForm = (body) => {
    const form = {
        last_name: String(body?.last_name || '').trim(),
        first_name: String(body?.first_name || '').trim(),
        middle_name: String(body?.middle_name || '').trim() || null,
        birth_date: String(body?.birth_date || '').trim(),
    };
    if (!form.last_name || !form.first_name) return { error: 'Укажите фамилию и имя' };
    if (!DATE_RE.test(form.birth_date) || isNaN(new Date(form.birth_date))) return { error: 'Укажите дату рождения' };
    const p = normalizePhone(body?.phone);
    if (p.error) return { error: p.error };
    return { form: { ...form, phone: p.phone } };
};

const fullName = (u) => [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(' ');

// Занятый номер — с именем владельца, как в реестре: человека надо найти и добавить
// в команду, а не заводить второй раз
const findPhoneOwner = async (db, phone) => {
    if (!phone) return null;
    const { rows } = await db.query(
        'SELECT id, first_name, last_name, middle_name FROM users WHERE phone = $1 LIMIT 1', [phone]
    );
    return rows[0] || null;
};
const phoneBusyError = (phone, owner) =>
    `Номер ${phone} уже занят: ${fullName(owner)}. Не создавайте аккаунт заново — найдите этого человека и добавьте в команду.`;

// ── POST /api/handbook/virtual-users/similar ─────────────────────────────
// Похожие аккаунты: совпали фамилия и имя или фамилия и год рождения. Телефоны чужих
// людей владельцу лиги не показываем — только ФИО, дату рождения, команды и статус.
export const findSimilarUsers = async (req, res) => {
    try {
        const leagueId = Number(req.body?.leagueId) || null;
        const denied = await checkAccess(req.user.id, leagueId);
        if (denied) return res.status(403).json({ success: false, error: denied });

        const { form, error } = readForm(req.body);
        if (error) return res.status(400).json({ success: false, error });

        const phoneOwner = await findPhoneOwner(pool, form.phone);
        if (phoneOwner) return res.status(400).json({ success: false, error: phoneBusyError(form.phone, phoneOwner) });

        const { rows } = await pool.query(`
            SELECT u.id, u.first_name, u.last_name, u.middle_name,
                   to_char(u.birth_date, 'YYYY-MM-DD') AS birth_date,
                   (u.virtual_code IS NULL) AS activated,
                   COALESCE((SELECT json_agg(DISTINCT t.name)
                               FROM team_members tm JOIN teams t ON t.id = tm.team_id
                              WHERE tm.user_id = u.id AND tm.left_at IS NULL), '[]') AS teams
              FROM users u
             WHERE u.status = 'active'
               AND u.global_role IS DISTINCT FROM 'service'
               AND LOWER(u.last_name) = LOWER($1)
               AND (LOWER(u.first_name) = LOWER($2)
                    OR EXTRACT(YEAR FROM u.birth_date) = $3)
             ORDER BY u.last_name, u.first_name, u.id
             LIMIT 20
        `, [form.last_name, form.first_name, Number(form.birth_date.slice(0, 4))]);

        res.json({ success: true, similar: rows });
    } catch (err) {
        console.error('Ошибка поиска похожих аккаунтов:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// ── POST /api/handbook/virtual-users ─────────────────────────────────────
// Создаёт виртуальный аккаунт. Без телефона берёт следующий служебный номер; выдача
// номеров идёт под замком, чтобы два одновременных создания не взяли один и тот же.
export const createLeagueVirtualUser = async (req, res) => {
    const leagueId = Number(req.body?.leagueId) || null;
    const denied = await checkAccess(req.user.id, leagueId).catch(() => 'Ошибка сервера');
    if (denied) return res.status(403).json({ success: false, error: denied });

    const { form, error } = readForm(req.body);
    if (error) return res.status(400).json({ success: false, error });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('lms_virtual_phone'))`);

        let phone = form.phone;
        if (phone) {
            const owner = await findPhoneOwner(client, phone);
            if (owner) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, error: phoneBusyError(phone, owner) });
            }
        } else {
            phone = await nextVirtualPhone(client);
            if (!phone) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, error: VIRTUAL_PHONES_EXHAUSTED_ERROR });
            }
        }

        const virtualCode = generateVirtualCode();
        const { rows } = await client.query(`
            INSERT INTO users (first_name, last_name, middle_name, birth_date, phone, email, virtual_code,
                               created_via, created_by_user_id, created_league_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'league', $8, $9)
            RETURNING id
        `, [form.first_name, form.last_name, form.middle_name, form.birth_date, phone,
            tempEmail(crypto.randomBytes(4).toString('hex')), virtualCode, req.user.id, leagueId]);
        const id = rows[0].id;
        await client.query('UPDATE users SET email = $1 WHERE id = $2', [technicalEmail(id), id]);

        await client.query('COMMIT');
        res.json({
            success: true,
            user: { id, full_name: fullName(form), phone, virtual_code: virtualCode },
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        if (err.constraint === 'users_phone_unique') {
            return res.status(400).json({ success: false, error: `Номер ${form.phone || ''} уже занят` });
        }
        console.error('Ошибка создания аккаунта владельцем лиги:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера при создании аккаунта' });
    } finally {
        client.release();
    }
};
