// LMS-Backend/src/announces/announce-3.js
//
// Анонс матчей лиги 3 (ТФХ) — сторис 1080×1920 по макету «Анонс матчей — 2 тур»
// (PSD, 29.09.2026). Тот же макет, что у дефолтного шаблона, плюс логотип
// дивизиона под матчами (просьба Сергея 02.10.2026). Раскладка поэтому своя:
// блок матчей стоит выше, чтобы логотипу дивизиона хватило места до низа сторис.
//
// Все координаты сняты со слоёв макета. Карточка матча — полоса высотой 318 px,
// внутри неё всё отсчитывается от верхнего края полосы (там, где у предыдущей
// карточки разделительная линия). Отступы «top» у текстов подобраны так, чтобы
// верх заглавных букв попадал ровно туда же, где он в макете: у Aire Exterior
// заглавные начинаются на 0,17 кегля ниже края строки, у Arial — на 0,1.
//
// Файл самодостаточен намеренно, как и шаблоны протоколов: лига со своим
// дизайном копирует его целиком и перерисовывает как угодно — общих деталей,
// которые сломались бы у соседей, нет.

export const meta = {
    width: 1080,
    height: 1920,
    // Матчей на одной картинке. Больше — фабрика поровну делит их на несколько картинок.
    perImage: 4,
    // Ячейки материалов — их загружает глобальный администратор (Команды → Лиги),
    // фон можно сменить и из окна анонса. Все ячейки own — только из папки лиги:
    // общая папка принадлежит дефолтному шаблону с другим дизайном, и его фон
    // со шрифтом сюда не подходят.
    files: {
        background: { title: 'Фон', hint: 'Картинка 1080×1920 под всей сторис', own: true },
        logo: { title: 'Логотип над матчами', hint: 'PNG с прозрачным фоном. Нет файла — логотип из настроек лиги', own: true },
    },
    fonts: {
        font: { title: 'Шрифт', hint: 'Круг и тур, дата, время, названия команд (Aire Exterior)', own: true },
    },
};

const CARD = 318;           // шаг карточек: от линии до линии
const PANEL_INSET = 15;     // тёмная подложка начинается на 15 px ниже верха первой карточки

// Раскладка по числу матчей. С логотипом дивизиона: три матча — как в макете, а
// логотип дивизиона под ними; один и два — блок «матчи + логотип дивизиона»
// по центру свободного места; при четырёх всё поднимается и мельчает, чтобы снизу
// остался запас под интерфейс сторис. divGap — от последней линии до логотипа
// дивизиона, divSize — его высота.
const LAYOUTS = {
    1: { logoTop: 116, logoSize: 288, panelTop: 880, divGap: 60, divSize: 200 },
    2: { logoTop: 116, logoSize: 288, panelTop: 720, divGap: 60, divSize: 200 },
    3: { logoTop: 116, logoSize: 288, panelTop: 526, divGap: 60, divSize: 200 },
    4: { logoTop: 70, logoSize: 210, panelTop: 350, divGap: 40, divSize: 150 },
};

// У дивизиона нет логотипа — раскладка дефолтного шаблона, без пустого места внизу.
const LAYOUTS_NO_DIVISION_LOGO = {
    1: { logoTop: 116, logoSize: 288, panelTop: 845 },
    2: { logoTop: 116, logoSize: 288, panelTop: 686 },
    3: { logoTop: 116, logoSize: 288, panelTop: 526 },
    4: { logoTop: 96, logoSize: 240, panelTop: 426 },
};

const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// В Aire Exterior у нуля внутри чёрточка — в макете все нули набраны латинской «O».
const zeroAsO = (text) => text.replace(/0/g, 'O');

const pad = (n) => String(n).padStart(2, '0');

// «1-й круг» + тур 2 → «1 КРУГ  •  2 ТУР»; плей-офф: «1/4 ФИНАЛА  •  МАТЧ 2».
const stageText = (stage) => {
    const parts = [];
    const label = (stage.label || '').trim().replace(/^(\d+)-[йяе]\s+/i, '$1 ');
    if (stage.matchType) {
        parts.push(`Матч за ${stage.matchType.replace('place_', '')}-е место`);
    } else {
        if (label) parts.push(label);
        if (stage.number) parts.push(stage.type === 'playoff' ? `Матч ${stage.number}` : `${stage.number} тур`);
    }
    return parts.join('  •  ').toUpperCase();
};

