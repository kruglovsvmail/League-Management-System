import { useState, useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import { calculatePenaltyTimelines } from '../GameLiveDesk/GameDeskShared';

export function useWebGraphics(gameId) {
  const [game, setGame] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0); 
  const [currentPeriod, setCurrentPeriod] = useState('1');
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  
  const [periodLength, setPeriodLength] = useState(20);
  const [otLength, setOtLength] = useState(5);
  
  const [isScoreboardVisible, setIsScoreboardVisible] = useState(true);

  const [overlay, setOverlay] = useState({
    visible: false,
    type: null,
    data: null
  });

  // Рефы для безопасной работы с таймаутами внутри сокетов
  const overlayTimeoutRef = useRef(null);
  const transitionTimeoutRef = useRef(null);
  
  // Реф для получения актуального состояния оверлея внутри socket.on (чтобы не было замыканий)
  const overlayStateRef = useRef(overlay);
  useEffect(() => {
    overlayStateRef.current = overlay;
  }, [overlay]);

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
    } catch (err) { console.error('Ошибка загрузки игры:', err); }
  };

  useEffect(() => { loadGameData(); }, [gameId]);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL);
    socket.emit('join_game', gameId);

    socket.on('timer_state', (state) => {
        if (!state) return; // Защита от null
        setTimerSeconds(state.seconds || 0);
        if (state.period) setCurrentPeriod(state.period);
        setIsTimerRunning(!!state.isRunning);
        if (state.periodLength) setPeriodLength(state.periodLength);
        if (state.otLength) setOtLength(state.otLength);
    });

    socket.on('timer_tick', (state) => {
      if (state && state.seconds !== undefined) {
          setTimerSeconds(state.seconds);
      }
    });

    socket.on('score_updated', () => loadGameData());
    socket.on('game_updated', () => loadGameData());

    socket.on('trigger_obs_overlay', (payload) => {
      // Оборачиваем в try-catch, чтобы ошибка сокета не роняла React
      try {
          if (!payload) return;
          if (String(payload.gameId) !== String(gameId)) return;
          
          if (payload.type === 'scoreboard') {
              setIsScoreboardVisible(payload.action === 'show');
              return;
          }

          if (payload.action === 'hide') {
              setOverlay(prev => ({ ...prev, visible: false }));
              if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
              if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
          } else {
              
              const showNewOverlay = () => {
                  setOverlay({
                    visible: true,
                    type: payload.type,
                    data: payload.data || null // Защита на случай отсутствия data
                  });

                  if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);

                  if (payload.duration !== 'infinite') {
                    overlayTimeoutRef.current = setTimeout(() => {
                      setOverlay(prev => ({ ...prev, visible: false }));
                    }, 8000); 
                  }
              };

              const currentOverlay = overlayStateRef.current;

              // ЛОГИКА ТРАНЗИШЕНОВ С ЗАЩИТОЙ
              if (currentOverlay && currentOverlay.visible && currentOverlay.type && currentOverlay.type !== payload.type) {
                  // 1. Прячем текущую плашку
                  setOverlay(prev => ({ ...prev, visible: false }));
                  if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
                  if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
                  
                  // 2. Ждем завершения CSS-анимации скрытия (0.45 сек)
                  transitionTimeoutRef.current = setTimeout(() => {
                      showNewOverlay(); 
                  }, 450);
              } else {
                  // Если экран пуст, показываем мгновенно
                  showNewOverlay();
              }
          }
      } catch (error) {
          console.error('Критическая ошибка при обработке плашки:', error);
      }
    });

    return () => {
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
      socket.disconnect();
    };
  }, [gameId]);

  useEffect(() => {
    let interval = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

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
    } catch (e) {
        console.error('Ошибка вычисления штрафов:', e);
        return [];
    }
  }, [game, timerSeconds]);

  return {
    game, timerSeconds, currentPeriod, isTimerRunning, activePenalties,
    periodLength, otLength, overlay, isScoreboardVisible
  };
}