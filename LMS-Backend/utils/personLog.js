/**
 * Журнал изменений по человеку в заявке (tournament_person_log).
 *
 * Строка состава хранит только «когда» (updated_at) и молчит про «что» и «кто». Журнал
 * отвечает на оба вопроса: одна запись — одно действие над человеком в конкретной заявке.
 * Ключ тот же, что у документов и допуска представителя, — пара «заявка + человек»,
 * а не строка состава: у представителя строки состава нет, а документы у играющего
 * тренера общие на обе роли. Запись переживает и удаление строки состава.
 *
 * Пишет приложение, а не триггер в базе: только здесь известно, кто нажал (actor_id) и
 * откуда (source). Ту же таблицу пишет Team-Room (TR-Backend/utils/personLog.js) и
 * функция tfh_sign_consent в базе — за подписание согласий на сайте ТФХ.
 *
 * Читает только LMS: «Обновлено» в составе дивизиона — это последняя запись журнала,
 * а окно истории — весь список по человеку. Команде журнал не показывается.
 *
 * Коды действий (action) и что лежит в details:
 *   added / returned / removed / deleted — внесён / возвращён / отзаявлен / удалён из заявки
 *   admission_on / admission_off       — тумблер допуска лигой; { auto: 'align' } — подтянут
 *                                        автоматически ко второй сущности человека
 *   admission_reset                    — допуск снят автоматически после правки команды,
 *                                        { reason: 'card'|'docs'|'consent'|'staff'|'added' }
 *   fee_on / fee_off                   — взнос
 *   card                               — амплуа / номер / К / А: { поле: [было, стало] }
 *   doc                                — документ: { type: 'medical'|'insurance'|'consent',
 *                                        file: true — новый файл, expires_at, cleared: true, bulk: true }
 *   transfer_in / transfer_out / transfer_revert — принятый трансфер и его откат, { request_id }
 *   qualification                      — { from, to, reason } (короткие имена квалификаций)
 *   staff_added / staff_removed        — роли представителя: { roles: [...] } — только изменившиеся
 */

const INSERT_SQL = `
    INSERT INTO tournament_person_log (tournament_team_id, user_id, action, details, actor_id, source)
    SELECT x.tournament_team_id, x.user_id, x.action, x.details, x.actor_id, x.source
      FROM jsonb_to_recordset($1::jsonb)
        AS x(tournament_team_id int, user_id int, action text, details jsonb, actor_id int, source text)
`;

/**
 * Несколько записей одним INSERT. Пустой список — ничего не делает, чтобы вызывающий код
 * не проверял длину сам. db — pool или client транзакции: журнал пишется той же
 * транзакцией, что и само изменение, и откатывается вместе с ним.
 */
export const logPersonEvents = async (db, events) => {
    const rows = (events || [])
        .filter(e => e && e.appId && e.userId && e.action)
        .map(e => ({
            tournament_team_id: Number(e.appId),
            user_id: Number(e.userId),
            action: e.action,
            details: e.details ?? null,
            actor_id: e.actorId ?? null,
            source: e.source || 'lms',
        }));
    if (rows.length === 0) return;
    await db.query(INSERT_SQL, [JSON.stringify(rows)]);
};

export const logPersonEvent = (db, event) => logPersonEvents(db, [event]);

// Поля карточки игрока, изменения которых попадают в событие card
export const CARD_FIELDS = ['position', 'jersey_number', 'is_captain', 'is_assistant'];

/**
 * Разница карточки «было → стало» по полям CARD_FIELDS. null — ничего не изменилось,
 * и событие писать не за что. Поле, которого в after нет (undefined), не присылали —
 * оно не менялось. Значения приводятся к одному виду, иначе '17' и 17 или '' и null
 * считались бы разными.
 */
export const cardDiff = (before, after) => {
    const norm = (field, value) => {
        if (value === undefined || value === null || value === '') return null;
        if (field === 'jersey_number') return Number(value);
        if (field === 'is_captain' || field === 'is_assistant') return !!value;
        return value;
    };
    const diff = {};
    for (const field of CARD_FIELDS) {
        if (after?.[field] === undefined) continue;
        const prev = norm(field, before?.[field]);
        const next = norm(field, after[field]);
        if (prev !== next) diff[field] = [prev, next];
    }
    return Object.keys(diff).length > 0 ? diff : null;
};
