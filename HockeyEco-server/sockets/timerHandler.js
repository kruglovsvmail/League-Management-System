import pool from '../config/db.js';

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
      timerObj.seconds, 
      timerObj.isRunning, 
      timerObj.controller, 
      JSON.stringify(timerObj.penalties),
      timerObj.periodLength,
      timerObj.otLength,
      timerObj.period
    ]);
  } catch (err) {
    console.error('Ошибка сохранения таймера в БД:', err.message);
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
            activeTimers[gameId] = {
              seconds: res.rows[0].time_seconds || 0,
              period: res.rows[0].period || '1',
              isRunning: res.rows[0].is_running || false,
              controller: res.rows[0].controller || 'secretary',
              penalties: res.rows[0].penalties || [],
              periodLength: res.rows[0].period_length || 20,
              otLength: res.rows[0].ot_length || 5,
              intervalId: null
            };
          } else {
            activeTimers[gameId] = { seconds: 0, period: '1', isRunning: false, controller: 'secretary', penalties: [], periodLength: 20, otLength: 5, intervalId: null };
          }
        } catch (e) {
          activeTimers[gameId] = { seconds: 0, period: '1', isRunning: false, controller: 'secretary', penalties: [], periodLength: 20, otLength: 5, intervalId: null };
        }
      }
      
      socket.emit('timer_state', {
        seconds: activeTimers[gameId].seconds,
        period: activeTimers[gameId].period,
        isRunning: activeTimers[gameId].isRunning,
        controller: activeTimers[gameId].controller,
        penalties: activeTimers[gameId].penalties,
        periodLength: activeTimers[gameId].periodLength,
        otLength: activeTimers[gameId].otLength
      });
    });

    socket.on('score_updated', (data) => { if (data?.gameId) io.to(`game_${data.gameId}`).emit('score_updated'); });
    socket.on('game_updated', (data) => { if (data?.gameId) io.to(`game_${data.gameId}`).emit('game_updated'); });
    socket.on('trigger_obs_overlay', (data) => { if (data?.gameId) io.to(`game_${data.gameId}`).emit('trigger_obs_overlay', data); });

    socket.on('timer_action', async ({ gameId, action, value, penaltyId, penaltyData, seconds, period, periodLength, otLength }) => {
      const timer = activeTimers[gameId];
      if (!timer) return;

      if (action === 'start') {
        if (!timer.isRunning) {
          timer.isRunning = true;
          io.to(`game_${gameId}`).emit('timer_state', { seconds: timer.seconds, period: timer.period, isRunning: true, controller: timer.controller, penalties: timer.penalties, periodLength: timer.periodLength, otLength: timer.otLength });
          
          timer.intervalId = setInterval(() => {
            let stateChanged = false;
            if (timer.isRunning) { timer.seconds++; stateChanged = true; }
            if (timer.isRunning) {
              timer.penalties.forEach(p => { if (p.isRunning && p.remaining > 0) { p.remaining--; stateChanged = true; } });
            }
            const initialLen = timer.penalties.length;
            timer.penalties = timer.penalties.filter(p => p.remaining > 0);
            if (timer.penalties.length !== initialLen) stateChanged = true;

            if (stateChanged) {
              io.to(`game_${gameId}`).emit('timer_tick', { seconds: timer.seconds, isRunning: timer.isRunning, penalties: timer.penalties });
            }
          }, 1000);
        }
      } 
      else if (action === 'stop') {
        if (timer.isRunning) {
          timer.isRunning = false;
          if (timer.intervalId) { clearInterval(timer.intervalId); timer.intervalId = null; }
          io.to(`game_${gameId}`).emit('timer_state', { seconds: timer.seconds, period: timer.period, isRunning: false, controller: timer.controller, penalties: timer.penalties, periodLength: timer.periodLength, otLength: timer.otLength });
          syncTimerToDB(gameId, timer);
        }
      } 
      else if (action === 'set_time') {
        timer.seconds = seconds !== undefined ? seconds : value;
        io.to(`game_${gameId}`).emit('timer_state', { seconds: timer.seconds, period: timer.period, isRunning: timer.isRunning, controller: timer.controller, penalties: timer.penalties, periodLength: timer.periodLength, otLength: timer.otLength });
        syncTimerToDB(gameId, timer);
      } 
      else if (action === 'set_period') {
        timer.period = period;
        io.to(`game_${gameId}`).emit('timer_state', { seconds: timer.seconds, period: timer.period, isRunning: timer.isRunning, controller: timer.controller, penalties: timer.penalties, periodLength: timer.periodLength, otLength: timer.otLength });
        syncTimerToDB(gameId, timer);
      }
      else if (action === 'update_settings') {
        timer.periodLength = periodLength;
        timer.otLength = otLength;
        io.to(`game_${gameId}`).emit('timer_state', { seconds: timer.seconds, period: timer.period, isRunning: timer.isRunning, controller: timer.controller, penalties: timer.penalties, periodLength: timer.periodLength, otLength: timer.otLength });
        syncTimerToDB(gameId, timer);
      }
      else if (action === 'delegate') {
        timer.controller = value;
        io.to(`game_${gameId}`).emit('timer_state', { seconds: timer.seconds, period: timer.period, isRunning: timer.isRunning, controller: timer.controller, penalties: timer.penalties, periodLength: timer.periodLength, otLength: timer.otLength });
        syncTimerToDB(gameId, timer);
      }
      else if (action === 'add_penalty') {
        timer.penalties.push(penaltyData);
        io.to(`game_${gameId}`).emit('timer_state', { seconds: timer.seconds, period: timer.period, isRunning: timer.isRunning, controller: timer.controller, penalties: timer.penalties, periodLength: timer.periodLength, otLength: timer.otLength });
        syncTimerToDB(gameId, timer);
      }
      else if (action === 'toggle_penalty') {
        const p = timer.penalties.find(x => x.id === penaltyId);
        if (p) {
            p.isRunning = !p.isRunning;
            io.to(`game_${gameId}`).emit('timer_state', { seconds: timer.seconds, period: timer.period, isRunning: timer.isRunning, controller: timer.controller, penalties: timer.penalties, periodLength: timer.periodLength, otLength: timer.otLength });
            syncTimerToDB(gameId, timer);
        }
      }
      else if (action === 'remove_penalty') {
        timer.penalties = timer.penalties.filter(x => x.id !== penaltyId);
        io.to(`game_${gameId}`).emit('timer_state', { seconds: timer.seconds, period: timer.period, isRunning: timer.isRunning, controller: timer.controller, penalties: timer.penalties, periodLength: timer.periodLength, otLength: timer.otLength });
        syncTimerToDB(gameId, timer);
      }
    });
  });
}