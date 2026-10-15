// LMS-Backend/utils/virtualAccounts.js
//
// Общее для всех мест, где LMS создаёт виртуальный аккаунт: реестр глобального
// администратора (форма и импорт Excel) и «Справочник» владельца лиги.

// Секретный код активации — 5 символов в верхнем регистре (авторизация сравнивает
// его без учёта регистра, см. authController).
export const generateVirtualCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Служебные номера для карточек без реального телефона: +7 (000) 000-00-01 …
// +7 (000) 099-99-99, то есть +70000000001–+70000099999. Код «000» не пересекается ни с
// одним реальным операторским (900/990 и т.п. — настоящие префиксы сотовых). До
// 16.10.2026 диапазон был до 999 (префикс '+70000000' и три цифры) — старые номера
// в новый входят как есть. Тот же префикс — в TR-Backend/utils/phone.js.
export const VIRTUAL_PHONE_PREFIX = '+700000';
export const VIRTUAL_PHONE_MAX = 99999;

// Следующий свободный служебный номер или null, если диапазон кончился.
// Номера одной длины, поэтому строковый MAX — это и численный максимум.
export const nextVirtualPhone = async (db) => {
    const { rows } = await db.query(
        `SELECT MAX(phone) AS last_phone FROM users WHERE phone LIKE $1 AND length(phone) = $2`,
        [`${VIRTUAL_PHONE_PREFIX}%`, VIRTUAL_PHONE_PREFIX.length + 5]
    );
    const lastSuffix = rows[0].last_phone
        ? parseInt(rows[0].last_phone.slice(VIRTUAL_PHONE_PREFIX.length), 10)
        : 0;
    const nextSuffix = lastSuffix + 1;
    if (nextSuffix > VIRTUAL_PHONE_MAX) return null;
    return `${VIRTUAL_PHONE_PREFIX}${String(nextSuffix).padStart(5, '0')}`;
};

export const VIRTUAL_PHONES_EXHAUSTED_ERROR = 'Служебные номера +7 (000) 000-00-01 … +7 (000) 099-99-99 закончились';

// Технический адрес для аккаунта без почты: дата создания и id — так видно, когда и
// какая карточка заведена. До вставки id неизвестен, поэтому сначала ставится
// временный уникальный адрес (tempEmail), а после — этот.
export const tempEmail = (random) => `temp_${Date.now()}_${random}@users.lms`;
export const technicalEmail = (id, now = new Date()) => {
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    return `${dateStr}_${id}@users.lms`;
};
