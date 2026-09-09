import pool from '../config/db.js';

/**
 * Владельцы лиги (league_owners) — уровень выше любого штатного: внутри своей лиги им
 * можно всё. Они проходят и проверку прав (requirePermission), и все временные окна —
 * окно управления матчем, заявочную кампанию, трансферное окно, — и не упираются в
 * статус заявки команды.
 *
 * Границы всевластия — сама лига: права, оставленные глобальному администратору
 * (управление командами, глобальный реестр, матчи вне лиг), владельцу лиги не даются.
 * В матрице PERMISSIONS они помечены пустым списком ролей.
 *
 * Владельцев у лиги сколько угодно, штатной ролью они не являются и в разделе
 * «Персонал» не показываются. Назначает и снимает их только глобальный администратор.
 */

// Сравнение делает Postgres: id прилетает то числом из токена, то строкой из параметров.
export const isLeagueOwner = async (client, leagueId, userId) => {
    if (!leagueId || !userId) return false;
    const { rowCount } = await (client || pool).query(
        'SELECT 1 FROM league_owners WHERE league_id = $1 AND user_id = $2 LIMIT 1',
        [leagueId, userId]
    );
    return rowCount > 0;
};

// Владельцы лиги с карточками пользователей — в порядке назначения.
export const getLeagueOwners = async (client, leagueId) => {
    const { rows } = await (client || pool).query(`
        SELECT u.id AS user_id, u.first_name, u.last_name, u.middle_name, u.phone, u.avatar_url,
               lo.added_at
          FROM league_owners lo
          JOIN users u ON u.id = lo.user_id
         WHERE lo.league_id = $1
         ORDER BY lo.added_at, lo.id
    `, [leagueId]);
    return rows;
};
