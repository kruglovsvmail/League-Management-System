// src/components/WebGraphics/defaultGraphics/bumperScene.js
//
// 3D-сцена перехода «Щелчок» (сценарий — в ./bumperFrame.js). Загружается
// только при сборке перехода в панели, в эфир не попадает.
//
// ВСЁ — ФУНКЦИЯ ВРЕМЕНИ. render(ms) расставляет сцену на момент ms с нуля, без
// накопленного состояния: кадры собираются по одному, а для размытия в движении
// между ними берутся промежуточные моменты — порядок вызовов любой.
//
// Мир: 1 единица = 100 px кадра в плоскости z = 0 (кадр там — 19,2 × 10,8),
// камера смотрит вдоль −z. Плиты лежат лицевой гранью в z = 0, шайба стоит
// перед ними.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FRAME_W, FRAME_H, T } from './bumperFrame';
import { teamColor } from './theme';

// Шайба из Blender (design/puck-3d-2026-10-08/puck_web.glb), в S3 лежит как
// leagues/default/3d-models/puck.glb. Панель берёт её через сервер
// (raw.loadModel → /api/games/:id/broadcast/models/puck.glb), как и эмблемы.
// Модель в метрах: радиус 0,0381, ось — Y, торцы ровные.
const PUCK_MODEL = 'puck.glb';
const PUCK_TIMEOUT_MS = 20000;
const MODEL_R = 0.0381;
const MODEL_HALF_H = 0.0127;

// --- Камера ------------------------------------------------------------------
const FOV = 30;
const VIEW_H = FRAME_H / 100;
const CAM_Z = (VIEW_H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));

// --- Палитра: графит иконок HockeyEco, синий TR ------------------------------
const SKATE = '#43B5F5';
const ACCENT = '#1794DD';
const ACCENT_DEEP = '#1379B5';
const TEXT = '#F5F5F3';
const FONT = 'Manrope, Arial, sans-serif';

// --- Плиты -------------------------------------------------------------------
// Каждая плита — половина большого квадрата, разрезанного по диагонали «/»
// через центр кадра. Фаска выпирает за контур на BEV, поэтому сомкнутые плиты
// стоят на BEV от шва каждая: боковые стенки касаются, а лицевые грани
// расходятся V-образной канавкой — в ней и бежит синий свет.
const L = 15;
const DEPTH = 1.1;
const BEV = 0.2;
const SQ = Math.SQRT1_2;
const SEAM_AXIS = new THREE.Vector3(SQ, SQ, 0);
// Наезд начинается сразу за краем кадра — чтобы движение плит было видно
// с первых кадров, а не только в последний миг перед смыканием.
const SLAB_TRAVEL = 12.5;

// --- Шайба -------------------------------------------------------------------
const PUCK_R = 1.7;
// Старт из точки вдали, снизу слева.
const LAUNCH = new THREE.Vector3(-4.5, -2.4, -120);
// Удар почти у самой камеры: шайба в кадре ~1100 px в поперечнике.
const IMPACT = new THREE.Vector3(0, 0, 14);
// Шайба стоит прямо на шве, тыльным торцом почти касаясь плит, и чуть
// наклонена вдоль канавки — будто застряла в ней ребром.
const STAND = new THREE.Vector3(0, 0, 0.62);
const WEDGE = 0.14;
// Наклон торца к камере в момент удара: ребро вперёд, логотип чуть виден.
const EDGE_TILT = 0.32;

// --- Команды -----------------------------------------------------------------
const TEAM_X = 6.0;
const TEAM_Y = 0.5;
const LOGO = 3.8;

// --- Время -------------------------------------------------------------------
const clamp01 = v => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (ms, a, b) => clamp01((ms - a) / (b - a));
const easeIn = t => t * t * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t, s = 1.6) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

// Затухающее колебание: удар, встряска, покачивание.
function decay(ms, from, dur, freq) {
  if (ms < from || ms > from + dur) return 0;
  const t = (ms - from) / dur;
  return Math.sin(t * Math.PI * freq) * Math.pow(1 - t, 2);
}

// Предсказуемый «случай»: один и тот же переход при каждой сборке.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Холсты для текстур ------------------------------------------------------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')];
}

function drawContain(g, img, cx, cy, box) {
  if (!img) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.min(box / iw, box / ih);
  g.drawImage(img, cx - (iw * k) / 2, cy - (ih * k) / 2, iw * k, ih * k);
}

