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
// кадрам метки по стенным часам, ускорить его нельзя. Переход длится 2,6
// секунды — столько же занимает и сборка.
//
// ПОЧЕМУ КАДРЫ ОТДАЮТСЯ ВРУЧНУЮ. `captureStream(FPS)` снимает холст сам, «как
// получится»: браузер решает, когда заглянуть в canvas, и попадает то между
// двумя отрисовками, то дважды в одну. В файле это выходит неровным шагом —
// ролик дёргается даже в обычном плеере. Поэтому поток создаётся с частотой 0
// («кадры по запросу»), а мы рисуем и отдаём ровно 30 кадров в секунду по
// заранее посчитанному расписанию.
//
// ШКАЛА ФАЙЛА. Нулевая миллисекунда файла — это ПЕРВЫЙ кадр, который получил
// рекордер. Не момент rec.start() и не событие onstart. Оверлей и Stinger в OBS
// отсчитывают COVER_MS и SWEEP_MS именно от нуля файла, поэтому первый кадр
// обязан быть нулевым кадром рисунка, а все следующие — идти от него по
// расписанию без пропусков. Раньше первым кадром шла пустая «затравка», а
// отсчёт анимации начинался после onstart — и он приходил когда угодно, от
// 150 до 730 мс. На столько же в эфире ролик оказывался раньше шторок: он
// впускался на отметке 1120 мс файла, а шторки в файле смыкались лишь на
// 1350-й. Теперь анимация начинается с самого первого кадра, а готовый файл
// сверяется по меткам кадров — сдвинутая или оборванная шкала в S3 не уходит.

const FPS = 30;
const FRAME_MS = 1000 / FPS;
// Хвост из последних (пустых) кадров после конца перехода: оверлей снимает
// переход, когда дорожка ДОШЛА до SWEEP_MS, и файлу нужен небольшой запас
// после этой отметки, чтобы отметка наступила раньше, чем сам конец файла.
const TAIL_FRAMES = 3;
const MIME = 'video/webm;codecs=vp8';
// Тот же VP8 плюс звуковая дорожка. Альфа живёт в видеопотоке и от появления
// звука не страдает, но поддержку всё равно проверяем отдельно: не соберётся
// со звуком — соберём немой, это лучше, чем отказ кнопки.
const MIME_AUDIO = 'video/webm;codecs=vp8,opus';

// Допуски проверки собранного файла, мс.
const DRIFT_TOL_MS = 80;   // расхождение конца файла с нашим расписанием
const GAP_TOL_MS = 250;    // дыра между соседними кадрами — заметный рывок в эфире

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

/**
 * Звук удара — синтезируется, а не берётся файлом: лишний ассет пришлось бы
 * класть в сборку и следить за его правами, а нужен один короткий удар.
 *
 * Складывается из трёх слоёв, как настоящий силовой приём у борта:
 *   тело     — синус, падающий со 150 до 42 Гц: низкий «бум» в груди;
 *   треск    — короткий шум через полосовой фильтр: щелчок самого столкновения;
 *   отзвук   — приглушённый шумовой хвост: отражение от коробки.
 *
 * @param {AudioContext} ac
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

const loadImage = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

/**
 * Тикер для ожидания момента по стенным часам.
 *
 * Тикает ВОРКЕР, а не requestAnimationFrame и не setTimeout страницы. Сборка
 * идёт в реальном времени и обязана отдавать кадр каждые 33 мс, даже если
 * режиссёр в это время переключился на OBS: в скрытой вкладке rAF
 * останавливается вовсе, таймеры страницы урезаются до одного в секунду, а
 * таймеры воркера скрытая вкладка не трогает. На rAF так однажды ушёл в S3
 * «переход» из трёх кадров длиной девятнадцать секунд.
 *
 * Шаг тика 4 мс — вдвое чаще, чем нужно даже для точного попадания в кадр.
 */
function makeTicker() {
  const subs = new Set();
  let worker = null;
  try {
    const url = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 4);'], { type: 'text/javascript' }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = () => { for (const fn of [...subs]) fn(); };
  } catch {
    worker = null;   // воркер не дали (CSP) — ниже запасной вариант на таймере страницы
  }

  const waitUntil = (time) => new Promise((resolve) => {
    if (!worker) {
      const tick = () => { if (performance.now() >= time) resolve(); else setTimeout(tick, 2); };
      tick();
      return;
    }
    const fn = () => { if (performance.now() >= time) { subs.delete(fn); resolve(); } };
    subs.add(fn);
  });

  const close = () => { subs.clear(); worker?.terminate(); };
  return { waitUntil, close };
}

