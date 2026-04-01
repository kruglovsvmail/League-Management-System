// src/components/GameLiveDesk/ShootoutAccordion.jsx
import React, { useState, useEffect } from 'react';
import { 
  StylishSelect, 
  PlusIcon, 
  DeleteIcon,
  EditIcon,
  SaveIcon,
  ShootoutGoalIcon,
  ShootoutMissIcon
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

// Локальный саб-компонент для колонки команды
const ShootoutColumn = ({ teamId, teamLetter, teamName, roster, oppRoster, events, onSaveEvent, onDeleteEvent, soLength, periodLength, otLength, periodsCount }) => {
  const shots = events.filter(e => e.team_id === teamId && (e.event_type === 'shootout_goal' || e.event_type === 'shootout_miss')).sort((a,b) => a.id - b.id);
  const allShootoutsTotal = events.filter(e => e.event_type === 'shootout_goal' || e.event_type === 'shootout_miss');
  
  const [newShot, setNewShot] = useState({ player: '', goalie: '', result: 'shootout_miss' });
  const [editShotId, setEditShotId] = useState(null);
  const [editData, setEditData] = useState({ player: '', goalie: '', result: '' });

  const getPlayerId = (jersey, rst) => rst.find(r => r.jersey_number == jersey)?.player_id || null;
  const getJersey = (id, rst) => rst.find(r => r.player_id == id)?.jersey_number || '';

  const goalies = oppRoster.filter(p => p.position_in_line === 'G' || p.position === 'Вр.' || String(p.position).toLowerCase() === 'goalie');

  const handleAdd = () => {
    const pLen = parseInt(periodLength, 10) || 20;
    const oLen = parseInt(otLength, 10) || 5;
    const c = parseInt(periodsCount, 10) || 3;
    const baseTime = (pLen * c * 60) + (oLen * 60);
    const nextTime = baseTime + (allShootoutsTotal.length * 30) + 30;

    onSaveEvent(teamId, newShot.result, {
      player_id: getPlayerId(newShot.player, roster),
      against_goalie_id: getPlayerId(newShot.goalie, oppRoster),
      time_seconds: nextTime
    });
    setNewShot({ player: '', goalie: '', result: 'shootout_miss' });
  };

  const startEdit = (shot) => {
    setEditShotId(shot.id);
    setEditData({
      player: getJersey(shot.primary_player_id, roster),
      goalie: getJersey(shot.against_goalie_id, oppRoster),
      result: shot.event_type
    });
  };

  const handleSaveEdit = () => {
    const shotToEdit = shots.find(s => s.id === editShotId);
    onSaveEvent(teamId, editData.result, {
      player_id: getPlayerId(editData.player, roster),
      against_goalie_id: getPlayerId(editData.goalie, oppRoster),
      time_seconds: shotToEdit.time_seconds
    }, editShotId);
    setEditShotId(null);
  };

  const rowsCount = Math.max(soLength, shots.length + 1);
  const rows = Array.from({ length: rowsCount });

  return (
    <div className="flex-1 min-w-0 bg-white border border-graphite/20 shadow-sm rounded-md relative">
       <div className="font-bold text-graphite text-base uppercase tracking-wide flex items-center gap-3 px-5 py-3 border-b border-graphite/20 bg-white rounded-t-md">
          <span className="border-2 border-graphite w-8 h-8 flex items-center justify-center font-black rounded-sm">{teamLetter}</span>
          <span className="truncate">{teamName}</span>
       </div>
       <div className="overflow-visible pb-12 pt-0.5">
         <table className="w-full text-sm text-center border-collapse table-fixed select-none">
            <thead>
                <tr className="bg-graphite/15 text-xs text-graphite-light uppercase tracking-wider relative z-0">
                    <th className="border-r border-graphite/30 py-2 font-bold w-12">№</th>
                    <th className="border-r border-graphite/30 py-2 text-center font-bold w-[90px]">Бросающий</th>
                    <th className="border-r border-graphite/30 py-2 font-bold w-[90px]">Вратарь</th>
                    <th className="border-r border-graphite/30 py-2 font-bold w-[90px]">Результат</th>
                    <th className="py-2 w-[100px]"></th>
                </tr>
            </thead>
            <tbody className="bg-white text-graphite relative z-10">
                {rows.map((_, i) => {
                    const shot = shots[i];
                    const isInput = i === shots.length;

                    if (shot && shot.id === editShotId) {
                        return (
                            <tr key={`edit-${shot.id}`} className="h-[36px] border-b border-graphite/30 bg-orange/5 transition-colors">
                                <td className="font-bold text-graphite/40 border-r border-graphite/30">{i + 1}</td>
                                <td className="p-1 border-r border-graphite/30 text-center">
                                    <StylishSelect roster={roster} value={editData.player} onChange={e=>setEditData({...editData, player: e.target.value})} className="font-bold" />
                                </td>
                                <td className="p-1 border-r border-graphite/30 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        {goalies.length > 0 ? goalies.map(g => (
                                            <button
                                                key={`edit-g-${g.player_id}`}
                                                type="button"
                                                onClick={() => setEditData({...editData, goalie: g.jersey_number})}
                                                className={`w-7 h-7 rounded flex items-center justify-center font-black text-[12px] transition-colors ${String(editData.goalie) === String(g.jersey_number) ? 'bg-graphite text-white shadow-sm' : 'text-graphite/40 hover:bg-graphite/10'}`}
                                                title={`Вратарь: ${g.last_name || g.jersey_number}`}
                                            >
                                                {g.jersey_number}
                                            </button>
                                        )) : <span className="text-[10px] text-graphite/40">Нет Вр.</span>}
                                    </div>
                                </td>
                                <td className="p-1 border-r border-graphite/30">
                                    <div className="flex items-center justify-center gap-1.5">
                                        <button 
                                            type="button"
                                            onClick={() => setEditData({...editData, result: 'shootout_goal'})}
                                            className={`w-7 h-7 rounded flex items-center justify-center transition-all border ${editData.result === 'shootout_goal' ? 'border-status-accepted bg-status-accepted/10' : 'border-transparent hover:bg-status-accepted/10'}`}
                                            title="Гол"
                                        >
                                            <ShootoutGoalIcon className={`w-4 h-4 transition-all ${editData.result === 'shootout_goal' ? 'text-status-accepted scale-110' : 'text-status-accepted opacity-40'}`} />
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setEditData({...editData, result: 'shootout_miss'})}
                                            className={`w-7 h-7 rounded flex items-center justify-center transition-all border ${editData.result === 'shootout_miss' ? 'border-status-rejected bg-status-rejected/10' : 'border-transparent hover:bg-status-rejected/10'}`}
                                            title="Мимо/Вратарь"
                                        >
                                            <ShootoutMissIcon className={`w-4 h-4 transition-all ${editData.result === 'shootout_miss' ? 'text-status-rejected scale-110' : 'text-status-rejected opacity-40'}`} />
                                        </button>
                                    </div>
                                </td>
                                <td className="p-0 text-center">
                                    <button onClick={handleSaveEdit} className="bg-status-accepted text-white w-full h-full min-h-[36px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"><SaveIcon /></button>
                                </td>
                            </tr>
                        );
                    }

                    return (
                        <tr key={i} className="even:bg-graphite/[0.02] hover:bg-graphite/5 transition-colors group h-[36px] border-b border-graphite/30">
                            <td className="font-bold text-graphite/40 border-r border-graphite/30 text-sm">{i + 1}</td>
                            {shot ? (
                                <>
                                    <td className="text-center font-bold border-r border-graphite/30 text-sm text-graphite">{getJersey(shot.primary_player_id, roster)}</td>
                                    <td className="text-center font-semibold text-graphite border-r border-graphite/30 text-sm">{getJersey(shot.against_goalie_id, oppRoster)}</td>
                                    <td className="flex justify-center items-center h-[36px] border-r border-graphite/30">
                                        {shot.event_type === 'shootout_goal' ? (
                                            <ShootoutGoalIcon className="w-5 h-5 text-status-accepted" />
                                        ) : (
                                            <ShootoutMissIcon className="w-5 h-5 text-status-rejected" />
                                        )}
                                    </td>
                                    <td className="p-0 text-center">
                                        <div className="flex justify-center items-center w-full h-full opacity-0 group-hover:opacity-100 transition-opacity px-1 gap-2">
                                            <button onClick={() => startEdit(shot)} className="text-graphite/40 hover:text-orange transition-colors" title="Редактировать"><EditIcon /></button>
                                            <button onClick={() => onDeleteEvent(shot.id)} className="text-graphite/40 hover:text-status-rejected transition-colors" title="Удалить"><DeleteIcon /></button>
                                        </div>
                                    </td>
                                </>
                            ) : isInput ? (
                                <>
                                    <td className="p-1 border-r border-graphite/30 text-center">
                                        <StylishSelect roster={roster} value={newShot.player} onChange={e=>setNewShot({...newShot, player: e.target.value})} className="font-bold" />
                                    </td>
                                    <td className="p-1 border-r border-graphite/30 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            {goalies.length > 0 ? goalies.map(g => (
                                                <button
                                                    key={g.player_id}
                                                    type="button"
                                                    onClick={() => setNewShot({...newShot, goalie: g.jersey_number})}
                                                    className={`w-7 h-7 rounded flex items-center justify-center font-black text-[12px] transition-colors ${String(newShot.goalie) === String(g.jersey_number) ? 'bg-graphite text-white shadow-sm' : 'text-graphite/40 hover:bg-graphite/10'}`}
                                                    title={`Вратарь: ${g.last_name || g.jersey_number}`}
                                                >
                                                    {g.jersey_number}
                                                </button>
                                            )) : <span className="text-[10px] text-graphite/40">Нет Вр.</span>}
                                        </div>
                                    </td>
                                    <td className="p-1 border-r border-graphite/30">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <button 
                                                type="button"
                                                onClick={() => setNewShot({...newShot, result: 'shootout_goal'})}
                                                className={`w-7 h-7 rounded flex items-center justify-center transition-all border ${newShot.result === 'shootout_goal' ? 'border-status-accepted bg-status-accepted/10' : 'border-transparent hover:bg-status-accepted/10'}`}
                                                title="Гол"
                                            >
                                                <ShootoutGoalIcon className={`w-4 h-4 transition-all ${newShot.result === 'shootout_goal' ? 'text-status-accepted scale-110' : 'text-status-accepted opacity-40'}`} />
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setNewShot({...newShot, result: 'shootout_miss'})}
                                                className={`w-7 h-7 rounded flex items-center justify-center transition-all border ${newShot.result === 'shootout_miss' ? 'border-status-rejected bg-status-rejected/10' : 'border-transparent hover:bg-status-rejected/10'}`}
                                                title="Мимо/Вратарь"
                                            >
                                                <ShootoutMissIcon className={`w-4 h-4 transition-all ${newShot.result === 'shootout_miss' ? 'text-status-rejected scale-110' : 'text-status-rejected opacity-40'}`} />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="p-0 text-center"><button onClick={handleAdd} className="w-full h-full min-h-[36px] hover:bg-status-accepted/10 text-status-accepted transition-colors flex items-center justify-center"><PlusIcon /></button></td>
                                </>
                            ) : (
                                <><td className="border-r border-graphite/30"/><td className="border-r border-graphite/30"/><td className="border-r border-graphite/30"/><td/></>
                            )}
                        </tr>
                    )
                })}
            </tbody>
        </table>
       </div>
    </div>
  );
};

