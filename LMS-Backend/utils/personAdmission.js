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

/**
 * Ставит допуск человеку в заявке разом в обеих таблицах.
 *
 * status — то же значение, что раньше принимал эндпоинт игрока: 'approved' допускает,
 * любое другое ('declined' от тумблера, 'pending' от автосброса) снимает. Строка
 * представителю заводится лениво, по первому щелчку, и только если он реально в штабе:
 * у игрока без ролей ей взяться неоткуда и не из чего.
 */
export const setPersonAdmission = async (appId, userId, status) => {
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

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};
