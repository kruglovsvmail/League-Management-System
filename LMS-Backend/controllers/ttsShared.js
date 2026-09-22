/**
 * Общие текстовые утилиты для обоих TTS-контроллеров.
 * Голоса, скорости и аудио-обработка — в каждом контроллере отдельно.
 */

import petrovich from 'petrovich';

// ── Склонение номеров в порядковые (до 99) ──────────────────────────────────

export function numberToWords(n) {
    const num = parseInt(n, 10);
    if (isNaN(num) || num < 0) return '';

    const ones = ['', 'первый', 'второй', 'третий', 'четвёртый', 'пятый', 'шестой', 'седьмой', 'восьмой', 'девятый'];
    const teens = ['десятый', 'одиннадцатый', 'двенадцатый', 'тринадцатый', 'четырнадцатый', 'пятнадцатый', 'шестнадцатый', 'семнадцатый', 'восемнадцатый', 'девятнадцатый'];
    const tens = ['', '', 'двадцатый', 'тридцатый', 'сороковой', 'пятидесятый', 'шестидесятый', 'семидесятый', 'восьмидесятый', 'девяностый'];
    const tensPrefix = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];

    if (num === 0) return 'нулевой';
    if (num < 10) return ones[num];
    if (num >= 10 && num < 20) return teens[num - 10];

    const t = Math.floor(num / 10);
    const o = num % 10;

    if (o === 0) return tens[t];
    return `${tensPrefix[t]} ${ones[o]}`;
}

// ── Склонение ФИО через petrovich ────────────────────────────────────────────

// order='last-first' (по умолчанию, используется панелью трансляции) или 'first-last' (диктор арены).
export function declineName(lastName, firstName, caseName, order = 'last-first') {
    try {
        const result = petrovich({ last: lastName, first: firstName, gender: 'male' }, caseName);
        return order === 'first-last' ? `${result.first} ${result.last}` : `${result.last} ${result.first}`;
    } catch (e) {
        return order === 'first-last' ? `${firstName} ${lastName}` : `${lastName} ${firstName}`;
    }
}

// ── Причина штрафа для озвучки ───────────────────────────────────────────────
// Берётся ТОЛЬКО из справочника лиги (penalty_types.tts_accusative). Если лига падеж
// не заполнила — причину не произносим вовсе: фраза строится без неё.
// Подбирать форму самим нельзя: наименование в именительном падеже посреди фразы
// «наказан за ...» звучит безграмотно («за подножка»), а угадать падеж по любой
// формулировке лиги невозможно.

export function penaltyReasonAccusative(accusative) {
    const value = String(accusative || '').trim();
    return value || null;
}

// ── Формулировка тяжести штрафа («малым штрафом» / «двойным малым штрафом» и т.д.) ──
// penalty_kind — вид штрафа целиком (2+10, 5+20 …, см. utils/penaltyGroups.js) —
// основной источник. penalty_class и penalty_minutes — фолбэк для записей, созданных
// до появления видов: у них штраф — одна строка со своим классом.

const PENALTY_KIND_PHRASE = {
    minor: 'малым штрафом',
    double_minor: 'двойным малым штрафом',
    misconduct: 'дисциплинарным штрафом',
    minor_misconduct: 'малым и дисциплинарным штрафом',
    double_minor_misconduct: 'двойным малым и дисциплинарным штрафом',
    game_misconduct: 'дисциплинарным штрафом до конца игры',
    major: 'большим и дисциплинарным штрафом до конца игры',
    // Старые записи: матч-штраф одной строкой и большой без двадцатки
    match: 'большим и дисциплинарным штрафом до конца игры',
    legacy_major: 'большим штрафом',
    // Штрафной бросок назначается ПРОТИВ КОМАНДЫ: нарушитель на скамейку не
    // садится, минут не получает, и называть его в объявлении нечего. Плашка
    // оверлея игрока при этом показывает — там он уместен, в озвучке нет.
    penalty_shot: 'штрафным броском',
};

export const isTeamOnlyPenalty = (penaltyClass, penaltyKind) => penaltyClass === 'penalty_shot' || penaltyKind === 'penalty_shot';

