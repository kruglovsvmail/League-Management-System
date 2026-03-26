import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getToken, getImageUrl } from '../utils/helpers'; // ДОБАВЛЕН ИМПОРТ getImageUrl
import { io } from 'socket.io-client';
import { ConfirmModal } from '../modals/ConfirmModal';
import { GamePlusMinusModal } from '../modals/GamePlusMinusModal';
import { ProtocolSheet } from '../components/GameLiveDesk/ProtocolSheet';
import { TimerPanel } from '../components/GameLiveDesk/TimerPanel';
import { getPeriodLimits, calculatePenaltyTimelines } from '../components/GameLiveDesk/GameDeskShared';

export function GameLiveDesk() {
  const { gameId } = useParams();

  const [game, setGame] = useState(null);
  const [events, setEvents] = useState([]);
  const [homeRoster, setHomeRoster] = useState([]);
  const [awayRoster, setAwayRoster] = useState([]);
  
  const [socket, setSocket] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0); 
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('1'); 
  
  const [periodLength, setPeriodLength] = useState(20);
  const [otLength, setOtLength] = useState(5);

  const [isPlusMinusEnabled, setIsPlusMinusEnabled] = useState(false);
  const [plusMinusModalState, setPlusMinusModalState] = useState({ isOpen: false, event: null, scoringTeam: null, concedingTeam: null });

  const [deleteModalState, setDeleteModalState] = useState({ isOpen: false, eventId: null });
  const [isSaving, setIsSaving] = useState(false); 

  // --- РЕФЫ ДЛЯ ОПТИМИСТИЧНОГО ОБНОВЛЕНИЯ (АНТИ-МЕРЦАНИЕ) ---
  const ignoreSocketRef = useRef(false);
  const ignoreTimeoutRef = useRef(null);

  const headers = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };

  // --- ОТКЛЮЧЕНИЕ ГЛОБАЛЬНОГО СКРОЛЛА СТРАНИЦЫ ---
  useEffect(() => {
    const originalOverflow = document.documentElement.style.overflow;
    const originalGutter = document.documentElement.style.scrollbarGutter;

    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.scrollbarGutter = 'auto';

    return () => {
      document.documentElement.style.overflow = originalOverflow;
      document.documentElement.style.scrollbarGutter = originalGutter;
    };
  }, []);

  const loadInitialData = async () => {
    try {
      const resGame = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}`, { headers });
      const dataGame = await resGame.json();
      
      const resEvents = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`, { headers });
      const dataEvents = await resEvents.json();

      if (dataGame.success) {
        setGame(dataGame.data);
        if (dataGame.data.period_length) setPeriodLength(dataGame.data.period_length);
        if (dataGame.data.ot_length) setOtLength(dataGame.data.ot_length);

        if (dataEvents.success) setEvents(dataEvents.data);

        const [resHome, resAway] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.home_team_id}`, { headers }),
          fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.away_team_id}`, { headers })
        ]);
        const [dataHome, dataAway] = await Promise.all([resHome.json(), resAway.json()]);
        
        setHomeRoster((dataHome.gameRoster || []).sort((a,b)=>a.jersey_number - b.jersey_number));
        setAwayRoster((dataAway.gameRoster || []).sort((a,b)=>a.jersey_number - b.jersey_number));
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadInitialData(); }, [gameId]);

  // Функция блокировки входящих сокетов на 1 секунду после локального действия
  const lockSocketUpdates = () => {
    ignoreSocketRef.current = true;
    if (ignoreTimeoutRef.current) clearTimeout(ignoreTimeoutRef.current);
    ignoreTimeoutRef.current = setTimeout(() => {
      ignoreSocketRef.current = false;
    }, 1000);
  };

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_API_URL);
    setSocket(newSocket);
    newSocket.emit('join_game', gameId);
    
    newSocket.on('timer_state', (state) => {
      if (ignoreSocketRef.current) return; // Игнорируем эхо, если только что кликали сами
      
      setTimerSeconds(state.seconds);
      setIsTimerRunning(state.isRunning);
      if (state.period) setCurrentPeriod(state.period);
      if (state.periodLength) setPeriodLength(state.periodLength);
      if (state.otLength) setOtLength(state.otLength);
    });
    
    newSocket.on('timer_tick', (state) => {
      if (ignoreSocketRef.current) return; // Защита от тиков во время переключения
      setTimerSeconds(state.seconds);
    });

    newSocket.on('score_updated', () => loadInitialData());
    newSocket.on('game_updated', () => loadInitialData());
    
    return () => newSocket.disconnect();
  }, [gameId]);

  useEffect(() => {
    let interval = null;
    if (isTimerRunning) {
      interval = setInterval(() => setTimerSeconds(prev => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  useEffect(() => {
    const limits = getPeriodLimits(currentPeriod, periodLength, otLength);
    if (isTimerRunning && limits.end > 0 && timerSeconds >= limits.end) {
      handleTimerAction('stop');
      socket?.emit('timer_action', { gameId, action: 'set_time', seconds: limits.end });
      setTimerSeconds(limits.end);
    }
  }, [timerSeconds, isTimerRunning, currentPeriod, periodLength, otLength]);

  const handleTimerAction = (action) => {
    lockSocketUpdates();
    if (action === 'start') setIsTimerRunning(true);
    if (action === 'stop') setIsTimerRunning(false);
    socket?.emit('timer_action', { gameId, action });
  };

  const changePeriod = (period) => {
    lockSocketUpdates(); // Включаем "предохранитель"
    
    // Оптимистично меняем всё локально сразу же
    setCurrentPeriod(period);
    const limits = getPeriodLimits(period, periodLength, otLength);
    setTimerSeconds(limits.start);
    
    // Отправляем на сервер в фоне
    socket?.emit('timer_action', { gameId, action: 'set_period', period });
    socket?.emit('timer_action', { gameId, action: 'set_time', seconds: limits.start });
    socket?.emit('game_updated', { gameId });
  };

  const saveTimerSettings = () => {
    lockSocketUpdates();
    socket?.emit('timer_action', { gameId, action: 'update_settings', periodLength, otLength });
  };

  const toggleLineup = async (rosterId, teamId, currentState) => {
    const updateState = (prev) => prev.map(p => p.id === rosterId ? { ...p, is_in_lineup: !currentState } : p);
    if (teamId === game.home_team_id) setHomeRoster(updateState);
    else setAwayRoster(updateState);
  };

  const processGoalPenaltyLogic = async (scoringTeamId, goalTimeRaw) => {
    const concedingTeamId = scoringTeamId === game.home_team_id ? game.away_team_id : game.home_team_id;
    const goalTime = parseInt(goalTimeRaw, 10);

    const concedingTimeline = calculatePenaltyTimelines(events.filter(e => e.team_id === concedingTeamId && e.event_type === 'penalty'));
    const scoringTimeline = calculatePenaltyTimelines(events.filter(e => e.team_id === scoringTeamId && e.event_type === 'penalty'));

    const isPenaltyActiveOnIce = (p, time) => [2, 4, 5, 25].includes(parseInt(p.penalty_minutes, 10)) && time >= p.effStart && time < p.effEnd;

    const activeConceding = concedingTimeline.filter(p => isPenaltyActiveOnIce(p, goalTime));
    const activeScoring = scoringTimeline.filter(p => isPenaltyActiveOnIce(p, goalTime));

    if (activeConceding.length > activeScoring.length) {
      const expirablePenalty = activeConceding
        .filter(p => [2, 4].includes(parseInt(p.penalty_minutes, 10)))
        .sort((a, b) => a.effStart - b.effStart)[0];

      if (expirablePenalty) {
        const mins = parseInt(expirablePenalty.penalty_minutes, 10);
        let reduction = 0;

        if (mins === 2) reduction = expirablePenalty.effEnd - goalTime;
        else if (mins === 4) {
          const currentDuration = goalTime - expirablePenalty.effStart;
          if (currentDuration < 120) reduction = expirablePenalty.effEnd - (goalTime + 120);
          else reduction = expirablePenalty.effEnd - goalTime;
        }

        if (reduction > 0) {
          const newDbEndTime = parseInt(expirablePenalty.penalty_end_time, 10) - reduction;
          await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${expirablePenalty.id}`, {
            method: 'PUT', headers, body: JSON.stringify({ ...expirablePenalty, penalty_end_time: newDbEndTime })
          });
        }
      }
    }
  };

  const saveEventRow = async (teamId, eventType, rowData, existingId = null) => {
    setIsSaving(true);
    const payload = { period: currentPeriod, team_id: teamId, event_type: eventType, ...rowData };
    try {
      const url = existingId ? `${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${existingId}` : `${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`;
      const res = await fetch(url, { method: existingId ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      
      if (data.success) {
        if (eventType === 'goal' && !existingId) await processGoalPenaltyLogic(teamId, rowData.time_seconds);
        await loadInitialData();
        socket?.emit('score_updated', { gameId });
        socket?.emit('game_updated', { gameId });
        return true;
      }
    } catch (err) { console.error(err); } 
    finally { setIsSaving(false); }
    return false;
  };

  const confirmDeleteEvent = async () => {
    const { eventId } = deleteModalState;
    if (!eventId) return;
    setIsSaving(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${eventId}`, { method: 'DELETE', headers });
      await loadInitialData();
      socket?.emit('score_updated', { gameId });
      socket?.emit('game_updated', { gameId });
    } catch (err) { console.error(err); } 
    finally {
      setIsSaving(false);
      setDeleteModalState({ isOpen: false, eventId: null });
    }
  };

  const handleRequestPlusMinus = (event) => {
    const isHome = event.team_id === game.home_team_id;
    setPlusMinusModalState({
      isOpen: true, event,
      scoringTeam: isHome ? { id: game.home_team_id, name: game.home_team_name } : { id: game.away_team_id, name: game.away_team_name },
      concedingTeam: isHome ? { id: game.away_team_id, name: game.away_team_name } : { id: game.home_team_id, name: game.home_team_name }
    });
  };

  if (!game) return <div className="min-h-screen bg-gray-light text-graphite-light flex items-center justify-center font-bold text-xl uppercase tracking-widest">Загрузка бланка...</div>;

  return (
    <div className={`flex w-full h-screen bg-gray-bg-light font-sans overflow-hidden text-graphite ${isSaving ? 'cursor-wait' : ''}`}>
      
      <div className="w-[80%] h-full overflow-y-scroll p-6 pl-8 pr-4 scroll-smooth bg-gray-light [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-graphite/15 hover:[&::-webkit-scrollbar-thumb]:bg-graphite/25 [&::-webkit-scrollbar-thumb]:rounded-full transition-colors">
        
        <div className="mb-5 border-b border-graphite/20 pb-3 flex justify-between items-end mr-2">
            <h1 className="font-black text-2xl text-graphite uppercase tracking-tight">Официальный протокол матча</h1>
            {isSaving && <span className="text-status-accepted font-bold text-sm animate-pulse">Сохранение...</span>}
        </div>

        <div className="mr-2">
          {/* ИСПОЛЬЗУЕМ getImageUrl ДЛЯ ЛОГОТИПОВ КОМАНД */}
          <ProtocolSheet 
            teamId={game.home_team_id} teamLetter="А" teamName={game.home_team_name} teamLogo={getImageUrl(game.home_team_logo || game.home_logo_url || game.home_logo)}
            roster={homeRoster} teamEvents={events.filter(e => e.team_id === game.home_team_id)} 
            timerSeconds={timerSeconds} onSaveEvent={saveEventRow} onDeleteEvent={(id) => setDeleteModalState({ isOpen: true, eventId: id })}
            onToggleLineup={toggleLineup} isPlusMinusEnabled={isPlusMinusEnabled} onRequestPlusMinus={handleRequestPlusMinus} isSaving={isSaving}
          />
          <ProtocolSheet 
            teamId={game.away_team_id} teamLetter="Б" teamName={game.away_team_name} teamLogo={getImageUrl(game.away_team_logo || game.away_logo_url || game.away_logo)}
            roster={awayRoster} teamEvents={events.filter(e => e.team_id === game.away_team_id)} 
            timerSeconds={timerSeconds} onSaveEvent={saveEventRow} onDeleteEvent={(id) => setDeleteModalState({ isOpen: true, eventId: id })}
            onToggleLineup={toggleLineup} isPlusMinusEnabled={isPlusMinusEnabled} onRequestPlusMinus={handleRequestPlusMinus} isSaving={isSaving}
          />
        </div>
      </div>

      <TimerPanel 
        game={game} currentPeriod={currentPeriod} changePeriod={changePeriod}
        timerSeconds={timerSeconds} isTimerRunning={isTimerRunning} handleTimerAction={handleTimerAction}
        periodLength={periodLength} setPeriodLength={setPeriodLength} otLength={otLength} setOtLength={setOtLength}
        saveTimerSettings={saveTimerSettings} isPlusMinusEnabled={isPlusMinusEnabled} setIsPlusMinusEnabled={setIsPlusMinusEnabled}
        socketConnected={socket?.connected} 
        onSetTime={(secs) => {
          lockSocketUpdates();
          setTimerSeconds(secs);
          socket?.emit('timer_action', { gameId, action: 'set_time', seconds: secs });
        }}
      />

      <ConfirmModal 
        isOpen={deleteModalState.isOpen} onClose={() => setDeleteModalState({ isOpen: false, eventId: null })}
        onConfirm={confirmDeleteEvent} isLoading={isSaving}
      />
      <GamePlusMinusModal 
        isOpen={plusMinusModalState.isOpen} onClose={() => setPlusMinusModalState(p => ({ ...p, isOpen: false }))}
        gameId={gameId} event={plusMinusModalState.event} scoringTeam={plusMinusModalState.scoringTeam} concedingTeam={plusMinusModalState.concedingTeam}
        scoringRoster={plusMinusModalState.scoringTeam?.id === game.home_team_id ? homeRoster : awayRoster}
        concedingRoster={plusMinusModalState.concedingTeam?.id === game.home_team_id ? homeRoster : awayRoster}
        onSuccess={loadInitialData}
      />
    </div>
  );
}