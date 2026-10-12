// src/components/WebGraphics/defaultGraphics/bumperFrame.js
//
// Переход заставки стандартной графики — «срез конька». Рисуется на canvas и собирается
// панелью трансляции в WebM с прозрачностью (utils/exportBumperWebm.js); эфир
// и Stinger в OBS играют один и тот же файл. DOM-версии перехода нет.
//
// СЦЕНАРИЙ (мс)
//      0–440   две графитовые створки сходятся по диагонали «/» — под тем же
//              углом 45°, что линии конька на иконках HockeyEco. Верхняя левая
//              идёт из угла, нижняя правая навстречу; по кромкам — синие линии
//              конька и цвет своей команды
//    440       смыкание: по шву пробегает лезвие — бело-синяя вспышка
//    480–900   по центру всплывает логотип лиги, по створкам ползут
//              контурные строки с названиями
//    620–900   логотипы команд влетают по диагонали из своих углов
//    900       УДАР: логотипы встают, от логотипа лиги расходятся круги,
//              кадр вздрагивает
//    900–1150  подписи: лига, дивизион (синяя плашка TR), названия команд
//   1150–1780  статика, по створкам идёт блик
//   1780–2060  содержимое уходит: растёт и тает
//   2060–2700  створки расходятся от шва в свои углы
//
// Кадр перекрыт наглухо с 440 до 2060 мс. COVER_MS — внутри этого окна: в эту
// миллисекунду под переходом меняют картинку. Всё, что нарисовано по центру,
// исчезает к T_HOLD — шов открывается первым.
//
// О ЦЕНЕ КАДРА: запись идёт в реальном времени, на кадр 33 мс. Логотипы,
// подписи и строки рисуются один раз (prepareBumperAssets) и в кадре только
// расставляются.

export const SWEEP_MS = 2700;
export const COVER_MS = 1400;
// Переход — БЕЗ ЗВУКА. Сборщик (utils/exportBumperWebm.js) кладёт удар
// в звуковую дорожку, только если модуль экспортирует HIT_MS, поэтому момент
// удара здесь внутренний и наружу не отдаётся. Захочется звук — экспортировать.
const HIT_MS = 900;

export const FRAME_W = 1920;
export const FRAME_H = 1080;

const T_CLOSE = 440;
const T_LEAGUE = 480;
const T_FLY = 620;
const T_HIT = HIT_MS;
const T_LABEL = 1150;
const T_GLARE = 1150;
const T_OUT = 1780;
const T_HOLD = 2060;

// --- Палитра: графит иконок HockeyEco, синий TR -----------------------------
const G_CENTER = '#1D1E1E';
const SKATE = '#43B5F5';
const ACCENT = '#1794DD';
const ACCENT_DEEP = '#1379B5';
const TEXT = '#F5F5F3';
const MUTED = '#9C9C96';
const FONT = "Manrope, Arial, sans-serif";

// --- Геометрия ----------------------------------------------------------------
//
// Считаем в повёрнутых осях: u — поперёк шва (по нормали (1,1)/√2), v — вдоль
// шва. Шов «/» — это линия u = const. Створка A — всё, что u < края, створка
// B — всё, что u > края.
const R2 = Math.SQRT2;
const CX = FRAME_W / 2;
const CY = FRAME_H / 2;
const SEAM_U = (CX + CY) / R2;               // шов через центр кадра
const U_MAX = (FRAME_W + FRAME_H) / R2;      // дальний угол
const OVERLAP = 14;                          // створки заходят друг на друга
const AWAY = U_MAX + 260;                    // насколько далеко створка уходит

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.min(1, Math.max(0, v));
const easeIn = t => Math.pow(clamp01(t), 2.2);
const easeShut = t => Math.pow(clamp01(t), 1.55);
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = t => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeBack = (t) => { const k = clamp01(t) - 1; return k * k * (2.6 * k + 1.6) + 1; };

// Затухающая дрожь −1..1 — от времени, а не от случайных чисел: файл обязан
// собираться одинаково при каждой пересборке.
function decay(ms, from, dur, freq) {
  if (ms < from || ms > from + dur) return 0;
  const k = (ms - from) / dur;
  return Math.sin(k * Math.PI * freq) * (1 - k) * (1 - k);
}

