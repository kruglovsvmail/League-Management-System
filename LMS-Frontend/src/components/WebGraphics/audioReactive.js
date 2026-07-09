// src/components/WebGraphics/audioReactive.js
// Аудио-реактивная графика: анализирует интро-музыку через AnalyserNode и пишет
// три CSS-переменные на <html>:
//   --audio-level : 0..1 — сглаженная энергия баса ("дыхание" подсветок/фона)
//   --audio-beat  : 0..1 — вспышка НА ДОЛЕ ТАКТА, экспоненциально затухает (пульс логотипов)
//   --audio-pulse : 0..1 — "качание": отклонение баса от своего среднего (движение в темп
//                   даже там, где чётких ударов нет)
//
// Как определяется такт (beat tracking, а не детектор пиков громкости):
//   1. Онсеты — по spectral flux в ТРЁХ полосах: низкой (бочка), средней (вокал/гитары/
//      синты) и высокой (малый барабан/хай-хэт/крэк). Флаг онсета — резкий ПРИРОСТ
//      энергии в полосе за кадр; тянущаяся нота прироста не даёт.
//   2. Темп/метроном (--audio-beat, --audio-pulse) считается ТОЛЬКО по низкой и высокой
//      полосам — средняя слишком шумная (вокал) для устойчивой сетки:
//      - гистограмма интервалов между онсетами за последние ~6 секунд (свёрнутых
//        октавами в диапазон 60–200 BPM) даёт период доли;
//      - пульс идёт по предсказанной сетке (как метроном) с опережением (компенсация
//        задержки анализа/рендера/звукового тракта, см. BEAT_LEAD_MS), онсеты лишь
//        подправляют фазу — поэтому пульс ровный и не частит на сбивках.
//      Пока сетка не набрала уверенность (первые секунды трека) — бьём по онсетам напрямую.
//   3. Отдельно от метронома — onBandOnset(cb): подписка на КАЖДЫЙ дискретный удар
//      каждой из трёх полос (использует RippleField.jsx для спавна волн ряби).
//
// Компоненты графики читают переменные напрямую в inline-стилях (calc(...)) — ноль
// React-ререндеров на 60fps. Когда интро не играет, переменные равны 0, эффекты
// невидимы, а цикл спит на редком setTimeout вместо requestAnimationFrame.

let rafId = null;
let idleTimerId = null;
let analyserNode = null;
let isActiveFn = null;
let freqData = null;

// ── Уровень / качание ────────────────────────────────────────────────────────
let smoothedLevel = 0;   // EMA нормализованной энергии — быстрый подъём, медленный спад
let pulse = 0;           // "качание" — сглаженное отклонение баса от бегущего среднего

// Автоусиление (AGC): у каждого трека своя громкость и компрессия, а fade-in интро ещё и
// плавно меняет её. Абсолютные пороги из-за этого мертвы. Держим плавающий конверт
// min/max энергии и нормализуем текущее значение внутри него.
let envLow = 0;
let envHigh = 0.01;
let normAvg = 0;         // бегущее среднее нормализованной энергии

// ── Бит ──────────────────────────────────────────────────────────────────────
let beat = 0;            // 1 на доле, затухает (~220мс до половины)

// Онсеты (spectral flux), низкая полоса (бочка)
let prevBass = null;     // басовые бины прошлого кадра
let fluxAvgBass = 0;     // бегущее среднее flux — адаптивный порог онсета
let lastBassOnsetAt = 0; // per-band debounce — для событий ряби (onBandOnset), независим от общего lastOnsetAt
// Онсеты, средняя полоса (вокал/гитары/синты) — самая шумная, порог выше
let prevMid = null;
let fluxAvgMid = 0;
let lastMidOnsetAt = 0;
// Онсеты, высокая полоса (малый барабан/хай-хэт/крэк) — независимый третий триггер
let prevHigh = null;
let fluxAvgHigh = 0;
let lastHighOnsetAt = 0;

let lastOnsetAt = 0;
let onsets = [];         // таймстампы онсетов за последние TEMPO_WINDOW_MS (bass+high — see ниже)

// Границы полос в бинах FFT — считаются в startAudioReactive() из реального sampleRate
// (у разных устройств/браузеров AudioContext может идти на 44.1 или 48кГц).
let bassBinFrom = 1, bassBinTo = 6;
let midBinFrom = 7, midBinTo = 46;
let highBinFrom = 47, highBinTo = 116;

