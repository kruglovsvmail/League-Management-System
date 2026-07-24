import pool from '../config/db.js';
import { getLeagueIdForGame } from '../utils/leagueLookup.js';
import { getPeriodLimits } from '../utils/periodLimits.js';
import { arenaAudioFileExists } from '../utils/arenaAudioFiles.js';
import { generateArenaEventAudio } from '../controllers/ttsArenaController.js';

// IN-MEMORY хранилище таймеров.
// Теперь хранит { accumulatedSeconds, startedAt, isRunning, ... }
const activeTimers = {};

// Единственная точка чтения извне (broadcastAnnouncer.js): нужно знать, идёт ли СЕЙЧАС матч,
// когда модуль начинает следить за игрой не с начала (перезапуск сервера / первый заход
// посреди уже идущего матча) — 'start' не пишется в БД (см. importantActions ниже), поэтому
// game_timers.is_running там может быть неактуален, пока матч не остановят. Больше ничего
// из внутреннего состояния наружу не отдаём — это не общая память, а разовое чтение факта.
export function isTimerCurrentlyRunning(gameId) {
  return !!activeTimers[gameId]?.isRunning;
}

// Вспомогательная функция для вычисления точного времени на ДАННЫЙ МОМЕНТ
const calculateCurrentSeconds = (timer) => {
  if (!timer.isRunning || !timer.startedAt) return timer.accumulatedSeconds || 0;
  return (timer.accumulatedSeconds || 0) + Math.floor((Date.now() - timer.startedAt) / 1000);
};

const syncTimerToDB = async (gameId, timerObj) => {
  try {
    // Для БД нам нужно вычислить реальные секунды на момент сохранения
    const currentSeconds = calculateCurrentSeconds(timerObj);

    await pool.query(`
      INSERT INTO game_timers (game_id, time_seconds, is_running, controller, penalties, period_length, ot_length, so_length, periods_count, period, auto_stop_on_event, arena_announcer, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (game_id) DO UPDATE
      SET time_seconds = EXCLUDED.time_seconds,
          is_running = EXCLUDED.is_running,
          controller = EXCLUDED.controller,
          penalties = EXCLUDED.penalties,
          period_length = EXCLUDED.period_length,
          ot_length = EXCLUDED.ot_length,
          so_length = EXCLUDED.so_length,
          periods_count = EXCLUDED.periods_count,
          period = EXCLUDED.period,
          auto_stop_on_event = EXCLUDED.auto_stop_on_event,
          arena_announcer = EXCLUDED.arena_announcer,
          updated_at = NOW()
    `, [
      gameId,
      currentSeconds,
      timerObj.isRunning || false,
      timerObj.controller || 'secretary',
      JSON.stringify(timerObj.penalties || []),
      timerObj.periodLength ?? 20,
      timerObj.otLength ?? 5,
      timerObj.soLength ?? 3,
      timerObj.periodsCount ?? 3,
      timerObj.period || '1',
      timerObj.autoStopOnEvent ?? false,
      JSON.stringify(timerObj.arenaAnnouncer || {})
    ]);
  } catch (err) {
    console.error(`Ошибка сохранения таймера в БД (Матч ${gameId}):`, err.message);
  }
};

