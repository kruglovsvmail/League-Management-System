/**
 * Допуск человека в заявке — одной точкой на игрока и на представителя.
 *
 * Допуск принадлежит ЧЕЛОВЕКУ в заявке, а не его строке. У игрока строка одна
 * (tournament_rosters), и флаг исторически лежит прямо в ней — application_status.
 * У представителя строк столько, сколько у него ролей: tournament_team_roles уникальна
 * по тройке заявка+человек+роль. Поэтому его допуск живёт отдельно, в
 * tournament_staff_admission с ключом «заявка + человек» — там же, где по той же
 * причине лежат документы (tournament_person_docs).
 *
 * ДВЕ ЗАПИСИ, ОДНО СОСТОЯНИЕ. Играющий тренер заявлен и игроком, и представителем, и
 * документы у него общие. Допустить его играть, но не допустить подписать протокол —
 * бессмыслица: лига проверяет одни и те же бумаги и одного и того же человека. Поэтому
 * обе записи меняются вместе и разъехаться не могут: 'approved' у игрока ⟺ is_admitted
 * у представителя. Отсюда и правило — менять допуск только через эту функцию. Оба
 * тумблера в интерфейсе (в составе и в штабе) приходят сюда, поэтому какой из них
 * щёлкнули, роли не играет.
 *
 * ФОТО-СЛЕПОК снимается и гасится здесь же, потому что делать это должен именно тот,
 * кто меняет допуск. Он есть только у игрока: представитель на льду не появляется, и
 * подменять его фото незачем. Механика прежняя — в момент допуска ссылка на фото
 * фиксируется в заявке, при снятии уезжает в photo_snapshot_prev_url, и лига снова
 * видит живое фото команды.
 */
import pool from '../config/db.js';
import { logPersonEvent, logPersonEvents } from './personLog.js';

/**
 * Ставит допуск человеку в заявке разом в обеих таблицах.
 *
 * status — то же значение, что раньше принимал эндпоинт игрока: 'approved' допускает,
 * любое другое ('declined' от тумблера, 'pending' от автосброса) снимает. Строка
 * представителю заводится лениво, по первому щелчку, и только если он реально в штабе:
 * у игрока без ролей ей взяться неоткуда и не из чего.
 *
 * actorId — кто щёлкнул тумблер: уходит в журнал (utils/personLog.js) той же транзакцией.
 */
