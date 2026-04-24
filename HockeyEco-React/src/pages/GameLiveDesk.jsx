// src/pages/GameLiveDesk.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getToken } from '../utils/helpers';
import { io } from 'socket.io-client';
import { ConfirmModal } from '../modals/ConfirmModal';
import { GamePlusMinusModal } from '../modals/GamePlusMinusModal';
import { TechDefeatModal } from '../modals/TechDefeatModal';
import { TimerPanel } from '../components/GameLiveDesk/TimerPanel';
import { GameFlowAccordion } from '../components/GameLiveDesk/GameFlowAccordion';
import { ShootoutAccordion } from '../components/GameLiveDesk/ShootoutAccordion';
import { SummaryTablesAccordion } from '../components/GameLiveDesk/SummaryTablesAccordion';
import { 
  getPeriodLimits, 
  calculatePenaltyTimelines, 
  calculatePeriodFromTime
} from '../components/GameLiveDesk/GameDeskShared';
import { ProtocolViewerModal } from '../components/GameLiveDesk/ProtocolViewerModal';
import { Button } from '../ui/Button';
import { useAccess } from '../hooks/useAccess';
import { AccessFallback } from '../ui/AccessFallback';
import { Icon } from '../ui/Icon';
import { Loader } from '../ui/Loader';

const EditableTimePill = ({ label, field, value, onSave, onClear, isReadOnly }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempVal, setTempVal] = useState(value || '');

    useEffect(() => { setTempVal(value || ''); }, [value, isEditing]);

    const handleSaveAction = () => {
        setIsEditing(false);
        if (tempVal !== value) {
            if (tempVal === '') onClear(field);
            else onSave(field, tempVal);
        }
    };

    const handleAutoSet = () => {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        onSave(field, timeString);
    };

    if (isEditing && !isReadOnly) {
        return (
            <div className="flex items-center justify-between bg-white border border-orange/50 rounded-md px-2 shadow-sm ring-2 ring-orange/10 h-[32px] w-[125px] relative">
                <input
                    type="time"
                    autoFocus
                    value={tempVal}
                    onChange={e => setTempVal(e.target.value)}
                    onBlur={(e) => { if (!e.relatedTarget?.closest('.clear-btn')) handleSaveAction(); }}
                    onKeyDown={e => { if(e.key === 'Enter') handleSaveAction(); }}
                    className="bg-transparent font-mono text-[13px] font-bold text-graphite outline-none w-full text-center pr-5"
                />
                <button
                    type="button"
                    className="clear-btn absolute right-1 w-5 h-5 flex items-center justify-center text-status-rejected hover:bg-status-rejected/10 rounded transition-colors"
                    onClick={(e) => { e.preventDefault(); setIsEditing(false); onClear(field); }}
                    title="Сбросить время"
                >
                    <Icon name="close" className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={() => {
                if (isReadOnly) return;
                value ? setIsEditing(true) : handleAutoSet();
            }}
            className={`relative group flex items-center justify-between px-3 rounded-md transition-all border h-[32px] w-[125px] ${value ? 'bg-white border-graphite/20 shadow-sm' : 'bg-transparent border-dashed border-graphite/30'} ${!isReadOnly && value ? 'hover:border-graphite/40 cursor-pointer' : ''} ${!isReadOnly && !value ? 'hover:border-orange hover:bg-orange/5 cursor-pointer' : ''} ${isReadOnly ? 'cursor-default opacity-80' : ''}`}
            title={isReadOnly ? "" : (value ? "Редактировать время" : "Зафиксировать текущее время")}
        >
            <span className={`text-[10px] font-bold uppercase ${value ? 'text-graphite-light' : 'text-graphite/50 group-hover:text-orange'}`}>{label}</span>
            <span className={`font-mono text-[13px] font-bold ${value ? 'text-graphite' : 'text-graphite/40 group-hover:text-orange'}`}>
                {value || '--:--'}
            </span>
        </button>
    );
};