// Потёртость краски — без дыр и сколов (сильный износ Сергей отклонил:
// «логотипы будто болеют»), логотип остаётся сплошным и читаемым.
//
// Команды: износ идёт той же диагональю «/», что и шлифовка плиты, — краска
// стёрта полосами вдоль штрихов, сквозь неё проступает графит.
function applyBrushedWear(g, w, h, seed, { strokes = 2400, bands = 26 } = {}) {
  const r = rng(seed);
  const size = Math.max(w, h);
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.lineCap = 'round';
  const stroke = (alpha, width, len) => {
    const x = r() * size * 1.5 - size * 0.25;
    const y = r() * size * 1.5 - size * 0.25;
    g.strokeStyle = `rgba(0,0,0,${alpha})`;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y - len);
    g.stroke();
  };
  // Широкие затёртые полосы — краска там заметно тоньше.
  for (let i = 0; i < bands; i += 1) stroke(0.12 + r() * 0.16, size * (0.012 + r() * 0.03), size * (0.3 + r() * 0.6));
  // Частые тонкие штрихи.
  for (let i = 0; i < strokes; i += 1) {
    stroke(0.16 + Math.pow(r(), 1.5) * 0.6, 0.6 + Math.pow(r(), 2) * 3, size * (0.04 + Math.pow(r(), 1.6) * 0.45));
  }
  g.restore();
}

function brushedWearCanvas(img, { size = 1024, seed = 1 } = {}) {
  const [c, g] = makeCanvas(size, size);
  drawContain(g, img, size / 2, size / 2, size);
  applyBrushedWear(g, size, size, seed);
  return c;
}

// Шайба: печать на резине, затёртая шайбами и клюшками. Мелкие короткие
// царапины в разные стороны и зерно — слабые, полупрозрачные: печать
// сплошная, читается целиком, но видно, что шайбой играли.
function scuffedPrintCanvas(img, { size = 1024, fill = 0.92, seed = 1 } = {}) {
  const [c, g] = makeCanvas(size, size);
  drawContain(g, img, size / 2, size / 2, size * fill);
  const r = rng(seed);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 16000; i += 1) {
    const sz = 0.6 + r() * 1.8;
    g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.24})`;
    g.fillRect(r() * size, r() * size, sz, sz);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 520; i += 1) {
    const x = r() * size; const y = r() * size;
    const a = r() * Math.PI * 2;
    const len = size * (0.01 + Math.pow(r(), 2) * 0.11);
    g.strokeStyle = `rgba(0,0,0,${0.1 + r() * 0.32})`;
    g.lineWidth = 0.5 + r() * 1.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.5, y + Math.sin(a + 0.4) * len * 0.5,
      x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  return c;
}

function radialCanvas(size, stops) {
  const [c, g] = makeCanvas(size, size);
  const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, color]) => rg.addColorStop(at, color));
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);
  return c;
}

// Вытянутое пятно света — бегунок по шву и лезвие.
function streakCanvas(w = 512, h = 128) {
  const [c, g] = makeCanvas(w, h);
  g.translate(w / 2, h / 2);
  g.scale(w / h, 1);
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, h / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.25, 'rgba(191,230,255,0.85)');
  rg.addColorStop(0.6, 'rgba(67,181,245,0.35)');
  rg.addColorStop(1, 'rgba(67,181,245,0)');
  g.fillStyle = rg;
  g.fillRect(-h / 2, -h / 2, h, h);
  return c;
}

// Графит иконки HockeyEco на весь кадр: тёмный центр, светлее к краям.
function graphiteCanvas() {
  const size = 1024;
  const [c, g] = makeCanvas(size, size);
  const r = size * (11.2 / (2 * L));   // угол кадра — ~11,2 единицы от центра
  const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, r);
  rg.addColorStop(0, '#1D1E1E');
  rg.addColorStop(0.42, '#1D1E1E');
  rg.addColorStop(0.72, '#414343');
  rg.addColorStop(1, '#505252');
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);
  return c;
}

// Шлифовка графита под 45° — тонкие штрихи в карте шероховатости: свет на
// плите ложится полосами вдоль линий конька.
function brushedCanvas() {
  const size = 1024;
  const [c, g] = makeCanvas(size, size);
  const r = rng(45);
  g.fillStyle = 'rgb(150,150,150)';
  g.fillRect(0, 0, size, size);
  g.lineCap = 'round';
  for (let i = 0; i < 2600; i += 1) {
    const x = r() * size * 2 - size / 2;
    const len = 40 + r() * 260;
    const v = Math.round(90 + r() * 120);
    g.strokeStyle = `rgba(${v},${v},${v},${0.18 + r() * 0.3})`;
    g.lineWidth = 0.6 + r() * 1.6;
    const y = r() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y - len);
    g.stroke();
  }
  return c;
}

function fitFont(g, text, maxW, start, min, weight = 800) {
  let px = start;
  for (;;) {
    g.font = `${weight} ${px}px ${FONT}`;
    if (g.measureText(text).width <= maxW || px <= min) return px;
    px -= 2;
  }
}

// Название команды и полоса её цвета — нарисованы на плите той же краской,
// что и логотип: без тени, с той же диагональной потёртостью. Длинное
// название («Металлург-Магнитогорск-2») переносится на вторую строку по
// пробелу или дефису ближе к середине, а не сжимается в мелкий шрифт.
// 200 px холста = 1 единица мира; высота холста — под две строки.
const LABEL_W = 1040;
const LABEL_H = 300;

function splitName(text) {
  let best = null;
  for (let i = 1; i < text.length - 1; i += 1) {
    const ch = text[i];
    if (ch !== ' ' && ch !== '-') continue;
    const cutAt = ch === '-' ? i + 1 : i;
    const score = Math.abs(cutAt - text.length / 2);
    if (!best || score < best.score) best = { score, cutAt };
  }
  if (!best) return null;
  return [text.slice(0, best.cutAt).trim(), text.slice(best.cutAt).trim()];
}

function teamLabelCanvas(name, color, seed) {
  const [c, g] = makeCanvas(LABEL_W, LABEL_H);
  const text = String(name || '').toUpperCase();
  g.letterSpacing = '2px';
  let lines = [text];
  let px = fitFont(g, text, LABEL_W - 40, 76, 40);
  if (px < 64) {
    const parts = splitName(text);
    if (parts) {
      lines = parts;
      px = Math.min(...parts.map(t => fitFont(g, t, LABEL_W - 40, 70, 40)));
    }
  }
  g.font = `800 ${px}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = TEXT;
  const lineH = px * 1.1;
  lines.forEach((t, i) => g.fillText(t, LABEL_W / 2, 72 + i * lineH));
  g.fillStyle = color || ACCENT;
  g.beginPath();
  g.roundRect(LABEL_W / 2 - 80, 72 + (lines.length - 1) * lineH + px / 2 + 32, 160, 12, 6);
  g.fill();
  applyBrushedWear(g, LABEL_W, LABEL_H, seed, { strokes: 1100, bands: 12 });
  return c;
}