// Край створки по оси u.
function edgeA(ms) {
  const closed = SEAM_U + OVERLAP / 2;
  if (ms <= T_CLOSE) return lerp(-90, closed, easeShut(ms / T_CLOSE));
  if (ms <= T_HOLD) return closed + decay(ms, T_CLOSE, 220, 5) * 10 + decay(ms, T_HIT, 260, 6) * 7;
  return lerp(closed, -AWAY * 0.2, easeInOut((ms - T_HOLD) / (SWEEP_MS - T_HOLD)));
}
function edgeB(ms) {
  const closed = SEAM_U - OVERLAP / 2;
  if (ms <= T_CLOSE) return lerp(U_MAX + 90, closed, easeShut(ms / T_CLOSE));
  if (ms <= T_HOLD) return closed - decay(ms, T_CLOSE, 220, 5) * 10 - decay(ms, T_HIT, 260, 6) * 7;
  return lerp(closed, U_MAX + AWAY * 0.2, easeInOut((ms - T_HOLD) / (SWEEP_MS - T_HOLD)));
}

// Видимость отделки шва: полная в движении, на статике её нет.
function seamDecor(ms) {
  if (ms <= T_LEAGUE) return 1;
  if (ms <= T_LEAGUE + 260) return 1 - (ms - T_LEAGUE) / 260;
  if (ms < T_HOLD - 200) return 0;
  return Math.min(1, (ms - (T_HOLD - 200)) / 200);
}

// Перевод в оси шва: x = (u + v)/√2, y = (u − v)/√2.
function seamSpace(ctx) {
  ctx.transform(1 / R2, 1 / R2, 1 / R2, -1 / R2, 0, 0);
}

// Центр кадра в осях шва — v центра.
const V_CENTER = (CX - CY) / R2;

// --- Заготовки ----------------------------------------------------------------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawContain(ctx, img, cx, cy, box) {
  if (!img) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.min(box / iw, box / ih);
  ctx.drawImage(img, cx - (iw * k) / 2, cy - (ih * k) / 2, iw * k, ih * k);
}

// Логотип без плитки-иконки (плитку Сергей убрал 11.10.2026), с тенью для
// отделения от графита створок. Запас по краям холста — под тень.
function makeLogo(size, img) {
  const pad = Math.round(size * 0.16);
  const c = makeCanvas(size + pad * 2, size + pad * 2);
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = size * 0.08;
  g.shadowOffsetY = size * 0.035;
  drawContain(g, img, pad + size / 2, pad + size / 2, size);
  return c;
}

function fitFont(g, text, maxW, start, min, weight = 800) {
  let px = start;
  for (;;) {
    g.font = `${weight} ${px}px ${FONT}`;
    if (g.measureText(text).width <= maxW || px <= min) return px;
    px -= 1;
  }
}

