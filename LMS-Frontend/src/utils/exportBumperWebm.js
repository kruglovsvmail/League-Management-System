// src/utils/exportBumperWebm.js
//
// Сборка перехода заставки в WebM С ПРОЗРАЧНЫМ ФОНОМ. Файл кладётся в S3, эфир
// его проигрывает, и он же годится Stinger-переходом в OBS.
//
// СБОРКА ПОКАДРОВАЯ, НЕ В РЕАЛЬНОМ ВРЕМЕНИ (с 12.10.2026). Каждый кадр
// рисуется ровно на своей отметке времени, кодируется и только потом берётся
// следующий — сколько бы кадр ни считался. Поэтому файл одинаково ровный на
// любом компьютере, просто на слабом соберётся дольше. Раньше запись шла через
// MediaRecorder по стенным часам: компьютер не успевал — кадры терялись, и
// шкала файла уезжала. Для 3D-перехода это было бы заметно сразу.
//
// ПРОЗРАЧНОСТЬ. Кодировщик браузера (WebCodecs) альфу не кодирует: поле
// `alpha: 'keep'` Chromium не реализует ни для одного кодека. Mediabunny
// обходит это так же, как libvpx: цвет и прозрачность кодируются двумя
// отдельными потоками VP8, а прозрачность кладётся в WebM как BlockAdditional
// к каждому кадру. Это стандартный прозрачный WebM — его проигрывают и
// браузерный источник OBS, и Stinger, и <video> в оверлее.
//
// РАЗМЫТИЕ В ДВИЖЕНИИ. Модуль рисунка может попросить BLUR_SAMPLES > 1: тогда
// кадр собирается из нескольких промежуточных моментов внутри «выдержки»
// (SHUTTER — доля интервала между кадрами) и усредняется. Быстрые предметы
// смазываются, как у настоящей камеры.
//
// ШКАЛА ФАЙЛА. Нулевой кадр файла — нулевой кадр рисунка, дальше строго по
// 1/FPS. Оверлей и Stinger в OBS отсчитывают COVER_MS и SWEEP_MS от нуля
// файла, и при покадровой сборке сдвинуться этой шкале не из-за чего.

import {
  Output, BufferTarget, WebMOutputFormat, CanvasSource, AudioBufferSource, canEncodeAudio,
} from 'mediabunny';

const DEFAULT_FPS = 60;
// Хвост из последних (пустых) кадров после конца перехода: оверлей снимает
// переход, когда дорожка ДОШЛА до SWEEP_MS, и файлу нужен небольшой запас
// после этой отметки, чтобы отметка наступила раньше, чем сам конец файла.
const TAIL_MS = 100;
// VP8 с альфой, 1080p: на такой битрейт градиенты графита ещё не «ступенятся»,
// а декодер браузерного источника OBS успевает и на самых тяжёлых кадрах.
// Выше не поднимать: на 16 Мбит/с при 60 кадрах переход в эфире подтормаживал.
const VIDEO_BITRATE = 12_000_000;

// Свои модули на лигу — как и у самих плашек. Нет своего файла — берём дефолт.
const frameModules = import.meta.glob('../components/WebGraphics/*/bumperFrame.js');

/**
 * Умеет ли браузер собрать переход с прозрачностью.
 *
 * Нужен WebCodecs (VideoEncoder) — он есть в Chrome, Edge, Opera, Yandex,
 * Vivaldi, Brave. Поддержку VP8 с конкретными размерами проверяет сама сборка
 * и при отказе сообщает причину.
 *
 * @returns {{ supported: boolean, reason: string|null }}
 */