// Подписчики на дискретные онсеты по полосам (для спавна ряби — см. RippleField.jsx).
// Отдельно от сетки темпа: ряби нужен КАЖДЫЙ удар каждой полосы, а не только те,
// что подтверждают общий метроном.
const bandOnsetListeners = [];
export function onBandOnset(cb) {
  bandOnsetListeners.push(cb);
  return () => {
    const i = bandOnsetListeners.indexOf(cb);
    if (i !== -1) bandOnsetListeners.splice(i, 1);
  };
}
function emitBandOnset(band, strength) {
  for (const cb of bandOnsetListeners) cb(band, strength);
}

// Сетка темпа
let period = 0;          // период доли, мс (0 = темп ещё не оценён)
let periodCandidate = 0; // кандидат: применяем только при двух согласных оценках подряд
let nextBeat = 0;        // предсказанное время следующей доли
let gridConfidence = 0;  // 0..1 — сколько онсетов подтверждает сетку
let lastTempoCalcAt = 0;

const BASS_HZ_FROM = 40, BASS_HZ_TO = 260;    // зона бочки/баса
const MID_HZ_FROM = 260, MID_HZ_TO = 2000;    // зона вокала/гитар/синтов — самая шумная
const HIGH_HZ_FROM = 2000, HIGH_HZ_TO = 5000; // зона малого барабана/хай-хэта/крэка
const ONSET_MIN_GAP_MS = 120;   // защита от двойного срабатывания на одном ударе
const TEMPO_WINDOW_MS = 6000;   // окно истории онсетов для оценки темпа
const TEMPO_RECALC_MS = 500;    // как часто пересчитывать темп
const PERIOD_MIN = 300;         // 200 BPM
const PERIOD_MAX = 1000;        // 60 BPM
const BEAT_LEAD_MS = 100;       // опережение сетки: FFT-окно (~23мс) + сглаживание анализатора
                                // + кадр рендера (~17мс) + вывод звука Windows (~30-50мс).
                                // Пульс должен НАЧАТЬСЯ чуть раньше слышимого удара —
                                // пик масштаба тогда попадает точно в удар.
const CONFIDENCE_ON = 0.3;      // порог уверенности, с которого пульс идёт по сетке

function writeVars() {
  const s = document.documentElement.style;
  s.setProperty('--audio-level', smoothedLevel.toFixed(3));
  s.setProperty('--audio-beat', beat.toFixed(3));
  s.setProperty('--audio-pulse', pulse.toFixed(3));
}

function resetVars() {
  smoothedLevel = 0;
  beat = 0;
  pulse = 0;
  envLow = 0;
  envHigh = 0.01;
  normAvg = 0;
  prevBass = null;
  fluxAvgBass = 0;
  lastBassOnsetAt = 0;
  prevMid = null;
  fluxAvgMid = 0;
  lastMidOnsetAt = 0;
  prevHigh = null;
  fluxAvgHigh = 0;
  lastHighOnsetAt = 0;
  lastOnsetAt = 0;
  onsets = [];
  period = 0;
  periodCandidate = 0;
  nextBeat = 0;
  gridConfidence = 0;
  lastTempoCalcAt = 0;
  writeVars();
}

