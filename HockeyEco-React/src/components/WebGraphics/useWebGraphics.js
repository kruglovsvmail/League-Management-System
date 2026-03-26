import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

export function useWebGraphics(gameId) {
  const [game, setGame] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0); 
  const [currentPeriod, setCurrentPeriod] = useState('1');
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [activePenalties, setActivePenalties] = useState([]);
  
  const [periodLength, setPeriodLength] = useState(20);
  const [otLength, setOtLength] = useState(5);
  
  // Новое состояние для главного табло (по умолчанию включено)
  const [isScoreboardVisible, setIsScoreboardVisible] = useState(true);

  const [overlay, setOverlay] = useState({
    visible: false,
    type: null,
    data: null
  });

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
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadGameData(); }, [gameId]);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL);
    socket.emit('join_game', gameId);
    let overlayTimeout = null;

    socket.on('timer_state', (state) => {
        setTimerSeconds(state.seconds);
        if (state.period) setCurrentPeriod(state.period);
        setIsTimerRunning(state.isRunning);
        setActivePenalties(state.penalties || []);
        if (state.periodLength) setPeriodLength(state.periodLength);
        if (state.otLength) setOtLength(state.otLength);
    });

    socket.on('timer_tick', (state) => {
      setTimerSeconds(state.seconds);
      if (state.penalties) setActivePenalties(state.penalties);
    });

    socket.on('score_updated', () => loadGameData());
    socket.on('game_updated', () => loadGameData());

    socket.on('trigger_obs_overlay', (payload) => {
      if (String(payload.gameId) === String(gameId)) {
        
        // Обработка скрытия/показа табло
        if (payload.type === 'scoreboard') {
            setIsScoreboardVisible(payload.action === 'show');
            return;
        }

        if (payload.action === 'hide') {
            setOverlay(prev => ({ ...prev, visible: false }));
            if (overlayTimeout) clearTimeout(overlayTimeout);
        } else {
            setOverlay({
              visible: true,
              type: payload.type,
              data: payload.data
            });

            if (overlayTimeout) clearTimeout(overlayTimeout);

            if (payload.duration !== 'infinite') {
              overlayTimeout = setTimeout(() => {
                setOverlay(prev => ({ ...prev, visible: false }));
              }, 8000); 
            }
        }
      }
    });

    return () => {
      if (overlayTimeout) clearTimeout(overlayTimeout);
      socket.disconnect();
    };
  }, [gameId]);

  useEffect(() => {
    let interval = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
        setActivePenalties(prev => prev.map(p => ({ ...p, remaining: p.remaining > 0 ? p.remaining - 1 : 0 })));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  return {
    game, timerSeconds, currentPeriod, isTimerRunning, activePenalties,
    periodLength, otLength, overlay, isScoreboardVisible
  };
}