// Вид по классу и минутам старой записи — то же правило, что legacyPenaltyKind на бэке
const legacyKind = (penaltyClass, penaltyMinutes) => {
    const m = parseInt(penaltyMinutes, 10);
    if (penaltyClass === 'penalty_shot') return 'penalty_shot';
    if (penaltyClass === 'double_minor' || m === 4) return 'double_minor';
    if (penaltyClass === 'match' || m === 25) return 'match';
    if (penaltyClass === 'major' || m === 5) return 'legacy_major';
    if (penaltyClass === 'misconduct' || m === 10) return 'misconduct';
    if (penaltyClass === 'game_misconduct' || m === 20) return 'game_misconduct';
    return 'minor';
};

export function resolvePenaltyClassPhrase(penaltyClass, penaltyMinutes, penaltyKind) {
    const kind = penaltyKind || legacyKind(penaltyClass, penaltyMinutes);
    return PENALTY_KIND_PHRASE[kind] || PENALTY_KIND_PHRASE.minor;
}

// Причины группы для фразы: «за грубость», «за грубость и за атаку в голову»,
// «за X, за Y и за Z». Берутся только заполненные падежи справочника; одиночная
// запись приходит массивом из одной причины (или penalty_accusative по старинке).
export function penaltyReasonsPhrase(accusatives, singleAccusative) {
    const list = (Array.isArray(accusatives) && accusatives.length > 0 ? accusatives : [singleAccusative])
        .map(penaltyReasonAccusative)
        .filter(Boolean);
    if (list.length === 0) return null;
    const parts = list.map(r => `за ${r}`);
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}`;
}

// ── Построение текста состава ────────────────────────────────────────────────

function formatRosterPlayers(players) {
    return players.map(p => {
        const playerName = p.pronunciation || `${p.first_name} ${p.last_name}`;
        let text = `${playerName}, номер ${numberToWords(p.jersey_number)}`;
        if (p.is_captain) text += ', капитан';
        else if (p.is_assistant) text += ', ассистент капитана';
        return text;
    }).join('. ') + '.';
}

export function buildTeamText(teamName, teamPronunciation, roster, label) {
    const lines = [`${label}: ${teamPronunciation || teamName}.`];

    const goalies   = roster.filter(p => p.position_in_line === 'G');
    const defenders = roster.filter(p => ['LD', 'RD'].includes(p.position_in_line));
    const forwards  = roster.filter(p => ['C', 'LW', 'RW'].includes(p.position_in_line));
    const other     = roster.filter(p => !['G', 'LD', 'RD', 'C', 'LW', 'RW'].includes(p.position_in_line));

    if (goalies.length > 0)   lines.push(`${goalies.length === 1 ? 'Вратарь' : 'Вратари'}. ${formatRosterPlayers(goalies)}`);
    if (defenders.length > 0) lines.push(`${defenders.length === 1 ? 'Защитник' : 'Защитники'}. ${formatRosterPlayers(defenders)}`);
    if (forwards.length > 0)  lines.push(`${forwards.length === 1 ? 'Нападающий' : 'Нападающие'}. ${formatRosterPlayers(forwards)}`);
    if (other.length > 0)     lines.push(formatRosterPlayers(other));

    return lines.join('\n');
}

export function buildAnnouncementText(game, homeRoster, awayRoster) {
    return [
        'Представляем составы команд!',
        '',
        buildTeamText(game.home_team_name, game.home_team_pronunciation, homeRoster, 'Команда хозяев'),
        '',
        buildTeamText(game.away_team_name, game.away_team_pronunciation, awayRoster, 'Команда гостей')
    ].join('\n');
}

// ── Вспомогательная функция склонения ассистентов ────────────────────────────

function declineAssists(assists, assistProns, order = 'last-first') {
    return assists.map((a, i) => {
        if (assistProns[i]) {
            const parts = assistProns[i].split(' ').filter(Boolean);
            return parts.length >= 2 ? declineName(parts[0], parts[1], 'genitive', order) : assistProns[i];
        }
        const parts = a.split(' ').filter(Boolean);
        return parts.length >= 2 ? declineName(parts[0], parts[1], 'genitive', order) : a;
    });
}

// ── Имена для КОММЕНТАТОРА: везде порядок "Имя Фамилия" ──────────────────────
// users.pronunciation хранит "Фамилия Имя" целиком (не только фамилию) — если поле
// пустое, специальных ударений нет, берём обычные first_name/last_name.

// Именительный падеж — это и есть исходная форма, склонять не нужно, только
// переставить местами (Фамилия Имя -> Имя Фамилия), если используем pronunciation.
function formatNameNominative(pronunciation, firstName, lastName) {
    if (pronunciation) {
        const parts = pronunciation.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return `${parts[1]} ${parts[0]}`;
        return pronunciation;
    }
    return `${firstName || ''} ${lastName || ''}`.trim();
}

// Склонение в нужный падеж (petrovich), тоже в порядке "Имя Фамилия" (order='first-last').
function formatNameDeclined(pronunciation, firstName, lastName, caseName) {
    if (pronunciation) {
        const parts = pronunciation.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return declineName(parts[0], parts[1], caseName, 'first-last');
        return pronunciation;
    }
    return declineName(lastName, firstName, caseName, 'first-last');
}

// ── Тяжесть штрафа для КОММЕНТАТОРА («Малым штрафом», «до конца матча») ──────
// Формулировка отличается от диктора арены (там строчная буква и «до конца игры») —
// у комментатора тип штрафа стоит в начале фразы, поэтому с большой буквы.

const BROADCAST_PENALTY_KIND_PHRASE = {
    minor: 'Малым штрафом',
    double_minor: 'Двойным малым штрафом',
    misconduct: 'Дисциплинарным штрафом',
    minor_misconduct: 'Малым и дисциплинарным штрафом',
    double_minor_misconduct: 'Двойным малым и дисциплинарным штрафом',
    game_misconduct: 'Дисциплинарным штрафом до конца матча',
    major: 'Большим и дисциплинарным штрафом до конца матча',
    match: 'Большим и дисциплинарным штрафом до конца матча',
    legacy_major: 'Большим штрафом',
    penalty_shot: 'Штрафным броском',
};

function resolveBroadcastPenaltyClassPhrase(penaltyClass, penaltyMinutes, penaltyKind) {
    const kind = penaltyKind || legacyKind(penaltyClass, penaltyMinutes);
    return BROADCAST_PENALTY_KIND_PHRASE[kind] || BROADCAST_PENALTY_KIND_PHRASE.minor;
}

// ── Построение текста события для КОММЕНТАТОРА (панель трансляции) ──────────
// Сигнатура повторяет buildEventText (диктор арены) + goal_strength — только он
// определяет отдельные формулировки для большинства/меньшинства у комментатора.

export function buildBroadcastEventText({
    event_type,
    player_last_name, player_first_name, pronunciation, jersey_number, is_goalie,
    team_name, team_pronunciation,
    penalty_class, penalty_minutes, penalty_violation, penalty_accusative,
    penalty_kind, penalty_reasons_accusative,
    assist1_last_name, assist1_first_name, assist1_pronunciation, assist1_jersey_number,
    assist2_last_name, assist2_first_name, assist2_pronunciation, assist2_jersey_number,
    goal_strength,
}) {
    const teamDisplay = team_pronunciation || team_name || '';
    const playerDisplay = formatNameNominative(pronunciation, player_first_name, player_last_name);
    const playerNumWord = jersey_number ? numberToWords(jersey_number) : '';
    const scorerPhrase = `${playerDisplay}${playerNumWord ? ` номер ${playerNumWord}` : ''}`;

    if (event_type === 'penalty') {
        // Причин у штрафа может быть несколько (2+2 за два разных нарушения) —
        // называем все: «за грубость и за атаку в голову».
        const reason = penaltyReasonsPhrase(penalty_reasons_accusative, penalty_accusative);
        const severity = resolveBroadcastPenaltyClassPhrase(penalty_class, penalty_minutes, penalty_kind);
        // При штрафном броске игрока не называем, даже если он в протоколе есть.
        const hasPlayer = !isTeamOnlyPenalty(penalty_class, penalty_kind)
            && !!(player_last_name || player_first_name || pronunciation);
        // Падеж в справочнике не заполнен — причину опускаем целиком:
        // «Большим и дисциплинарным штрафом до конца матча, наказана команда Динамо.»
        const reasonPart = reason ? ` ${reason}` : '';

        if (!hasPlayer) {
            return `${severity}${reasonPart}, наказана команда ${teamDisplay}.`;
        }
        if (is_goalie) {
            return `${severity}${reasonPart}, наказан вратарь команды ${teamDisplay}, ${scorerPhrase}.`;
        }
        return `${severity}${reasonPart}, наказан игрок команды ${teamDisplay}, ${scorerPhrase}.`;
    }

    if (event_type === 'goal') {
        const assists = [];
        if (assist1_last_name || assist1_pronunciation) {
            assists.push({ pron: assist1_pronunciation, last: assist1_last_name, first: assist1_first_name, num: assist1_jersey_number });
        }
        if (assist2_last_name || assist2_pronunciation) {
            assists.push({ pron: assist2_pronunciation, last: assist2_last_name, first: assist2_first_name, num: assist2_jersey_number });
        }

        const withNum = (name, num) => `${name}${num ? ` номер ${numberToWords(num)}` : ''}`;
        // Именительный — только для конструкции "ассистировали ему X и Y" (равные составы, 2 передачи).
        const assistsNominative = assists.map(a => withNum(formatNameNominative(a.pron, a.first, a.last), a.num));
        // Родительный — для "с передачи X" / "с передач X и Y" (везде в остальных случаях).
        const assistsGenitive = assists.map(a => withNum(formatNameDeclined(a.pron, a.first, a.last, 'genitive'), a.num));

        const isPP = ['pp', 'pp1', 'pp2'].includes(goal_strength);
        const isSH = ['sh', 'sh1', 'sh2'].includes(goal_strength);

        const genitivePrefix = assists.length === 1 ? `С передачи ${assistsGenitive[0]}`
            : assists.length === 2 ? `С передач ${assistsGenitive[0]} и ${assistsGenitive[1]}`
            : null;

        if (isPP) {
            let text = `Команда ${teamDisplay} реализовала большинство. `;
            if (genitivePrefix) text += `${genitivePrefix}, `;
            text += `Шайбу забросил ${scorerPhrase}`;
            return text + '.';
        }

        if (isSH) {
            let text = `Команда ${teamDisplay} забросили шайбу в меньшинстве`;
            if (genitivePrefix) text += `, ${genitivePrefix}, Шайбу забросил ${scorerPhrase}`;
            else text += `. Отличился ${scorerPhrase}`;
            return text + '.';
        }

        // Равные составы (equal, en, ps и прочие)
        if (assists.length === 0) {
            return `Отличился заброшенной шайбой игрок команды ${teamDisplay}, ${scorerPhrase}.`;
        }
        if (assists.length === 1) {
            return `Шайбу забросил игрок команды ${teamDisplay}, ${scorerPhrase}, с передачи ${assistsGenitive[0]}.`;
        }
        return `Забросил шайбу игрок команды ${teamDisplay}, ${scorerPhrase}, ассистировали ему ${assistsNominative[0]} и ${assistsNominative[1]}.`;
    }

    return null;
}

// ── Построение текста события для ДИКТОРА АРЕНЫ (панель секретаря) ──────────
// Гол: «С передач(и) ... шайбу забросил ..., команда ...» / «Шайбу забросил ..., команда ...».
// Штраф: «За ... {малым/двойным малым/большим/большим и дисциплинарным} штрафом наказан(а) ...».

export function buildEventText({
    event_type,
    player_last_name, player_first_name, pronunciation, jersey_number, is_goalie,
    team_name, team_pronunciation,
    penalty_class, penalty_minutes, penalty_violation, penalty_accusative,
    penalty_kind, penalty_reasons_accusative,
    assist1_last_name, assist1_first_name, assist1_pronunciation, assist1_jersey_number,
    assist2_last_name, assist2_first_name, assist2_pronunciation, assist2_jersey_number,
}) {
    const teamDisplay = team_pronunciation || team_name || '';
    // При штрафном броске наказана команда, а не игрок: фамилию нарушителя
    // диктор не называет, хотя в протоколе она записана.
    const hasPlayer = !(event_type === 'penalty' && isTeamOnlyPenalty(penalty_class, penalty_kind))
        && !!(player_last_name || player_first_name || pronunciation);
    const playerDisplay = pronunciation || `${player_first_name || ''} ${player_last_name || ''}`.trim();
    const playerNumWord = jersey_number ? ` номер ${numberToWords(jersey_number)}` : '';

    if (event_type === 'goal') {
        // declineAssists ожидает "Фамилия Имя" на входе (так распарсит на last/first для petrovich);
        // порядок в итоговой фразе меняется отдельно через order='first-last'.
        const assistsRaw = [];
        if (assist1_last_name || assist1_pronunciation) {
            assistsRaw.push({ name: `${assist1_last_name || ''} ${assist1_first_name || ''}`.trim(), pron: assist1_pronunciation, num: assist1_jersey_number });
        }
        if (assist2_last_name || assist2_pronunciation) {
            assistsRaw.push({ name: `${assist2_last_name || ''} ${assist2_first_name || ''}`.trim(), pron: assist2_pronunciation, num: assist2_jersey_number });
        }

        const declined = declineAssists(assistsRaw.map(a => a.name), assistsRaw.map(a => a.pron), 'first-last');
        const assists = declined.map((d, i) => `${d}${assistsRaw[i].num ? ` номер ${numberToWords(assistsRaw[i].num)}` : ''}`);

        let prefix = '';
        if (assists.length === 1) prefix = `С передачи ${assists[0]}, `;
        else if (assists.length === 2) prefix = `С передач ${assists[0]}, и ${assists[1]}, `;

        const goalPhrase = prefix ? 'шайбу' : 'Шайбу';
        return `${prefix}${goalPhrase} забросил ${playerDisplay}${playerNumWord}, команда ${teamDisplay}.`;
    }

    if (event_type === 'penalty') {
        // Все причины группы: «за грубость и за атаку в голову двойным малым штрафом…»
        const reason = penaltyReasonsPhrase(penalty_reasons_accusative, penalty_accusative);
        const severity = resolvePenaltyClassPhrase(penalty_class, penalty_minutes, penalty_kind);

        // Падеж в справочнике не заполнен — причину опускаем, и тогда фраза начинается
        // с тяжести штрафа: «Малым штрафом наказан Иван Петров номер двадцать первый…».
        // У диктора тяжесть хранится со строчной (она стоит в середине фразы), поэтому
        // при выносе в начало поднимаем первую букву.
        if (!reason) {
            const opening = severity.charAt(0).toUpperCase() + severity.slice(1);
            if (!hasPlayer) {
                return `${opening} наказана команда ${teamDisplay}.`;
            }
            if (is_goalie) {
                return `${opening} наказан вратарь команды ${teamDisplay}, ${playerDisplay}${playerNumWord}.`;
            }
            return `${opening} наказан ${playerDisplay}${playerNumWord}, команда ${teamDisplay}.`;
        }

        // reason уже со своим «за …»; в начале фразы — с большой буквы
        const reasonOpening = reason.charAt(0).toUpperCase() + reason.slice(1);
        if (!hasPlayer) {
            return `${reasonOpening}, ${severity} наказана команда ${teamDisplay}.`;
        }
        if (is_goalie) {
            return `${reasonOpening}, ${severity} наказан вратарь команды ${teamDisplay}, ${playerDisplay}${playerNumWord}.`;
        }
        return `${reasonOpening}, ${severity} наказан ${playerDisplay}${playerNumWord}, команда ${teamDisplay}.`;
    }

    return null;
}
