// src/components/WebGraphics/useWebGraphics.js
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { calculatePenaltyTimelines } from '../GameLiveDesk/GameDeskShared';
import { startAudioReactive, stopAudioReactive } from './audioReactive';
import { useBumperWarmup } from './bumperWarmup';

// Типы, которые режиссёр «нажимает» в панели и которые должны совпадать с тем, что OBS реально
// показывает. События (goal/penalty) — временные наложения, мисматч-детектор их игнорирует.
const STATIC_OVERLAY_TYPES = new Set(['prematch', 'scorebar', 'bumper', 'intermission', 'team_roster', 'team_leaders', 'arena', 'commentator', 'referees']);

export function useWebGraphics(gameId) {
  const socketRef = useRef(null);   // нужен прогреву заставок, чтобы слать отчёт в панель
  const [game, setGame] = useState(null);
  const [events, setEvents] = useState([]); 
  
  // === НОВАЯ ЛОГИКА ТАЙМЕРА (DELTA TIME) ===
  const [timerData, setTimerData] = useState({
    accumulatedSeconds: 0,
    startedAt: null,
    isRunning: false,
    serverTimeOffset: 0
  });
  const [timerSeconds, setTimerSeconds] = useState(0); 
  const [currentPeriod, setCurrentPeriod] = useState('1');
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  // ==========================================

  const [periodLength, setPeriodLength] = useState(20);
  const [otLength, setOtLength] = useState(5);
  const [soLength, setSoLength] = useState(3);
  
  const [isScoreboardVisible, setIsScoreboardVisible] = useState(true);

  const [overlay, setOverlay] = useState({
    visible: false,
    type: null,
    data: null
  });

  const overlayTimeoutRef = useRef(null);
  const transitionTimeoutRef = useRef(null);
  const overlayStateRef = useRef(overlay);
  const obsRestoredRef = useRef(false); // overlay_state применяем только при первом заходе (восстановление F5)
  const introAudioRef = useRef(null);      // отдельный канал только для интро (зацикленная подложка)
  const introIsPlayingRef = useRef(false); // флаг для audioReactive (пульсация оверлея под музыку)
  const audioRef = useRef(null);           // голосовой канал: состав + события (мьютекс между собой)
  const audioFadeIntervalRef = useRef(null);
  const currentAudioSourceRef = useRef(null); // 'roster' | 'event' | null — что сейчас в audioRef
  const audioCtxRef = useRef(null);
  const sfxCtxRef = useRef(null);
  const sfxGainRef = useRef(null);
  const sfxBuffersRef = useRef({ appearance: null, disappearance: null });
  const sfxLastPlayRef = useRef({ appearance: 0, disappearance: 0 });

  useEffect(() => {
    overlayStateRef.current = overlay;
  }, [overlay]);

  // Единый AudioContext для sfx: декодируем файлы в PCM один раз,
  // воспроизводим через BufferSource — старт всегда с нуля, обрыв невозможен.
  const getSfxCtx = () => {
    if (!sfxCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const gain = ctx.createGain();
      // Регулятора громкости в панели нет: всё звучит на своём уровне, а общий
      // уровень режиссёр держит в OBS. Узел оставлен как точка сведения графа.
      gain.gain.value = 1;
      gain.connect(ctx.destination);
      sfxCtxRef.current = ctx;
      sfxGainRef.current = gain;
    }
    return sfxCtxRef.current;
  };

  useEffect(() => {
    if (!game?.league_id) return;
    const leagueId = game.league_id;
    const base = 'https://s3.twcstorage.ru/hockeyeco-uploads/audio';

    const loadSound = async (type) => {
      const bust = `?_=${Date.now()}`;
      const leagueUrl  = `${base}/league-${leagueId}/${type}.mp3${bust}`;
      const defaultUrl = `${base}/league-default/${type}.mp3${bust}`;
      try {
        let res = await fetch(leagueUrl);
        if (!res.ok) res = await fetch(defaultUrl);
        if (!res.ok) return;
        const arrayBuffer = await res.arrayBuffer();
        const ctx = getSfxCtx();
        sfxBuffersRef.current[type] = await ctx.decodeAudioData(arrayBuffer);
      } catch {}
    };

    loadSound('appearance');
    loadSound('disappearance');
  }, [game?.league_id]);

  // Разблокировка AudioContext по первому жесту пользователя (политика автоплея браузера).
  // В OBS (CEF) автоплей обычно разрешён и так; в обычной вкладке хватит одного клика/нажатия.
  useEffect(() => {
    const unlock = () => {
      try {
        const ctx = getSfxCtx();
        if (ctx.state === 'suspended') ctx.resume();
      } catch {}
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Плавно меняет audio.volume к targetVolume за durationMs (30 шагов). Только для интро —
  // резкий старт/обрыв цикличной подложки под трансляцией звучит грубо, короткие фразы
  // (состав/событие) в этом не нуждаются. Отменяет предыдущий незавершённый фейд, если есть.
  //
  // Это НЕ регулятор громкости: цель фейда всегда 1, меняется только путь к ней.
  const INTRO_FADE_MS = 1200;
  const fadeAudioVolume = (audio, targetVolume, durationMs, onDone) => {
    if (audioFadeIntervalRef.current) {
      clearInterval(audioFadeIntervalRef.current);
      audioFadeIntervalRef.current = null;
    }
    const startVolume = audio.volume;
    const diff = targetVolume - startVolume;
    if (Math.abs(diff) < 0.001 || durationMs <= 0) {
      audio.volume = Math.min(1, Math.max(0, targetVolume));
      onDone?.();
      return;
    }
    const steps = 30;
    let step = 0;
    audioFadeIntervalRef.current = setInterval(() => {
      step++;
      audio.volume = Math.min(1, Math.max(0, startVolume + diff * (step / steps)));
      if (step >= steps) {
        clearInterval(audioFadeIntervalRef.current);
        audioFadeIntervalRef.current = null;
        audio.volume = Math.min(1, Math.max(0, targetVolume));
        onDone?.();
      }
    }, durationMs / steps);
  };

  // Единый аудио-граф для audioRef: реверб-цепочка + AnalyserNode для аудио-реактивной
  // графики (пульс логотипов/фона под интро, см. audioReactive.js). Создаётся один раз —
  // createMediaElementSource нельзя вызвать на одном <audio> дважды. Вызывается и из
  // обычного play, и из восстановления после F5 (раньше там реверб не подключался вовсе).
  const ensureAudioGraph = (audio) => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      return;
    }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaElementSource(audio);
      const convolver = ctx.createConvolver();
      const dry = ctx.createGain();
      const wet = ctx.createGain();

      dry.gain.value = 0.96;
      wet.gain.value = 0.04;

      // Generate impulse response for hall reverb
      const rate = ctx.sampleRate;
      const length = rate * 1.5;
      const impulse = ctx.createBuffer(2, length, rate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
        }
      }
      convolver.buffer = impulse;

      source.connect(dry);
      source.connect(convolver);
      convolver.connect(wet);
      dry.connect(ctx.destination);
      wet.connect(ctx.destination);

      // Параллельный отвод на анализатор (в destination не идёт — звук не меняет).
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      // 0.2 — почти без сглаживания: spectral flux (детект ударов) живёт на резких
      // межкадровых приростах, любое сглаживание размазывает транзиенты бочки и
      // добавляет задержку реакции. Шум по уровню давит EMA в audioReactive.js.
      analyser.smoothingTimeConstant = 0.2;
      // Дефолтный потолок -30дБ клиппует громкий бас в 255 — данные превращаются в константу,
      // и реакция «замирает» сразу после fade-in интро. Поднимаем потолок с запасом.
      analyser.maxDecibels = 0;
      analyser.minDecibels = -80;
      source.connect(analyser);
      startAudioReactive(analyser, () => introIsPlayingRef.current);

      audioCtxRef.current = ctx;
    } catch (e) { /* reverb/analyser not critical */ }

    // Диагностика из консоли OBS/браузера: window.__audioGraphState()
    if (typeof window !== 'undefined') {
      window.__audioGraphState = () => ({
        ctxState: audioCtxRef.current?.state,
        source: currentAudioSourceRef.current,
        audioPaused: audioRef.current?.paused,
        audioSrc: audioRef.current?.src?.slice(-60),
        audioVolume: audioRef.current?.volume,
      });
    }
  };

  const playOverlaySound = (type) => {
    const buffer = sfxBuffersRef.current[type];
    if (!buffer) return;

    // Защита от двойного срабатывания одного и того же звука (накладка → "обрыв")
    const now = Date.now();
    if (now - (sfxLastPlayRef.current[type] || 0) < 120) return;
    sfxLastPlayRef.current[type] = now;

    const ctx = getSfxCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(sfxGainRef.current);
    source.start(0);
  };

  useEffect(() => {
    const originalHtmlBg = document.documentElement.style.background;
    const originalBodyBg = document.body.style.background;
    const originalGutter = document.documentElement.style.scrollbarGutter;

    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.documentElement.style.scrollbarGutter = 'auto';

    return () => {
      document.documentElement.style.background = originalHtmlBg;
      document.body.style.background = originalBodyBg;
      document.documentElement.style.scrollbarGutter = originalGutter;
    };
  }, []);

  const loadGameData = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/games/${gameId}`);
      const data = await res.json();
      
      if (data.success) {
        setGame(data.data);
        if (data.data.period_length) setPeriodLength(data.data.period_length);
        if (data.data.ot_length) setOtLength(data.data.ot_length);
        
        if (data.data.events) {
            setEvents(data.data.events);
        }
      }
    } catch (err) { 
        console.error('Ошибка загрузки игры:', err); 
    }
  };

  useEffect(() => { loadGameData(); }, [gameId]);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL);
    socketRef.current = socket;

    // join_game шлём на первом connect и на КАЖДОМ реконнекте (сон ноутбука с панелью не
    // единственный сценарий — сам OBS тоже может на секунду моргнуть сетью). Без этого
    // socket.io переподключается САМ с новым socket.id, но сокет навсегда выпадает из
    // комнаты game_${gameId} и перестаёт получать любые события, оставаясь "подключённым" —
    // именно так интро однажды проиграло всю трансляцию, а плашка составов зависла насмерть.
    // obsRestoredRef сбрасываем в false — следующий overlay_state после (ре)коннекта это не
    // "живое" изменение от другого режиссёра, а холодное восстановление (могли пропустить
    // команды, пока были не в комнате), его нужно применить целиком, как при самом первом заходе.
    const resync = () => {
      obsRestoredRef.current = false;
      socket.emit('join_game', gameId);
      socket.emit('join_obs_overlay', gameId); // регистрирует этот оверлей — панель видит счётчик
      loadGameData(); // на случай гола/события, пропущенного за время обрыва
    };
    socket.on('connect', resync);

    // Кнопка «Обновить оверлей» в панели трансляции — ручной предохранитель на случай, если
    // реконнект по какой-то причине не сработал. Рассылается ГЛОБАЛЬНО (не по комнате) именно
    // потому, что достаёт нас, даже если мы уже тихо выпали из комнаты — тот же канал, который
    // и чинил бы эту ситуацию сам, просто по явному запросу оператора, а не по событию 'connect'.
    socket.on('force_resync_overlay', (payload) => {
      if (String(payload?.gameId) !== String(gameId)) return;
      resync();
    });

    // ЛОВИМ НОВЫЙ СОКЕТ И СЧИТАЕМ ОФСЕТ СЕРВЕРА
    socket.on('timer_state', (state) => {
        if (!state) return; 
        
        const offset = state.serverTime ? (state.serverTime - Date.now()) : 0;

        setTimerData({
          accumulatedSeconds: state.accumulatedSeconds !== undefined ? state.accumulatedSeconds : (state.seconds || 0),
          startedAt: state.startedAt || null,
          isRunning: state.isRunning || false,
          serverTimeOffset: offset
        });

        setIsTimerRunning(!!state.isRunning);
        if (state.period) setCurrentPeriod(state.period);
        if (state.periodLength !== undefined) setPeriodLength(state.periodLength);
        if (state.otLength !== undefined) setOtLength(state.otLength);
        if (state.soLength !== undefined) setSoLength(state.soLength);
    });

    // Обработчик timer_tick больше не нужен, мы его удаляем!

    socket.on('score_updated', () => loadGameData());
    socket.on('game_updated', () => loadGameData());

    socket.on('trigger_obs_overlay', (payload) => {
      try {
          if (!payload) return;
          if (String(payload.gameId) !== String(gameId)) return;

          if (payload.type === 'audio_ended') return;

          if (payload.type === 'audio') {
              if (payload.action === 'play' && payload.data?.url) {
                  const isIntro = payload.source === 'intro';

                  if (isIntro) {
                      // --- Канал интро: независимая зацикленная подложка ---
                      if (!introAudioRef.current) {
                          const a = new Audio();
                          a.crossOrigin = 'anonymous';
                          introAudioRef.current = a;
                      }
                      const intro = introAudioRef.current;
                      if (intro.src !== payload.data.url) intro.src = payload.data.url;
                      intro.loop = true;
                      intro.volume = 0;
                      introIsPlayingRef.current = true;
                      intro.play().then(() => {
                          fadeAudioVolume(intro, 1, INTRO_FADE_MS);
                          ensureAudioGraph(intro);
                      }).catch(e => console.error('Intro play error:', e));
                  } else {
                      // --- Голосовой канал: состав / события (мьютекс между собой) ---
                      if (!audioRef.current) {
                          const a = new Audio();
                          a.crossOrigin = 'anonymous';
                          audioRef.current = a;
                      }
                      const audio = audioRef.current;
                      currentAudioSourceRef.current = payload.source || null;
                      if (audio.src !== payload.data.url) audio.src = payload.data.url;
                      audio.loop = false;
                      audio.volume = 1;
                      audio.playbackRate = 1.05;
                      audio.play().catch(e => console.error('Audio play error:', e));
                      audio.onended = () => {
                          currentAudioSourceRef.current = null;
                          socket.emit('trigger_obs_overlay', { type: 'audio_ended', gameId });
                      };
                  }
              } else if (payload.action === 'pause') {
                  audioRef.current?.pause();
              } else if (payload.action === 'stop') {
                  const stopSrc = payload.source; // 'intro' | 'roster' | 'event' | undefined
                  const stopIntro = !stopSrc || stopSrc === 'intro';
                  const stopVoice = !stopSrc || stopSrc !== 'intro';
                  if (stopIntro && introAudioRef.current && !introAudioRef.current.paused) {
                      introIsPlayingRef.current = false;
                      const intro = introAudioRef.current;
                      fadeAudioVolume(intro, 0, INTRO_FADE_MS, () => {
                          intro.pause();
                          intro.currentTime = 0;
                      });
                  }
                  if (stopVoice && audioRef.current && !audioRef.current.paused) {
                      audioRef.current.pause();
                      audioRef.current.currentTime = 0;
                      currentAudioSourceRef.current = null;
                  }
              }
              return;
          }

          if (payload.type === 'scoreboard') {
              setIsScoreboardVisible(payload.action === 'show');
              return;
          }

          if (payload.action === 'hide') {
              // Если на экране сейчас уже ДРУГОЙ тип (например, событие успело перехватить слот,
              // пока эта команда шла) — она устарела, гасить чужую плашку по ней нельзя.
              const currentForHide = overlayStateRef.current;
              if (payload.type && currentForHide?.type && currentForHide.type !== payload.type) return;
              playOverlaySound('disappearance');
              setOverlay(prev => ({ ...prev, visible: false }));
              if (STATIC_OVERLAY_TYPES.has(currentForHide?.type)) socket.emit('overlay_confirmed', { gameId, type: null });
              if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
              if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
          } else {
              const currentOverlay = overlayStateRef.current;
              // Перепоказ УЖЕ показанной плашки того же типа (обновление данных: смена параметра,
              // forceUpdate, шаг автопилота той же плашки) — это не «появление», swoosh не играем.
              // А вот листание команды/категории внутри плашки идёт без trigger_obs_overlay — там звука и так нет.
              const sameTypeVisible = !!(currentOverlay && currentOverlay.visible && currentOverlay.type === payload.type);

              const showNewOverlay = (withSound) => {
                  if (withSound) playOverlaySound('appearance');
                  setOverlay({
                    visible: true,
                    type: payload.type,
                    data: payload.data || null
                  });
                  // Подтверждаем панели что именно эта плашка реально показывается в эфире.
                  // Только статические типы: события (goal/penalty) — временные наложения,
                  // они не участвуют в мисматч-детекторе (панель их в activeStaticOverlay не хранит).
                  if (STATIC_OVERLAY_TYPES.has(payload.type)) socket.emit('overlay_confirmed', { gameId, type: payload.type });
                  if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
                  if (payload.duration !== 'infinite') {
                    const ms = (typeof payload.duration === 'number' ? payload.duration : 10) * 1000;
                    overlayTimeoutRef.current = setTimeout(() => {
                      playOverlaySound('disappearance');
                      setOverlay(prev => ({ ...prev, visible: false }));
                      // События (goal/penalty) — не шлём confirmed(null): панель не теряет
                      // свой activeStaticOverlay когда временная плашка уходит с экрана.
                      // Плашка гола/штрафа не возвращает то, что была прервала (Лидеры/Составы/...),
                      // и это ОК — но если этого не сказать серверу, static_overlay в БД остаётся
                      // указывать на прежнюю плашку, и панель трансляции продолжает подсвечивать её
                      // как активную, хотя в OBS уже пусто. Только для событий: у Арены/Комментатора/
                      // Судей уже есть свой таймер в самой панели, который и так корректно снимает подсветку.
                      if (['goal', 'penalty'].includes(payload.type)) {
                        socket.emit('update_overlay_state', { gameId, staticOverlay: null });
                      }
                    }, ms);
                  }
              };

              if (currentOverlay && currentOverlay.visible && currentOverlay.type && currentOverlay.type !== payload.type) {
                  // Переход на ДРУГУЮ плашку — гасим старую, показываем новую со звуком.
                  setOverlay(prev => ({ ...prev, visible: false }));
                  // Промежуточный null только когда целевая плашка — статическая.
                  // Если это переход static → event (goal/penalty), confirmed не трогаем:
                  // статическая плашка в панели остаётся активной, событие лишь временно поверх.
                  if (STATIC_OVERLAY_TYPES.has(payload.type)) socket.emit('overlay_confirmed', { gameId, type: null });
                  if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
                  if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);

                  transitionTimeoutRef.current = setTimeout(() => showNewOverlay(true), 450);
              } else {
                  // Отменяем незавершённый переход: если предыдущая команда запустила
                  // setTimeout(showB, 450ms), а новая команда пришла в «провал» (visible=false),
                  // без clearTimeout старый таймер всё равно покажет B поверх новой команды.
                  // Это главная причина рассинхрона при быстрых кликах.
                  if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
                  showNewOverlay(!sameTypeVisible);
              }
          }
      } catch (error) {
          console.error('Критическая ошибка при обработке плашки:', error);
      }
    });

    // Восстановление состояния при перезагрузке (F5) оверлея в OBS:
    // сервер на join_game отдаёт текущий снимок — заново показываем активную статичную плашку и табло.
    socket.on('overlay_state', (ov) => {
      try {
        // Применяем снимок ТОЛЬКО сразу после (ре)коннекта (obsRestoredRef сбрасывается в
        // socket.on('connect') выше) — это холодное восстановление (могли пропустить команды,
        // пока не были в комнате), а не эхо чужого живого изменения. Живые показы/смены идут
        // через trigger_obs_overlay — с анимацией и звуком. Иначе overlay_state выставлял бы
        // плашку раньше триггера, и тот считал бы это «перепоказом» → звук появления глох бы
        // (в т.ч. в автопилоте).
        if (obsRestoredRef.current) return;
        obsRestoredRef.current = true;
        if (!ov) return;
        if (typeof ov.scoreboardVisible === 'boolean') setIsScoreboardVisible(ov.scoreboardVisible);
        const newType = ov.staticOverlay?.type || null;
        if (newType) {
          let data = ov.staticOverlay.data || null;
          // Таймерные плашки: staticOverlay.data может хранить устаревший endTime (сохранённый при
          // первом show, до запуска таймера). params.prematch / params.intermission всегда актуальны
          // (persistParams пишет их при каждом start/pause/stepper) — берём оттуда.
          if (newType === 'prematch' && ov.params?.prematch) data = { ...data, ...ov.params.prematch };
          if (newType === 'intermission' && ov.params?.intermission) data = { ...data, ...ov.params.intermission };
          setOverlay({ visible: true, type: newType, data });
        } else {
          // БД говорит «ничего не показывать» — скрываем то, что OBS показывал до реконнекта.
          // Без этого временные плашки (Арена, Комментатор...) зависают: hide-команда могла
          // не дойти до OBS, а при restore без этой ветки они так и остаются видимыми.
          setOverlay(prev => ({ ...prev, visible: false }));
        }
        // Сообщаем панели что именно сейчас реально показывается — иначе overlayMismatch
        // после force_resync не сбросится (overlay_state не идёт через showNewOverlay).
        socket.emit('overlay_confirmed', { gameId, type: newType });

        // Восстановление интро: раньше тут не читались ни introPlaying, ни громкость — после
        // реконнекта/перезагрузки OBS интро молча замолкало, даже если панель считала его
        // включённым (и наоборот — не было способа понять, что оно всё ещё должно играть).
        // URL сохраняется панелью в params.introUrl именно для этого восстановления.
        if (ov.introPlaying && ov.params?.introUrl) {
          if (!introAudioRef.current) {
            const a = new Audio();
            a.crossOrigin = 'anonymous';
            introAudioRef.current = a;
          }
          const intro = introAudioRef.current;
          intro.src = ov.params.introUrl;
          intro.loop = true;
          intro.volume = 0;
          introIsPlayingRef.current = true;
          intro.play().then(() => {
            fadeAudioVolume(intro, 1, INTRO_FADE_MS);
            ensureAudioGraph(intro); // после F5 граф пуст — без этого нет ни реверба, ни реакции графики
          }).catch(() => {});
        }
      } catch (e) {
        console.error('Ошибка восстановления overlay_state в оверлее:', e);
      }
    });

    return () => {
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
      if (audioFadeIntervalRef.current) clearInterval(audioFadeIntervalRef.current);
      if (introAudioRef.current) { introAudioRef.current.pause(); introAudioRef.current = null; }
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      stopAudioReactive();
      socketRef.current = null;
      socket.disconnect();
    };
  }, [gameId]);

  // ПРОГРЕВ РОЛИКОВ ЗАСТАВКИ. Тянем файлы в память сразу после загрузки данных
  // матча, чтобы к нажатию кнопки играть было уже нечего ждать. Отчёт уходит в
  // панель: режиссёр видит готовность слотов и не жмёт эфир раньше времени.
  //
  // hold — пока заставка в кадре, готовые адреса не подставляем: подмена src
  // посреди рекламы перезапустила бы ролик с нуля.
  const reportWarmup = useCallback((slots) => {
    socketRef.current?.emit('bumper_warmup', { gameId, slots });
  }, [gameId]);

  // Переход греем ПЕРВЫМ. Качается всё по очереди, а он и играет первым, и
  // весит меньше всех — стоял в конце, и пока три рекламных ролика тянулись, он
  // уходил в эфир прямо из сети, недогруженным. Адрес у него постоянный
  // (?v=время сборки), так что перезагрузка данных матча повторную закачку не
  // вызывает.
  const warmList = [
    ...(game?.transition_url ? [{ slot: 'transition', url: game.transition_url }] : []),
    ...(game?.league_bumpers || []),
  ];

  const { sources: bumperSources } = useBumperWarmup(warmList, {
    hold: overlay.visible && overlay.type === 'bumper',
    onReport: reportWarmup,
  });

  // === ВЫСОКОЧАСТОТНЫЙ ЦИКЛ РАСЧЕТА ВРЕМЕНИ ДЛЯ OBS ===
  useEffect(() => {
    const interval = setInterval(() => {
      if (timerData.isRunning && timerData.startedAt) {
        const nowWithOffset = Date.now() + timerData.serverTimeOffset;
        const elapsedSinceStart = Math.floor((nowWithOffset - timerData.startedAt) / 1000);
        setTimerSeconds(timerData.accumulatedSeconds + elapsedSinceStart);
      } else {
        setTimerSeconds(timerData.accumulatedSeconds);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [timerData]);
  // ====================================================

  const activePenalties = useMemo(() => {
    if (!game || !game.penalties) return [];
    try {
        const timelines = calculatePenaltyTimelines(game.penalties);
        return timelines
          .filter(p => timerSeconds >= p.effStart && timerSeconds < p.effEnd)
          .map(p => ({
            ...p,
            remaining: p.effEnd - timerSeconds,
            player_name: p.player_last_name ? `${p.player_last_name}` : ''
          }));
    } catch (e) { return []; }
  }, [game, timerSeconds]);

  return {
    game, events, timerSeconds, currentPeriod, isTimerRunning, activePenalties,
    periodLength, otLength, soLength, overlay, isScoreboardVisible, playOverlaySound,
    bumperSources
  };
}