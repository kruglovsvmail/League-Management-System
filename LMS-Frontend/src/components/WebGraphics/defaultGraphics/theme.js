// src/components/WebGraphics/defaultGraphics/theme.js
//
// Стандартная эфирная графика — фирменный стиль HockeyEco (design/brand) в цветах
// Team Room.
//
// ОТКУДА ЦВЕТА
//   Графит        — градиент иконок HockeyEco: центр #1D1E1E, к краю #414343 →
//                   #505252 («осветление края»). Им залиты все плашки.
//   Синий         — акцент TR: #1794DD (светлая тема) и левый край кнопки
//                   #1379B5. Заливка «как основная кнопка TR»: градиент слева
//                   направо + белый 25% сверху.
//   Линии конька  — #43B5F5, цвет линий и надписи HECO на иконке TR. Две
//                   параллельные линии под 45° — только на свободных краях,
//                   через текст и таблицы не проводятся (правило бренда).
//   Текст         — тёмная тема TR: #F5F5F3 / #E8E8E4 / #9C9C96 / #636360.
//   Статусы       — danger/success TR. Они не заменяются цветом бренда.
//
// В OBS нет backdrop-filter, поэтому стекла здесь нет вовсе: плашки плотные,
// глубину дают осветление края, верхний блик и рамка.

export const C = {
  ink: '#0E0F0F',        // самое тёмное — ячейки счёта, подложки цифр
  g1: '#1D1E1E',         // центр графита (иконка, PWA-заставка)
  g2: '#262727',
  g3: '#414343',         // осветление края, средний стоп
  g4: '#505252',         // осветление края, внешний стоп
  rim: 'rgba(255,255,255,0.07)',
  rimHi: 'rgba(255,255,255,0.14)',
  divider: 'rgba(255,255,255,0.08)',

  text: '#F5F5F3',
  main: '#E8E8E4',
  muted: '#9C9C96',
  subtle: '#7C7C77',     // тише muted, но в эфире ещё читается

  accent: '#1794DD',     // акцент TR
  accentDeep: '#1379B5', // левый край кнопки TR
  accentSoft: '#60A5FA', // акцент TR в тёмной теме — текст по графиту
  skate: '#43B5F5',      // линии конька

  danger: '#DC2626',
  dangerSoft: '#F07171',
  success: '#22A833',
};

export const FONT = "'Manrope', Arial, sans-serif";

// Цифры — Tektur (SIL OFL, public/fonts): табличные, как на настоящем табло, а
// срезанные под 45° углы — тот же угол, что у линий конька. Им же набраны
// громкие слова вроде «ГОЛ». Имена и подписи остаются в Manrope.
export const NUM = "'Tektur', 'Manrope', Arial, sans-serif";

// Графит иконки. farthest-corner — как в SVG иконки: центр тёмный, к углам
// светлее. Для длинных плашек осветление мягче, иначе концы полосы выходят
// почти серыми.
export const GRAPHITE = `radial-gradient(farthest-corner at 50% 50%, ${C.g1} 0%, ${C.g1} 42%, ${C.g3} 72%, ${C.g4} 100%)`;
export const GRAPHITE_WIDE = `radial-gradient(farthest-corner at 50% 40%, ${C.g1} 0%, ${C.g1} 55%, #2F3030 82%, #3A3C3C 100%)`;
export const GRAPHITE_FLAT = `linear-gradient(180deg, #232424 0%, ${C.g1} 100%)`;

// Заливка основной кнопки TR: белый 25% сверху поверх синего градиента.
export const ACCENT_FILL = `linear-gradient(180deg, #FFFFFF40 0%, #FFFFFF00 100%), linear-gradient(90deg, ${C.accentDeep} 0%, ${C.accent} 100%)`;
export const DANGER_FILL = `linear-gradient(180deg, #FFFFFF33 0%, #FFFFFF00 100%), linear-gradient(90deg, #A51C1C 0%, ${C.danger} 100%)`;

// Тени и кромка: верхний блик вместо стекла.
export const LIFT = `inset 0 1px 0 ${C.rimHi}, inset 0 0 0 1px ${C.rim}, 0 24px 60px -12px rgba(0,0,0,0.55), 0 8px 18px rgba(0,0,0,0.35)`;
export const LIFT_SM = `inset 0 1px 0 ${C.rimHi}, inset 0 0 0 1px ${C.rim}, 0 10px 24px -6px rgba(0,0,0,0.5)`;