// Оценка темпа: гистограмма интервалов между онсетами. Интервалы вне 60–200 BPM
// сворачиваются октавами (восьмые → четверти, целые → половины) — доминирующий
// кластер и есть период доли.
function estimateTempo(now) {
  lastTempoCalcAt = now;
  if (onsets.length < 4) return;

  const BIN_MS = 20;
  const hist = new Map();
  const folded = [];

  for (let i = 0; i < onsets.length - 1; i++) {
    for (let j = i + 1; j < onsets.length; j++) {
      let dt = onsets[j] - onsets[i];
      while (dt > PERIOD_MAX) dt /= 2;
      while (dt < PERIOD_MIN) dt *= 2;
      if (dt > PERIOD_MAX) continue;
      folded.push(dt);
      const bin = Math.round(dt / BIN_MS);
      hist.set(bin, (hist.get(bin) || 0) + 1);
      hist.set(bin - 1, (hist.get(bin - 1) || 0) + 0.5);
      hist.set(bin + 1, (hist.get(bin + 1) || 0) + 0.5);
    }
  }

  let bestBin = 0, bestW = 0;
  for (const [bin, w] of hist) {
    if (w > bestW) { bestW = w; bestBin = bin; }
  }
  if (!bestBin) return;

  // Коррекция гармоник: интервалы «через удар» (2T, 4T...) в сумме часто перевешивают T,
  // и пик гистограммы садится на ПОЛОВИННЫЙ темп (128 BPM детектится как 64). Если на
  // половине пикового периода тоже есть солидная поддержка — истинная доля вдвое быстрее.
  let center = bestBin * BIN_MS;
  while (center / 2 >= PERIOD_MIN) {
    const halfBin = Math.round(center / 2 / BIN_MS);
    const halfW = (hist.get(halfBin) || 0) + (hist.get(halfBin - 1) || 0) + (hist.get(halfBin + 1) || 0);
    if (halfW >= bestW * 0.4) center = halfBin * BIN_MS;
    else break;
  }
  let sum = 0, n = 0;
  for (const dt of folded) {
    if (Math.abs(dt - center) <= BIN_MS * 1.5) { sum += dt; n++; }
  }
  if (!n) return;

  const newPeriod = sum / n;

  // Фильтр выбросов: применяем темп только при двух согласных оценках подряд.
  // Одиночная кривая оценка (густая сбивка попала в окно) не дёргает сетку —
  // через полсекунды придёт нормальная и кандидат сам заменится.
  if (periodCandidate && Math.abs(newPeriod - periodCandidate) < periodCandidate * 0.05) {
    // Резкая смена темпа (другая часть трека) — сбрасываем уверенность, сетка настроится заново.
    if (period && Math.abs(newPeriod - period) > period * 0.08) gridConfidence *= 0.5;
    period = newPeriod;
    if (!nextBeat) nextBeat = onsets[onsets.length - 1] + period;
  }
  periodCandidate = newPeriod;
}

