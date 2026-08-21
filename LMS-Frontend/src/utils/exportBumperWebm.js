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
// Тот же VP8 плюс звуковая дорожка. Альфа живёт в видеопотоке и от появления
// звука не страдает, но поддержку всё равно проверяем отдельно: не соберётся
// со звуком — соберём немой, это лучше, чем отказ кнопки.
const MIME_AUDIO = 'video/webm;codecs=vp8,opus';

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

    // Первый кадр рисуем ДО старта записи — заодно он прогревает кэш заготовок
    // в модуле отрисовки, чтобы дорогая подготовка не пришлась на кадр под запись.
    drawBumperFrame(c2d, 0, assets);

    const s = cv.captureStream(0);
    const t = s.getVideoTracks()[0];
    if (typeof t?.requestFrame === 'function') return { ctx: c2d, stream: s, track: t, manual: true };

    const auto = cv.captureStream(FPS);
    return { ctx: c2d, stream: auto, track: auto.getVideoTracks()[0], manual: false };
  };

  let { ctx, stream: recStream, track, manual } = makeTarget();

  // Звуковая дорожка добавляется ДО старта записи, даже если удар прозвучит
  // только на середине: подключи её позже — и звук уедет относительно картинки.
  // До удара по ней идёт тишина, это нормально.
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

      audioDest.stream.getAudioTracks().forEach((t) => recStream.addTrack(t));
    } catch {
      // Не вышло — собираем немой файл. Звук тут приятная добавка, а не условие.
      try { audioCtx?.close?.(); } catch { /* уже закрыт */ }
      audioCtx = null;
      audioDest = null;
    }
  }

  /**
   * Запуск записи с подтверждением. Ждать onstart обязательно: начни отдавать
   * кадры раньше — первые из них записи не достанутся, и переход в файле
   * начнётся с рывка.
   *
   * Но ждать ВЕЧНО нельзя. MediaRecorder может не подняться (например, из-за
   * звуковой дорожки), и тогда onstart не придёт никогда — сборка молча зависает.
   * Поэтому ожидание ограничено и разрешается либо стартом, либо ошибкой.
   */
  const startRecorder = (stream, mimeType, prime) => new Promise((resolve, reject) => {
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    // Своя корзина на каждую попытку: остановленный рекордер может отдать кусок
    // уже после отказа, и общая корзина утащила бы обрывок неудавшейся записи
    // в итоговый файл.
    const bin = [];
    const nudges = [];
    const guard = setTimeout(() => {
      nudges.forEach(clearTimeout);
      // Рекордер, который не поднялся, обязан отпустить поток — иначе следующая
      // попытка запишется в пустоту.
      try { rec.stop(); } catch { /* и не начинал */ }
      reject(new Error(`запись не стартовала (${mimeType})`));
    }, 3000);

    rec.ondataavailable = (e) => { if (e.data && e.data.size) bin.push(e.data); };
    rec.onstart = () => { clearTimeout(guard); nudges.forEach(clearTimeout); resolve({ rec, bin }); };
    rec.onerror = (e) => { clearTimeout(guard); nudges.forEach(clearTimeout); reject(e.error || new Error('сбой записи')); };
    try {
      rec.start();
      // ЗАТРАВКА. MediaRecorder не объявляет старт, пока не получит первые данные
      // по КАЖДОЙ дорожке. Видеодорожка холста молчит, пока на холсте ничего не
      // меняется, — а меняться он начнёт только в цикле, который ждёт onstart.
      // Классический клинч, и со звуковой дорожкой он проявляется жёстче: там
      // ждать приходится по обеим. Поэтому кадр отдаём сразу и ещё дважды следом:
      // некоторым сборкам Chromium первый кадр нужен чуть позже старта.
      prime?.();
      nudges.push(setTimeout(() => prime?.(), 60), setTimeout(() => prime?.(), 200));
    } catch (e) { clearTimeout(guard); nudges.forEach(clearTimeout); reject(e); }
  });

  // Кадр в поток: перерисовка нужна авторежиму (он снимает холст по изменению),
  // requestFrame — режиму «по запросу». Зовём оба, лишним не будет ни то, ни другое.
  const prime = () => {
    drawBumperFrame(ctx, 0, assets);
    if (manual) track.requestFrame();
  };

  let recorder = null;
  let chunks = null;
  if (audioDest) {
    // Со звуком пробуем два кодека: сначала явный vp8+opus, потом — дать выбрать
    // браузеру. Второй заход не формальность: в некоторых сборках явная связка
    // отвергается, а та же самая, выбранная самим браузером, поднимается.
    const candidates = [MIME_AUDIO, 'video/webm']
      .filter((m) => window.MediaRecorder.isTypeSupported?.(m));

    for (const mime of candidates) {
      try {
        ({ rec: recorder, bin: chunks } = await startRecorder(recStream, mime, prime));
        break;
      } catch (e) {
        console.warn(`[Переход] со звуком не пошло (${mime}):`, e.message || e);
      }
    }
  }

  if (!recorder) {
    if (audioDest) {
      // Звук не взлетел ни в одном виде. Переход важнее удара: немой файл
      // рабочий, отсутствие файла — нет.
      console.warn('[Переход] собираем без звука');
      recStream.getTracks().forEach((t) => t.stop());
      try { await audioCtx?.close?.(); } catch { /* уже закрыт */ }
      audioCtx = null;
      audioDest = null;
      // Новый холст обязателен: остановленная дорожка гасит захват насовсем.
      ({ ctx, stream: recStream, track, manual } = makeTarget());
    }
    ({ rec: recorder, bin: chunks } = await startRecorder(recStream, MIME, prime));
  }

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    recorder.onerror = (e) => reject(e.error || new Error('Сбой записи'));
  });

  // Расписание: кадр i приходится на started + i * 33,3 мс. Прогресс берём от
  // номера кадра, а не от часов, — так шаг анимации внутри файла ровный, даже
  // если один кадр случайно нарисовался дольше остальных.
  const total = Math.max(1, Math.round(SWEEP_MS / FRAME_MS));
  const started = performance.now();

  // Обе шкалы — стенные часы, поэтому удар ставится по времени AudioContext,
  // снятому в тот же миг, что и точка отсчёта кадров.
  if (audioCtx && audioDest) {
    try {
      scheduleImpact(audioCtx, audioDest, audioCtx.currentTime + hitAt / 1000);
    } catch { /* не встал звук — картинка важнее, продолжаем */ }
  }

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
  try { await audioCtx?.close?.(); } catch { /* уже закрыт */ }

  const blob = await done;

  // Пустой файл наверх не отдаём. Так выглядел бы «проценты пробежали, а
  // перехода нет»: запись поднялась, но кадры до неё не дошли — молча залить
  // такое в S3 хуже, чем сказать об этом вслух.
  if (!blob || blob.size < 1024) {
    throw new Error('запись вернула пустой файл — кадры до неё не дошли');
  }
  return blob;
}
