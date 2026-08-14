// LMS-Backend/utils/gameEditWindow.js
//
// Временное окно управления матчем: за sec_access_before_hours до начала и
// sec_access_after_hours после (настройка лиги, по умолчанию 12 и 3 часа).
//
// Это проверка «КОГДА», она не заменяет requirePermission — та отвечает на «КТО».
// Безусловный пропуск только у глобального админа, руководителя лиги и админа лиги.
// Все остальные — судейская бригада матча, сервисные аккаунты, штат лиги — работают
// внутри окна.
//
// Фронт делает ту же проверку в checkMatchEditAccess (LMS-Frontend/src/hooks/useAccess.js)
// и прячет элементы управления. Здесь она продублирована всерьёз: без неё окно
// закрывало бы только интерфейс, а запросы к API проходили бы в любое время.
import pool from '../config/db.js';

/**
 * Возвращает null, если правка матча сейчас разрешена, иначе — текст причины отказа.
 * clientOrPool позволяет вызывать проверку внутри уже открытой транзакции.
 */
export const checkGameEditAccess = async (clientOrPool, gameId, userId) => {
    if (!userId) return null;

    const userRes = await clientOrPool.query('SELECT global_role FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return null;
    // Было 'GLOBAL_ADMIN' — реальное значение в БД 'admin' (см. ROLES.GLOBAL_ADMIN
    // в utils/permissions.js), сравнение никогда не срабатывало.
    if (userRes.rows[0].global_role === 'admin') return null;

    const gameRes = await clientOrPool.query(`
        SELECT g.game_date, g.division_id, s.league_id, l.sec_access_before_hours, l.sec_access_after_hours
        FROM games g
        LEFT JOIN divisions d ON g.division_id = d.id
        LEFT JOIN seasons s ON d.season_id = s.id
        LEFT JOIN leagues l ON s.league_id = l.id
        WHERE g.id = $1
    `, [gameId]);

    if (gameRes.rows.length === 0) return 'Матч не найден';
    const game = gameRes.rows[0];

    // Матчи вне лиг (division_id IS NULL — товарищеские/внешние турниры, которые
    // команды создают сами в Team-Room) — доступ и правки только у глобального
    // админа (см. проверку выше). Игровой/лиговый персонал сюда не допускается
    // вообще, даже если каким-то образом попал в game_staff.
    if (!game.division_id) return 'Доступ разрешён только глобальному администратору';

    // Окно не действует только на руководство лиги — оно правит матчи и задним числом.
    // Раньше сюда попадала ЛЮБАЯ запись в league_staff, то есть судья лиги и медиа тоже
    // обходили окно. Прав на запись у них нет, и дыра не эксплуатировалась, но стоило
    // выдать медиа хоть одно право по матчу — оно оказалось бы без окна само собой.
    if (game.league_id) {
        const staffRes = await clientOrPool.query(`
            SELECT 1 FROM league_staff
            WHERE user_id = $1 AND league_id = $2 AND end_date IS NULL
              AND role IN ('top_manager', 'league_admin')
        `, [userId, game.league_id]);
        if (staffRes.rows.length > 0) return null;
    }

    // Всем остальным — окно. Кто именно это может быть, решает requirePermission;
    // здесь важно лишь то, что безусловного пропуска ни у кого больше нет.
    if (!game.game_date) return 'Доступ закрыт: дата и время матча не назначены.';

    const beforeLimitHours = game.sec_access_before_hours ?? 12;
    const afterLimitHours = game.sec_access_after_hours ?? 3;

    const now = new Date();
    const gameDate = new Date(game.game_date);
    const beforeLimit = new Date(gameDate.getTime() - (beforeLimitHours * 60 * 60 * 1000));
    const afterLimit = new Date(gameDate.getTime() + (afterLimitHours * 60 * 60 * 1000));

    if (now < beforeLimit) return `Управление матчем откроется за ${beforeLimitHours} ч. до начала.`;
    if (now > afterLimit) return `Время управления матчем истекло (${afterLimitHours} ч. после начала).`;

    return null;
};

/**
 * Та же проверка в виде middleware — для маршрутов, которые пишут в матч.
 * Ставится ПОСЛЕ requirePermission: сперва «кто», потом «когда».
 */
export const requireGameEditWindow = async (req, res, next) => {
    try {
        const gameId = req.params.gameId || req.body?.gameId;
        if (!gameId) {
            return res.status(400).json({ success: false, error: 'Не указан матч' });
        }

        const accessError = await checkGameEditAccess(pool, gameId, req.user?.id);
        if (accessError) {
            return res.status(403).json({ success: false, error: accessError });
        }

        next();
    } catch (err) {
        console.error('[Окно управления матчем]:', err);
        res.status(500).json({ success: false, error: 'Ошибка проверки доступа к матчу' });
    }
};