export const setPersonAdmission = async (appId, userId, status, { actorId = null } = {}) => {
    const admitted = status === 'approved';
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (admitted) {
            await client.query(`
                UPDATE tournament_rosters tr
                   SET application_status = $3,
                       photo_snapshot_prev_url = tr.photo_snapshot_url,
                       photo_snapshot_url = (
                           SELECT tm.photo_url
                             FROM team_members tm
                             JOIN tournament_teams tt ON tt.team_id = tm.team_id
                            WHERE tt.id = $1 AND tm.user_id = $2 AND tm.left_at IS NULL
                            ORDER BY tm.id DESC
                            LIMIT 1
                       ),
                       updated_at = NOW()
                 WHERE tr.tournament_team_id = $1 AND tr.player_id = $2 AND tr.period_end IS NULL
            `, [appId, userId, status]);
        } else {
            await client.query(`
                UPDATE tournament_rosters
                   SET application_status = $3,
                       photo_snapshot_prev_url = photo_snapshot_url,
                       photo_snapshot_url = NULL,
                       updated_at = NOW()
                 WHERE tournament_team_id = $1 AND player_id = $2 AND period_end IS NULL
            `, [appId, userId, status]);
        }

        await client.query(`
            INSERT INTO tournament_staff_admission (tournament_team_id, user_id, is_admitted)
            SELECT $1, $2, $3
             WHERE EXISTS (
                 SELECT 1 FROM tournament_team_roles
                  WHERE tournament_team_id = $1 AND user_id = $2 AND left_at IS NULL
             )
            ON CONFLICT ON CONSTRAINT tournament_staff_admission_unique
            DO UPDATE SET is_admitted = EXCLUDED.is_admitted, updated_at = NOW()
        `, [appId, userId, admitted]);

        // Одна запись на человека, а не на таблицу: допуск у него один
        await logPersonEvent(client, {
            appId, userId,
            action: admitted ? 'admission_on' : 'admission_off',
            actorId,
        });

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Выравнивание допуска, когда у человека в заявке появилась ВТОРАЯ сущность.
 *
 * Тумблеры держат обе записи вместе, но стартовое расхождение возникало само: допустили
 * игрока — потом лига внесла его в штаб, а строки допуска представителя нет, и он «не
 * допущен»; допустили представителя — потом внесли в состав, а новая строка игрока
 * заводится «на проверке». Эта функция после любого изменения состава заявки со стороны
 * ЛИГИ подтягивает отстающую запись к уже стоящему допуску: лига сама добавила человека,
 * перепроверять ей нечего. Со стороны команды (Team-Room) наоборот — добавление второй
 * сущности сбрасывает допуск обеим, как и любая правка команды.
 *
 * Вызывать внутри той же транзакции, что и запись состава. Идемпотентна.
 *
 * actorId — кто сохранял состав: в журнал событие уходит с пометкой auto, чтобы в истории
 * было видно, что допуск подтянулся сам, а не тумблером.
 */
export const alignPersonAdmission = async (client, appId, { actorId = null } = {}) => {
    // Игрок, который как представитель уже допущен, — допускаем и строку состава,
    // со слепком фото, как при ручном допуске
    const alignedPlayers = await client.query(`
        UPDATE tournament_rosters tr
           SET application_status = 'approved',
               photo_snapshot_prev_url = tr.photo_snapshot_url,
               photo_snapshot_url = (
                   SELECT tm.photo_url
                     FROM team_members tm
                     JOIN tournament_teams tt ON tt.team_id = tm.team_id
                    WHERE tt.id = $1::int AND tm.user_id = tr.player_id AND tm.left_at IS NULL
                    ORDER BY tm.id DESC
                    LIMIT 1
               ),
               updated_at = NOW()
         WHERE tr.tournament_team_id = $1::int
           AND tr.period_end IS NULL
           AND tr.application_status IS DISTINCT FROM 'approved'
           AND EXISTS (
               SELECT 1 FROM tournament_staff_admission tsa
                WHERE tsa.tournament_team_id = $1::int AND tsa.user_id = tr.player_id AND tsa.is_admitted
           )
           AND EXISTS (
               SELECT 1 FROM tournament_team_roles ttr
                WHERE ttr.tournament_team_id = $1::int AND ttr.user_id = tr.player_id AND ttr.left_at IS NULL
           )
        RETURNING tr.player_id AS user_id
    `, [appId]);

    // Представитель, который как игрок уже допущен, — заводим или включаем его строку допуска.
    // $1 в списке выборки встречается раньше, чем в WHERE, и без явного ::int Postgres не
    // выводит его тип («inconsistent types deduced for parameter $1»)
    const alignedStaff = await client.query(`
        INSERT INTO tournament_staff_admission (tournament_team_id, user_id, is_admitted)
        SELECT DISTINCT $1::int, ttr.user_id, true
          FROM tournament_team_roles ttr
          JOIN tournament_rosters tr
            ON tr.tournament_team_id = ttr.tournament_team_id
           AND tr.player_id = ttr.user_id
           AND tr.period_end IS NULL
           AND tr.application_status = 'approved'
         WHERE ttr.tournament_team_id = $1::int AND ttr.left_at IS NULL
        ON CONFLICT ON CONSTRAINT tournament_staff_admission_unique
        DO UPDATE SET is_admitted = true, updated_at = NOW()
        WHERE tournament_staff_admission.is_admitted = false
        RETURNING user_id
    `, [appId]);

    // RETURNING отдаёт только реально изменённые строки (пропущенные условием WHERE в
    // DO UPDATE сюда не попадают), поэтому в журнал уходят лишь те, кому допуск подтянули
    const userIds = [...new Set([...alignedPlayers.rows, ...alignedStaff.rows].map(r => r.user_id))];
    await logPersonEvents(client, userIds.map(userId => ({
        appId, userId, action: 'admission_on', details: { auto: 'align' }, actorId,
    })));
};