function tick() {
  rafId = null;

  if (!analyserNode || !isActiveFn?.()) {
    // Интро выключили: плавно доводим эффекты до нуля, затем спим на редком поллинге.
    if (smoothedLevel > 0.005 || beat > 0.005 || pulse > 0.005) {
      smoothedLevel *= 0.9;
      beat *= 0.85;
      pulse *= 0.85;
      writeVars();
      rafId = requestAnimationFrame(tick);
    } else {
      resetVars();
      idleTimerId = setTimeout(() => { idleTimerId = null; tick(); }, 250);
    }
    return;
  }

  analyserNode.getByteFrequencyData(freqData);
  const now = performance.now();
  const nBass = bassBinTo - bassBinFrom + 1;
  const nMid = midBinTo - midBinFrom + 1;
  const nHigh = highBinTo - highBinFrom + 1;

  // ── Энергия и flux по низкой полосе (бочка) — от неё же идут --audio-level/--audio-pulse ──
  let sum = 0;
  let fluxBass = 0;
  for (let i = bassBinFrom; i <= bassBinTo; i++) {
    sum += freqData[i];
    if (prevBass) fluxBass += Math.max(0, freqData[i] - prevBass[i - bassBinFrom]);
  }
  const energy = sum / (nBass * 255); // 0..1
  fluxBass /= (nBass * 255);          // 0..1, только ПРИРОСТ энергии
  if (!prevBass) prevBass = new Uint8Array(nBass);
  for (let i = bassBinFrom; i <= bassBinTo; i++) prevBass[i - bassBinFrom] = freqData[i];

  // ── Flux по средней полосе (вокал/гитары/синты) — только для ряби, в общий метроном не идёт ──
  let fluxMid = 0;
  for (let i = midBinFrom; i <= midBinTo; i++) {
    if (prevMid) fluxMid += Math.max(0, freqData[i] - prevMid[i - midBinFrom]);
  }
  fluxMid /= (nMid * 255);
  if (!prevMid) prevMid = new Uint8Array(nMid);
  for (let i = midBinFrom; i <= midBinTo; i++) prevMid[i - midBinFrom] = freqData[i];

  // ── Flux по высокой полосе (малый/хай-хэт) — второй, независимый триггер онсета ──
  let fluxHigh = 0;
  for (let i = highBinFrom; i <= highBinTo; i++) {
    if (prevHigh) fluxHigh += Math.max(0, freqData[i] - prevHigh[i - highBinFrom]);
  }
  fluxHigh /= (nHigh * 255);
  if (!prevHigh) prevHigh = new Uint8Array(nHigh);
  for (let i = highBinFrom; i <= highBinTo; i++) prevHigh[i - highBinFrom] = freqData[i];

  // ── AGC + уровень + качание (только по басу — это "дыхание", остальные полосы сюда не идут) ──
  if (energy > envHigh) envHigh += (energy - envHigh) * 0.3;
  else envHigh += (energy - envHigh) * 0.002;
  if (energy < envLow) envLow += (energy - envLow) * 0.3;
  else envLow += (energy - envLow) * 0.002;

  const span = Math.max(envHigh - envLow, 0.04);
  const norm = Math.min(1, Math.max(0, (energy - envLow) / span));

  smoothedLevel = norm > smoothedLevel
    ? smoothedLevel + (norm - smoothedLevel) * 0.35
    : smoothedLevel + (norm - smoothedLevel) * 0.08;

  normAvg += (norm - normAvg) * 0.04;
  const swayRaw = Math.min(1, Math.max(0, (norm - normAvg) * 2.5));
  pulse = swayRaw > pulse
    ? pulse + (swayRaw - pulse) * 0.5
    : pulse + (swayRaw - pulse) * 0.15;

  // ── Онсеты по трём полосам: flux заметно выше своего среднего ──
  // Низкая полоса менее избирательна (порог выше): суб-бас/бочка на многих треках
  // «гудит» почти непрерывно, и слабый порог даёт слишком много ложных срабатываний —
  // реакция шла преимущественно от баса и забивала более чёткие удары в высокой полосе.
  // Средняя (вокал/гитары) — самая шумная, порог ещё выше, только для ряби.
  fluxAvgBass += (fluxBass - fluxAvgBass) * 0.05;
  fluxAvgMid += (fluxMid - fluxAvgMid) * 0.05;
  fluxAvgHigh += (fluxHigh - fluxAvgHigh) * 0.05;
  const bassHit = fluxBass > fluxAvgBass * 2.6 + 0.03;
  const midHit = fluxMid > fluxAvgMid * 3.2 + 0.03;
  const highHit = fluxHigh > fluxAvgHigh * 1.8 + 0.015;

  // Дискретные события для ряби (RippleField) — свой debounce на полосу, независимо
  // от общей сетки темпа: каждой полосе нужен КАЖДЫЙ её удар, а не только те, что
  // подтверждают метроном.
  if (bassHit && now - lastBassOnsetAt > ONSET_MIN_GAP_MS) {
    lastBassOnsetAt = now;
    emitBandOnset('bass', Math.min(1, fluxBass / (fluxAvgBass * 2.6 + 0.06)));
  }
  if (midHit && now - lastMidOnsetAt > ONSET_MIN_GAP_MS) {
    lastMidOnsetAt = now;
    emitBandOnset('mid', Math.min(1, fluxMid / (fluxAvgMid * 3.2 + 0.06)));
  }
  if (highHit && now - lastHighOnsetAt > ONSET_MIN_GAP_MS) {
    lastHighOnsetAt = now;
    emitBandOnset('high', Math.min(1, fluxHigh / (fluxAvgHigh * 1.8 + 0.03)));
  }

  // Сетка темпа/метроном — как и раньше, только bass+high (mid слишком шумная для этого).
  const isOnset = (bassHit || highHit) && now - lastOnsetAt > ONSET_MIN_GAP_MS;
  if (isOnset) {
    lastOnsetAt = now;
    onsets.push(now);
    while (onsets.length && onsets[0] < now - TEMPO_WINDOW_MS) onsets.shift();

    // Подстройка фазы сетки: онсет возле предсказанной доли подтверждает сетку
    // и мягко сдвигает её; онсет мимо сетки понижает уверенность.
    if (period) {
      const k = Math.round((now - nextBeat) / period);
      const predicted = nextBeat + k * period;
      const err = now - predicted;
      if (Math.abs(err) < period * 0.25) {
        // Пока сетка не уверена — цепляемся за онсеты сильнее (быстрый захват фазы);
        // когда уверена — мягче (одиночный смещённый удар не расшатывает метроном).
        nextBeat += err * (gridConfidence < 0.5 ? 0.5 : 0.2);
        gridConfidence = Math.min(1, gridConfidence + 0.15);
      } else {
        gridConfidence = Math.max(0, gridConfidence - 0.08);
      }
    }
  }

  // ── Пересчёт темпа ──
  if (now - lastTempoCalcAt > TEMPO_RECALC_MS) estimateTempo(now);

  // ── Пульс ──
  beat *= 0.95; // затухание ~220мс до половины — видно глазом
  if (beat < 0.005) beat = 0;

  gridConfidence = Math.max(0, gridConfidence - 0.002); // без подтверждений сетка гаснет за ~8с

  if (period && gridConfidence > CONFIDENCE_ON) {
    // Сетка уверенная: бьём по предсказанию, с опережением. В тишине (пауза, брейк)
    // пульс не глушим — ровный метроном и есть ощущение такта.
    if (now >= nextBeat - BEAT_LEAD_MS && smoothedLevel > 0.05) {
      beat = 1;
      nextBeat += period;
      while (nextBeat < now) nextBeat += period; // догоняем после заморозки вкладки
    }
  } else if (isOnset) {
    // Сетки ещё нет — бьём по онсетам напрямую. Порог громкости не завязан только
    // на бас: высокая полоса (крэк/хай-хэт) может дать чёткий онсет и при тихом басе.
    beat = 1;
  }

  writeVars();
  rafId = requestAnimationFrame(tick);
}

