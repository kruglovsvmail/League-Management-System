import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '../../utils/helpers';

const headers = () => ({ 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

// "Актуальность"/expiry: если гол/штраф был добавлен без автора/причины (чтобы сразу отобразить
// на табло), а автора/причину назначили только спустя это время — сервер молча НЕ озвучивает и
// не показывает такое событие. Иначе комментатор через 5 минут внезапно называет автора гола,
// который все уже "забыли", а то и после более свежего гола — это сбивает хронологию эфира.
const AUTO_SHOW_DEFAULTS = { enabled: true, delay: 10, duration: 10, expiry: 45 };

// Готовность события к показу/озвучке: гол ждёт автора, штраф — причину нарушения (тот же
// критерий, что у диктора арены в timerHandler.js). Командный/скамеечный штраф игрока не
// имеет вообще — раньше это здесь считалось "неготовым" навсегда, хотя причина уже выбрана.
const isEventEligible = (ev) => ev?.event_type === 'penalty' ? !!ev?.penalty_violation : !!ev?.primary_player_id;

export function useWebGraphicsPanel(gameId) {
  const [game, setGame] = useState(null);
  const [events, setEvents] = useState([]);
  const [timerData, setTimerData] = useState({
    accumulatedSeconds: 0,
    startedAt: null,
    isRunning: false,
    serverTimeOffset: 0
  });
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [currentPeriod, setCurrentPeriod] = useState('1');
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [activePenalties, setActivePenalties] = useState([]);

  const [periodLength, setPeriodLength] = useState(20);
  const [otLength, setOtLength] = useState(5);
  const [socket, setSocket] = useState(null);

  const [broadcastedEvents, setBroadcastedEvents] = useState([]);

  const [activeStaticOverlay, setActiveStaticOverlay] = useState(null);
  // Данные активной плашки (slot и startedAt заставки): нужны странице, чтобы
  // после перезагрузки панели подхватить титр, а не запустить его заново.
  const [activeStaticOverlayData, setActiveStaticOverlayData] = useState(null);
  const [activeEventOverlay, setActiveEventOverlay] = useState(null);
  const [isScoreboardVisible, setIsScoreboardVisible] = useState(true);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioSource, setAudioSource] = useState(null);   // какой именно источник сейчас играет: 'intro' | 'roster' | 'event' | null — синхронно у всех режиссёров (мьютекс: ровно один слот звука)
  const [introPlaying, setIntroPlaying] = useState(false); // зацикленное интро вкл/выкл (persistent)
  const [overlayParams, setOverlayParams] = useState(null); // параметры плашек/отсчёты (синхронны между панелями)
  const [overlayCount, setOverlayCount] = useState(null);  // кол-во подключённых OBS-оверлеев (null = ещё не получили)
  const [bumperWarmup, setBumperWarmup] = useState(null);  // прогрев роликов заставки в оверлеях: { slot: { progress, ready } } | null (оверлеи молчат)
  const [confirmedOverlayType, setConfirmedOverlayType] = useState(undefined); // тип плашки, которую OBS реально показывает (undefined = ещё не получено)
  const [overlayMismatch, setOverlayMismatch] = useState(false); // true = нажатая плашка ≠ то, что OBS реально показывает в эфире

  // Синхронизация состояния оверлеев OBS с сервером (чтобы переоткрытая панель не была в рассинхроне).
  const overlayHydratedRef = useRef(false);          // пришло ли состояние с сервера (чтобы не затереть его дефолтами)
  const staticOverlayRef = useRef(null);             // { type, data } активной постоянной плашки | null
  const syncedPersistTimerRef = useRef(null);        // debounce синхронизируемых полей (громкость/интро/табло/плашка)
  const autopilotPersistTimerRef = useRef(null);     // debounce полей автопилота
  const paramsPersistTimerRef = useRef(null);        // debounce параметров плашек
  const pendingParamsRef = useRef({});               // накопленные изменённые параметры до flush'а
  const lastAutopilotConfigSentRef = useRef(null);   // сигнатура последнего конфига автопилота (свой отправленный/полученный) — чтобы не зеркалить эхом
  const mismatchTimerRef = useRef(null);              // debounce-таймер детектора рассинхрона (1с)

  // Сохранение/рассылка параметров плашек. Накапливаем изменённые ключи и шлём пачкой (сервер мержит params).
  // Объявлено рано, т.к. используется другими callback'ами ниже (updateAutoShowSettings/updateTtsEvents/triggerOverlay).
  const persistParams = useCallback((partial) => {
    pendingParamsRef.current = { ...pendingParamsRef.current, ...partial };
    if (paramsPersistTimerRef.current) clearTimeout(paramsPersistTimerRef.current);
    paramsPersistTimerRef.current = setTimeout(() => {
      const toSend = pendingParamsRef.current;
      pendingParamsRef.current = {};
      socket?.emit('update_overlay_state', { gameId, params: toSend });
    }, 300);
  }, [socket, gameId]);

  // Состояние автопилота графики — централизовано в хуке (раньше было размазано по странице/виджету,
  // жило в памяти/localStorage). Теперь хранится в БД и восстанавливается при переоткрытии панели.
  const [playlistSteps, setPlaylistSteps] = useState([
    { id: 'init-1', type: 'prematch',     label: 'До матча' },
    { id: 'init-2', type: 'team_leaders', label: 'Лидеры' },
    { id: 'init-3', type: 'team_roster',  label: 'Составы' }
  ]);
  const [autopilotDuration, setAutopilotDuration] = useState(15);
  const [autopilotLoop, setAutopilotLoop] = useState(true);
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [autopilotIndex, setAutopilotIndex] = useState(0);

  // --- AUTO-SHOW SETTINGS (unified) ---
  const [autoShowSettings, setAutoShowSettings] = useState(() => {
    const stored = localStorage.getItem(`graphics_autoshow_${gameId}`);
    if (stored) {
      try { return { ...AUTO_SHOW_DEFAULTS, ...JSON.parse(stored) }; } catch(e) {}
    }
    return AUTO_SHOW_DEFAULTS;
  });

  const updateAutoShowSettings = useCallback((field, value) => {
    setAutoShowSettings(prev => {
      const updated = { ...prev, [field]: value };
      localStorage.setItem(`graphics_autoshow_${gameId}`, JSON.stringify(updated));
      persistParams({ autoShowSettings: updated });
      return updated;
    });
  }, [gameId, persistParams]);

  const loadGameData = useCallback(async () => {
    try {
      const [resGame, resEvents] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
        fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      ]);

      const dataGame = await resGame.json();
      const dataEvents = await resEvents.json();

      if (dataGame.success) {
        setGame(dataGame.data);
        if (dataGame.data.period_length) setPeriodLength(dataGame.data.period_length);
        if (dataGame.data.ot_length) setOtLength(dataGame.data.ot_length);
      }
      if (dataEvents.success) {
        setEvents(dataEvents.data);
      }
    } catch (err) { console.error(err); }
  }, [gameId]);

  useEffect(() => { loadGameData(); }, [loadGameData]);

  useEffect(() => {
    const stored = localStorage.getItem(`graphics_broadcasted_${gameId}`);
    if (stored) {
      try { setBroadcastedEvents(JSON.parse(stored)); } catch(e) { console.error(e); }
    }
  }, [gameId]);

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_API_URL);
    setSocket(newSocket);
    // join_game шлём и на первом connect, и на КАЖДОМ реконнекте (сон ноутбука, моргнувшая сеть) —
    // socket.io переподключается сам, но с новым socket.id, и без повторного join_game сокет
    // навсегда выпадает из комнаты game_${gameId}, оставаясь при этом внешне "подключённым".
    newSocket.on('connect', () => newSocket.emit('join_game', gameId));

    newSocket.on('timer_state', (state) => {
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
    });

    newSocket.on('trigger_obs_overlay', (payload) => {
        if (String(payload?.gameId) !== String(gameId)) return;

        if (payload?.type === 'audio_ended') {
            setAudioPlaying(false);
            setAudioSource(null);
        }
        // Голосовой канал (состав / событие) — синхронизируем между всеми панелями.
        // Интро теперь независимый канал: его play/stop не затрагивает audioPlaying/audioSource,
        // чтобы кнопки голосового канала не блокировались фоновой музыкой.
        if (payload?.type === 'audio' && payload.source !== 'intro') {
            if (payload.action === 'play') { setAudioPlaying(true); setAudioSource(payload.source || null); }
            if (payload.action === 'stop') { setAudioPlaying(false); setAudioSource(null); }
        }
        // Живой индикатор «сейчас показывается» для карточки события матча — синхронно у обоих режиссёров.
        if (['goal', 'penalty'].includes(payload?.type) && payload?.data?.id) {
            const sig = getEventSignature(payload.data);
            setActiveEventOverlay(sig);
            const durationMs = (Number(payload.duration) || 10) * 1000;
            setTimeout(() => {
                setActiveEventOverlay(prev => prev === sig ? null : prev);
            }, durationMs);
        }
    });

    // Восстановление состояния оверлеев при (пере)подключении панели.
    // Ставим стейты НАПРЯМУЮ (без toggle), чтобы не слать повторно show/hide в OBS — он и так это уже показывает.
    // Приходит и при заходе (снимок из БД), и на КАЖДОЕ изменение от другого режиссёра (broadcast).
    newSocket.on('overlay_state', (ov) => {
        if (!ov) { overlayHydratedRef.current = true; return; }

        // Поля, синхронизируемые между панелями вживую (идемпотентны — повторное применение безвредно).
        if (typeof ov.scoreboardVisible === 'boolean') setIsScoreboardVisible(ov.scoreboardVisible);
        if (typeof ov.introPlaying === 'boolean') {
            setIntroPlaying(ov.introPlaying);
            // Интро — независимый канал, audioPlaying/audioSource отражают только голосовой трек.
        }
        // Применяем плашку только если поле реально пришло (рассылки автопилота частичные —
        // без staticOverlay; иначе стоп автопилота сбрасывал бы подсветку в null).
        if ('staticOverlay' in ov) {
            staticOverlayRef.current = ov.staticOverlay || null;
            setActiveStaticOverlay(ov.staticOverlay?.type ?? null);
            setActiveStaticOverlayData(ov.staticOverlay?.data ?? null);
        }

        // Параметры плашек/отсчёты — отдаём странице (она применит к своим стейтам).
        if (ov.params) setOverlayParams(ov.params);

        // Настройки автопоказа/озвучки событий — синхронны между режиссёрами (раньше жили только в localStorage).
        if (ov.params?.autoShowSettings) {
            setAutoShowSettings(prev => {
                const updated = { ...prev, ...ov.params.autoShowSettings };
                localStorage.setItem(`graphics_autoshow_${gameId}`, JSON.stringify(updated));
                return updated;
            });
        }
        if (typeof ov.params?.ttsEvents === 'boolean') {
            setTtsEvents(ov.params.ttsEvents);
            localStorage.setItem(`graphics_tts_events_${gameId}`, String(ov.params.ttsEvents));
        }
        // Уже показанные события (потушенные карточки) — объединяем со своим списком (union), а не заменяем,
        // чтобы не потерять локально только что добавленное, пока не пришло подтверждение с сервера.
        if (Array.isArray(ov.params?.broadcastedEvents)) {
            setBroadcastedEvents(prev => {
                const merged = Array.from(new Set([...prev, ...ov.params.broadcastedEvents]));
                localStorage.setItem(`graphics_broadcasted_${gameId}`, JSON.stringify(merged));
                return merged;
            });
        }

        // Автопилот теперь крутится на СЕРВЕРЕ → running/index просто отражаем у себя на каждый апдейт.
        if (typeof ov.autopilotRunning === 'boolean') setAutopilotRunning(ov.autopilotRunning);
        if (ov.autopilot && typeof ov.autopilot.current_index === 'number') setAutopilotIndex(ov.autopilot.current_index);
        // Конфиг плейлиста (steps/duration/loop) — зеркалим живьём и при гидрации. От эхо-зацикливания (наш же
        // пересланный конфиг возвращается назад) защищаемся сигнатурой: применяем/шлём только когда контент реально другой.
        if (ov.autopilot && Array.isArray(ov.autopilot.steps) && ov.autopilot.steps.length > 0) {
            const incomingSig = JSON.stringify({ steps: ov.autopilot.steps, duration: ov.autopilot.duration, loop: ov.autopilot.loop });
            if (incomingSig !== lastAutopilotConfigSentRef.current) {
                lastAutopilotConfigSentRef.current = incomingSig;
                setPlaylistSteps(ov.autopilot.steps);
                if (typeof ov.autopilot.duration === 'number') setAutopilotDuration(ov.autopilot.duration);
                if (typeof ov.autopilot.loop === 'boolean') setAutopilotLoop(ov.autopilot.loop);
            }
        }
        overlayHydratedRef.current = true;
    });

    newSocket.on('overlay_count', (data) => {
      if (String(data?.gameId) !== String(gameId)) return;
      setOverlayCount(data.count);
    });

    // Прогрев роликов заставки: оверлеи качают файлы себе в память и докладывают
    // готовность. Пока слот не прогрет, панель не пускает его в эфир — иначе в
    // кадре повиснет стоп-кадр вместо ролика. Сведено по худшему оверлею.
    newSocket.on('bumper_warmup', (data) => {
      if (String(data?.gameId) !== String(gameId)) return;
      setBumperWarmup(data.slots || null);
    });
    // OBS-оверлей подтверждает, что реально отображается в эфире после каждого перехода.
    // Панель сравнивает это с activeStaticOverlay и при расхождении показывает предупреждение.
    newSocket.on('overlay_confirmed', (data) => {
      if (String(data?.gameId) !== String(gameId)) return;
      setConfirmedOverlayType(data.type ?? null);
    });
    newSocket.on('score_updated', () => loadGameData());
    newSocket.on('game_updated', () => loadGameData());

    return () => newSocket.disconnect();
  }, [gameId, loadGameData]);

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

  const getEventSignature = useCallback((ev) => {
    if (ev.event_type === 'goal') return `goal_${ev.id}_${ev.primary_player_id || 'x'}`;
    if (ev.event_type === 'penalty') return `penalty_${ev.id}_${ev.primary_player_id || 'x'}`;
    return `${ev.event_type}_${ev.id}`;
  }, []);

  // --- TTS EVENTS (pregeneration) ---
  const [ttsEvents, setTtsEvents] = useState(() => {
    const stored = localStorage.getItem(`graphics_tts_events_${gameId}`);
    return stored !== null ? stored === 'true' : false;
  });

  const updateTtsEvents = useCallback((val) => {
    setTtsEvents(val);
    localStorage.setItem(`graphics_tts_events_${gameId}`, String(val));
    persistParams({ ttsEvents: val });
  }, [gameId, persistParams]);

  const ttsEventsRef = useRef(ttsEvents);
  useEffect(() => { ttsEventsRef.current = ttsEvents; }, [ttsEvents]);
  const audioPlayingRef = useRef(audioPlaying);
  useEffect(() => { audioPlayingRef.current = audioPlaying; }, [audioPlaying]);
  const audioSourceRef = useRef(audioSource);
  useEffect(() => { audioSourceRef.current = audioSource; }, [audioSource]);

  // Cache: event_id -> { hash, url } — pregenerated audio
  const ttsCacheRef = useRef({});
  // Track which events are currently being generated
  const ttsGeneratingRef = useRef(new Set());

  const getTtsHash = useCallback((ev) => {
    if (!isEventEligible(ev)) return null;
    return [
      ev.event_type, ev.primary_player_id, ev.primary_jersey_number, ev.primary_position,
      ev.primary_last_name, ev.primary_first_name, ev.primary_pronunciation,
      ev.assist1_id, ev.assist1_last_name, ev.assist1_first_name, ev.assist1_pronunciation, ev.assist1_jersey_number,
      ev.assist2_id, ev.assist2_last_name, ev.assist2_first_name, ev.assist2_pronunciation, ev.assist2_jersey_number,
      ev.penalty_minutes, ev.penalty_violation, ev.penalty_class,
      ev.goal_strength, ev.team_pronunciation, ev.team_name
    ].join('|');
  }, []);

  const pregenerateTts = useCallback((ev) => {
    if (!isEventEligible(ev) || ttsGeneratingRef.current.has(ev.id)) return;
    ttsGeneratingRef.current.add(ev.id);

    // Форма один в один с buildBroadcastEventText (ttsShared.js) — раздельные имя/фамилия,
    // is_goalie и номера ассистентов теперь тоже нужны для правильных формулировок.
    const body = {
      event_id: ev.id,
      event_type: ev.event_type,
      player_last_name: ev.primary_last_name,
      player_first_name: ev.primary_first_name,
      pronunciation: ev.primary_pronunciation || null,
      jersey_number: ev.primary_jersey_number ?? '',
      is_goalie: ev.primary_position === 'G',
      team_name: ev.team_name || null,
      team_pronunciation: ev.team_pronunciation || null,
      penalty_minutes: ev.penalty_minutes,
      penalty_class: ev.penalty_class,
      penalty_violation: ev.penalty_violation,
      assist1_last_name: ev.assist1_last_name,
      assist1_first_name: ev.assist1_first_name,
      assist1_pronunciation: ev.assist1_pronunciation || null,
      assist1_jersey_number: ev.assist1_jersey_number,
      assist2_last_name: ev.assist2_last_name,
      assist2_first_name: ev.assist2_first_name,
      assist2_pronunciation: ev.assist2_pronunciation || null,
      assist2_jersey_number: ev.assist2_jersey_number,
      goal_strength: ev.goal_strength ?? null,
    };

    fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/broadcast/tts/event`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.url) {
          ttsCacheRef.current[ev.id] = { hash: getTtsHash(ev), url: data.url };
        }
      })
      .catch(e => console.error('TTS pregen error:', e))
      .finally(() => ttsGeneratingRef.current.delete(ev.id));
  }, [gameId, getTtsHash]);

  // Pregenerate TTS when events change or when ttsEvents is enabled
  useEffect(() => {
    if (!ttsEvents) return;

    events.forEach(ev => {
      if (!['goal', 'penalty'].includes(ev.event_type)) return;
      if (!isEventEligible(ev)) return;

      const hash = getTtsHash(ev);
      const cached = ttsCacheRef.current[ev.id];

      if (!cached || cached.hash !== hash) {
        pregenerateTts(ev);
      }
    });

    // Clean cache for deleted events
    const currentIds = new Set(events.map(e => e.id));
    Object.keys(ttsCacheRef.current).forEach(id => {
      if (!currentIds.has(parseInt(id))) {
        delete ttsCacheRef.current[id];
      }
    });
  }, [events, ttsEvents, getTtsHash, pregenerateTts]);

  const triggerOverlay = useCallback((type, data, signature, duration = 10) => {
    socket?.emit('trigger_obs_overlay', { type, gameId, data, duration });

    setActiveEventOverlay(signature);
    setTimeout(() => {
      setActiveEventOverlay(prev => prev === signature ? null : prev);
    }, duration * 1000);

    setBroadcastedEvents(prev => {
      if (prev.includes(signature)) return prev;
      const updated = [...prev, signature];
      localStorage.setItem(`graphics_broadcasted_${gameId}`, JSON.stringify(updated));
      persistParams({ broadcastedEvents: updated });
      return updated;
    });

    const voicePlaying = audioPlayingRef.current && audioSourceRef.current !== 'intro';
    if (ttsEventsRef.current && ['goal', 'penalty'].includes(type) && data?.id && !voicePlaying) {
      const cached = ttsCacheRef.current[data.id];
      if (cached?.url) {
        socket?.emit('trigger_obs_overlay', { type: 'audio', gameId, action: 'play', source: 'event', data: { url: cached.url, loop: false } });
      }
    }
  }, [socket, gameId, persistParams]);

  // Авто-показ и авто-озвучка голов/штрафов раньше жили здесь (детект перехода "нет автора" →
  // "есть автор" по events + таймеру, setTimeout на delay, проверка expiry) — теперь этим
  // занимается сервер (broadcastAnnouncer.js), одинаково для всех и независимо от того,
  // открыта ли эта панель. Оставлять здесь ту же логику означало бы двойной показ и двойную
  // озвучку каждого события. triggerOverlay ниже — это ТОЛЬКО ручной клик режиссёра по карточке
  // события (например, повторно вывести уже показанное) и настройки autoShowSettings/ttsEvents,
  // которые сервер читает из тех же persistParams.

  const toggleStaticOverlay = useCallback((type, data = null, forceUpdate = false) => {
    setActiveStaticOverlay(prevActive => {
      if (prevActive === type) {
          if (forceUpdate) {
              socket?.emit('trigger_obs_overlay', { action: 'show', type, gameId, duration: 'infinite', data });
              staticOverlayRef.current = { type, data };
              setActiveStaticOverlayData(data);
              // activeStaticOverlay не меняется → persist-эффект не сработает → шлём вручную,
              // чтобы OBS при реконнекте получил свежий data (endTime таймера, а не старый).
              socket?.emit('update_overlay_state', { gameId, staticOverlay: { type, data } });
              return prevActive;
          } else {
              socket?.emit('trigger_obs_overlay', { action: 'hide', type, gameId });
              staticOverlayRef.current = null;
              setActiveStaticOverlayData(null);
              return null;
          }
      } else {
          socket?.emit('trigger_obs_overlay', { action: 'show', type, gameId, duration: 'infinite', data });
          staticOverlayRef.current = { type, data };
          setActiveStaticOverlayData(data);
          return type;
      }
    });
  }, [socket, gameId]);

  const toggleScoreboard = useCallback(() => {
    setIsScoreboardVisible(prev => {
      const newState = !prev;
      socket?.emit('trigger_obs_overlay', { type: 'scoreboard', action: newState ? 'show' : 'hide', gameId });
      return newState;
    });
  }, [socket, gameId]);

  // Персист 1: синхронизируемые поля (интро/табло/плашка). Шлём ТОЛЬКО их — сервер
  // частичным upsert'ом не трогает автопилот, и рассылает снимок другим панелям. Не пишем до гидрации.
  useEffect(() => {
    if (!overlayHydratedRef.current || !socket) return;
    if (syncedPersistTimerRef.current) clearTimeout(syncedPersistTimerRef.current);
    syncedPersistTimerRef.current = setTimeout(() => {
      socket.emit('update_overlay_state', {
        gameId,
        introPlaying,
        scoreboardVisible: isScoreboardVisible,
        staticOverlay: staticOverlayRef.current,
      });
    }, 250);
    return () => { if (syncedPersistTimerRef.current) clearTimeout(syncedPersistTimerRef.current); };
  }, [introPlaying, isScoreboardVisible, activeStaticOverlay, socket, gameId]);

  // Персист 2: ТОЛЬКО конфиг автопилота (плейлист/длительность/loop). running и current_index пишет
  // серверный цикл, поэтому панель их не шлёт. Сервер мержит jsonb, так что current_index не затирается.
  // Зеркалим живьём между режиссёрами (см. overlay_state выше) — сигнатура защищает от эхо-зацикливания:
  // если этот конфиг только что применён из сокета (от другого режиссёра), повторно его не отсылаем.
  useEffect(() => {
    if (!overlayHydratedRef.current || !socket) return;
    const sig = JSON.stringify({ steps: playlistSteps, duration: autopilotDuration, loop: autopilotLoop });
    if (sig === lastAutopilotConfigSentRef.current) return;
    if (autopilotPersistTimerRef.current) clearTimeout(autopilotPersistTimerRef.current);
    autopilotPersistTimerRef.current = setTimeout(() => {
      lastAutopilotConfigSentRef.current = sig;
      socket.emit('update_overlay_state', {
        gameId,
        autopilot: { steps: playlistSteps, duration: autopilotDuration, loop: autopilotLoop },
      });
    }, 400);
    return () => { if (autopilotPersistTimerRef.current) clearTimeout(autopilotPersistTimerRef.current); };
  }, [playlistSteps, autopilotDuration, autopilotLoop, socket, gameId]);

  // Детектор рассинхрона плашек: OBS шлёт overlay_confirmed после каждого перехода (что реально в эфире).
  // Если подтверждённый тип ≠ activeStaticOverlay более 1с → overlayMismatch = true → жёлтое предупреждение.
  // 1с-задержка предотвращает ложные срабатывания во время 450мс CSS-анимации перехода.
  useEffect(() => {
    // Показываем предупреждение только когда OBS подключён и уже прислал хотя бы одно подтверждение.
    if (confirmedOverlayType === undefined || !overlayCount) {
      if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current);
      setOverlayMismatch(false);
      return;
    }
    const isMatch = confirmedOverlayType === activeStaticOverlay;
    if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current);
    if (isMatch) {
      setOverlayMismatch(false);
    } else {
      mismatchTimerRef.current = setTimeout(() => setOverlayMismatch(true), 1000);
    }
    return () => { if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current); };
  }, [confirmedOverlayType, activeStaticOverlay, overlayCount]);

  // Старт/стоп серверного автопилота. Панель отдаёт уже разрешённый плейлист (steps с данными).
  const startAutopilotServer = useCallback((resolvedSteps, duration, loop) => {
    socket?.emit('autopilot_start', { gameId, steps: resolvedSteps, duration, loop });
  }, [socket, gameId]);
  // keepOverlay — стоп «с перехватом»: режиссёр нажал плашку руками, панель прямо
  // сейчас выставляет её сама. Обычный стоп в этот момент погасил бы как раз её
  // (сервер шлёт hide последнего шага и обнуляет плашку в БД).
  const stopAutopilotServer = useCallback((keepOverlay = false) => {
    socket?.emit('autopilot_stop', { gameId, keepOverlay });
  }, [socket, gameId]);

  // Ручной предохранитель: заставляет OBS-оверлей заново join_game и перечитать состояние
  // с сервера, даже если он молча выпал из комнаты (обрыв сети) и обычный реконнект-фикс
  // почему-то не сработал. Рассылается глобально на бэкенде, а не по комнате — иначе имел бы
  // ту же дыру, что и чинит.
  const forceResyncOverlay = useCallback(() => {
    socket?.emit('force_resync_overlay', { gameId });
  }, [socket, gameId]);

  return {
    game, events, timerSeconds, currentPeriod, isTimerRunning, activePenalties,
    periodLength, otLength, socket, broadcastedEvents,
    triggerOverlay, toggleStaticOverlay, activeStaticOverlay, activeStaticOverlayData,
    isScoreboardVisible, toggleScoreboard, activeEventOverlay,
    autoShowSettings, updateAutoShowSettings, getEventSignature,
    ttsEvents, updateTtsEvents,
    audioPlaying, audioSource,
    introPlaying, setIntroPlaying,
    // Автопилот (серверный: running/index приходят с сервера, конфиг — локально+БД)
    playlistSteps, setPlaylistSteps,
    autopilotDuration, setAutopilotDuration,
    autopilotLoop, setAutopilotLoop,
    autopilotRunning, autopilotIndex,
    startAutopilotServer, stopAutopilotServer,
    forceResyncOverlay,
    // Параметры плашек (синхронны между панелями)
    overlayParams, persistParams,
    overlayCount,
    overlayMismatch,
    bumperWarmup,
  };
}