const EditableNumberPill = ({ label, field, value, onSave, isReadOnly }) => {
    const [tempVal, setTempVal] = useState(value || '');
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => { setTempVal(value || ''); }, [value, isEditing]);

    const handleSaveAction = () => {
        setIsEditing(false);
        const num = parseInt(tempVal, 10);
        const finalVal = isNaN(num) ? null : num;
        if (finalVal !== value) {
            onSave(field, finalVal === null ? '' : finalVal); 
        }
    };

    if (isEditing && !isReadOnly) {
        return (
            <div className="flex items-center justify-between bg-white border border-orange/50 rounded-md px-2 shadow-sm ring-2 ring-orange/10 h-[32px] w-[110px] relative">
                <span className="text-[10px] font-bold text-graphite-light uppercase absolute left-2.5">{label}</span>
                <input
                    type="number"
                    autoFocus
                    min="0"
                    value={tempVal}
                    onChange={e => setTempVal(e.target.value)}
                    onBlur={handleSaveAction}
                    onKeyDown={e => { if(e.key === 'Enter') handleSaveAction(); }}
                    className="bg-transparent font-mono text-[13px] font-bold text-graphite outline-none w-full text-right"
                />
            </div>
        );
    }

    const hasValue = value !== null && value !== undefined && value !== '';

    return (
        <button
            onClick={() => { if (!isReadOnly) setIsEditing(true); }}
            className={`relative group flex items-center justify-between px-3 rounded-md transition-all border h-[32px] w-[110px] ${hasValue ? 'bg-white border-graphite/20 shadow-sm' : 'bg-transparent border-dashed border-graphite/30'} ${!isReadOnly && hasValue ? 'hover:border-graphite/40 cursor-pointer' : ''} ${!isReadOnly && !hasValue ? 'hover:border-orange hover:bg-orange/5 cursor-pointer' : ''} ${isReadOnly ? 'cursor-default opacity-80' : ''}`}
            title={isReadOnly ? "" : "Указать количество зрителей"}
        >
            <span className={`text-[10px] font-bold uppercase ${hasValue ? 'text-graphite-light' : 'text-graphite/50 group-hover:text-orange'}`}>{label}</span>
            <span className={`font-mono text-[13px] font-bold ${hasValue ? 'text-graphite' : 'text-graphite/40 group-hover:text-orange'}`}>
                {hasValue ? value : '---'}
            </span>
        </button>
    );
};

