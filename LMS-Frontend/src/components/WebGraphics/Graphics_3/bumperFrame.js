// src/components/WebGraphics/Graphics_3/bumperFrame.js
//
// Геометрия перехода лиги 3 и его отрисовка на canvas.
//
// ЭТО ЕДИНСТВЕННЫЙ ИСТОЧНИК РИСУНКА. Переход собирается один раз в панели
// трансляции: кадры считаются здесь, кодируются в WebM с прозрачностью и
// уходят в S3. Эфир и Stinger-переход в OBS играют буквально один и тот же
// файл, поэтому разъехаться им негде.
//
// СЦЕНАРИЙ
//   0,00–0,62 с  две шторки влетают из противоположных углов, на каждой —
//                крупная эмблема команды и название
//   0,62–0,88 с  удар: шторки сходятся внахлёст и трясутся, по шву вспышка,
//                во все стороны разлетается ледяная крошка
//   0,64–1,01 с  из центра с увеличением разворачивается эмблема дивизиона
//   1,01–1,62 с  статика
//   1,62–2,64 с  шторки разъезжаются в ДРУГИЕ углы, эмблема дивизиона растёт
//                и резко тает
//
// Шов идёт по диагонали ровно в 45°: тогда нормаль к нему смотрит точно в угол
// кадра, и шторки въезжают именно из углов, а не «сверху» и «снизу».
//
// О ЦЕНЕ КАДРА. Запись идёт в реальном времени, на кадр есть 33 мс, и не
// уложиться в них — значит получить рывки в готовом файле. Всё, что от кадра к
// кадру не меняется — градиенты, блоки команд, вспышка шва — считается один раз
// и лежит в кэше на контексте; кадр только расставляет готовое по местам.
import { T, FONT_DISPLAY } from './theme';

export const SWEEP_MS = 2640;   // весь переход
export const COVER_MS = 1120;   // кадр наглухо перекрыт — здесь меняют картинку

export const FRAME_W = 1920;
export const FRAME_H = 1080;

// --- Тайминги фаз, мс -------------------------------------------------------
const T_SLAM = 620;      // шторки встали на место
const T_SHAKE = 880;     // тряска затухла
const T_DIV_IN = 640;    // эмблема дивизиона пошла в рост
const T_DIV_SET = 1010;  // встала на место
const T_HOLD = 1620;     // конец статики, начало разъезда — ровно секунда с удара
const T_SPARKS = 520;    // сколько живёт разлетевшаяся крошка

// --- Геометрия --------------------------------------------------------------
const SEAM_RAD = (-45 * Math.PI) / 180;
const SEAM_COS = Math.cos(SEAM_RAD);
const SEAM_SIN = Math.sin(SEAM_RAD);

// Координаты шторки: x — вдоль шва, y — поперёк. Половина диагонали кадра ~1102,
// поэтому этих размеров хватает, чтобы шторка и перекрывала свою половину, и
// полностью уходила за кадр.
const EXT = 1300;         // половина длины вдоль шва
const SLAB = 1400;        // толщина поперёк шва
const IN_TRAVEL = 1500;   // въезд по нормали (из угла)
const OUT_TRAVEL = 2800;  // выезд вдоль шва (в другой угол)
const EDGE_W = 14;        // серебряная кромка по шву
const ACCENT_W = 6;       // цветная нитка команды сразу за кромкой
const TRAIL_W = 110;      // белый след за кромкой
const OVERLAP = 34;       // насколько шторки заходят друг на друга при тряске

const CREST_TEAM = 400;   // эмблема команды на шторке
const CREST_DIV = 620;    // эмблема дивизиона по центру

// Куда ложатся блоки команд. Точки смещены по диагонали, а не поставлены по
// центрам половин: у шва в 45° места тем больше, чем дальше от него, и так
// длинное название не упирается в кромку соседней шторки.
const HOME_AT = { x: 440, y: 400 };
const AWAY_AT = { x: 1480, y: 680 };

const SPRITE_W = 780;
const SPRITE_H = 580;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// --- Кривые -----------------------------------------------------------------

// Влёт: разгон и резкая остановка — отсюда ощущение удара.
const easeSlam = (t) => Math.pow(clamp01(t), 1.4);
// Разъезд: срывается с места и мягко уходит.
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);

// Затухающая тряска, -1..1. Считается от времени, а не от случайных чисел:
// файл должен собираться одинаково при каждой пересборке.
function shake(ms) {
  if (ms < T_SLAM || ms > T_SHAKE) return 0;
  const k = (ms - T_SLAM) / (T_SHAKE - T_SLAM);
  return Math.sin(k * Math.PI * 5) * (1 - k) * (1 - k);
}

