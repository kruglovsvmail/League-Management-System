// src/utils/exportBumperWebm.js
//
// Сборка перехода заставки в WebM С ПРОЗРАЧНЫМ ФОНОМ. Файл кладётся в S3, эфир
// его проигрывает, и он же годится Stinger-переходом в OBS.
//
// ПОЧЕМУ MediaRecorder, А НЕ WebCodecs. WebCodecs выглядит подходящим — у
// VideoEncoderConfig есть поле `alpha: 'keep'`. Но Chromium его не реализует ни
// для одного кодека: isConfigSupported на такую конфигурацию отвечает отказом,
// и кнопка сборки просто гасла. Прозрачность в Chromium умеет другой путь —
// запись canvas с альфой через MediaRecorder в VP8. VP9 в MediaRecorder альфу
// теряет, поэтому кодек зафиксирован именно VP8.
//
// Отсюда же следует, что запись идёт В РЕАЛЬНОМ ВРЕМЕНИ: MediaRecorder ставит
// кадрам метки по стенным часам, ускорить его нельзя. Переход длится 2,4
// секунды — столько же занимает и сборка.
//
// ПОЧЕМУ КАДРЫ ОТДАЮТСЯ ВРУЧНУЮ. `captureStream(FPS)` снимает холст сам, «как
// получится»: браузер решает, когда заглянуть в canvas, и попадает то между
// двумя отрисовками, то дважды в одну. В файле это выходит неровным шагом —
// ролик дёргается даже в обычном плеере. Поэтому поток создаётся с частотой 0
// («кадры по запросу»), а мы рисуем и отдаём ровно 30 кадров в секунду по
// заранее посчитанному расписанию.

const FPS = 30;
const FRAME_MS = 1000 / FPS;
const MIME = 'video/webm;codecs=vp8';

// Свои модули на лигу — как и у самих плашек. Нет своего файла — берём дефолт.
const frameModules = import.meta.glob('../components/WebGraphics/*/bumperFrame.js');

/**
 * Умеет ли браузер собрать переход с прозрачностью.
 *
 * Практически это «любой браузер на Chromium»: захват canvas в поток и запись
 * VP8 с альфа-каналом есть в Chrome, Edge, Opera, Yandex, Vivaldi, Brave.
 * Safari и Firefox либо не пишут VP8, либо теряют прозрачность.
 *
 * @returns {{ supported: boolean, reason: string|null }}
 */
export function checkBumperExportSupport() {
  if (typeof window === 'undefined'
    || typeof window.MediaRecorder !== 'function'
    || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    return { supported: false, reason: 'Браузер не умеет записывать видео с холста' };
  }
  if (!window.MediaRecorder.isTypeSupported?.(MIME)) {
    return { supported: false, reason: 'Браузер не пишет VP8 с прозрачностью' };
  }
  return { supported: true, reason: null };
}

async function loadFrameModule(leagueId) {
  const target = `../components/WebGraphics/Graphics_${leagueId}/bumperFrame.js`;
  const fallback = '../components/WebGraphics/defaultGraphics/bumperFrame.js';
  const load = frameModules[target] || frameModules[fallback];
  if (!load) throw new Error('Модуль отрисовки перехода не найден');
  return load();
}

/**
 * Длительность перехода этой лиги. Панель по ней считает, сколько держать
 * плитку зажатой, и когда под переходом менять картинку. Раньше эти цифры были
 * зашиты в панель константой и разъезжались с графикой при любой правке
 * сценария — теперь берутся из того же модуля, что и сам рисунок.
 *
 * @returns {Promise<{ sweepMs: number, coverMs: number }>}
 */
export async function getBumperTiming(leagueId) {
  const mod = await loadFrameModule(leagueId);
  return { sweepMs: mod.SWEEP_MS, coverMs: mod.COVER_MS };
}

const loadImage = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

// Ждём наступления момента по стенным часам. rAF, а не setTimeout: таймер
// просыпается с точностью до нескольких миллисекунд и накапливает опоздание,
// а кадровые тики идут вдвое чаще нашего шага и попадают точнее.
const waitUntil = (time) => new Promise((resolve) => {
  const tick = () => {
    if (performance.now() >= time) resolve();
    else requestAnimationFrame(tick);
  };
  tick();
});

