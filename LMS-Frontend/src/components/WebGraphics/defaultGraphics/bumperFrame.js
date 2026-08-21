// src/components/WebGraphics/defaultGraphics/bumperFrame.js
//
// Геометрия дефолтного перехода и его отрисовка на canvas — для выгрузки в
// WebM с прозрачностью.
//
// ЭТО ЕДИНСТВЕННЫЙ ИСТОЧНИК РИСУНКА. Переход собирается один раз в панели
// трансляции: кадры считаются здесь, кодируются в WebM с альфой и уходят в S3.
// Эфир и Stinger в OBS играют буквально один и тот же файл, разъехаться им
// негде. DOM-версии перехода не существует.
//
// СЦЕНАРИЙ
//   0,00–0,46 с  две шторки со скосом −14° влетают навстречу из-за краёв кадра;
//                по ведущей кромке каждой — цвет своей команды и белый след
//   0,46–0,62 с  смыкание, по шву бьёт вспышка — дальше кадр перекрыт наглухо
//   0,50–1,18 с  по чёрному полю бегут ВСТРЕЧНЫЕ СТРОКИ: крупный текст без
//                подложки и без наклона, строго горизонтально
//   0,88–1,18 с  эмблемы команд влетают ПО ДИАГОНАЛИ из противоположных углов,
//                разгоняясь и оставляя за собой шлейф
//   1,18 с       УДАР. Вспышка и ударная волна из точки столкновения, весь кадр
//                трясёт, эмблемы отскакивают в стороны, между ними выныривает
//                эмблема лиги. От удара строки КРЕНЯТСЯ на −14° и под ними
//                выезжают полосы — до удара их нет вовсе
//   1,18–1,56 с  осадка: эмблемы встают по местам, названия догоняют
//   1,56–2,05 с  статика, по шторкам идёт блик
//   1,75–2,25 с  строки разгоняются, содержимое уходит
//   2,25–2,90 с  шторки расходятся по уже пустому полю
//
// Кадр наглухо перекрыт с 0,46 до 2,25 — COVER_MS стоит внутри этого окна, и
// панель по нему знает, когда менять картинку под переходом. Всё, что рисуется
// в центре, обязано исчезнуть к T_HOLD: центр открывается первым.
//
// ЗВУК. HIT_MS — момент удара от начала перехода. По нему сборщик
// (utils/exportBumperWebm.js) подмешивает синтезированный удар в звуковую
// дорожку файла. В браузерном оверлее переход играет с muted — там его не
// слышно; звук работает в OBS, где этот же файл стоит Stinger-переходом.
//
// О ЦЕНЕ КАДРА. Запись идёт в реальном времени, на кадр есть 33 мс. Всё, что от
// кадра к кадру не меняется — градиенты, плитки бегущей строки, вспышка шва —
// считается один раз и лежит в кэше на контексте; кадр только расставляет
// готовое по местам.

export const SWEEP_MS = 2900;   // весь переход
export const COVER_MS = 1500;   // кадр наглухо перекрыт — здесь меняют картинку
export const HIT_MS = 1180;     // момент удара — на него ставится звук

export const FRAME_W = 1920;
export const FRAME_H = 1080;

// --- Тайминги фаз, мс -------------------------------------------------------
const T_CLOSE = 460;    // шторки сомкнулись
const T_TEXT = 500;     // строки пошли — голые, без подложки и наклона
const T_FLY = 880;      // эмблемы стартовали из углов
const T_HIT = HIT_MS;   // удар
const T_BANDS = 1340;   // строки докренились, полосы выехали
const T_SET = 1560;     // эмблемы разъехались и встали
const T_RUSH = 1750;    // строки пошли в разгон
const T_OUT = 2050;     // содержимое начало уходить
const T_HOLD = 2250;    // содержимого нет, шторки пошли врозь

const T_SHAKE = 240;    // сколько длится тряска после удара
const T_FLASH = 220;    // вспышка в точке удара
const T_WAVE = 460;     // ударная волна