// --- Проверка собранного файла по меткам кадров -----------------------------
//
// Читаем WebM ровно настолько, чтобы достать время каждого видеокадра: Info с
// масштабом времени, Tracks с номером видеодорожки, кластеры с их Timecode и
// блоки. Кадры с альфой лежат в BlockGroup (Block + BlockAdditions), без
// альфы — в SimpleBlock; берём и те и другие.

const EBML = {
  SEGMENT: 0x18538067,
  INFO: 0x1549A966,
  TIMECODE_SCALE: 0x2AD7B1,
  TRACKS: 0x1654AE6B,
  TRACK_ENTRY: 0xAE,
  TRACK_NUMBER: 0xD7,
  TRACK_TYPE: 0x83,
  CLUSTER: 0x1F43B675,
  CLUSTER_TIMECODE: 0xE7,
  BLOCK_GROUP: 0xA0,
  BLOCK: 0xA1,
  SIMPLE_BLOCK: 0xA3,
};

/**
 * Метки видеокадров файла, мс от начала, в порядке записи.
 * @param {ArrayBuffer} bytes
 * @returns {number[]}
 */
function readFrameTimes(bytes) {
  const b = new Uint8Array(bytes);
  let p = 0;

  // EBML-число переменной длины. У идентификаторов маркерный бит остаётся в
  // значении, у размеров — снимается; размер из одних единиц значит «неизвестен».
  const vint = (isId) => {
    const first = b[p];
    if (!first) throw new Error('битый заголовок элемента');
    let len = 1;
    while (len < 8 && !(first & (0x80 >> (len - 1)))) len += 1;
    let v = isId ? first : (first & (0xFF >> len));
    let allOnes = !isId && v === (0xFF >> len);
    for (let i = 1; i < len; i += 1) {
      v = v * 256 + b[p + i];
      if (b[p + i] !== 0xFF) allOnes = false;
    }
    p += len;
    return { v, unknown: allOnes };
  };
  const uint = (from, to) => { let v = 0; for (let i = from; i < to; i += 1) v = v * 256 + b[i]; return v; };

  let scale = 1_000_000;   // нс на единицу Timecode; по умолчанию — миллисекунда
  let clusterTc = 0;
  let videoTrack = null;
  let entry = null;
  const times = [];

  const walk = (end) => {
    while (p < end) {
      const id = vint(true).v;
      const size = vint(false);
      const start = p;
      const stop = size.unknown ? end : Math.min(end, start + size.v);
      switch (id) {
        case EBML.SEGMENT:
        case EBML.INFO:
        case EBML.TRACKS:
        case EBML.BLOCK_GROUP:
          walk(stop);
          break;
        case EBML.CLUSTER:
          clusterTc = 0;
          walk(stop);
          break;
        case EBML.TRACK_ENTRY:
          entry = {};
          walk(stop);
          if (entry.type === 1 && videoTrack === null) videoTrack = entry.number;
          entry = null;
          break;
        case EBML.TRACK_NUMBER: if (entry) entry.number = uint(start, stop); break;
        case EBML.TRACK_TYPE: if (entry) entry.type = uint(start, stop); break;
        case EBML.TIMECODE_SCALE: scale = uint(start, stop); break;
        case EBML.CLUSTER_TIMECODE: clusterTc = uint(start, stop); break;
        case EBML.BLOCK:
        case EBML.SIMPLE_BLOCK: {
          const track = vint(false).v;
          const rel = ((b[p] << 8) | b[p + 1]) << 16 >> 16;   // знаковое int16
          if (videoTrack === null || track === videoTrack) times.push((clusterTc + rel) * scale / 1e6);
          break;
        }
        default:
          break;
      }
      p = stop;
    }
  };
  walk(b.length);
  return times;
}

