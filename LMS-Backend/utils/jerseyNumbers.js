/**
 * Номер игрока в заявке на дивизион.
 *
 * Правило одно для всех путей: у действующих игроков заявки (не отзаявленных) номера не
 * повторяются — какой бы у них ни был допуск. Сама база ловит повтор только среди
 * допущенных (idx_tournament_rosters_uniq_number: period_end IS NULL и application_status =
 * 'approved'), поэтому игрок «на проверке» раньше вставал в заявку с чужим номером без
 * единой ошибки, а падал уже допуск — общей ошибкой сервера. Теперь номер проверяется при
 * внесении игрока, возврате, правке номера и трансфере, а допуск отказывает с понятной
 * причиной. Зеркало для Team-Room — TR-Backend/utils/jerseyNumbers.js.
 */

const personName = (row) => `${row.last_name || ''} ${row.first_name || ''}`.trim();

const jerseyError = (message) => {
    const err = new Error(message);
    err.status = 400;
    return err;
};

/**
 * entries — кого вносят, возвращают или кому меняют номер: [{ player_id, jersey_number }].
 * Номер не должен повторяться между ними и не должен быть у другого действующего игрока
 * заявки. Свои нынешние строки этих игроков не в счёт — они как раз и меняются.
 * db — pool или клиент транзакции.
 */
export const assertJerseyNumbersFree = async (db, appId, entries) => {
    // Один человек, пришедший дважды, — это не «несколько игроков»: берём последнюю запись
    const byPlayer = new Map(entries.map(e => [Number(e.player_id), e.jersey_number]));
    const byNumber = new Map();
    for (const [playerId, raw] of byPlayer) {
        if (raw === null || raw === undefined || raw === '') continue;
        const number = Number(raw);
        if (byNumber.has(number)) throw jerseyError(`Номер ${number} назначен нескольким игрокам`);
        byNumber.set(number, playerId);
    }
    if (byNumber.size === 0) return;

    const { rows } = await db.query(`
        SELECT tr.jersey_number, u.last_name, u.first_name
          FROM tournament_rosters tr
          JOIN users u ON u.id = tr.player_id
         WHERE tr.tournament_team_id = $1
           AND tr.period_end IS NULL
           AND tr.jersey_number = ANY($2::int[])
           AND NOT (tr.player_id = ANY($3::int[]))
         ORDER BY tr.jersey_number
         LIMIT 1
    `, [appId, [...byNumber.keys()], [...byPlayer.keys()]]);
    if (rows.length > 0) {
        throw jerseyError(`Номер ${rows[0].jersey_number} в заявке уже у игрока ${personName(rows[0])}. Смените номер одному из них.`);
    }
};

/**
 * Допуск: номер допускаемого игрока не должен быть у другого допущенного игрока той же
 * заявки — иначе база откажет, а лиге нужна причина, а не ошибка сервера. У игрока без
 * номера или без действующей строки состава (допускают только представителя) проверять
 * нечего.
 */
export const assertApprovalNumberFree = async (db, appId, playerId) => {
    const { rows } = await db.query(`
        SELECT me.jersey_number, u.last_name, u.first_name
          FROM tournament_rosters me
          JOIN tournament_rosters other
            ON other.tournament_team_id = me.tournament_team_id
           AND other.jersey_number = me.jersey_number
           AND other.player_id <> me.player_id
           AND other.period_end IS NULL
           AND other.application_status = 'approved'
          JOIN users u ON u.id = other.player_id
         WHERE me.tournament_team_id = $1 AND me.player_id = $2 AND me.period_end IS NULL
         LIMIT 1
    `, [appId, playerId]);
    if (rows.length > 0) {
        throw jerseyError(`Нельзя допустить: номер ${rows[0].jersey_number} в заявке уже у допущенного игрока ${personName(rows[0])}. Смените номер одному из них.`);
    }
};
