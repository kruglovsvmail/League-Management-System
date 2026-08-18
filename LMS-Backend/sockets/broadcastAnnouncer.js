// LMS-Backend/sockets/broadcastAnnouncer.js
//
// ДИКТОР-КОММЕНТАТОР ТРАНСЛЯЦИИ: сервер сам решает, когда показать плашку гола/штрафа в OBS
// и когда её озвучить. Архитектурно похож на "диктора арены" (timerHandler.js, announcerTimers/
// arena_play), но НАМЕРЕННО не делит с ним ни очередь, ни сокет-канал, ни настройки — общее
// только сам паттерн (сервер решает "когда", клиент — тупой приёмник) и триггер готовности
// события: гол ждёт назначенного автора, штраф — выбранную причину нарушения.
//
// Задержка и актуальность здесь считаются ПО ИГРОВОМУ ТАЙМЕРУ, а не по реальному времени —
// это сознательно отличается от диктора арены (там задержка — реальное время). Смысл: плашка
// гола/штрафа и её озвучка должны всплывать ПОСЛЕ возобновления игры (запуска таймера), а не
// сразу в реальном времени, пока матч ещё стоит (разбор эпизода, замена и т.п.). Поэтому здесь
// нет ни ежесекундного тикера, ни setTimeout на голое реальное время — отсчёт идёт только пока
// таймер запущен, и ставится на паузу вместе с ним (см. getRunningMsNow/pausePending/resumePending).
//
// Мьютекс звука: ровно один звук в трансляции одновременно (интро / состав / событие).
// Если слот занят — новое объявление голоса просто не звучит (плашка всё равно показывается,
// беззвучно), без очереди и без ожидания.

import pool from '../config/db.js';
import { getLeagueIdForGame } from '../utils/leagueLookup.js';
import { generateBroadcastEventAudio } from '../controllers/ttsBroadcastController.js';
import { isTimerCurrentlyRunning } from './timerHandler.js';

// "Актуальность"/expiry: гол/штраф нередко сохраняют без автора/причины, чтобы сразу отразить
// на табло, а автора/причину назначают позже. Если это "позже" затянулось дольше expiry секунд
// ХОДА МАТЧА (не реального времени) — молча не объявляем и не показываем: иначе комментатор
// внезапно называет автора гола пятиминутной давности, а то и ПОСЛЕ уже объявленного более
// свежего гола — это ломает хронологию эфира сильнее, чем просто промолчать про один гол.
const AUTO_SHOW_DEFAULTS = { enabled: true, delay: 10, duration: 10, expiry: 45 };

const EVICT_DELAY_MS = 120 * 60 * 1000;
const pendingEvictions = {};

// gameId -> {
//   processedEventIds: Set<number>,
//   firstSeenRunningMs: Map<eventId, number>,   // "снимок" бегущих игровых мс на момент первого появления заготовки
//   pendingByEvent: Map<eventId, { remainingMs, timeoutHandle, armedAt, row }>,
//   isRunning: boolean, runSince: number|null, accumulatedRunningMs: number,  // бегущие игровые мс (см. getRunningMsNow)
//   audioBusy: boolean, audioBusySource: string|null,
// }
const state = {};

const getState = (gameId) => {
  if (!state[gameId]) {
    state[gameId] = {
      seedingPromise: null, // см. ensureSeeded — гарантирует ОДИН запуск seedBaseline, кто бы её первым ни запросил
      processedEventIds: new Set(),
      firstSeenRunningMs: new Map(),
      pendingByEvent: new Map(),
      isRunning: false,
      runSince: null,
      accumulatedRunningMs: 0,
      audioBusy: false,
      audioBusySource: null,
    };
  }
  return state[gameId];
};

