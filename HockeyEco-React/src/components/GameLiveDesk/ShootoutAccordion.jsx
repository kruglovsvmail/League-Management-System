// src/components/GameLiveDesk/ShootoutAccordion.jsx
import React, { useState, useEffect, useRef } from 'react';
import { getImageUrl } from '../../utils/helpers';
import { 
  StylishSelect, 
  PlusIcon, 
  DeleteIcon,
  EditIcon,
  SaveIcon,
  ShootoutGoalIcon,
  ShootoutMissIcon
} from './GameDeskShared';

const ChevronIcon = ({ isExpanded }) => (
  <svg 
    className={`w-6 h-6 text-graphite-light transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
    fill="none" stroke="currentColor" viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
  </svg>
);

// --- ИКОНКИ ДЛЯ СМАРТ-МЕНЮ ---
const PlayIcon = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const TrophyIcon = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>;
const StopIcon = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>;
const RefreshIcon = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;

// --- СМАРТ-БЕЙДЖ СТАТУСА (Modern 2026 UI) ---
const ShootoutStatusPill = ({ status, onStatusChange, isTie, hasShots, isSaving }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => { 
            if (menuRef.current && !menuRef.current.contains(e.target)) setIsOpen(false); 
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const statuses = {
        pending: { 
            label: 'Серия не начата', 
            btnClass: 'bg-white border-graphite/10 text-graphite hover:border-graphite/30 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1)]', 
            dotClass: 'bg-graphite/40' 
        },
        active: { 
            label: 'Серия в процессе', 
            btnClass: 'bg-orange text-white border-orange shadow-[0_4px_16px_-4px_rgba(255,165,0,0.5)] hover:shadow-[0_6px_24px_-4px_rgba(255,165,0,0.6)]', 
            dotClass: 'bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.9)]' 
        },
        finished_win: { 
            label: 'Завершена', 
            btnClass: 'bg-graphite text-white border-graphite shadow-[0_4px_16px_-4px_rgba(0,0,0,0.3)] hover:shadow-[0_6px_24px_-4px_rgba(0,0,0,0.4)]', 
            dotClass: 'bg-status-accepted shadow-[0_0_8px_rgba(34,197,94,0.8)]' 
        }
    };

    const current = statuses[status] || statuses.pending;

    const handleAction = (newStatus) => {
        setIsOpen(false);
        onStatusChange(newStatus);
    };

    return (
        <div className="relative" ref={menuRef}>
            <button 
                onClick={(e) => {
                    e.stopPropagation(); 
                    if (!isSaving) setIsOpen(!isOpen);
                }}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-[14px] border text-xs font-bold uppercase tracking-widest transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-95 ${current.btnClass} ${isSaving ? 'opacity-50 cursor-wait' : 'hover:-translate-y-0.5'}`}
            >
                <span className={`w-2.5 h-2.5 rounded-full ${current.dotClass}`}></span>
                {current.label}
                <svg className={`w-4 h-4 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isOpen ? 'rotate-180' : ''} ${status === 'pending' ? 'text-graphite/40' : 'text-white/70'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
            </button>

            <div 
                className={`absolute right-0 mt-3 w-[340px] bg-white/95 backdrop-blur-2xl border border-graphite/10 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.15)] rounded-[20px] p-2 z-[100] transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] origin-top-right ${isOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}`} 
                onClick={e => e.stopPropagation()}
            >
                <div className="">
                </div>
                
                {status === 'pending' && (
                    <button onClick={() => handleAction('active')} className="w-full text-left p-3 rounded-2xl hover:bg-graphite/[0.04] active:bg-graphite/[0.08] flex items-center gap-4 transition-all duration-200 group">
                        <div className="w-12 h-12 rounded-[14px] bg-orange/10 flex items-center justify-center text-orange group-hover:scale-110 group-hover:bg-orange group-hover:text-white transition-all duration-300 ease-out">
                            <PlayIcon />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-graphite">Запустить серию</span>
                            <span className="text-xs font-medium text-graphite/50 mt-0.5">Открыть таблицы для ввода бросков</span>
                        </div>
                    </button>
                )}

                {status === 'active' && (
                    <div className="flex flex-col gap-1.5">
                        <button 
                            onClick={() => !isTie && hasShots && handleAction('finished_win')} 
                            disabled={isTie || !hasShots}
                            className={`w-full text-left p-3 rounded-2xl flex items-center gap-4 transition-all duration-200 group ${isTie || !hasShots ? 'opacity-50 cursor-not-allowed' : 'hover:bg-status-accepted/10 active:bg-status-accepted/20'}`}
                        >
                            <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center transition-all duration-300 ${isTie || !hasShots ? 'bg-graphite/10 text-graphite/50' : 'bg-status-accepted/20 text-status-accepted group-hover:scale-110 group-hover:bg-status-accepted group-hover:text-white ease-out'}`}>
                                <TrophyIcon />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-graphite">Завершить с победой</span>
                                <span className="text-xs font-medium text-graphite/50 mt-0.5">Начислить +1 гол в счет матча</span>
                            </div>
                        </button>
                        
                        <button onClick={() => handleAction('pending')} className="w-full text-left p-3 rounded-2xl hover:bg-status-rejected/10 active:bg-status-rejected/20 flex items-center gap-4 transition-all duration-200 group">
                            <div className="w-12 h-12 rounded-[14px] bg-status-rejected/10 flex items-center justify-center text-status-rejected group-hover:scale-110 group-hover:bg-status-rejected group-hover:text-white transition-all duration-300 ease-out">
                                <StopIcon />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-graphite">Остановить серию</span>
                                <span className="text-xs font-medium text-graphite/50 mt-0.5">Отменить запуск без сохранения итога</span>
                            </div>
                        </button>
                    </div>
                )}

                {status === 'finished_win' && (
                    <button onClick={() => handleAction('reopen')} className="w-full text-left p-3 rounded-2xl hover:bg-graphite/[0.04] active:bg-graphite/[0.08] flex items-center gap-4 transition-all duration-200 group">
                        <div className="w-12 h-12 rounded-[14px] bg-graphite/10 flex items-center justify-center text-graphite group-hover:scale-110 transition-transform duration-300 ease-out">
                            <RefreshIcon />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-graphite">Аннулировать итог</span>
                            <span className="text-xs font-medium text-graphite/50 mt-0.5">Отменить результат и открыть таблицы</span>
                        </div>
                    </button>
                )}
            </div>
        </div>
    );
};

