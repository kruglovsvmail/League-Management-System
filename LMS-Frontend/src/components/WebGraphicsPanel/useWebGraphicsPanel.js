import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '../../utils/helpers';

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
  
  const [broadcastedGoals, setBroadcastedGoals] = useState([]);
  const [broadcastedPenalties, setBroadcastedPenalties] = useState([]);
  
  const [activeStaticOverlay, setActiveStaticOverlay] = useState(null);
  const [activeEventOverlay, setActiveEventOverlay] = useState(null); 
  const [isScoreboardVisible, setIsScoreboardVisible] = useState(true);

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
    const storedGoals = localStorage.getItem(`graphics_goals_${gameId}`);
    const storedPenalties = localStorage.getItem(`graphics_penalties_${gameId}`);
    
    if (storedGoals) {
      try { setBroadcastedGoals(JSON.parse(storedGoals)); } catch(e) { console.error(e); }
    }
    if (storedPenalties) {
      try { setBroadcastedPenalties(JSON.parse(storedPenalties)); } catch(e) { console.error(e); }
    }
  }, [gameId]);

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_API_URL);
    setSocket(newSocket);
    newSocket.emit('join_game', gameId);

    // ЛОВИМ СОСТОЯНИЕ И ВЫЧИСЛЯЕМ СМЕЩЕНИЕ ВРЕМЕНИ
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

    // СОБЫТИЕ timer_tick БОЛЬШЕ НЕ НУЖНО СЛУШАТЬ

    newSocket.on('score_updated', () => loadGameData());
    newSocket.on('game_updated', () => loadGameData());

    return () => newSocket.disconnect();
  }, [gameId, loadGameData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (timerData.isRunning && timerData.startedAt) {
        // Считаем дельту с учетом отставания часов сервера
        const nowWithOffset = Date.now() + timerData.serverTimeOffset;
        const elapsedSinceStart = Math.floor((nowWithOffset - timerData.startedAt) / 1000);
        
        setTimerSeconds(timerData.accumulatedSeconds + elapsedSinceStart);
      } else {
        setTimerSeconds(timerData.accumulatedSeconds);
      }
    }, 100); // Обновляем 10 раз в секунду для идеальной плавности

    return () => clearInterval(interval);
  }, [timerData]);


  const triggerOverlay = useCallback((type, data, signature) => {
    socket?.emit('trigger_obs_overlay', { type, gameId, data });

    setActiveEventOverlay(signature);
    setTimeout(() => {
      setActiveEventOverlay(prev => prev === signature ? null : prev);
    }, 10000);

    if (type === 'goal') {
      setBroadcastedGoals(prev => {
        if (prev.includes(signature)) return prev;
        const updated = [...prev, signature];
        localStorage.setItem(`graphics_goals_${gameId}`, JSON.stringify(updated));
        return updated;
      });
    } else if (type === 'penalty') {
      setBroadcastedPenalties(prev => {
        if (prev.includes(signature)) return prev;
        const updated = [...prev, signature];
        localStorage.setItem(`graphics_penalties_${gameId}`, JSON.stringify(updated));
        return updated;
      });
    }
  }, [socket, gameId]);

  const toggleStaticOverlay = useCallback((type, data = null, forceUpdate = false) => {
    setActiveStaticOverlay(prevActive => {
      if (prevActive === type) {
          if (forceUpdate) {
              socket?.emit('trigger_obs_overlay', { action: 'show', type, gameId, duration: 'infinite', data });
              return prevActive;
          } else {
              socket?.emit('trigger_obs_overlay', { action: 'hide', type, gameId });
              return null;
          }
      } else {
          socket?.emit('trigger_obs_overlay', { action: 'show', type, gameId, duration: 'infinite', data });
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

  return {
    game, events, timerSeconds, currentPeriod, isTimerRunning, activePenalties,
    periodLength, otLength, socket, broadcastedGoals, broadcastedPenalties, 
    triggerOverlay, toggleStaticOverlay, activeStaticOverlay,
    isScoreboardVisible, toggleScoreboard, activeEventOverlay
  };
}