// Монотонный счётчик "сколько игровых мс таймер уже находился в состоянии running" с момента,
// когда мы начали следить за этим матчем. Не абсолютная позиция таймера (она нам не нужна) —
// только дельта, поэтому не важно, что счётчик стартует с нуля при каждом рестарте сервера.
const getRunningMsNow = (s) => s.accumulatedRunningMs + (s.isRunning && s.runSince ? (Date.now() - s.runSince) : 0);

const isEligible = (row) =>
  row.event_type === 'goal' ? !!row.primary_player_id : !!row.penalty_violation;

const getEventSignature = (row) =>
  `${row.event_type}_${row.id}_${row.primary_player_id || 'x'}`;

// Те же поля, что уже отдаёт /api/games/:gameId/events — EventOverlay и GameEventsWidget
// на фронте ждут именно эту форму, менять её не нужно.
const EVENTS_QUERY = `
  SELECT
    ge.id, ge.period, ge.time_seconds, ge.event_type, ge.goal_strength,
    ge.penalty_violation, ge.penalty_minutes, ge.penalty_class,
    pt.tts_accusative as penalty_accusative,
    t.id as team_id, t.name as team_name, t.logo_url as team_logo, t.pronunciation as team_pronunciation,
    su.id as primary_player_id, su.last_name as primary_last_name, su.first_name as primary_first_name,
    su.pronunciation as primary_pronunciation, tm_su.photo_url as primary_photo_url,
    gr_su.jersey_number as primary_jersey_number, gr_su.position_in_line as primary_position,
    a1.last_name as assist1_last_name, a1.first_name as assist1_first_name, a1.pronunciation as assist1_pronunciation,
    gr_a1.jersey_number as assist1_jersey_number,
    a2.last_name as assist2_last_name, a2.first_name as assist2_first_name, a2.pronunciation as assist2_pronunciation,
    gr_a2.jersey_number as assist2_jersey_number
  FROM game_events ge
  -- Падеж причины для диктора берём из справочника лиги; пункт могли удалить,
  -- тогда останется NULL и сработает встроенный фолбэк (см. ttsShared.js)
  LEFT JOIN penalty_types pt ON pt.id = ge.penalty_reason_id
  LEFT JOIN teams t ON ge.team_id = t.id
  LEFT JOIN users su ON COALESCE(ge.scorer_id, ge.penalty_player_id) = su.id
  LEFT JOIN team_members tm_su ON tm_su.user_id = su.id AND tm_su.team_id = ge.team_id
  LEFT JOIN game_rosters gr_su ON gr_su.game_id = ge.game_id AND gr_su.player_id = su.id AND gr_su.team_id = ge.team_id
  LEFT JOIN users a1 ON ge.assist1_id = a1.id
  LEFT JOIN game_rosters gr_a1 ON gr_a1.game_id = ge.game_id AND gr_a1.player_id = a1.id AND gr_a1.team_id = ge.team_id
  LEFT JOIN users a2 ON ge.assist2_id = a2.id
  LEFT JOIN game_rosters gr_a2 ON gr_a2.game_id = ge.game_id AND gr_a2.player_id = a2.id AND gr_a2.team_id = ge.team_id
  WHERE ge.game_id = $1 AND ge.event_type IN ('goal', 'penalty')
  ORDER BY ge.time_seconds ASC
`;

const readOverlayParams = async (gameId) => {
  try {
    const res = await pool.query('SELECT params FROM game_overlay_state WHERE game_id = $1', [gameId]);
    const row = res.rows[0];
    const params = row?.params || {};
    return {
      ttsEvents: !!params.ttsEvents,
      autoShowSettings: { ...AUTO_SHOW_DEFAULTS, ...(params.autoShowSettings || {}) },
      broadcastedEvents: Array.isArray(params.broadcastedEvents) ? params.broadcastedEvents : [],
    };
  } catch (e) {
    console.error('[BroadcastAnnouncer] Ошибка чтения params:', e);
    return { ttsEvents: false, autoShowSettings: AUTO_SHOW_DEFAULTS, broadcastedEvents: [] };
  }
};

