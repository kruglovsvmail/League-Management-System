// src/components/GameLiveDesk/SummaryTablesAccordion.jsx
import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../utils/helpers';
import { 
  formatTime, parseTime, formatTimeMask, 
  StylishInput, CustomSelect, EditIcon, DeleteIcon, SaveIcon, PlusIcon
} from './GameDeskShared';
import { ConfirmModal } from '../../modals/ConfirmModal';

const ChevronIcon = ({ isExpanded }) => (
  <svg 
    className={`w-6 h-6 text-graphite-light transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
    fill="none" stroke="currentColor" viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
  </svg>
);

const ShieldIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const TargetIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

export const SummaryTablesAccordion = ({ 
  game, goalieLog, shotsSummary, 
  homeRoster, awayRoster, timerSeconds,
  onSaveGoalieLog, onRequestDeleteGoalieLog, onSaveShotsSummary, isReadOnly 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const [editLogId, setEditLogId] = useState(null);
  const [editLogData, setEditLogData] = useState({});
  const [newLogData, setNewLogData] = useState({ time: '', home_goalie: '', away_goalie: '' });

  useEffect(() => {
    const lastLog = goalieLog.length > 0 ? goalieLog[goalieLog.length - 1] : null;
    setNewLogData(prev => ({
      ...prev,
      home_goalie: lastLog ? (lastLog.home_goalie_id || '') : '',
      away_goalie: lastLog ? (lastLog.away_goalie_id || '') : ''
    }));
  }, [goalieLog]);

  const [editShotTeamId, setEditShotTeamId] = useState(null);
  const [editShotData, setEditShotData] = useState({});
  const [confirmClearTeamId, setConfirmClearTeamId] = useState(null);
  const [isClearing, setIsClearing] = useState(false);

  const getGoalieOptions = (roster) => {
    return roster.filter(r => r.position === 'goalie' || r.position_in_line === 'G')
                 .sort((a, b) => a.jersey_number - b.jersey_number)
                 .map(g => ({ value: g.player_id, label: `#${g.jersey_number} ${g.last_name || ''}` }));
  };

  const homeGoalieOptions = getGoalieOptions(homeRoster);
  const awayGoalieOptions = getGoalieOptions(awayRoster);

  const renderGoalieLabel = (goalieId, options) => {
    const g = options.find(o => String(o.value) === String(goalieId || ''));
    if (g && g.value !== '') return g.label;
    return <span className="text-graphite/40 italic text-[11px] font-bold">ПУСТЫЕ ВОРОТА</span>;
  };

  const startEditLog = (log) => {
    setEditLogId(log.id);
    setEditLogData({
      time: formatTime(log.time_seconds),
      home_goalie: log.home_goalie_id || '',
      away_goalie: log.away_goalie_id || ''
    });
  };

  const saveEditLog = () => {
    onSaveGoalieLog({
      id: editLogId,
      time_seconds: parseTime(editLogData.time) || 0,
      home_goalie_id: editLogData.home_goalie || null,
      away_goalie_id: editLogData.away_goalie || null
    });
    setEditLogId(null);
  };

  const handleAddLog = () => {
    const timeSecs = newLogData.time ? parseTime(newLogData.time) : (timerSeconds || 0);
    
    onSaveGoalieLog({
      time_seconds: timeSecs,
      home_goalie_id: newLogData.home_goalie || null,
      away_goalie_id: newLogData.away_goalie || null
    });
    setNewLogData(prev => ({ ...prev, time: '' })); 
  };

  const lastGoalieLog = goalieLog.length > 0 ? goalieLog[goalieLog.length - 1] : null;
  const isGoaliesMatch = lastGoalieLog && 
    String(lastGoalieLog.home_goalie_id || '') === String(newLogData.home_goalie) && 
    String(lastGoalieLog.away_goalie_id || '') === String(newLogData.away_goalie);

  const periodsCount = game?.periods_count || 3;
  const periods = Array.from({ length: periodsCount }, (_, i) => String(i + 1));
  
  if (parseInt(game?.ot_length, 10) > 0) {
      periods.push('OT');
  }

  const getShotsForPeriod = (teamId, period) => {
    const record = shotsSummary.find(s => s.team_id === teamId && s.period === period);
    return record ? parseInt(record.shots_count, 10) : 0;
  };

  const calculateTotalShots = (teamId) => {
    let sum = 0;
    periods.forEach(p => sum += getShotsForPeriod(teamId, p));
    return sum;
  };

  const getDisplayTotal = (teamId) => {
    const sum = calculateTotalShots(teamId);
    if (sum > 0) return sum;
    return getShotsForPeriod(teamId, 'Total'); 
  };

  const startEditShots = (teamId) => {
    setEditShotTeamId(teamId);
    const data = {};
    periods.forEach(p => data[p] = getShotsForPeriod(teamId, p) || '');
    data['Total'] = getDisplayTotal(teamId) || '';
    setEditShotData(data);
  };

  const saveEditShots = () => {
    const currentSum = periods.reduce((sum, p) => sum + (parseInt(editShotData[p], 10) || 0), 0);
    
    periods.forEach(p => {
        onSaveShotsSummary({ team_id: editShotTeamId, period: p, shots_count: parseInt(editShotData[p], 10) || 0 });
    });

    if (currentSum === 0) {
        onSaveShotsSummary({ team_id: editShotTeamId, period: 'Total', shots_count: parseInt(editShotData['Total'], 10) || 0 });
    } else {
        onSaveShotsSummary({ team_id: editShotTeamId, period: 'Total', shots_count: 0 });
    }
    setEditShotTeamId(null);
  };

  const handleShotInputChange = (p, val) => {
    const cleanVal = val.replace(/\D/g, '');
    setEditShotData(prev => ({ ...prev, [p]: cleanVal }));
  };

  const handleConfirmClearShots = async () => {
    setIsClearing(true);
    try {
        const promises = [];
        periods.forEach(p => promises.push(onSaveShotsSummary({ team_id: confirmClearTeamId, period: p, shots_count: 0 })));
        promises.push(onSaveShotsSummary({ team_id: confirmClearTeamId, period: 'Total', shots_count: 0 }));
        await Promise.all(promises);
    } finally {
        setIsClearing(false);
        setConfirmClearTeamId(null);
    }
  };

  const teams = [
    { 
      id: game?.home_team_id, 
      name: game?.home_team_name, 
      letter: 'А',
      logo: game ? getImageUrl(game.home_team_logo || game.home_logo_url || game.home_logo) : null
    },
    { 
      id: game?.away_team_id, 
      name: game?.away_team_name, 
      letter: 'Б',
      logo: game ? getImageUrl(game.away_team_logo || game.away_logo_url || game.away_logo) : null
    }
  ];

  const goalieRowsCount = isReadOnly ? Math.max(1, goalieLog.length) : Math.max(1, goalieLog.length + 1);
  const goalieRows = Array.from({ length: goalieRowsCount });

  return (
    <div className={`bg-white shadow-lg flex flex-col font-sans rounded-md transition-all duration-500 ease-in-out`}>
      <div 
         className="bg-gray-bg-light px-5 py-3 flex justify-between items-center rounded-t-md select-none cursor-pointer hover:bg-graphite/5 transition-colors"
         onClick={() => setIsExpanded(!isExpanded)}
      >
          <div className="font-bold py-1 text-graphite text-base uppercase tracking-wide flex items-center gap-3">
             <ChevronIcon isExpanded={isExpanded} />
             Время вратарей и броски по периодам
          </div>
      </div>
      
      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
         <div className={isExpanded ? 'overflow-visible' : 'overflow-hidden'}>
             <div className="flex w-full gap-5 p-5 bg-graphite/[0.02] rounded-b-md border-t border-graphite/20">
                 
                 {/* ЛЕВАЯ КОЛОНКА: ВРАТАРИ */}
                 <div className="flex-1 min-w-0 bg-white border shadow-sm rounded-md relative flex flex-col">
                    <div className="font-bold text-graphite text-base uppercase tracking-wide flex items-center justify-start gap-3 px-5 py-3 bg-white rounded-t-md">
                        <span className="border-2 border-graphite w-8 h-8 flex items-center justify-center rounded-sm shrink-0">
                            <ShieldIcon className="w-5 h-5" />
                        </span>
                        <span className="truncate">Время игры вратарей</span>
                    </div>
                    
                    <div className="overflow-visible pb-12 pt-0.5">
                        <table className="w-full text-sm text-center border-collapse table-fixed select-none">
                            <thead>
                                <tr className="bg-graphite/15 text-xs text-graphite-light uppercase tracking-wider relative z-0">
                                    <th className="border-r border-graphite/30 py-2 font-bold w-[70px]">Время</th>
                                    <th className="border-r border-graphite/30 py-2 px-1">
                                        <div className="flex items-center justify-center gap-2 text-graphite">
                                            <span className="border-[1.5px] border-graphite w-4 h-4 flex items-center justify-center font-black rounded-[5px] text-[11px] shrink-0">{teams[0].letter}</span>
                                            <span className="font-bold text-[11px] uppercase truncate" title={teams[0].name}>{teams[0].name || 'ХОЗ'}</span>
                                        </div>
                                    </th>
                                    <th className="border-r border-graphite/30 py-2 px-1">
                                        <div className="flex items-center justify-center gap-2 text-graphite">
                                            <span className="border-[1.5px] border-graphite w-4 h-4 flex items-center justify-center font-black rounded-[5px] text-[11px] shrink-0">{teams[1].letter}</span>
                                            <span className="font-bold text-[11px] uppercase truncate" title={teams[1].name}>{teams[1].name || 'ГОС'}</span>
                                        </div>
                                    </th>
                                    <th className="py-2 w-[80px]"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white text-graphite relative z-10">
                                {goalieRows.map((_, i) => {
                                    const log = goalieLog[i];
                                    const isInput = i === goalieLog.length;

                                    if (log && log.id === editLogId && !isReadOnly) {
                                        return (
                                            <tr key={`edit-${log.id}`} className="h-[36px] border-b border-graphite/30 bg-orange/5 transition-colors">
                                                <td className="p-1 border-r border-graphite/30 text-center">
                                                    <StylishInput value={editLogData.time} onChange={e=>setEditLogData({...editLogData, time: formatTimeMask(e.target.value)})} className="text-center font-bold px-1" />
                                                </td>
                                                <td className="p-1 border-r border-graphite/30 text-center">
                                                    <CustomSelect options={homeGoalieOptions} value={editLogData.home_goalie} onChange={e=>setEditLogData({...editLogData, home_goalie: e.target.value})} className="font-bold text-[12px] h-[28px]" placeholder="Пустые ворота" />
                                                </td>
                                                <td className="p-1 border-r border-graphite/30 text-center">
                                                    <CustomSelect options={awayGoalieOptions} value={editLogData.away_goalie} onChange={e=>setEditLogData({...editLogData, away_goalie: e.target.value})} className="font-bold text-[12px] h-[28px]" placeholder="Пустые ворота" />
                                                </td>
                                                <td className="p-0 text-center">
                                                    <button onClick={saveEditLog} className="bg-status-accepted text-white w-full h-full min-h-[36px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"><SaveIcon /></button>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    if (log) {
                                        return (
                                            <tr key={log.id} className="even:bg-graphite/[0.02] hover:bg-graphite/5 transition-colors group h-[36px] border-b border-graphite/30">
                                                <td className="font-mono font-semibold text-[13px] text-graphite border-r border-graphite/30">{formatTime(log.time_seconds)}</td>
                                                <td className="text-center font-bold border-r border-graphite/30 text-[13px] text-graphite">{renderGoalieLabel(log.home_goalie_id, homeGoalieOptions)}</td>
                                                <td className="text-center font-bold border-r border-graphite/30 text-[13px] text-graphite">{renderGoalieLabel(log.away_goalie_id, awayGoalieOptions)}</td>
                                                <td className="p-0 text-center">
                                                    {!isReadOnly && (
                                                        <div className="flex justify-center items-center w-full h-full gap-1.5 px-0.5 opacity-50 hover:opacity-100 transition-opacity">
                                                            <button onClick={() => startEditLog(log)} className="text-graphite/40 hover:text-orange transition-colors" title="Редактировать"><EditIcon /></button>
                                                            {goalieLog.length > 1 && (
                                                                <button onClick={() => onRequestDeleteGoalieLog(log.id)} className="text-graphite/40 hover:text-status-rejected transition-colors" title="Удалить"><DeleteIcon /></button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    }

                                    if (isInput && !isReadOnly) {
                                        return (
                                            <tr key="new-log" className="even:bg-graphite/[0.02] hover:bg-graphite/5 transition-colors group h-[36px] border-b border-graphite/30">
                                                <td className="p-1 border-r border-graphite/30 text-center">
                                                    <StylishInput 
                                                        value={newLogData.time} 
                                                        placeholder={formatTime(timerSeconds)} 
                                                        onChange={e=>setNewLogData({...newLogData, time: formatTimeMask(e.target.value)})} 
                                                        className="text-center font-bold px-1" 
                                                    />
                                                </td>
                                                <td className="p-1 border-r border-graphite/30 text-center">
                                                    <CustomSelect options={homeGoalieOptions} value={newLogData.home_goalie} onChange={e=>setNewLogData({...newLogData, home_goalie: e.target.value})} className="font-bold text-[12px] h-[28px]" placeholder="Пустые ворота" />
                                                </td>
                                                <td className="p-1 border-r border-graphite/30 text-center">
                                                    <CustomSelect options={awayGoalieOptions} value={newLogData.away_goalie} onChange={e=>setNewLogData({...newLogData, away_goalie: e.target.value})} className="font-bold text-[12px] h-[28px]" placeholder="Пустые ворота" />
                                                </td>
                                                <td className="p-0 text-center">
                                                    <button 
                                                        onClick={handleAddLog} 
                                                        disabled={isGoaliesMatch}
                                                        className={`w-full h-full min-h-[36px] transition-colors flex items-center justify-center ${isGoaliesMatch ? 'text-graphite/20 cursor-not-allowed' : 'hover:bg-status-accepted/10 text-status-accepted'}`}
                                                        title={isGoaliesMatch ? 'Вратари не изменились' : 'Добавить запись'}
                                                    >
                                                        <PlusIcon />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    }
                                    return null;
                                })}
                            </tbody>
                        </table>
                    </div>
                 </div>

                 {/* ПРАВАЯ КОЛОНКА: БРОСКИ */}
                 <div className="flex-1 min-w-0 bg-white border border-graphite/20 shadow-sm rounded-md relative flex flex-col">
                    <div className="font-bold text-graphite text-base uppercase tracking-wide flex items-center justify-start gap-3 px-5 py-3 bg-white rounded-t-md">
                        <span className="border-2 border-graphite w-8 h-8 flex items-center justify-center rounded-sm shrink-0">
                            <TargetIcon className="w-5 h-5" />
                        </span>
                        <span className="truncate">Броски по периодам</span>
                    </div>
                    
                    <div className="overflow-visible pb-12 pt-0.5">
                        <table className="w-full text-sm text-center border-collapse table-fixed select-none">
                            <thead>
                                <tr className="bg-graphite/15 text-xs text-graphite-light uppercase tracking-wider relative z-0">
                                    <th className="border-r border-graphite/30 py-2 font-bold w-auto px-3 text-left">Команды</th>
                                    {periods.map(p => (
                                        <th key={p} className="border-r border-graphite/30 py-2 font-bold w-[45px]">{p}</th>
                                    ))}
                                    <th className="border-r border-graphite/30 py-2 font-bold text-status-accepted w-[60px]">Всего</th>
                                    <th className="py-2 w-[80px]"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white text-graphite relative z-10">
                                {teams.map((team, index) => {
                                    const isEditing = editShotTeamId === team.id;
                                    const currentSum = isEditing ? periods.reduce((sum, p) => sum + (parseInt(editShotData[p], 10) || 0), 0) : 0;
                                    
                                    if (isEditing && !isReadOnly) {
                                        return (
                                            <tr key={`edit-team-${team.id}`} className="h-[36px] bg-orange/5 transition-colors">
                                                <td className="border-r border-graphite/30 text-left px-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="border-[1.5px] border-graphite/60 w-5 h-5 flex items-center justify-center font-black rounded-[2px] text-[10px] shrink-0 text-graphite/60">{team.letter}</span>
                                                        {team.logo && <img src={team.logo} alt={team.name} className="w-5 h-5 object-contain drop-shadow-sm opacity-60 shrink-0" />}
                                                        <span className="font-bold text-[13px] text-graphite/60 uppercase truncate" title={team.name}>{team.name}</span>
                                                    </div>
                                                </td>
                                                {periods.map(p => (
                                                    <td key={p} className="p-0.5 border-r border-graphite/30 bg-orange/5 text-center">
                                                        <StylishInput value={editShotData[p]} onChange={(e) => handleShotInputChange(p, e.target.value)} className="text-center font-bold px-1" />
                                                    </td>
                                                ))}
                                                <td className="p-0.5 border-r border-graphite/30 bg-orange/5 text-center">
                                                    <StylishInput 
                                                        value={currentSum > 0 ? currentSum : editShotData['Total']} 
                                                        onChange={(e) => handleShotInputChange('Total', e.target.value)} 
                                                        disabled={currentSum > 0}
                                                        className={`text-center font-bold px-1 ${currentSum > 0 ? 'text-status-accepted opacity-70' : 'text-graphite'}`} 
                                                    />
                                                </td>
                                                <td className="p-0 text-center">
                                                    <button onClick={saveEditShots} className="bg-status-accepted text-white w-full h-full min-h-[36px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"><SaveIcon /></button>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return (
                                        <tr key={team.id} className="even:bg-graphite/[0.02] hover:bg-graphite/5 transition-colors group h-[36px] border-b border-graphite/30">
                                            <td className="border-r border-graphite/30 text-left px-3">
                                                <div className="flex items-center gap-2">
                                                    {team.logo && <img src={team.logo} alt={team.name} className="w-5 h-5 object-contain drop-shadow-sm shrink-0" />}
                                                    <span className="font-bold text-[13px] text-graphite uppercase truncate" title={team.name}>{team.name}</span>
                                                </div>
                                            </td>
                                            {periods.map(p => (
                                                <td key={p} className="font-mono font-semibold text-[13px] text-graphite border-r border-graphite/30">{getShotsForPeriod(team.id, p) || '-'}</td>
                                            ))}
                                            <td className="font-mono font-black text-[13px] text-status-accepted border-r border-graphite/30">{getDisplayTotal(team.id) || '-'}</td>
                                            <td className="p-0 text-center">
                                                {!isReadOnly && (
                                                    <div className="flex justify-center items-center w-full h-full gap-1.5 px-0.5 opacity-50 hover:opacity-100 transition-opacity">
                                                        <button onClick={() => startEditShots(team.id)} className="text-graphite/40 hover:text-orange transition-colors" title="Редактировать"><EditIcon /></button>
                                                        <button onClick={() => setConfirmClearTeamId(team.id)} className="text-graphite/40 hover:text-status-rejected transition-colors" title="Очистить"><DeleteIcon /></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                 </div>

             </div>
         </div>
      </div>

      <ConfirmModal 
        isOpen={!!confirmClearTeamId} 
        onClose={() => setConfirmClearTeamId(null)}
        onConfirm={handleConfirmClearShots} 
        isLoading={isClearing}
      />
    </div>
  );
};