// analyser — уже подключённый к источнику AnalyserNode; isActive() — играет ли сейчас интро.
export function startAudioReactive(analyser, isActive) {
  stopAudioReactive();
  analyserNode = analyser;
  isActiveFn = isActive;
  freqData = new Uint8Array(analyser.frequencyBinCount);

  // Границы полос — из реального sampleRate (AudioContext у разных браузеров/устройств
  // может идти на 44.1 или 48кГц), а не захардкожены под один конкретный вариант.
  const hzPerBin = analyser.context.sampleRate / analyser.fftSize;
  const maxBin = analyser.frequencyBinCount - 1;
  bassBinFrom = Math.max(1, Math.round(BASS_HZ_FROM / hzPerBin));
  bassBinTo = Math.min(maxBin, Math.round(BASS_HZ_TO / hzPerBin));
  midBinFrom = Math.max(1, Math.round(MID_HZ_FROM / hzPerBin));
  midBinTo = Math.min(maxBin, Math.round(MID_HZ_TO / hzPerBin));
  highBinFrom = Math.max(1, Math.round(HIGH_HZ_FROM / hzPerBin));
  highBinTo = Math.min(maxBin, Math.round(HIGH_HZ_TO / hzPerBin));

  tick();
}

export function stopAudioReactive() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (idleTimerId) { clearTimeout(idleTimerId); idleTimerId = null; }
  analyserNode = null;
  isActiveFn = null;
  resetVars();
}

// Диагностика из консоли OBS/браузера: window.__audioReactiveState()
if (typeof window !== 'undefined') {
  window.__audioReactiveState = () => ({
    hasAnalyser: !!analyserNode,
    active: !!isActiveFn?.(),
    rafRunning: rafId != null,
    idlePolling: idleTimerId != null,
    smoothedLevel, beat, pulse, envLow, envHigh, normAvg,
    bpm: period ? Math.round(60000 / period) : 0,
    gridConfidence: +gridConfidence.toFixed(2),
    onsetsInWindow: onsets.length,
    fluxAvgBass: +fluxAvgBass.toFixed(4),
    fluxAvgMid: +fluxAvgMid.toFixed(4),
    fluxAvgHigh: +fluxAvgHigh.toFixed(4),
    bassBins: [bassBinFrom, bassBinTo],
    midBins: [midBinFrom, midBinTo],
    highBins: [highBinFrom, highBinTo],
    listenerCount: bandOnsetListeners.length,
    rawEnergy: (() => {
      if (!analyserNode || !freqData) return null;
      analyserNode.getByteFrequencyData(freqData);
      let sum = 0;
      for (let i = bassBinFrom; i <= bassBinTo; i++) sum += freqData[i];
      return sum / (bassBinTo - bassBinFrom + 1) / 255;
    })(),
  });
}