const persistBroadcastedEvent = async (gameId, signature, currentBroadcasted) => {
  if (currentBroadcasted.includes(signature)) return;
  const updated = [...currentBroadcasted, signature];
  try {
    await pool.query(`
      INSERT INTO game_overlay_state (game_id, params, updated_at)
      VALUES ($1, jsonb_build_object('broadcastedEvents', $2::jsonb), NOW())
      ON CONFLICT (game_id) DO UPDATE SET
        params = COALESCE(game_overlay_state.params, '{}'::jsonb) || jsonb_build_object('broadcastedEvents', $2::jsonb),
        updated_at = NOW()
    `, [gameId, JSON.stringify(updated)]);
  } catch (e) { console.error('[BroadcastAnnouncer] Ошибка сохранения broadcastedEvents:', e); }
};

export default function setupBroadcastAnnouncer(io) {

  const scheduleEvictAnnouncer = (gameId) => {
    if (pendingEvictions[gameId]) clearTimeout(pendingEvictions[gameId]);
    const room = io.sockets.adapter.rooms.get(`game_${gameId}`);
    if (room && room.size > 0) return;
    pendingEvictions[gameId] = setTimeout(() => {
      delete pendingEvictions[gameId];
      const s = state[gameId];
      if (!s) return;
      for (const p of s.pendingByEvent.values()) if (p.timeoutHandle) clearTimeout(p.timeoutHandle);
      delete state[gameId];
    }, EVICT_DELAY_MS);
  };

  const cancelEvictAnnouncer = (gameId) => {
    if (pendingEvictions[gameId]) {
      clearTimeout(pendingEvictions[gameId]);
      delete pendingEvictions[gameId];
    }
  };

  const dispatchEvent = async (gameId, row) => {
    const s = getState(gameId);

    const { ttsEvents, autoShowSettings, broadcastedEvents } = await readOverlayParams(gameId);
    if (!autoShowSettings.enabled) return; // за время ожидания автопоказ выключили — молчим

    // Перепроверяем "актуальность" ещё раз на момент фактического показа (не только на момент
    // постановки в очередь) — задержка сама по себе тоже "тратит" игровое время.
    const firstSeen = s.firstSeenRunningMs.get(row.id);
    if (firstSeen !== undefined && getRunningMsNow(s) - firstSeen > (autoShowSettings.expiry ?? 45) * 1000) return;

    const sig = getEventSignature(row);
    io.to(`game_${gameId}`).emit('trigger_obs_overlay', { type: row.event_type, gameId, data: row, duration: autoShowSettings.duration });
    persistBroadcastedEvent(gameId, sig, broadcastedEvents)
      .then(() => io.to(`game_${gameId}`).emit('overlay_state', { params: { broadcastedEvents: [...broadcastedEvents, sig] } }));

    if (!ttsEvents) return;
    if (s.audioBusy) return; // мьютекс: состав/другое событие уже звучит — молча пропускаем (интро независим)

    try {
      const leagueId = await getLeagueIdForGame(gameId);
      // Форма один в один с buildBroadcastEventText (ttsShared.js) — раздельные имя/фамилия,
      // is_goalie и номера ассистентов нужны для правильных формулировок и склонений.
      const ttsPayload = {
        event_type: row.event_type,
        player_last_name: row.primary_last_name,
        player_first_name: row.primary_first_name,
        pronunciation: row.primary_pronunciation || null,
        jersey_number: row.primary_jersey_number ?? '',
        is_goalie: row.primary_position === 'G',
        team_name: row.team_name || null,
        team_pronunciation: row.team_pronunciation || null,
        penalty_minutes: row.penalty_minutes,
        penalty_class: row.penalty_class,
        penalty_violation: row.penalty_violation,
        penalty_accusative: row.penalty_accusative || null,
        assist1_last_name: row.assist1_last_name,
        assist1_first_name: row.assist1_first_name,
        assist1_pronunciation: row.assist1_pronunciation || null,
        assist1_jersey_number: row.assist1_jersey_number,
        assist2_last_name: row.assist2_last_name,
        assist2_first_name: row.assist2_first_name,
        assist2_pronunciation: row.assist2_pronunciation || null,
        assist2_jersey_number: row.assist2_jersey_number,
        goal_strength: row.goal_strength ?? null,
      };
      const url = await generateBroadcastEventAudio({ gameId, leagueId, eventId: row.id, eventPayload: ttsPayload });
      if (!url) return;
      // Мьютекс всё ещё может быть занят тем, что началось, пока генерировался TTS — проверяем ещё раз.
      if (s.audioBusy) return;
      s.audioBusy = true;
      s.audioBusySource = 'event';
      io.to(`game_${gameId}`).emit('trigger_obs_overlay', {
        type: 'audio', gameId, action: 'play', source: 'event',
        data: { url, loop: false },
      });
      // Предохранитель: обычно мьютекс снимает 'audio_ended' от OBS, когда фраза доиграла.
      // Но если именно в этот момент OBS выпал из комнаты (см. фикс реконнекта) и 'audio_ended'
      // не долетит — без этого таймера мьютекс завис бы навсегда, заглушив все следующие события.
      // Фразы короткие, 20с с большим запасом хватает на самую длинную.
      setTimeout(() => {
        if (s.audioBusySource === 'event') { s.audioBusy = false; s.audioBusySource = null; }
      }, 20000);
    } catch (e) {
      console.error(`[BroadcastAnnouncer] Ошибка генерации TTS (матч ${gameId}, событие ${row.id}):`, e);
    }
  };

  const firePending = (gameId, eventId) => {
    const s = getState(gameId);
    const entry = s.pendingByEvent.get(eventId);
    if (!entry) return;
    s.pendingByEvent.delete(eventId);
    dispatchEvent(gameId, entry.row).catch(e => console.error('[BroadcastAnnouncer] dispatchEvent:', e));
  };

  // Ставит "виртуальный таймер" на delay ИГРОВЫХ мс. Если таймер матча сейчас не идёт — просто
  // запоминает остаток и ничего не планирует: реальный setTimeout появится только когда придёт
  // 'start' (см. resumePendingTimers). Так плашка физически не может всплыть, пока игра стоит.
  const scheduleAnnouncement = (gameId, row, delayMs) => {
    const s = getState(gameId);
    const entry = { remainingMs: delayMs, timeoutHandle: null, armedAt: null, row };
    s.pendingByEvent.set(row.id, entry);
    if (s.isRunning) {
      entry.armedAt = Date.now();
      entry.timeoutHandle = setTimeout(() => firePending(gameId, row.id), Math.max(0, entry.remainingMs));
    }
  };

  const pausePendingTimers = (gameId) => {
    const s = state[gameId];
    if (!s) return;
    for (const entry of s.pendingByEvent.values()) {
      if (!entry.timeoutHandle) continue;
      clearTimeout(entry.timeoutHandle);
      entry.remainingMs -= Date.now() - entry.armedAt;
      entry.timeoutHandle = null;
      entry.armedAt = null;
    }
  };

  const resumePendingTimers = (gameId) => {
    const s = state[gameId];
    if (!s) return;
    for (const [eventId, entry] of s.pendingByEvent.entries()) {
      if (entry.timeoutHandle) continue; // уже тикает (не должно случаться, но не трогаем)
      entry.armedAt = Date.now();
      entry.timeoutHandle = setTimeout(() => firePending(gameId, eventId), Math.max(0, entry.remainingMs));
    }
  };

  // Слушаем те же 'timer_action', что уходят к timerHandler.js (клиент шлёт один раз, слушателей
  // на событие может быть несколько) — только чтобы вести собственный счётчик "бегущих игровых мс"
  // и ставить на паузу/возобновлять ожидающие объявления. Сами ничего не транслируем и не решаем
  // за секретаря/таймер — чисто наблюдатель.
  const handleTimerAction = (gameId, action) => {
    if (!gameId || !action) return;
    const s = getState(gameId);
    if (action === 'start') {
      if (!s.isRunning) {
        s.isRunning = true;
        s.runSince = Date.now();
        resumePendingTimers(gameId);
      }
    } else if (action === 'stop' || action === 'change_period') {
      if (s.isRunning) {
        s.accumulatedRunningMs += Date.now() - s.runSince;
        s.isRunning = false;
        s.runSince = null;
        pausePendingTimers(gameId);
      }
    }
  };

  // Все голы/штрафы матча, включая ещё НЕ готовые (без автора/причины) — нужны все, чтобы
  // отмечать момент первого появления заготовки события (см. firstSeenRunningMs), а не только готовых.
  const fetchAllRows = async (gameId) => {
    try {
      return (await pool.query(EVENTS_QUERY, [gameId])).rows;
    } catch (e) {
      console.error(`[BroadcastAnnouncer] Ошибка загрузки событий (матч ${gameId}):`, e);
      return [];
    }
  };

  // Первый заход по этому матчу (после рестарта сервера, или кто-то впервые открыл трансляцию
  // посреди уже идущего матча с историей голов/штрафов) — помечаем всё, что уже готово, как
  // "обработанное", НЕ объявляя это разом, и подхватываем реальное состояние таймера (иначе,
  // если матч уже идёт, а 'start' был давно и в БД не синхронизирован — мы бы решили, что игра
  // стоит, и ни одно объявление никогда бы не всплыло).
  const seedBaseline = async (gameId) => {
    const s = getState(gameId);
    s.isRunning = isTimerCurrentlyRunning(gameId);
    if (s.isRunning) s.runSince = Date.now();

    const rows = await fetchAllRows(gameId);
    const now0 = getRunningMsNow(s);
    for (const row of rows) {
      s.firstSeenRunningMs.set(row.id, now0);
      if (isEligible(row)) s.processedEventIds.add(row.id);
    }
  };

  // Гарантирует, что seedBaseline запустится РОВНО ОДИН раз для этого матча, кто бы её первым
  // ни запросил. Без этого: если 'timer_action'/'trigger_obs_overlay' создаст state[gameId]
  // (через getState) раньше, чем придёт 'join_game', проверка "!state[gameId]" в join_game
  // решила бы, что посев уже был (хотя на деле его никто не запускал) — и вся история матча
  // при первой же checkForNewEvents объявилась бы разом.
  const ensureSeeded = (gameId) => {
    const s = getState(gameId);
    if (!s.seedingPromise) {
      s.seedingPromise = seedBaseline(gameId).catch(e => console.error('[BroadcastAnnouncer] seedBaseline:', e));
    }
    return s.seedingPromise;
  };

  // Сверяет свежие голы/штрафы с уже обработанными и ставит в очередь по-настоящему новые
  // (только что назначенный автор гола / только что выбранная причина штрафа). Раньше это
  // делал каждый браузер панели трансляции сам у себя — теперь решает сервер один раз, поэтому
  // работает независимо от того, открыта ли панель, и одинаково для всех, кто смотрит OBS.
  //
  // firstSeenRunningMs фиксирует, сколько игровых мс уже "набежало" в момент, когда мы В ПЕРВЫЙ
  // РАЗ увидели эту заготовку события — ещё БЕЗ автора/причины. Когда автора/причину назначили,
  // сравниваем не время "с начала матча", а именно игровое время, прошедшее с этого момента —
  // и оно НЕ идёт, пока таймер стоит (см. getRunningMsNow).
  const checkForNewEvents = async (gameId) => {
    await ensureSeeded(gameId); // без этого при неудачном порядке событий не было бы базовой линии вообще
    const s = getState(gameId);
    const rows = await fetchAllRows(gameId);
    const nowMs = getRunningMsNow(s);

    for (const row of rows) {
      if (!s.firstSeenRunningMs.has(row.id)) s.firstSeenRunningMs.set(row.id, nowMs);
      if (s.processedEventIds.has(row.id)) continue;
      if (!isEligible(row)) continue; // всё ещё без автора/причины — ждём дальше
      s.processedEventIds.add(row.id); // сразу помечаем — не рассматриваем повторно

      const { autoShowSettings } = await readOverlayParams(gameId);
      if (!autoShowSettings.enabled) continue;

      const age = nowMs - s.firstSeenRunningMs.get(row.id);
      if (age > (autoShowSettings.expiry ?? 45) * 1000) continue; // назначили автора/причину слишком поздно по ходу игры — молча пропускаем

      scheduleAnnouncement(gameId, row, (autoShowSettings.delay ?? 10) * 1000);
    }

    // Чистим firstSeenRunningMs от удалённых событий, чтобы карта не росла бесконечно за очень долгий матч.
    const currentIds = new Set(rows.map(r => r.id));
    for (const id of s.firstSeenRunningMs.keys()) {
      if (!currentIds.has(id)) s.firstSeenRunningMs.delete(id);
    }
  };

  io.on('connection', (socket) => {

    socket.on('join_game', (gameId) => {
      cancelEvictAnnouncer(gameId);
      // Комната общая с секретарём/трансляцией/OBS (setupTimerSockets тоже вызывает join
      // на этот же room-namespace). ensureSeeded сама гарантирует ОДИН запуск seedBaseline
      // на весь матч (кто бы её первым ни запросил) — повторные join_game от реконнектов
      // просто получат уже готовый промис и ничего не пересеют, не потеряв прогресс.
      ensureSeeded(gameId);
    });

    // Секретарь (или сама панель трансляции при ручном редактировании) сохранил гол/штраф —
    // проверяем, не появилось ли что-то новое для объявления.
    socket.on('game_updated', (data) => {
      if (!data?.gameId) return;
      checkForNewEvents(data.gameId).catch(e => console.error('[BroadcastAnnouncer] game_updated:', e));
    });
    socket.on('score_updated', (data) => {
      if (!data?.gameId) return;
      checkForNewEvents(data.gameId).catch(e => console.error('[BroadcastAnnouncer] score_updated:', e));
    });

    // Тот же 'timer_action', что обрабатывает timerHandler.js — здесь только для того, чтобы
    // держать свой собственный счётчик бегущего игрового времени (см. handleTimerAction).
    socket.on('timer_action', (payload) => {
      if (!payload?.gameId) return;
      handleTimerAction(payload.gameId, payload.action);
    });

    // Не рассылаем повторно (это уже делает timerHandler.js) — только читаем, чтобы держать
    // мьютекс звука в актуальном состоянии: интро/состав/событие — ровно один слот на матч.
    socket.on('trigger_obs_overlay', (data) => {
      if (!data?.gameId) return;
      const s = getState(data.gameId);
      if (data.type === 'audio') {
        // Интро — независимый канал, в голосовой мьютекс не входит.
        if (data.source === 'intro') return;
        if (data.action === 'play') { s.audioBusy = true; s.audioBusySource = data.source || null; }
        else if (data.action === 'stop') {
          // Очищаем мьютекс только если остановлен тот же источник, что его занял
          // (интро-stop не должен освобождать слот под состав/событие и наоборот).
          if (!data.source || data.source === s.audioBusySource) {
            s.audioBusy = false;
            s.audioBusySource = null;
          }
        }
      } else if (data.type === 'audio_ended') {
        s.audioBusy = false;
        s.audioBusySource = null;
      }
    });

    socket.on('leave_game', (gameId) => {
      setTimeout(() => scheduleEvictAnnouncer(gameId), 0);
    });
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (typeof room === 'string' && room.startsWith('game_')) {
          const gameId = room.slice(5);
          setTimeout(() => scheduleEvictAnnouncer(gameId), 0);
        }
      }
    });
  });
}
