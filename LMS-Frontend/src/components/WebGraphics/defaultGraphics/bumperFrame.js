// src/components/WebGraphics/defaultGraphics/bumperFrame.js
//
// Геометрия дефолтного перехода и его отрисовка на canvas — для выгрузки в
// WebM с прозрачностью.
//
// Единственный источник рисунка: переход собирается один раз в панели и живёт
// файлом в S3, эфир его только проигрывает. Подробнее — в
// Graphics_3/bumperFrame.js.

export const SWEEP_MS = 2400;
export const COVER_MS = 1200;

export const FRAME_W = 1920;
export const FRAME_H = 1080;

const SKEW_DEG = -14;
const SLAB_W_PCT = 150;
const EDGE_W = 10;

const CREST_TEAM = 150;
const CREST_LEAGUE = 190;
const MARK_GAP = 64;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Знаки: появление к 28%, удержание до 72%, уход. Те же проценты, что в CSS.
function markState(p) {
  if (p <= 0.28) {
    const t = clamp01(p / 0.28);
    return { opacity: t, scale: lerp(0.86, 1, t) };
  }
  if (p <= 0.72) return { opacity: 1, scale: 1 };
  const t = clamp01((p - 0.72) / 0.28);
  return { opacity: 1 - t, scale: lerp(1, 1.06, t) };
}

// Эквивалент cubic-bezier(0.66, 0, 0.34, 1).
function easeSweep(p) {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function drawCircleImage(ctx, img, cx, cy, size) {
  if (!img) return;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

export function drawBumperFrame(ctx, p, assets = {}) {
  const { leagueImg, homeImg, awayImg, division, title, homeColor, awayColor } = assets;

  ctx.clearRect(0, 0, FRAME_W, FRAME_H);

  const slabW = (FRAME_W * SLAB_W_PCT) / 100;
  const travel = slabW * 1.5;
  const x = lerp(-travel, travel, easeSweep(p));

  // Шторка выходит за кадр по вертикали на 8%, как в DOM-версии
  const top = -FRAME_H * 0.08;
  const h = FRAME_H * 1.16;

  ctx.save();
  const cx = x + slabW / 2;
  const cy = top + h / 2;
  ctx.translate(cx, cy);
  ctx.transform(1, 0, Math.tan((SKEW_DEG * Math.PI) / 180), 1, 0, 0);
  ctx.translate(-cx, -cy);

  ctx.fillStyle = '#09090b';
  ctx.fillRect(x, top, slabW, h);

  ctx.fillStyle = homeColor || '#facc15';
  ctx.fillRect(x, top, EDGE_W, h);
  ctx.fillStyle = awayColor || '#ffffff';
  ctx.fillRect(x + slabW - EDGE_W, top, EDGE_W, h);
  ctx.restore();

  const m = markState(p);
  if (m.opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = m.opacity;
  ctx.translate(FRAME_W / 2, FRAME_H / 2);
  ctx.scale(m.scale, m.scale);

  const teamOffset = CREST_LEAGUE / 2 + MARK_GAP + CREST_TEAM / 2;
  drawCircleImage(ctx, homeImg, -teamOffset, 0, CREST_TEAM);
  drawCircleImage(ctx, awayImg, teamOffset, 0, CREST_TEAM);
  drawCircleImage(ctx, leagueImg, 0, -30, CREST_LEAGUE);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (division) {
    ctx.font = '900 15px Inter, sans-serif';
    ctx.letterSpacing = '3.6px';
    ctx.fillStyle = '#d4d4d8';
    ctx.fillText(String(division).toUpperCase(), 0, CREST_LEAGUE / 2 - 4);
  }
  if (title) {
    ctx.font = '900 24px Inter, sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillStyle = '#facc15';
    ctx.fillText(String(title).toUpperCase(), 0, CREST_LEAGUE / 2 + 30);
  }

  ctx.letterSpacing = '0px';
  ctx.restore();
}
