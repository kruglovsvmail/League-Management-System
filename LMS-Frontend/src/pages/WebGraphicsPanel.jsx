import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { ScoreboardBroadcastButton } from '../components/WebGraphicsPanel/ScoreboardBroadcastButton';
import { GameEventsWidget } from '../components/WebGraphicsPanel/GameEventsWidget';
import { StaticBroadcastButton } from '../components/WebGraphicsPanel/StaticBroadcastButton';
import { AutoPlaylistWidget } from '../components/WebGraphicsPanel/AutoPlaylistWidget';
import { AudioPlayerWidget } from '../components/WebGraphicsPanel/AudioPlayerWidget';
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
    periodLength, otLength, socket, broadcastedEvents,
    triggerOverlay, toggleStaticOverlay, activeStaticOverlay,
    isScoreboardVisible, toggleScoreboard, activeEventOverlay,
    autoShowSettings, updateAutoShowSettings, getEventSignature,
    ttsEvents, updateTtsEvents,
    audioVolume, setAudioVolume,
    audioPlaying, audioSource,
    introPlaying, setIntroPlaying,
    playlistSteps, setPlaylistSteps,
    autopilotDuration, setAutopilotDuration,
    autopilotLoop, setAutopilotLoop,
    autopilotRunning, autopilotIndex,
    startAutopilotServer, stopAutopilotServer,
    forceResyncOverlay,
    overlayParams, persistParams,
    overlayCount,
    overlayMismatch,
  } = useWebGraphicsPanel(gameId);

  const [resyncSent, setResyncSent] = useState(false);
  const handleForceResync = () => {
    // Панель — источник истины. Сначала пишем текущее состояние панели в БД
    // (перекрывая возможно устаревшие данные), затем OBS переподключается и
    // читает уже корректное состояние. Без этого дебаунс persist-эффекта (250мс)
    // может не успеть записать null, и OBS восстановит старую плашку из БД.
    socket?.emit('update_overlay_state', {
      gameId,
      staticOverlay: activeStaticOverlay
        ? { type: activeStaticOverlay, data: getOverlayPayload(activeStaticOverlay) }
        : null,
    });
    forceResyncOverlay();
    setResyncSent(true);
    setTimeout(() => setResyncSent(false), 2500);
  };

  // Применяем синхронизированные параметры плашек, прилетевшие от другого режиссёра / из БД.
  useEffect(() => {
    if (!overlayParams) return;
    const p = overlayParams;
    if (typeof p.rosterSwitch === 'number') setRosterSwitchSecs(p.rosterSwitch);
    if (typeof p.leadersSwitch === 'number') setLeadersSwitchSecs(p.leadersSwitch);
    if (typeof p.arenaDuration === 'number') setArenaDurationSecs(p.arenaDuration);
    if (typeof p.commentatorDuration === 'number') setcommentatorDurationSecs(p.commentatorDuration);
    if (typeof p.refereesDuration === 'number') setRefereesDurationSecs(p.refereesDuration);

    // Отсчёты: running → считаем остаток из endTime; пауза → берём замороженный timeLeft.
    if (p.prematch) {
      const pm = p.prematch;
      if (typeof pm.mins === 'number') setPrematchMins(pm.mins);
      if (pm.running && typeof pm.endTime === 'number') {
        prematchEndTimeRef.current = pm.endTime;
        setPrematchTimeLeft(Math.max(0, Math.round((pm.endTime - Date.now()) / 1000)));
        setIsPrematchRunning(true);
      } else {
        prematchEndTimeRef.current = null;
        setIsPrematchRunning(false);
        if (typeof pm.timeLeft === 'number') setPrematchTimeLeft(pm.timeLeft);
      }
    }
    if (p.intermission) {
      const im = p.intermission;
      if (typeof im.mins === 'number') setIntermissionMins(im.mins);
      if (im.running && typeof im.endTime === 'number') {
        intermissionEndTimeRef.current = im.endTime;
        setIntermissionTimeLeft(Math.max(0, Math.round((im.endTime - Date.now()) / 1000)));
        setIsIntermissionRunning(true);
      } else {
        intermissionEndTimeRef.current = null;
        setIsIntermissionRunning(false);
        if (typeof im.timeLeft === 'number') setIntermissionTimeLeft(im.timeLeft);
      }
    }
  }, [overlayParams]);

  // Старт серверного автопилота: разрешаем плейлист (каждый шаг получает свои данные через getOverlayPayload).
  const handleStartAutopilot = () => {
    const resolved = playlistSteps.map(s => ({ id: s.id, type: s.type, label: s.label, data: getOverlayPayload(s.type) }));
    startAutopilotServer(resolved, autopilotDuration, autopilotLoop && playlistSteps.length > 1);
  };

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

  // Отсчёты идут по endTime (как основной таймер): оба режиссёра считают остаток из одной точки.
  const prematchEndTimeRef = useRef(null);
  const intermissionEndTimeRef = useRef(null);

  useEffect(() => {
    if (!isIntermissionRunning) return;
    const tick = () => {
      const left = intermissionEndTimeRef.current ? Math.max(0, Math.round((intermissionEndTimeRef.current - Date.now()) / 1000)) : 0;
      setIntermissionTimeLeft(left);
      if (left <= 0) setIsIntermissionRunning(false);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [isIntermissionRunning]);

  useEffect(() => {
    if (!isPrematchRunning) return;
    const tick = () => {
      const left = prematchEndTimeRef.current ? Math.max(0, Math.round((prematchEndTimeRef.current - Date.now()) / 1000)) : 0;
      setPrematchTimeLeft(left);
      if (left <= 0) setIsPrematchRunning(false);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [isPrematchRunning]);

  const syncIntermissionToObs = (running, timeLeft) => { if (activeStaticOverlay === 'intermission') toggleStaticOverlay('intermission', { isPaused: !running, timeLeft: timeLeft, endTime: running ? Date.now() + timeLeft * 1000 : null }, true); };
  const syncPrematchToObs = (running, timeLeft) => { if (activeStaticOverlay === 'prematch') toggleStaticOverlay('prematch', { isPaused: !running, timeLeft: timeLeft, endTime: running ? Date.now() + timeLeft * 1000 : null }, true); };

  const handleIntermissionStart = () => { if (intermissionTimeLeft > 0) { const endTime = Date.now() + intermissionTimeLeft * 1000; intermissionEndTimeRef.current = endTime; setIsIntermissionRunning(true); syncIntermissionToObs(true, intermissionTimeLeft); persistParams({ intermission: { running: true, endTime, mins: intermissionMins } }); } };
  const handleIntermissionPause = () => { const left = intermissionEndTimeRef.current ? Math.max(0, Math.round((intermissionEndTimeRef.current - Date.now()) / 1000)) : intermissionTimeLeft; setIsIntermissionRunning(false); setIntermissionTimeLeft(left); intermissionEndTimeRef.current = null; syncIntermissionToObs(false, left); persistParams({ intermission: { running: false, timeLeft: left, mins: intermissionMins } }); };
  const handleIntermissionStepper = (newMins) => { setIntermissionMins(newMins); const newTime = newMins * 60; setIsIntermissionRunning(false); setIntermissionTimeLeft(newTime); intermissionEndTimeRef.current = null; syncIntermissionToObs(false, newTime); persistParams({ intermission: { running: false, timeLeft: newTime, mins: newMins } }); };
  const handleIntermissionToggle = () => { if (activeStaticOverlay !== 'intermission') toggleStaticOverlay('intermission', { isPaused: !isIntermissionRunning, timeLeft: intermissionTimeLeft, endTime: isIntermissionRunning ? Date.now() + intermissionTimeLeft * 1000 : null }); else toggleStaticOverlay('intermission'); };

  const handlePrematchStart = () => { if (prematchTimeLeft > 0) { const endTime = Date.now() + prematchTimeLeft * 1000; prematchEndTimeRef.current = endTime; setIsPrematchRunning(true); syncPrematchToObs(true, prematchTimeLeft); persistParams({ prematch: { running: true, endTime, mins: prematchMins } }); } };
  const handlePrematchPause = () => { const left = prematchEndTimeRef.current ? Math.max(0, Math.round((prematchEndTimeRef.current - Date.now()) / 1000)) : prematchTimeLeft; setIsPrematchRunning(false); setPrematchTimeLeft(left); prematchEndTimeRef.current = null; syncPrematchToObs(false, left); persistParams({ prematch: { running: false, timeLeft: left, mins: prematchMins } }); };
  const handlePrematchStepper = (newMins) => { setPrematchMins(newMins); const newTime = newMins * 60; setIsPrematchRunning(false); setPrematchTimeLeft(newTime); prematchEndTimeRef.current = null; syncPrematchToObs(false, newTime); persistParams({ prematch: { running: false, timeLeft: newTime, mins: newMins } }); };
  const handlePrematchToggle = () => { if (activeStaticOverlay !== 'prematch') toggleStaticOverlay('prematch', { isPaused: !isPrematchRunning, timeLeft: prematchTimeLeft, endTime: isPrematchRunning ? Date.now() + prematchTimeLeft * 1000 : null }); else toggleStaticOverlay('prematch'); };

  const [rosterSwitchSecs, setRosterSwitchSecs] = useState(8);
  const handleRosterStepper = (newSecs) => { setRosterSwitchSecs(newSecs); persistParams({ rosterSwitch: newSecs }); if (activeStaticOverlay === 'team_roster') toggleStaticOverlay('team_roster', { switchDuration: newSecs }, true); };
  const handleRosterToggle = () => { activeStaticOverlay !== 'team_roster' ? toggleStaticOverlay('team_roster', { switchDuration: rosterSwitchSecs }) : toggleStaticOverlay('team_roster'); };

  const [leadersSwitchSecs, setLeadersSwitchSecs] = useState(7);
  const handleLeadersStepper = (newSecs) => { setLeadersSwitchSecs(newSecs); persistParams({ leadersSwitch: newSecs }); if (activeStaticOverlay === 'team_leaders') toggleStaticOverlay('team_leaders', { switchDuration: newSecs }, true); };
  const handleLeadersToggle = () => { activeStaticOverlay !== 'team_leaders' ? toggleStaticOverlay('team_leaders', { switchDuration: leadersSwitchSecs }) : toggleStaticOverlay('team_leaders'); };

  const [arenaDurationSecs, setArenaDurationSecs] = useState(10);
  const handleArenaStepper = (newSecs) => { setArenaDurationSecs(newSecs); persistParams({ arenaDuration: newSecs }); if (activeStaticOverlay === 'arena') toggleStaticOverlay('arena', { displayDuration: newSecs }, true); };
  const handleArenaToggle = () => { activeStaticOverlay !== 'arena' ? toggleStaticOverlay('arena', { displayDuration: arenaDurationSecs }) : toggleStaticOverlay('arena'); };

  const [commentatorDurationSecs, setcommentatorDurationSecs] = useState(10);
  const handleCommentatorStepper = (newSecs) => { setcommentatorDurationSecs(newSecs); persistParams({ commentatorDuration: newSecs }); if (activeStaticOverlay === 'commentator') toggleStaticOverlay('commentator', { displayDuration: newSecs }, true); };
  const handleCommentatorToggle = () => { activeStaticOverlay !== 'commentator' ? toggleStaticOverlay('commentator', { displayDuration: commentatorDurationSecs }) : toggleStaticOverlay('commentator'); };

  const [refereesDurationSecs, setRefereesDurationSecs] = useState(10);
  const handleRefereesStepper = (newSecs) => { setRefereesDurationSecs(newSecs); persistParams({ refereesDuration: newSecs }); if (activeStaticOverlay === 'referees') toggleStaticOverlay('referees', { displayDuration: newSecs }, true); };
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
  
  // playlistSteps теперь живёт в хуке (централизованно, с восстановлением из БД)
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen w-full bg-gray-bg-light text-graphite font-sans flex flex-col overflow-hidden relative">
        <main className="flex-1 flex w-full h-full min-h-0">

          <section className="flex-1 h-full flex flex-col min-h-0 bg-[#f8f9fa]">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-3 auto-rows-[260px] w-full border-t border-l border-graphite/10 bg-white">

                <ScoreboardBroadcastButton game={game} currentPeriod={currentPeriod} isTimerRunning={isTimerRunning} activePenalties={activePenalties} timerSeconds={timerSeconds} periodLength={periodLength} otLength={otLength} isActive={isScoreboardVisible} onClick={toggleScoreboard} />
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

          <aside className="w-[28%] h-full flex flex-col min-h-0 overflow-y-auto custom-scrollbar border-l border-graphite/5 bg-[#e8e8e8ff]">
            <button
              onClick={handleForceResync}
              className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 border-b border-graphite/10 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                overlayMismatch && !resyncSent ? 'bg-amber-400/10 hover:bg-amber-400/20' : 'bg-white hover:bg-graphite/5'
              }`}
              title="Заставить все OBS-оверлеи заново подключиться и перечитать состояние с сервера"
            >
              {resyncSent ? (
                <span className="text-status-accepted">Отправлено ✓</span>
              ) : overlayMismatch ? (
                <>
                  <span className="w-2 h-2 rounded-full shrink-0 bg-amber-400 animate-pulse" />
                  <span className="text-amber-500">Рассинхрон — синхронизировать</span>
                </>
              ) : (
                <>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    overlayCount === null ? 'bg-graphite/20' :
                    overlayCount === 0    ? 'bg-red-400' :
                                           'bg-green-400'
                  }`} />
                  <span className={
                    overlayCount === null ? 'text-graphite/40' :
                    overlayCount === 0    ? 'text-red-400' :
                                           'text-graphite/70'
                  }>
                    {overlayCount === null && 'Нет данных об оверлее'}
                    {overlayCount === 0    && 'Оверлей не подключён'}
                    {overlayCount > 0      && `● ${overlayCount} оверле${overlayCount === 1 ? 'й' : 'я'} онлайн`}
                  </span>
                </>
              )}
            </button>
            <AutoPlaylistWidget
              steps={playlistSteps}
              setSteps={setPlaylistSteps}
              duration={autopilotDuration}
              setDuration={setAutopilotDuration}
              isLoop={autopilotLoop}
              setIsLoop={setAutopilotLoop}
              isRunning={autopilotRunning}
              currentIndex={autopilotIndex}
              onStart={handleStartAutopilot}
              onStop={stopAutopilotServer}
            />

            <AudioPlayerWidget gameId={gameId} socket={socket} volume={audioVolume} setVolume={setAudioVolume} audioPlaying={audioPlaying} audioSource={audioSource} introPlaying={introPlaying} setIntroPlaying={setIntroPlaying} persistParams={persistParams} />

            <div className="flex-1 min-h-0">
              <GameEventsWidget
                events={events}
                game={game}
                periodLength={periodLength}
                broadcastedEvents={broadcastedEvents}
                activeEventOverlay={activeEventOverlay}
                triggerOverlay={triggerOverlay}
                getEventSignature={getEventSignature}
                autoShowSettings={autoShowSettings}
                updateAutoShowSettings={updateAutoShowSettings}
                ttsEvents={ttsEvents}
                updateTtsEvents={updateTtsEvents}
              />
            </div>
          </aside>
        </main>
      </div>

      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeDragData ? (
          activeDragData.isSource ? (
            <div className="w-[160px] p-3 bg-white/90 backdrop-blur-md border-2 border-status-accepted rounded-md shadow-2xl scale-105 flex items-center justify-center opacity-90">
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