// Подпись под эмблемой команды: название и полоса цвета команды.
function makeTeamLabel(name, color) {
  const W = 460; const H = 90;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const text = String(name || '').toUpperCase();
  g.letterSpacing = '1px';
  const px = fitFont(g, text, W - 20, 34, 18);
  g.font = `800 ${px}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = TEXT;
  g.fillText(text, W / 2, 30);
  g.fillStyle = color || ACCENT;
  roundRect(g, W / 2 - 46, 66, 92, 6, 3);
  g.fill();
  return c;
}

// Подписи под плиткой лиги: название лиги, синяя плашка дивизиона, заголовок.
function makeLeagueLabel(leagueName, division, title) {
  const W = 900; const H = 190;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  let y = 26;
  if (leagueName) {
    const t = String(leagueName).toUpperCase();
    g.letterSpacing = '4px';
    const px = fitFont(g, t, W - 40, 30, 18);
    g.font = `800 ${px}px ${FONT}`;
    g.fillStyle = TEXT;
    g.fillText(t, W / 2, y);
    y += 58;
  }
  if (division) {
    const t = String(division).toUpperCase();
    g.letterSpacing = '4px';
    g.font = `800 17px ${FONT}`;
    const w = Math.min(W - 40, g.measureText(t).width + 48);
    const grad = g.createLinearGradient(W / 2 - w / 2, 0, W / 2 + w / 2, 0);
    grad.addColorStop(0, ACCENT_DEEP);
    grad.addColorStop(1, ACCENT);
    g.fillStyle = grad;
    roundRect(g, W / 2 - w / 2, y - 19, w, 38, 10);
    g.fill();
    const hl = g.createLinearGradient(0, y - 19, 0, y + 19);
    hl.addColorStop(0, 'rgba(255,255,255,0.25)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    roundRect(g, W / 2 - w / 2, y - 19, w, 38, 10);
    g.fill();
    g.fillStyle = '#FFFFFF';
    g.fillText(t, W / 2 + 2, y + 1);
    y += 52;
  }
  if (title) {
    const t = String(title).toUpperCase();
    g.letterSpacing = '5px';
    g.font = `800 18px ${FONT}`;
    g.fillStyle = MUTED;
    g.fillText(t, W / 2, y);
  }
  g.letterSpacing = '0px';
  return c;
}

// Контурная строка для створок: текст обводкой, без заливки.
function makeRibbon(words) {
  const probe = makeCanvas(10, 10).getContext('2d');
  const FONT_PX = 104;
  probe.font = `800 ${FONT_PX}px ${FONT}`;
  probe.letterSpacing = '6px';
  const text = `${words}`;
  const gap = 120;
  const w = Math.ceil(probe.measureText(text).width) + gap;
  const c = makeCanvas(w, 150);
  const g = c.getContext('2d');
  g.font = `800 ${FONT_PX}px ${FONT}`;
  g.letterSpacing = '6px';
  g.textBaseline = 'middle';
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.strokeText(text, 0, 75);
  // Разделитель повторов — две короткие линии конька
  g.strokeStyle = SKATE;
  g.lineWidth = 4;
  const x0 = w - gap / 2 - 16;
  g.beginPath(); g.moveTo(x0, 100); g.lineTo(x0 + 30, 50); g.stroke();
  g.beginPath(); g.moveTo(x0 + 16, 100); g.lineTo(x0 + 46, 50); g.stroke();
  return c;
}

// Логотипы команд крупнее логотипа лиги — так решил Сергей (11.10.2026).
const LOGO_LEAGUE = 340;
const LOGO_TEAM = 380;
const TEAM_DX = 600;
const MARKS_Y = CY - 70;

/**
 * Подготовка заготовок — один раз до записи. Возвращает те же ассеты плюс
 * готовые холсты.
 */
export async function prepareBumperAssets(raw, { onProgress } = {}) {
  try {
    await document.fonts?.load?.(`800 30px ${FONT}`);
  } catch { /* подписи выйдут системным шрифтом */ }
  const homeColor = raw.homeColor || ACCENT;
  const awayColor = raw.awayColor || '#E8E8E4';
  const words = [raw.leagueName, raw.division, raw.homeName && raw.awayName ? `${raw.homeName} — ${raw.awayName}` : null]
    .filter(Boolean).map(v => String(v).toUpperCase()).join('   ');
  const out = {
    ...raw,
    homeColor, awayColor,
    leagueTile: makeLogo(LOGO_LEAGUE, raw.leagueImg),
    homeTile: makeLogo(LOGO_TEAM, raw.homeImg),
    awayTile: makeLogo(LOGO_TEAM, raw.awayImg),
    leagueLabel: makeLeagueLabel(raw.leagueName, raw.division, raw.title),
    homeLabel: makeTeamLabel(raw.homeName, homeColor),
    awayLabel: makeTeamLabel(raw.awayName, awayColor),
    ribbon: words ? makeRibbon(words) : null,
  };
  onProgress?.(1);
  return out;
}

export function disposeBumperAssets(assets) {
  ['leagueTile', 'homeTile', 'awayTile', 'leagueLabel', 'homeLabel', 'awayLabel', 'ribbon'].forEach((k) => {
    if (assets?.[k]) { assets[k].width = 0; assets[k].height = 0; }
  });
}

// Если сборщик не позвал prepareBumperAssets — готовим сами, один раз на холст.
function ensure(ctx, assets) {
  if (assets.leagueTile) return assets;
  if (!ctx.__g2Prepared) {
    const homeColor = assets.homeColor || ACCENT;
    const awayColor = assets.awayColor || '#E8E8E4';
    const words = [assets.leagueName, assets.division].filter(Boolean).map(v => String(v).toUpperCase()).join('   ');
    ctx.__g2Prepared = {
      ...assets, homeColor, awayColor,
      leagueTile: makeLogo(LOGO_LEAGUE, assets.leagueImg),
      homeTile: makeLogo(LOGO_TEAM, assets.homeImg),
      awayTile: makeLogo(LOGO_TEAM, assets.awayImg),
      leagueLabel: makeLeagueLabel(assets.leagueName, assets.division, assets.title),
      homeLabel: makeTeamLabel(assets.homeName, homeColor),
      awayLabel: makeTeamLabel(assets.awayName, awayColor),
      ribbon: words ? makeRibbon(words) : null,
    };
  }
  return ctx.__g2Prepared;
}

// --- Кэш градиентов на контексте ---------------------------------------------

function cache(ctx) {
  if (!ctx.__g2Cache) ctx.__g2Cache = {};
  return ctx.__g2Cache;
}

function graphite(ctx) {
  const c = cache(ctx);
  if (!c.graphite) {
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.hypot(CX, CY));
    g.addColorStop(0, G_CENTER);
    g.addColorStop(0.5, G_CENTER);
    g.addColorStop(0.8, '#2E2F2F');
    g.addColorStop(1, '#3C3E3E');
    c.graphite = g;
  }
  return c.graphite;
}

// --- Рисование ------------------------------------------------------------------

// Створка: заливка графитом, строки, линии конька у кромки и цвет команды.
function drawShutter(ctx, ms, isA, assets) {
  const e = isA ? edgeA(ms) : edgeB(ms);
  const sign = isA ? -1 : 1;           // куда от кромки лежит тело створки
  const color = isA ? assets.homeColor : assets.awayColor;

  ctx.save();
  seamSpace(ctx);
  ctx.beginPath();
  if (isA) ctx.rect(-4000, -4000, e + 4000, 8000);
  else ctx.rect(e, -4000, 8000, 8000);
  ctx.restore();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = graphite(ctx);
  ctx.fillRect(-10, -10, FRAME_W + 20, FRAME_H + 20);

  // Контурная строка по створке — фактура, а не надпись: еле видна
  if (assets.ribbon && ms > T_CLOSE - 120 && ms < T_HOLD + 200) {
    const rib = assets.ribbon;
    const a = Math.min(1, (ms - (T_CLOSE - 120)) / 300) * (ms > T_OUT ? Math.max(0, 1 - (ms - T_OUT) / (T_HOLD - T_OUT)) : 1);
    if (a > 0) {
      // Оси шва зеркальные (определитель −1), текст в них вышел бы
      // перевёрнутым — поэтому строку ставим обычным поворотом на −45°.
      const u = e + sign * 330;
      const px = (u + V_CENTER) / R2;
      const py = (u - V_CENTER) / R2;
      const run = ((ms / 1000) * 120 * (isA ? 1 : -1)) % rib.width;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-Math.PI / 4);
      ctx.globalAlpha = 0.07 * a;
      for (let x = -2600 + run - rib.width; x < 2600; x += rib.width) ctx.drawImage(rib, x, -75);
      ctx.restore();
    }
  }

  // Блик по створке на статике
  if (ms > T_GLARE && ms < T_OUT) {
    const t = (ms - T_GLARE) / (T_OUT - T_GLARE);
    ctx.save();
    seamSpace(ctx);
    const gu = isA ? lerp(e - 1600, e + 200, t) : lerp(e - 200, e + 1600, t);
    const gr = ctx.createLinearGradient(gu - 220, 0, gu + 220, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(gu - 220, -4000, 440, 8000);
    ctx.restore();
  }

  // Линии конька в дальнем углу створки — как на иконке
  ctx.save();
  seamSpace(ctx);
  ctx.strokeStyle = SKATE;
  ctx.lineWidth = 3;
  const far = isA ? e - SEAM_U + 150 : e + (U_MAX - SEAM_U) - 150;
  [[0, 0.32], [64, 0.2]].forEach(([d, al]) => {
    ctx.globalAlpha = al;
    ctx.beginPath();
    ctx.moveTo(far + sign * d, -4000);
    ctx.lineTo(far + sign * d, 4000);
    ctx.stroke();
  });
  ctx.restore();

  // Кромка: цвет команды, белое лезвие и две синие линии конька. Они нужны,
  // пока створки движутся; на статике гаснут — по шву стоят плитки и подписи,
  // а линии конька по правилам бренда через текст не идут.
  ctx.save();
  ctx.globalAlpha = seamDecor(ms);
  seamSpace(ctx);
  ctx.fillStyle = color;
  ctx.fillRect(isA ? e - 9 : e, -4000, 9, 8000);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(isA ? e - 11 : e + 9, -4000, 2, 8000);
  ctx.strokeStyle = SKATE;
  ctx.lineWidth = 3;
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * 0.85;
  ctx.beginPath(); ctx.moveTo(e + sign * 30, -4000); ctx.lineTo(e + sign * 30, 4000); ctx.stroke();
  ctx.globalAlpha = base * 0.45;
  ctx.beginPath(); ctx.moveTo(e + sign * 54, -4000); ctx.lineTo(e + sign * 54, 4000); ctx.stroke();
  ctx.restore();

  ctx.restore();
}

// Вспышка по шву в момент смыкания — лезвие проходит по всей длине.
function drawSeamFlash(ctx, ms) {
  if (ms < T_CLOSE - 10 || ms > T_CLOSE + 330) return;
  const t = (ms - (T_CLOSE - 10)) / 340;
  const a = t < 0.16 ? t / 0.16 : Math.pow(1 - (t - 0.16) / 0.84, 1.5);
  ctx.save();
  seamSpace(ctx);
  ctx.globalAlpha = a;
  const glow = ctx.createLinearGradient(SEAM_U - 70, 0, SEAM_U + 70, 0);
  glow.addColorStop(0, 'rgba(67,181,245,0)');
  glow.addColorStop(0.42, 'rgba(67,181,245,0.55)');
  glow.addColorStop(0.5, 'rgba(255,255,255,1)');
  glow.addColorStop(0.58, 'rgba(67,181,245,0.55)');
  glow.addColorStop(1, 'rgba(67,181,245,0)');
  ctx.fillStyle = glow;
  // Лезвие бежит вдоль шва от нижнего левого угла к верхнему правому
  const run = lerp(-1700, 1700, easeOut(t * 1.3));
  ctx.fillRect(SEAM_U - 70, V_CENTER - 2200, 140, 2200 + run + 400);
  ctx.restore();
}

function contentExit(ms) {
  if (ms <= T_OUT) return { alpha: 1, scale: 1 };
  const t = clamp01((ms - T_OUT) / (T_HOLD - T_OUT));
  return { alpha: Math.pow(1 - t, 1.4), scale: lerp(1, 1.18, easeOut(t)) };
}

function blit(ctx, img, x, y, scale = 1, alpha = 1) {
  if (!img || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

function drawContent(ctx, ms, a) {
  if (ms < T_LEAGUE || ms >= T_HOLD) return;
  const exit = contentExit(ms);

  ctx.save();
  ctx.translate(CX, MARKS_Y);
  ctx.scale(exit.scale, exit.scale);
  ctx.globalAlpha = exit.alpha;

  // --- Эмблемы команд: влёт по диагонали из своих углов ---
  if (ms >= T_FLY) {
    const k = easeIn((ms - T_FLY) / (T_HIT - T_FLY));
    const settle = ms >= T_HIT ? easeBack((ms - T_HIT) / 320) : 0;
    [[-1, a.homeTile, a.homeLabel], [1, a.awayTile, a.awayLabel]].forEach(([side, tile, label]) => {
      const fx = side * TEAM_DX; const fy = 0;
      const from = { x: fx + side * 420, y: fy + side * 420 };
      let x; let y; let s;
      if (ms < T_HIT) { x = lerp(from.x, fx, k); y = lerp(from.y, fy, k); s = lerp(0.7, 1, k); }
      else { x = fx - side * 14 * (1 - settle); y = fy; s = lerp(1.08, 1, settle); }

      // Шлейф на подлёте
      if (ms < T_HIT && k > 0.1) {
        for (let gI = 1; gI <= 3; gI += 1) {
          const gk = easeIn(clamp01((ms - T_FLY) / (T_HIT - T_FLY) - gI * 0.06));
          blit(ctx, tile, lerp(from.x, fx, gk), lerp(from.y, fy, gk), lerp(0.7, 1, gk), 0.18 / gI);
        }
      }
      blit(ctx, tile, x, y, s);

      if (ms >= T_LABEL - 120) {
        const lt = easeOut((ms - (T_LABEL - 120)) / 320);
        blit(ctx, label, fx, LOGO_TEAM / 2 + 50 + lerp(18, 0, lt), 1, lt);
      }
    });
  }

  // --- Логотип лиги ---
  const lt = clamp01((ms - T_LEAGUE) / 380);
  const pulse = ms >= T_HIT ? 1 + decay(ms, T_HIT, 300, 3) * 0.06 : 1;
  blit(ctx, a.leagueTile, 0, 0, lerp(0.55, 1, easeBack(lt)) * pulse, Math.min(1, lt * 2));

  // Удар: от логотипа лиги расходятся круги
  if (ms >= T_HIT && ms < T_HIT + 620) {
    const t = (ms - T_HIT) / 620;
    [0, 0.18].forEach((delay, i) => {
      const tt = clamp01((t - delay) / (1 - delay));
      if (tt <= 0 || tt >= 1) return;
      const s = LOGO_LEAGUE * lerp(0.9, i ? 1.9 : 2.3, easeOut(tt));
      ctx.save();
      ctx.globalAlpha *= Math.pow(1 - tt, 1.6) * (i ? 0.5 : 0.85);
      ctx.beginPath();
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      ctx.lineWidth = lerp(i ? 3 : 6, 1, tt);
      ctx.strokeStyle = i ? '#FFFFFF' : SKATE;
      ctx.stroke();
      ctx.restore();
    });
    // Короткая вспышка в центре
    const ft = clamp01((ms - T_HIT) / 200);
    if (ft < 1) {
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 420);
      rg.addColorStop(0, 'rgba(255,255,255,0.55)');
      rg.addColorStop(0.4, 'rgba(67,181,245,0.25)');
      rg.addColorStop(1, 'rgba(67,181,245,0)');
      ctx.save();
      ctx.globalAlpha *= 1 - ft;
      ctx.fillStyle = rg;
      ctx.fillRect(-420, -420, 840, 840);
      ctx.restore();
    }
  }

  // --- Подписи лиги ---
  if (ms >= T_LABEL - 60) {
    const t = easeOut((ms - (T_LABEL - 60)) / 360);
    blit(ctx, a.leagueLabel, 0, LOGO_LEAGUE / 2 + 120 + lerp(20, 0, t), 1, t);
  }

  ctx.restore();
}

function jolt(ms) {
  const k = decay(ms, T_HIT, 240, 6);
  return { x: k * 10, y: -k * 6 };
}

/**
 * Один кадр перехода.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} p прогресс 0..1
 * @param {object} assets см. prepareBumperAssets
 */
export function drawBumperFrame(ctx, p, assets = {}) {
  const ms = clamp01(p) * SWEEP_MS;
  const a = ensure(ctx, assets);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, FRAME_W, FRAME_H);

  const j = jolt(ms);
  ctx.save();
  ctx.translate(j.x, j.y);

  // Сначала гости (нижняя правая), потом хозяева: при смыкании левая
  // ложится сверху, и шов читается одной линией.
  drawShutter(ctx, ms, false, a);
  drawShutter(ctx, ms, true, a);
  drawContent(ctx, ms, a);
  drawSeamFlash(ctx, ms);

  ctx.restore();
}