/**
 * Сверяет метки кадров в файле с тем, как мы их отдавали. Любое расхождение —
 * это сдвиг шкалы, который оверлей не увидит, а эфир покажет: ролик вылезет
 * из-под несомкнувшихся шторок.
 *
 * @param {number[]} times  метки кадров из файла, мс
 * @param {number[]} pushed фактическое время отдачи каждого кадра от первого, мс
 * @returns {{ frames: number, last: number }}
 */
function checkTimeline(times, pushed) {
  if (!times.length) throw new Error('в файле нет ни одного кадра');

  const expectedFrames = pushed.length;
  const expectedLast = pushed[pushed.length - 1];
  const last = times[times.length - 1];

  // Конец файла раньше, чем мы отдали последний кадр, — значит, начало записи
  // потеряно: нулём файла стал не первый кадр, а какой-то из следующих.
  if (last < expectedLast - DRIFT_TOL_MS) {
    throw new Error(`первые кадры до записи не дошли, шкала файла сдвинута на ${Math.round(expectedLast - last)} мс`);
  }
  if (last > expectedLast + DRIFT_TOL_MS) {
    throw new Error(`метки кадров в файле не сходятся с расписанием (конец ${Math.round(last)} мс вместо ${Math.round(expectedLast)})`);
  }
  if (times.length < expectedFrames * 0.9) {
    throw new Error(`запись потеряла кадры: ${times.length} из ${expectedFrames}`);
  }
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] - times[i - 1] > GAP_TOL_MS) {
      throw new Error(`в записи дыра ${Math.round(times[i] - times[i - 1])} мс на ${Math.round(times[i - 1])}-й мс`);
    }
  }
  return { frames: times.length, last: Math.round(last) };
}

/**
 * Собирает WebM с альфой и отдаёт Blob.
 *
 * @param {object}   opts
 * @param {number}   opts.leagueId   какой набор графики рисовать
 * @param {object}   opts.logos      { league, division, home, away } — ОБЯЗАТЕЛЬНО
 *                                   data-URI, иначе холст «портится» и запись
 *                                   потока запрещена
 * @param {string}   opts.division   название дивизиона
 * @param {string}   opts.leagueName название лиги
 * @param {string}   opts.homeName   название команды хозяев
 * @param {string}   opts.awayName   название команды гостей
 * @param {string}   opts.title
 * @param {string}   opts.homeColor
 * @param {string}   opts.awayColor
 * @param {function} opts.onProgress прогресс 0..1
 */
