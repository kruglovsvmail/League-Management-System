import pool from '../config/db.js';

// IN-MEMORY хранилище таймеров. 
// Теперь хранит { accumulatedSeconds, startedAt, isRunning, ... }
const activeTimers = {}; 

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
      INSERT INTO game_timers (game_id, time_seconds, is_running, controller, penalties, period_length, ot_length, period, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (game_id) DO UPDATE 
      SET time_seconds = EXCLUDED.time_seconds, 
          is_running = EXCLUDED.is_running, 
          controller = EXCLUDED.controller, 
          penalties = EXCLUDED.penalties,
          period_length = EXCLUDED.period_length,
          ot_length = EXCLUDED.ot_length,
          period = EXCLUDED.period,
          updated_at = NOW()
    `, [
      gameId, 
      currentSeconds, 
      timerObj.isRunning || false, 
      timerObj.controller || 'secretary', 
      JSON.stringify(timerObj.penalties || []),
      timerObj.periodLength || 20,
      timerObj.otLength || 5,
      timerObj.period || '1'
    ]);
  } catch (err) {
    console.error(`Ошибка сохранения таймера в БД (Матч ${gameId}):`, err.message);
  }
};

export default function setupTimerSockets(io) {
  io.on('connection', (socket) => {
    
    socket.on('join_game', async (gameId) => {
      socket.join(`game_${gameId}`);
      
      if (!activeTimers[gameId]) {
        try {
          const res = await pool.query('SELECT * FROM game_timers WHERE game_id = $1', [gameId]);
          if (res.rows.length > 0) {
            const row = res.rows[0];
            activeTimers[gameId] = {
              accumulatedSeconds: row.time_seconds || 0,
              startedAt: row.is_running ? Date.now() : null, // Если сервер упал во время матча, продолжаем отсчет с текущего момента
              isRunning: row.is_running || false,
              controller: row.controller || 'secretary',
              penalties: typeof row.penalties === 'string' ? JSON.parse(row.penalties) : (row.penalties || []),
              periodLength: row.period_length || 20,
              otLength: row.ot_length || 5,
              period: row.period || '1'
            };
          } else {
            activeTimers[gameId] = { accumulatedSeconds: 0, startedAt: null, period: '1', isRunning: false, controller: 'secretary', penalties: [], periodLength: 20, otLength: 5 };
          }
        } catch (e) {
          console.error('Ошибка загрузки таймера при подключении:', e);
          activeTimers[gameId] = { accumulatedSeconds: 0, startedAt: null, period: '1', isRunning: false, controller: 'secretary', penalties: [], periodLength: 20, otLength: 5 };
        }
      }

      // Добавляем серверное время для калибровки на клиенте
      const stateToEmit = {
        ...activeTimers[gameId],
        serverTime: Date.now() 
      };
      socket.emit('timer_state', stateToEmit);
    });

    socket.on('score_updated', (data) => { if (data?.gameId) io.to(`game_${data.gameId}`).emit('score_updated'); });
    socket.on('game_updated', (data) => { if (data?.gameId) io.to(`game_${data.gameId}`).emit('game_updated'); });
    socket.on('trigger_obs_overlay', (data) => { if (data?.gameId) io.to(`game_${data.gameId}`).emit('trigger_obs_overlay', data); });

    socket.on('timer_action', async (payload) => {
      const { gameId, action, timerData, penaltyData, penaltyId, value } = payload;
      
      if (!activeTimers[gameId]) {
        activeTimers[gameId] = { accumulatedSeconds: 0, startedAt: null, period: '1', isRunning: false, controller: 'secretary', penalties: [], periodLength: 20, otLength: 5 };
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
      }

      // Отправляем состояние всем клиентам, обязательно прикрепляя точное время сервера
      const stateToEmit = {
        ...timer,
        serverTime: Date.now()
      };
      io.to(`game_${gameId}`).emit('timer_state', stateToEmit);

      // Спасаем в БД только при важных событиях (sync и тики игнорируем)
      const importantActions = [
        'stop', 'set_time', 'set_period', 'change_period', 'update_settings', 'delegate',
        'add_penalty', 'toggle_penalty', 'remove_penalty'
      ];

      if (importantActions.includes(action)) {
        syncTimerToDB(gameId, timer);
      }
    });

    socket.on('leave_game', (gameId) => {
      socket.leave(`game_${gameId}`);
    });

  });
}