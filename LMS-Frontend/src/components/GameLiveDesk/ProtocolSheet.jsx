// src/components/GameLiveDesk/ProtocolSheet.jsx
import React, { useState, useEffect } from 'react';
import { 
  formatTime, parseTime, formatTimeMask, localizePosition, calculatePenaltyTimelines, 
  CustomSelect, StylishSelect, StylishInput, 
  goalStrengthOptions, penaltyMinsOptions, penaltyReasonOptions, getPenaltyReasonCode, GOAL_STRENGTH_DISPLAY
} from './GameDeskShared';
import { Icon } from '../../ui/Icon';

const TimeoutPill = ({ timeoutEvent, timerSeconds, onSave, onDelete, isReadOnly }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempVal, setTempVal] = useState('');

    useEffect(() => {
        if (isEditing && timeoutEvent) {
            setTempVal(formatTime(timeoutEvent.time_seconds));
        }
    }, [isEditing, timeoutEvent]);

    const handleSaveAction = () => {
        setIsEditing(false);
        const newSecs = parseTime(tempVal);
        if (newSecs !== null && newSecs !== timeoutEvent.time_seconds) {
            onSave({ time_seconds: newSecs }, timeoutEvent.id);
        }
    };

    if (isEditing && timeoutEvent && !isReadOnly) {
        return (
            <div className="flex items-center justify-between bg-white border border-orange/50 rounded-md px-2 shadow-sm ring-2 ring-orange/10 h-[32px] w-[140px] relative" onClick={e => e.stopPropagation()}>
                <span className="text-[10px] font-bold uppercase text-graphite-light absolute left-2.5">ТАЙМ-АУТ</span>
                <input
                    autoFocus
                    value={tempVal}
                    onChange={e => setTempVal(formatTimeMask(e.target.value))}
                    onBlur={(e) => { if (!e.relatedTarget?.closest('.clear-btn')) handleSaveAction(); }}
                    onKeyDown={e => { if(e.key === 'Enter') handleSaveAction(); }}
                    className="bg-transparent font-mono text-[13px] font-bold text-graphite outline-none w-full text-right pr-6"
                    placeholder="00:00"
                />
                <button
                    type="button"
                    className="clear-btn absolute right-1 w-5 h-5 flex items-center justify-center text-status-rejected hover:bg-status-rejected/10 rounded transition-colors"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(false); onDelete(timeoutEvent.id); }}
                    title="Удалить тайм-аут"
                >
                    <Icon name="close" className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    if (timeoutEvent) {
        return (
            <button
                onClick={(e) => { e.stopPropagation(); if (!isReadOnly) setIsEditing(true); }}
                className={`relative group flex items-center justify-between px-3 rounded-md transition-all border bg-white border-graphite/20 shadow-sm h-[32px] w-[140px] ${isReadOnly ? 'cursor-default opacity-80' : 'hover:border-graphite/25'}`}
                title={isReadOnly ? "Тайм-аут" : "Редактировать время тайм-аута"}
            >
                <span className="text-[10px] font-bold uppercase text-graphite-light">ТАЙМ-АУТ</span>
                <span className="font-mono text-[13px] font-bold text-graphite">
                    {formatTime(timeoutEvent.time_seconds)}
                </span>
            </button>
        );
    }

    return (
        <button 
            onClick={(e) => { e.stopPropagation(); if (!isReadOnly) onSave({ time_seconds: timerSeconds }); }} 
            className={`relative group flex items-center justify-between px-3 rounded-md transition-all border bg-transparent border-dashed h-[32px] w-[140px] ${isReadOnly ? 'border-graphite/10 cursor-default opacity-50' : 'border-graphite/30 hover:border-orange hover:bg-orange/5 hover:text-orange text-graphite-light'}`}
            title={isReadOnly ? "" : "Зафиксировать тайм-аут"}
        >
            <span className={`text-[10px] font-bold uppercase ${isReadOnly ? 'text-graphite/30' : 'text-graphite/50 group-hover:text-orange'}`}>ТАЙМ-АУТ</span>
            <span className={`font-mono text-[13px] font-bold ${isReadOnly ? 'text-graphite/20' : 'text-graphite/25 group-hover:text-orange'}`}>--:--</span>
        </button>
    );
};