export async function exportBumperWebm(opts) {
  const {
    leagueId, logos = {}, division, leagueName, homeName, awayName,
    title, homeColor, awayColor, onProgress,
  } = opts;

  const support = checkBumperExportSupport();
  if (!support.supported) throw new Error(support.reason);

  const mod = await loadFrameModule(leagueId);
  const { drawBumperFrame, SWEEP_MS, FRAME_W, FRAME_H, HIT_MS } = mod;

  // Звук ставится только там, где графика сама назвала момент удара. Нет
  // HIT_MS — у этого набора графики удара в сценарии нет, файл выйдет немым.
  const hitAt = Number.isFinite(HIT_MS) && HIT_MS >= 0 && HIT_MS < SWEEP_MS ? HIT_MS : null;
  const withAudio = hitAt !== null
    && typeof window.AudioContext === 'function'
    && !!window.MediaRecorder.isTypeSupported?.(MIME_AUDIO);

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

  const assets = {
    leagueImg, divisionImg, homeImg, awayImg,
    division, leagueName, homeName, awayName, title, homeColor, awayColor,
  };

  /**
   * Холст и поток под одну попытку записи.
   *
   * ХОЛСТ КАЖДЫЙ РАЗ НОВЫЙ, и это не расточительность. Остановленная дорожка
   * canvas-потока гасит захват у САМОГО ХОЛСТА: второй captureStream на нём
   * вернёт дорожку, по которой не придёт ни одного кадра. Первая же неудачная
   * попытка сделала бы все последующие безнадёжными — проценты бегут, файл пуст.
   *
   * Частота 0 = «кадры по запросу»: холст попадёт в поток ровно столько раз,
   * сколько мы позовём requestFrame, и шаг анимации в файле выходит ровным.
   * Если браузер такого не умеет, отдаём поток ему — выйдет менее ровно, но
   * соберётся.
   */
  const makeTarget = () => {
    const cv = document.createElement('canvas');
    cv.width = FRAME_W;
    cv.height = FRAME_H;
    const c2d = cv.getContext('2d', { alpha: true });

    // Первый кадр рисуем ДО старта записи — он прогревает кэш заготовок в
    // модуле отрисовки, чтобы дорогая подготовка не пришлась на кадр под запись.
    drawBumperFrame(c2d, 0, assets);

    const s = cv.captureStream(0);
    const t = s.getVideoTracks()[0];
    if (typeof t?.requestFrame === 'function') return { ctx: c2d, stream: s, track: t, manual: true };

    const auto = cv.captureStream(FPS);
    return { ctx: c2d, stream: auto, track: auto.getVideoTracks()[0], manual: false };
  };

  // Звуковая дорожка заводится один раз на всю сборку и добавляется в поток ДО
  // старта записи, даже если удар прозвучит только на середине: подключи её
  // позже — и звук уедет относительно картинки. До удара по ней идёт тишина.
  let audioCtx = null;
  let audioDest = null;
  if (withAudio) {
    try {
      audioCtx = new AudioContext();

      // Контекст, созданный без активного жеста, остаётся suspended, а его
      // resume() в Chromium ПРОСТО НЕ РАЗРЕШАЕТСЯ — промис висит до следующего
      // клика. К этому моменту от нажатия кнопки нас отделяют запрос эмблем,
      // загрузка модуля и ожидание шрифтов, так что жест вполне мог протухнуть.
      // Голый await здесь вешал бы всю сборку намертво: кнопка горит «Сборка 0 %»
      // и не двигается. Поэтому — гонка с таймаутом и проверка состояния.
      if (audioCtx.state === 'suspended') {
        await Promise.race([
          audioCtx.resume().catch(() => {}),
          new Promise((r) => setTimeout(r, 400)),
        ]);
      }
      if (audioCtx.state !== 'running') throw new Error('AudioContext не запустился');

      audioDest = audioCtx.createMediaStreamDestination();

      // ДЕРЖАТЕЛЬ ДОРОЖКИ. Пока к destination ничего не подключено, узел не
      // рендерит НИ ОДНОГО сэмпла, и дорожка молчит не тишиной, а отсутствием
      // данных. MediaRecorder ждёт первый сэмпл по каждой дорожке и без него
      // не поднимается вовсе — onstart не приходит никогда. Постоянный источник
      // с нулевым усилением заставляет граф считать непрерывно; в файл при этом
      // идёт ровно тишина, пока не отработает scheduleImpact.
      const keepAlive = audioCtx.createConstantSource();
      const mute = audioCtx.createGain();
      mute.gain.value = 0;
      keepAlive.connect(mute).connect(audioDest);
      keepAlive.start();
    } catch {
      // Не вышло — собираем немой файл. Звук тут приятная добавка, а не условие.
      try { audioCtx?.close?.(); } catch { /* уже закрыт */ }
      audioCtx = null;
      audioDest = null;
    }
  }

  const ticker = makeTicker();
  const total = Math.max(1, Math.round(SWEEP_MS / FRAME_MS));

  /**
   * Одна попытка: новый холст, новый рекордер, полный проход анимации, проверка.
   *
   * Кадры идут в запись С ПЕРВОГО ЖЕ, сразу за rec.start(), и от него же
   * отсчитывается расписание всех остальных. Ждать onstart перед анимацией
   * нельзя — именно это ожидание и сдвигало шкалу файла. Рекордер записывает и
   * те кадры, что пришли до onstart (проверено по файлам из S3), а если
   * какая-то сборка их всё же потеряет — это поймает проверка меток внизу.
   *
   * onstart при этом всё равно ждём, только параллельно: рекордер, который так
   * и не поднялся (например, из-за звуковой дорожки), не даст файла, и попытку
   * надо прервать, а не крутить проценты впустую.
   */
  const attempt = async (mimeType, audio) => {
    const { ctx, stream, track, manual } = makeTarget();
    if (audio) audio.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    // Своя корзина на каждую попытку: остановленный рекордер может отдать кусок
    // уже после отказа, и общая корзина утащила бы обрывок неудавшейся записи
    // в итоговый файл.
    const bin = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) bin.push(e.data); };
    const stopped = new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(bin, { type: 'video/webm' }));
    });

    let t0 = 0;
    let failure = null;
    const started = new Promise((resolve, reject) => {
      const fail = (err) => { err.recorderFailed = true; reject(err); };
      const guard = setTimeout(() => fail(new Error(`запись не стартовала (${mimeType})`)), 3000);
      rec.onstart = () => { clearTimeout(guard); resolve(Math.round(performance.now() - t0)); };
      rec.onerror = (e) => { clearTimeout(guard); fail(e.error || new Error('сбой записи')); };
    });
    started.catch((e) => { failure = e; });

    // Фактическое время отдачи каждого кадра от первого — с ним потом сверяются
    // метки в файле. Прогресс берём от номера кадра, а не от часов: шаг анимации
    // внутри файла ровный, даже если один кадр случайно нарисовался дольше.
    const pushed = [];
    const push = (i) => {
      drawBumperFrame(ctx, Math.min(1, i / total), assets);
      if (manual) track.requestFrame();
      pushed.push(performance.now() - t0);
    };

    try {
      rec.start();
      t0 = performance.now();
      push(0);
      // Обе шкалы — стенные часы, поэтому удар ставится по времени AudioContext,
      // снятому в тот же миг, что и нулевой кадр.
      if (audio) {
        try { scheduleImpact(audioCtx, audio, audioCtx.currentTime + hitAt / 1000); } catch { /* картинка важнее */ }
      }

      for (let i = 1; i <= total + TAIL_FRAMES; i += 1) {
        await ticker.waitUntil(t0 + i * FRAME_MS);
        if (failure) throw failure;
        push(i);
        onProgress?.(Math.min(1, i / total));
      }

      const onstartAfter = await started;
      // Даём записи забрать последний кадр: остановка в тот же миг иногда
      // обрезает хвост.
      await ticker.waitUntil(performance.now() + FRAME_MS * 3);
      rec.stop();
      const blob = await stopped;

      // Пустой файл наверх не отдаём. Так выглядел бы «проценты пробежали, а
      // перехода нет»: запись поднялась, но кадры до неё не дошли — молча залить
      // такое в S3 хуже, чем сказать об этом вслух.
      if (!blob || blob.size < 1024) throw new Error('запись вернула пустой файл — кадры до неё не дошли');

      const stats = checkTimeline(readFrameTimes(await blob.arrayBuffer()), pushed);
      console.info('[Переход] файл собран', { кодек: mimeType, кадров: stats.frames, конец_мс: stats.last, onstart_через_мс: onstartAfter, размер: blob.size });
      return blob;
    } finally {
      try { if (rec.state !== 'inactive') rec.stop(); } catch { /* и не начинал */ }
      // Останавливаем только дорожку холста: она одноразовая, как и сам холст.
      // Звуковая дорожка общая на все попытки и закрывается вместе с контекстом.
      stream.getVideoTracks().forEach((t) => t.stop());
    }
  };

  // Порядок попыток. Со звуком пробуем два кодека: сначала явный vp8+opus, потом
  // дать выбрать браузеру — в некоторых сборках явная связка отвергается, а та
  // же самая, выбранная самим браузером, поднимается. Не взлетело ни то, ни
  // другое — собираем немой: переход важнее удара.
  //
  // Не поднявшийся рекордер сразу отправляет к следующему кодеку. А вот файл,
  // не прошедший проверку меток, — это, скорее всего, случайность (машина
  // задумалась на первом кадре), и та же связка получает ещё один шанс.
  const plan = [];
  if (audioDest) {
    [MIME_AUDIO, 'video/webm']
      .filter((m) => window.MediaRecorder.isTypeSupported?.(m))
      .forEach((m) => plan.push([m, audioDest]));
  }
  plan.push([MIME, null]);

  try {
    let lastError = null;
    for (const [mimeType, audio] of plan) {
      for (let take = 1; take <= 2; take += 1) {
        try {
          return await attempt(mimeType, audio);
        } catch (e) {
          lastError = e;
          console.warn(`[Переход] попытка ${take} (${mimeType}${audio ? ', со звуком' : ''}) не удалась:`, e.message || e);
          if (e.recorderFailed) break;
        }
      }
    }
    throw lastError || new Error('переход не собрался');
  } finally {
    ticker.close();
    try { await audioCtx?.close?.(); } catch { /* уже закрыт */ }
  }
}