const initials = (name) => String(name || '')
    .replace(/[«»"']/g, '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

// Эмблема без файла (или файл не загрузился) — кольцо с инициалами в стиле линий макета.
const placeholder = (name, hidden) =>
    `<div class="ph display"${hidden ? ' style="display:none"' : ''}>${esc(initials(name) || '?')}</div>`;

const teamLogo = (team) => {
    if (!team.logo) return placeholder(team.name, false);
    return `<img src="${esc(team.logo)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + placeholder(team.name, true);
};

// data-fit — минимальный кегль: скрипт внизу уменьшает текст, пока он не влезет в ширину.
const text = (cls, value, min) =>
    `<div class="t ${cls}"${min ? ` data-fit="${min}"` : ''}><span>${esc(value)}</span></div>`;

const card = (game, top, league) => {
    const date = game.date
        ? zeroAsO(`${pad(game.date.day)}.${pad(game.date.month)}.${String(game.date.year).slice(-2)}`)
        : 'ДАТА УТОЧНЯЕТСЯ';
    const time = game.date ? zeroAsO(`${game.date.hours}:${game.date.minutes}`) : '';

    // Город арены пишем, только если он не совпадает с городом лиги: в макете
    // «ТМО» стоит под «Звездой», а под тюменскими аренами города нет.
    const norm = (s) => String(s || '').trim().toLowerCase();
    const arenaCity = game.arena?.city && norm(game.arena.city) !== norm(league.city) ? game.arena.city : '';

    // Сыгранный матч: на месте времени — счёт, арены нет. Под счётом — как он
    // получен, если не в основное время (в карточке расписания это «ОТ» и «Б»).
    const result = game.result;
    const resultNote = !result ? ''
        : result.technical ? 'Техническое поражение'
        : result.endType === 'ot' ? 'Овертайм'
        : result.endType === 'so' ? 'Буллиты'
        : '';
    const middle = result
        ? `${text('time display', zeroAsO(`${result.home} : ${result.away}`), 60)}
        ${resultNote ? text('arena body', resultNote, 16) : ''}`
        : `${time ? text('time display', time, 60) : ''}
        ${text('arena body', game.arena?.name || 'Арена уточняется', 16)}
        ${arenaCity ? text('arena-city body', arenaCity, 16) : ''}`;

    return `
    <div class="card" style="top:${top}px">
        ${text('round display', stageText(game.stage), 22)}
        ${text('date display', date, 26)}
        ${middle}

        <div class="logo-box home">${teamLogo(game.home)}</div>
        ${text('name home display', (game.home.name || '—').toUpperCase(), 28)}
        ${game.home.city ? text('city home body', game.home.city, 16) : ''}

        <div class="logo-box away">${teamLogo(game.away)}</div>
        ${text('name away display', (game.away.name || '—').toUpperCase(), 28)}
        ${game.away.city ? text('city away body', game.away.city, 16) : ''}
    </div>`;
};

export const getHtml = ({ games, league, division, files, fonts }) => {
    const n = Math.min(Math.max(games.length, 1), meta.perImage);
    const divisionLogo = division?.logo || null;
    const layout = (divisionLogo ? LAYOUTS : LAYOUTS_NO_DIVISION_LOGO)[n];
    const firstTop = layout.panelTop - PANEL_INSET;
    const lastLine = firstTop + CARD * n;
    const logo = files.logo || league.logo;

    const cards = games.map((g, i) => card(g, firstTop + CARD * i, league)).join('');
    const lines = games.map((_, i) => {
        const y = firstTop + CARD * (i + 1);
        return `<div class="line" style="top:${y}px"></div><div class="accent" style="top:${y - 3}px"></div>`;
    }).join('');

    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
    ${fonts.font ? `@font-face { font-family: 'AnnounceDisplay'; src: url(${fonts.font}); }` : ''}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1080px; height: 1920px; overflow: hidden; }
    body { background: linear-gradient(180deg, #0b2a52 0%, #04142b 100%); -webkit-font-smoothing: antialiased; }
    .stage { position: relative; width: 1080px; height: 1920px; overflow: hidden; }
    .bg { position: absolute; inset: 0; width: 1080px; height: 1920px; object-fit: cover; }

    .league-logo {
        position: absolute; left: 50%; transform: translateX(-50%);
        object-fit: contain;
        filter: drop-shadow(0 0 24px rgba(0, 0, 0, 0.4));
    }
    /* Логотип дивизиона под матчами: та же тень, что у логотипа лиги; рамка шире
       высоты — эмблемы дивизионов бывают вытянутыми */
    .division-logo {
        position: absolute; left: 50%; transform: translateX(-50%); width: 360px;
        object-fit: contain;
        filter: drop-shadow(0 0 24px rgba(0, 0, 0, 0.4));
    }

    /* Подложка: тёмно-синяя, по краям растворяется — профиль прозрачности снят с макета */
    .panel {
        position: absolute; left: 103px; width: 894px;
        background: linear-gradient(90deg,
            rgba(2, 17, 38, 0.22) 0px,
            rgba(2, 17, 38, 0.68) 80px,
            rgba(2, 17, 38, 0.75) 120px,
            rgba(2, 17, 38, 0.85) 200px,
            rgba(2, 17, 38, 0.91) 240px,
            rgba(2, 17, 38, 0.91) 620px,
            rgba(2, 17, 38, 0.84) 680px,
            rgba(2, 17, 38, 0.74) 760px,
            rgba(2, 17, 38, 0.64) 800px,
            rgba(2, 17, 38, 0.42) 840px,
            rgba(2, 17, 38, 0.17) 880px,
            rgba(2, 17, 38, 0.08) 894px);
    }
    .line { position: absolute; left: 103px; width: 913px; height: 2px; background: #d3e6ed; }
    .accent { position: absolute; left: 104px; width: 32px; height: 8px; background: #29b7ec; }

    .card { position: absolute; left: 0; width: 1080px; height: ${CARD}px; }
    .t { position: absolute; text-align: center; white-space: pre; color: #fff; }
    .t span { display: inline-block; }
    /* В макете эти строки растянуты по горизонтали (масштаб текста в Photoshop) */
    .round span { transform: scaleX(1.1); }
    .date span  { transform: scaleX(1.05); }
    .time span  { transform: scaleX(1.2); }
    .display { font-family: 'AnnounceDisplay', 'Arial Narrow', Arial, sans-serif; }
    .body { font-family: Arial, 'Liberation Sans', sans-serif; }

    .round      { top: 43px;  left: 405px; width: 270px; font-size: 31px; line-height: 31px; }
    .date       { top: 94px;  left: 405px; width: 270px; font-size: 44px; line-height: 44px; color: #31b7ec; }
    .time       { top: 136px; left: 405px; width: 270px; font-size: 82px; line-height: 82px; }
    .arena      { top: 235px; left: 405px; width: 270px; font-size: 24px; line-height: 24px; }
    .arena-city { top: 263px; left: 405px; width: 270px; font-size: 24px; line-height: 24px; }

    .logo-box {
        position: absolute; top: 49px; width: 220px; height: 152px;
        display: flex; align-items: center; justify-content: center;
    }
    .logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .logo-box.home { left: 135px; }
    .logo-box.away { left: 725px; }
    .ph {
        width: 132px; height: 132px; border-radius: 50%;
        border: 2px solid rgba(211, 230, 237, 0.55);
        display: flex; align-items: center; justify-content: center;
        font-size: 54px; color: rgba(255, 255, 255, 0.85);
    }

    .name { top: 218px; width: 280px; font-size: 46px; line-height: 46px; }
    .city { top: 269px; width: 280px; font-size: 23px; line-height: 23px; color: #d3e3eb; }
    .home.name, .home.city { left: 105px; }
    .away.name, .away.city { left: 695px; }

    /* Подпись платформы внизу по центру; адрес сайта подчёркнут, как ссылка */
    .signature {
        position: absolute; left: 0; right: 0; bottom: 34px; text-align: center; white-space: nowrap;
        font-size: 36px; line-height: 40px; letter-spacing: 0.06em;
        color: rgba(255, 255, 255, 0.7);
    }
    .signature .dot { margin: 0 0.35em; }
    .signature u { text-decoration-thickness: 2px; text-underline-offset: 6px; }
</style>
</head>
<body>
<div class="stage">
    ${files.background ? `<img class="bg" src="${esc(files.background)}" alt="" onerror="this.style.display='none'">` : ''}
    ${logo ? `<img class="league-logo" src="${esc(logo)}" alt="" style="top:${layout.logoTop}px;width:${layout.logoSize}px;height:${layout.logoSize}px" onerror="this.style.display='none'">` : ''}
    <div class="panel" style="top:${layout.panelTop}px;height:${lastLine - layout.panelTop}px"></div>
    ${lines}
    ${cards}
    ${divisionLogo ? `<img class="division-logo" src="${esc(divisionLogo)}" alt="" style="top:${lastLine + 2 + layout.divGap}px;height:${layout.divSize}px" onerror="this.style.display='none'">` : ''}
    <div class="signature display">HOCKEYECO LMS<span class="dot">•</span><u>info.hockeyeco.ru</u></div>
</div>
<script>
// Готовность для сервера: шрифт подгружен, картинки пришли (или упали), длинные
// надписи ужаты по ширине. Сервер ждёт window.__announceReady и только потом снимает кадр.
(function () {
    function fit() {
        document.querySelectorAll('[data-fit]').forEach(function (el) {
            var span = el.firstElementChild;
            var min = Number(el.getAttribute('data-fit'));
            var size = parseFloat(getComputedStyle(el).fontSize);
            // getBoundingClientRect, а не offsetWidth: он учитывает растяжение scaleX
            while (span.getBoundingClientRect().width > el.clientWidth && size > min) {
                size -= 1;
                el.style.fontSize = size + 'px';
            }
        });
    }
    var images = Array.prototype.map.call(document.images, function (img) {
        return img.complete ? null : new Promise(function (resolve) {
            img.addEventListener('load', resolve);
            img.addEventListener('error', resolve);
        });
    });
    var font = document.fonts.load('46px AnnounceDisplay').catch(function () {});
    Promise.all([font].concat(images))
        .then(function () { return document.fonts.ready; })
        .then(function () { fit(); window.__announceReady = true; });
})();
</script>
</body>
</html>`;
};
