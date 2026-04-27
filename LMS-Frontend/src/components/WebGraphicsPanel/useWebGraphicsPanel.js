import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '../../utils/helpers';

export function useWebGraphicsPanel(gameId) {
  const [game, setGame] = useState(null);
  const [events, setEvents] = useState([]);
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

    newSocket.on('timer_state', (state) => {
        setTimerSeconds(state.seconds);
        if (state.period) setCurrentPeriod(state.period);
        setIsTimerRunning(state.isRunning);
        setActivePenalties(state.penalties || []);
        if (state.periodLength) setPeriodLength(state.periodLength);
        if (state.otLength) setOtLength(state.otLength);
    });

    newSocket.on('timer_tick', (state) => {
      setTimerSeconds(state.seconds);
      if (state.penalties) setActivePenalties(state.penalties);
    });

    newSocket.on('score_updated', () => loadGameData());
    newSocket.on('game_updated', () => loadGameData());

    return () => newSocket.disconnect();
  }, [gameId, loadGameData]);

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