// LMS-Backend/src/announces/announce-default.js
//
// Дефолтный анонс матчей — пост 1080×1620 (2:3) по макету «Межсезон» (02.10.2026):
// тёмный фон, шапка «логотип + название», плашка «МАТЧИ ТУРА» и матчи в виде
// билетов — синий корешок с датой и временем, перфорация, серый билет с командами.
// Им пользуются все лиги без своего файла. Прежний дефолт (сторис с ареной, макет
// ТФХ) живёт в announce-3.js.
//
// Координаты сняты с макета (1122×1402) и приведены к ширине 1080; под высоту 1620
// (06.10.2026, просьба Сергея) билеты разнесены по вертикали, сами билеты не менялись.
// Шрифты — с Google
// Fonts, как Roboto у протоколов: Tektur (заголовок), Alumni Sans (команды, дата,
// время), Montserrat (подписи с разрядкой). Своих шрифтов шаблону загружать не нужно.
// Текстура бумаги и фона рисуется SVG-шумом прямо здесь — фон-картинка необязателен.
//
// Файл самодостаточен намеренно, как и шаблоны протоколов: лига со своим
// дизайном копирует его целиком и перерисовывает как угодно — общих деталей,
// которые сломались бы у соседей, нет.

export const meta = {
    width: 1080,
    height: 1620,
    // Матчей на одной картинке. Больше — фабрика поровну делит их на несколько картинок.
    perImage: 3,
    // Ячейки материалов. Обе own — только из папки лиги: общий фон этого шаблона —
    // нарисованная текстура, а не файл, и чужой фон из общей папки сюда не попадёт.
    files: {
        background: { title: 'Фон', hint: 'Картинка 1080×1620 вместо тёмной текстуры', own: true },
        logo: { title: 'Логотип в шапке', hint: 'PNG с прозрачным фоном. Нет файла — логотип из настроек лиги', own: true },
    },
    fonts: {},
};

const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Tektur:wdth,wght@75..100,700..900'
    + '&family=Alumni+Sans:wght@900&family=Montserrat:wght@600;800&display=block';

const BLUE = '#0442e6';

// Билет: корешок слева, основная часть справа; вырезы-полукруги на внешних краях.
const TICKET = { left: 38, width: 1006, height: 260, stub: 194, notch: 28 };

// Центры билетов по вертикали и наклон (градусы) — по числу матчей. Блок билетов
// стоит между плашкой «МАТЧИ ТУРА» и подписью внизу; шаг 380 px, а один и два билета
// держатся вокруг той же средней линии (900), что и три.
const LAYOUTS = {
    1: { centers: [900], tilt: [-1.2] },
    2: { centers: [710, 1090], tilt: [-1.8, 1.6] },
    3: { centers: [520, 900, 1280], tilt: [-2.3, 0.3, 2.2] },
};

const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const pad = (n) => String(n).padStart(2, '0');

// SVG-шум для текстур: freq — крупность (больше — мельче зерно), octaves — сложность.
const noise = (freq, octaves, w = 400, h = 400, seed = 3) => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>`
        + `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/>`
        + `<feColorMatrix type='saturate' values='0'/></filter>`
        + `<rect width='100%' height='100%' filter='url(#n)'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

const GRAIN = noise(0.85, 2);
const MOTTLE = noise(0.012, 4, 1000, 400, 7);

// Подпись над билетами: «МАТЧИ 2 ТУРА», после игр — «ИТОГИ 2 ТУРА». Номер тура
// пишем, только если он у всех матчей один; плей-офф — названием стадии.
const headerLabel = (games) => {
    const prefix = games.every(g => g.result) ? 'Итоги' : 'Матчи';
    const regular = games.every(g => g.stage.type === 'regular');
    const tours = new Set(games.map(g => g.stage.number));
    if (regular && tours.size === 1 && games[0].stage.number) return `${prefix} ${games[0].stage.number} тура`;
    const stages = new Set(games.map(g => g.stage.label));
    if (games.every(g => g.stage.type === 'playoff') && stages.size === 1 && games[0].stage.label) {
        return `${prefix}: ${games[0].stage.label}`;
    }
    return `${prefix} тура`;
};