// --- Палитра дефолтной графики ---------------------------------------------
// Те же цвета, что у остальных плашек: zinc-950 корпус, zinc-800 кромки,
// yellow-400 акцент (им же подсвечено большинство на табло).
const C_BODY = '#09090b';
const C_PANEL = '#18181b';
const C_LINE = '#27272a';
const C_MUTED = '#a1a1aa';
const C_ACCENT = '#facc15';

// --- Геометрия --------------------------------------------------------------
const SKEW_DEG = -14;
const SKEW_TAN = Math.tan((SKEW_DEG * Math.PI) / 180);

const SLAB_W = 1600;      // ширина шторки: с запасом на скос и на выход за кадр
const OVER_Y = 140;       // вылет шторки за кадр по вертикали
const EDGE_W = 12;        // цветная кромка команды
const TRAIL_W = 170;      // белый след перед кромкой
const SEAM_OVERLAP = 26;  // насколько шторки заходят друг на друга в закрытом виде
const SHUT_SHAKE = 9;

// Бегущие строки. Кегль крупный намеренно: строка тут не справка, а фактура.
const RIB_FONT = 92;
const RIB_H = 138;        // высота полосы, которая выезжает ПОСЛЕ удара
const RIB_TOP_Y = 116;    // верхний край верхней полосы
const RIB_BOT_Y = 806;
const RIB_SPEED = 260;    // px/с до разгона
const RIB_RUSH = 3.4;

// Знаки
const CREST_LEAGUE = 300;
const CREST_TEAM = 224;
const CREST_SPREAD = 452;  // куда отлетают эмблемы команд после удара
const MARKS_CY = 500;
const FLY_FROM = { x: 1320, y: 860 };  // откуда стартуют эмблемы (по диагонали)

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// --- Кривые -----------------------------------------------------------------

// Влёт: разгон и резкая остановка — отсюда ощущение удара.
const easeSlam = (t) => Math.pow(clamp01(t), 2.1);
// Уход: срывается с места и мягко замедляется.
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
// Отскок с перелётом.
const easeBack = (t) => {
  const k = clamp01(t) - 1;
  return k * k * (2.7 * k + 1.7) + 1;
};

// Затухающая дрожь, −1..1. Считается от времени, а не от случайных чисел:
// файл должен собираться одинаково при каждой пересборке.
function decayShake(ms, from, dur, freq) {
  if (ms < from || ms > from + dur) return 0;
  const k = (ms - from) / dur;
  return Math.sin(k * Math.PI * freq) * (1 - k) * (1 - k);
}

// Вспышка по шву — короткое окно вокруг смыкания шторок.
function seamAlpha(ms) {
  if (ms < T_CLOSE - 70 || ms > T_CLOSE + 160) return 0;
  if (ms < T_CLOSE) return (ms - (T_CLOSE - 70)) / 70;
  return Math.pow(1 - (ms - T_CLOSE) / 160, 1.6);
}

/**
 * Положение ведущей кромки шторки.
 * @param {number} ms
 * @param {boolean} isHome true — левая (хозяева), false — правая (гости)
 * @returns {number} x ведущей кромки в координатах кадра
 */
function shutterEdge(ms, isHome) {
  const closed = FRAME_W / 2 + (isHome ? SEAM_OVERLAP / 2 : -SEAM_OVERLAP / 2);
  const away = isHome ? -460 : FRAME_W + 460;

  if (ms <= T_CLOSE) return lerp(away, closed, easeSlam(ms / T_CLOSE));
  if (ms <= T_HOLD) {
    // Дрожь дважды: от смыкания шторок и от удара эмблем
    const a = decayShake(ms, T_CLOSE, 200, 5) + decayShake(ms, T_HIT, T_SHAKE, 6);
    return closed + (isHome ? 1 : -1) * a * SHUT_SHAKE;
  }
  return lerp(closed, away, easeOut((ms - T_HOLD) / (SWEEP_MS - T_HOLD)));
}

// Тряска всего кадра от удара — общая для строк и знаков, чтобы они дрожали
// вместе, а не каждый сам по себе.
function hitShake(ms) {
  const a = decayShake(ms, T_HIT, T_SHAKE, 6);
  return { x: a * 16, y: a * -9 };
}