/**
 * Собирает WebM с альфой и отдаёт Blob.
 *
 * @param {object}   opts
 * @param {number}   opts.leagueId   какой набор графики рисовать
 * @param {object}   opts.logos      { league, division, home, away } — ОБЯЗАТЕЛЬНО
 *                                   data-URI, иначе холст «портится» и запись
 *                                   потока запрещена
 * @param {string}   opts.division   название дивизиона
 * @param {string}   opts.homeName   название команды хозяев
 * @param {string}   opts.awayName   название команды гостей
 * @param {string}   opts.title
 * @param {string}   opts.homeColor
 * @param {string}   opts.awayColor
 * @param {function} opts.onProgress прогресс 0..1
 */
export async function exportBumperWebm(opts) {
  const {
    leagueId, logos = {}, division, homeName, awayName,
    title, homeColor, awayColor, onProgress,
  } = opts;

  const support = checkBumperExportSupport();
  if (!support.supported) throw new Error(support.reason);

  const mod = await loadFrameModule(leagueId);
  const { drawBumperFrame, SWEEP_MS, FRAME_W, FRAME_H } = mod;

  const [leagueImg, divisionImg, homeImg, awayImg] = await Promise.all([
    loadImage(logos.league), loadImage(logos.division),
    loadImage(logos.home), loadImage(logos.away),
  ]);

  // Шрифты должны быть готовы ДО первого кадра: canvas не ждёт загрузки шрифта
  // и молча нарисует подписи системным.
  try {
    await document.fonts?.load?.('24px "Aire Exterior"');
    await document.fonts?.load?.('800 14px Manrope');
    await document.fonts?.ready;
  } catch { /* нет шрифта — подписи выйдут системным, но файл соберётся */ }

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d', { alpha: true });

  const assets = {
    leagueImg, divisionImg, homeImg, awayImg,
    division, homeName, awayName, title, homeColor, awayColor,
  };

  // Первый кадр рисуем ДО старта записи — заодно он прогревает кэш заготовок в
  // модуле отрисовки, чтобы дорогая подготовка не пришлась на кадр под запись.
  drawBumperFrame(ctx, 0, assets);

  // Частота 0 = «кадры по запросу»: холст попадёт в поток ровно столько раз,
  // сколько мы позовём requestFrame. Если браузер такого не умеет, отдаём поток
  // на откуп ему — выйдет менее ровно, но соберётся.
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const manual = typeof track?.requestFrame === 'function';
  const autoStream = manual ? null : canvas.captureStream(FPS);
  const recStream = manual ? stream : autoStream;
  if (!manual) stream.getTracks().forEach((t) => t.stop());

  const chunks = [];
  const recorder = new MediaRecorder(recStream, { mimeType: MIME, videoBitsPerSecond: 12_000_000 });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    recorder.onerror = (e) => reject(e.error || new Error('Сбой записи'));
  });

  // Ждём подтверждения старта: если начать отдавать кадры раньше, первые из них
  // записи не достаются, и переход в файле начинается с рывка.
  await new Promise((resolve) => {
    recorder.onstart = resolve;
    recorder.start();
  });

  // Расписание: кадр i приходится на started + i * 33,3 мс. Прогресс берём от
  // номера кадра, а не от часов, — так шаг анимации внутри файла ровный, даже
  // если один кадр случайно нарисовался дольше остальных.
  const total = Math.max(1, Math.round(SWEEP_MS / FRAME_MS));
  const started = performance.now();

  for (let i = 0; i <= total; i += 1) {
    if (i > 0) await waitUntil(started + i * FRAME_MS);
    drawBumperFrame(ctx, i / total, assets);
    if (manual) track.requestFrame();
    onProgress?.(i / total);
  }

  // Даём записи забрать последний кадр: остановка в тот же миг иногда обрезает
  // хвост перехода.
  await waitUntil(performance.now() + FRAME_MS * 3);
  recorder.stop();
  recStream.getTracks().forEach((t) => t.stop());

  return done;
}