// --- ЛОКАЛЬНЫЙ САБ-КОМПОНЕНТ ДЛЯ КОЛОНКИ КОМАНДЫ ---
const ShootoutColumn = ({ isPending, isClosed, teamId, teamLetter, teamName, teamLogo, roster, oppRoster, events, onSaveEvent, onDeleteEvent, soLength, periodLength, otLength, periodsCount }) => {
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

  const rowsCount = isClosed ? Math.max(soLength, shots.length) : Math.max(soLength, shots.length + 1);
  const rows = Array.from({ length: rowsCount });

  return (
    <div className={`flex-1 min-w-0 bg-white border border-graphite/20 shadow-sm rounded-md relative transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${isPending ? 'opacity-30 grayscale blur-[1px] pointer-events-none scale-[0.99] select-none' : 'opacity-100 scale-100'}`}>
       <div className="font-bold text-graphite text-base uppercase tracking-wide flex items-center gap-3 px-5 py-3 bg-white rounded-t-md">
          <span className="border-2 border-graphite w-8 h-8 flex items-center justify-center font-black rounded-sm shrink-0">{teamLetter}</span>
          {teamLogo && <img src={teamLogo} alt={teamName} className="w-8 h-8 object-contain drop-shadow-sm shrink-0" />}
          <span className="truncate" title={teamName}>{teamName}</span>
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

                    if (shot && shot.id === editShotId && !isClosed) {
                        return (
                            <tr key={`edit-${shot.id}`} className="h-[36px] bg-orange/5 transition-colors">
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
                                        {!isClosed && (
                                            <div className="flex justify-center items-center w-full h-full gap-1.5 px-0.5 opacity-50 hover:opacity-100 transition-opacity">
                                                <button onClick={() => startEdit(shot)} className="text-graphite/40 hover:text-orange transition-colors" title="Редактировать"><EditIcon /></button>
                                                <button onClick={() => onDeleteEvent(shot.id)} className="text-graphite/40 hover:text-status-rejected transition-colors" title="Удалить"><DeleteIcon /></button>
                                            </div>
                                        )}
                                    </td>
                                </>
                            ) : (isInput && !isClosed) ? (
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

// --- ГЛАВНЫЙ КОМПОНЕНТ АККОРДЕОНА ---
export const ShootoutAccordion = ({ 
    game, events, homeRoster, awayRoster, currentPeriod, 
    soLength, periodLength, otLength, periodsCount, 
    onSaveEvent, onDeleteEvent, onFinishShootout, onReopenShootout, onUpdateStatus, isSaving 
}) => {
  const [isShootoutExpanded, setIsShootoutExpanded] = useState(false);

  useEffect(() => {
    if (currentPeriod === 'SO') {
      setIsShootoutExpanded(true);
    }
  }, [currentPeriod]);

  const homeGoals = events.filter(e => e.team_id === game?.home_team_id && e.event_type === 'shootout_goal').length;
  const awayGoals = events.filter(e => e.team_id === game?.away_team_id && e.event_type === 'shootout_goal').length;
  const homeShots = events.filter(e => e.team_id === game?.home_team_id && ['shootout_goal', 'shootout_miss'].includes(e.event_type)).length;
  const awayShots = events.filter(e => e.team_id === game?.away_team_id && ['shootout_goal', 'shootout_miss'].includes(e.event_type)).length;

  const isTie = homeGoals === awayGoals;
  const hasShots = homeShots > 0 || awayShots > 0;

  const status = game?.shootout_status || 'pending';
  const isActive = status === 'active';

  const handleStatusChangeRequest = (newStatus) => {
      if (newStatus === 'finished_win') {
          onFinishShootout();
      } else if (newStatus === 'reopen') {
          onReopenShootout();
      } else {
          onUpdateStatus(newStatus);
      }
  };

  return (
    <div className={`bg-white border border-graphite/20 shadow-lg flex flex-col font-sans rounded-md transition-all duration-500 ease-in-out ${currentPeriod === 'SO' ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
      
      <div 
         className="bg-gray-bg-light px-5 py-3 flex justify-between items-center rounded-t-md select-none cursor-pointer hover:bg-graphite/5 transition-colors"
         onClick={() => setIsShootoutExpanded(!isShootoutExpanded)}
      >
          <div className="font-bold py-1 text-graphite text-base uppercase tracking-wide flex items-center gap-3">
             <ChevronIcon isExpanded={isShootoutExpanded} />
             Броски, определяющие победителя (Буллиты)
          </div>
          
          <div className="flex items-center gap-4">
             {currentPeriod !== 'SO' && <span className="text-[10px] font-bold text-graphite-light uppercase tracking-widest bg-graphite/5 px-2 py-1 rounded">Заблокировано до серии SO</span>}
             
             <ShootoutStatusPill 
                 status={status} 
                 isTie={isTie} 
                 hasShots={hasShots}
                 isSaving={isSaving}
                 onStatusChange={handleStatusChangeRequest}
             />
          </div>
      </div>
      
      <div className={`grid transition-all duration-300 ease-in-out ${isShootoutExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
         <div className={isShootoutExpanded ? 'overflow-visible' : 'overflow-hidden'}>
             <div className="flex w-full gap-5 p-5 bg-graphite/[0.02] border-t border-graphite/20 rounded-b-md transition-opacity duration-300">
                 <ShootoutColumn 
                    isPending={status === 'pending'}
                    isClosed={!isActive}
                    teamId={game?.home_team_id} teamLetter="А" teamName={game?.home_team_name} 
                    teamLogo={game ? getImageUrl(game.home_team_logo || game.home_logo_url || game.home_logo) : null}
                    roster={homeRoster} oppRoster={awayRoster} events={events} 
                    onSaveEvent={onSaveEvent} onDeleteEvent={onDeleteEvent} 
                    soLength={soLength} periodLength={periodLength} otLength={otLength} periodsCount={periodsCount}
                 />
                 <ShootoutColumn 
                    isPending={status === 'pending'}
                    isClosed={!isActive}
                    teamId={game?.away_team_id} teamLetter="Б" teamName={game?.away_team_name} 
                    teamLogo={game ? getImageUrl(game.away_team_logo || game.away_logo_url || game.away_logo) : null}
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