export const ProtocolSheet = ({ 
  teamId, teamLetter, teamName, teamLogo, roster, teamEvents, oppEvents = [], timerSeconds, 
  onSaveEvent, onDeleteEvent, onToggleLineup, isPlusMinusEnabled, onRequestPlusMinus, isSaving,
  goalieLog = [], isReadOnly,
  // Справочник причин удаления сезона; если лига его не заполнила, сюда приходит
  // встроенный список (см. usePenaltyReasons)
  penaltyReasons = penaltyReasonOptions
}) => {
  // Причина уходит в событие снимком: наименование + сокращение + ссылка на пункт.
  // Пункт справочника потом могут отредактировать или удалить — протокол от этого
  // меняться не должен.
  const penaltySnapshot = (violation) => {
    const opt = penaltyReasons.find(o => String(o.value) === String(violation));
    return {
      penalty_violation: violation || null,
      penalty_violation_code: opt?.shortLabel || getPenaltyReasonCode(violation) || null,
      penalty_reason_id: opt?.reasonId || null,
    };
  };
  const goals = teamEvents.filter(e => e.event_type === 'goal').sort((a, b) => a.time_seconds - b.time_seconds);
  const penalties = teamEvents.filter(e => e.event_type === 'penalty');
  const timeouts = teamEvents.filter(e => e.event_type === 'timeout').sort((a, b) => a.time_seconds - b.time_seconds);

  const penaltiesWithTimeline = calculatePenaltyTimelines(penalties);
  const oppPenaltiesWithTimeline = calculatePenaltyTimelines(oppEvents.filter(e => e.event_type === 'penalty'));

  const [newGoal, setNewGoal] = useState({ time: '', scorer: '', ast1: '', ast2: '', str: 'equal', from_shot: true });
  const [newPenalty, setNewPenalty] = useState({ player: '', mins: '2', violation: '', start: '' });

  const [editGoalId, setEditGoalId] = useState(null);
  const [editGoalData, setEditGoalData] = useState({});
  const [editPenaltyId, setEditPenaltyId] = useState(null);
  const [editPenaltyData, setEditPenaltyData] = useState({});

  const [manualStr, setManualStr] = useState(false);

  const calculateGoalStrength = (timeSecs) => {
    if (timeSecs === null || timeSecs === undefined) return 'equal';

    const isHome = teamLetter === 'А';
    const relevantLogs = goalieLog.filter(l => l.time_seconds <= timeSecs);
    const currentLog = relevantLogs.length > 0 ? relevantLogs[relevantLogs.length - 1] : null;
    
    const oppGoalieId = isHome ? currentLog?.away_goalie_id : currentLog?.home_goalie_id;
    if (currentLog && !oppGoalieId) {
       return 'en'; 
    }

    const isPenaltyActive = (p, t) => t >= p.effStart && t < p.effEnd && [2, 4, 5, 25].includes(parseInt(p.penalty_minutes, 10));
    
    const myActive = penaltiesWithTimeline.filter(p => isPenaltyActive(p, timeSecs)).length;
    const oppActive = oppPenaltiesWithTimeline.filter(p => isPenaltyActive(p, timeSecs)).length;

    if (oppActive > myActive) {
       return (oppActive - myActive) >= 2 ? 'pp2' : 'pp1'; 
    } else if (myActive > oppActive) {
       return (myActive - oppActive) >= 2 ? 'sh2' : 'sh1'; 
    }

    return 'equal'; 
  };

  useEffect(() => {
     if (manualStr) return; 
     const timeSecs = newGoal.time ? parseTime(newGoal.time) : timerSeconds;
     const calcStr = calculateGoalStrength(timeSecs);
     
     if (newGoal.str !== calcStr) {
         setNewGoal(prev => ({ ...prev, str: calcStr }));
     }
  }, [newGoal.time, timerSeconds, penaltiesWithTimeline, oppPenaltiesWithTimeline, goalieLog, manualStr]);

  const getPlayerId = (jersey) => roster.find(r => r.jersey_number == jersey)?.player_id || null;
  const getJersey = (id) => roster.find(r => r.player_id == id)?.jersey_number || '';

  const getPenaltyClass = (val) => {
    if (val === 'match') return 'match';
    const m = parseInt(val, 10);
    if (m === 2) return 'minor';
    if (m === 4) return 'double_minor';
    if (m === 5) return 'major';
    if (m === 25) return 'match';
    return 'minor';
  };

  // "5+20" физически занимает лёд только 5 минут (нарушитель удалён до конца матча отдельно от штрафного времени).
  const resolvePenaltyMinutes = (val) => (val === 'match' ? 5 : parseInt(val, 10));

  // Отменяются голом только малый и двойной малый; для них — если у соперника есть гол в окне [start, start+mins],
  // окончание штрафа ставится на время этого гола, иначе — полная номинальная длительность.
  const computeAutoEnd = (startSecs, minsVal) => {
    const mins = resolvePenaltyMinutes(minsVal);
    if (mins === 4) {
      // 2+2: два независимых 2-минутных отрезка, каждый может быть закрыт только своим голом.
      // Первый гол в первом отрезке отменяет только его — второй отрезок всё равно надо отсидеть
      // (если только его не отменит СВОЙ, отдельный гол в его собственном окне).
      let segStart = startSecs;
      for (let i = 0; i < 2; i++) {
        const segEnd = segStart + 120;
        const goalsInSeg = oppEvents.filter(e => e.event_type === 'goal' && e.time_seconds > segStart && e.time_seconds < segEnd);
        segStart = goalsInSeg.length > 0
          ? goalsInSeg.reduce((a, b) => (a.time_seconds < b.time_seconds ? a : b)).time_seconds
          : segEnd;
      }
      return segStart;
    }
    const nominalEnd = startSecs + mins * 60;
    if (mins !== 2) return nominalEnd;
    const oppGoals = oppEvents.filter(e => e.event_type === 'goal' && e.time_seconds > startSecs && e.time_seconds < nominalEnd);
    if (oppGoals.length === 0) return nominalEnd;
    return oppGoals.reduce((a, b) => (a.time_seconds < b.time_seconds ? a : b)).time_seconds;
  };

  const handleAddGoal = () => {
    onSaveEvent(teamId, 'goal', {
      time_seconds: parseTime(newGoal.time) ?? timerSeconds,
      player_id: getPlayerId(newGoal.scorer),
      assist1_id: getPlayerId(newGoal.ast1),
      assist2_id: getPlayerId(newGoal.ast2),
      goal_strength: newGoal.str,
      from_shot: newGoal.from_shot
    });
    setNewGoal({ time: '', scorer: '', ast1: '', ast2: '', str: 'equal', from_shot: true });
    setManualStr(false);
  };

  const startEditGoal = (g) => {
    setEditGoalId(g.id);
    setEditGoalData({
      time: formatTime(g.time_seconds), scorer: getJersey(g.primary_player_id),
      ast1: getJersey(g.assist1_id), ast2: getJersey(g.assist2_id), str: g.goal_strength || 'equal',
      from_shot: g.from_shot ?? true
    });
  };

  const saveEditGoal = async () => {
    const success = await onSaveEvent(teamId, 'goal', {
      time_seconds: parseTime(editGoalData.time), player_id: getPlayerId(editGoalData.scorer),
      assist1_id: getPlayerId(editGoalData.ast1), assist2_id: getPlayerId(editGoalData.ast2), goal_strength: editGoalData.str,
      from_shot: editGoalData.from_shot
    }, editGoalId);
    if (success) setEditGoalId(null);
  };

  const toggleGoalFromShot = (g) => {
    onSaveEvent(teamId, 'goal', {
      time_seconds: g.time_seconds,
      player_id: g.primary_player_id,
      assist1_id: g.assist1_id,
      assist2_id: g.assist2_id,
      goal_strength: g.goal_strength,
      from_shot: !(g.from_shot ?? true)
    }, g.id);
  };

  const handleAddPenalty = () => {
    const startSecs = parseTime(newPenalty.start) ?? timerSeconds;
    const mins = resolvePenaltyMinutes(newPenalty.mins);
    const endSecs = computeAutoEnd(startSecs, newPenalty.mins);

    onSaveEvent(teamId, 'penalty', {
      time_seconds: startSecs, penalty_end_time: endSecs, player_id: getPlayerId(newPenalty.player),
      penalty_minutes: mins, penalty_class: getPenaltyClass(newPenalty.mins),
      ...penaltySnapshot(newPenalty.violation)
    });
    setNewPenalty({ player: '', mins: '2', violation: '', start: '' });
  };

  const startEditPenalty = (p) => {
    setEditPenaltyId(p.id);
    setEditPenaltyData({
      player: getJersey(p.primary_player_id), mins: p.penalty_class === 'match' ? 'match' : String(p.penalty_minutes),
      violation: p.penalty_violation || '', start: formatTime(p.time_seconds)
    });
  };

  const saveEditPenalty = async () => {
    const startSecs = parseTime(editPenaltyData.start);
    const mins = resolvePenaltyMinutes(editPenaltyData.mins);
    const endSecs = computeAutoEnd(startSecs, editPenaltyData.mins);

    const success = await onSaveEvent(teamId, 'penalty', {
      time_seconds: startSecs, penalty_end_time: endSecs, player_id: getPlayerId(editPenaltyData.player),
      penalty_minutes: mins, penalty_class: getPenaltyClass(editPenaltyData.mins),
      ...penaltySnapshot(editPenaltyData.violation)
    }, editPenaltyId);
    if (success) setEditPenaltyId(null);
  };

  const MAX_ROWS = Math.max(roster.length, goals.length + 1, penaltiesWithTimeline.length + 1, 1);
  const rows = Array.from({ length: MAX_ROWS });
  const loadingClass = isSaving ? "opacity-60 pointer-events-none select-none transition-opacity" : "transition-opacity";

  return (
    <div className={`bg-white border border-graphite/20 shadow-sm flex flex-col font-sans rounded-md ${loadingClass}`}>
      
      <div className="bg-gray-bg-light border-b border-graphite/20 px-4 py-3 flex justify-between items-center rounded-t-md select-none gap-4">
        
        <div className="font-bold text-graphite text-base uppercase tracking-wide flex items-center gap-3 shrink-0 min-w-[200px]">
          <span className="border-2 border-graphite w-8 h-8 flex items-center justify-center font-black rounded-sm shrink-0">{teamLetter}</span>
          {teamLogo && <img src={teamLogo} alt={teamName} className="w-8 h-8 object-contain drop-shadow-sm shrink-0" />}
          <span className="truncate max-w-[260px]" title={teamName}>{teamName}</span>
        </div>
        
        <div className="flex items-center justify-end gap-2 shrink-0 min-w-[140px]">
          {timeouts.length > 0 ? (
              timeouts.map(t => (
                  <TimeoutPill 
                      key={t.id}
                      timeoutEvent={t} 
                      timerSeconds={timerSeconds} 
                      onSave={(data, id) => onSaveEvent(teamId, 'timeout', data, id)} 
                      onDelete={onDeleteEvent} 
                      isReadOnly={isReadOnly}
                  />
              ))
          ) : (
              <TimeoutPill 
                  timeoutEvent={null} 
                  timerSeconds={timerSeconds} 
                  onSave={(data) => onSaveEvent(teamId, 'timeout', data)} 
                  onDelete={onDeleteEvent} 
                  isReadOnly={isReadOnly}
              />
          )}
        </div>
      </div>

      <div className="overflow-x-visible pb-12 pt-0.5">
        <table className="w-full min-w-[950px] text-sm text-center border-collapse table-fixed select-none">
          <colgroup>
            <col className="w-8" />
            <col className="w-[140px]" />
            <col className="w-8" />

            <col className="w-8" />
            <col className="w-[64px]" />
            <col className="w-11" />
            <col className="w-11" />
            <col className="w-11" />
            <col className="w-14" />
            <col className="w-12" />
            <col className="w-[70px]" />

            <col className="w-11" />
            <col className="w-[52px]" />
            <col className="w-auto" />
            <col className="w-[64px]" />
            <col className="w-[64px]" />
            <col className="w-[70px]" />
          </colgroup>

          <thead>
            <tr className="bg-graphite/5 text-graphite">
              <th colSpan="3" className="border-t-1 border-l-1 border-r-1 border-b-2 border-graphite/25 py-2 font-bold uppercase tracking-widest text-[10px]">Состав на матч</th>
              <th colSpan="8" className="border-t-1 border-r-1 border-b-2 border-graphite/25 py-2 font-bold uppercase tracking-widest text-[10px] text-status-accepted">Взятие ворот</th>
              <th colSpan="6" className="border-t-1 border-r-1 border-b-2 border-graphite/25 py-2 font-bold uppercase tracking-widest text-[10px] text-status-rejected">Удаления</th>
            </tr>
            <tr className="bg-graphite/15 text-[11px] text-graphite-light uppercase tracking-wider relative z-0">
              <th className="border-l-2 border-graphite/25 border-r border-graphite/30 py-1.5 font-bold">#</th>
              <th className="border-r border-graphite/30 py-1.5 text-left px-2 font-bold">Фамилия, Имя</th>
              <th className="border-r-2 border-graphite/25 py-1.5 font-bold">Поз</th>

              <th className="border-r border-graphite/30 py-1.5 font-bold text-status-accepted"></th>
              <th className="border-r border-graphite/30 py-1.5 font-bold text-status-accepted">Время</th>
              <th className="border-r border-graphite/30 py-1.5 font-bold text-status-accepted">Г</th>
              <th className="border-r border-graphite/30 py-1.5 font-bold text-status-accepted">П1</th>
              <th className="border-r border-graphite/30 py-1.5 font-bold text-status-accepted">П2</th>
              <th className="border-r border-graphite/30 py-1.5 font-bold text-status-accepted">ИС</th>
              <th className="border-r border-graphite/30 py-1.5 font-bold text-status-accepted" title="С броска / без броска">Бр</th>
              <th className="border-r-2 border-graphite/25 py-1.5"></th>
              
              <th className="border-r border-graphite/30 py-1.5 font-bold text-status-rejected">#</th>
              <th className="border-r border-graphite/30 py-1.5 font-bold text-status-rejected">Шт</th>
              <th className="border-r border-graphite/30 py-1.5 text-left px-2 font-bold text-status-rejected">Причина</th> 
              <th className="border-r border-graphite/30 py-1.5 font-bold text-status-rejected">Нач</th>
              <th className="border-r border-graphite/30 py-1.5 font-bold text-status-rejected">Окон</th>
              <th className="border-r-2 border-graphite/25 py-1.5"></th>
            </tr>
          </thead>
          
          <tbody className="bg-white text-graphite relative z-10">
            {rows.map((_, i) => {
              const player = roster[i]; const goal = goals[i]; const penalty = penaltiesWithTimeline[i];
              const isGoalInput = i === goals.length; const isPenaltyInput = i === penaltiesWithTimeline.length;
              const isEditingGoal = goal && goal.id === editGoalId; const isEditingPenalty = penalty && penalty.id === editPenaltyId;

              let isFinished = false; let endTimeDisplay = ''; let endTimeClass = 'font-mono font-semibold text-[13px] text-graphite';
              if (penalty && !isEditingPenalty) {
                const pStart = penalty.effStart; const pEnd = penalty.effEnd;
                if (!isNaN(pStart) && !isNaN(pEnd)) {
                  isFinished = timerSeconds >= pEnd;
                  const isActive = timerSeconds >= pStart && timerSeconds < pEnd;
                  const isDelayed = timerSeconds < pStart;
                  if (isActive) { endTimeDisplay = formatTime(pEnd - timerSeconds); endTimeClass = "font-mono font-black text-[13px] text-status-rejected animate-pulse"; }
                  else if (isFinished) { endTimeDisplay = formatTime(pEnd); endTimeClass = "font-mono font-medium text-[13px] text-graphite/25"; }
                  else if (isDelayed) { endTimeDisplay = `⏱ ${formatTime(pEnd - pStart)}`; endTimeClass = "font-mono font-bold text-[13px] text-orange"; }
                } else { endTimeDisplay = formatTime(penalty.penalty_end_time); }
              }

              const isLastRow = i === MAX_ROWS - 1;

              return (
                <tr key={i} className={`even:bg-graphite/[0.02] hover:bg-graphite/5 transition-colors group h-[34px] ${isLastRow ? 'border-b-2 border-graphite/25' : 'border-b border-graphite/30'}`}>
                  {/* РОСТЕР */}
                  <td className="border-l-2 border-graphite/25 border-r border-graphite/30 font-bold text-graphite text-[13px]">{player?.jersey_number || ''}</td>
                  <td className="border-r border-graphite/30 text-left px-2 truncate whitespace-nowrap overflow-hidden font-semibold text-[13px] text-graphite">{player ? `${player.last_name} ${player.first_name?.[0] || ''}.` : ''}</td>
                  <td className="border-r-2 border-graphite/25 text-[11px] text-graphite-light font-medium">{player ? localizePosition(player.position_in_line || player.position) : ''}</td>

                  {/* ВЗЯТИЕ ВОРОТ */}
                  <td className="border-r border-graphite/30 font-bold text-graphite/25 text-[12px]">{goal || (isGoalInput && !isReadOnly) || isEditingGoal ? i + 1 : ''}</td>
                  {isEditingGoal && !isReadOnly ? (
                    <>
                      <td className="border-r border-graphite/30 p-0.5 bg-orange/5"><StylishInput isEditing isTimeField title="Время гола" value={editGoalData.time} onChange={e=>setEditGoalData({...editGoalData, time: formatTimeMask(e.target.value)})} /></td>
                      <td className="border-r border-graphite/30 p-0.5 bg-orange/5"><StylishSelect isEditing title="Автор гола" roster={roster} value={editGoalData.scorer} onChange={e=>setEditGoalData({...editGoalData, scorer: e.target.value})} className="!text-status-accepted font-bold" /></td>
                      <td className="border-r border-graphite/30 p-0.5 bg-orange/5"><StylishSelect isEditing title="Ассистент 1" roster={roster} value={editGoalData.ast1} onChange={e=>setEditGoalData({...editGoalData, ast1: e.target.value})} exclude={[editGoalData.scorer]} /></td>
                      <td className="border-r border-graphite/30 p-0.5 bg-orange/5"><StylishSelect isEditing title="Ассистент 2" roster={roster} value={editGoalData.ast2} onChange={e=>setEditGoalData({...editGoalData, ast2: e.target.value})} exclude={[editGoalData.scorer, editGoalData.ast1]} /></td>
                      <td className="border-r border-graphite/30 p-0.5 bg-orange/5">
                        <CustomSelect
                           isEditing
                           title="Игровая ситуация"
                           options={goalStrengthOptions}
                           value={editGoalData.str}
                           onChange={e=>setEditGoalData({...editGoalData, str: e.target.value})}
                           hideEmpty
                        />
                      </td>
                      <td className="border-r border-graphite/30 p-0.5 bg-orange/5 text-center">
                        <button
                          type="button"
                          onClick={() => setEditGoalData({...editGoalData, from_shot: !editGoalData.from_shot})}
                          className={`mx-auto flex items-center justify-center w-7 h-7 rounded hover:bg-graphite/10 transition-colors ${editGoalData.from_shot ? 'text-status-accepted' : 'text-status-rejected'}`}
                          title={editGoalData.from_shot ? 'С броска' : 'Без броска'}
                        >
                          <Icon name={editGoalData.from_shot ? 'shootout_goal' : 'shootout_miss'} className="w-5 h-5" />
                        </button>
                      </td>
                      <td className="border-r-2 border-graphite/25 p-0 text-center bg-orange/5"><button onClick={saveEditGoal} className="bg-status-accepted text-white w-full h-full min-h-[34px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"><Icon name="save" className="w-5 h-5" /></button></td>
                    </>
                  ) : goal ? (
                    <>
                      <td className="border-r border-graphite/30 font-mono text-[13px] font-semibold text-graphite-light">{formatTime(goal.time_seconds)}</td>
                      <td className="border-r border-graphite/30 font-bold text-[13px] text-graphite">{getJersey(goal.primary_player_id)}</td>
                      <td className="border-r border-graphite/30 font-semibold text-[13px] text-graphite-light">{getJersey(goal.assist1_id)}</td>
                      <td className="border-r border-graphite/30 font-semibold text-[13px] text-graphite-light">{getJersey(goal.assist2_id)}</td>
                      <td className="border-r border-graphite/30 text-[10px] text-graphite/60 uppercase font-bold">{GOAL_STRENGTH_DISPLAY[goal.goal_strength] || ''}</td>
                      <td className="border-r border-graphite/30 text-center">
                        <button
                          type="button"
                          onClick={() => !isReadOnly && toggleGoalFromShot(goal)}
                          disabled={isReadOnly}
                          className={`mx-auto flex items-center justify-center w-7 h-7 rounded transition-colors ${isReadOnly ? 'cursor-default' : 'hover:bg-graphite/10 cursor-pointer'} ${(goal.from_shot ?? true) ? 'text-status-accepted' : 'text-status-rejected'}`}
                          title={(goal.from_shot ?? true) ? 'Гол с броска (нажмите чтобы переключить)' : 'Гол без броска (нажмите чтобы переключить)'}
                        >
                          <Icon name={(goal.from_shot ?? true) ? 'shootout_goal' : 'shootout_miss'} className="w-5 h-5" />
                        </button>
                      </td>
                      <td className="border-r-2 border-graphite/25 p-0 text-center">
                         {!isReadOnly && (
                            <div className="flex justify-center items-center h-full gap-1.5 px-0.5 opacity-50 hover:opacity-100 transition-opacity">
                               {isPlusMinusEnabled && <button onClick={() => onRequestPlusMinus(goal)} className={`transition-colors ${goal.has_plus_minus ? 'text-status-accepted hover:text-status-accepted/80' : 'text-graphite/25 hover:text-status-accepted'}`} title="Показатель полезности (+/-)"><Icon name="users" className="w-[18px] h-[18px]" /></button>}
                               <button onClick={() => startEditGoal(goal)} className="text-graphite/25 hover:text-orange transition-colors" title="Редактировать"><Icon name="edit" className="w-[18px] h-[18px]" /></button>
                               <button onClick={() => onDeleteEvent(goal.id)} className="text-graphite/25 hover:text-status-rejected transition-colors" title="Удалить"><Icon name="delete" className="w-[18px] h-[18px]" /></button>
                            </div>
                         )}
                      </td>
                    </>
                  ) : (isGoalInput && !isReadOnly) ? (
                    <>
                      <td className="border-r border-graphite/30 p-0.5"><StylishInput isTimeField title="Время гола" value={newGoal.time} placeholder={formatTime(timerSeconds)} onChange={e=>setNewGoal({...newGoal, time: formatTimeMask(e.target.value)})} /></td>
                      <td className="border-r border-graphite/30 p-0.5"><StylishSelect title="Автор гола" roster={roster} value={newGoal.scorer} onChange={e=>setNewGoal({...newGoal, scorer: e.target.value})} className="!text-status-accepted font-bold" /></td>
                      <td className="border-r border-graphite/30 p-0.5"><StylishSelect title="Ассистент 1" roster={roster} value={newGoal.ast1} onChange={e=>setNewGoal({...newGoal, ast1: e.target.value})} exclude={[newGoal.scorer]} /></td>
                      <td className="border-r border-graphite/30 p-0.5"><StylishSelect title="Ассистент 2" roster={roster} value={newGoal.ast2} onChange={e=>setNewGoal({...newGoal, ast2: e.target.value})} exclude={[newGoal.scorer, newGoal.ast1]} /></td>
                      <td className="border-r border-graphite/30 p-0.5">
                         <CustomSelect
                            title="Игровая ситуация"
                            options={goalStrengthOptions}
                            value={newGoal.str}
                            onChange={e => {
                               setManualStr(true);
                               setNewGoal({...newGoal, str: e.target.value});
                            }}
                            hideEmpty
                         />
                      </td>
                      <td className="border-r border-graphite/30 p-0.5 text-center">
                        <button
                          type="button"
                          onClick={() => setNewGoal({...newGoal, from_shot: !newGoal.from_shot})}
                          className={`mx-auto flex items-center justify-center w-7 h-7 rounded hover:bg-graphite/10 transition-colors ${newGoal.from_shot ? 'text-status-accepted' : 'text-status-rejected'}`}
                          title={newGoal.from_shot ? 'С броска' : 'Без броска'}
                        >
                          <Icon name={newGoal.from_shot ? 'shootout_goal' : 'shootout_miss'} className="w-5 h-5" />
                        </button>
                      </td>
                      <td className="border-r-2 border-graphite/25 p-0 text-center"><button onClick={handleAddGoal} className="w-full h-full min-h-[34px] hover:bg-status-accepted/10 text-status-accepted transition-colors flex items-center justify-center"><Icon name="plus" className="w-6 h-6" /></button></td>
                    </>
                  ) : (
                    <><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r-2 border-graphite/25"></td></>
                  )}

                  {/* УДАЛЕНИЯ */}
                  {isEditingPenalty && !isReadOnly ? (
                    <>
                      <td className="border-r border-graphite/30 p-0.5 bg-orange/5"><StylishSelect isEditing title="Оштрафованный игрок" roster={roster} value={editPenaltyData.player} onChange={e=>setEditPenaltyData({...editPenaltyData, player: e.target.value})} className="!text-status-rejected font-bold" /></td>
                      <td className="border-r border-graphite/30 p-0.5 bg-orange/5">
                        <CustomSelect
                          isEditing title="Штрафные минуты" options={penaltyMinsOptions} value={editPenaltyData.mins}
                          onChange={e=>setEditPenaltyData({...editPenaltyData, mins: e.target.value})}
                          hideEmpty
                        />
                      </td>
                      <td className="border-r border-graphite/30 p-0.5 bg-orange/5"><CustomSelect isEditing title="Причина удаления" options={penaltyReasons} value={editPenaltyData.violation} onChange={e=>setEditPenaltyData({...editPenaltyData, violation: e.target.value})} dropdownWidth="min-w-[280px]" className="px-1" /></td>
                      <td className="border-r border-graphite/30 p-0.5 bg-orange/5">
                        <StylishInput
                          isEditing isTimeField title="Начало штрафа" value={editPenaltyData.start}
                          onChange={e=>setEditPenaltyData({...editPenaltyData, start: formatTimeMask(e.target.value)})}
                        />
                      </td>
                      <td className="border-r border-graphite/30 p-0.5 bg-orange/5 text-center font-mono text-[13px] text-graphite-light" title="Окончание штрафа рассчитывается автоматически">
                        {(() => {
                          const s = parseTime(editPenaltyData.start);
                          return (s !== null && !isNaN(s)) ? formatTime(computeAutoEnd(s, editPenaltyData.mins)) : '';
                        })()}
                      </td>
                      <td className="border-r-2 border-graphite/25 p-0 text-center bg-orange/5"><button onClick={saveEditPenalty} className="bg-status-accepted text-white w-full h-full min-h-[34px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"><Icon name="save" className="w-5 h-5" /></button></td>
                    </>
                  ) : penalty ? (
                    <>
                      <td className="border-r border-graphite/30 font-bold text-[13px] text-graphite">{getJersey(penalty.primary_player_id)}</td>
                      <td className="border-r border-graphite/30 font-semibold text-[13px] text-graphite">
                        {(penalty.penalty_class === 'double_minor' || parseInt(penalty.penalty_minutes, 10) === 4) ? '2+2'
                          : (penalty.penalty_class === 'match' || parseInt(penalty.penalty_minutes, 10) === 25) ? '5+20'
                          : penalty.penalty_minutes}
                      </td>
                      {/* Показываем сокращение — как в поле выбора и в PDF. Полная формулировка
                          остаётся в подсказке при наведении. */}
                      <td className="border-r border-graphite/30 text-center px-2 text-[12px] truncate whitespace-nowrap overflow-hidden text-graphite-light font-semibold" title={penalty.penalty_violation}>{penalty.penalty_violation_code || getPenaltyReasonCode(penalty.penalty_violation)}</td>
                      <td className="border-r border-graphite/30 font-mono font-semibold text-[13px] text-graphite-light">{formatTime(penalty.effStart)}</td>
                      <td className={`border-r border-graphite/30 ${endTimeClass}`}>{endTimeDisplay}</td>
                      <td className="border-r-2 border-graphite/25 p-0 text-center">
                         {!isReadOnly && (
                            <div className="flex justify-center items-center h-full gap-1.5 px-0.5 opacity-50 hover:opacity-100 transition-opacity">
                               <button onClick={() => startEditPenalty(penalty)} className="text-graphite/25 hover:text-orange transition-colors" title="Редактировать"><Icon name="edit" className="w-[18px] h-[18px]" /></button>
                               <button onClick={() => onDeleteEvent(penalty.id)} className="text-graphite/25 hover:text-status-rejected transition-colors" title="Удалить"><Icon name="delete" className="w-[18px] h-[18px]" /></button>
                            </div>
                         )}
                      </td>
                    </>
                  ) : (isPenaltyInput && !isReadOnly) ? (
                    <>
                      <td className="border-r border-graphite/30 p-0.5"><StylishSelect title="Оштрафованный игрок" roster={roster} value={newPenalty.player} onChange={e=>setNewPenalty({...newPenalty, player: e.target.value})} className="!text-status-rejected font-bold" /></td>
                      <td className="border-r border-graphite/30 p-0.5">
                        <CustomSelect
                          title="Штрафные минуты" options={penaltyMinsOptions} value={newPenalty.mins}
                          onChange={e=>setNewPenalty({...newPenalty, mins: e.target.value})}
                          hideEmpty
                        />
                      </td>
                      <td className="border-r border-graphite/30 p-0.5"><CustomSelect title="Причина удаления" options={penaltyReasons} value={newPenalty.violation} onChange={e=>setNewPenalty({...newPenalty, violation: e.target.value})} dropdownWidth="min-w-[280px]" className="px-1" /></td>
                      <td className="border-r border-graphite/30 p-0.5">
                        <StylishInput
                          isTimeField title="Начало штрафа" value={newPenalty.start} placeholder={formatTime(timerSeconds)}
                          onChange={e=>setNewPenalty({...newPenalty, start: formatTimeMask(e.target.value)})}
                          onBlur={()=>{
                            const s = newPenalty.start ? parseTime(newPenalty.start) : timerSeconds;
                            if (s !== null && !isNaN(s)) setNewPenalty(prev => ({ ...prev, start: formatTime(s) }));
                          }}
                        />
                      </td>
                      <td className="border-r border-graphite/30 p-0.5 text-center font-mono text-[13px] text-graphite-light" title="Окончание штрафа рассчитывается автоматически">
                        {(() => {
                          const s = newPenalty.start ? parseTime(newPenalty.start) : timerSeconds;
                          return (s !== null && !isNaN(s)) ? formatTime(computeAutoEnd(s, newPenalty.mins)) : '';
                        })()}
                      </td>
                      <td className="border-r-2 border-graphite/25 p-0 text-center"><button onClick={handleAddPenalty} className="w-full h-full min-h-[34px] hover:bg-status-rejected/10 text-status-rejected transition-colors flex items-center justify-center"><Icon name="plus" className="w-6 h-6" /></button></td>
                    </>
                  ) : (
                    <><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r-2 border-graphite/25"></td></>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};