import pool from '../config/db.js';

// IN-MEMORY хранилище таймеров. Живет в оперативной памяти сервера (очень быстрое)
const activeTimers = {}; 

const syncTimerToDB = async (gameId, timerObj) => {
  try {
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
      timerObj.seconds || 0, 
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
      
      // Если таймер уже есть в памяти сервера, отдаем его мгновенно
      if (activeTimers[gameId]) {
        socket.emit('timer_state', activeTimers[gameId]);
      } else {
        // Если сервер перезагружался, достаем последнее состояние из БД
        try {
          const res = await pool.query('SELECT * FROM game_timers WHERE game_id = $1', [gameId]);
          if (res.rows.length > 0) {
            const row = res.rows[0];
            activeTimers[gameId] = {
              seconds: row.time_seconds || 0,
              isRunning: row.is_running || false,
              controller: row.controller || 'secretary',
              penalties: typeof row.penalties === 'string' ? JSON.parse(row.penalties) : (row.penalties || []),
              periodLength: row.period_length || 20,
              otLength: row.ot_length || 5,
              period: row.period || '1'
            };
          } else {
             // Дефолтное состояние, если в БД еще ничего нет
            activeTimers[gameId] = { seconds: 0, period: '1', isRunning: false, controller: 'secretary', penalties: [], periodLength: 20, otLength: 5 };
          }
          socket.emit('timer_state', activeTimers[gameId]);
        } catch (e) {
          console.error('Ошибка загрузки таймера при подключении:', e);
        }
      }
    });

    // =========================================================
    // ВОССТАНОВЛЕННЫЕ СОБЫТИЯ ДЛЯ ВЕБ-ГРАФИКИ (OBS)
    // =========================================================
    socket.on('score_updated', (data) => { if (data?.gameId) io.to(`game_${data.gameId}`).emit('score_updated'); });
    socket.on('game_updated', (data) => { if (data?.gameId) io.to(`game_${data.gameId}`).emit('game_updated'); });
    socket.on('trigger_obs_overlay', (data) => { if (data?.gameId) io.to(`game_${data.gameId}`).emit('trigger_obs_overlay', data); });

    socket.on('timer_action', async (payload) => {
      // Поддерживаем как новый формат (timerData), так и старый (value)
      const { gameId, action, timerData, penaltyData, penaltyId, value } = payload;
      
      // Обновляем состояние в оперативной памяти
      if (!activeTimers[gameId]) {
        activeTimers[gameId] = timerData || { seconds: 0, period: '1', isRunning: false, controller: 'secretary', penalties: [], periodLength: 20, otLength: 5 };
      } else if (timerData) {
        activeTimers[gameId] = { ...activeTimers[gameId], ...timerData };
      }

      const timer = activeTimers[gameId];

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

      // МГНОВЕННО РАССЫЛАЕМ НОВОЕ ВРЕМЯ ВСЕМ ЗРИТЕЛЯМ/ТРАНСЛЯЦИЯМ (Включая OBS)
      io.to(`game_${gameId}`).emit('timer_state', timer);

      // =========================================================
      // СПАСАЕМ ДИСК: Пишем в БД ТОЛЬКО при важных событиях.
      // Действие 'sync' (каждую секунду) игнорируется для БД!
      // =========================================================
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