const initials = (name) => String(name || '')
    .replace(/[«»"']/g, '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

// Эмблема без файла (или файл не загрузился) — рамка с инициалами, как «ЛОГО» в макете.
const placeholder = (name, hidden) =>
    `<div class="ph"${hidden ? ' style="display:none"' : ''}>${esc(initials(name) || '?')}</div>`;

const teamLogo = (team) => {
    if (!team.logo) return placeholder(team.name, false);
    return `<img src="${esc(team.logo)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + placeholder(team.name, true);
};

const ticket = (game, center, tilt) => {
    const date = game.date ? `${pad(game.date.day)}.${pad(game.date.month)}` : '—';
    // Сыгранный матч: на месте времени — счёт, арены нет. Под командами — как получен
    // счёт, если не в основное время (в карточке расписания это «ОТ» и «Б»).
    const result = game.result;
    const second = result
        ? `${result.home}:${result.away}`
        : (game.date ? `${game.date.hours}:${game.date.minutes}` : 'скоро');
    const note = !result
        ? (game.arena?.name || 'Арена уточняется')
        : result.technical ? 'Техническое поражение'
        : result.endType === 'ot' ? 'Овертайм'
        : result.endType === 'so' ? 'Буллиты'
        : '';

    return `
    <div class="ticket" style="top:${center - TICKET.height / 2}px;transform:rotate(${tilt}deg)">
        <div class="stub">
            <div class="stub-text${result ? ' is-result' : ''}">
                <span>${esc(date)}</span>
                <span>${esc(second)}</span>
            </div>
        </div>
        <div class="main">
            <div class="logo-box home">${teamLogo(game.home)}</div>
            <div class="teams">
                <div class="name home" data-name><span>${esc((game.home.name || '—').toUpperCase())}</span></div>
                <div class="vs">vs</div>
                <div class="name away" data-name><span>${esc((game.away.name || '—').toUpperCase())}</span></div>
            </div>
            <div class="logo-box away">${teamLogo(game.away)}</div>
            ${note ? `<div class="arena"><span data-fit="12">${esc(note.toUpperCase())}</span></div>` : ''}
        </div>
    </div>`;
};

export const getHtml = ({ games, league, division, files }) => {
    const n = Math.min(Math.max(games.length, 1), meta.perImage);
    const layout = LAYOUTS[n];
    const logo = files.logo || league.logo;
    const title = (league.shortName || league.name || '').toUpperCase();
    const subtitle = (division?.name || '').toUpperCase();
    const titleLeft = logo ? 196 : 44;

    const tickets = games.map((g, i) => ticket(g, layout.centers[i], layout.tilt[i])).join('');

    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${FONTS_CSS}">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1080px; height: 1620px; overflow: hidden; }
    body { background: #151716; -webkit-font-smoothing: antialiased; }
    .stage { position: relative; width: 1080px; height: 1620px; overflow: hidden; }

    /* Фон без файла: почти чёрный, с лёгким зерном и мягкой виньеткой */
    .bg-texture, .bg-vignette { position: absolute; inset: 0; }
    .bg-texture { background: ${GRAIN}; opacity: 0.08; }
    .bg-vignette { background: radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.03), rgba(0,0,0,0.45) 90%); }
    .bg { position: absolute; inset: 0; width: 1080px; height: 1620px; object-fit: cover; }

    /* --- Шапка --- */
    .league-logo { position: absolute; left: 44px; top: 66px; width: 124px; height: 124px; object-fit: contain; }
    .title {
        position: absolute; left: ${titleLeft}px; right: 44px; top: 48px; height: 164px;
        display: flex; align-items: center; white-space: nowrap; overflow: visible;
        font-family: 'Tektur', sans-serif; font-weight: 900; font-stretch: 75%;
        font-size: 196px; line-height: 1; color: #c2c3c2;
    }
    .subtitle {
        position: absolute; left: ${titleLeft + 4}px; right: 44px; top: 222px;
        white-space: nowrap;
        font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 30px; line-height: 1;
        color: #a6a8a8; letter-spacing: 0.4em;
    }
    .label {
        position: absolute; left: 46px; right: 44px; top: 276px; white-space: nowrap;
        font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 34px; line-height: 1;
        letter-spacing: 0.12em; color: ${BLUE};
    }

    /* --- Билет --- */
    .ticket {
        position: absolute; left: ${TICKET.left}px; width: ${TICKET.width}px; height: ${TICKET.height}px;
        transform-origin: 50% 50%;
        filter: drop-shadow(0 10px 16px rgba(0, 0, 0, 0.5));
    }
    .stub, .main { position: absolute; top: 0; height: 100%; border-radius: 6px; overflow: hidden; }
    .stub {
        left: 0; width: ${TICKET.stub}px; background-color: ${BLUE};
        -webkit-mask: radial-gradient(circle ${TICKET.notch}px at 0 50%, transparent ${TICKET.notch - 1}px, #000 ${TICKET.notch}px);
        mask: radial-gradient(circle ${TICKET.notch}px at 0 50%, transparent ${TICKET.notch - 1}px, #000 ${TICKET.notch}px);
    }
    .main {
        left: ${TICKET.stub}px; right: 0; background-color: #c1c3c3;
        -webkit-mask: radial-gradient(circle ${TICKET.notch}px at 100% 50%, transparent ${TICKET.notch - 1}px, #000 ${TICKET.notch}px);
        mask: radial-gradient(circle ${TICKET.notch}px at 100% 50%, transparent ${TICKET.notch - 1}px, #000 ${TICKET.notch}px);
    }
    /* Текстура бумаги: мелкое зерно + крупные пятна */
    .stub::before, .main::before {
        content: ''; position: absolute; inset: 0; pointer-events: none;
        background: ${GRAIN}, ${MOTTLE};
        background-blend-mode: multiply;
        mix-blend-mode: multiply; opacity: 0.26;
    }
    /* Перфорация между корешком и билетом */
    .main::after {
        content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 4px;
        background: repeating-linear-gradient(180deg, #111 0 9px, transparent 9px 16px);
    }

    .stub-text {
        position: absolute; inset: 0; padding-left: 14px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
        font-family: 'Alumni Sans', sans-serif; font-weight: 900; font-size: 78px; line-height: 0.92;
        color: #c3cad8; white-space: nowrap;
    }
    .stub-text.is-result span:last-child { color: #ffffff; }

    .logo-box {
        position: absolute; top: 60px; width: 100px; height: 128px;
        display: flex; align-items: center; justify-content: center;
    }
    .logo-box.home { left: 29px; }
    .logo-box.away { left: 670px; }
    .logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .ph {
        width: 100px; height: 124px; border: 2px solid #1d1d1d;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Alumni Sans', sans-serif; font-weight: 900; font-size: 44px; color: #1d1d1d;
    }

    .teams {
        position: absolute; left: 144px; width: 511px; top: 60px; height: 116px;
        display: flex; align-items: center; justify-content: center; gap: 14px;
    }
    .name {
        width: 232px; max-height: 116px; overflow: hidden;
        font-family: 'Alumni Sans', sans-serif; font-weight: 900; font-size: 96px; line-height: 0.92;
        color: #111; white-space: nowrap;
        display: flex; align-items: center;
    }
    .name.home { justify-content: flex-end; text-align: right; }
    .name.away { justify-content: flex-start; text-align: left; }
    .vs {
        flex: none; font-family: 'Alumni Sans', sans-serif; font-weight: 900; font-size: 56px; line-height: 1;
        color: ${BLUE}; padding-top: 6px;
    }

    .arena {
        position: absolute; left: 134px; width: 524px; top: 196px; height: 24px;
        display: flex; align-items: center; gap: 18px;
        font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 18px; line-height: 1;
        letter-spacing: 0.24em; color: #1d1d1d; white-space: nowrap;
    }
    .arena::before, .arena::after { content: ''; flex: 1; min-width: 30px; height: 2px; background: #2a2a2a; }

    /* Подпись платформы в левом нижнем углу */
    .signature {
        position: absolute; left: 44px; bottom: 30px;
        font-family: 'Tektur', sans-serif; font-weight: 800; font-size: 26px; line-height: 1;
        letter-spacing: 0.14em; color: rgba(255, 255, 255, 0.45);
    }
</style>
</head>
<body>
<div class="stage">
    ${files.background
        ? `<img class="bg" src="${esc(files.background)}" alt="" onerror="this.style.display='none'">`
        : '<div class="bg-texture"></div><div class="bg-vignette"></div>'}
    ${logo ? `<img class="league-logo" src="${esc(logo)}" alt="" onerror="this.style.display='none'">` : ''}
    <div class="title" data-fit="60"><span>${esc(title)}</span></div>
    ${subtitle ? `<div class="subtitle" data-justify><span>${esc(subtitle)}</span></div>` : ''}
    <div class="label" data-fit="20"><span>${esc(headerLabel(games).toUpperCase())}</span></div>
    ${tickets}
    <div class="signature">HOCKEYECO LMS</div>
</div>
<script>
// Готовность для сервера: шрифты подгружены, картинки пришли (или упали), длинные
// надписи ужаты. Сервер ждёт window.__announceReady и только потом снимает кадр.
(function () {
    // Одна строка: уменьшаем кегль, пока текст не влезет в ширину.
    function fitLine(el, min) {
        var span = el.firstElementChild || el;
        var size = parseFloat(getComputedStyle(el).fontSize);
        while (span.getBoundingClientRect().width > el.getBoundingClientRect().width && size > min) {
            size -= 1;
            el.style.fontSize = size + 'px';
        }
    }
    // Название команды: сперва ужимаем в строку до 56, не влезло — переносим на две
    // строки и ужимаем дальше до 34.
    function fitName(el) {
        var span = el.firstElementChild;
        var size = 96;
        el.style.fontSize = size + 'px';
        while (span.offsetWidth > el.clientWidth && size > 56) { size -= 1; el.style.fontSize = size + 'px'; }
        if (span.offsetWidth <= el.clientWidth) return;
        el.style.whiteSpace = 'normal';
        span.style.display = 'block';
        while ((span.offsetHeight > el.clientHeight || span.scrollWidth > el.clientWidth) && size > 34) {
            size -= 1; el.style.fontSize = size + 'px';
        }
    }
    // Подзаголовок растягиваем разрядкой на всю ширину шапки, как в макете.
    function justify(el) {
        var span = el.firstElementChild;
        var chars = span.textContent.length;
        if (chars < 2) return;
        var size = parseFloat(getComputedStyle(el).fontSize);
        span.style.letterSpacing = '0px';
        var natural = span.getBoundingClientRect().width;
        var spacing = (el.clientWidth - natural) / chars;
        var maxSpacing = size * 0.6, minSpacing = size * 0.08;
        if (spacing < minSpacing) {
            span.style.letterSpacing = minSpacing + 'px';
            fitLine(el, 16);
            return;
        }
        span.style.letterSpacing = Math.min(spacing, maxSpacing) + 'px';
    }
    function layout() {
        document.querySelectorAll('[data-fit]').forEach(function (el) {
            var box = el.tagName === 'SPAN' ? el.parentElement : el;
            if (el.tagName === 'SPAN') {
                var size = parseFloat(getComputedStyle(box).fontSize);
                var min = Number(el.getAttribute('data-fit'));
                while (el.getBoundingClientRect().width > box.clientWidth - 120 && size > min) {
                    size -= 1; box.style.fontSize = size + 'px';
                }
            } else {
                fitLine(el, Number(el.getAttribute('data-fit')));
            }
        });
        document.querySelectorAll('[data-name]').forEach(fitName);
        document.querySelectorAll('[data-justify]').forEach(justify);
    }
    var images = Array.prototype.map.call(document.images, function (img) {
        return img.complete ? null : new Promise(function (resolve) {
            img.addEventListener('load', resolve);
            img.addEventListener('error', resolve);
        });
    });
    var fonts = ['900 196px Tektur', '800 26px Tektur', '900 96px "Alumni Sans"', '600 30px Montserrat', '800 34px Montserrat']
        .map(function (f) { return document.fonts.load(f).catch(function () {}); });
    Promise.all(fonts.concat(images))
        .then(function () { return document.fonts.ready; })
        .then(function () { layout(); window.__announceReady = true; });
})();
</script>
</body>
</html>`;
};