// Синяя плашка дивизиона под шайбой. Название лиги и заголовок заставки
// («Реклама») Сергей убрал (12.10.2026).
function divisionCanvas(division) {
  const W = 1200; const H = 140;
  const [c, g] = makeCanvas(W, H);
  const t = String(division).toUpperCase();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '6px';
  g.font = `800 44px ${FONT}`;
  const w = Math.min(W - 40, g.measureText(t).width + 104);
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 18;
  g.shadowOffsetY = 5;
  const grad = g.createLinearGradient(W / 2 - w / 2, 0, W / 2 + w / 2, 0);
  grad.addColorStop(0, ACCENT_DEEP);
  grad.addColorStop(1, ACCENT);
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(W / 2 - w / 2, H / 2 - 44, w, 88, 22);
  g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = '#FFFFFF';
  g.fillText(t, W / 2 + 3, H / 2 + 2);
  return c;
}

// --- Шейдеры -----------------------------------------------------------------

// Блик по плите: светлая полоса параллельно шву, идёт через обе плиты.
const SHEEN_VS = `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const SHEEN_FS = `
  uniform float uCenter;
  uniform float uStrength;
  varying vec2 vP;
  void main() {
    float s = (vP.x - vP.y) * 0.70710678;
    float wide = exp(-pow((s - uCenter) / 1.1, 2.0));
    float core = exp(-pow((s - uCenter) / 0.16, 2.0));
    gl_FragColor = vec4(vec3(1.0), (wide * 0.6 + core * 0.4) * uStrength);
  }`;

// --- Сцена -------------------------------------------------------------------

async function loadPuckModel(loadModel) {
  let timer = null;
  try {
    if (typeof loadModel !== 'function') throw new Error('панель не передала загрузчик модели');
    const buffer = await Promise.race([
      loadModel(PUCK_MODEL),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('нет ответа')), PUCK_TIMEOUT_MS); }),
    ]);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    return gltf.scene;
  } catch (e) {
    // Простую шайбу вместо модели не подставляем: такой переход ушёл бы в S3
    // и в эфир, и подмену никто бы не заметил.
    throw new Error(`Не загрузилась 3D-модель шайбы: ${e?.message || e}. `
      + `Проверьте, что в S3 лежит leagues/default/3d-models/${PUCK_MODEL}.`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} raw { leagueImg, homeImg, awayImg, leagueName, division, title,
 *                       homeName, awayName, homeColor, awayColor, loadModel(имя) → ArrayBuffer }
 * @returns {Promise<{ render(ms: number): HTMLCanvasElement, dispose(): void }>}
 */
export async function createBumperScene(raw, { onProgress } = {}) {
  // Цвет команды — по тому же правилу, что во всех плашках (theme.teamColor):
  // цвет из БД бывает без «#», почти чёрный первый заменяется вторым, слишком
  // тёмный осветляется. Сырой цвет three.js не разбирал — ореол и фаски
  // выходили белыми или чёрными (12.10.2026).
  const colorGame = {
    home_color_1: raw.homeColor, home_color_2: raw.homeColor2,
    away_color_1: raw.awayColor, away_color_2: raw.awayColor2,
  };
  const homeColor = teamColor(colorGame, 'home');
  const awayColor = teamColor(colorGame, 'away');
  const textures = [];
  const track = (t) => { textures.push(t); return t; };
  const tex = (canvas, srgb = true) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return track(t);
  };

  // --- Рендерер ---
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(FRAME_W, FRAME_H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.38;
  pmrem.dispose();
  onProgress?.(0.15);

  const camera = new THREE.PerspectiveCamera(FOV, FRAME_W / FRAME_H, 0.1, 400);

  // --- Свет ---
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-7, 9, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 9, bottom: -9, near: 1, far: 60 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 4;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0x9fd4ff, 0.6);
  fill.position.set(9, -5, 10);
  scene.add(fill);

  const runnerLight = new THREE.PointLight(SKATE, 0, 9, 2);
  scene.add(runnerLight);

  // Свет из канавки шва по обе стороны от застрявшей шайбы — подсвечивает
  // её кромку синим снизу.
  const grooveLights = [-1, 1].map((k) => {
    const l = new THREE.PointLight(SKATE, 0, 2.8, 2);
    l.position.set(k * 1.95 * SQ, k * 1.95 * SQ, 0.3);
    scene.add(l);
    return l;
  });

  // --- Плиты ---
  const graphite = tex(graphiteCanvas());
  graphite.wrapS = graphite.wrapT = THREE.ClampToEdgeWrapping;
  graphite.repeat.set(1 / (2 * L), 1 / (2 * L));
  graphite.offset.set(0.5, 0.5);
  const brushed = tex(brushedCanvas(), false);
  brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping;
  brushed.repeat.set(1 / 7, 1 / 7);
  const slabMat = new THREE.MeshStandardMaterial({
    map: graphite, roughness: 0.34, roughnessMap: brushed, metalness: 0.62, envMapIntensity: 0.9,
  });

  const glowTex = tex(radialCanvas(256, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]));
  const streakTex = tex(streakCanvas());

  const sheenMats = [];
  const seamBloomTex = tex(radialCanvas(256, [[0, 'rgba(120,200,255,0.9)'], [1, 'rgba(67,181,245,0)']]));

  const buildSlab = (isHome) => {
    const shape = new THREE.Shape();
    if (isHome) {
      shape.moveTo(-L, -L); shape.lineTo(L, L); shape.lineTo(-L, L);
    } else {
      shape.moveTo(-L, -L); shape.lineTo(L, -L); shape.lineTo(L, L);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: DEPTH, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 4, curveSegments: 1,
    });
    geo.translate(0, 0, -(DEPTH + BEV));   // лицевая грань — в z = 0

    const side = isHome ? -1 : 1;
    const img = isHome ? raw.homeImg : raw.awayImg;
    const color = isHome ? homeColor : awayColor;
    const name = isHome ? raw.homeName : raw.awayName;

    // Фаски и торцы плиты светятся цветом её команды: и в шве, и на въезде
    // видно, где чья половина. Лицевая грань — общий графит (группы
    // ExtrudeGeometry: 0 — лицо и тыл, 1 — боковины вместе с фаской).
    const edgeMat = new THREE.MeshStandardMaterial({
      color: '#2A2B2B', roughness: 0.3, metalness: 0.7, envMapIntensity: 0.8,
      emissive: color, emissiveIntensity: 0.65,
    });
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geo, [slabMat, edgeMat]);
    mesh.receiveShadow = true;
    group.add(mesh);

    // Свечение цвета команды за логотипом.
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, 10.5),
      new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    glow.position.set(side * TEAM_X, TEAM_Y, 0.005);
    group.add(glow);

    // Логотип с тенью: просто логотип, без плитки-иконки.
    const logo = new THREE.Group();
    logo.position.set(side * TEAM_X, TEAM_Y, 0);
    if (img) {
      // Краска на плите: сквозь потёртости и лёгкую прозрачность проступает
      // шлифовка, поверх проходит блик плиты. Сама краска светом сцены не
      // освещается: подсветка цветом команды стоит прямо перед логотипом и
      // пересвечивала его — красный выходил розовым, синий голубым.
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(LOGO, LOGO),
        new THREE.MeshBasicMaterial({
          map: tex(brushedWearCanvas(img, { seed: isHome ? 11 : 23 })), color: '#ECECEC', transparent: true, opacity: 0.97,
          depthWrite: false, toneMapped: false,
        }),
      );
      face.position.z = 0.02;
      logo.add(face);
    }
    group.add(logo);

    // Название команды под логотипом — краской на плите, вместе с ней и
    // въезжает. Верх холста стоит там же, где стояла однострочная подпись.
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(LABEL_W / 200, LABEL_H / 200),
      new THREE.MeshBasicMaterial({
        map: tex(teamLabelCanvas(name, color, isHome ? 31 : 47)), color: '#ECECEC', transparent: true, opacity: 0.97,
        depthWrite: false, toneMapped: false,
      }),
    );
    label.position.set(side * TEAM_X, TEAM_Y - LOGO / 2 - 0.05 - LABEL_H / 400, 0.03);
    group.add(label);

    // Линии конька в свободном углу: левый верхний у хозяев, правый нижний у
    // гостей. Как на иконке HockeyEco, линии «/» срезают угол и уходят за край
    // кадра, а не висят обрывками.
    const lines = [];
    const corner = isHome ? new THREE.Vector2(-9.6, 5.4) : new THREE.Vector2(9.6, -5.4);
    const EXT = 2.2;
    const along = new THREE.Vector2(SQ, SQ);
    const lineEnds = (cut) => {
      const a = isHome ? new THREE.Vector2(corner.x, corner.y - cut) : new THREE.Vector2(corner.x - cut, corner.y);
      const b = isHome ? new THREE.Vector2(corner.x + cut, corner.y) : new THREE.Vector2(corner.x, corner.y + cut);
      return [a.addScaledVector(along, -EXT), b.addScaledVector(along, EXT)];
    };
    [[3.6, 0.6, 0.06], [2.3, 0.38, 0.045]].forEach(([cut, opacity, width], i) => {
      const [start, end] = lineEnds(cut);
      const len = start.distanceTo(end);
      const geo = new THREE.PlaneGeometry(len, width);
      geo.translate(len / 2, 0, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: SKATE, transparent: true, opacity, depthWrite: false, toneMapped: false }));
      m.position.set(start.x, start.y, 0.02);
      m.rotation.z = Math.PI / 4;
      group.add(m);
      lines.push({ mesh: m, delay: i * 120 });
    });
    const [t0, t1] = lineEnds(3.6);
    const tintShape = new THREE.Shape();
    tintShape.moveTo(t0.x, t0.y);
    tintShape.lineTo(t1.x, t1.y);
    tintShape.lineTo(isHome ? t0.x : t1.x, isHome ? t1.y : t0.y);
    tintShape.closePath();
    const tint = new THREE.Mesh(new THREE.ShapeGeometry(tintShape),
      new THREE.MeshBasicMaterial({ color: SKATE, transparent: true, opacity: 0.07, depthWrite: false, toneMapped: false }));
    tint.position.z = 0.015;
    group.add(tint);

    // Блик поверх всего, что лежит на плите.
    const sheenMat = new THREE.ShaderMaterial({
      vertexShader: SHEEN_VS, fragmentShader: SHEEN_FS,
      uniforms: { uCenter: { value: -20 }, uStrength: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    sheenMats.push(sheenMat);
    const sheen = new THREE.Mesh(new THREE.ShapeGeometry(shape), sheenMat);
    sheen.position.z = 0.04;
    group.add(sheen);

    // Кромка шва: при разлёте свет из канавки остаётся на ребре каждой плиты и
    // уезжает вместе с ней — шов «рвётся» надвое. Лежит на боковой стенке,
    // которая выпирает за контур к соседней плите (−normal).
    const normal = new THREE.Vector3(side * SQ, -side * SQ, 0);
    const edgeCore = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 0.08),
      new THREE.MeshBasicMaterial({ color: '#E6F6FF', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    const edgeBloom = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 1.2),
      new THREE.MeshBasicMaterial({ map: seamBloomTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    [edgeBloom, edgeCore].forEach((m, i) => {
      m.rotation.z = Math.PI / 4;
      m.position.copy(normal).multiplyScalar(-BEV * 0.6);
      m.position.z = 0.05 + i * 0.01;
      group.add(m);
    });

    scene.add(group);
    return { group, side, normal, logo, glow, label, lines, edgeCore, edgeBloom };
  };

  const home = buildSlab(true);
  const away = buildSlab(false);

  // --- Шов: свет в канавке, бегунок, лезвие при смыкании ---
  const seamGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 0.16),
    new THREE.MeshBasicMaterial({ color: SKATE, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  );
  seamGlow.rotation.z = Math.PI / 4;
  seamGlow.position.z = -0.14;
  scene.add(seamGlow);

  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.7),
    new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  );
  runner.rotation.z = Math.PI / 4;
  scene.add(runner);

  const bladeCore = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 0.09),
    new THREE.MeshBasicMaterial({ color: '#E6F6FF', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  );
  bladeCore.rotation.z = Math.PI / 4;
  bladeCore.position.z = 0.06;
  const bladeBloom = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 1.6),
    new THREE.MeshBasicMaterial({ map: tex(radialCanvas(256, [[0, 'rgba(120,200,255,0.9)'], [1, 'rgba(67,181,245,0)']])), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  );
  bladeBloom.rotation.z = Math.PI / 4;
  bladeBloom.position.z = 0.05;
  scene.add(bladeCore, bladeBloom);

  // --- Дивизион под шайбой ---
  const divisionLabel = raw.division ? new THREE.Mesh(
    new THREE.PlaneGeometry(6, 0.7),
    new THREE.MeshBasicMaterial({ map: tex(divisionCanvas(raw.division)), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  ) : null;
  if (divisionLabel) scene.add(divisionLabel);

  // --- Удар ребром: вспышка и круговая волна ---
  // Без линий и разбитого стекла — обе версии Сергей отклонил.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }),
  );
  flash.position.set(0, 0, IMPACT.z + 0.1);
  flash.renderOrder = 12;
  scene.add(flash);

  const tearFlash = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: glowTex, color: '#BFE6FF', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  );
  tearFlash.position.set(0, 0, 0.4);
  scene.add(tearFlash);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1, 128),
    new THREE.MeshBasicMaterial({ color: SKATE, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  ring.position.set(0, 0, IMPACT.z + 0.08);
  ring.renderOrder = 11;
  scene.add(ring);

  // --- Шайба ---
  // pos → sway (покачивание в мире) → flip (ось шайбы к камере) → spin (вокруг оси) → модель
  const puckPos = new THREE.Group();
  const puckSway = new THREE.Group();
  const puckFlip = new THREE.Group();
  const puckSpin = new THREE.Group();
  puckPos.add(puckSway); puckSway.add(puckFlip); puckFlip.add(puckSpin);
  puckSpin.scale.setScalar(PUCK_R / MODEL_R);
  scene.add(puckPos);

  const model = await loadPuckModel(raw.loadModel);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  puckSpin.add(model);
  onProgress?.(0.85);

  // Логотип лиги «напечатан» на верхнем торце почти во весь торец:
  // полупрозрачная краска на резине, без собственного свечения — свет и
  // блики у него те же, что у шайбы. Плоскость круга лежит в XZ лицом к +Y;
  // «верх» картинки — к −Z модели, и когда шайба повёрнута осью к камере, он
  // смотрит вверх кадра.
  if (raw.leagueImg) {
    const decal = new THREE.Mesh(
      new THREE.CircleGeometry(MODEL_R * 0.97, 128),
      new THREE.MeshStandardMaterial({
        map: tex(scuffedPrintCanvas(raw.leagueImg, { seed: 5 })), transparent: true, opacity: 0.88,
        roughness: 0.55, metalness: 0, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = MODEL_HALF_H + 0.00004;
    puckSpin.add(decal);
  }

  onProgress?.(1);

  // --- Кадр ---

  const placeSlab = (slab, ms) => {
    let d;
    let tilt;
    if (ms < T.SLAM) {
      const u = seg(ms, T.SLAB_IN, T.SLAM);
      const e = u * u;
      d = SLAB_TRAVEL * (1 - e);
      tilt = 0.45 * (1 - e);
    } else if (ms < T.SPLIT) {
      d = 0.22 * Math.abs(decay(ms, T.SLAM, 260, 2));
      tilt = 0.02 * decay(ms, T.SLAM, 320, 3);
    } else {
      const e = easeIn(seg(ms, T.SPLIT, T.GONE));
      d = (SLAB_TRAVEL + 6) * e;
      tilt = 0.5 * e;
    }
    slab.group.visible = ms >= T.SLAB_IN && ms < T.GONE;
    slab.group.position.copy(slab.normal).multiplyScalar(BEV + d);
    // Плита поворачивается вокруг шва внешним краем к камере.
    slab.group.quaternion.setFromAxisAngle(SEAM_AXIS, slab.side < 0 ? tilt : -tilt);

    // Логотип «встаёт» при смыкании, свечение цвета команды разгорается.
    const pop = seg(ms, T.SLAM, T.SLAM + 360);
    slab.logo.scale.setScalar(lerp(0.9, 1, easeOutBack(pop)));
    slab.glow.material.opacity = 0.95 * easeOut(seg(ms, T.SLAM, T.SLAM + 500));


    // Вспышка кромки на разлёте: резко вверх и гаснет за полсекунды.
    const tear = ms < T.SPLIT ? 0 : Math.min(1, (ms - T.SPLIT) / 40) * Math.pow(1 - seg(ms, T.SPLIT, T.SPLIT + 560), 1.4);
    slab.edgeCore.material.opacity = tear;
    slab.edgeBloom.material.opacity = 0.9 * tear;
    slab.edgeCore.visible = slab.edgeBloom.visible = tear > 0.001;

    slab.lines.forEach(({ mesh, delay }) => {
      mesh.scale.x = Math.max(0.0001, easeOut(seg(ms, T.SLAM + 80 + delay, T.SLAM + 700 + delay)));
    });
  };

  const placePuck = (ms) => {
    const pos = new THREE.Vector3();
    let flip; let spin = 0; let swayY = 0; let swayZ = 0;

    if (ms < T.IMPACT) {
      const u = ms / T.IMPACT;
      // Летит из точки вдали по прямой с постоянной скоростью, без
      // искусственного замедления: «разгон» даёт перспектива — вдали шайба
      // почти не растёт, у камеры растёт стремительно.
      pos.lerpVectors(LAUNCH, IMPACT, u);
      // Кувыркается по всем трём осям с постоянной скоростью и к удару
      // приходит ребром к камере (торец с логотипом лишь чуть наклонён):
      // каждая ось отсчитывается назад от своего положения в момент удара.
      const back = u - 1;
      flip = EDGE_TILT + Math.PI * 2 * 1.5 * back;
      swayY = Math.PI * 2 * 1.0 * back;
      swayZ = Math.PI * 2 * -0.75 * back;
      spin = Math.PI * 2 * 3 * back;
    } else if (ms < T.LAND) {
      const u = seg(ms, T.IMPACT, T.LAND);
      pos.lerpVectors(IMPACT, STAND, easeOut(u));
      pos.y += Math.sin(Math.PI * u) * 1.3;
      // От удара ребром — сальто назад и приземление ребром, логотипом к камере.
      flip = lerp(EDGE_TILT, Math.PI / 2 + Math.PI * 2, easeInOut(u));
      swayY = 0.6 * Math.sin(Math.PI * u);
      swayZ = 0.3 * Math.sin(Math.PI * u);
    } else if (ms < T.OUT) {
      // Застряла: дрожит после удара о плиты и замирает.
      pos.copy(STAND);
      pos.z += 0.12 * Math.abs(decay(ms, T.LAND, 300, 2));
      flip = Math.PI / 2 + 0.05 * decay(ms, T.LAND, 420, 3);
      swayZ = 0.1 * decay(ms, T.LAND, 520, 3);
    } else {
      const u = seg(ms, T.OUT, T.OUT + 350);
      pos.set(STAND.x, lerp(STAND.y, 0.2, u), lerp(STAND.z, CAM_Z + 6, easeIn(u)));
      flip = Math.PI / 2 + 0.25 * easeIn(u);
      spin = -Math.PI * 0.6 * easeIn(u);
    }

    // Наклон вдоль канавки (поворот вокруг оси, поперечной шву): входит при
    // приземлении, выходит, когда шайба вылетает.
    const wedge = WEDGE * seg(ms, T.LAND - 90, T.LAND) * (1 - seg(ms, T.OUT, T.OUT + 120));
    const grooveOn = seg(ms, T.LAND - 60, T.LAND + 200) * (1 - seg(ms, T.OUT, T.OUT + 100));
    grooveLights.forEach((l) => { l.intensity = 9 * grooveOn; });

    puckPos.position.copy(pos);
    puckPos.visible = pos.z < CAM_Z - 1.2;
    puckSway.rotation.set(-wedge * SQ, swayY + wedge * SQ, swayZ);
    puckFlip.rotation.x = flip;
    puckSpin.rotation.y = spin;
  };

  const placeSeam = (ms) => {
    const closed = ms >= T.SLAM && ms < T.SPLIT + 60;
    const settle = seg(ms, T.SLAM, T.SLAM + 450);
    const pulse = 0.5 + 0.12 * Math.sin((ms - T.SLAM) / 260);
    seamGlow.visible = closed;
    seamGlow.material.opacity = closed ? lerp(1, pulse, settle) * (1 - seg(ms, T.SPLIT - 80, T.SPLIT + 60)) : 0;

    // Лезвие: вспышка по всему шву в момент смыкания.
    const blade = ms >= T.SLAM ? Math.pow(1 - seg(ms, T.SLAM, T.SLAM + 260), 1.6) : 0;
    bladeCore.material.opacity = blade;
    bladeBloom.material.opacity = blade * 0.9;
    bladeCore.visible = bladeBloom.visible = blade > 0.001;

    // Бегунок: два прохода света снизу-слева вверх-вправо.
    let q = null;
    [[T.SLAM + 120, T.SLAM + 900], [T.SLAM + 1000, T.OUT + 40]].forEach(([a, b]) => {
      if (ms >= a && ms <= b) q = lerp(-10, 10, easeInOut(seg(ms, a, b)));
    });
    runner.visible = q !== null;
    if (q !== null) {
      const fade = Math.min(1, (10 - Math.abs(q)) / 3);
      runner.position.set(q * SQ, q * SQ, 0.05);
      runner.material.opacity = fade;
      runnerLight.position.set(q * SQ, q * SQ, 0.9);
      runnerLight.intensity = 22 * fade;
    } else {
      runnerLight.intensity = 0;
    }
  };

  const placeImpact = (ms) => {
    const after = ms - T.IMPACT;
    const f = after >= 0 ? Math.pow(1 - seg(ms, T.IMPACT, T.IMPACT + 240), 2) : 0;
    flash.visible = f > 0.001;
    flash.material.opacity = 0.8 * f;
    flash.scale.setScalar(lerp(2, 4.5, easeOut(seg(ms, T.IMPACT, T.IMPACT + 240))));

    const ru = seg(ms, T.IMPACT, T.IMPACT + 420);
    ring.visible = after >= 0 && ru < 1;
    ring.scale.setScalar(lerp(0.5, 4.5, easeOut(ru)));
    ring.material.opacity = 0.85 * Math.pow(1 - ru, 1.4);
  };

  const placeDivision = (ms) => {
    if (!divisionLabel) return;
    const a = easeOut(seg(ms, T.LAND + 60, T.LAND + 420));
    const out = seg(ms, T.OUT - 20, T.OUT + 160);
    divisionLabel.material.opacity = a * (1 - out);
    divisionLabel.visible = divisionLabel.material.opacity > 0.001;
    divisionLabel.position.set(0, -2.55 - 0.3 * (1 - a), 0.7);
  };

  const placeTear = (ms) => {
    const f = ms < T.SPLIT ? 0 : Math.min(1, (ms - T.SPLIT) / 30) * Math.pow(1 - seg(ms, T.SPLIT, T.SPLIT + 300), 2);
    tearFlash.visible = f > 0.001;
    tearFlash.material.opacity = 0.85 * f;
    tearFlash.scale.setScalar(lerp(3, 9, easeOut(seg(ms, T.SPLIT, T.SPLIT + 300))));
  };

  const placeLights = (ms) => {
    sheenMats.forEach((m) => {
      const u = seg(ms, T.SLAM + 500, T.OUT - 100);
      m.uniforms.uCenter.value = lerp(-13, 13, easeInOut(u));
      m.uniforms.uStrength.value = 0.16 * Math.sin(Math.PI * u);
    });
  };

  const placeCamera = (ms) => {
    const shake = decay(ms, T.IMPACT, 320, 5) * 0.3 + decay(ms, T.SLAM, 320, 6) * 0.2;
    // Медленный наезд со сдвигом вбок, пока кадр закрыт: плиты чуть
    // поворачиваются к камере, и видно, что они объёмные.
    const push = easeInOut(seg(ms, T.SLAM, T.SPLIT));
    camera.position.set(shake + 0.7 * push, shake * 0.6, CAM_Z - 1.1 * push);
    camera.lookAt(0.3 * push, 0, 0);
  };

  const render = (ms) => {
    placeCamera(ms);
    placeSlab(home, ms);
    placeSlab(away, ms);
    placeSeam(ms);
    placeImpact(ms);
    placePuck(ms);
    placeDivision(ms);
    placeTear(ms);
    placeLights(ms);
    renderer.render(scene, camera);
    return canvas;
  };

  const dispose = () => {
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
        m.dispose();
      });
    });
    textures.forEach(t => t.dispose());
    envRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  return { render, dispose };
}
