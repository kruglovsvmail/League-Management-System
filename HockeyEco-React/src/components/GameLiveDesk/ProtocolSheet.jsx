import React, { useState } from 'react';
import { 
  formatTime, parseTime, formatTimeMask, localizePosition, calculatePenaltyTimelines, 
  CustomSelect, StylishSelect, StylishInput, EditIcon, DeleteIcon, SaveIcon, PlusIcon, UsersIcon, 
  goalStrengthOptions, penaltyMinsOptions, penaltyReasonOptions, GOAL_STRENGTH_DISPLAY 
} from './GameDeskShared';

// Иконка-шеврон для аккордеона
const ChevronIcon = ({ isExpanded }) => (
  <svg 
    className={`w-6 h-6 text-graphite-light transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
    fill="none" stroke="currentColor" viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
  </svg>
);

export const ProtocolSheet = ({ teamId, teamLetter, teamName, teamLogo, roster, teamEvents, timerSeconds, onSaveEvent, onDeleteEvent, onToggleLineup, isPlusMinusEnabled, onRequestPlusMinus, isSaving }) => {
  const goals = teamEvents.filter(e => e.event_type === 'goal').sort((a, b) => a.time_seconds - b.time_seconds);
  const penalties = teamEvents.filter(e => e.event_type === 'penalty');
  const timeouts = teamEvents.filter(e => e.event_type === 'timeout').sort((a, b) => a.time_seconds - b.time_seconds);

  const penaltiesWithTimeline = calculatePenaltyTimelines(penalties);

  // Стейт для аккордеона (по умолчанию обе панели развернуты)
  const [isExpanded, setIsExpanded] = useState(true);

  const [newGoal, setNewGoal] = useState({ time: '', scorer: '', ast1: '', ast2: '', str: 'equal' });
  const [newPenalty, setNewPenalty] = useState({ player: '', mins: '2', violation: '', start: '', end: '' });

  const [editGoalId, setEditGoalId] = useState(null);
  const [editGoalData, setEditGoalData] = useState({});
  const [editPenaltyId, setEditPenaltyId] = useState(null);
  const [editPenaltyData, setEditPenaltyData] = useState({});

  const getPlayerId = (jersey) => roster.find(r => r.jersey_number == jersey)?.player_id || null;
  const getJersey = (id) => roster.find(r => r.player_id == id)?.jersey_number || '';

  const getPenaltyClass = (mins) => {
    const m = parseInt(mins);
    if (m === 2) return 'minor';
    if (m === 4) return 'double_minor';
    if (m === 5) return 'major';
    if (m === 10) return 'misconduct';
    if (m === 20) return 'game_misconduct';
    if (m === 25) return 'match';
    return 'minor';
  };

  const handleAddGoal = () => {
    onSaveEvent(teamId, 'goal', {
      time_seconds: parseTime(newGoal.time) ?? timerSeconds,
      player_id: getPlayerId(newGoal.scorer),
      assist1_id: getPlayerId(newGoal.ast1),
      assist2_id: getPlayerId(newGoal.ast2),
      goal_strength: newGoal.str
    });
    setNewGoal({ time: '', scorer: '', ast1: '', ast2: '', str: 'equal' });
  };

  const startEditGoal = (g) => {
    setEditGoalId(g.id);
    setEditGoalData({
      time: formatTime(g.time_seconds), scorer: getJersey(g.primary_player_id),
      ast1: getJersey(g.assist1_id), ast2: getJersey(g.assist2_id), str: g.goal_strength || 'equal'
    });
  };

  const saveEditGoal = async () => {
    const success = await onSaveEvent(teamId, 'goal', {
      time_seconds: parseTime(editGoalData.time), player_id: getPlayerId(editGoalData.scorer),
      assist1_id: getPlayerId(editGoalData.ast1), assist2_id: getPlayerId(editGoalData.ast2), goal_strength: editGoalData.str
    }, editGoalId);
    if (success) setEditGoalId(null);
  };

  const handleAddPenalty = () => {
    const startSecs = parseTime(newPenalty.start) ?? timerSeconds;
    const mins = parseInt(newPenalty.mins, 10);
    let endSecs = parseTime(newPenalty.end);
    if (endSecs === null || isNaN(endSecs)) endSecs = startSecs + (mins * 60);

    onSaveEvent(teamId, 'penalty', {
      time_seconds: startSecs, penalty_end_time: endSecs, player_id: getPlayerId(newPenalty.player),
      penalty_minutes: mins, penalty_violation: newPenalty.violation, penalty_class: getPenaltyClass(mins)
    });
    setNewPenalty({ player: '', mins: '2', violation: '', start: '', end: '' });
  };

  const startEditPenalty = (p) => {
    setEditPenaltyId(p.id);
    setEditPenaltyData({
      player: getJersey(p.primary_player_id), mins: String(p.penalty_minutes),
      violation: p.penalty_violation || '', start: formatTime(p.time_seconds), end: formatTime(p.penalty_end_time)
    });
  };

  const saveEditPenalty = async () => {
    const startSecs = parseTime(editPenaltyData.start);
    const mins = parseInt(editPenaltyData.mins, 10);
    let endSecs = parseTime(editPenaltyData.end);
    if (endSecs === null || isNaN(endSecs)) endSecs = startSecs + (mins * 60);

    const success = await onSaveEvent(teamId, 'penalty', {
      time_seconds: startSecs, penalty_end_time: endSecs, player_id: getPlayerId(editPenaltyData.player),
      penalty_minutes: mins, penalty_violation: editPenaltyData.violation, penalty_class: getPenaltyClass(mins)
    }, editPenaltyId);
    if (success) setEditPenaltyId(null);
  };

  // Резиновая логика высоты: берем максимум из игроков, голов или штрафов. 
  // Если голов больше чем игроков, таблица автоматически добавит пустую строку для ввода.
  const MAX_ROWS = Math.max(roster.length, goals.length + 1, penaltiesWithTimeline.length + 1, 1);
  const rows = Array.from({ length: MAX_ROWS });
  const loadingClass = isSaving ? "opacity-60 pointer-events-none select-none transition-opacity" : "transition-opacity";

  return (
    <div className={`bg-white border border-graphite/20 shadow-lg mb-8 flex flex-col font-sans rounded-md ${loadingClass}`}>
      
      {/* КЛИКАБЕЛЬНАЯ ШАПКА-АККОРДЕОН */}
      <div 
        className="bg-gray-bg-light border-b border-graphite/20 px-5 py-3 flex justify-between items-center rounded-t-md cursor-pointer hover:bg-graphite/5 transition-colors select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="font-bold text-graphite text-base uppercase tracking-wide flex items-center gap-3">
          <ChevronIcon isExpanded={isExpanded} />
          <span className="border-2 border-graphite w-8 h-8 flex items-center justify-center font-black rounded-sm">{teamLetter}</span>
          
          {/* ЛОГОТИП КОМАНДЫ */}
          {teamLogo && (
            <img src={teamLogo} alt={teamName} className="w-8 h-8 object-contain drop-shadow-sm" />
          )}

          {teamName}
        </div>
        
        {/* Кнопки таймаута с e.stopPropagation() чтобы не сворачивать панель */}
        <div className="flex items-center gap-3 text-sm font-semibold text-graphite-light">
          <span>Тайм-аут:</span>
          {timeouts.length > 0 
            ? timeouts.map(t => (
                <span 
                  key={t.id} 
                  className="text-status-rejected border-b border-dashed border-status-rejected cursor-pointer" 
                  onClick={(e) => { e.stopPropagation(); onDeleteEvent(t.id); }} 
                  title="Нажмите для удаления"
                >
                  {formatTime(t.time_seconds)}
                </span>
              ))
            : <button 
                onClick={(e) => { e.stopPropagation(); onSaveEvent(teamId, 'timeout', {time_seconds: timerSeconds}); }} 
                className="bg-white border border-graphite/20 hover:border-graphite/40 hover:bg-gray-light text-graphite px-3 py-1 rounded transition-colors shadow-sm text-xs font-bold uppercase tracking-wider"
              >
                Взять ({formatTime(timerSeconds)})
              </button>
          }
        </div>
      </div>

      {/* ТЕЛО ТАБЛИЦЫ С АНИМАЦИЕЙ РАЗВЕРТЫВАНИЯ */}
      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className={isExpanded ? 'overflow-visible' : 'overflow-hidden'}>
          <div className="overflow-x-visible pb-12 pt-0.5">
            <table className="w-full min-w-[1200px] text-sm text-center border-collapse table-fixed select-none">
              <colgroup>
                <col className="w-10" />
                <col className="w-[150px]" />
                <col className="w-10" />
                <col className="w-10" />
                <col className="w-10" />
                <col className="w-20" />
                <col className="w-12" />
                <col className="w-12" />
                <col className="w-12" />
                <col className="w-16" />
                <col className="w-24" />
                <col className="w-12" />
                <col className="w-14" />
                <col className="w-auto" /> 
                <col className="w-20" />
                <col className="w-20" />
                <col className="w-24" />
              </colgroup>

              <thead>
                <tr className="bg-graphite/5 text-graphite">
                  <th colSpan="4" className="border-t-1 border-l-1 border-r-1 border-b-2 border-graphite/40 py-2.5 font-bold uppercase tracking-widest text-[11px]">Состав на матч</th>
                  <th colSpan="7" className="border-t-1 border-r-1 border-b-2 border-graphite/40 py-2.5 font-bold uppercase tracking-widest text-[11px] text-status-accepted">Взятие ворот</th>
                  <th colSpan="6" className="border-t-1 border-r-1 border-b-2 border-graphite/40 py-2.5 font-bold uppercase tracking-widest text-[11px] text-status-rejected">Удаления</th>
                </tr>
                <tr className="bg-graphite/15 text-xs text-graphite-light uppercase tracking-wider relative z-0">
                  <th className="border-l-2 border-graphite/40 border-r border-graphite/30 py-2 font-bold">№</th>
                  <th className="border-r border-graphite/10 py-2 text-left px-3 font-bold">Фамилия, Имя</th>
                  <th className="border-r border-graphite/10 py-2 font-bold">Поз</th>
                  <th className="border-r-2 border-graphite/40 py-2 font-bold">ИГ</th>
                  
                  <th className="border-r border-graphite/10 py-2 font-bold text-status-accepted"></th>
                  <th className="border-r border-graphite/10 py-2 font-bold text-status-accepted">Время</th>
                  <th className="border-r border-graphite/10 py-2 font-bold text-status-accepted">Г</th>
                  <th className="border-r border-graphite/10 py-2 font-bold text-status-accepted">П1</th>
                  <th className="border-r border-graphite/10 py-2 font-bold text-status-accepted">П2</th>
                  <th className="border-r border-graphite/10 py-2 font-bold text-status-accepted">Сост</th>
                  <th className="border-r-2 border-graphite/40 py-2"></th>
                  
                  <th className="border-r border-graphite/10 py-2 font-bold text-status-rejected">Иг</th>
                  <th className="border-r border-graphite/10 py-2 font-bold text-status-rejected">Шт</th>
                  <th className="border-r border-graphite/10 py-2 text-left px-3 font-bold text-status-rejected">Причина</th> 
                  <th className="border-r border-graphite/10 py-2 font-bold text-status-rejected">Начало</th>
                  <th className="border-r border-graphite/10 py-2 font-bold text-status-rejected">Оконч</th>
                  <th className="border-r-2 border-graphite/40 py-2"></th>
                </tr>
              </thead>
              
              <tbody className="bg-white text-graphite relative z-10">
                {rows.map((_, i) => {
                  const player = roster[i]; const goal = goals[i]; const penalty = penaltiesWithTimeline[i];
                  const isGoalInput = i === goals.length; const isPenaltyInput = i === penaltiesWithTimeline.length;
                  const isEditingGoal = goal && goal.id === editGoalId; const isEditingPenalty = penalty && penalty.id === editPenaltyId;

                  let isFinished = false; let endTimeDisplay = ''; let endTimeClass = 'font-mono font-semibold text-sm text-graphite';
                  if (penalty && !isEditingPenalty) {
                    const pStart = penalty.effStart; const pEnd = penalty.effEnd;
                    if (!isNaN(pStart) && !isNaN(pEnd)) {
                      isFinished = timerSeconds >= pEnd;
                      const isActive = timerSeconds >= pStart && timerSeconds < pEnd;
                      const isDelayed = timerSeconds < pStart;
                      if (isActive) { endTimeDisplay = formatTime(pEnd - timerSeconds); endTimeClass = "font-mono font-black text-sm text-status-rejected animate-pulse"; }
                      else if (isFinished) { endTimeDisplay = formatTime(pEnd); endTimeClass = "font-mono font-medium text-sm text-graphite/40"; }
                      else if (isDelayed) { endTimeDisplay = `⏱ ${formatTime(pEnd - pStart)}`; endTimeClass = "font-mono font-bold text-sm text-orange"; }
                    } else { endTimeDisplay = formatTime(penalty.penalty_end_time); }
                  }

                  const isLastRow = i === MAX_ROWS - 1;

                  return (
                    <tr key={i} className={`even:bg-graphite/[0.02] hover:bg-graphite/5 transition-colors group h-[36px] ${isLastRow ? 'border-b-2 border-graphite/40' : 'border-b border-graphite/30'}`}>
                      {/* РОСТЕР */}
                      <td className="border-l-2 border-graphite/40 border-r border-graphite/30 font-bold text-graphite text-sm">{player?.jersey_number || ''}</td>
                      <td className="border-r border-graphite/30 text-left px-3 truncate whitespace-nowrap overflow-hidden font-semibold text-sm text-graphite">{player ? `${player.last_name} ${player.first_name?.[0] || ''}.` : ''}</td>
                      <td className="border-r border-graphite/30 text-xs text-graphite-light font-medium">{player ? localizePosition(player.position_in_line || player.position) : ''}</td>
                      <td className="border-r-2 border-graphite/40 cursor-pointer font-bold text-lg text-status-accepted hover:bg-graphite/10 transition-colors" onClick={() => player && onToggleLineup(player.id, teamId, player.is_in_lineup)}>{player ? (player.is_in_lineup ? '✓' : '') : ''}</td>

                      {/* ВЗЯТИЕ ВОРОТ */}
                      <td className="border-r border-graphite/30 font-bold text-graphite/40 text-sm">{goal || isGoalInput || isEditingGoal ? i + 1 : ''}</td>
                      {isEditingGoal ? (
                        <>
                          <td className="border-r border-graphite/30 p-1 bg-orange/5"><StylishInput value={editGoalData.time} onChange={e=>setEditGoalData({...editGoalData, time: formatTimeMask(e.target.value)})} /></td>
                          <td className="border-r border-graphite/30 p-1 bg-orange/5"><StylishSelect roster={roster} value={editGoalData.scorer} onChange={e=>setEditGoalData({...editGoalData, scorer: e.target.value})} className="!text-status-accepted font-bold" /></td>
                          <td className="border-r border-graphite/30 p-1 bg-orange/5"><StylishSelect roster={roster} value={editGoalData.ast1} onChange={e=>setEditGoalData({...editGoalData, ast1: e.target.value})} exclude={[editGoalData.scorer]} /></td>
                          <td className="border-r border-graphite/30 p-1 bg-orange/5"><StylishSelect roster={roster} value={editGoalData.ast2} onChange={e=>setEditGoalData({...editGoalData, ast2: e.target.value})} exclude={[editGoalData.scorer, editGoalData.ast1]} /></td>
                          <td className="border-r border-graphite/30 p-1 bg-orange/5"><CustomSelect options={goalStrengthOptions} value={editGoalData.str} onChange={e=>setEditGoalData({...editGoalData, str: e.target.value})} /></td>
                          <td className="border-r-2 border-graphite/40 p-0 text-center bg-orange/5"><button onClick={saveEditGoal} className="bg-status-accepted text-white w-full h-full min-h-[36px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"><SaveIcon /></button></td>
                        </>
                      ) : goal ? (
                        <>
                          <td className="border-r border-graphite/30 font-mono text-sm font-semibold text-graphite-light">{formatTime(goal.time_seconds)}</td>
                          <td className="border-r border-graphite/30 font-bold text-sm text-graphite">{getJersey(goal.primary_player_id)}</td>
                          <td className="border-r border-graphite/30 font-semibold text-sm text-graphite-light">{getJersey(goal.assist1_id)}</td>
                          <td className="border-r border-graphite/30 font-semibold text-sm text-graphite-light">{getJersey(goal.assist2_id)}</td>
                          <td className="border-r border-graphite/30 text-xs text-graphite/60 uppercase font-bold">{GOAL_STRENGTH_DISPLAY[goal.goal_strength] || ''}</td>
                          <td className="border-r-2 border-graphite/40 p-0 text-center">
                             <div className="flex justify-center items-center h-full gap-2 px-1 opacity-50 hover:opacity-100 transition-opacity">
                                {isPlusMinusEnabled && <button onClick={() => onRequestPlusMinus(goal)} className={`transition-colors ${goal.has_plus_minus ? 'text-status-accepted hover:text-status-accepted/80' : 'text-graphite/40 hover:text-status-accepted'}`} title="Показатель полезности (+/-)"><UsersIcon /></button>}
                                <button onClick={() => startEditGoal(goal)} className="text-graphite/40 hover:text-orange transition-colors" title="Редактировать"><EditIcon /></button>
                                <button onClick={() => onDeleteEvent(goal.id)} className="text-graphite/40 hover:text-status-rejected transition-colors" title="Удалить"><DeleteIcon /></button>
                             </div>
                          </td>
                        </>
                      ) : isGoalInput ? (
                        <>
                          <td className="border-r border-graphite/30 p-1"><StylishInput value={newGoal.time} placeholder={formatTime(timerSeconds)} onChange={e=>setNewGoal({...newGoal, time: formatTimeMask(e.target.value)})} /></td>
                          <td className="border-r border-graphite/30 p-1"><StylishSelect roster={roster} value={newGoal.scorer} onChange={e=>setNewGoal({...newGoal, scorer: e.target.value})} className="!text-status-accepted font-bold" /></td>
                          <td className="border-r border-graphite/30 p-1"><StylishSelect roster={roster} value={newGoal.ast1} onChange={e=>setNewGoal({...newGoal, ast1: e.target.value})} exclude={[newGoal.scorer]} /></td>
                          <td className="border-r border-graphite/30 p-1"><StylishSelect roster={roster} value={newGoal.ast2} onChange={e=>setNewGoal({...newGoal, ast2: e.target.value})} exclude={[newGoal.scorer, newGoal.ast1]} /></td>
                          <td className="border-r border-graphite/30 p-1"><CustomSelect options={goalStrengthOptions} value={newGoal.str} onChange={e=>setNewGoal({...newGoal, str: e.target.value})} /></td>
                          <td className="border-r-2 border-graphite/40 p-0 text-center"><button onClick={handleAddGoal} className="w-full h-full min-h-[36px] hover:bg-status-accepted/10 text-status-accepted transition-colors flex items-center justify-center"><PlusIcon /></button></td>
                        </>
                      ) : (
                        <><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r-2 border-graphite/40"></td></>
                      )}

                      {/* УДАЛЕНИЯ */}
                      {isEditingPenalty ? (
                        <>
                          <td className="border-r border-graphite/30 p-1 bg-orange/5"><StylishSelect roster={roster} value={editPenaltyData.player} onChange={e=>setEditPenaltyData({...editPenaltyData, player: e.target.value})} className="!text-status-rejected font-bold" /></td>
                          <td className="border-r border-graphite/30 p-1 bg-orange/5"><CustomSelect options={penaltyMinsOptions} value={editPenaltyData.mins} onChange={e=>setEditPenaltyData({...editPenaltyData, mins: e.target.value})} /></td>
                          <td className="border-r border-graphite/30 p-1 bg-orange/5"><CustomSelect options={penaltyReasonOptions} value={editPenaltyData.violation} onChange={e=>setEditPenaltyData({...editPenaltyData, violation: e.target.value})} dropdownWidth="min-w-[280px]" className="px-1" /></td>
                          <td className="border-r border-graphite/30 p-1 bg-orange/5"><StylishInput value={editPenaltyData.start} onChange={e=>setEditPenaltyData({...editPenaltyData, start: formatTimeMask(e.target.value)})} /></td>
                          <td className="border-r border-graphite/30 p-1 bg-orange/5"><StylishInput value={editPenaltyData.end} onChange={e=>setEditPenaltyData({...editPenaltyData, end: formatTimeMask(e.target.value)})} /></td>
                          <td className="border-r-2 border-graphite/40 p-0 text-center bg-orange/5"><button onClick={saveEditPenalty} className="bg-status-accepted text-white w-full h-full min-h-[36px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"><SaveIcon /></button></td>
                        </>
                      ) : penalty ? (
                        <>
                          <td className="border-r border-graphite/30 font-bold text-sm text-graphite">{getJersey(penalty.primary_player_id)}</td>
                          <td className="border-r border-graphite/30 font-semibold text-sm text-graphite">{parseInt(penalty.penalty_minutes, 10) === 4 ? '2+2' : penalty.penalty_minutes}</td>
                          <td className="border-r border-graphite/30 text-left px-3 text-xs truncate whitespace-nowrap overflow-hidden text-graphite-light font-medium" title={penalty.penalty_violation}>{penalty.penalty_violation}</td>
                          <td className="border-r border-graphite/30 font-mono font-semibold text-sm text-graphite-light">{formatTime(penalty.effStart)}</td>
                          <td className={`border-r border-graphite/30 ${endTimeClass}`}>{endTimeDisplay}</td>
                          <td className="border-r-2 border-graphite/40 p-0 text-center">
                             <div className="flex justify-center items-center h-full gap-2 px-1 opacity-50 hover:opacity-100 transition-opacity">
                                <button onClick={() => startEditPenalty(penalty)} className="text-graphite/40 hover:text-orange transition-colors" title="Редактировать"><EditIcon /></button>
                                <button onClick={() => onDeleteEvent(penalty.id)} className="text-graphite/40 hover:text-status-rejected transition-colors" title="Удалить"><DeleteIcon /></button>
                             </div>
                          </td>
                        </>
                      ) : isPenaltyInput ? (
                        <>
                          <td className="border-r border-graphite/30 p-1"><StylishSelect roster={roster} value={newPenalty.player} onChange={e=>setNewPenalty({...newPenalty, player: e.target.value})} className="!text-status-rejected font-bold" /></td>
                          <td className="border-r border-graphite/30 p-1"><CustomSelect options={penaltyMinsOptions} value={newPenalty.mins} onChange={e=>setNewPenalty({...newPenalty, mins: e.target.value})} /></td>
                          <td className="border-r border-graphite/30 p-1"><CustomSelect options={penaltyReasonOptions} value={newPenalty.violation} onChange={e=>setNewPenalty({...newPenalty, violation: e.target.value})} dropdownWidth="min-w-[280px]" className="px-1" /></td>
                          <td className="border-r border-graphite/30 p-1"><StylishInput value={newPenalty.start} placeholder={formatTime(timerSeconds)} onChange={e=>setNewPenalty({...newPenalty, start: formatTimeMask(e.target.value)})} onBlur={()=>{ if(!newPenalty.start){ const s=timerSeconds; setNewPenalty(p=>({...p, start:formatTime(s), end:formatTime(s + parseInt(p.mins||0)*60)}))} }} /></td>
                          <td className="border-r border-graphite/30 p-1"><StylishInput value={newPenalty.end} onChange={e=>setNewPenalty({...newPenalty, end: formatTimeMask(e.target.value)})} /></td>
                          <td className="border-r-2 border-graphite/40 p-0 text-center"><button onClick={handleAddPenalty} className="w-full h-full min-h-[36px] hover:bg-status-rejected/10 text-status-rejected transition-colors flex items-center justify-center"><PlusIcon /></button></td>
                        </>
                      ) : (
                        <><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r border-graphite/30"></td><td className="border-r-2 border-graphite/40"></td></>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};