export function GameLiveDesk() {
  const { gameId } = useParams();
  const navigate = useNavigate(); 

  const [game, setGame] = useState(null);
  const [events, setEvents] = useState([]);
  const [homeRoster, setHomeRoster] = useState([]);
  const [awayRoster, setAwayRoster] = useState([]);
  
  const [goalieLog, setGoalieLog] = useState([]);
  const [shotsSummary, setShotsSummary] = useState([]);

  // --- ЛОГИКА АВТОРИЗАЦИИ ДЛЯ ПОЛНОЭКРАННОЙ СТРАНИЦЫ ---
  const [authUser, setAuthUser] = useState(null);
  
  // Ищем лигу текущего матча в профиле юзера, чтобы права отработали точно
  const activeLeague = authUser?.leagues?.find(l => l.id === game?.league_id) || null;
  const { checkAccess, checkMatchEditAccess } = useAccess(authUser, activeLeague);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/me`, { 
          headers: { 'Authorization': `Bearer ${getToken()}` } 
        });
        const data = await res.json();
        if (data.success) setAuthUser(data.user);
      } catch (err) {
        console.error('Ошибка загрузки профиля', err);
      }
    };
    fetchUser();
  }, []);

  const [socket, setSocket] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0); 
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('1'); 
  
  const [periodsCount, setPeriodsCount] = useState(3);
  const [periodLength, setPeriodLength] = useState(20);
  const [otLength, setOtLength] = useState(5);
  const [soLength, setSoLength] = useState(3);

  const [trackPlusMinus, setTrackPlusMinus] = useState(false);
  const [plusMinusModalState, setPlusMinusModalState] = useState({ isOpen: false, event: null, scoringTeam: null, concedingTeam: null });

  const [deleteModalState, setDeleteModalState] = useState({ isOpen: false, id: null, type: null });
  
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false); 
  const [isFinishingGame, setIsFinishingGame] = useState(false); 
  const [isRecalculatingStats, setIsRecalculatingStats] = useState(false);

  const [isViewerOpen, setIsViewerOpen] = useState(false); 

  const ignoreSocketRef = useRef(false);
  const ignoreTimeoutRef = useRef(null);

  const headers = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    const originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = originalOverflow; };
  }, []);

  const loadInitialData = async () => {
    try {
      const resGame = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}`, { headers });
      const dataGame = await resGame.json();
      
      const resEvents = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`, { headers });
      const dataEvents = await resEvents.json();

      if (dataGame.success) {
        setGame(dataGame.data);
        setPeriodsCount(dataGame.data.periods_count ?? 3);
        setPeriodLength(dataGame.data.period_length ?? 20);
        setOtLength(dataGame.data.ot_length ?? 5);
        setSoLength(dataGame.data.so_length ?? 3);
        setTrackPlusMinus(dataGame.data.track_plus_minus ?? false);
        setGoalieLog(dataGame.data.goalie_log || []);
        setShotsSummary(dataGame.data.shots_summary || []);

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

  const lockSocketUpdates = () => {
    ignoreSocketRef.current = true;
    if (ignoreTimeoutRef.current) clearTimeout(ignoreTimeoutRef.current);
    ignoreTimeoutRef.current = setTimeout(() => ignoreSocketRef.current = false, 1000);
  };

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_API_URL);
    setSocket(newSocket);
    newSocket.emit('join_game', gameId);
    
    newSocket.on('timer_state', (state) => {
      if (ignoreSocketRef.current) return; 
      setTimerSeconds(state.seconds);
      setIsTimerRunning(state.isRunning);
      if (state.period) setCurrentPeriod(state.period);
      if (state.periodsCount !== undefined) setPeriodsCount(state.periodsCount ?? 3);
      if (state.periodLength !== undefined) setPeriodLength(state.periodLength ?? 20);
      if (state.otLength !== undefined) setOtLength(state.otLength ?? 5);
      if (state.soLength !== undefined) setSoLength(state.soLength ?? 3);
      if (state.trackPlusMinus !== undefined) setTrackPlusMinus(state.trackPlusMinus ?? false);
    });
    
    newSocket.on('timer_tick', (state) => {
      if (ignoreSocketRef.current) return;
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
    const limits = getPeriodLimits(currentPeriod, periodLength, otLength, periodsCount);
    if (isTimerRunning && limits.end > 0 && timerSeconds >= limits.end) {
      handleTimerAction('stop');
      socket?.emit('timer_action', { gameId, action: 'set_time', seconds: limits.end });
      setTimerSeconds(limits.end);
    }
  }, [timerSeconds, isTimerRunning, currentPeriod, periodLength, otLength, periodsCount]);

  const handleTimerAction = (action) => {
    lockSocketUpdates();
    if (action === 'start') setIsTimerRunning(true);
    if (action === 'stop') setIsTimerRunning(false);
    socket?.emit('timer_action', { gameId, action });
  };

  const changePeriod = (period) => {
    lockSocketUpdates();
    setCurrentPeriod(period);
    const limits = getPeriodLimits(period, periodLength, otLength, periodsCount);
    setTimerSeconds(limits.start);
    socket?.emit('timer_action', { gameId, action: 'set_period', period });
    socket?.emit('timer_action', { gameId, action: 'set_time', seconds: limits.start });
    socket?.emit('game_updated', { gameId });
  };

  const saveTimerSettings = async () => {
    lockSocketUpdates();
    socket?.emit('timer_action', { gameId, action: 'update_settings', periodsCount, periodLength, otLength, soLength, trackPlusMinus });
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/timer-settings`, {
        method: 'PUT', headers, body: JSON.stringify({ 
          periods_count: periodsCount, period_length: periodLength, 
          ot_length: otLength, so_length: soLength, track_plus_minus: trackPlusMinus
        })
      });
    } catch(e) { console.error(e); }
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
      const expirablePenalty = activeConceding.filter(p => [2, 4].includes(parseInt(p.penalty_minutes, 10))).sort((a, b) => a.effStart - b.effStart)[0];
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
    let finalPeriod = currentPeriod;
    if (['goal', 'penalty', 'timeout'].includes(eventType) && rowData.time_seconds !== undefined) {
      finalPeriod = calculatePeriodFromTime(rowData.time_seconds, periodLength, otLength, periodsCount);
    } else if (['shootout_goal', 'shootout_miss'].includes(eventType)) {
      finalPeriod = 'SO';
    }

    const payload = { period: finalPeriod, team_id: teamId, event_type: eventType, ...rowData };
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
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
    return false;
  };

  const confirmDeleteAction = async () => {
    const { id, type } = deleteModalState;
    if (!id) return;
    setIsSaving(true);
    try {
      if (type === 'event') {
          await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${id}`, { method: 'DELETE', headers });
      } else if (type === 'goalie') {
          await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/goalie-log/${id}`, { method: 'DELETE', headers });
      }
      await loadInitialData();
      socket?.emit('score_updated', { gameId });
      socket?.emit('game_updated', { gameId });
    } catch (err) { console.error(err); } 
    finally {
      setIsSaving(false);
      setDeleteModalState({ isOpen: false, id: null, type: null });
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

  const saveGoalieLog = async (logData) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/goalie-log`, { method: 'POST', headers, body: JSON.stringify(logData) });
      if (res.ok) { await loadInitialData(); socket?.emit('game_updated', { gameId }); }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const saveShotsSummary = async (summaryData) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/shots-summary`, { method: 'POST', headers, body: JSON.stringify(summaryData) });
      if (res.ok) { await loadInitialData(); socket?.emit('game_updated', { gameId }); }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleFinishShootout = async () => {
    setIsSaving(true);
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/finish-shootout`, { method: 'POST', headers });
        const data = await res.json();
        if (data.success) {
            await loadInitialData();
            socket?.emit('score_updated', { gameId });
            socket?.emit('game_updated', { gameId });
        } else {
            alert(data.error);
        }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleReopenShootout = async () => {
    setIsSaving(true);
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/reopen-shootout`, { method: 'POST', headers });
        const data = await res.json();
        if (data.success) {
            await loadInitialData();
            socket?.emit('score_updated', { gameId });
            socket?.emit('game_updated', { gameId });
        } else {
            alert(data.error);
        }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleUpdateShootoutStatus = async (status) => {
      setIsSaving(true);
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/shootout-status`, {
              method: 'PUT', headers, body: JSON.stringify({ status })
          });
          if (res.ok) {
              await loadInitialData();
              socket?.emit('game_updated', { gameId });
          } else {
              const errData = await res.json();
              alert(errData.error || 'Ошибка при обновлении статуса');
          }
      } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleSaveActualData = async (field, value) => {
    setIsSaving(true);
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/info`, {
            method: 'PUT', headers, body: JSON.stringify({ [field]: value })
        });
        if (res.ok) {
            await loadInitialData();
            socket?.emit('game_updated', { gameId });
        }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleClearActualData = async (field) => {
    handleSaveActualData(field, '');
  };

  const handleRecalculateStats = async () => {
      setIsRecalculatingStats(true);
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/recalculate`, {
              method: 'POST', headers
          });
          if (res.ok) {
              await loadInitialData();
              socket?.emit('game_updated', { gameId });
          }
      } catch (err) { console.error(err); } 
      finally { setIsRecalculatingStats(false); }
  };

  const handleFinishGameFromDesk = async () => {
      setIsFinishingGame(true);
      try {
          let finalEndType = 'reg';
          if (currentPeriod === 'OT') finalEndType = 'ot';
          if (currentPeriod === 'SO') finalEndType = 'so';

          const payload = {
              status: 'finished',
              endType: finalEndType,
              finalHomeScore: game.home_score,
              finalAwayScore: game.away_score,
              isTechnical: game.is_technical
          };
          
          const resStatus = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/status`, {
              method: 'PUT', headers, body: JSON.stringify(payload)
          });
          
          if (resStatus.ok) {
              await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/recalculate`, {
                  method: 'POST', headers
              });
              await loadInitialData();
              socket?.emit('game_updated', { gameId });
          }
      } catch (err) {
          console.error(err);
      } finally {
          setIsFinishingGame(false);
      }
  };

  const gameStaffArray = useMemo(() => {
    if (!game?.officials) return [];
    return Object.entries(game.officials)
      .filter(([role, off]) => off && off.id)
      .map(([role, off]) => ({ user_id: off.id, role }));
  }, [game]);

  const matchEditAccess = checkMatchEditAccess(game, gameStaffArray);
  const hasProtocolAccess = checkAccess('MATCH_SECRETARY_PANEL_ENTER', { gameStaff: gameStaffArray });
  
  const canAccessPanel = hasProtocolAccess && (matchEditAccess.hasAccess || game?.is_protocol_signed);
  const isReadOnly = !matchEditAccess.hasAccess;

  if (!game || !authUser) {
      return (
          <div className="min-h-screen bg-gray-light text-graphite-light flex items-center justify-center font-bold text-xl uppercase tracking-widest">
              <Loader text="" />
          </div>
      );
  }

  if (!canAccessPanel) {
      return (
          <div className="h-screen w-full flex items-center justify-center bg-gray-bg-light px-10">
              <AccessFallback variant="full" message="У вас нет прав для доступа к панели секретаря матча." />
          </div>
      );
  }

  return (
    <div className={`flex w-full h-screen bg-gray-bg-light font-sans overflow-hidden text-graphite ${isSaving || isFinishingGame || isRecalculatingStats ? 'cursor-wait' : ''}`}>
      
      <div className="w-[80%] h-full overflow-y-scroll p-6 pl-8 pr-4 bg-gray-light [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-graphite/20 hover:[&::-webkit-scrollbar-thumb]:bg-graphite/30 [&::-webkit-scrollbar-thumb]:rounded-full transition-colors relative">
        
        <div className="mb-5 flex items-center justify-between mr-2">
            <div className="flex flex-col gap-1.5 items-start">
              <div className="flex items-center">
                  <button onClick={() => navigate(`/games/${gameId}`)} className="flex items-center gap-1 text-[14px] font-bold text-graphite-light hover:text-orange transition-colors uppercase tracking-wider">
                    <Icon name="chevron_left" className="w-3.5 h-3.5" />
                    Страница матча
                  </button>
                  {isReadOnly && (
                      <span className="ml-4 bg-status-rejected/10 text-status-rejected px-3 py-1 rounded-md text-[11px] font-black uppercase tracking-widest border border-status-rejected/20 shadow-sm">
                          Режим чтения (Протокол подписан)
                      </span>
                  )}
              </div>
            </div>

            <div className="bg-white/60 backdrop-blur-md border border-graphite/10 shadow-sm rounded-lg p-1.5 flex items-center gap-2">
                <div className="flex items-center gap-2 px-2">
                    <EditableTimePill 
                        label="Начало" 
                        field="actual_start_time" 
                        value={game.actual_start_time} 
                        onSave={handleSaveActualData} 
                        onClear={handleClearActualData} 
                        isReadOnly={isReadOnly}
                    />
                    <EditableTimePill 
                        label="Конец" 
                        field="actual_end_time" 
                        value={game.actual_end_time} 
                        onSave={handleSaveActualData} 
                        onClear={handleClearActualData} 
                        isReadOnly={isReadOnly}
                    />
                    
                    <div className="w-px h-6 bg-graphite/10 mx-1"></div>
                    
                    <EditableNumberPill 
                        label="Зрители" 
                        field="spectators" 
                        value={game.spectators} 
                        onSave={handleSaveActualData} 
                        isReadOnly={isReadOnly}
                    />
                </div>

                <Button 
                    onClick={() => setIsViewerOpen(true)} 
                    className="ml-2 !px-3 !py-1.5 !text-[11px] uppercase tracking-wider shrink-0" 
                    title="Открыть протокол"
                >
                    ПРОТОКОЛ
                </Button>
            </div>
        </div>

        <div className="mr-2 flex flex-col gap-6">
          
          <GameFlowAccordion 
            game={game} 
            events={events} 
            homeRoster={homeRoster} 
            awayRoster={awayRoster}
            timerSeconds={timerSeconds} 
            onSaveEvent={saveEventRow} 
            onDeleteEvent={(id) => setDeleteModalState({ isOpen: true, id, type: 'event' })}
            onToggleLineup={toggleLineup} 
            trackPlusMinus={trackPlusMinus} 
            onRequestPlusMinus={handleRequestPlusMinus} 
            isSaving={isSaving}
            goalieLog={goalieLog} 
            onGoalieChange={saveGoalieLog}
            isReadOnly={isReadOnly}
          />

          <SummaryTablesAccordion 
            game={game} 
            goalieLog={goalieLog} 
            shotsSummary={shotsSummary}
            homeRoster={homeRoster} 
            awayRoster={awayRoster}
            timerSeconds={timerSeconds} 
            onSaveGoalieLog={saveGoalieLog}
            onRequestDeleteGoalieLog={(id) => setDeleteModalState({ isOpen: true, id, type: 'goalie' })}
            onSaveShotsSummary={saveShotsSummary}
            isReadOnly={isReadOnly}
          />

          <ShootoutAccordion 
            game={game} events={events} homeRoster={homeRoster} awayRoster={awayRoster}
            currentPeriod={currentPeriod} soLength={soLength} periodLength={periodLength} otLength={otLength} periodsCount={periodsCount}
            onSaveEvent={saveEventRow} onDeleteEvent={(id) => setDeleteModalState({ isOpen: true, id, type: 'event' })}
            onFinishShootout={handleFinishShootout} 
            onReopenShootout={handleReopenShootout} 
            onUpdateStatus={handleUpdateShootoutStatus} 
            isSaving={isSaving}
            isReadOnly={isReadOnly}
          />

          {!isReadOnly && (
              <div className="mt-4 mb-12 flex justify-end">
                 <button onClick={() => setIsTechModalOpen(true)} className="px-6 py-3 bg-white text-status-rejected hover:bg-status-rejected hover:text-white border border-status-rejected/20 rounded-xl text-[13px] font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
                    <Icon name="whistle" className="w-4 h-4" />
                    Назначить технический результат
                 </button>
              </div>
          )}
        </div>
      </div>

      <TimerPanel 
        game={game} currentPeriod={currentPeriod} changePeriod={changePeriod}
        timerSeconds={timerSeconds} isTimerRunning={isTimerRunning} handleTimerAction={handleTimerAction}
        periodsCount={periodsCount} setPeriodsCount={setPeriodsCount}
        periodLength={periodLength} setPeriodLength={setPeriodLength} 
        otLength={otLength} setOtLength={setOtLength}
        soLength={soLength} setSoLength={setSoLength}
        saveTimerSettings={saveTimerSettings} 
        trackPlusMinus={trackPlusMinus} setTrackPlusMinus={setTrackPlusMinus}
        socketConnected={socket?.connected} 
        onRecalculate={handleRecalculateStats} 
        onFinishGame={handleFinishGameFromDesk} 
        isFinishing={isFinishingGame}
        isRecalculating={isRecalculatingStats}
        onSetTime={(secs) => {
          lockSocketUpdates();
          setTimerSeconds(secs);
          socket?.emit('timer_action', { gameId, action: 'set_time', seconds: secs });
        }}
        isReadOnly={isReadOnly}
      />

      <ConfirmModal 
        isOpen={deleteModalState.isOpen} onClose={() => setDeleteModalState({ isOpen: false, id: null, type: null })}
        onConfirm={confirmDeleteAction} isLoading={isSaving}
      />
      <GamePlusMinusModal 
        isOpen={plusMinusModalState.isOpen} onClose={() => setPlusMinusModalState(p => ({ ...p, isOpen: false }))}
        gameId={gameId} event={plusMinusModalState.event} scoringTeam={plusMinusModalState.scoringTeam} concedingTeam={plusMinusModalState.concedingTeam}
        scoringRoster={plusMinusModalState.scoringTeam?.id === game.home_team_id ? homeRoster : awayRoster}
        concedingRoster={plusMinusModalState.concedingTeam?.id === game.home_team_id ? homeRoster : awayRoster}
        onSuccess={loadInitialData}
      />
      <TechDefeatModal 
        isOpen={isTechModalOpen} onClose={() => setIsTechModalOpen(false)} game={game}
        onSuccess={() => { loadInitialData(); socket?.emit('score_updated', { gameId }); socket?.emit('game_updated', { gameId }); }}
      />
      <ProtocolViewerModal isOpen={isViewerOpen} onClose={() => setIsViewerOpen(false)} gameId={gameId} initialLeagueId={game.league_id} />

    </div>
  );
}