// Вспышка по шву — короткое окно вокруг удара.
export function seamAlpha(ms) {
  if (ms < T_SLAM - 60 || ms > T_SHAKE) return 0;
  if (ms < T_SLAM) return (ms - (T_SLAM - 60)) / 60;
  return Math.pow(1 - (ms - T_SLAM) / (T_SHAKE - T_SLAM), 1.6);
}

/**
 * Положение шторки в её собственных координатах.
 * @param {number} ms   время от начала перехода
 * @param {boolean} top true — верхняя (дом), false — нижняя (гости)
 */
export function shutterOffset(ms, top) {
  const dir = top ? -1 : 1;

  if (ms <= T_SLAM) {
    return { x: 0, y: dir * IN_TRAVEL * (1 - easeSlam(ms / T_SLAM)) };
  }
  if (ms <= T_HOLD) {
    // На тряске шторки заходят друг на друга, а не расходятся: разойдись они —
    // по шву открылась бы прозрачная щель прямо посреди перекрытия кадра.
    return { x: 0, y: -dir * Math.abs(shake(ms)) * OVERLAP };
  }
  const t = easeOut((ms - T_HOLD) / (SWEEP_MS - T_HOLD));
  // Уходят вдоль шва — то есть в углы, противоположные тем, откуда пришли
  return { x: (top ? 1 : -1) * OUT_TRAVEL * t, y: 0 };
}

// Эмблема дивизиона: рост из центра, пульс на статике, взрывной уход.
export function divisionState(ms) {
  if (ms < T_DIV_IN) return { alpha: 0, scale: 0 };

  if (ms <= T_DIV_SET) {
    const t = (ms - T_DIV_IN) / (T_DIV_SET - T_DIV_IN);
    return { alpha: clamp01(t * 1.8), scale: lerp(0.22, 1.08, easeOut(t)) };
  }

  if (ms <= T_HOLD) {
    // Осадка после перелёта — и дальше стоит неподвижно
    return { alpha: 1, scale: lerp(1.08, 1, clamp01((ms - T_DIV_SET) / 180)) };
  }

  const t = (ms - T_HOLD) / (SWEEP_MS - T_HOLD);
  // Растёт до конца, а тает быстрее — уходит раньше, чем шторки
  return {
    alpha: Math.pow(clamp01(1 - t / 0.8), 1.5),
    scale: lerp(1, 2.5, easeOut(t)),
  };
}

// --- Кэш заготовок ----------------------------------------------------------
//
// Кэш живёт на самом контексте. Холст под сборку создаётся заново на каждый
// запуск, вместе с ним обнуляется и кэш, так что показать эмблемы прошлого
// матча он не может.

function cache(ctx) {
  if (!ctx.__bumperCache) ctx.__bumperCache = {};
  return ctx.__bumperCache;
}

// Заливка шторки поперёк её толщины: у шва светлее, к дальнему краю плотнее.
function slabGradient(ctx, top) {
  const c = cache(ctx);
  const key = top ? 'slabTop' : 'slabBottom';
  if (!c[key]) {
    const from = top ? -SLAB : SLAB;
    const g = ctx.createLinearGradient(0, from, 0, 0);
    g.addColorStop(0, T.scene2);
    g.addColorStop(0.55, T.pgbg);
    g.addColorStop(1, T.scene1);
    c[key] = g;
  }
  return c[key];
}

function edgeGradient(ctx) {
  const c = cache(ctx);
  if (!c.edge) {
    const g = ctx.createLinearGradient(-EXT, 0, EXT, 0);
    g.addColorStop(0, '#b9c2ca');
    g.addColorStop(0.35, '#fdfefe');
    g.addColorStop(0.65, '#e6eaee');
    g.addColorStop(1, '#a9b2ba');
    c.edge = g;
  }
  return c.edge;
}

// След за кромкой. Один на обе шторки: нижняя рисует его в отражённых по
// вертикали координатах, и градиент отражается вместе с ними.
function trailGradient(ctx) {
  const c = cache(ctx);
  if (!c.trail) {
    const g = ctx.createLinearGradient(0, 0, 0, -TRAIL_W);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.trail = g;
  }
  return c.trail;
}

// Вписать картинку в квадрат, сохранив пропорции: эмблемы бывают и вытянутыми,
// а растянутый по кадру логотип дивизиона видно сразу.
function drawContain(c, img, box) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.min(box / iw, box / ih);
  c.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
}