export const panel = (radius = 20, wide = false) => ({
  background: wide ? GRAPHITE_WIDE : GRAPHITE,
  borderRadius: radius,
  boxShadow: LIFT,
});

// --- Цвет команды -----------------------------------------------------------
//
// Цвета формы бывают чёрными и тёмно-синими — по графиту такая полоса пропадает.
// Подтягиваем яркость до читаемой, сохраняя оттенок.

const parseHex = (hex) => {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};

const luminance = ([r, g, b]) => {
  const ch = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};

const toHex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function liftColor(hex, fallback, minLum = 0.06) {
  const rgb = parseHex(hex);
  if (!rgb) return fallback;
  let cur = rgb;
  for (let k = 0.08; luminance(cur) < minLum && k <= 0.9; k += 0.08) {
    cur = rgb.map(v => v + (255 - v) * k);
  }
  return toHex(cur);
}

export function rgba(hex, a) {
  const rgb = parseHex(hex) || [23, 148, 221];
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

// Хозяева по умолчанию — синий TR, гости — светлый текст TR.
//
// Цвет команды — цвета её ДОМАШНЕЙ формы (*_team_color), и у гостей тоже: у
// гостевой формы акцент бывает белым, и команда выходила серой (решение
// Сергея, 12.10.2026). Цвета формы на этот матч (*_color_1/2) — запасные, на
// случай старого бэкенда без новых полей.
//
// Если первый цвет почти чёрный, а второй есть и он живой, берём второй:
// чёрно-красная команда должна читаться красной, а не серой.
const colorOf = (game, side) => {
  const own = game?.[`${side}_team_color`];
  const c1 = own || game?.[`${side}_color_1`];
  const c2 = own ? game?.[`${side}_team_color_2`] : game?.[`${side}_color_2`];
  const l1 = parseHex(c1) ? luminance(parseHex(c1)) : null;
  const l2 = parseHex(c2) ? luminance(parseHex(c2)) : null;
  if (l1 != null && l1 < 0.03 && l2 != null && l2 >= 0.03 && l2 < 0.85) return c2;
  return c1;
};

export const teamColor = (game, side) => side === 'home'
  ? liftColor(colorOf(game, 'home'), C.accent)
  : liftColor(colorOf(game, 'away'), C.main);

// Цвет команды для ТЕКСТА по графиту — ярче, чем для полос: тонкие буквы
// тёмно-синим по тёмному не читаются.
export const teamInk = (game, side) => side === 'home'
  ? liftColor(colorOf(game, 'home'), C.accentSoft, 0.2)
  : liftColor(colorOf(game, 'away'), C.main, 0.2);

export const teamShort = (game, side) => {
  const short = game?.[`${side}_short_name`];
  if (short) return short;
  const name = game?.[`${side}_team_name`];
  return name ? name.substring(0, 3).toUpperCase() : (side === 'home' ? 'ХОЗ' : 'ГОС');
};

// --- Время ------------------------------------------------------------------

export const formatClock = (s) => {
  if (s === undefined || s === null || isNaN(s) || s < 0) return '0:00';
  const v = Math.floor(s);
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

// Табло считает время до конца периода, а таймер матча идёт от начала игры.
export function periodRemaining({ currentPeriod, timerSeconds, periodLength, otLength }) {
  const p = periodLength || 20;
  let max = 0;
  if (currentPeriod === '1') max = p * 60;
  else if (currentPeriod === '2') max = p * 2 * 60;
  else if (currentPeriod === '3') max = p * 3 * 60;
  else if (currentPeriod === 'OT') max = (p * 3 + (otLength || 5)) * 60;
  else return 0;
  return Math.max(0, max - (timerSeconds || 0));
}

export const periodShort = (period) => {
  if (period === 'OT') return 'ОТ';
  if (period === 'SO') return 'БУЛ';
  return `${period} ПЕР`;
};

export const periodLong = (period) => {
  if (period === 'OT') return 'ОВЕРТАЙМ';
  if (period === 'SO') return 'БУЛЛИТЫ';
  return `${period} ПЕРИОД`;
};

// Время события «2П · 12:34» — по абсолютной секунде матча.
export function eventStamp(secs, periodLength) {
  if (secs == null || isNaN(secs)) return '';
  const len = (periodLength || 20) * 60;
  let p = 1; let r = secs;
  if (secs >= len * 3) { p = 'ОТ'; r = secs - len * 3; }
  else if (secs >= len * 2) { p = 3; r = secs - len * 2; }
  else if (secs >= len) { p = 2; r = secs - len; }
  return `${p === 'ОТ' ? 'ОТ' : `${p}П`} · ${formatClock(r)}`;
}

export const countdown = (s) => {
  const v = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

export const dateText = (game) => {
  if (!game?.game_date) return '';
  const d = new Date(game.game_date);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const stageText = (game) => {
  const n = game?.series_number || 1;
  if (game?.stage_type === 'playoff') {
    return [game.stage_label, `МАТЧ ${n}`].filter(Boolean).join(' · ');
  }
  return `ТУР ${n}`;
};

// --- Составы на льду --------------------------------------------------------

export function strengthState(game, activePenalties) {
  const list = Array.isArray(activePenalties) ? activePenalties : [];
  const home = list.filter(p => p.team_id === game.home_team_id).slice(0, 2);
  const away = list.filter(p => p.team_id === game.away_team_id).slice(0, 2);
  const h = 5 - home.length;
  const a = 5 - away.length;
  let label = null; let pp = null;
  if (h < 5 || a < 5) {
    if (h === a) label = `${h} НА ${a}`;
    else {
      pp = h > a ? 'home' : 'away';
      label = `${Math.max(h, a)} НА ${Math.min(h, a)}`;
    }
  }
  return { home, away, label, pp };
}

export function techScore(game) {
  const isTech = !!game?.is_technical;
  if (!isTech) return { isTech, home: game?.home_score ?? 0, away: game?.away_score ?? 0 };
  const parts = typeof game.is_technical === 'string' ? game.is_technical.split('/') : ['+', '-'];
  return { isTech, home: parts[0] ?? '+', away: parts[1] ?? '-' };
}

// Серия буллитов: попытки по командам и число слотов (с добавочным раундом).
export function shootoutState(game, events, currentPeriod, soLength = 3) {
  const pick = teamId => (events || []).filter(e => e.period === 'SO' && e.team_id === teamId
    && ['shootout_goal', 'shootout_miss'].includes(e.event_type));
  const home = pick(game.home_team_id);
  const away = pick(game.away_team_id);
  let slots = soLength || 3;
  if (currentPeriod === 'SO') {
    const taken = Math.max(home.length, away.length);
    const done = home.length === taken && away.length === taken;
    const hg = home.filter(s => s.event_type === 'shootout_goal').length;
    const ag = away.filter(s => s.event_type === 'shootout_goal').length;
    slots = done && hg === ag && taken >= slots ? taken + 1 : Math.max(slots, taken);
  }
  return { home, away, slots };
}

export const GOAL_STRENGTH = {
  pp1: 'В большинстве',
  pp2: 'В большинстве 5 на 3',
  sh1: 'В меньшинстве',
  sh2: 'В меньшинстве 3 на 5',
  en: 'В пустые ворота',
  ps: 'Штрафной бросок',
};

// Судьи и комментаторы. Публичный матч отдаёт роли ключами 'main-1',
// 'linesman-1', 'commentator-1'; старые имена полей тоже понимаем.
export function officialsOf(game) {
  const o = game?.officials || {};
  return {
    heads: [o['main-1'] || o.head_1, o['main-2'] || o.head_2].filter(Boolean),
    linesmen: [o['linesman-1'] || o.linesman_1, o['linesman-2'] || o.linesman_2].filter(Boolean),
    commentators: [o['commentator-1'] || o.media, o['commentator-2']].filter(Boolean),
  };
}

// Полноэкранные плашки, под которыми угловое табло прячется.
export const FULLSCREEN = ['prematch', 'scorebar', 'bumper', 'intermission', 'team_leaders', 'team_roster',
  'team_comparison', 'tournament', 'division_nominations'];