// Наклон строк: до удара строго горизонтально, от удара — резкий крен с
// перелётом и осадкой на рабочие −14°.
function ribbonSkew(ms) {
  if (ms < T_HIT) return 0;
  const deg = SKEW_DEG * easeBack(clamp01((ms - T_HIT) / (T_BANDS - T_HIT)));
  return Math.tan((deg * Math.PI) / 180);
}

// Полоса под строкой: до удара её нет вовсе, потом выезжает от осевой линии.
function bandScale(ms) {
  if (ms < T_HIT) return 0;
  return easeOut((ms - T_HIT) / (T_BANDS - T_HIT));
}

// Уход содержимого — строк и знаков. Он ЗАВЕРШАЕТСЯ к T_HOLD, то есть ещё внутри
// окна полного перекрытия, и только потом расходятся шторки. Иначе центр кадра
// открывается раньше, чем содержимое исчезло, и знаки повисают поверх картинки.
function contentExit(ms) {
  if (ms <= T_OUT) return { alpha: 1, scale: 1 };
  const t = clamp01((ms - T_OUT) / (T_HOLD - T_OUT));
  return { alpha: Math.pow(1 - t, 1.3), scale: lerp(1, 1.28, easeOut(t)) };
}

// --- Кэш заготовок ----------------------------------------------------------
//
// Кэш живёт на самом контексте. Холст под сборку создаётся заново на каждый
// запуск, вместе с ним обнуляется и кэш, так что показать данные прошлого матча
// он не может.
function cache(ctx) {
  if (!ctx.__bumperCache) ctx.__bumperCache = {};
  return ctx.__bumperCache;
}

// Заливка шторки поперёк: у ведущей кромки светлее, к дальнему краю плотнее.
function slabGradient(ctx, isHome) {
  const c = cache(ctx);
  const key = isHome ? 'slabHome' : 'slabAway';
  if (!c[key]) {
    const g = isHome
      ? ctx.createLinearGradient(-SLAB_W, 0, 0, 0)
      : ctx.createLinearGradient(SLAB_W, 0, 0, 0);
    g.addColorStop(0, C_BODY);
    g.addColorStop(0.6, C_PANEL);
    g.addColorStop(1, '#232326');
    c[key] = g;
  }
  return c[key];
}

