// LMS-Backend/src/protocols/protocol-default.js
//
// Шаблон официального протокола матча: лицевая сторона (стр. 1) и оборот (стр. 2).
//
// Файл самодостаточный и ничего не импортирует из соседних шаблонов: у каждой лиги
// свой протокол, и отличаться могут обе страницы. Шаблон лиги делается копией этого
// файла под именем protocol-<leagueId>.js — фабрика подхватит его по имени
// (см. protocol-factory.js), а дефолтный останется нетронутым.
//
// Данные готовит prepareProtocolData в controllers/ProtocolPDFController.js.

// Значение для вставки в разметку. Экранирование обязательно: на обороте печатается
// свободный текст, который вводит секретарь, а предпросмотр протокола открывается
// в srcDoc-iframe того же origin, что и сам LMS. Заодно защищает названия команд
// и фамилии со спецсимволами (& в названии клуба ломал бы разметку).
const t = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).normalize('NFC')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

const formatTime = (totalSeconds) => {
    if (totalSeconds === undefined || totalSeconds === null) return '';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatPenaltyMinutes = (penalty) => {
    if (!penalty) return '';
    // Штрафной бросок минут не даёт — в графе «Шт.» печатаем сам вид наказания.
    if (penalty.penalty_class === 'penalty_shot') return 'ШБ';
    if (penalty.penalty_class === 'double_minor' || parseInt(penalty.penalty_minutes, 10) === 4) return '2+2';
    if (penalty.penalty_class === 'match' || parseInt(penalty.penalty_minutes, 10) === 25) return '5+20';
    return penalty.penalty_minutes || '';
};

// Штрафной бросок по ходу матча печатается строкой во «Взятии ворот»: время,
// номер бьющего и исход вместо передач. Поле ИС при этом остаётся и показывает
// «ШБ» — по нему бросок и отличается от обычной шайбы.
// pending_ps сюда не доходит: при завершении матча такие броски переписываются
// в failed_ps, а незавершённый протокол не печатают.
const isPenaltyShotRow = (goal) => goal?.event_type === 'failed_ps'
                                || goal?.event_type === 'pending_ps'
                                || (goal?.event_type === 'goal' && goal?.goal_strength === 'ps');

const penaltyShotOutcome = (goal) => (goal?.event_type === 'goal' ? 'Реализован' : 'Не реализован');

const GOAL_STRENGTH_MAP = { "equal": "РС", "pp": "+1", "pp1": "+1", "pp2": "+2", "sh": "-1", "sh1": "-1", "sh2": "-2", "en": "ПВ", "ps": "ШБ" };
// Причина удаления печатается в протоколе сокращением из справочника (номер / сокращение /
// полное наименование — см. PENALTY_REASONS в LMS-Frontend/src/components/GameLiveDesk/
// GameDeskShared.jsx). В game_events.penalty_violation хранится ПОЛНОЕ наименование,
// поэтому здесь сопоставление «полное наименование -> сокращение».
const PENALTY_REASON_MAP = {
    "Агрессор в драке": "АГРЕС",
    "Атака в голову или шею": "АТ-ГОЛ",
    "Блокировка": "БЛОК",
    "Бросок клюшки и снаряжения": "БР-КЛ",
    "Выброс шайбы": "ВБ-ШБ",
    "Грубость": "ГРУБ",
    "Дисциплинарный до конца матча штраф": "ДИС-КН",
    "Дисциплинарный штраф": "ДИСЦ",
    "Драка": "ДРКА",
    "Задержка игры": "ЗД-ИГ",
    "Задержка клюшки соперника": "ЗД-КЛ-СП",
    "Задержка клюшкой": "ЗД-КЛ",
    "Задержка соперника": "ЗД-СП",
    "Задержка шайбы руками": "ЗД-ШБ",
    "Зачинщик драки": "ЗЧ-ДР",
    "Игра высоко поднятой клюшкой": "ВП-КЛ",
    "Игра со сломанной клюшкой": "СЛ-КЛ",
    "Колющий удар": "КЛ-УД",
    "Малый скамеечный штраф": "СК-ШТ",
    "Нарушение численного состава": "ЧС-СТ",
    "Неправильная атака": "НП-АТ",
    "Нестандартное снаряжение": "НС-СН",
    "Опасное снаряжение": "ОП-СН",
    "Опасные действия": "ОП-ДСТ",
    "Оскорбление судей и неспортивное поведение": "НС-ПВ",
    "Отказ начать игру": "ОТ-ИГ",
    "Отсечение": "ОТСЧ",
    "Подножка": "ПОДЖ",
    "Покидание скамейки штрафников / запасных / во время конфликта": "ПК-СК",
    "Сдвиг ворот": "СД-ВР",
    "Симуляция": "СМЛЦ",
    "Толчок клюшкой": "ТЛ-КЛ",
    "Толчок на борт": "ТЛ-БР",
    "Удар головой": "УД-ГОЛ",
    "Удар клюшкой": "УД-КЛ",
    "Укус": "УКС",
    "Удар концом клюшки": "УД-К-КЛ",
    "Удар локтем": "УД-ЛОК",
    "Удар ногой": "УД-НГ",
    "Физический контакт со зрителем": "ФД-ЗРТ",
    "Штрафы вратаря: игра за красной линией, покидание площади ворот в конфликте": "ШТ-ВР",
    "Помещающий шайбу на сетку ворот, отправляющийся к скамейке в остановке": "ШТ-ВР",

    // Формулировки прежнего справочника: остались в уже сохранённых матчах,
    // сведены к ближайшему действующему сокращению.
    "Покид. скамейки штрафников во время конфл.": "ПК-СК",
    "Покид. скамейки запасных во время конфл.": "ПК-СК",
    "Штр. вр: игра за красной линией": "ШТ-ВР",
    "Штр. вр: покидание площади ворот в конфликте": "ШТ-ВР",
    "Штр. вр: помещающий шайбу на сетку ворот": "ШТ-ВР",
    "Штр. вр: отправился к скамейке в остановке": "ШТ-ВР",
};

// Скошенный овал поверх ячейки — так строку «Замечание: да / нет / на обороте»
// отмечают от руки. Рисуем им «да», когда на обороте есть вписанные замечания.
// preserveAspectRatio="none" растягивает овал по ячейке, non-scaling-stroke не даёт
// линии растянуться вместе с ним и остаться неровной по толщине.
const MARK_OVAL = `
                <svg class="markOval" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <ellipse cx="50" cy="20" rx="47" ry="18.5" transform="rotate(-12 50 20)" />
                </svg>`;

// ============================================================================
// СТРАНИЦА 2 (оборот протокола): справочные данные
// ============================================================================
// Вёрстка повторяет бумажный бланк «Оборот Протокол матча (шаблон).xls»:
//   1. «Индексация штрафов» + «Таблица условных обозначений» — две колонки;
//   2. «Броски определяющие победителя» матча и серии матчей + расшифровка и подписи;
//   3. «Результаты проверки игроков»;
//   4. Линованные блоки замечаний и уведомлений.
// Пропорции колонок взяты из ширин ячеек бланка (доли от суммы колонок B..X).
// Блоки 3 и 4 в системе не хранятся — печатаются пустыми и заполняются от руки.

// Справочник причин удаления на случай, когда лига не заполнила penalty_types для сезона.
// Совпадает со встроенным списком панели секретаря (PENALTY_REASONS в GameDeskShared.jsx).
const PENALTY_INDEX_FALLBACK = [
    { number: 1,  title: 'Агрессор в драке' },
    { number: 2,  title: 'Атака в голову или шею' },
    { number: 3,  title: 'Блокировка' },
    { number: 4,  title: 'Бросок клюшки и снаряжения' },
    { number: 5,  title: 'Выброс шайбы' },
    { number: 6,  title: 'Грубость' },
    { number: 7,  title: 'Дисциплинарный до конца матча штраф' },
    { number: 8,  title: 'Дисциплинарный штраф' },
    { number: 9,  title: 'Драка' },
    { number: 10, title: 'Задержка игры' },
    { number: 11, title: 'Задержка клюшки соперника' },
    { number: 12, title: 'Задержка клюшкой' },
    { number: 13, title: 'Задержка соперника' },
    { number: 14, title: 'Задержка шайбы руками' },
    { number: 15, title: 'Зачинщик драки' },
    { number: 16, title: 'Игра высоко поднятой клюшкой' },
    { number: 17, title: 'Игра со сломанной клюшкой' },
    { number: 18, title: 'Колющий удар' },
    { number: 19, title: 'Малый скамеечный штраф' },
    { number: 20, title: 'Нарушение численного состава' },
    { number: 21, title: 'Неправильная атака' },
    { number: 22, title: 'Нестандартное снаряжение' },
    { number: 23, title: 'Опасное снаряжение' },
    { number: 24, title: 'Опасные действия' },
    { number: 25, title: 'Оскорбление судей и неспортивное поведение' },
    { number: 26, title: 'Отказ начать игру' },
    { number: 27, title: 'Отсечение' },
    { number: 28, title: 'Подножка' },
    { number: 29, title: 'Покидание скамейки штрафников / запасных / во время конфликта' },
    { number: 30, title: 'Сдвиг ворот' },
    { number: 31, title: 'Симуляция' },
    { number: 32, title: 'Толчок клюшкой' },
    { number: 33, title: 'Толчок на борт' },
    { number: 34, title: 'Удар головой' },
    { number: 35, title: 'Удар клюшкой' },
    { number: 36, title: 'Укус' },
    { number: 37, title: 'Удар концом клюшки' },
    { number: 38, title: 'Удар локтем' },
    { number: 39, title: 'Удар ногой' },
    { number: 40, title: 'Физический контакт со зрителем' },
    { number: 41, title: 'Штрафы вратаря: игра за красной линией, покидание площади ворот в конфликте' },
    { number: 42, title: 'Помещающий шайбу на сетку ворот, отправляющийся к скамейке в остановке' },
];

// Таблица условных обозначений. Расшифровывает подписи колонок ПЕРВОЙ страницы,
// поэтому при изменении шапки/колонок выше правится и этот список.
// Высоту строк не задаём — длинные описания переносятся и растягивают ячейку сами,
// иначе при изменении ширины колонки таблица не сжималась бы обратно.
const LEGEND_SECTIONS = [
    {
        rows: [
            ['Вид соревнования', 'Вид спорта, по которому проводится игра'],
            ['Дивизион', 'Дивизион турнира, в котором проводится игра'],
            ['Дата', 'Дата проведения игры'],
            ['№ игры', 'Порядковый номер игры в календаре турнира'],
            ['Место проведения', 'Название арены, где проходит игра'],
            ['Начало', 'Время начала игры по расписанию'],
            ['Количество зрителей', 'Количество зрителей, присутствующих на игре'],
            ['Команда «А»', 'Название команды — хозяина поля'],
            ['Команда «Б»', 'Название команды гостей'],
        ],
    },
    {
        title: 'Составы команд',
        rows: [
            ['№', 'Номер игрока: в первые две позиции заносятся вратари, далее — полевые игроки'],
            ['Фамилия Имя', 'Фамилия и имя игрока'],
            ['Поз.', 'Позиция игрока: Вр — вратарь, Защ — защитник, Нап — нападающий'],
            ['Иг', 'Словами «Да» / «Нет» отмечаются игроки, (не) участвующие в игре'],
        ],
    },
    {
        title: 'Взятие ворот',
        rows: [
            ['№', 'Порядковый номер взятия ворот'],
            ['Время', 'Время игры в момент взятия ворот'],
            ['Г.', 'Номер игрока, забросившего шайбу'],
            ['П1., П2.', 'Номера игроков, сделавших результативные передачи'],
            ['ИС.', 'Игровая ситуация: РС — равные составы; +1 — большинство 5 на 4, 4 на 3; +2 — большинство 5 на 3; −1 — меньшинство 4 на 5, 3 на 4; −2 — меньшинство 3 на 5; ПВ — пустые ворота; ШБ — штрафной бросок'],
        ],
    },
    {
        title: 'Удаления',
        rows: [
            ['№', 'Номер оштрафованного игрока (или «К» — командный штраф)'],
            ['Шт.', 'Количество минут штрафа: 2, 2+2, 5, 10, 20, 5+20'],
            ['Причина', 'Сокращение причины удаления по таблице «Индексация штрафов»'],
            ['Начало', 'Фактическое начало отбывания штрафного времени'],
            ['Окончан.', 'Фактическое окончание штрафного времени'],
        ],
    },
    {
        title: 'Время игры вратарей',
        rows: [
            ['Время', 'Время игры, когда вратарь вступил в игру или вышел из игры'],
            ['«А»', 'Номер вратаря команды «А», вступившего в игру или вышедшего из игры'],
            ['«Б»', 'Номер вратаря команды «Б», вступившего в игру или вышедшего из игры'],
        ],
    },
    {
        title: 'Результат по периодам',
        rows: [
            ['1, 2, 3, OT, ШБ, Общ.', 'Период игры; OT — овертайм; ШБ — броски, определяющие победителя; Общ. — общая сумма данных в строке'],
            ['Взятие ворот', 'Количество голов команд «А» и «Б» по периодам'],
            ['Штрафное время', 'Количество минут штрафа команд «А» и «Б» по периодам'],
            ['Броски', 'Количество бросков в створ ворот команд «А» и «Б» по периодам'],
        ],
    },
    {
        title: 'Время игры',
        rows: [
            ['Начало', 'Фактическое время начала игры'],
            ['Окончание', 'Фактическое время окончания игры'],
            ['Тайм-аут «А»', 'Время игры, когда команда хозяев «А» взяла тайм-аут'],
            ['Тайм-аут «Б»', 'Время игры, когда команда гостей «Б» взяла тайм-аут'],
        ],
    },
    {
        title: 'Подписи',
        rows: [
            ['Замечание', 'Отметка о наличии замечаний Главного судьи: «на обороте» — замечания записаны на этой стороне протокола'],
            ['Тренер, Офиц. лицо', 'Фамилия и подпись (ЭЦП) представителя команды'],
            ['Секретарь, судьи', 'Фамилия и подпись (ЭЦП) официального лица матча'],
        ],
    },
];

// Расшифровка блока «Броски определяющие победителя» (правая колонка средней полосы).
const SHOOTOUT_LEGEND = [
    ['«А»', 'Номер игрока команды «А» (помечается *, если начинает серию БП первым)'],
    ['«Б»', 'Номер игрока команды «Б» (помечается *, если начинает серию БП первым)'],
    ['Вр. «А»', 'Номер вратаря команды «А», защищающего ворота в серии БП'],
    ['Вр. «Б»', 'Номер вратаря команды «Б», защищающего ворота в серии БП'],
    ['Результат', 'Результат после выполнения БП'],
];

// Ширины колонок в процентах. За основу взяты ширины ячеек бланка (доли от суммы
// колонок B..X исходного .xls), но верхний блок перебалансирован: в бланке лист делится
// ровно пополам, из-за чего индексация штрафов заметно короче таблицы обозначений.
// Индексация сужена (пара длинных пунктов переносится на две строки), обозначения
// расширены (несколько описаний влезают в одну строку) — колонки сравнялись по высоте.
const W = {
    // Блок 1: индексация штрафов | зазор | таблица условных обозначений
    indexCol: '39.00%',
    gutter: '0.87%',
    legendCol: '60.13%',
    indexNum: '14pt',       // колонка «№» в индексации — в pt, чтобы не сжималась вместе с блоком
    legendLabel: '24.00%',  // доля колонки-подписи внутри таблицы обозначений
    // Блок 2: БП матча | зазор | БП серии матчей | зазор | расшифровка и подписи.
    // Левая группа по ширине совпадает с индексацией, правая — с таблицей обозначений.
    soMatch: '19.01%',
    soGutter: '0.98%',
    soSeries: '19.01%',
    // Блок 3: результаты проверки игроков
    checkTeam: '16.28%',
    checkNum: '6.01%',
    checkResult: '24.25%',
    checkSignChecked: '22.41%',
    checkSignChecking: '17.27%',
    checkSignPerson: '13.78%',
    // Блок «Уведомление о подаче протеста»
    protestLabel: '35.07%',
    protestMid: '4.59%',
    protestWide: '60.34%',
};

// Колонки таблицы БП: «А» | «Б» | Вр.«А» | Вр.«Б» | Результат (x : y).
// Под номера игроков хватает узких колонок, а «Результат» и «Вр.«А»» — самые длинные
// заголовки, им отдано больше: иначе после сужения блока они переносятся на две строки.
const SO_COLS = ['14%', '14%', '22%', '22%', '28%'];
const SO_ROWS = 10;

// Высоты строк верхнего блока, pt.
const ROW_H = 8.6;      // строка данных
const SUB_H = 9.5;      // подзаголовок раздела
const HEAD_H = 12;      // заголовок таблицы
const TEXT_PT = 5.7;    // базовый кегль текста в таблицах блока
const MIN_TEXT_PT = 5;  // ниже печать становится нечитаемой
const LINE_RATIO = 1.15; // line-height у .p2Text / .p2Label

// Высота верхнего блока: её задаёт таблица условных обозначений, она почти всегда
// длиннее индексации штрафов. Точную высоту заранее не посчитать — переносы строк
// зависят от ширины колонки, поэтому значение подобрано по факту рендера и служит
// бюджетом, под который подстраивается высота строк индексации.
const TOP_BLOCK_PT = 432;

// ============================================================================
// СТРАНИЦА 2: блоки
// ============================================================================

// Ячейка со значением подписи: пустая подпись показывается серым прочерком,
// так же как в подвале первой страницы.
const signatureValue = (value) => value
    ? `<span style="font-size: 7pt; color: #000;">${t(value)}</span>`
    : `<span style="font-size: 7pt; color: #d1d1d1;">—</span>`;

// --- Блок 1, левая колонка: индексация штрафов -------------------------------
// Справочник причин удаления лига ведёт сама, и пунктов в нём может быть больше, чем
// 42 строки бумажного бланка. Тогда строки и кегль поджимаются, чтобы блок уместился
// в высоту таблицы обозначений и не вытолкнул низ оборота на третий лист.
// Запас — примерно до 60 пунктов; при более длинном справочнике текст не мельчим
// ниже MIN_TEXT_PT, и протокол честно печатается на трёх листах.
const renderPenaltyIndex = (items) => {
    const available = (TOP_BLOCK_PT - HEAD_H) / Math.max(items.length, 1);
    const fontSize = Math.min(TEXT_PT, Math.max(MIN_TEXT_PT, (available - 1) / LINE_RATIO));
    const rowHeight = Math.max(fontSize * LINE_RATIO + 1, Math.min(ROW_H, available));
    const textStyle = `font-size: ${fontSize.toFixed(2)}pt;`;

    // Строки добирают высоту до соседней колонки только если справочник сопоставим с ней
    // по длине. Если лига завела десяток пунктов, растянутые на весь лист строки выглядели
    // бы разреженными — такая таблица просто заканчивается выше (p2ColTop прижимает рамку).
    const fill = (HEAD_H + items.length * ROW_H) >= TOP_BLOCK_PT * 0.7;

    return `
    <div class="p2Col${fill ? '' : ' p2ColTop'}" style="width: ${W.indexCol};">
      <div class="p2Row f0f0f0" style="min-height: ${HEAD_H}pt;">
        <div class="p2Cell p2CellC" style="width: ${W.indexNum};"><span class="p2Head">№</span></div>
        <div class="p2Cell p2CellC" style="flex: 1;"><span class="p2Head">Индексация штрафов</span></div>
      </div>
      ${items.map(item => `
        <div class="p2Row${fill ? ' p2RowFill' : ''}" style="min-height: ${rowHeight.toFixed(2)}pt;">
          <div class="p2Cell p2CellC" style="width: ${W.indexNum};"><span class="p2Text" style="${textStyle}">${t(item.number)}</span></div>
          <div class="p2Cell p2CellL" style="flex: 1;"><span class="p2Text" style="${textStyle}">${t(item.title)}</span></div>
        </div>
      `).join('')}
      <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 100%;"></div>
    </div>
    `;
};

// --- Блок 1, правая колонка: таблица условных обозначений --------------------
const renderLegend = () => {
    const rowHtml = ([label, text]) => `
        <div class="p2Row p2RowFill">
          <div class="p2Cell p2CellL" style="width: ${W.legendLabel};"><span class="p2Label">${t(label)}</span></div>
          <div class="p2Cell p2CellL" style="flex: 1;"><span class="p2Text">${t(text)}</span></div>
        </div>
    `;

    return `
    <div class="p2Col" style="width: ${W.legendCol};">
      <div class="p2Row f0f0f0" style="min-height: ${HEAD_H}pt;">
        <div class="p2Cell p2CellC" style="width: 100%;"><span class="p2Head">Таблица условных обозначений</span></div>
      </div>
      ${LEGEND_SECTIONS.map(section => `
        ${section.title ? `
          <div class="p2Row f0f0f0" style="min-height: ${SUB_H}pt;">
            <div class="p2Cell p2CellC" style="width: 100%;"><span class="p2Sub">${t(section.title)}</span></div>
          </div>
        ` : ''}
        ${section.rows.map(rowHtml).join('')}
      `).join('')}
      <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 100%;"></div>
    </div>
    `;
};

// --- Блок 2, таблица бросков, определяющих победителя ------------------------
// rows — массив из SO_ROWS элементов { a, b, goalieA, goalieB, scoreA, scoreB }.
// Для серии матчей данных в системе нет, таблица печатается пустой.
const renderShootoutTable = (title, width, rows) => `
    <div class="p2Col p2ColTop" style="width: ${width};">
      <div class="p2Row f0f0f0" style="min-height: 16pt;">
        <div class="p2Cell p2CellC" style="width: 100%;"><span class="p2Sub">${t(title)}</span></div>
      </div>
      <div class="p2Row f0f0f0" style="min-height: 9.5pt;">
        <div class="p2Cell p2CellC" style="width: ${SO_COLS[0]};"><span class="p2Label">«А»</span></div>
        <div class="p2Cell p2CellC" style="width: ${SO_COLS[1]};"><span class="p2Label">«Б»</span></div>
        <div class="p2Cell p2CellC" style="width: ${SO_COLS[2]};"><span class="p2Label">Вр.«А»</span></div>
        <div class="p2Cell p2CellC" style="width: ${SO_COLS[3]};"><span class="p2Label">Вр.«Б»</span></div>
        <div class="p2Cell p2CellC" style="width: ${SO_COLS[4]};"><span class="p2Label">Результат</span></div>
      </div>
      ${rows.map(row => `
        <div class="p2Row" style="min-height: 9pt;">
          <div class="p2Cell p2CellC" style="width: ${SO_COLS[0]};"><span class="p2Text">${t(row.a)}</span></div>
          <div class="p2Cell p2CellC" style="width: ${SO_COLS[1]};"><span class="p2Text">${t(row.b)}</span></div>
          <div class="p2Cell p2CellC" style="width: ${SO_COLS[2]};"><span class="p2Text">${t(row.goalieA)}</span></div>
          <div class="p2Cell p2CellC" style="width: ${SO_COLS[3]};"><span class="p2Text">${t(row.goalieB)}</span></div>
          <div style="width: ${SO_COLS[4]}; flex-direction: row;">
            <div class="p2Cell p2CellC" style="width: 45%; border-right: 0;"><span class="p2Text">${t(row.scoreA)}</span></div>
            <div class="p2Cell p2CellC" style="width: 10%; border-right: 0;"><span class="p2Text">:</span></div>
            <div class="p2Cell p2CellC" style="width: 45%;"><span class="p2Text">${t(row.scoreB)}</span></div>
          </div>
        </div>
      `).join('')}
      <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 100%;"></div>
    </div>
`;

// --- Блок 2, правая колонка: расшифровка БП и подписи ------------------------
const renderShootoutLegendAndSignatures = (data) => {
    const officials = data.officials || {};
    // Колонка подписей шире, чем в таблице обозначений: иначе «Главный тренер команды «А»»
    // переносится на вторую строку и строки блока получаются разной высоты.
    const SIGN_LABEL = 35;
    const signatureRow = (label, value, height) => `
        <div class="p2Row" style="min-height: ${height};">
          <div class="p2Cell p2CellL" style="width: ${SIGN_LABEL}%;"><span class="p2Label">${t(label)}</span></div>
          <div class="p2Cell p2CellL" style="width: ${100 - SIGN_LABEL}%;">${signatureValue(value)}</div>
        </div>
    `;

    return `
    <div class="p2ColTop" style="width: ${W.legendCol};">
      <div class="p2Col">
        <div class="p2Row f0f0f0" style="min-height: 16pt;">
          <div class="p2Cell p2CellC" style="width: 100%;"><span class="p2Sub">Броски определяющие победителя</span></div>
        </div>
        ${SHOOTOUT_LEGEND.map(([label, text]) => `
          <div class="p2Row" style="min-height: 9pt;">
            <div class="p2Cell p2CellL" style="width: ${W.legendLabel};"><span class="p2Label">${t(label)}</span></div>
            <div class="p2Cell p2CellL" style="width: ${(100 - parseFloat(W.legendLabel)).toFixed(2)}%;"><span class="p2Text">${t(text)}</span></div>
          </div>
        `).join('')}
        <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 100%;"></div>
      </div>

      <div class="p2Gap" style="height: 4pt;"></div>

      <div class="p2Col">
        ${signatureRow('Подпись секретаря:', officials['secretary'], '13pt')}
        ${signatureRow('Подпись главного судьи:', officials['main-1'], '13pt')}
        ${signatureRow('Главный тренер команды «А»:', data.home?.coachSig, '12pt')}
        ${signatureRow('Главный тренер команды «Б»:', data.away?.coachSig, '12pt')}
        <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 100%;"></div>
      </div>
    </div>
    `;
};

// --- Блок 3: результаты проверки игроков -------------------------------------
// Первые пять колонок заполняет секретарь в панели («Обратная сторона протокола»),
// шестая — подпись проверяющего лица — всегда пустая, её ставят от руки.
// Строк печатаем не меньше MIN_CHECK_ROWS: пустая таблица должна выглядеть как бланк.
const MIN_CHECK_ROWS = 3;

const renderPlayerCheck = (checks) => {
    const cols = [
        ['Команда', W.checkTeam, 'team'],
        ['№ игрока', W.checkNum, 'jersey'],
        ['Результат:<br/>соответствует, не соответствует, не предъявил', W.checkResult, 'result'],
        ['Подпись представителя проверяемой команды', W.checkSignChecked, 'checkedRep'],
        ['Подпись представителя проверяющей команды', W.checkSignChecking, 'checkingRep'],
        ['Подпись проверяющего лица', W.checkSignPerson, null],
    ];

    const rows = Array.from(
        { length: Math.max(MIN_CHECK_ROWS, checks.length) },
        (_, i) => checks[i] || {}
    );

    return `
    <div class="p2Col" style="width: 100%;">
      <div class="p2Row" style="min-height: 12pt;">
        <div class="p2Cell p2CellC" style="width: 100%; border-right: 0;"><span class="p2Head">Результаты проверки игроков</span></div>
      </div>
      <div class="p2Row f0f0f0" style="min-height: 15pt;">
        ${cols.map(([label, width]) => `
          <div class="p2Cell p2CellC" style="width: ${width};"><span class="p2Text">${label}</span></div>
        `).join('')}
      </div>
      ${rows.map(row => `
        <div class="p2Row" style="min-height: 10.5pt;">
          ${cols.map(([, width, key]) => `
            <div class="p2Cell p2CellC" style="width: ${width};"><span class="p2Text">${key ? t(row[key]) : ''}</span></div>
          `).join('')}
        </div>
      `).join('')}
      <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 100%;"></div>
    </div>
    `;
};

// --- Блок 4: блоки замечаний -------------------------------------------------
// Незаполненный блок печатается линованными строками, как в бумажном бланке.
// Если секретарь внёс текст в панели, вместо линовки печатается он — с сохранением
// переносов строк. Длинный текст растягивает блок: протокол — документ, обрезать
// замечание Главного судьи нельзя, поэтому он скорее уедет на третий лист.
//
// flex-grow пропорционален числу строк: свободная высота листа делится поровну
// между всеми линованными строками, а не между блоками — иначе в блоке из трёх строк
// они получились бы выше, чем в блоке из пяти.
const renderNoteBlock = (title, lines, text) => `
    <div class="p2NoteBlock" style="flex-grow: ${lines};">
      <span class="p2NoteTitle">${t(title)}</span>
      ${text
        ? `<div class="p2NoteText" style="min-height: ${(lines * 9.5).toFixed(1)}pt;"><span class="p2NoteBody">${t(text)}</span></div>`
        : Array.from({ length: lines }).map(() => `<div class="p2NoteLine"></div>`).join('')}
    </div>
`;

// Уведомление о подаче протеста: строки команд «А» и «Б» в три колонки, как в бланке.
// Узкая ячейка — отметка «Да»/«Нет», широкая — текст уведомления.
// В самом бланке рамка у этой таблицы прорисована не до конца; здесь она обведена
// целиком, как остальные таблицы оборота.
const renderProtestBlock = (notes) => {
    const sides = [
        ['«А»', notes.protestHome || {}],
        ['«Б»', notes.protestAway || {}],
    ];

    return `
    <div style="width: 100%; flex-shrink: 0;">
      <span class="p2NoteTitle">Уведомление представителей команд о подаче протеста:</span>
      <div class="p2Col">
        ${sides.map(([letter, side]) => `
          <div class="p2Row" style="min-height: 10pt;">
            <div class="p2Cell p2CellL" style="width: ${W.protestLabel};"><span class="p2Label">Команда ${letter}</span></div>
            <div class="p2Cell p2CellC" style="width: ${W.protestMid};"><span class="p2Text">${t(side.filed)}</span></div>
            <div class="p2Cell p2CellL" style="width: ${W.protestWide};"><span class="p2Text">${t(side.text)}</span></div>
          </div>
        `).join('')}
        <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 100%;"></div>
      </div>
    </div>
    `;
};

// Оборот протокола целиком. Использует data.penaltyTypes (справочник сезона)
// и data.shootout (серия буллитов) — см. prepareProtocolData.
const renderPage2 = (data) => {
    const penaltyIndex = (data.penaltyTypes && data.penaltyTypes.length > 0)
        ? data.penaltyTypes
        : PENALTY_INDEX_FALLBACK;

    const soRows = Array.from({ length: SO_ROWS }, (_, i) => (data.shootout || [])[i] || {});
    const emptyRows = Array.from({ length: SO_ROWS }, () => ({}));
    const notes = data.notes || {};

    return `
    <div class="page page2">

      <div style="width: 100%; flex-direction: row; flex-shrink: 0;">
        ${renderPenaltyIndex(penaltyIndex)}
        <div class="p2Gap" style="width: ${W.gutter};"></div>
        ${renderLegend()}
      </div>

      <div class="p2Gap" style="height: 6pt;"></div>

      <div style="width: 100%; flex-direction: row; flex-shrink: 0;">
        ${renderShootoutTable('Броски определяющие победителя матча', W.soMatch, soRows)}
        <div class="p2Gap" style="width: ${W.soGutter};"></div>
        ${renderShootoutTable('Броски определяющие победителя серии матчей', W.soSeries, emptyRows)}
        <div class="p2Gap" style="width: ${W.gutter};"></div>
        ${renderShootoutLegendAndSignatures(data)}
      </div>

      <div class="p2Gap" style="height: 6pt;"></div>

      ${renderPlayerCheck(data.playerChecks || [])}

      <div class="p2Gap" style="height: 3pt;"></div>

      <span class="p2Banner">ИМЕНА И ФАМИЛИИ ИГРОКОВ, ТРЕНЕРОВ И СУДЕЙ ЗАНОСЯТСЯ В ПРОТОКОЛ ПОЛНОСТЬЮ</span>

      <div class="p2Notes">
        ${renderNoteBlock('Замечания Главного судьи игры о дисциплинарных нарушениях игроков и представителей команд, наложении больших, дисциплинарных до конца игры штрафов и матч-штрафов (с обязательным указанием нарушения согласно Регламенту):', 5, notes.referee)}
        ${renderNoteBlock('Замечания Главного судьи и Инспектора по проведению игры:', 3, notes.inspector)}
        ${renderNoteBlock('Уведомление врачей команд о травмах игроков:', 4, notes.medical)}
        ${renderProtestBlock(notes)}
      </div>

    </div>
    `;
};

// ============================================================================
// ДОКУМЕНТ: страница 1 + страница 2
// ============================================================================

export const getHtml = (data) => {
    const info = data.info || {};
    const home = data.home || {};
    const away = data.away || {};
    const officials = data.officials || {};
    const goalieRows = Array.from({ length: 10 }, (_, i) => data.goalieLog[i] || { time_seconds: null, home_jersey: '', away_jersey: '' });
    const periodsAndTotal = [...(data.periods || []), 'Общ.'];

    // Строку «Замечание» в подвале первой страницы отмечаем «да», если на обороте
    // есть вписанные замечания. Уведомление о протесте сюда не входит — у него на
    // обороте своя отметка «Да»/«Нет» по каждой команде.
    const backNotes = data.notes || {};
    const hasBackNotes = Boolean(
        (backNotes.referee || '').trim() ||
        (backNotes.inspector || '').trim() ||
        (backNotes.medical || '').trim()
    );

    const renderMiddleDataSection = (title, homeKey, awayKey) => `
        <div style="flex-direction: row; height: 24pt;">
          <div class="cellCenter" style="width: 28%;"><span class="dataText text-center">${t(title)}</span></div>
          <div style="width: 12%; flex-direction: column;">
             <div class="cellCenter" style="height: 12pt;"><span class="dataText">«А»</span></div>
             <div class="cellCenter" style="height: 12pt;"><span class="dataText">«Б»</span></div>
          </div>
          <div style="width: 60%; flex-direction: column;">
             <div style="height: 12pt; flex-direction: row;">
               ${periodsAndTotal.map(p => `
                  <div class="cellCenter" style="flex: 1;">
                    <span class="dataText">${data.stats[p]?.[homeKey] > 0 ? data.stats[p][homeKey] : ''}</span>
                  </div>
               `).join('')}
             </div>
             <div style="height: 12pt; flex-direction: row;">
               ${periodsAndTotal.map(p => `
                  <div class="cellCenter" style="flex: 1;">
                    <span class="dataText">${data.stats[p]?.[awayKey] > 0 ? data.stats[p][awayKey] : ''}</span>
                  </div>
               `).join('')}
             </div>
          </div>
        </div>
    `;

    const renderTeamGrid = (teamLetter, teamData, isFirst = false) => {
        const rowsHtml = [];
        for(let index = 0; index < 22; index++) {
            let player = index < 2 ? teamData.goalies[index] : teamData.fieldPlayers[index - 2];
            let positionLabel = index < 2 ? 'Вр' : (player?.translated_position || '');
            const goal = teamData.goals[index];
            const penalty = teamData.penalties[index];
            
            const fullName = player ? `${player.last_name} ${player.first_name || ''}`.trim() : '';
            // Сокращение берём снимком из самого события: пункт справочника могли отредактировать
            // или удалить, а протокол должен печататься так, как его записал секретарь.
            // PENALTY_REASON_MAP — фолбэк для матчей, записанных до появления справочника.
            const penaltyReason = penalty ? (penalty.penalty_violation_code || PENALTY_REASON_MAP[penalty.penalty_violation] || penalty.penalty_violation || '') : '';
            const goalStrength = goal ? (GOAL_STRENGTH_MAP[goal.goal_strength] || goal.goal_strength || '') : '';

            rowsHtml.push(`
              <div class="gridRow">
                <div class="gridCell" style="width: 4%;"><span class="dataText">${player?.jersey_number || ''}</span></div>
                <div class="gridCell" style="width: 18%; align-items: flex-start; padding-left: 4pt;"><span class="dataText">${t(fullName)}</span></div>
                <div class="gridCell" style="width: 6%;"><span class="dataText">${t(positionLabel)}</span></div>
                <div class="gridCell" style="width: 4%;"><span class="dataText">${player ? 'Да' : ''}</span></div>
                <div class="gridCell" style="width: 3%;"><span class="dataText">${goal ? (index + 1) : ''}</span></div>
                <div class="gridCell" style="width: 6%;"><span class="dataText">${formatTime(goal?.time_seconds)}</span></div>
                <div class="gridCell" style="width: 5%;"><span class="dataText">${goal?.scorer_number || ''}</span></div>
                ${isPenaltyShotRow(goal)
                  ? `<div class="gridCell" style="width: 10%;"><span class="dataText">${t(penaltyShotOutcome(goal))}</span></div>`
                  : `<div class="gridCell" style="width: 5%;"><span class="dataText">${goal?.a1_number || ''}</span></div>
                <div class="gridCell" style="width: 5%;"><span class="dataText">${goal?.a2_number || ''}</span></div>`}
                <div class="gridCell" style="width: 4%;"><span class="dataText">${t(goalStrength)}</span></div>
                <div class="gridCell" style="width: 4%;"><span class="dataText">${penalty?.scorer_number || ''}</span></div>
                <div class="gridCell" style="width: 4%;"><span class="dataText">${formatPenaltyMinutes(penalty)}</span></div>
                <div class="gridCell" style="width: 20%;"><span class="dataText">${t(penaltyReason)}</span></div>
                <div class="gridCell" style="width: 6%;"><span class="dataText">${formatTime(penalty?.time_seconds)}</span></div>
                <div class="gridCell" style="width: 6%;"><span class="dataText">${penalty?.penalty_class === 'penalty_shot' ? '—' : formatTime(penalty?.penalty_end_time)}</span></div>
              </div>
            `);
        }

        return `
        <div style="width: 100%; margin-top: 0;">
          <div style="width: 100%; position: relative;">
            <div class="gridRow f0f0f0">
              <div class="gridCell" style="width: 32%;"><span class="sectionTitle">Команда «${teamLetter}» ${t(teamData.name)}</span></div>
              <div class="gridCell" style="width: 28%;"><span class="sectionTitle">Взятие ворот</span></div>
              <div class="gridCell" style="width: 40%;"><span class="sectionTitle">Удаление</span></div>
            </div>
            <div class="gridRow f0f0f0">
              <div class="gridCell" style="width: 4%;"><span class="columnTitle">№</span></div>
              <div class="gridCell" style="width: 18%;"><span class="columnTitle">Фамилия Имя</span></div>
              <div class="gridCell" style="width: 6%;"><span class="columnTitle">Поз.</span></div>
              <div class="gridCell" style="width: 4%;"><span class="columnTitle">Иг</span></div>
              <div class="gridCell" style="width: 3%;"><span class="columnTitle">№</span></div>
              <div class="gridCell" style="width: 6%;"><span class="columnTitle">Время</span></div>
              <div class="gridCell" style="width: 5%;"><span class="columnTitle">Г.</span></div>
              <div class="gridCell" style="width: 5%;"><span class="columnTitle">П1.</span></div>
              <div class="gridCell" style="width: 5%;"><span class="columnTitle">П2.</span></div>
              <div class="gridCell" style="width: 4%;"><span class="columnTitle">ИС.</span></div>
              <div class="gridCell" style="width: 4%;"><span class="columnTitle">№</span></div>
              <div class="gridCell" style="width: 4%;"><span class="columnTitle">Шт.</span></div>
              <div class="gridCell" style="width: 20%;"><span class="columnTitle">Причина</span></div>
              <div class="gridCell" style="width: 6%;"><span class="columnTitle">Начало</span></div>
              <div class="gridCell" style="width: 6%;"><span class="columnTitle">Окончан.</span></div>
            </div>
            ${rowsHtml.join('')}

            <div class="thickBorder" style="top: 0; left: 0; width: 32%; height: 100%; border-top-width: ${isFirst ? '1.5pt' : '0'};"></div>
            <div class="thickBorder" style="top: 0; left: 32%; width: 28%; height: 100%; border-left-width: 0; border-top-width: ${isFirst ? '1.5pt' : '0'};"></div>
            <div class="thickBorder" style="top: 0; left: 60%; width: 40%; height: 100%; border-left-width: 0; border-top-width: ${isFirst ? '1.5pt' : '0'};"></div>
          </div>

          <div class="gridRow" style="border-width: 1.5pt; border-style: solid; border-color: #222222; border-top-width: 0; flex-direction: row;">
            <div style="flex: 1; border-right: 1pt solid #858585; justify-content: center; padding-left: 4pt;">
              <span style="font-size: 6pt; font-weight: normal; color: #000;">Тренер: <span style="font-size: 7pt; color: ${teamData.coachSig ? '#000' : '#d1d1d1'};">${t(teamData.coachSig) || '—'}</span></span>
            </div>
            <div style="flex: 1; border-right: 1pt solid #858585; justify-content: center; padding-left: 4pt;">
              <span style="font-size: 6pt; font-weight: normal; color: #000;">Офиц. лицо 1: <span style="font-size: 7pt; color: ${teamData.off1Sig ? '#000' : '#d1d1d1'};">${t(teamData.off1Sig) || '—'}</span></span>
            </div>
            <div style="flex: 1; justify-content: center; padding-left: 4pt;">
              <span style="font-size: 6pt; font-weight: normal; color: #000;">Офиц. лицо 2: <span style="font-size: 7pt; color: ${teamData.off2Sig ? '#000' : '#d1d1d1'};">${t(teamData.off2Sig) || '—'}</span></span>
            </div>
          </div>
        </div>
        `;
    };

    return `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; }
            div { display: flex; flex-direction: column; }
            span { display: inline; }
            body {
                margin: 0;
                width: 210mm;
                font-family: 'Roboto', Arial, sans-serif;
                background-color: #fff;
                font-size: 9pt;
            }
            /* Каждая страница протокола — отдельный лист A4 фиксированной высоты:
               так Chrome при печати в PDF не разрывает таблицы посередине. */
            .page { width: 210mm; height: 297mm; padding: 16pt; position: relative; }
            .page + .page { page-break-before: always; break-before: page; }
            .headerContainer { text-align: center; margin-bottom: 2pt; align-items: center; }
            .mainTitle { font-size: 11pt; font-weight: bold; text-transform: uppercase; }
            .subTitle { font-size: 9pt; color: #919191; margin-top: 0; }
            .metaTable { width: 100%; border-top: 1pt solid #858585; border-left: 1pt solid #858585; margin-bottom: 4pt; }
            .metaRow { flex-direction: row; height: 14pt; }
            .metaCol { width: 33.33%; border-right: 1pt solid #858585; border-bottom: 1pt solid #858585; padding: 0 5pt; justify-content: center; }
            .metaSplitCol { width: 33.34%; flex-direction: row; border-right: 1pt solid #858585; border-bottom: 1pt solid #858585; }
            .metaVerticalDivider { width: 1pt; height: 100%; background-color: #858585; }
            .gridRow { flex-direction: row; height: 12pt; }
            .gridCell { border-right: 1pt solid #858585; border-bottom: 1pt solid #858585; justify-content: center; align-items: center; padding: 0 2pt; }
            .label { font-weight: bold; }
            .valueText { font-size: 8pt; display: inline; }
            .sectionTitle { font-size: 7.5pt; font-weight: bold; text-transform: uppercase; }
            .columnTitle { font-size: 6.5pt; font-weight: normal; }
            .dataText { font-size: 7pt; }
            .footerMainContainer { width: 100%; margin-top: 5pt; flex-direction: row; }
            .footerColumnLeft { width: 22%; position: relative; }
            .footerColumnMiddle { width: 44%; position: relative; }
            .footerColumnRight { width: 34%; position: relative; }
            .f0f0f0 { background-color: #f0f0f0; }
            .rowShort { flex-direction: row; height: 12pt; }
            .rowTall { flex-direction: row; height: 24pt; }
            .cellCenter { border-right: 1pt solid #858585; border-bottom: 1pt solid #858585; justify-content: center; align-items: center; }
            .thickBorder { border: 1.5pt solid #222222; position: absolute; pointer-events: none; }
            .text-center { text-align: center; }
            /* Овал выходит за границы ячейки по высоте — она всего 12pt, иначе линия
               прошла бы прямо по буквам. */
            .markOval { position: absolute; top: -3pt; left: 0; width: 100%; height: calc(100% + 6pt); overflow: visible; pointer-events: none; }
            .markOval ellipse { fill: none; stroke: #222222; stroke-width: 1.4; vector-effect: non-scaling-stroke; }

            /* ===================== СТРАНИЦА 2 (оборот протокола) ===================== */
            .page2 { padding: 12pt 16pt; }
            .p2Col { position: relative; }
            /* Колонки блока прижимаются к верху: рамка таблицы заканчивается на последней строке,
               а не растягивается до высоты самой длинной колонки в ряду.
               Ставится ТОЛЬКО на прямых детей flex-контейнеров с flex-direction: row — внутри
               колоночного контейнера align-self схлопнул бы ширину блока по содержимому. */
            .p2ColTop { align-self: flex-start; }
            .p2Row { flex-direction: row; min-height: ${ROW_H}pt; flex-shrink: 0; }
            /* Индексация штрафов и таблица обозначений — соседние колонки одного flex-ряда,
               то есть всегда одной высоты (align-items: stretch). Строки более короткой
               из них разбирают лишнюю высоту на себя, и обе таблицы кончаются на одной линии,
               без пустого места под последней строкой. */
            .p2RowFill { flex-grow: 1; }
            .p2Cell { border-right: 1pt solid #858585; border-bottom: 1pt solid #858585; justify-content: center; padding: 0 2pt; }
            .p2CellC { align-items: center; text-align: center; }
            .p2CellL { align-items: stretch; padding-left: 3pt; }
            .p2Text { font-size: ${TEXT_PT}pt; line-height: ${LINE_RATIO}; }
            .p2Label { font-size: ${TEXT_PT}pt; font-weight: bold; line-height: ${LINE_RATIO}; }
            .p2Sub { font-size: 6.2pt; font-weight: bold; }
            .p2Head { font-size: 7.5pt; font-weight: bold; text-transform: uppercase; }
            .p2Gap { flex-shrink: 0; }
            .p2Banner { font-size: 8.5pt; font-weight: bold; padding: 3pt 0 2pt 0; }
            .p2NoteTitle { font-size: 7pt; font-weight: bold; padding-bottom: 1pt; }
            /* Свободная высота листа раздаётся линованным строкам, а не копится пустотой внизу:
               блоки замечаний тянутся, строки для записи от руки становятся выше. */
            .p2Notes { flex: 1 1 auto; min-height: 0; }
            .p2NoteBlock { flex-shrink: 1; flex-basis: auto; width: 100%; }
            .p2NoteLine { flex: 1 1 9.5pt; min-height: 7pt; border-bottom: 1pt solid #858585; }
            /* Нижняя черта блока не рисуется: она упиралась бы в заголовок следующего
               блока и читалась бы как подчёркивание этого заголовка. */
            .p2NoteLine:last-child { border-bottom: 0; }
            /* Заполненный блок замечаний: текст вместо линовки, с сохранением переносов строк. */
            .p2NoteText { flex: 1 1 auto; padding: 1pt 2pt; }
            .p2NoteBody { font-size: 6.5pt; line-height: 1.25; white-space: pre-wrap; }
        </style>
    </head>
    <body>
        <div class="page">
        <div class="headerContainer">
          <span class="mainTitle">ОФИЦИАЛЬНЫЙ ПРОТОКОЛ МАТЧА ТЮМЕНСКОГО ГОРОДСКОГО ЧЕМПИОНАТА</span>
          <span class="subTitle">среди любительских команд, старше восемнадцати лет, сезона ${t(info.season)}</span>
        </div>
        <div class="metaTable">
          <div class="metaRow">
            <div class="metaCol">
               <div style="flex-direction: row; align-items: center;"><span class="label valueText">Вид соревнования:&nbsp;</span><span class="valueText">Хоккей с шайбой</span></div>
            </div>
            <div class="metaCol">
               <div style="flex-direction: row; align-items: center;"><span class="label valueText">Дивизион:&nbsp;</span><span class="valueText">${t(info.division)}</span></div>
            </div>
            <div class="metaSplitCol">
              <div class="metaCol" style="width: 50%; border-right: 0; border-bottom: 0;">
                <div style="flex-direction: row; align-items: center;"><span class="label valueText">Дата:&nbsp;</span><span class="valueText">${t(info.date)}</span></div>
              </div>
              <div class="metaVerticalDivider"></div>
              <div class="metaCol" style="width: 50%; border-right: 0; border-bottom: 0;">
                <div style="flex-direction: row; align-items: center;"><span class="label valueText">№ игры:&nbsp;</span><span class="valueText">${t(info.gameNum)}</span></div>
              </div>
            </div>
          </div>
          <div class="metaRow">
            <div class="metaCol">
               <div style="flex-direction: row; align-items: center;"><span class="label valueText">Место проведения:&nbsp;</span><span class="valueText">${t(info.arena)}</span></div>
            </div>
            <div class="metaCol">
               <div style="flex-direction: row; align-items: center;"><span class="label valueText">Начало:&nbsp;</span><span class="valueText">${t(info.start)}</span></div>
            </div>
            <div class="metaCol">
               <div style="flex-direction: row; align-items: center;"><span class="label valueText">Количество зрителей:&nbsp;</span><span class="valueText">${t(info.spectators)}</span></div>
            </div>
          </div>
        </div>
        ${renderTeamGrid("А", home, true)}
        ${renderTeamGrid("Б", away, false)}
        <div class="footerMainContainer">
          <div class="footerColumnLeft">
            <div class="rowShort f0f0f0">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Время</span></div>
              <div class="cellCenter" style="width: 30%;"><span class="columnTitle">«А»</span></div>
              <div class="cellCenter" style="width: 30%;"><span class="columnTitle">«Б»</span></div>
            </div>
            ${goalieRows.map(row => `
              <div class="rowShort">
                <div class="cellCenter" style="width: 40%;"><span class="dataText">${formatTime(row.time_seconds)}</span></div>
                <div class="cellCenter" style="width: 30%;"><span class="dataText">${row.home_jersey}</span></div>
                <div class="cellCenter" style="width: 30%;"><span class="dataText">${row.away_jersey}</span></div>
              </div>
            `).join('')}
            <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 100%;"></div>
          </div>
          <div class="footerColumnMiddle">
             <div style="flex-direction: row; height: 24pt;">
                <div class="cellCenter" style="width: 40%;"><span class="dataText">ВРЕМЯ ИГРЫ</span></div>
                <div style="width: 60%; flex-direction: column;">
                   <div style="flex-direction: row; height: 12pt;">
                      <div class="cellCenter" style="flex: 1;"><span class="dataText">Начало</span></div>
                      <div class="cellCenter" style="flex: 1;"><span class="dataText">Окончание</span></div>
                   </div>
                   <div style="flex-direction: row; height: 12pt;">
                      <div class="cellCenter" style="flex: 1;"><span class="dataText">${t(info.actualStart)}</span></div>
                      <div class="cellCenter" style="flex: 1;"><span class="dataText">${t(info.actualEnd)}</span></div>
                   </div>
                </div>
             </div>
             <div class="rowShort f0f0f0">
                <div class="cellCenter" style="width: 40%;"><span class="dataText">Результат по периодам</span></div>
                <div style="width: 60%; flex-direction: row;">
                   ${periodsAndTotal.map(p => `<div class="cellCenter" style="flex: 1;"><span class="dataText">${t(p)}</span></div>`).join('')}
                </div>
             </div>
             ${renderMiddleDataSection("Взятие ворот", 'gHome', 'gAway')}
             ${renderMiddleDataSection("Штрафное время", 'pHome', 'pAway')}
             ${renderMiddleDataSection("Броски", 'sHome', 'sAway')}
             <div class="rowShort">
                <div class="cellCenter" style="width: 40%; align-items: flex-start; padding-left: 4pt;"><span class="dataText">Тайм-аут «А»</span></div>
                <div class="cellCenter" style="width: 60%;"><span class="dataText">${formatTime(home?.timeout)}</span></div>
             </div>
             <div class="rowShort">
                <div class="cellCenter" style="width: 40%; align-items: flex-start; padding-left: 4pt;"><span class="dataText">Тайм-аут «Б»</span></div>
                <div class="cellCenter" style="width: 60%;"><span class="dataText">${formatTime(away?.timeout)}</span></div>
             </div>
             <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 24pt; border-left-width: 0;"></div>
             <div class="thickBorder" style="top: 24pt; left: 0; width: 100%; height: 36pt; border-left-width: 0; border-top-width: 0;"></div>
             <div class="thickBorder" style="top: 60pt; left: 0; width: 100%; height: 24pt; border-left-width: 0; border-top-width: 0;"></div>
             <div class="thickBorder" style="top: 84pt; left: 0; width: 100%; height: 24pt; border-left-width: 0; border-top-width: 0;"></div>
             <div class="thickBorder" style="top: 108pt; left: 0; width: 100%; height: 24pt; border-left-width: 0; border-top-width: 0;"></div>
          </div>
          
         <div class="footerColumnRight">
            <div class="rowShort">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Судья времени</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials['timekeeper']) || ''}</span></div>
            </div>
            <div class="rowShort">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Информатор</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials['informant']) || ''}</span></div>
            </div>
            <div class="rowShort">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Линейный судья</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials['linesman-1']) || ''}</span></div>
            </div>
            <div class="rowShort">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Линейный судья</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials['linesman-2']) || ''}</span></div>
            </div>
            <div class="rowShort">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Замечание</span></div>
              <div class="cellCenter" style="width: 15%; position: relative;">
                <span class="columnTitle">да</span>
                ${hasBackNotes ? MARK_OVAL : ''}
              </div>
              <div class="cellCenter" style="width: 15%;"><span class="columnTitle">нет</span></div>
              <div class="cellCenter" style="width: 30%;"><span class="columnTitle">на обороте</span></div>
            </div>
            <div class="rowTall">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Секретарь игры</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials['secretary']) || ''}</span></div>
            </div>
            <div class="rowTall">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Главный судья</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials['main-1']) || ''}</span></div>
            </div>
            <div class="rowTall">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Главный судья</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials['main-2']) || ''}</span></div>
            </div>
            <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 24pt; border-left-width: 0;"></div>
            <div class="thickBorder" style="top: 24pt; left: 0; width: 100%; height: 24pt; border-left-width: 0; border-top-width: 0;"></div>
            <div class="thickBorder" style="top: 48pt; left: 0; width: 100%; height: 12pt; border-left-width: 0; border-top-width: 0;"></div>
            <div class="thickBorder" style="top: 60pt; left: 0; width: 100%; height: 24pt; border-left-width: 0; border-top-width: 0;"></div>
            <div class="thickBorder" style="top: 84pt; left: 0; width: 100%; height: 48pt; border-left-width: 0; border-top-width: 0;"></div>
          </div>
        </div>
        </div>
        ${renderPage2(data)}
    </body>
    </html>
    `;
};