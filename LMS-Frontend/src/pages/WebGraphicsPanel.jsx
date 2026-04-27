import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';

// DND Kit импорты
import { 
  DndContext, 
  TouchSensor, 
  MouseSensor, 
  useSensor, 
  useSensors, 
  DragOverlay, 
  pointerWithin 
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
// ТОТ САМЫЙ ИМПОРТ, КОТОРЫЙ ВЫЗВАЛ ОШИБКУ:
import { snapCenterToCursor } from '@dnd-kit/modifiers';

import { useWebGraphicsPanel } from '../components/WebGraphicsPanel/useWebGraphicsPanel';
import { ScoreBoardWidget } from '../components/WebGraphicsPanel/ScoreBoardWidget';
import { EventBroadcastButton } from '../components/WebGraphicsPanel/EventBroadcastButton';
import { StaticBroadcastButton } from '../components/WebGraphicsPanel/StaticBroadcastButton';
import { AutoPlaylistWidget } from '../components/WebGraphicsPanel/AutoPlaylistWidget';
import { useAccess } from '../hooks/useAccess';
import { AccessFallback } from '../ui/AccessFallback';
import { getToken } from '../utils/helpers';

export function WebGraphicsPanel() {
  const { gameId } = useParams();

  // Устанавливаем заголовок вкладки
  useEffect(() => {
    document.title = 'Панель управления трансляцией | LMS';
  }, []);
  
  const {
    game, events, timerSeconds, currentPeriod, isTimerRunning, activePenalties,
    periodLength, otLength, socket, broadcastedGoals, broadcastedPenalties, 
    triggerOverlay, toggleStaticOverlay, activeStaticOverlay,
    isScoreboardVisible, toggleScoreboard, activeEventOverlay
  } = useWebGraphicsPanel(gameId);

  // --- ЛОГИКА АВТОРИЗАЦИИ ---
  const [authUser, setAuthUser] = useState(null);
  const activeLeague = authUser?.leagues?.find(l => l.id === game?.league_id) || null;
  const { checkAccess } = useAccess(authUser, activeLeague);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/me`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        const data = await res.json();
        if (data.success) setAuthUser(data.user);
      } catch (err) { console.error('Ошибка загрузки профиля', err); }
    };
    fetchUser();
  }, []);

  // --- СТЕЙТЫ ТАЙМЕРОВ ---
  const [intermissionMins, setIntermissionMins] = useState(2);
  const [intermissionTimeLeft, setIntermissionTimeLeft] = useState(2 * 60);
  const [isIntermissionRunning, setIsIntermissionRunning] = useState(false);

  const [prematchMins, setPrematchMins] = useState(10);
  const [prematchTimeLeft, setPrematchTimeLeft] = useState(10 * 60);
  const [isPrematchRunning, setIsPrematchRunning] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isIntermissionRunning && intermissionTimeLeft > 0) interval = setInterval(() => setIntermissionTimeLeft(prev => (prev <= 1 ? (setIsIntermissionRunning(false), 0) : prev - 1)), 1000);
    return () => clearInterval(interval);
  }, [isIntermissionRunning, intermissionTimeLeft]);

  useEffect(() => {
    let interval = null;
    if (isPrematchRunning && prematchTimeLeft > 0) interval = setInterval(() => setPrematchTimeLeft(prev => (prev <= 1 ? (setIsPrematchRunning(false), 0) : prev - 1)), 1000);
    return () => clearInterval(interval);
  }, [isPrematchRunning, prematchTimeLeft]);

  const syncIntermissionToObs = (running, timeLeft) => { if (activeStaticOverlay === 'intermission') toggleStaticOverlay('intermission', { isPaused: !running, timeLeft: timeLeft, endTime: running ? Date.now() + timeLeft * 1000 : null }, true); };
  const syncPrematchToObs = (running, timeLeft) => { if (activeStaticOverlay === 'prematch') toggleStaticOverlay('prematch', { isPaused: !running, timeLeft: timeLeft, endTime: running ? Date.now() + timeLeft * 1000 : null }, true); };

  const handleIntermissionStart = () => { if (intermissionTimeLeft > 0) { setIsIntermissionRunning(true); syncIntermissionToObs(true, intermissionTimeLeft); } };
  const handleIntermissionPause = () => { setIsIntermissionRunning(false); syncIntermissionToObs(false, intermissionTimeLeft); };
  const handleIntermissionStepper = (newMins) => { setIntermissionMins(newMins); const newTime = newMins * 60; setIsIntermissionRunning(false); setIntermissionTimeLeft(newTime); syncIntermissionToObs(false, newTime); };
  const handleIntermissionToggle = () => { if (activeStaticOverlay !== 'intermission') toggleStaticOverlay('intermission', { isPaused: !isIntermissionRunning, timeLeft: intermissionTimeLeft, endTime: isIntermissionRunning ? Date.now() + intermissionTimeLeft * 1000 : null }); else toggleStaticOverlay('intermission'); };

  const handlePrematchStart = () => { if (prematchTimeLeft > 0) { setIsPrematchRunning(true); syncPrematchToObs(true, prematchTimeLeft); } };
  const handlePrematchPause = () => { setIsPrematchRunning(false); syncPrematchToObs(false, prematchTimeLeft); };
  const handlePrematchStepper = (newMins) => { setPrematchMins(newMins); const newTime = newMins * 60; setIsPrematchRunning(false); setPrematchTimeLeft(newTime); syncPrematchToObs(false, newTime); };
  const handlePrematchToggle = () => { if (activeStaticOverlay !== 'prematch') toggleStaticOverlay('prematch', { isPaused: !isPrematchRunning, timeLeft: prematchTimeLeft, endTime: isPrematchRunning ? Date.now() + prematchTimeLeft * 1000 : null }); else toggleStaticOverlay('prematch'); };

  const [rosterSwitchSecs, setRosterSwitchSecs] = useState(8);
  const handleRosterStepper = (newSecs) => { setRosterSwitchSecs(newSecs); if (activeStaticOverlay === 'team_roster') toggleStaticOverlay('team_roster', { switchDuration: newSecs }, true); };
  const handleRosterToggle = () => { activeStaticOverlay !== 'team_roster' ? toggleStaticOverlay('team_roster', { switchDuration: rosterSwitchSecs }) : toggleStaticOverlay('team_roster'); };

  const [leadersSwitchSecs, setLeadersSwitchSecs] = useState(7);
  const handleLeadersStepper = (newSecs) => { setLeadersSwitchSecs(newSecs); if (activeStaticOverlay === 'team_leaders') toggleStaticOverlay('team_leaders', { switchDuration: newSecs }, true); };
  const handleLeadersToggle = () => { activeStaticOverlay !== 'team_leaders' ? toggleStaticOverlay('team_leaders', { switchDuration: leadersSwitchSecs }) : toggleStaticOverlay('team_leaders'); };

  const [arenaDurationSecs, setArenaDurationSecs] = useState(10);
  const handleArenaStepper = (newSecs) => { setArenaDurationSecs(newSecs); if (activeStaticOverlay === 'arena') toggleStaticOverlay('arena', { displayDuration: newSecs }, true); };
  const handleArenaToggle = () => { activeStaticOverlay !== 'arena' ? toggleStaticOverlay('arena', { displayDuration: arenaDurationSecs }) : toggleStaticOverlay('arena'); };

  const [commentatorDurationSecs, setcommentatorDurationSecs] = useState(10);
  const handleCommentatorStepper = (newSecs) => { setcommentatorDurationSecs(newSecs); if (activeStaticOverlay === 'commentator') toggleStaticOverlay('commentator', { displayDuration: newSecs }, true); };
  const handleCommentatorToggle = () => { activeStaticOverlay !== 'commentator' ? toggleStaticOverlay('commentator', { displayDuration: commentatorDurationSecs }) : toggleStaticOverlay('commentator'); };

  const [refereesDurationSecs, setRefereesDurationSecs] = useState(10);
  const handleRefereesStepper = (newSecs) => { setRefereesDurationSecs(newSecs); if (activeStaticOverlay === 'referees') toggleStaticOverlay('referees', { displayDuration: newSecs }, true); };
  const handleRefereesToggle = () => { activeStaticOverlay !== 'referees' ? toggleStaticOverlay('referees', { displayDuration: refereesDurationSecs }) : toggleStaticOverlay('referees'); };

  useEffect(() => {
    let timer;
    if (activeStaticOverlay === 'arena') timer = setTimeout(() => toggleStaticOverlay('arena'), arenaDurationSecs * 1000);
    else if (activeStaticOverlay === 'commentator') timer = setTimeout(() => toggleStaticOverlay('commentator'), commentatorDurationSecs * 1000);
    else if (activeStaticOverlay === 'referees') timer = setTimeout(() => toggleStaticOverlay('referees'), refereesDurationSecs * 1000);
    return () => clearTimeout(timer);
  }, [activeStaticOverlay, arenaDurationSecs, commentatorDurationSecs, refereesDurationSecs, toggleStaticOverlay]);

  const getOverlayPayload = (type) => {
    if (type === 'prematch') return { isPaused: !isPrematchRunning, timeLeft: prematchTimeLeft, endTime: isPrematchRunning ? Date.now() + prematchTimeLeft * 1000 : null };
    if (type === 'intermission') return { isPaused: !isIntermissionRunning, timeLeft: intermissionTimeLeft, endTime: isIntermissionRunning ? Date.now() + intermissionTimeLeft * 1000 : null };
    if (type === 'team_roster') return { switchDuration: rosterSwitchSecs };
    if (type === 'team_leaders') return { switchDuration: leadersSwitchSecs };
    if (type === 'arena') return { displayDuration: arenaDurationSecs };
    if (type === 'commentator') return { displayDuration: commentatorDurationSecs };
    if (type === 'referees') return { displayDuration: refereesDurationSecs };
    return null;
  };

  // ==========================================
  // ЛОГИКА DRAG & DROP (АВТОПИЛОТ)
  // ==========================================
  
  const [playlistSteps, setPlaylistSteps] = useState([
    { id: 'init-1', type: 'prematch', label: 'Предматчевая' },
    { id: 'init-2', type: 'team_leaders', label: 'Лидеры команд' },
    { id: 'init-3', type: 'team_roster', label: 'Составы' }
  ]);

  const [activeDragId, setActiveDragId] = useState(null);
  const [activeDragData, setActiveDragData] = useState(null);

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { 
    activationConstraint: { delay: 300, tolerance: 5 } 
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragStart = (e) => {
    if (navigator.vibrate) navigator.vibrate(50);
    setActiveDragId(e.active.id);
    setActiveDragData(e.active.data.current);
  };

  const handleDragEnd = (e) => {
    setActiveDragId(null);
    setActiveDragData(null);
    const { active, over } = e;
    
    if (!over) return; 

    const isSourceItem = active.data.current?.isSource; 
    const isPlaylistItem = active.data.current?.type === 'playlist-item'; 

    if (isSourceItem) {
        if (over.id === 'playlist-container' || over.data.current?.type === 'playlist-item') {
            const uniqueId = `item-${Date.now()}`;
            const newItem = { id: uniqueId, type: active.data.current.type, label: active.data.current.label };
            
            if (over.id === 'playlist-container') {
                setPlaylistSteps(prev => [...prev, newItem]);
            } else {
                const overIndex = playlistSteps.findIndex(s => s.id === over.id);
                setPlaylistSteps(prev => {
                    const newSteps = [...prev];
                    newSteps.splice(overIndex, 0, newItem);
                    return newSteps;
                });
            }
        }
    } else if (isPlaylistItem) {
        if (active.id !== over.id && over.data.current?.type === 'playlist-item') {
            const oldIndex = playlistSteps.findIndex(s => s.id === active.id);
            const newIndex = playlistSteps.findIndex(s => s.id === over.id);
            setPlaylistSteps(prev => arrayMove(prev, oldIndex, newIndex));
        }
    }
  };

  // ==========================================

  const gameStaffArray = useMemo(() => {
    if (!game?.officials) return [];
    return Object.entries(game.officials).filter(([role, off]) => off && off.id).map(([role, off]) => ({ user_id: off.id, role }));
  }, [game]);

  const canAccessGraphics = checkAccess('MATCH_WEB_GRAPHICS_PANEL', { gameStaff: gameStaffArray });

  if (!game || !authUser) return <div className="min-h-screen bg-gray-bg-light flex items-center justify-center font-bold text-xl uppercase tracking-widest text-graphite-light">Загрузка...</div>;
  if (!canAccessGraphics) return <div className="min-h-screen bg-gray-bg-light flex items-center justify-center px-10"><AccessFallback variant="full" message="У вас нет прав для управления веб-графикой матча." /></div>;

  const formatTime = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;
  const getEventDisplayTime = (secs, period) => {
    if (period === 'SO') return 'Буллиты';
    if (secs == null) return '';
    const pLen = periodLength * 60; let p = '1'; let relSecs = secs;
    if (secs > pLen * 3) { p = 'ОТ'; relSecs = secs - pLen * 3; } else if (secs > pLen * 2) { p = '3'; relSecs = secs - pLen * 2; } else if (secs > pLen) { p = '2'; relSecs = secs - pLen; }
    return `${p} пер - ${formatTime(relSecs)}`;
  };
  const sortEvents = (a, b) => { const periods = { 'SO': 5, 'OT': 4, '3': 3, '2': 2, '1': 1 }; if (periods[b.period] !== periods[a.period]) return periods[b.period] - periods[a.period]; return b.time_seconds - a.time_seconds; };

  const getGoalSignature = (g) => `${g.id}_${g.primary_player_id || 'x'}_${g.assist1_id || 'x'}_${g.assist2_id || 'x'}`;
  const validGoals = events.filter(e => e.event_type === 'goal' && e.primary_player_id).sort(sortEvents);
  const lastGoal = validGoals.length > 0 ? validGoals[0] : null;

  const getPenaltySignature = (p) => `${p.id}_${p.primary_player_id || 'x'}_${p.penalty_minutes || 'x'}_${p.penalty_violation || 'x'}`;
  const validPenalties = events.filter(e => e.event_type === 'penalty' && e.primary_player_id).sort(sortEvents);
  const lastPenalty = validPenalties.length > 0 ? validPenalties[0] : null;

  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={pointerWithin} 
      onDragStart={handleDragStart} 
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen w-full bg-gray-bg-light text-graphite font-sans flex flex-col overflow-hidden relative">
        <main className="flex-1 flex w-full h-full min-h-0">
          
          <aside className="w-[35%] h-full flex flex-col min-h-0 overflow-y-auto custom-scrollbar border-r border-graphite/5 bg-[#e8e8e8ff]">
            <ScoreBoardWidget game={game} currentPeriod={currentPeriod} isTimerRunning={isTimerRunning} activePenalties={activePenalties} timerSeconds={timerSeconds} periodLength={periodLength} otLength={otLength} isActive={isScoreboardVisible} onToggle={toggleScoreboard} />
            <div className="bg-white border-b border-graphite/10 mb-3 flex flex-col shrink-0">
              <div className="flex items-center justify-between px-4 py-3">
                 <div className="flex items-center gap-2">
                     <svg className="w-4 h-4 text-graphite/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                     <h3 className="text-[11px] font-black uppercase tracking-widest text-graphite/80 leading-none mt-0.5">Горячие события</h3>
                 </div>
              </div>
              <div className="flex min-w-0 border-t border-graphite/10">
                <div className="flex-1 min-w-0"><EventBroadcastButton type="goal" event={lastGoal} isActive={activeEventOverlay === (lastGoal ? getGoalSignature(lastGoal) : null)} isFaded={lastGoal ? broadcastedGoals.includes(getGoalSignature(lastGoal)) : false} isHome={lastGoal?.team_id === game.home_team_id} homeShortName={homeShortName} awayShortName={awayShortName} displayTime={lastGoal ? getEventDisplayTime(lastGoal.time_seconds, lastGoal.period) : ''} onClick={() => triggerOverlay('goal', lastGoal, getGoalSignature(lastGoal))} /></div>
                <div className="flex-1 min-w-0"><EventBroadcastButton type="penalty" event={lastPenalty} isActive={activeEventOverlay === (lastPenalty ? getPenaltySignature(lastPenalty) : null)} isFaded={lastPenalty ? broadcastedPenalties.includes(getPenaltySignature(lastPenalty)) : false} isHome={lastPenalty?.team_id === game.home_team_id} homeShortName={homeShortName} awayShortName={awayShortName} displayTime={lastPenalty ? getEventDisplayTime(lastPenalty.time_seconds, lastPenalty.period) : ''} onClick={() => triggerOverlay('penalty', lastPenalty, getPenaltySignature(lastPenalty))} /></div>
              </div>
            </div>

            <AutoPlaylistWidget 
              activeStaticOverlay={activeStaticOverlay}
              toggleStaticOverlay={toggleStaticOverlay}
              getOverlayPayload={getOverlayPayload}
              steps={playlistSteps}
              setSteps={setPlaylistSteps}
            />
          </aside>

          <section className="w-[65%] h-full flex flex-col min-h-0 bg-[#f8f9fa]">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-4 auto-rows-[187px] w-full border-t border-l border-graphite/10 bg-white">
                
                <StaticBroadcastButton title="Предматчевая" dragType="prematch" isActive={activeStaticOverlay === 'prematch'} onClick={handlePrematchToggle} hasTimer={true} timerValue={prematchMins} onTimerChange={handlePrematchStepper} timerDisplay={formatTime(prematchTimeLeft)} isTimerCritical={isPrematchRunning && prematchTimeLeft <= 60} isTimerRunning={isPrematchRunning} onTimerStart={handlePrematchStart} onTimerPause={handlePrematchPause} />
                <StaticBroadcastButton title="Перерыв" dragType="intermission" isActive={activeStaticOverlay === 'intermission'} onClick={handleIntermissionToggle} hasTimer={true} timerValue={intermissionMins} onTimerChange={handleIntermissionStepper} timerDisplay={formatTime(intermissionTimeLeft)} isTimerCritical={isIntermissionRunning && intermissionTimeLeft <= 60} isTimerRunning={isIntermissionRunning} onTimerStart={handleIntermissionStart} onTimerPause={handleIntermissionPause} />
                <StaticBroadcastButton title="Лидеры" dragType="team_leaders" isActive={activeStaticOverlay === 'team_leaders'} onClick={handleLeadersToggle} hasStepper={true} stepperLabel="Смена (сек)" stepperValue={leadersSwitchSecs} stepperMin={3} stepperMax={30} onStepperChange={handleLeadersStepper} />
                <StaticBroadcastButton title="Составы" dragType="team_roster" isActive={activeStaticOverlay === 'team_roster'} onClick={handleRosterToggle} hasStepper={true} stepperLabel="Смена (сек)" stepperValue={rosterSwitchSecs} stepperMin={3} stepperMax={30} onStepperChange={handleRosterStepper} />
                <StaticBroadcastButton title="Арена" dragType="arena" isActive={activeStaticOverlay === 'arena'} onClick={handleArenaToggle} hasStepper={true} stepperLabel="Показ (сек)" stepperValue={arenaDurationSecs} stepperMin={3} stepperMax={60} onStepperChange={handleArenaStepper} progressType="once" progressDuration={arenaDurationSecs} />
                <StaticBroadcastButton title="Комментатор" dragType="commentator" isActive={activeStaticOverlay === 'commentator'} onClick={handleCommentatorToggle} hasStepper={true} stepperLabel="Показ (сек)" stepperValue={commentatorDurationSecs} stepperMin={3} stepperMax={60} onStepperChange={handleCommentatorStepper} progressType="once" progressDuration={commentatorDurationSecs} />
                <StaticBroadcastButton title="Судьи" dragType="referees" isActive={activeStaticOverlay === 'referees'} onClick={handleRefereesToggle} hasStepper={true} stepperLabel="Показ (сек)" stepperValue={refereesDurationSecs} stepperMin={3} stepperMax={60} onStepperChange={handleRefereesStepper} progressType="once" progressDuration={refereesDurationSecs} />

              </div>
            </div>
          </section>
        </main>
      </div>

      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeDragData ? (
          activeDragData.isSource ? (
            <div className="w-[160px] p-3 bg-white/90 backdrop-blur-md border-2 border-status-accepted rounded-xl shadow-2xl scale-105 flex items-center justify-center opacity-90">
               <span className="text-[12px] font-black uppercase tracking-widest text-status-accepted">{activeDragData.label}</span>
            </div>
          ) : (
            <div className="w-[250px] bg-white border-2 border-status-accepted rounded-md p-2 shadow-2xl scale-105 flex items-center gap-2 opacity-90">
               <span className="text-[11px] font-bold uppercase tracking-wider text-status-accepted truncate">
                 {activeDragData.step.label}
               </span>
            </div>
          )
        ) : null}
      </DragOverlay>

    </DndContext>
  );
}