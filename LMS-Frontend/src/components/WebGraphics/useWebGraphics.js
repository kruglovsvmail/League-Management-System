// src/components/WebGraphics/useWebGraphics.js
import { useState, useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import { calculatePenaltyTimelines } from '../GameLiveDesk/GameDeskShared';

export function useWebGraphics(gameId) {
  const [game, setGame] = useState(null);
  const [events, setEvents] = useState([]); 
  const [timerSeconds, setTimerSeconds] = useState(0); 
  const [currentPeriod, setCurrentPeriod] = useState('1');
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  
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
      // Грузим саму игру через публичный роут
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/games/${gameId}`);
      const data = await res.json();
      
      if (data.success) {
        setGame(data.data);
        if (data.data.period_length) setPeriodLength(data.data.period_length);
        if (data.data.ot_length) setOtLength(data.data.ot_length);
        
        // Бэкенд теперь сам отдает массив всех событий внутри data.data.events
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
    socket.emit('join_game', gameId);

    socket.on('timer_state', (state) => {
        if (!state) return; 
        setTimerSeconds(state.seconds || 0);
        if (state.period) setCurrentPeriod(state.period);
        setIsTimerRunning(!!state.isRunning);
        if (state.periodLength) setPeriodLength(state.periodLength);
        if (state.otLength) setOtLength(state.otLength);
        if (state.soLength) setSoLength(state.soLength);
    });

    socket.on('timer_tick', (state) => {
      if (state && state.seconds !== undefined) {
          setTimerSeconds(state.seconds);
      }
    });

    // Перезапрашиваем события при обновлении счета
    socket.on('score_updated', () => loadGameData());
    socket.on('game_updated', () => loadGameData());

    socket.on('trigger_obs_overlay', (payload) => {
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
                    data: payload.data || null
                  });
                  if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
                  if (payload.duration !== 'infinite') {
                    overlayTimeoutRef.current = setTimeout(() => {
                      setOverlay(prev => ({ ...prev, visible: false }));
                    }, 8000); 
                  }
              };

              const currentOverlay = overlayStateRef.current;
              if (currentOverlay && currentOverlay.visible && currentOverlay.type && currentOverlay.type !== payload.type) {
                  setOverlay(prev => ({ ...prev, visible: false }));
                  if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
                  if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
                  
                  transitionTimeoutRef.current = setTimeout(() => {
                      showNewOverlay(); 
                  }, 450);
              } else {
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
    } catch (e) { return []; }
  }, [game, timerSeconds]);

  return {
    game, events, timerSeconds, currentPeriod, isTimerRunning, activePenalties,
    periodLength, otLength, soLength, overlay, isScoreboardVisible
  };
}