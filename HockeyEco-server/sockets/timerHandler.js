import pool from '../config/db.js';

// Хранилище активных таймеров в оперативной памяти сервера
const activeTimers = {}; 
// Структура: { gameId: { seconds, isRunning, controller, penalties: [], intervalId } }

// Функция синхронизации таймера и штрафов в БД
const syncTimerToDB = async (gameId, timerObj) => {
  try {
    await pool.query(`
      INSERT INTO game_timers (game_id, time_seconds, is_running, controller, penalties, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (game_id) DO UPDATE 
      SET time_seconds = EXCLUDED.time_seconds, 
          is_running = EXCLUDED.is_running, 
          controller = EXCLUDED.controller, 
          penalties = EXCLUDED.penalties,
          updated_at = NOW()
    `, [
      gameId, 
      timerObj.seconds, 
      timerObj.isRunning, 
      timerObj.controller, 
      JSON.stringify(timerObj.penalties)
    ]);
  } catch (err) {
    console.error('Ошибка сохранения таймера в БД:', err.message);
  }
};

export default function setupTimerSockets(io) {
  io.on('connection', (socket) => {
    
    // ПОДКЛЮЧЕНИЕ К КОМНАТЕ МАТЧА
    socket.on('join_game', async (gameId) => {
      socket.join(`game_${gameId}`);
      
      if (!activeTimers[gameId]) {
        try {
          // Пытаемся восстановить статус из БД (в т.ч. массив штрафов)
          const res = await pool.query('SELECT * FROM game_timers WHERE game_id = $1', [gameId]);
          if (res.rows.length > 0) {
            activeTimers[gameId] = {
              seconds: res.rows[0].time_seconds,
              isRunning: res.rows[0].is_running,
              controller: res.rows[0].controller,
              penalties: res.rows[0].penalties || [],
              intervalId: null
            };
          } else {
            // Дефолт при первом запуске (20 минут, нет штрафов)
            activeTimers[gameId] = { 
              seconds: 1200, isRunning: false, controller: 'secretary', 
              penalties: [], intervalId: null 
            };
          }
        } catch (e) {
          activeTimers[gameId] = { 
            seconds: 1200, isRunning: false, controller: 'secretary', 
            penalties: [], intervalId: null 
          };
        }
      }
      
      // Отдаем актуальное состояние подключившемуся клиенту
      socket.emit('timer_state', {
        seconds: activeTimers[gameId].seconds,
        isRunning: activeTimers[gameId].isRunning,
        controller: activeTimers[gameId].controller,
        penalties: activeTimers[gameId].penalties
      });
    });

    // УПРАВЛЕНИЕ ТАЙМЕРАМИ И ШТРАФАМИ
    socket.on('timer_action', async ({ gameId, action, value, penaltyId, penaltyData }) => {
      const timer = activeTimers[gameId];
      if (!timer) return;

      if (action === 'start') {
        if (!timer.isRunning && timer.seconds > 0) {
          timer.isRunning = true;
          io.to(`game_${gameId}`).emit('timer_state', { 
            seconds: timer.seconds, isRunning: true, 
            controller: timer.controller, penalties: timer.penalties 
          });
          
          timer.intervalId = setInterval(() => {
            let stateChanged = false;

            // 1. Тик главного таймера
            if (timer.isRunning && timer.seconds > 0) {
              timer.seconds--;
              stateChanged = true;
            } else if (timer.seconds <= 0) {
              timer.isRunning = false;
            }

            // 2. Тик таймеров штрафов (только если главный таймер идет)
            if (timer.isRunning) {
              timer.penalties.forEach(p => {
                // Штраф тикает, если он не поставлен на паузу вручную
                if (p.isRunning && p.remaining > 0) {
                  p.remaining--;
                  stateChanged = true;
                }
              });
            }

            // 3. Авто-удаление отбытых штрафов
            const initialLen = timer.penalties.length;
            timer.penalties = timer.penalties.filter(p => p.remaining > 0);
            if (timer.penalties.length !== initialLen) stateChanged = true;

            // 4. Отправляем тик клиентам
            if (stateChanged) {
              io.to(`game_${gameId}`).emit('timer_tick', {
                seconds: timer.seconds,
                penalties: timer.penalties
              });
            }

            // 5. Остановка интервала, если все таймеры закончились
            if (!timer.isRunning && timer.penalties.length === 0) {
              clearInterval(timer.intervalId);
              timer.intervalId = null;
              syncTimerToDB(gameId, timer);
            }
          }, 1000);
        }
      } 
      else if (action === 'stop') {
        if (timer.isRunning) {
          timer.isRunning = false;
          if (timer.intervalId) {
            clearInterval(timer.intervalId);
            timer.intervalId = null;
          }
          io.to(`game_${gameId}`).emit('timer_state', { 
            seconds: timer.seconds, isRunning: false, 
            controller: timer.controller, penalties: timer.penalties 
          });
          syncTimerToDB(gameId, timer);
        }
      } 
      else if (action === 'set') {
        timer.seconds = value;
        io.to(`game_${gameId}`).emit('timer_state', { 
            seconds: timer.seconds, isRunning: timer.isRunning, 
            controller: timer.controller, penalties: timer.penalties 
        });
        syncTimerToDB(gameId, timer);
      } 
      else if (action === 'delegate') {
        timer.controller = value;
        io.to(`game_${gameId}`).emit('timer_state', { 
            seconds: timer.seconds, isRunning: timer.isRunning, 
            controller: timer.controller, penalties: timer.penalties 
        });
        syncTimerToDB(gameId, timer);
      }
      
      // --- СПЕЦИАЛЬНЫЕ ЭКШЕНЫ ДЛЯ ШТРАФОВ ---
      
      else if (action === 'add_penalty') {
        // penaltyData: { id: 1, team_id: 4, player_id: 102, remaining: 120, isRunning: true }
        timer.penalties.push(penaltyData);
        io.to(`game_${gameId}`).emit('timer_state', { 
            seconds: timer.seconds, isRunning: timer.isRunning, 
            controller: timer.controller, penalties: timer.penalties 
        });
        syncTimerToDB(gameId, timer);
      }
      else if (action === 'toggle_penalty') {
        // Ручная пауза конкретного штрафа
        const p = timer.penalties.find(x => x.id === penaltyId);
        if (p) {
            p.isRunning = !p.isRunning;
            io.to(`game_${gameId}`).emit('timer_state', { 
                seconds: timer.seconds, isRunning: timer.isRunning, 
                controller: timer.controller, penalties: timer.penalties 
            });
            syncTimerToDB(gameId, timer);
        }
      }
      else if (action === 'remove_penalty') {
        // Досрочное снятие штрафа (например, при голе)
        timer.penalties = timer.penalties.filter(x => x.id !== penaltyId);
        io.to(`game_${gameId}`).emit('timer_state', { 
            seconds: timer.seconds, isRunning: timer.isRunning, 
            controller: timer.controller, penalties: timer.penalties 
        });
        syncTimerToDB(gameId, timer);
      }
    });

    // ПРОБРОС УВЕДОМЛЕНИЙ ДЛЯ ПАНЕЛИ РЕЖИССЕРА
    socket.on('broadcast_event_saved', ({ gameId, eventData }) => {
        // Секретарь шлет этот сигнал после успешного REST-запроса, 
        // а сокет передает его режиссеру для вывода плашки
        io.to(`game_${gameId}`).emit('new_event_saved', eventData);
        // Если это гол, транслируем обновление счета
        if (eventData.type === 'goal') {
           io.to(`game_${gameId}`).emit('score_updated'); 
        }
    });

  });
}