export function checkBumperExportSupport() {
  if (typeof window === 'undefined' || typeof window.VideoEncoder !== 'function') {
    return { supported: false, reason: 'Браузер не умеет кодировать видео (нужен Chrome, Edge или Яндекс Браузер)' };
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

/**
 * Звук удара — синтезируется, а не берётся файлом: лишний ассет пришлось бы
 * класть в сборку и следить за его правами, а нужен один короткий удар.
 *
 * Складывается из трёх слоёв, как настоящий силовой приём у борта:
 *   тело     — синус, падающий со 150 до 42 Гц: низкий «бум» в груди;
 *   треск    — короткий шум через полосовой фильтр: щелчок самого столкновения;
 *   отзвук   — приглушённый шумовой хвост: отражение от коробки.
 *
 * @param {BaseAudioContext} ac
 * @param {AudioNode} out
 * @param {number} at время по часам AudioContext, когда должен прийтись удар
 */
function scheduleImpact(ac, out, at) {
  // --- Тело удара ---
  const body = ac.createOscillator();
  const bodyGain = ac.createGain();
  body.type = 'sine';
  body.frequency.setValueAtTime(150, at);
  body.frequency.exponentialRampToValueAtTime(42, at + 0.26);
  bodyGain.gain.setValueAtTime(0.0001, at);
  bodyGain.gain.exponentialRampToValueAtTime(0.9, at + 0.006);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
  body.connect(bodyGain).connect(out);
  body.start(at);
  body.stop(at + 0.5);

  // --- Шумовая заготовка на треск и отзвук ---
  const noiseLen = Math.floor(ac.sampleRate * 0.6);
  const buf = ac.createBuffer(1, noiseLen, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < noiseLen; i += 1) data[i] = Math.random() * 2 - 1;

  // --- Треск ---
  const crack = ac.createBufferSource();
  const crackFilter = ac.createBiquadFilter();
  const crackGain = ac.createGain();
  crack.buffer = buf;
  crackFilter.type = 'bandpass';
  crackFilter.frequency.setValueAtTime(2200, at);
  crackFilter.Q.value = 0.8;
  crackGain.gain.setValueAtTime(0.55, at);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
  crack.connect(crackFilter).connect(crackGain).connect(out);
  crack.start(at);
  crack.stop(at + 0.2);

  // --- Отзвук ---
  const tail = ac.createBufferSource();
  const tailFilter = ac.createBiquadFilter();
  const tailGain = ac.createGain();
  tail.buffer = buf;
  tailFilter.type = 'lowpass';
  tailFilter.frequency.setValueAtTime(900, at);
  tailGain.gain.setValueAtTime(0.22, at + 0.01);
  tailGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
  tail.connect(tailFilter).connect(tailGain).connect(out);
  tail.start(at + 0.01);
  tail.stop(at + 0.6);
}

/**
 * Дорожка с ударом на отметке hitAt — считается заранее, без проигрывания.
 * @returns {Promise<AudioBuffer|null>}
 */
async function renderImpactTrack(durationMs, hitAt) {
  if (typeof window.OfflineAudioContext !== 'function') return null;
  const rate = 48000;
  const ac = new OfflineAudioContext(2, Math.ceil((durationMs / 1000) * rate), rate);
  scheduleImpact(ac, ac.destination, hitAt / 1000);
  return ac.startRendering();
}

const loadImage = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

// Отдаём управление странице: сборка длинная, а вкладка должна отрисовывать
// проценты и не считаться зависшей.
const yieldToPage = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Собирает WebM с альфой и отдаёт Blob.
 *
 * @param {object}   opts
 * @param {number}   opts.leagueId   какой набор графики рисовать
 * @param {object}   opts.logos      { league, division, home, away } — ОБЯЗАТЕЛЬНО
 *                                   data-URI, иначе холст «портится» и кадры
 *                                   из него не прочитать
 * @param {string}   opts.division   название дивизиона
 * @param {string}   opts.leagueName название лиги
 * @param {string}   opts.homeName   название команды хозяев
 * @param {string}   opts.awayName   название команды гостей
 * @param {string}   opts.title
 * @param {string}   opts.homeColor
 * @param {string}   opts.awayColor
 * @param {string}   opts.homeColor2 второй цвет хозяев (для почти чёрного первого)
 * @param {string}   opts.awayColor2 второй цвет гостей
 * @param {function} opts.loadModel  (имя) => Promise<ArrayBuffer> — 3D-модель
 *                                   для графики с 3D-переходом; панель берёт её
 *                                   через сервер
 * @param {function} opts.onProgress прогресс 0..1
 */
export async function exportBumperWebm(opts) {
  const {
    leagueId, logos = {}, division, leagueName, homeName, awayName,
    title, homeColor, awayColor, homeColor2, awayColor2, loadModel, onProgress,
  } = opts;

  const support = checkBumperExportSupport();
  if (!support.supported) throw new Error(support.reason);

  const mod = await loadFrameModule(leagueId);
  const { drawBumperFrame, SWEEP_MS, FRAME_W, FRAME_H, HIT_MS } = mod;
  const fps = mod.FPS ?? DEFAULT_FPS;
  const blurSamples = Math.max(1, Math.round(mod.BLUR_SAMPLES ?? 1));
  const shutter = Math.min(1, Math.max(0, mod.SHUTTER ?? 0.5));

  // Звук ставится только там, где графика сама назвала момент удара. Нет
  // HIT_MS — у этого набора графики удара в сценарии нет, файл выйдет немым.
  const hitAt = Number.isFinite(HIT_MS) && HIT_MS >= 0 && HIT_MS < SWEEP_MS ? HIT_MS : null;

  const [leagueImg, divisionImg, homeImg, awayImg] = await Promise.all([
    loadImage(logos.league), loadImage(logos.division),
    loadImage(logos.home), loadImage(logos.away),
  ]);

  // Шрифты должны быть готовы ДО первого кадра: canvas не ждёт загрузки шрифта
  // и молча нарисует подписи системным.
  try {
    await document.fonts?.load?.('800 14px Manrope');
    await document.fonts?.ready;
  } catch { /* нет шрифта — подписи выйдут системным, но файл соберётся */ }

  const rawAssets = {
    leagueImg, divisionImg, homeImg, awayImg,
    division, leagueName, homeName, awayName, title, homeColor, awayColor, homeColor2, awayColor2, loadModel,
  };
  const prepared = typeof mod.prepareBumperAssets === 'function';
  const assets = prepared
    ? await mod.prepareBumperAssets(rawAssets, { onProgress: value => onProgress?.(value * 0.2) })
    : rawAssets;

  try {
    // Холст кадра — его и читает кодировщик. Второй холст нужен только для
    // размытия: на нём рисуется каждый промежуточный момент перед сложением.
    const frame = document.createElement('canvas');
    frame.width = FRAME_W;
    frame.height = FRAME_H;
    const ctx = frame.getContext('2d', { alpha: true });

    let subCtx = null;
    let acc = null;
    let outImage = null;
    if (blurSamples > 1) {
      const sub = document.createElement('canvas');
      sub.width = FRAME_W;
      sub.height = FRAME_H;
      // Холст под чтение пикселей: каждый подкадр забирается в память.
      subCtx = sub.getContext('2d', { alpha: true, willReadFrequently: true });
      acc = new Float32Array(FRAME_W * FRAME_H * 4);
      outImage = ctx.createImageData(FRAME_W, FRAME_H);
    }

    const target = new BufferTarget();
    const output = new Output({ format: new WebMOutputFormat(), target });
    const video = new CanvasSource(frame, { codec: 'vp8', bitrate: VIDEO_BITRATE, alpha: 'keep' });
    output.addVideoTrack(video, { frameRate: fps });

    const durationMs = SWEEP_MS + TAIL_MS;
    let audio = null;
    let impact = null;
    if (hitAt !== null) {
      try {
        if (await canEncodeAudio('opus')) impact = await renderImpactTrack(durationMs, hitAt);
      } catch { impact = null; /* картинка важнее звука */ }
      if (impact) {
        audio = new AudioBufferSource({ codec: 'opus', bitrate: 128_000 });
        output.addAudioTrack(audio);
      }
    }

    await output.start();

    // Кадр на момент ms. Для размытия моменты берутся внутри выдержки вокруг
    // кадра и усредняются.
    //
    // Складываем В ДРОБНЫХ ЧИСЛАХ, а не наложением на холсте: холст хранит по
    // 8 бит на канал, и каждый подкадр с весом 1/N округлялся — плавный
    // градиент графита рассыпался на кольца-ступени (12.10.2026). Цвет
    // складывается умноженным на альфу, итог делится обратно на суммарную
    // альфу — иначе на краях полупрозрачного смаза темнело бы.
    const frameDur = 1000 / fps;
    const drawAt = (ms) => {
      const p = Math.min(1, Math.max(0, ms / SWEEP_MS));
      ctx.clearRect(0, 0, FRAME_W, FRAME_H);
      if (blurSamples === 1) {
        drawBumperFrame(ctx, p, assets);
        return;
      }
      acc.fill(0);
      for (let s = 0; s < blurSamples; s += 1) {
        const offset = ((s + 0.5) / blurSamples - 0.5) * shutter * frameDur;
        const ps = Math.min(1, Math.max(0, (ms + offset) / SWEEP_MS));
        subCtx.clearRect(0, 0, FRAME_W, FRAME_H);
        drawBumperFrame(subCtx, ps, assets);
        const px = subCtx.getImageData(0, 0, FRAME_W, FRAME_H).data;
        for (let i = 0; i < px.length; i += 4) {
          const a = px[i + 3];
          if (!a) continue;
          acc[i] += px[i] * a;
          acc[i + 1] += px[i + 1] * a;
          acc[i + 2] += px[i + 2] * a;
          acc[i + 3] += a;
        }
      }
      const out = outImage.data;
      for (let i = 0; i < out.length; i += 4) {
        const sumA = acc[i + 3];
        if (!sumA) { out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0; continue; }
        out[i] = acc[i] / sumA;
        out[i + 1] = acc[i + 1] / sumA;
        out[i + 2] = acc[i + 2] / sumA;
        out[i + 3] = sumA / blurSamples;
      }
      ctx.putImageData(outImage, 0, 0);
    };

    const total = Math.ceil((durationMs / 1000) * fps);
    for (let i = 0; i < total; i += 1) {
      const ms = (i * 1000) / fps;
      drawAt(ms);
      await video.add(i / fps, 1 / fps);
      onProgress?.(0.2 + 0.78 * ((i + 1) / total));
      if (i % 4 === 3) await yieldToPage();
    }
    video.close();

    if (audio && impact) {
      await audio.add(impact);
      audio.close();
    }

    await output.finalize();
    onProgress?.(1);

    const blob = new Blob([target.buffer], { type: 'video/webm' });
    console.info('[Переход] файл собран', { кадров: total, кадров_в_секунду: fps, размытие: blurSamples, размер: blob.size, звук: !!impact });
    return blob;
  } finally {
    mod.disposeBumperAssets?.(assets);
  }
}