// Белый след, бегущий перед кромкой. Рисуется в координатах «от кромки внутрь».
function trailGradient(ctx, isHome) {
  const c = cache(ctx);
  const key = isHome ? 'trailHome' : 'trailAway';
  if (!c[key]) {
    const g = isHome
      ? ctx.createLinearGradient(0, 0, -TRAIL_W, 0)
      : ctx.createLinearGradient(0, 0, TRAIL_W, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c[key] = g;
  }
  return c[key];
}

// Блик по корпусу на статике — тот же приём, что у остальных плашек графики
// (animate-glare в AnimationWrapper), только посчитанный вручную.
function glareGradient(ctx) {
  const c = cache(ctx);
  if (!c.glare) {
    const g = ctx.createLinearGradient(-260, 0, 260, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.13)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.glare = g;
  }
  return c.glare;
}

/**
 * Плитка бегущей строки — ТОЛЬКО ТЕКСТ, фон прозрачный. Полоса появляется
 * отдельным прямоугольником и только после удара, поэтому запекать её в плитку
 * нельзя: до удара строка обязана идти по голому полю.
 *
 * Плитка строится один раз на цвет: пересобирать текст в 92 пункта каждый кадр
 * было бы дороже всей остальной отрисовки вместе взятой.
 */
function textTile(ctx, key, words, color) {
  const c = cache(ctx);
  if (c[key]) return c[key];

  const off = document.createElement('canvas');
  const probe = off.getContext('2d');

  const FONT = `700 ${RIB_FONT}px Inter, Arial, sans-serif`;
  const SPACING = '8px';
  const GAP = 90;    // отступ до разделителя и после него
  const DOT = 22;    // ромб-разделитель между повторами

  probe.font = FONT;
  probe.letterSpacing = SPACING;
  const textW = Math.ceil(probe.measureText(words).width);
  const tileW = textW + GAP * 2 + DOT;

  off.width = tileW;
  off.height = RIB_H;
  const s = off.getContext('2d');

  s.font = FONT;
  s.letterSpacing = SPACING;
  s.textAlign = 'left';
  s.textBaseline = 'middle';
  s.fillStyle = color;
  s.fillText(words, GAP, RIB_H / 2);

  // Разделитель повторов — ромб, тот же язык, что у скошенных плашек графики
  s.save();
  s.translate(GAP + textW + GAP / 2, RIB_H / 2);
  s.rotate(Math.PI / 4);
  s.fillStyle = color === '#0a0a0a' ? 'rgba(0,0,0,0.5)' : C_ACCENT;
  s.fillRect(-DOT / 2, -DOT / 2, DOT, DOT);
  s.restore();

  c[key] = off;
  return off;
}

// Вписать картинку в квадрат, сохранив пропорции: эмблемы бывают и вытянутыми,
// а растянутый по кадру логотип видно сразу.
function drawContain(ctx, img, box) {
  if (!img) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.min(box / iw, box / ih);
  ctx.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
}

// Подобрать кегль под ширину: названия команд бывают и в три слова, и обрезать
// их многоточием в заставке нельзя — читается хуже, чем чуть мельче набранное.
function fitText(ctx, text, maxW, startPx, minPx) {
  let px = startPx;
  for (;;) {
    ctx.font = `700 ${px}px Inter, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxW || px <= minPx) return px;
    px -= 1;
  }
}

// --- Рисование --------------------------------------------------------------

// Одна шторка: корпус со скосом, цветная кромка команды и белый след перед ней.
function drawShutter(ctx, ms, isHome, color) {
  const edge = shutterEdge(ms, isHome);
  const top = -OVER_Y;
  const h = FRAME_H + OVER_Y * 2;
  const cy = FRAME_H / 2;

  ctx.save();
  ctx.translate(edge, cy);
  ctx.transform(1, 0, SKEW_TAN, 1, 0, 0);
  ctx.translate(-edge, -cy);

  ctx.save();
  ctx.translate(edge, 0);
  ctx.fillStyle = slabGradient(ctx, isHome);
  ctx.fillRect(isHome ? -SLAB_W : 0, top, SLAB_W, h);
  ctx.restore();

  // Блик по корпусу: идёт только на статике, когда кадр перекрыт и его видно.
  if (ms > T_SET && ms < T_OUT) {
    const bodyX = isHome ? edge - SLAB_W : edge;
    const t = (ms - T_SET) / (T_OUT - T_SET);
    ctx.save();
    ctx.translate(lerp(bodyX - 300, bodyX + SLAB_W + 300, t), 0);
    ctx.fillStyle = glareGradient(ctx);
    ctx.fillRect(-260, top, 520, h);
    ctx.restore();
  }

  // Белый след перед кромкой — читается как скорость
  ctx.save();
  ctx.translate(edge, 0);
  ctx.fillStyle = trailGradient(ctx, isHome);
  ctx.fillRect(isHome ? -TRAIL_W : 0, top, TRAIL_W, h);
  ctx.restore();

  // Цвет команды по ведущей кромке
  ctx.fillStyle = color;
  ctx.fillRect(isHome ? edge - EDGE_W : edge, top, EDGE_W, h);

  ctx.restore();
}

// Вспышка по шву в момент смыкания шторок.
function drawSeam(ctx, ms) {
  const a = seamAlpha(ms);
  if (a <= 0) return;

  const c = cache(ctx);
  if (!c.seam) {
    const g = ctx.createLinearGradient(-90, 0, 90, 0);
    g.addColorStop(0, 'rgba(250,204,21,0)');
    g.addColorStop(0.42, 'rgba(250,204,21,0.65)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.58, 'rgba(250,204,21,0.65)');
    g.addColorStop(1, 'rgba(250,204,21,0)');
    c.seam = g;
  }

  const cx = FRAME_W / 2;
  const cy = FRAME_H / 2;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(cx, cy);
  ctx.transform(1, 0, SKEW_TAN, 1, 0, 0);
  ctx.translate(-cx, -cy);
  ctx.translate(cx, 0);
  ctx.fillStyle = c.seam;
  ctx.fillRect(-90, -OVER_Y, 180, FRAME_H + OVER_Y * 2);
  ctx.restore();
}

/**
 * Одна бегущая строка.
 *
 * До удара — голый текст без подложки, строго горизонтально. От удара строка
 * кренится и под ней выезжает полоса; у верхней полоса жёлтая, и текст на ней
 * перекрашивается в чёрный перекрёстным растворением.
 */
function drawRibbon(ctx, ms, { y, keyLight, keyDark, words, invert, toLeft }) {
  if (ms < T_TEXT || ms >= T_HOLD) return;

  const inT = clamp01((ms - T_TEXT) / 240);
  const band = bandScale(ms);
  const exit = contentExit(ms);
  const midY = y + RIB_H / 2;

  // Пробег: равномерный, с разгоном перед уходом. Считаем именно ПУТЬ, а не
  // «время × текущая скорость»: во втором случае в момент разгона строка скачком
  // уехала бы на тысячу пикселей вперёд.
  let travelled = (Math.min(ms, T_RUSH) / 1000) * RIB_SPEED;
  if (ms > T_RUSH) {
    const rush = lerp(1, RIB_RUSH, easeOut((ms - T_RUSH) / (T_HOLD - T_RUSH)));
    travelled += ((ms - T_RUSH) / 1000) * RIB_SPEED * ((1 + rush) / 2);
  }

  const baseAlpha = inT * exit.alpha;

  ctx.save();

  // Крен от удара — вокруг осевой линии самой строки, чтобы она проворачивалась
  // на месте, а не уезжала вбок.
  ctx.translate(0, midY);
  ctx.transform(1, 0, ribbonSkew(ms), 1, 0, 0);
  ctx.translate(0, -midY);

  // Полоса выезжает от осевой линии в обе стороны. Ширина с запасом: крен
  // уводит края вбок, и без него по углам открывалась бы щель.
  if (band > 0) {
    const half = (RIB_H / 2) * band;
    ctx.globalAlpha = baseAlpha;
    ctx.fillStyle = invert ? C_ACCENT : C_PANEL;
    ctx.fillRect(-400, midY - half, FRAME_W + 800, half * 2);
    if (!invert) {
      // Жёлтая нитка по кромке — чтобы тёмная полоса не слилась со шторкой
      ctx.fillStyle = C_ACCENT;
      ctx.fillRect(-400, midY - half, FRAME_W + 800, Math.max(1, 4 * band));
    }
  }

  const paint = (tile, alpha) => {
    if (alpha <= 0) return;
    const tileW = tile.width;
    const shift = ((travelled % tileW) + tileW) % tileW;
    const x0 = toLeft ? -shift : shift - tileW;
    ctx.globalAlpha = baseAlpha * alpha;
    // Запас в плитку с каждой стороны: крен уводит нижний край строки вбок
    for (let x = x0 - tileW; x < FRAME_W + tileW; x += tileW) {
      ctx.drawImage(tile, x, y);
    }
  };

  if (invert) {
    // Текст перекрашивается вместе с полосой: пока её нет — белый по тёмному
    // полю, как только выехала жёлтая — чёрный по жёлтому.
    paint(textTile(ctx, keyLight, words, '#ffffff'), 1 - band);
    paint(textTile(ctx, keyDark, words, '#0a0a0a'), band);
  } else {
    paint(textTile(ctx, keyLight, words, '#ffffff'), 1);
  }

  ctx.restore();
}

// Вспышка и ударная волна в точке столкновения эмблем.
function drawImpact(ctx, ms) {
  if (ms < T_HIT) return;
  const cx = FRAME_W / 2;
  const cy = MARKS_CY;

  const flashT = clamp01((ms - T_HIT) / T_FLASH);
  if (flashT < 1) {
    const r = lerp(120, 620, easeOut(flashT));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(250,204,21,0.55)');
    g.addColorStop(1, 'rgba(250,204,21,0)');
    ctx.save();
    ctx.globalAlpha = Math.pow(1 - flashT, 1.5);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  const waveT = clamp01((ms - T_HIT) / T_WAVE);
  if (waveT < 1) {
    ctx.save();
    ctx.globalAlpha = Math.pow(1 - waveT, 1.8);
    ctx.beginPath();
    ctx.arc(cx, cy, lerp(70, 940, easeOut(waveT)), 0, Math.PI * 2);
    ctx.lineWidth = lerp(20, 1, waveT);
    ctx.strokeStyle = C_ACCENT;
    ctx.stroke();
    ctx.restore();
  }
}

// Эмблемы: влёт по диагонали, столкновение, разлёт и эмблема лиги между ними.
function drawMarks(ctx, ms, assets) {
  if (ms < T_FLY || ms >= T_HOLD) return;

  const { leagueImg, homeImg, awayImg, division, homeName, awayName, title,
          homeColor, awayColor } = assets;

  const exit = contentExit(ms);
  if (exit.alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = exit.alpha;
  ctx.translate(FRAME_W / 2, MARKS_CY);
  ctx.scale(exit.scale, exit.scale);

  // --- Эмблемы команд ---
  // До удара летят из своих углов в центр, после — отлетают по горизонтали.
  const flyT = clamp01((ms - T_FLY) / (T_HIT - T_FLY));
  const outT = ms >= T_HIT ? clamp01((ms - T_HIT) / (T_SET - T_HIT)) : 0;

  [[-1, homeImg, homeName, homeColor], [1, awayImg, awayName, awayColor]].forEach(
    ([side, img, name, color]) => {
      // Хозяева идут из верхнего левого угла, гости — из нижнего правого
      const from = { x: side * FLY_FROM.x, y: side * FLY_FROM.y };
      const k = easeSlam(flyT);
      const px = ms < T_HIT ? lerp(from.x, 0, k) : side * CREST_SPREAD * easeBack(outT);
      const py = ms < T_HIT ? lerp(from.y, 0, k) : 0;
      const scale = ms < T_HIT ? lerp(0.62, 1, k) : lerp(1.14, 1, easeOut(outT));
      // Доворот от удара — эмблему разворачивает, и она осаживается обратно
      const spin = ms < T_HIT ? 0 : -side * 0.22 * (1 - easeOut(outT));

      // Шлейф на подлёте: две призрачные копии позади по вектору движения
      if (ms < T_HIT && flyT > 0.15) {
        for (let g = 1; g <= 2; g += 1) {
          const gk = easeSlam(clamp01(flyT - g * 0.05));
          ctx.save();
          ctx.globalAlpha = exit.alpha * (0.22 / g);
          ctx.translate(lerp(from.x, 0, gk), lerp(from.y, 0, gk));
          ctx.scale(lerp(0.62, 1, gk), lerp(0.62, 1, gk));
          drawContain(ctx, img, CREST_TEAM);
          ctx.restore();
        }
      }

      ctx.save();
      ctx.translate(px, py);

      ctx.save();
      ctx.rotate(spin);
      ctx.scale(scale, scale);
      drawContain(ctx, img, CREST_TEAM);
      ctx.restore();

      // Подпись появляется, только когда эмблема встала на место
      if (outT > 0.45 && name) {
        const nameT = clamp01((outT - 0.45) / 0.55);
        ctx.save();
        ctx.globalAlpha = exit.alpha * nameT;

        ctx.fillStyle = color || '#ffffff';
        ctx.fillRect(-68, CREST_TEAM / 2 + 24, 136, 5);

        ctx.letterSpacing = '2px';
        const npx = fitText(ctx, String(name).toUpperCase(), 400, 32, 18);
        ctx.font = `700 ${npx}px Inter, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(name).toUpperCase(), 0, CREST_TEAM / 2 + 48);
        ctx.letterSpacing = '0px';
        ctx.restore();
      }
      ctx.restore();
    }
  );

  // --- Эмблема лиги: выныривает из точки удара ---
  if (ms >= T_HIT) {
    const t = clamp01((ms - T_HIT) / (T_SET - T_HIT));

    ctx.save();
    ctx.scale(lerp(0.05, 1, easeBack(t)), lerp(0.05, 1, easeBack(t)));
    ctx.beginPath();
    ctx.arc(0, 0, CREST_LEAGUE / 2, 0, Math.PI * 2);
    ctx.fillStyle = C_BODY;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C_LINE;
    ctx.stroke();
    drawContain(ctx, leagueImg, CREST_LEAGUE - 34);
    ctx.restore();

    // --- Подписи под эмблемой лиги ---
    const labelT = clamp01((ms - T_SET + 140) / 300);
    if (labelT > 0) {
      ctx.save();
      ctx.globalAlpha = exit.alpha * labelT;
      ctx.translate(0, lerp(16, 0, easeOut(labelT)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (division) {
        // Жёлтая плашка со скосом — ровно как метка дивизиона на табло
        const text = String(division).toUpperCase();
        ctx.font = '700 17px Inter, Arial, sans-serif';
        ctx.letterSpacing = '4px';
        const w = ctx.measureText(text).width + 52;
        const yy = CREST_LEAGUE / 2 + 34;

        ctx.save();
        ctx.translate(0, yy + 17);
        ctx.transform(1, 0, SKEW_TAN, 1, 0, 0);
        ctx.fillStyle = C_ACCENT;
        ctx.fillRect(-w / 2, -17, w, 34);
        ctx.restore();

        ctx.fillStyle = '#0a0a0a';
        ctx.fillText(text, 0, yy + 18);
        ctx.letterSpacing = '0px';
      }

      if (title) {
        ctx.font = '700 20px Inter, Arial, sans-serif';
        ctx.letterSpacing = '3px';
        ctx.fillStyle = C_MUTED;
        ctx.fillText(String(title).toUpperCase(), 0, CREST_LEAGUE / 2 + (division ? 94 : 46));
        ctx.letterSpacing = '0px';
      }
      ctx.restore();
    }
  }

  ctx.restore();
}

/**
 * Один кадр перехода.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} p  прогресс 0..1
 * @param {object} assets { leagueImg, homeImg, awayImg, leagueName, division,
 *                          homeName, awayName, title, homeColor, awayColor }
 */
export function drawBumperFrame(ctx, p, assets = {}) {
  const ms = clamp01(p) * SWEEP_MS;
  const homeColor = assets.homeColor || C_ACCENT;
  const awayColor = assets.awayColor || '#ffffff';

  ctx.clearRect(0, 0, FRAME_W, FRAME_H);

  // Тряска от удара — общая на весь кадр, поэтому идёт самым внешним слоем.
  const jolt = hitShake(ms);
  ctx.save();
  ctx.translate(jolt.x, jolt.y);

  // Шторки. Сначала гости, потом хозяева: при смыкании левая ложится поверх,
  // и шов читается одной линией, а не двумя встречными кромками.
  drawShutter(ctx, ms, false, awayColor);
  drawShutter(ctx, ms, true, homeColor);

  const words = [assets.leagueName, assets.division,
                 assets.homeName && assets.awayName
                   ? `${assets.homeName} — ${assets.awayName}`
                   : (assets.homeName || assets.awayName)]
    .filter(Boolean).map(v => String(v).toUpperCase()).join('   ·   ');

  if (words) {
    drawRibbon(ctx, ms, { y: RIB_TOP_Y, keyLight: 'ribTopL', keyDark: 'ribTopD', words, invert: true, toLeft: true });
    drawRibbon(ctx, ms, { y: RIB_BOT_Y, keyLight: 'ribBotL', keyDark: 'ribBotD', words, invert: false, toLeft: false });
  }

  drawMarks(ctx, ms, { ...assets, homeColor, awayColor });
  drawImpact(ctx, ms);
  drawSeam(ctx, ms);

  ctx.restore();
}