// Вспышка шва — заранее собранная полоса в координатах шторки. Кадр её только
// накладывает: shadowBlur на полосе в 2600 px стоил бы дороже всего остального.
function seamSprite(ctx) {
  const c = cache(ctx);
  if (c.seam) return c.seam;

  const half = 46;
  const off = document.createElement('canvas');
  off.width = EXT * 2;
  off.height = half * 2;
  const s = off.getContext('2d');

  const glow = s.createLinearGradient(0, 0, 0, off.height);
  glow.addColorStop(0, 'rgba(255,255,255,0)');
  glow.addColorStop(0.44, 'rgba(255,255,255,0.55)');
  glow.addColorStop(0.5, 'rgba(255,255,255,1)');
  glow.addColorStop(0.56, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  s.fillStyle = glow;
  s.fillRect(0, 0, off.width, off.height);

  const fade = s.createLinearGradient(0, 0, off.width, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.2, 'rgba(0,0,0,1)');
  fade.addColorStop(0.8, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  s.globalCompositeOperation = 'destination-in';
  s.fillStyle = fade;
  s.fillRect(0, 0, off.width, off.height);

  c.seam = off;
  return off;
}

// Подпись команды подгоняется по ширине: «Тюменский Легион» и «Ямал» одним
// кеглем не набрать, а переносить название на две строки некрасиво.
function fitText(c, text, maxWidth, startSize) {
  let size = startSize;
  for (; size > 26; size -= 2) {
    c.font = `${size}px ${FONT_DISPLAY}`;
    if (c.measureText(text).width <= maxWidth) break;
  }
  return size;
}

// Блок команды: эмблема как есть и название под ней. Собирается один раз в свой
// холст — от кадра к кадру он не меняется, кадр только переставляет его.
//
// Никаких кругов и каймы: эмблема рисуется во всю отведённую высоту. Пропорции
// сохраняются — растянутый по квадрату логотип видно сразу.
function prerenderTeam(img, name) {
  const off = document.createElement('canvas');
  off.width = SPRITE_W;
  off.height = SPRITE_H;
  const c = off.getContext('2d');

  const cx = SPRITE_W / 2;
  const cy = 30 + CREST_TEAM / 2;

  if (img) {
    c.save();
    c.translate(cx, cy);
    drawContain(c, img, CREST_TEAM);
    c.restore();
  }

  if (name) {
    const text = String(name).toUpperCase();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.letterSpacing = '1px';
    const size = fitText(c, text, SPRITE_W - 140, 68);
    c.font = `${size}px ${FONT_DISPLAY}`;
    c.fillStyle = T.head;
    c.fillText(text, cx, cy + CREST_TEAM / 2 + 70);
    c.letterSpacing = '0px';
  }

  return off;
}

function teamSprite(ctx, key, img, name) {
  const c = cache(ctx);
  const slot = `team_${key}`;
  if (!c[slot]) c[slot] = prerenderTeam(img, name);
  return c[slot];
}

// --- Ледяная крошка от удара ------------------------------------------------
//
// Набор частиц считается ОДИН раз при загрузке модуля и одинаков для всех
// матчей: разлёт должен воспроизводиться при каждой пересборке файла, а
// Math.random() в отрисовке кадра сделал бы каждую сборку другой.
//
// Координаты — в системе шторок: x вдоль шва, y поперёк. Так крошка вылетает из
// самого шва в обе стороны, а не «вверх» и «вниз» кадра.
const SPARKS = (() => {
  let seed = 20260818;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  return Array.from({ length: 84 }, () => {
    const side = rnd() < 0.5 ? -1 : 1;
    return {
      x: (rnd() * 2 - 1) * 1050,
      vx: (rnd() * 2 - 1) * 640,
      vy: side * (140 + rnd() * 940),
      size: 4 + rnd() * 9,
      life: 0.45 + rnd() * 0.55,
      accent: rnd() < 0.28,
    };
  });
})();

function drawSparks(ctx, ms, quake) {
  if (ms < T_SLAM || ms > T_SLAM + T_SPARKS) return;
  const t = (ms - T_SLAM) / T_SPARKS;
  const e = 1 - Math.pow(1 - t, 2);      // рывком и с торможением

  ctx.save();
  ctx.translate(FRAME_W / 2 + quake.x, FRAME_H / 2 + quake.y);
  ctx.rotate(SEAM_RAD);

  for (const s of SPARKS) {
    if (t > s.life) continue;
    const k = t / s.life;
    const size = s.size * (1 - k * 0.65);
    ctx.globalAlpha = 1 - k * k;
    ctx.fillStyle = s.accent ? T.acc : '#ffffff';
    // Осколок вытянут вдоль полёта — поперёк шва, туда же, куда летит
    ctx.fillRect(s.x + s.vx * e - size / 2, s.vy * e - size, size, size * 2.2);
  }

  ctx.restore();
}

// --- Отрисовка --------------------------------------------------------------

/**
 * Одна шторка: фон рисуется в её собственных координатах, а содержимое — в
 * координатах кадра, иначе название команды оказалось бы повёрнутым на 45°.
 * Область отсечения задаётся до сброса матрицы и переживает его: clip хранится
 * в координатах устройства.
 */
function drawShutter(ctx, { top, offset, sprite, at, accent, quake }) {
  const y0 = top ? -SLAB : 0;

  ctx.save();
  ctx.translate(FRAME_W / 2 + quake.x, FRAME_H / 2 + quake.y);
  ctx.rotate(SEAM_RAD);
  ctx.translate(offset.x, offset.y);

  ctx.beginPath();
  ctx.rect(-EXT, y0, EXT * 2, SLAB);
  ctx.clip();

  ctx.fillStyle = slabGradient(ctx, top);
  ctx.fillRect(-EXT, y0, EXT * 2, SLAB);

  // След и кромка идут по кромке шва — по ней читается направление хода
  ctx.save();
  ctx.scale(1, top ? 1 : -1);
  ctx.fillStyle = trailGradient(ctx);
  ctx.fillRect(-EXT, -TRAIL_W, EXT * 2, TRAIL_W);
  ctx.restore();

  ctx.fillStyle = edgeGradient(ctx);
  ctx.fillRect(-EXT, top ? -EDGE_W : 0, EXT * 2, EDGE_W);

  // Цвет команды тонкой ниткой сразу за кромкой: круга под эмблемой больше нет,
  // и это единственное место, где цвет ещё работает на узнавание.
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(-EXT, top ? -EDGE_W - ACCENT_W : EDGE_W, EXT * 2, ACCENT_W);
  }

  // Содержимое едет вместе со шторкой, поэтому её смещение переводим в
  // координаты кадра и добавляем к точке привязки. Матрицу сбрасываем, а не
  // разворачиваем обратно: подпись команды не должна оказаться повёрнутой на
  // 45°. Область отсечения сброс переживает — clip хранится в координатах
  // устройства.
  if (sprite) {
    const sx = offset.x * SEAM_COS - offset.y * SEAM_SIN;
    const sy = offset.x * SEAM_SIN + offset.y * SEAM_COS;

    ctx.setTransform(1, 0, 0, 1, quake.x, quake.y);
    ctx.drawImage(sprite, at.x + sx - SPRITE_W / 2, at.y + sy - SPRITE_H / 2);
  }

  ctx.restore();
}

/**
 * Рисует ОДИН кадр перехода.
 *
 * @param {CanvasRenderingContext2D} ctx  холст 1920×1080 с альфой
 * @param {number} p                      прогресс перехода, 0..1
 * @param {object} assets                 { divisionImg, leagueImg, homeImg, awayImg,
 *                                          homeName, awayName, homeColor, awayColor }
 */
export function drawBumperFrame(ctx, p, assets = {}) {
  const {
    divisionImg, leagueImg, homeImg, awayImg,
    homeName, awayName, homeColor, awayColor,
  } = assets;

  ctx.clearRect(0, 0, FRAME_W, FRAME_H);

  const ms = clamp01(p) * SWEEP_MS;

  // Общая тряска кадра на ударе. Шторки взяты с запасом по размеру, поэтому
  // сдвиг на десяток пикселей не открывает щелей по краям.
  const sh = shake(ms);
  const quake = { x: sh * 16, y: sh * -10 };

  drawShutter(ctx, {
    top: true,
    offset: shutterOffset(ms, true),
    sprite: teamSprite(ctx, 'home', homeImg, homeName),
    at: HOME_AT,
    accent: homeColor,
    quake,
  });

  drawShutter(ctx, {
    top: false,
    offset: shutterOffset(ms, false),
    sprite: teamSprite(ctx, 'away', awayImg, awayName),
    at: AWAY_AT,
    accent: awayColor,
    quake,
  });

  // Вспышка по шву в момент удара. Полосу собираем всегда, даже когда она не
  // видна: сборка холста 2600×92 посреди записи съела бы кадр, а первый кадр
  // рисуется до старта записи именно ради прогрева таких заготовок.
  const sprite = seamSprite(ctx);
  const flash = seamAlpha(ms);
  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = flash;
    ctx.translate(FRAME_W / 2 + quake.x, FRAME_H / 2 + quake.y);
    ctx.rotate(SEAM_RAD);
    ctx.drawImage(sprite, -EXT, -sprite.height / 2);
    ctx.restore();
  }

  // Ледяная крошка от удара — поверх шва, но под эмблемой дивизиона
  drawSparks(ctx, ms, quake);

  // Эмблема дивизиона поверх обеих шторок. Своей у дивизиона может не быть —
  // тогда сервер подставляет эмблему лиги, чтобы центр кадра не пустовал.
  const d = divisionState(ms);
  const crest = divisionImg || leagueImg;
  if (d.alpha > 0 && d.scale > 0) {
    ctx.save();
    ctx.globalAlpha = d.alpha;
    ctx.translate(FRAME_W / 2 + quake.x, FRAME_H / 2 + quake.y);
    ctx.scale(d.scale, d.scale);

    if (crest) drawContain(ctx, crest, CREST_DIV);

    ctx.restore();
  }
}
