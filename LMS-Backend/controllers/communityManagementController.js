import pool from '../config/db.js';

/**
 * Управление сообществами из LMS (глобальный админ).
 *
 * Сообщество — сущность Team-Room: любой пользователь создаёт его сам и проводит
 * события для вступивших — тренировки (категория skating) или солянки (open_game).
 * У сообщества есть владелец (communities.owner_id), штаб (community_roles),
 * участники (community_members), тренировочные группы (community_groups) и
 * информационные блоки (community_info_blocks).
 *
 * Отсюда всё это только читается: настройки, состав и штаб правит владелец у себя
 * в Team-Room. Единственная запись — смена владельца. Она нужна, когда создатель
 * сообщества пропал или потерял аккаунт: в Team-Room это право есть только у самого
 * владельца, и без админа сообщество зависло бы навсегда.
 */

const CATEGORIES = ['skating', 'open_game'];

export const searchCommunities = async (req, res) => {
    try {
        const { q, category } = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const offset = (page - 1) * limit;

        const values = [];
        const conditions = [];

        if (q && q !== 'undefined' && q !== 'null') {
            values.push(`%${q}%`);
            conditions.push(`(c.name ILIKE $${values.length} OR c.city ILIKE $${values.length})`);
        }
        if (category && CATEGORIES.includes(category)) {
            values.push(category);
            conditions.push(`c.category = $${values.length}`);
        }

        const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

        // Счётчики для карточек: участники, штаб и события. У сообщества нет команд
        // и нет визитов в общей базе, по которым клуб показывает активность, — её
        // заменяют ближайшее и последнее событие из обеих таблиц (тренировки + солянки).
        const query = `
            SELECT c.id, c.name, c.category, c.city, c.logo_url, c.color_1, c.color_2,
                (c.owner_id IS NOT NULL) AS has_owner,
                u.first_name AS owner_first_name,
                u.last_name AS owner_last_name,
                (SELECT COUNT(*)::int FROM community_members cm
                 WHERE cm.community_id = c.id AND cm.left_at IS NULL) AS members_count,
                (SELECT COUNT(*)::int FROM community_roles cr
                 WHERE cr.community_id = c.id AND cr.left_at IS NULL) AS staff_count,
                ev.events_count, ev.next_event_at, ev.last_event_at
            FROM communities c
            LEFT JOIN users u ON u.id = c.owner_id
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS events_count,
                       MIN(e.d) FILTER (WHERE e.d >= NOW()) AS next_event_at,
                       MAX(e.d) FILTER (WHERE e.d <  NOW()) AS last_event_at
                FROM (
                    SELECT t.training_date AS d FROM community_training t WHERE t.community_id = c.id
                    UNION ALL
                    SELECT g.game_date AS d FROM community_game g WHERE g.community_id = c.id
                ) AS e
            ) ev ON TRUE
            ${where}
            ORDER BY c.name ASC
            LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

        const [result, countResult] = await Promise.all([
            pool.query(query, [...values, limit, offset]),
            pool.query(`SELECT COUNT(*)::int AS total FROM communities c${where}`, values)
        ]);

        res.json({
            success: true,
            data: result.rows,
            total: countResult.rows[0].total,
            page,
            limit
        });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

/**
 * Сообщество целиком одним запросом: все настройки, владелец, участники, штаб,
 * группы и информационные блоки — так же, как getClubDetails.
 *
 * Участников отдаём и действующих, и ушедших: фронт делит их по left_at.
 * Телефон и дата рождения уходят всегда, несмотря на hide_personal_info — этот
 * флаг скрывает данные от соседей по сообществу, а не от администратора платформы.
 */
export const getCommunityDetails = async (req, res) => {
    try {
        const { communityId } = req.params;

        const communityRes = await pool.query(`
            SELECT id, name, category, logo_url, city, description, color_1, color_2,
                   owner_id, owner_title, calendar_scope, reserve_ladder, created_at,
                   chat_messenger, chat_url,
                   default_cost_mode, default_cost, default_total_cost,
                   default_goalies_free, default_cost_min_participants,
                   default_attendance_deadline_hours,
                   default_max_skaters, default_max_goalies,
                   default_publish_mode, default_publish_hours_before
            FROM communities WHERE id = $1
        `, [communityId]);

        if (communityRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Сообщество не найдено' });
        }

        // is_virtual = у пользователя нет пароля: аккаунт заведён менеджером
        const membersRes = await pool.query(`
            SELECT u.id AS user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url,
                   u.phone, u.birth_date,
                   (u.password_hash IS NULL) AS is_virtual,
                   cm.id AS member_id, cm.position, cm.group_id, cm.joined_at, cm.left_at,
                   cm.hide_personal_info,
                   g.name AS group_name
            FROM community_members cm
            JOIN users u ON u.id = cm.user_id
            LEFT JOIN community_groups g ON g.id = cm.group_id
            WHERE cm.community_id = $1
            ORDER BY u.last_name ASC, u.first_name ASC
        `, [communityId]);

        // Штаб: владелец первой строкой — в community_roles его нет, он живёт
        // в communities.owner_id, поэтому подмешиваем отдельно. Подпись должности
        // у владельца — owner_title, у остальных — community_roles.title.
        const staffRes = await pool.query(`
            SELECT u.id AS user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone,
                   (u.password_hash IS NULL) AS is_virtual,
                   'community_owner' AS role,
                   NULLIF(TRIM(COALESCE(c.owner_title, '')), '') AS title,
                   c.created_at AS since,
                   0 AS sort_rank
            FROM communities c
            JOIN users u ON u.id = c.owner_id
            WHERE c.id = $1

            UNION ALL

            SELECT u.id AS user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, u.phone,
                   (u.password_hash IS NULL) AS is_virtual,
                   cr.role,
                   NULLIF(TRIM(COALESCE(cr.title, '')), '') AS title,
                   cr.created_at AS since,
                   1 AS sort_rank
            FROM community_roles cr
            JOIN users u ON u.id = cr.user_id
            WHERE cr.community_id = $1 AND cr.left_at IS NULL

            ORDER BY sort_rank, last_name, first_name
        `, [communityId]);

        // Тренировочные группы бывают только у категории skating — у солянок список пуст
        const groupsRes = await pool.query(`
            SELECT g.id, g.name, g.description, g.sort_order, g.created_at,
                   (SELECT COUNT(*)::int FROM community_members cm
                    WHERE cm.group_id = g.id AND cm.left_at IS NULL) AS members_count
            FROM community_groups g
            WHERE g.community_id = $1
            ORDER BY g.sort_order, g.name
        `, [communityId]);

        const infoRes = await pool.query(`
            SELECT id, title, content, sort_order
            FROM community_info_blocks
            WHERE community_id = $1
            ORDER BY sort_order, id
        `, [communityId]);

        // Владелец — свойство самого сообщества: в участниках он может не числиться
        const ownerRes = await pool.query(`
            SELECT u.id AS user_id, u.first_name, u.last_name, u.middle_name, u.phone, u.avatar_url,
                   (u.password_hash IS NULL) AS is_virtual
            FROM communities c
            JOIN users u ON u.id = c.owner_id
            WHERE c.id = $1
        `, [communityId]);

        res.json({
            success: true,
            community: communityRes.rows[0],
            owner: ownerRes.rows[0] || null,
            members: membersRes.rows,
            staff: staffRes.rows,
            groups: groupsRes.rows,
            info_blocks: infoRes.rows
        });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

/**
 * Назначение или снятие владельца сообщества (communities.owner_id).
 *
 * Владелец ровно один — колонка перезаписывается. Участником он быть не обязан,
 * как и владелец клуба. Отличие от клуба: у сообщества владелец получает все права
 * сразу, отдельной роли в штабе ему не нужно.
 *
 * Если новый владелец уже стоит в штабе (community_roles), его должность
 * закрываем: Team-Room держит инвариант «владелец строкой в community_roles не
 * дублируется», иначе во вкладке «Штаб» человек появится дважды. Прежний владелец
 * никаких ролей не получает — как и в клубе.
 */
export const setCommunityOwner = async (req, res) => {
    const client = await pool.connect();
    try {
        const { communityId } = req.params;
        const { userId } = req.body;
        const nextOwnerId = (userId === null || userId === undefined || userId === '') ? null : parseInt(userId, 10);

        if (nextOwnerId !== null && Number.isNaN(nextOwnerId)) {
            return res.status(400).json({ success: false, error: 'Некорректный пользователь' });
        }

        const communityRes = await client.query('SELECT id FROM communities WHERE id = $1', [communityId]);
        if (communityRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Сообщество не найдено' });
        }

        // Заблокированный аккаунт владельцем быть не может — он не пройдёт вход в Team-Room
        if (nextOwnerId !== null) {
            const userRes = await client.query(`SELECT id FROM users WHERE id = $1 AND status = 'active'`, [nextOwnerId]);
            if (userRes.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Пользователь не найден или заблокирован' });
            }
        }

        await client.query('BEGIN');

        await client.query('UPDATE communities SET owner_id = $1 WHERE id = $2', [nextOwnerId, communityId]);

        let closedRoles = 0;
        if (nextOwnerId !== null) {
            const closed = await client.query(`
                UPDATE community_roles
                SET left_at = CURRENT_DATE
                WHERE community_id = $1 AND user_id = $2 AND left_at IS NULL
            `, [communityId, nextOwnerId]);
            closedRoles = closed.rowCount;
        }

        await client.query('COMMIT');

        const ownerRes = nextOwnerId === null ? { rows: [] } : await pool.query(`
            SELECT id AS user_id, first_name, last_name, middle_name, phone, avatar_url,
                   (password_hash IS NULL) AS is_virtual
            FROM users WHERE id = $1
        `, [nextOwnerId]);

        res.json({ success: true, owner: ownerRes.rows[0] || null, closedRoles });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};
