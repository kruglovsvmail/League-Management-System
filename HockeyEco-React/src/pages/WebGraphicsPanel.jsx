import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWebGraphicsPanel } from '../components/WebGraphicsPanel/useWebGraphicsPanel';
import { ScoreBoardWidget } from '../components/WebGraphicsPanel/ScoreBoardWidget';
import { EventBroadcastButton } from '../components/WebGraphicsPanel/EventBroadcastButton';
import { StaticBroadcastButton } from '../components/WebGraphicsPanel/StaticBroadcastButton';
import { AutoPlaylistWidget } from '../components/WebGraphicsPanel/AutoPlaylistWidget';

export function WebGraphicsPanel() {
  const { gameId } = useParams();
  
  const {
    game, events, timerSeconds, currentPeriod, isTimerRunning, activePenalties,
    periodLength, otLength, socket, broadcastedGoals, broadcastedPenalties, 
    triggerOverlay, toggleStaticOverlay, activeStaticOverlay,
    isScoreboardVisible, toggleScoreboard
  } = useWebGraphicsPanel(gameId);

  // --- СТЕЙТЫ И ЛОГИКА ДЛЯ ПЕРЕРЫВА И ПРЕДМАТЧЕВОЙ ---
  const [intermissionMins, setIntermissionMins] = useState(15);
  const [intermissionTimeLeft, setIntermissionTimeLeft] = useState(15 * 60);
  const [isIntermissionRunning, setIsIntermissionRunning] = useState(false);

  const [prematchMins, setPrematchMins] = useState(10);
  const [prematchTimeLeft, setPrematchTimeLeft] = useState(10 * 60);
  const [isPrematchRunning, setIsPrematchRunning] = useState(false);

  // Таймеры перерыва и предматчевой
  useEffect(() => {
    let interval = null;
    if (isIntermissionRunning && intermissionTimeLeft > 0) {
      interval = setInterval(() => setIntermissionTimeLeft(prev => (prev <= 1 ? (setIsIntermissionRunning(false), 0) : prev - 1)), 1000);
    }
    return () => clearInterval(interval);
  }, [isIntermissionRunning, intermissionTimeLeft]);

  useEffect(() => {
    let interval = null;
    if (isPrematchRunning && prematchTimeLeft > 0) {
      interval = setInterval(() => setPrematchTimeLeft(prev => (prev <= 1 ? (setIsPrematchRunning(false), 0) : prev - 1)), 1000);
    }
    return () => clearInterval(interval);
  }, [isPrematchRunning, prematchTimeLeft]);

  // Функции синхронизации с OBS (Таймеры)
  const syncIntermissionToObs = (running, timeLeft) => {
    if (activeStaticOverlay === 'intermission') toggleStaticOverlay('intermission', { isPaused: !running, timeLeft: timeLeft, endTime: running ? Date.now() + timeLeft * 1000 : null }, true);
  };
  const syncPrematchToObs = (running, timeLeft) => {
    if (activeStaticOverlay === 'prematch') toggleStaticOverlay('prematch', { isPaused: !running, timeLeft: timeLeft, endTime: running ? Date.now() + timeLeft * 1000 : null }, true);
  };

  // Хендлеры ПЕРЕРЫВА
  const handleIntermissionStart = () => { if (intermissionTimeLeft > 0) { setIsIntermissionRunning(true); syncIntermissionToObs(true, intermissionTimeLeft); } };
  const handleIntermissionPause = () => { setIsIntermissionRunning(false); syncIntermissionToObs(false, intermissionTimeLeft); };
  const handleIntermissionStepper = (newMins) => { setIntermissionMins(newMins); const newTime = newMins * 60; setIsIntermissionRunning(false); setIntermissionTimeLeft(newTime); syncIntermissionToObs(false, newTime); };
  const handleIntermissionToggle = () => {
    if (activeStaticOverlay !== 'intermission') toggleStaticOverlay('intermission', { isPaused: !isIntermissionRunning, timeLeft: intermissionTimeLeft, endTime: isIntermissionRunning ? Date.now() + intermissionTimeLeft * 1000 : null });
    else toggleStaticOverlay('intermission'); 
  };

  // Хендлеры ПРЕДМАТЧЕВОЙ
  const handlePrematchStart = () => { if (prematchTimeLeft > 0) { setIsPrematchRunning(true); syncPrematchToObs(true, prematchTimeLeft); } };
  const handlePrematchPause = () => { setIsPrematchRunning(false); syncPrematchToObs(false, prematchTimeLeft); };
  const handlePrematchStepper = (newMins) => { setPrematchMins(newMins); const newTime = newMins * 60; setIsPrematchRunning(false); setPrematchTimeLeft(newTime); syncPrematchToObs(false, newTime); };
  const handlePrematchToggle = () => {
    if (activeStaticOverlay !== 'prematch') toggleStaticOverlay('prematch', { isPaused: !isPrematchRunning, timeLeft: prematchTimeLeft, endTime: isPrematchRunning ? Date.now() + prematchTimeLeft * 1000 : null });
    else toggleStaticOverlay('prematch'); 
  };

  // --- СТЕЙТЫ КАРУСЕЛЕЙ (СОСТАВЫ И ЛИДЕРЫ) ---
  const [rosterSwitchSecs, setRosterSwitchSecs] = useState(8);
  const handleRosterStepper = (newSecs) => { setRosterSwitchSecs(newSecs); if (activeStaticOverlay === 'team_roster') toggleStaticOverlay('team_roster', { switchDuration: newSecs }, true); };
  const handleRosterToggle = () => { activeStaticOverlay !== 'team_roster' ? toggleStaticOverlay('team_roster', { switchDuration: rosterSwitchSecs }) : toggleStaticOverlay('team_roster'); };

  const [leadersSwitchSecs, setLeadersSwitchSecs] = useState(7);
  const handleLeadersStepper = (newSecs) => { setLeadersSwitchSecs(newSecs); if (activeStaticOverlay === 'team_leaders') toggleStaticOverlay('team_leaders', { switchDuration: newSecs }, true); };
  const handleLeadersToggle = () => { activeStaticOverlay !== 'team_leaders' ? toggleStaticOverlay('team_leaders', { switchDuration: leadersSwitchSecs }) : toggleStaticOverlay('team_leaders'); };

  // --- СТЕЙТЫ ОДНОРАЗОВЫХ ПЛАШЕК (АРЕНА, КОММЕНТАТОР, СУдьИ) ---
  const [arenaDurationSecs, setArenaDurationSecs] = useState(10);
  const handleArenaStepper = (newSecs) => { setArenaDurationSecs(newSecs); if (activeStaticOverlay === 'arena') toggleStaticOverlay('arena', { displayDuration: newSecs }, true); };
  const handleArenaToggle = () => { activeStaticOverlay !== 'arena' ? toggleStaticOverlay('arena', { displayDuration: arenaDurationSecs }) : toggleStaticOverlay('arena'); };

  const [commentatorDurationSecs, setCommentatorDurationSecs] = useState(10);
  const handleCommentatorStepper = (newSecs) => { setCommentatorDurationSecs(newSecs); if (activeStaticOverlay === 'commentator') toggleStaticOverlay('commentator', { displayDuration: newSecs }, true); };
  const handleCommentatorToggle = () => { activeStaticOverlay !== 'commentator' ? toggleStaticOverlay('commentator', { displayDuration: commentatorDurationSecs }) : toggleStaticOverlay('commentator'); };

  const [refereesDurationSecs, setRefereesDurationSecs] = useState(10);
  const handleRefereesStepper = (newSecs) => { setRefereesDurationSecs(newSecs); if (activeStaticOverlay === 'referees') toggleStaticOverlay('referees', { displayDuration: newSecs }, true); };
  const handleRefereesToggle = () => { activeStaticOverlay !== 'referees' ? toggleStaticOverlay('referees', { displayDuration: refereesDurationSecs }) : toggleStaticOverlay('referees'); };

  // АВТО-ОТКЛЮЧЕНИЕ ПЛАШЕК ПО ТАЙМЕРУ (Зеленая полоса гаснет)
  useEffect(() => {
    let timer;
    if (activeStaticOverlay === 'arena') {
      timer = setTimeout(() => toggleStaticOverlay('arena'), arenaDurationSecs * 1000);
    } else if (activeStaticOverlay === 'commentator') {
      timer = setTimeout(() => toggleStaticOverlay('commentator'), commentatorDurationSecs * 1000);
    } else if (activeStaticOverlay === 'referees') {
      timer = setTimeout(() => toggleStaticOverlay('referees'), refereesDurationSecs * 1000);
    }
    return () => clearTimeout(timer);
  }, [activeStaticOverlay, arenaDurationSecs, commentatorDurationSecs, refereesDurationSecs, toggleStaticOverlay]);

  // --- ФУНКЦИЯ ДЛЯ АВТОПИЛОТА И СИНХРОНИЗАЦИИ ---
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

  if (!game) return (
    <div className="min-h-screen bg-gray-bg-light flex items-center justify-center font-bold text-xl uppercase tracking-widest text-graphite-light">
      Загрузка...
    </div>
  );

  const formatTime = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  const getEventDisplayTime = (secs, period) => {
    if (period === 'SO') return 'Буллиты';
    if (secs == null) return '';
    const pLen = periodLength * 60;
    let p = '1'; let relSecs = secs;
    if (secs > pLen * 3) { p = 'ОТ'; relSecs = secs - pLen * 3; } 
    else if (secs > pLen * 2) { p = '3'; relSecs = secs - pLen * 2; } 
    else if (secs > pLen) { p = '2'; relSecs = secs - pLen; }
    return `${p} пер • ${formatTime(relSecs)}`;
  };

  const sortEvents = (a, b) => {
    const periods = { 'SO': 5, 'OT': 4, '3': 3, '2': 2, '1': 1 };
    if (periods[b.period] !== periods[a.period]) return periods[b.period] - periods[a.period];
    return b.time_seconds - a.time_seconds;
  };

  const getGoalSignature = (g) => `${g.id}_${g.primary_player_id || 'x'}_${g.assist1_id || 'x'}_${g.assist2_id || 'x'}`;
  const validGoals = events.filter(e => e.event_type === 'goal' && e.primary_player_id).sort(sortEvents);
  const lastGoal = validGoals.length > 0 ? validGoals[0] : null;

  const getPenaltySignature = (p) => `${p.id}_${p.primary_player_id || 'x'}_${p.penalty_minutes || 'x'}_${p.penalty_violation || 'x'}`;
  const validPenalties = events.filter(e => e.event_type === 'penalty' && e.primary_player_id).sort(sortEvents);
  const lastPenalty = validPenalties.length > 0 ? validPenalties[0] : null;

  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  return (
    <div className="h-screen w-full bg-gray-bg-light text-graphite font-sans flex flex-col overflow-hidden relative">
      
      <main className="flex-1 flex w-full h-full min-h-0">
        
        {/* ЛЕВАЯ КОЛОНКА */}
        <aside className="w-[30%] h-full flex flex-col min-h-0 overflow-y-auto custom-scrollbar border-r border-graphite/5 bg-graphite/5">
          
          <ScoreBoardWidget 
            game={game} currentPeriod={currentPeriod} isTimerRunning={isTimerRunning}
            activePenalties={activePenalties} timerSeconds={timerSeconds}
            periodLength={periodLength} otLength={otLength}
            isActive={isScoreboardVisible}
            onToggle={toggleScoreboard}
          />

          <AutoPlaylistWidget 
            activeStaticOverlay={activeStaticOverlay}
            toggleStaticOverlay={toggleStaticOverlay}
            getOverlayPayload={getOverlayPayload}
          />

          <div className="p-4 flex flex-col gap-4">
            <EventBroadcastButton 
              type="goal" event={lastGoal}
              isFaded={lastGoal ? broadcastedGoals.includes(getGoalSignature(lastGoal)) : false}
              isHome={lastGoal?.team_id === game.home_team_id}
              homeShortName={homeShortName} awayShortName={awayShortName}
              displayTime={lastGoal ? getEventDisplayTime(lastGoal.time_seconds, lastGoal.period) : ''}
              onClick={() => triggerOverlay('goal', lastGoal, getGoalSignature(lastGoal))}
            />

            <EventBroadcastButton 
              type="penalty" event={lastPenalty}
              isFaded={lastPenalty ? broadcastedPenalties.includes(getPenaltySignature(lastPenalty)) : false}
              isHome={lastPenalty?.team_id === game.home_team_id}
              homeShortName={homeShortName} awayShortName={awayShortName}
              displayTime={lastPenalty ? getEventDisplayTime(lastPenalty.time_seconds, lastPenalty.period) : ''}
              onClick={() => triggerOverlay('penalty', lastPenalty, getPenaltySignature(lastPenalty))}
            />
          </div>

        </aside>

        {/* ПРАВАЯ КОЛОНКА */}
        <section className="w-[70%] h-full flex flex-col min-h-0 bg-[#f8f9fa]">
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-3 auto-rows-[175px] w-full border-t border-l border-graphite/10 bg-white">
              
              <StaticBroadcastButton 
                title="Предматчевая" 
                isActive={activeStaticOverlay === 'prematch'}
                onClick={handlePrematchToggle}
                hasTimer={true}
                timerValue={prematchMins}
                onTimerChange={handlePrematchStepper}
                timerDisplay={formatTime(prematchTimeLeft)}
                isTimerCritical={isPrematchRunning && prematchTimeLeft <= 60}
                isTimerRunning={isPrematchRunning}
                onTimerStart={handlePrematchStart}
                onTimerPause={handlePrematchPause}
              />

              <StaticBroadcastButton 
                title="Лидеры команд" 
                isActive={activeStaticOverlay === 'team_leaders'}
                onClick={handleLeadersToggle}
                hasStepper={true}
                stepperLabel="Смена (сек)"
                stepperValue={leadersSwitchSecs}
                stepperMin={3}
                stepperMax={30}
                onStepperChange={handleLeadersStepper}
              />

              <StaticBroadcastButton 
                title="Составы" 
                isActive={activeStaticOverlay === 'team_roster'}
                onClick={handleRosterToggle}
                hasStepper={true}
                stepperLabel="Смена (сек)"
                stepperValue={rosterSwitchSecs}
                stepperMin={3}
                stepperMax={30}
                onStepperChange={handleRosterStepper}
              />

              <StaticBroadcastButton 
                title="Облет арены" 
                isActive={activeStaticOverlay === 'arena'}
                onClick={handleArenaToggle}
                hasStepper={true}
                stepperLabel="Показ (сек)"
                stepperValue={arenaDurationSecs}
                stepperMin={3}
                stepperMax={60}
                onStepperChange={handleArenaStepper}
                progressType="once"
                progressDuration={arenaDurationSecs}
              />

              {/* Новая кнопка Комментатор */}
              <StaticBroadcastButton 
                title="Комментатор" 
                isActive={activeStaticOverlay === 'commentator'}
                onClick={handleCommentatorToggle}
                hasStepper={true}
                stepperLabel="Показ (сек)"
                stepperValue={commentatorDurationSecs}
                stepperMin={3}
                stepperMax={60}
                onStepperChange={handleCommentatorStepper}
                progressType="once"
                progressDuration={commentatorDurationSecs}
              />

              {/* Новая кнопка Судьи */}
              <StaticBroadcastButton 
                title="Судьи матча" 
                isActive={activeStaticOverlay === 'referees'}
                onClick={handleRefereesToggle}
                hasStepper={true}
                stepperLabel="Показ (сек)"
                stepperValue={refereesDurationSecs}
                stepperMin={3}
                stepperMax={60}
                onStepperChange={handleRefereesStepper}
                progressType="once"
                progressDuration={refereesDurationSecs}
              />

              <StaticBroadcastButton 
                title="Перерыв" 
                isActive={activeStaticOverlay === 'intermission'}
                onClick={handleIntermissionToggle}
                hasTimer={true}
                timerValue={intermissionMins}
                onTimerChange={handleIntermissionStepper}
                timerDisplay={formatTime(intermissionTimeLeft)}
                isTimerCritical={isIntermissionRunning && intermissionTimeLeft <= 60}
                isTimerRunning={isIntermissionRunning}
                onTimerStart={handleIntermissionStart}
                onTimerPause={handleIntermissionPause}
              />
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}