export const ShootoutAccordion = ({ game, events, homeRoster, awayRoster, currentPeriod, soLength, periodLength, otLength, periodsCount, onSaveEvent, onDeleteEvent }) => {
  const [isShootoutExpanded, setIsShootoutExpanded] = useState(false);

  useEffect(() => {
    if (currentPeriod === 'SO') {
      setIsShootoutExpanded(true);
    }
  }, [currentPeriod]);

  return (
    <div className={`mb-8 bg-white border border-graphite/20 shadow-lg flex flex-col font-sans rounded-md transition-all duration-500 ease-in-out ${currentPeriod === 'SO' ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
      <div 
         className="bg-gray-bg-light border-b border-graphite/20 px-5 py-3 flex justify-between items-center rounded-t-md select-none cursor-pointer hover:bg-graphite/5 transition-colors"
         onClick={() => setIsShootoutExpanded(!isShootoutExpanded)}
      >
          <div className="font-bold py-1 text-graphite text-base uppercase tracking-wide flex items-center gap-3">
             <ChevronIcon isExpanded={isShootoutExpanded} />
             Броски, определяющие победителя (Буллиты)
          </div>
          <div className="flex items-center gap-3 text-sm font-semibold text-graphite-light">
             {currentPeriod !== 'SO' && <span className="text-[10px] font-bold text-graphite-light uppercase tracking-widest bg-graphite/5 px-2 py-1 rounded">Заблокировано до серии SO</span>}
          </div>
      </div>
      
      <div className={`grid transition-all duration-300 ease-in-out ${isShootoutExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
         <div className={isShootoutExpanded ? 'overflow-visible' : 'overflow-hidden'}>
             <div className="flex w-full gap-5 p-5 bg-graphite/[0.02] rounded-b-md border-t border-graphite/20">
                 <ShootoutColumn 
                    teamId={game.home_team_id} teamLetter="А" teamName={game.home_team_name} 
                    roster={homeRoster} oppRoster={awayRoster} events={events} 
                    onSaveEvent={onSaveEvent} onDeleteEvent={onDeleteEvent} 
                    soLength={soLength} periodLength={periodLength} otLength={otLength} periodsCount={periodsCount}
                 />
                 <ShootoutColumn 
                    teamId={game.away_team_id} teamLetter="Б" teamName={game.away_team_name} 
                    roster={awayRoster} oppRoster={homeRoster} events={events} 
                    onSaveEvent={onSaveEvent} onDeleteEvent={onDeleteEvent} 
                    soLength={soLength} periodLength={periodLength} otLength={otLength} periodsCount={periodsCount}
                 />
             </div>
         </div>
      </div>
    </div>
  );
};