export default function setupTimerSockets(io) {

  // ── СЕРВЕРНЫЙ АВТОПИЛОТ ГРАФИКИ ──────────────────────────────────────────
  // Крутится на сервере (не в панели) → работает независимо от режиссёров, синхронен для всех,
  // переживает закрытие панели и перезапуск сервера (возобновляется из БД при заходе).
  const autopilotTimers = {}; // gameId -> { steps, duration, loop, index, interval }

  const persistAutopilotRuntime = async (gameId, running) => {
    const ap = autopilotTimers[gameId];
    const autopilot = ap ? { steps: ap.steps, duration: ap.duration, loop: ap.loop, current_index: ap.index } : null;
    const step = (ap && running) ? ap.steps[ap.index] : null;
    const staticOverlay = step ? { type: step.type, data: step.data ?? null } : null;
    try {
      await pool.query(`
        INSERT INTO game_overlay_state (game_id, autopilot_running, static_overlay, autopilot, updated_at)
        VALUES ($1, $2, $3, COALESCE($4::jsonb, '{}'::jsonb), NOW())
        ON CONFLICT (game_id) DO UPDATE SET
          autopilot_running = $2,
          static_overlay = CASE WHEN $5 THEN $3 ELSE game_overlay_state.static_overlay END,
          autopilot = CASE WHEN $4 IS NULL THEN game_overlay_state.autopilot ELSE $4::jsonb END,
          updated_at = NOW()
      `, [gameId, running, staticOverlay ? JSON.stringify(staticOverlay) : null,
          autopilot ? JSON.stringify(autopilot) : null, !!staticOverlay]);
    } catch (e) { console.error('persistAutopilotRuntime:', e); }
  };

  const showAutopilotStep = (gameId) => {
    const ap = autopilotTimers[gameId];
    if (!ap || !ap.steps.length) return;
    const step = ap.steps[ap.index];
    if (!step) return;
    const data = step.data ?? null;
    io.to(`game_${gameId}`).emit('trigger_obs_overlay', { action: 'show', type: step.type, gameId, duration: 'infinite', data });
    io.to(`game_${gameId}`).emit('overlay_state', {
      staticOverlay: { type: step.type, data },
      autopilotRunning: true,
      autopilot: { current_index: ap.index }, // конфиг (steps) не шлём вживую — без эхо массива
    });
    persistAutopilotRuntime(gameId, true);
  };

  // Останавливает автопилот и явно прячет то, что он последним показывал. Раньше тут
  // рассылался только overlay_state{autopilotRunning:false} — OBS-оверлей не умеет
  // интерпретировать это поле (оно нужно только индикатору в панели режиссёра), поэтому
  // последняя показанная плашка (например, составы) молча зависала в эфире навсегда,
  // пока её не сменяла следующая явная show/hide-команда. persistAutopilotRuntime тоже
  // не помогал: при running=false он не трогал static_overlay в БД, оставляя там
  // "запечённые" данные последнего шага — поэтому и переоткрытие/реконнект оверлея не
  // спасали.
  const stopAutopilot = async (gameId) => {
    const ap = autopilotTimers[gameId];
    if (ap?.interval) clearInterval(ap.interval);
    const lastStep = ap?.steps?.[ap.index] || null;
    delete autopilotTimers[gameId];

    if (lastStep) {
      io.to(`game_${gameId}`).emit('trigger_obs_overlay', { action: 'hide', type: lastStep.type, gameId });
    }

    try {
      await pool.query(`
        UPDATE game_overlay_state SET autopilot_running = false, static_overlay = NULL, updated_at = NOW()
        WHERE game_id = $1
      `, [gameId]);
    } catch (e) { console.error('persistAutopilotStopped:', e); }

    io.to(`game_${gameId}`).emit('overlay_state', { autopilotRunning: false, staticOverlay: null });
  };

  const advanceAutopilot = (gameId) => {
    const ap = autopilotTimers[gameId];
    if (!ap) return;
    const next = ap.index + 1;
    if (next >= ap.steps.length) {
      if (ap.loop && ap.steps.length > 1) ap.index = 0;
      else { stopAutopilot(gameId); return; }
    } else {
      ap.index = next;
    }
    showAutopilotStep(gameId);
  };

  const startAutopilot = (gameId, steps, duration, loop, startIndex = 0) => {
    if (!Array.isArray(steps) || steps.length === 0) return;
    const prev = autopilotTimers[gameId];
    if (prev?.interval) clearInterval(prev.interval);
    const dur = Math.max(3, Number(duration) || 15);
    const idx = Math.min(Math.max(0, Number(startIndex) || 0), steps.length - 1);
    autopilotTimers[gameId] = { steps, duration: dur, loop: !!loop, index: idx, interval: null };
    showAutopilotStep(gameId);
    autopilotTimers[gameId].interval = setInterval(() => advanceAutopilot(gameId), dur * 1000);
  };

  // Комната опустела (нет панелей и OBS) — гасим тикающий интервал, но в БД оставляем running=true.
  // При следующем заходе автопилот возобновится из БД (см. join_game). Так не течёт ОЗУ.
  const pauseAutopilotIfRoomEmpty = (gameId) => {
    const room = io.sockets.adapter.rooms.get(`game_${gameId}`);
    if (room && room.size > 0) return;
    const ap = autopilotTimers[gameId];
    if (ap?.interval) clearInterval(ap.interval);
    delete autopilotTimers[gameId];
  };

  // ── ДИКТОР АРЕНЫ: серверная очередь оповещений ──────────────────────────
  // Единый источник истины на сервере (не зависит от вкладки/устройства секретаря):
  // сервер сам решает КОГДА и ЧТО озвучить, клиент — тупой приёмник события 'arena_play'.
  const announcerTimers = {}; // gameId -> { interval, queue, dispatchedAt, lastDispatched, processedFired, processedEventIds, fileExistCache, leagueId }
  const ANNOUNCER_SERIALIZE_GAP_MS = 13000; // минимальный зазор между не-сиренными фразами (эвристика длины фразы)
  const S3_BASE = 'https://s3.twcstorage.ru/hockeyeco-uploads';

  const getAnnouncerState = (gameId) => {
    if (!announcerTimers[gameId]) {
      announcerTimers[gameId] = {
        interval: null,
        ticking: false,
        queue: [],
        dispatchedAt: 0,
        lastDispatched: null,
        processedFired: {},
        processedEventIds: new Set(),
        fileExistCache: {},
        leagueId: undefined, // undefined = ещё не резолвили, null = лига не найдена
        gameEvents: null, // кэш голов/штрафов матча — null = ещё не загружен
      };
    }
    return announcerTimers[gameId];
  };

  const resolveAnnouncerLeagueId = async (gameId, state) => {
    if (state.leagueId !== undefined) return state.leagueId;
    try {
      state.leagueId = await getLeagueIdForGame(gameId);
    } catch (e) {
      state.leagueId = null;
    }
    return state.leagueId;
  };

  const checkStaticAudioFile = async (state, leagueId, filename) => {
    if (!leagueId) return false;
    if (filename in state.fileExistCache) return state.fileExistCache[filename];
    const exists = await arenaAudioFileExists(leagueId, filename);
    state.fileExistCache[filename] = exists;
    return exists;
  };

  const enqueueAnnouncement = (state, item) => {
    state.queue.push(item);
    state.queue.sort((a, b) => a.priority - b.priority);
  };

  const dispatchArenaAudio = (gameId, state, item) => {
    io.to(`game_${gameId}`).emit('arena_play', { url: item.url });
    state.dispatchedAt = Date.now();
    state.lastDispatched = item;
  };

  // Приоритет: 1=сирена, 2=гол, 3=штраф, 4=предупреждения о конце периода.
  // Прерывает текущую фразу ТОЛЬКО сирена; прерванная фраза НЕ доигрывается (иначе она
  // звучит уже в следующем периоде) — сирена просто обрывает её.
  const dispatchFromAnnouncerQueue = (gameId, state) => {
    const now = Date.now();

    const sirenIdx = state.queue.findIndex(i => i.priority === 1);
    if (sirenIdx !== -1) {
      const [siren] = state.queue.splice(sirenIdx, 1);
      dispatchArenaAudio(gameId, state, siren);
      return;
    }

    if (now - state.dispatchedAt < ANNOUNCER_SERIALIZE_GAP_MS) return;

    const readyIdx = state.queue.findIndex(i => !i.readyAt || i.readyAt <= now);
    if (readyIdx === -1) return;
    const [item] = state.queue.splice(readyIdx, 1);
    dispatchArenaAudio(gameId, state, item);
  };

  const announcerTick = async (gameId) => {
    const timer = activeTimers[gameId];
    const state = announcerTimers[gameId];
    if (!timer || !state) return;
    if (!timer.isRunning || timer.period === 'SO') return;

    const settings = timer.arenaAnnouncer || {};
    const limits = getPeriodLimits(timer.period, timer.periodLength, timer.otLength, timer.periodsCount);
    if (limits.end <= 0) return;

    const remaining = limits.end - calculateCurrentSeconds(timer);
    const leagueId = await resolveAnnouncerLeagueId(gameId, state);

    if (settings.endSiren && remaining <= 2 && remaining >= 1) {
      const key = `${timer.period}_siren`;
      if (!state.processedFired[key]) {
        state.processedFired[key] = true;
        if (await checkStaticAudioFile(state, leagueId, 'end.mp3')) {
          enqueueAnnouncement(state, { priority: 1, kind: 'siren', url: `${S3_BASE}/audio/league-${leagueId}/end.mp3?t=${Date.now()}` });
        }
      }
    }

    if (settings.warn1min && remaining <= 63 && remaining >= 61) {
      const periodNum = parseInt(timer.period, 10);
      const periodsCount = timer.periodsCount ?? 3;
      if (!isNaN(periodNum) && periodNum >= 1 && periodNum <= periodsCount) {
        const key = `${timer.period}_warn1min`;
        if (!state.processedFired[key]) {
          state.processedFired[key] = true;
          const filename = `left-1min-${periodNum}.mp3`;
          if (await checkStaticAudioFile(state, leagueId, filename)) {
            enqueueAnnouncement(state, { priority: 4, kind: 'warn1min', url: `${S3_BASE}/audio/league-${leagueId}/${filename}?t=${Date.now()}` });
          }
        }
      }
    }

    if (settings.warn2min && remaining <= 123 && remaining >= 121) {
      const periodsCount = timer.periodsCount ?? 3;
      if (String(timer.period) === String(periodsCount)) {
        const key = `${timer.period}_warn2min`;
        if (!state.processedFired[key]) {
          state.processedFired[key] = true;
          if (await checkStaticAudioFile(state, leagueId, 'left-2min.mp3')) {
            enqueueAnnouncement(state, { priority: 4, kind: 'warn2min', url: `${S3_BASE}/audio/league-${leagueId}/left-2min.mp3?t=${Date.now()}` });
          }
        }
      }
    }

    await checkGameEventsForAnnouncement(gameId);
    dispatchFromAnnouncerQueue(gameId, state);
  };

  const startAnnouncerTicker = (gameId) => {
    const state = getAnnouncerState(gameId);
    if (state.interval) return;
    state.interval = setInterval(() => {
      if (state.ticking) return;
      state.ticking = true;
      announcerTick(gameId)
        .catch(e => console.error(`[ArenaAnnouncer] Ошибка тика (Матч ${gameId}):`, e))
        .finally(() => { state.ticking = false; });
    }, 1000);
  };

  // Комната опустела — гасим интервал и удаляем очередь. Состояние живёт только в памяти,
  // тот же принятый trade-off, что у автопилота графики (pauseAutopilotIfRoomEmpty).
  const stopAnnouncerIfRoomEmpty = (gameId) => {
    const room = io.sockets.adapter.rooms.get(`game_${gameId}`);
    if (room && room.size > 0) return;
    const state = announcerTimers[gameId];
    if (state?.interval) clearInterval(state.interval);
    delete announcerTimers[gameId];
  };

  // activeTimers никогда не чистился — на миллионе матчей это утечка в сотни МБ.
  // При опустении комнаты сохраняем текущее состояние в БД (включая накопленные секунды
  // если таймер идёт) и выгружаем из памяти. При следующем join_game reload из БД.
  // Отложенное вытеснение таймера: 120 минут после того как комната опустела.
  // Текущие матчи в полной безопасности (кто-то зайдёт — таймер отменится).
  // Старые/завершённые матчи очистятся из памяти через 2 часа простоя.
  const EVICT_DELAY_MS = 120 * 60 * 1000;
  const pendingEvictions = {}; // gameId -> timeoutId

  const scheduleEvictTimer = (gameId) => {
    if (pendingEvictions[gameId]) clearTimeout(pendingEvictions[gameId]);
    const room = io.sockets.adapter.rooms.get(`game_${gameId}`);
    if (room && room.size > 0) return; // кто-то уже зашёл пока мы сюда дошли
    pendingEvictions[gameId] = setTimeout(async () => {
      delete pendingEvictions[gameId];
      const timer = activeTimers[gameId];
      if (!timer) return;
      await syncTimerToDB(gameId, timer).catch(e => console.error('evictTimer:', e));
      delete activeTimers[gameId];
    }, EVICT_DELAY_MS);
  };

  const cancelEvictTimer = (gameId) => {
    if (pendingEvictions[gameId]) {
      clearTimeout(pendingEvictions[gameId]);
      delete pendingEvictions[gameId];
    }
  };

  // Кэш голов/штрафов матча для тикера диктора: не бьём БД каждую секунду — только
  // при 'join_game', 'game_updated' (что-то сохранили/поправили) и при сбросе диктора.
  // Само решение "озвучивать ли сейчас" — в checkGameEventsForAnnouncement, привязано
  // к позиции ТАЙМЕРА, а не к моменту прихода сокет-события (это и даёт "прожить матч
  // заново": отмотал таймер, сбросил диктора, запустил — события всплывают по ходу тика).
  const GAME_EVENTS_QUERY = `
    SELECT
      ge.id, ge.time_seconds, ge.event_type, ge.penalty_violation, ge.penalty_minutes, ge.penalty_class,
      su.id as primary_player_id, su.last_name as primary_last_name, su.first_name as primary_first_name,
      su.pronunciation as primary_pronunciation,
      gr_su.jersey_number as primary_jersey_number, gr_su.position_in_line as primary_position,
      a1.last_name as assist1_last_name, a1.first_name as assist1_first_name, a1.pronunciation as assist1_pronunciation,
      gr_a1.jersey_number as assist1_jersey_number,
      a2.last_name as assist2_last_name, a2.first_name as assist2_first_name, a2.pronunciation as assist2_pronunciation,
      gr_a2.jersey_number as assist2_jersey_number,
      t.name as team_name, t.pronunciation as team_pronunciation
    FROM game_events ge
    LEFT JOIN users su ON COALESCE(ge.scorer_id, ge.penalty_player_id) = su.id
    LEFT JOIN game_rosters gr_su ON gr_su.game_id = ge.game_id AND gr_su.player_id = su.id AND gr_su.team_id = ge.team_id
    LEFT JOIN users a1 ON ge.assist1_id = a1.id
    LEFT JOIN game_rosters gr_a1 ON gr_a1.game_id = ge.game_id AND gr_a1.player_id = a1.id AND gr_a1.team_id = ge.team_id
    LEFT JOIN users a2 ON ge.assist2_id = a2.id
    LEFT JOIN game_rosters gr_a2 ON gr_a2.game_id = ge.game_id AND gr_a2.player_id = a2.id AND gr_a2.team_id = ge.team_id
    LEFT JOIN teams t ON t.id = ge.team_id
    WHERE ge.game_id = $1 AND ge.event_type IN ('goal', 'penalty')
    ORDER BY ge.time_seconds ASC
  `;

  const refreshGameEventsCache = async (gameId) => {
    const state = getAnnouncerState(gameId);
    try {
      const res = await pool.query(GAME_EVENTS_QUERY, [gameId]);
      state.gameEvents = res.rows;
    } catch (e) {
      console.error(`[ArenaAnnouncer] Ошибка загрузки событий (Матч ${gameId}):`, e);
    }
  };

  // Вызывается из тика раз в секунду — сравнивает позицию ТАЙМЕРА с временем события,
  // а не момент вызова с моментом сохранения. Событие озвучивается, как только таймер
  // до него доходит (в т.ч. при повторном проигрывании матча с нуля).
  const checkGameEventsForAnnouncement = async (gameId) => {
    const timer = activeTimers[gameId];
    if (!timer?.arenaAnnouncer?.goalAnnounce) return;
    const state = getAnnouncerState(gameId);
    if (!state.gameEvents) return; // кэш ещё не загружен — подхватим на следующем тике

    const goalDelay = timer.arenaAnnouncer.goalDelay ?? 5;
    const goalExpiry = timer.arenaAnnouncer.goalExpiry ?? 40;
    const currentSeconds = calculateCurrentSeconds(timer);

    for (const row of state.gameEvents) {
      if (currentSeconds < row.time_seconds) continue; // таймер ещё не дошёл до этого момента
      // Гол без автора озвучивать нечего; штраф — не важно, назначен ли виновник
      // (командный штраф), важно чтобы была причина — она обязательна в форме.
      const eligible = row.event_type === 'goal' ? !!row.primary_player_id : !!row.penalty_violation;
      if (!eligible) continue;
      if (state.processedEventIds.has(row.id)) continue;
      state.processedEventIds.add(row.id); // помечаем сразу — не проверять повторно, даже если истекло

      const elapsed = currentSeconds - (row.time_seconds ?? 0);
      if (elapsed > goalExpiry) continue; // таймер проскочил далеко вперёд — молча пропускаем

      const leagueId = await resolveAnnouncerLeagueId(gameId, state);
      const eventPayload = {
        event_type: row.event_type,
        player_last_name: row.primary_last_name,
        player_first_name: row.primary_first_name,
        pronunciation: row.primary_pronunciation || null,
        jersey_number: row.primary_jersey_number ?? '',
        is_goalie: row.primary_position === 'G',
        team_name: row.team_name,
        team_pronunciation: row.team_pronunciation || null,
        penalty_class: row.penalty_class,
        penalty_minutes: row.penalty_minutes,
        penalty_violation: row.penalty_violation,
        assist1_last_name: row.assist1_last_name,
        assist1_first_name: row.assist1_first_name,
        assist1_pronunciation: row.assist1_pronunciation || null,
        assist1_jersey_number: row.assist1_jersey_number,
        assist2_last_name: row.assist2_last_name,
        assist2_first_name: row.assist2_first_name,
        assist2_pronunciation: row.assist2_pronunciation || null,
        assist2_jersey_number: row.assist2_jersey_number,
      };

      try {
        const url = await generateArenaEventAudio({
          gameId, leagueId, eventId: `arena-${gameId}-event-${row.id}`, eventPayload
        });
        if (!url) continue;
        enqueueAnnouncement(state, {
          priority: row.event_type === 'goal' ? 2 : 3,
          kind: row.event_type,
          url,
          readyAt: Date.now() + goalDelay * 1000,
        });
      } catch (e) {
        console.error(`[ArenaAnnouncer] Ошибка генерации TTS (Матч ${gameId}, событие ${row.id}):`, e);
      }
    }
  };

  io.on('connection', (socket) => {

    socket.on('join_game', async (gameId) => {
      socket.join(`game_${gameId}`);
      cancelEvictTimer(gameId); // кто-то зашёл — отменяем отложенное вытеснение
      // Сразу отдаём текущий счётчик подключённых оверлеев этому клиенту (панель не ждёт следующего события).
      const obsCount = io.sockets.adapter.rooms.get(`obs_${gameId}`)?.size ?? 0;
      socket.emit('overlay_count', { gameId, count: obsCount });
      
      if (!activeTimers[gameId]) {
        try {
          // track_plus_minus читаем ЖИВЫМ из divisions (не застывший снимок game_timers,
          // скопированный при создании матча) — актуально даже если лига поменяла флаг позже.
          const res = await pool.query(`
            SELECT gt.*,
                   CASE WHEN g.stage_type = 'playoff' THEN d.playoff_track_plus_minus ELSE d.reg_track_plus_minus END AS live_track_plus_minus
            FROM game_timers gt
            JOIN games g ON g.id = gt.game_id
            LEFT JOIN divisions d ON d.id = g.division_id
            WHERE gt.game_id = $1
          `, [gameId]);
          if (res.rows.length > 0) {
            const row = res.rows[0];
            activeTimers[gameId] = {
              accumulatedSeconds: row.time_seconds || 0,
              startedAt: row.is_running ? Date.now() : null,
              isRunning: row.is_running || false,
              controller: row.controller || 'secretary',
              penalties: typeof row.penalties === 'string' ? JSON.parse(row.penalties) : (row.penalties || []),
              periodLength: row.period_length ?? 20,
              otLength: row.ot_length ?? 5,
              soLength: row.so_length ?? 3,
              periodsCount: row.periods_count ?? 3,
              period: row.period || '1',
              trackPlusMinus: row.live_track_plus_minus ?? false,
              autoStopOnEvent: row.auto_stop_on_event ?? false,
              arenaAnnouncer: row.arena_announcer || {}
            };
          } else {
            activeTimers[gameId] = { accumulatedSeconds: 0, startedAt: null, period: '1', isRunning: false, controller: 'secretary', penalties: [], periodLength: 20, otLength: 5, soLength: 3, periodsCount: 3, trackPlusMinus: false, autoStopOnEvent: false, arenaAnnouncer: {} };
          }
        } catch (e) {
          console.error('Ошибка загрузки таймера при подключении:', e);
          activeTimers[gameId] = { accumulatedSeconds: 0, startedAt: null, period: '1', isRunning: false, controller: 'secretary', penalties: [], periodLength: 20, otLength: 5, soLength: 3, periodsCount: 3, trackPlusMinus: false, autoStopOnEvent: false, arenaAnnouncer: {} };
        }
      }

      // Добавляем серверное время для калибровки на клиенте
      const stateToEmit = {
        ...activeTimers[gameId],
        serverTime: Date.now()
      };
      socket.emit('timer_state', stateToEmit);

      // Состояние оверлеев OBS (что реально висит) — чтобы переоткрытая панель не была в рассинхроне
      try {
        const ovRes = await pool.query('SELECT * FROM game_overlay_state WHERE game_id = $1', [gameId]);
        const ov = ovRes.rows[0] || null;
        socket.emit('overlay_state', ov ? {
          audioVolume:       ov.audio_volume,
          introPlaying:      ov.intro_playing,
          scoreboardVisible: ov.scoreboard_visible,
          staticOverlay:     ov.static_overlay,      // { type, data } | null
          autopilotRunning:  ov.autopilot_running,
          autopilot:         ov.autopilot,           // { steps, duration, loop, current_index }
          params:            ov.params,              // параметры плашек и отсчёты
        } : null);

        // Возобновление серверного автопилота: в БД running=true, но активного интервала нет
        // (сервер перезапускался / комната была пустой) → поднимаем цикл с того же шага.
        if (ov && ov.autopilot_running && !autopilotTimers[gameId]) {
          const ap = ov.autopilot;
          if (ap && Array.isArray(ap.steps) && ap.steps.length > 0) {
            startAutopilot(gameId, ap.steps, ap.duration, ap.loop, ap.current_index || 0);
          }
        }
      } catch (e) {
        console.error('Ошибка загрузки overlay_state при подключении:', e);
        socket.emit('overlay_state', null);
      }

      refreshGameEventsCache(gameId).catch(e => console.error(`[ArenaAnnouncer] Ошибка первичной загрузки событий (Матч ${gameId}):`, e));
      startAnnouncerTicker(gameId);
    });

    // Частичный upsert состояния оверлеев. Панель — единственный «писатель»; шлёт только изменённые поля.
    socket.on('update_overlay_state', async (data) => {
      if (!data?.gameId) return;
      const fieldMap = {
        audioVolume:       'audio_volume',
        introPlaying:      'intro_playing',
        scoreboardVisible: 'scoreboard_visible',
        staticOverlay:     'static_overlay',
        autopilotRunning:  'autopilot_running',
        autopilot:         'autopilot',
        params:            'params',
      };
      const jsonCols = new Set(['static_overlay', 'autopilot', 'params']);
      const mergeCols = new Set(['autopilot', 'params']); // shallow-merge, чтобы частичные апдейты не затирали чужие ключи

      const cols = [], vals = [], updates = [];
      let i = 2;
      for (const [key, col] of Object.entries(fieldMap)) {
        if (!(key in data)) continue; // поле не передано — не трогаем (сохраняем текущее значение)
        const raw = data[key];
        cols.push(col);
        vals.push(jsonCols.has(col) ? (raw == null ? null : JSON.stringify(raw)) : raw);
        // Общие jsonb (autopilot, params) пишут и панель, и сервер по разным ключам —
        // не заменяем целиком, а SHALLOW-мержим, чтобы не затереть чужие ключи.
        updates.push(mergeCols.has(col)
          ? `${col} = COALESCE(game_overlay_state.${col}, '{}'::jsonb) || EXCLUDED.${col}`
          : `${col} = $${i}`);
        i++;
      }
      if (cols.length === 0) return;

      const placeholders = cols.map((_, idx) => `$${idx + 2}`).join(', ');
      const query = `
        INSERT INTO game_overlay_state (game_id, ${cols.join(', ')}, updated_at)
        VALUES ($1, ${placeholders}, NOW())
        ON CONFLICT (game_id) DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()
      `;
      try {
        await pool.query(query, [data.gameId, ...vals]);

        // Рассылаем актуальный снимок ВСЕМ в комнате, КРОМЕ отправителя (он уже применил у себя).
        // Так вторая панель режиссёра и OBS-оверлей сразу видят изменение (мульти-режиссёр).
        const fresh = await pool.query('SELECT * FROM game_overlay_state WHERE game_id = $1', [data.gameId]);
        const ov = fresh.rows[0];
        if (ov) {
          socket.to(`game_${data.gameId}`).emit('overlay_state', {
            audioVolume:       ov.audio_volume,
            introPlaying:      ov.intro_playing,
            scoreboardVisible: ov.scoreboard_visible,
            staticOverlay:     ov.static_overlay,
            autopilotRunning:  ov.autopilot_running,
            autopilot:         ov.autopilot,
            params:            ov.params,
          });
        }
      } catch (e) {
        console.error('Ошибка update_overlay_state:', e);
      }
    });

    socket.on('score_updated', (data) => { if (data?.gameId) io.to(`game_${data.gameId}`).emit('score_updated'); });
    socket.on('game_updated', (data) => {
      if (!data?.gameId) return;
      io.to(`game_${data.gameId}`).emit('game_updated');
      // Обновляем кэш событий сразу (не ждём следующего тика) — само решение "озвучивать
      // ли уже сейчас" всё равно смотрит на позицию таймера, а не на этот момент.
      refreshGameEventsCache(data.gameId)
        .then(() => checkGameEventsForAnnouncement(data.gameId))
        .catch(e => console.error(`[ArenaAnnouncer] Ошибка обновления событий (Матч ${data.gameId}):`, e));
    });
    socket.on('trigger_obs_overlay', (data) => { if (data?.gameId) io.to(`game_${data.gameId}`).emit('trigger_obs_overlay', data); });

    // Кнопка «Обновить оверлей» из панели трансляции — сознательно НЕ io.to(room), а io.emit
    // всем подключённым сокетам. Комнатная рассылка не достала бы OBS, если он уже тихо выпал
    // из комнаты (обрыв сети/сон компьютера) — тот же баг, из-за которого команда "стоп" на
    // интро когда-то не доходила. Глобальная рассылка достаёт его в любом случае, а клиент сам
    // фильтрует по gameId и по этому сигналу заново join_game + перечитывает состояние с сервера.
    socket.on('force_resync_overlay', (data) => {
      if (data?.gameId) io.emit('force_resync_overlay', { gameId: data.gameId });
    });

    // OBS-оверлей подтверждает, что реально показывается в эфире — панели получают и
    // сравнивают с activeStaticOverlay: расхождение → жёлтое предупреждение на кнопке.
    socket.on('overlay_confirmed', (data) => {
      if (data?.gameId) io.to(`game_${data.gameId}`).emit('overlay_confirmed', { gameId: data.gameId, type: data.type ?? null });
    });

    // OBS-оверлей регистрируется в отдельной комнате — панель видит точный счётчик подключённых оверлеев.
    const emitOverlayCount = (gameId) => {
      const count = io.sockets.adapter.rooms.get(`obs_${gameId}`)?.size ?? 0;
      io.to(`game_${gameId}`).emit('overlay_count', { gameId, count });
    };
    socket.on('join_obs_overlay', (gameId) => {
      if (!gameId) return;
      socket.join(`obs_${gameId}`);
      emitOverlayCount(gameId);
    });

    // Серверный автопилот: панель присылает уже разрешённый плейлист (steps с данными) + duration + loop.
    socket.on('autopilot_start', (data) => {
      if (data?.gameId) startAutopilot(data.gameId, data.steps, data.duration, data.loop, 0);
    });
    socket.on('autopilot_stop', (data) => {
      if (data?.gameId) stopAutopilot(data.gameId);
    });

    socket.on('timer_action', async (payload) => {
      const { gameId, action, timerData, penaltyData, penaltyId, value } = payload;
      
      if (!activeTimers[gameId]) {
        activeTimers[gameId] = { accumulatedSeconds: 0, startedAt: null, period: '1', isRunning: false, controller: 'secretary', penalties: [], periodLength: 20, otLength: 5, soLength: 3, periodsCount: 3, trackPlusMinus: false, autoStopOnEvent: false, arenaAnnouncer: {} };
      }

      const timer = activeTimers[gameId];

      // ВСЕГДА обновляем безопасные данные, если они пришли (включая период и настройки)
      // Вытаскиваем seconds и isRunning, чтобы они случайно не перетерли логику Delta Time
      if (timerData) {
        const { seconds, isRunning, startedAt, accumulatedSeconds, ...safeData } = timerData;
        Object.assign(timer, safeData);
      }

      // --- ЛОГИКА DELTA TIME ---
      if (action === 'start') {
        if (!timer.isRunning) {
          timer.isRunning = true;
          timer.startedAt = Date.now();
        }
      } 
      else if (action === 'stop') {
        if (timer.isRunning) {
          // При остановке жестко фиксируем, сколько секунд успело набежать
          timer.accumulatedSeconds += Math.floor((Date.now() - timer.startedAt) / 1000);
          timer.isRunning = false;
          timer.startedAt = null;
        }
      } 
      else if (action === 'set_time') {
        // Ручная коррекция времени секретарем
        const newSecs = timerData?.seconds !== undefined ? timerData.seconds : value;
        timer.accumulatedSeconds = newSecs;
        if (timer.isRunning) {
           timer.startedAt = Date.now(); // Сбрасываем якорь времени
        }
      }
      else if (action === 'adjust_time') {
        const delta = timerData?.delta || 0;
        if (timer.isRunning) {
          timer.accumulatedSeconds += Math.floor((Date.now() - timer.startedAt) / 1000);
          timer.startedAt = Date.now();
        }
        timer.accumulatedSeconds = Math.max(0, timer.accumulatedSeconds + delta);
      }
      else if (action === 'change_period') {
        // Специфичная логика для смены периода: сброс времени и остановка
        if (timerData?.seconds !== undefined) {
           timer.accumulatedSeconds = timerData.seconds;
        }
        timer.isRunning = false;
        timer.startedAt = null;
      }

      // Обработка специфических экшенов (штрафы и делегирование)
      if (action === 'delegate') {
        timer.controller = value; 
      } else if (action === 'add_penalty' && penaltyData) {
        if (!timer.penalties) timer.penalties = [];
        timer.penalties.push(penaltyData);
      } else if (action === 'toggle_penalty' && penaltyId) {
        const p = timer.penalties?.find(x => x.id === penaltyId);
        if (p) p.isRunning = !p.isRunning;
      } else if (action === 'remove_penalty' && penaltyId) {
        timer.penalties = timer.penalties?.filter(x => x.id !== penaltyId);
      } else if (action === 'reset_announcer') {
        // Полный сброс памяти диктора арены этого матча: дедуп голов/штрафов и статичных
        // триггеров (сирена/предупреждения), очередь озвучки. Не трогает счёт/время/БД.
        // Позволяет "прожить" матч заново — отмотать таймер и нажать эту кнопку перед стартом.
        const state = announcerTimers[gameId];
        if (state) {
          state.processedFired = {};
          state.processedEventIds = new Set();
          state.queue = [];
          state.dispatchedAt = 0;
          state.lastDispatched = null;
          refreshGameEventsCache(gameId).catch(e => console.error(`[ArenaAnnouncer] Ошибка обновления событий при сбросе (Матч ${gameId}):`, e));
        }
      }

      // Отправляем состояние всем клиентам, обязательно прикрепляя точное время сервера
      const stateToEmit = {
        ...timer,
        serverTime: Date.now()
      };
      io.to(`game_${gameId}`).emit('timer_state', stateToEmit);

      // Спасаем в БД только при важных событиях (sync и тики игнорируем)
      const importantActions = [
        'stop', 'set_time', 'adjust_time', 'set_period', 'change_period', 'update_settings', 'delegate',
        'add_penalty', 'toggle_penalty', 'remove_penalty'
      ];

      if (importantActions.includes(action)) {
        syncTimerToDB(gameId, timer);
      }
    });

    socket.on('leave_game', (gameId) => {
      socket.leave(`game_${gameId}`);
      setTimeout(() => pauseAutopilotIfRoomEmpty(gameId), 0);
      setTimeout(() => stopAnnouncerIfRoomEmpty(gameId), 0);
      setTimeout(() => scheduleEvictTimer(gameId), 0);
    });

    // Дисконнект сокета (закрыли вкладку/OBS): на 'disconnecting' комнаты ещё доступны.
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (typeof room === 'string' && room.startsWith('game_')) {
          const gameId = room.slice(5);
          setTimeout(() => pauseAutopilotIfRoomEmpty(gameId), 0);
          setTimeout(() => stopAnnouncerIfRoomEmpty(gameId), 0);
          setTimeout(() => scheduleEvictTimer(gameId), 0);
        }
        if (typeof room === 'string' && room.startsWith('obs_')) {
          const gameId = room.slice(4);
          setTimeout(() => emitOverlayCount(gameId), 50);
        }
      }
    });

  });
}