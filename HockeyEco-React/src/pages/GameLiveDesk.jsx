import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getToken } from '../utils/helpers';
import { Loader } from '../ui/Loader';
import { Button } from '../ui/Button';

const PENALTY_OPTIONS = [
  { label: '2 мин (Малый)', min: 2, cls: 'minor' },
  { label: '2+2 мин (Двойной малый)', min: 4, cls: 'double_minor' },
  { label: '5 мин (Большой)', min: 5, cls: 'major' },
  { label: '10 мин (Дисциплинарный)', min: 10, cls: 'misconduct' },
  { label: '20 мин (До конца игры)', min: 20, cls: 'game_misconduct' }
];

export function GameLiveDesk() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  
  const [game, setGame] = useState(null);
  const [events, setEvents] = useState([]);
  const [homeRoster, setHomeRoster] = useState([]);
  const [awayRoster, setAwayRoster] = useState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [currentPeriod, setCurrentPeriod] = useState('1'); 
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [drawer, setDrawer] = useState({ isOpen: false, side: 'left', type: 'goal', teamId: null, teamName: '', opponentId: null, opponentName: '' });

  const [formData, setFormData] = useState({
    time: '', primaryPlayer: null, assists: [], 
    goalStrength: 'equal',
    penaltyViolation: 'Подножка', penaltyMinutes: 2, penaltyClass: 'minor',
    plusPlayers: [], minusPlayers: []
  });

  const [selectionMode, setSelectionMode] = useState(null);

  const loadDeskData = async () => {
    try {
      const resGame = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const dataGame = await resGame.json();
      if (!dataGame.success) return navigate(`/games/${gameId}`);
      setGame(dataGame.data);

      const [resEvents, resHome, resAway] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
        fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.home_team_id}`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
        fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.away_team_id}`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      ]);

      const [dataEvents, dataHome, dataAway] = await Promise.all([resEvents.json(), resHome.json(), resAway.json()]);

      if (dataEvents.success) setEvents(dataEvents.data);
      if (dataHome.success) setHomeRoster(dataHome.gameRoster || []);
      if (dataAway.success) setAwayRoster(dataAway.gameRoster || []);
    } catch (err) { console.error(err); } 
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadDeskData(); }, [gameId]);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(console.error);
    else if (document.exitFullscreen) document.exitFullscreen();
  };

  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // МАСКА ВРЕМЕНИ ММ:СС
  const handleTimeChange = (e) => {
    let val = e.target.value.replace(/\D/g, ''); 
    if (val.length > 4) val = val.slice(0, 4);
    if (val.length >= 3) val = `${val.slice(0, 2)}:${val.slice(2)}`;
    setFormData({ ...formData, time: val });
  };

  const openDrawer = (type, teamId, teamName, opponentId, opponentName) => {
    setFormData({
      time: '', primaryPlayer: null, assists: [], goalStrength: 'equal',
      penaltyViolation: 'Подножка', penaltyMinutes: 2, penaltyClass: 'minor',
      plusPlayers: [], minusPlayers: []
    });
    setSelectionMode(null);
    setDrawer({ isOpen: true, side: teamId === game?.home_team_id ? 'left' : 'right', type, teamId, teamName, opponentId, opponentName });
  };

  const handleSubmit = async () => {
    if (!formData.primaryPlayer) return alert(drawer.type === 'goal' ? 'Выберите автора гола!' : 'Выберите оштрафованного игрока!');
    if (!formData.time.includes(':') || formData.time.length < 4) return alert('Введите время в формате ММ:СС');

    const [m, s] = formData.time.split(':');
    const time_seconds = (parseInt(m) || 0) * 60 + (parseInt(s) || 0);

    const payload = {
        period: currentPeriod, time_seconds, event_type: drawer.type, team_id: drawer.teamId,
        player_id: formData.primaryPlayer.player_id,
        assist1_id: formData.assists[0]?.player_id || null,
        assist2_id: formData.assists[1]?.player_id || null,
        goal_strength: drawer.type === 'goal' ? formData.goalStrength : null,
        penalty_violation: formData.penaltyViolation,
        penalty_minutes: formData.penaltyMinutes,
        penalty_class: formData.penaltyClass,
        plus_players: formData.plusPlayers.map(p => p.player_id),
        minus_players: formData.minusPlayers.map(p => p.player_id),
        opponent_id: drawer.opponentId
    };

    setIsSaving(true);
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            setDrawer({ ...drawer, isOpen: false });
            loadDeskData(); 
        } else alert(data.error || 'Ошибка при сохранении');
    } catch (err) { alert('Сбой сети'); } 
    finally { setIsSaving(false); }
  };

  const handleDeleteEvent = async (eventId) => {
      if (!window.confirm('Вы уверены, что хотите удалить это событие? Счет матча будет пересчитан.')) return;
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${eventId}`, {
              method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` }
          });
          const data = await res.json();
          if (data.success) loadDeskData();
          else alert(data.error || 'Ошибка удаления');
      } catch (err) { alert('Сбой сети'); }
  };

  // КРАСИВАЯ СЕТКА (GRID) ДЛЯ БОКОВЫХ ПАНЕЛЕЙ
  const renderRosterGrid = (roster) => {
    if (!roster || roster.length === 0) return <div className="h-full flex items-center justify-center text-white/30 font-bold p-6">Пусто</div>;
    const sorted = [...roster].sort((a, b) => (a.jersey_number || 999) - (b.jersey_number || 999));
    return (
      <div className="grid grid-cols-4 gap-2">
        {sorted.map(player => (
          <div key={player.player_id} className="aspect-square bg-white/5 rounded-xl flex flex-col items-center justify-center border border-white/5 opacity-80 cursor-default">
            <span className="text-[22px] font-black text-white leading-none">{player.jersey_number || '?'}</span>
            <span className="text-[9px] font-bold text-white/50 uppercase mt-1 max-w-full truncate px-1">{player.last_name}</span>
          </div>
        ))}
      </div>
    );
  };

  // СЕТКА ДЛЯ ВЫБОРА ИГРОКОВ В ШТОРКЕ
  const renderSelectionGrid = () => {
    let activeRoster = (selectionMode === 'minus') 
      ? (drawer.opponentId === game.home_team_id ? homeRoster : awayRoster) 
      : (drawer.teamId === game.home_team_id ? homeRoster : awayRoster);
    
    const sorted = [...activeRoster].sort((a, b) => (a.jersey_number || 999) - (b.jersey_number || 999));

    const handleSelect = (player) => {
      if (selectionMode === 'primary') {
        // АВТОЗАПОЛНЕНИЕ ПЛЮСА
        let newPluses = [...formData.plusPlayers];
        if (!newPluses.find(p => p.player_id === player.player_id)) newPluses.push(player);
        setFormData({ ...formData, primaryPlayer: player, plusPlayers: newPluses });
        setSelectionMode(null); 
      } else if (selectionMode === 'assists') {
        const exists = formData.assists.find(p => p.player_id === player.player_id);
        let newAssists = exists ? formData.assists.filter(p => p.player_id !== player.player_id) : [...formData.assists, player];
        if (newAssists.length > 2) return; // Не больше 2 ассистентов
        
        // АВТОЗАПОЛНЕНИЕ ПЛЮСА
        let newPluses = [...formData.plusPlayers];
        if (!exists && !newPluses.find(p => p.player_id === player.player_id)) newPluses.push(player);
        
        setFormData({ ...formData, assists: newAssists, plusPlayers: newPluses });
      } else if (selectionMode === 'plus') {
        const exists = formData.plusPlayers.find(p => p.player_id === player.player_id);
        setFormData({ ...formData, plusPlayers: exists ? formData.plusPlayers.filter(p => p.player_id !== player.player_id) : [...formData.plusPlayers, player] });
      } else if (selectionMode === 'minus') {
        const exists = formData.minusPlayers.find(p => p.player_id === player.player_id);
        setFormData({ ...formData, minusPlayers: exists ? formData.minusPlayers.filter(p => p.player_id !== player.player_id) : [...formData.minusPlayers, player] });
      }
    };

    const isSelected = (pId) => {
      if (selectionMode === 'primary') return formData.primaryPlayer?.player_id === pId;
      if (selectionMode === 'assists') return formData.assists.some(p => p.player_id === pId);
      if (selectionMode === 'plus') return formData.plusPlayers.some(p => p.player_id === pId);
      if (selectionMode === 'minus') return formData.minusPlayers.some(p => p.player_id === pId);
      return false;
    };

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <button onClick={() => setSelectionMode(null)} className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <span className="font-bold text-[16px]">
            {selectionMode === 'primary' ? 'Выберите игрока' : selectionMode === 'assists' ? 'Выберите ассистентов (до 2)' : 'Выберите игроков на льду'}
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          <div className="grid grid-cols-3 gap-3">
            {sorted.map(player => {
              const active = isSelected(player.player_id);
              // Блокируем автора гола при выборе ассистентов
              const isDisabled = selectionMode === 'assists' && formData.primaryPlayer?.player_id === player.player_id;
              
              return (
                <button 
                  key={player.player_id} 
                  onClick={() => !isDisabled && handleSelect(player)}
                  disabled={isDisabled}
                  className={`aspect-square rounded-2xl flex flex-col items-center justify-center transition-all border-2 
                    ${isDisabled ? 'opacity-20 cursor-not-allowed border-transparent bg-white/5' : 
                      active ? 'bg-orange/20 border-orange transform scale-95' : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/20'}`}
                >
                  <span className={`text-[28px] font-black leading-none ${active ? 'text-orange' : 'text-white'}`}>{player.jersey_number || '?'}</span>
                  <span className={`text-[10px] font-bold uppercase mt-2 max-w-full truncate px-2 ${active ? 'text-orange' : 'text-white/50'}`}>{player.last_name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {selectionMode !== 'primary' && (
          <div className="mt-4 pt-4 border-t border-white/10 shrink-0">
            <Button onClick={() => setSelectionMode(null)} className="w-full py-4 !bg-orange hover:!bg-orange/80 !text-white border-0 text-[16px]">Готово</Button>
          </div>
        )}
      </div>
    );
  };

  if (isLoading || !game) return <div className="min-h-screen bg-[#111] flex items-center justify-center"><Loader text="Подготовка рабочего места..." /></div>;

  const showPlusMinus = ['equal', 'sh', 'en'].includes(formData.goalStrength);

  return (
    <div className="min-h-screen bg-graphite flex flex-col text-white overflow-hidden relative select-none">
      
      {/* ШАПКА */}
      <header className="bg-graphite-dark border-b border-white/10 px-6 py-4 flex items-center justify-between shrink-0 shadow-lg z-20">
        <div className="flex items-center gap-3 w-[300px]">
          <button onClick={() => window.close()} className="w-10 h-10 rounded-lg bg-status-rejected/10 text-status-rejected hover:bg-status-rejected hover:text-white flex items-center justify-center transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <button onClick={toggleFullscreen} className="w-10 h-10 rounded-lg bg-white/5 text-white/50 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors">
            {isFullscreen ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 6H5v4m10-4h4v4M5 14v4h4m10-4v4h-4" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>}
          </button>
          <div className="min-w-0 ml-2">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest truncate">Live-протокол</div>
            <div className="text-[14px] font-black leading-tight truncate pr-4">{game.division_name}</div>
          </div>
        </div>

        {/* ТАБЛО */}
        <div className="flex items-center gap-8 bg-black/40 px-8 py-3 rounded-2xl border border-white/5">
          <div className="flex flex-col items-center">
             <span className="text-[12px] font-black uppercase text-white/50 mb-1">{game.home_team_name}</span>
             <span className="text-[48px] font-black leading-none">{game.home_score}</span>
          </div>
          <div className="flex flex-col items-center px-4">
             <div className="flex gap-1 bg-white/10 p-1 rounded-lg mb-2">
                {['1', '2', '3', 'OT', 'SO'].map(p => (
                  <button key={p} onClick={() => setCurrentPeriod(p)} className={`px-4 py-1.5 rounded-md text-[16px] font-bold transition-colors ${currentPeriod === p ? 'bg-orange text-white' : 'text-white/40 hover:text-white/80 hover:bg-white/5'}`}>{p}</button>
                ))}
             </div>
             <span className="text-[11px] font-bold uppercase tracking-widest text-white/30">Период</span>
          </div>
          <div className="flex flex-col items-center">
             <span className="text-[12px] font-black uppercase text-white/50 mb-1">{game.away_team_name}</span>
             <span className="text-[48px] font-black leading-none">{game.away_score}</span>
          </div>
        </div>

        <div className="w-[300px] flex justify-end">
          <Button className="!bg-status-rejected/20 !text-status-rejected hover:!bg-status-rejected hover:!text-white border-0 transition-colors">Завершить матч</Button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        
        {/* ХОЗЯЕВА */}
        <div className="w-[35%] border-r border-white/10 flex flex-col bg-white/5">
          <div className="p-4 flex gap-3 shrink-0">
            <button onClick={() => openDrawer('goal', game.home_team_id, game.home_team_name, game.away_team_id, game.away_team_name)} className="flex-1 py-4 bg-status-accepted/20 hover:bg-status-accepted border border-status-accepted/30 transition-colors rounded-xl text-white font-black text-[18px] shadow-lg flex flex-col items-center gap-1">
              ГОЛ ХОЗЯЕВ
            </button>
            <button onClick={() => openDrawer('penalty', game.home_team_id, game.home_team_name, game.away_team_id, game.away_team_name)} className="flex-1 py-4 bg-status-rejected/20 hover:bg-status-rejected border border-status-rejected/30 transition-colors rounded-xl text-white font-black text-[18px] shadow-lg flex flex-col items-center gap-1">
              УДАЛЕНИЕ
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pt-0 custom-scrollbar">{renderRosterGrid(homeRoster)}</div>
        </div>

        {/* ХРОНОЛОГИЯ (С КНОПКОЙ УДАЛЕНИЯ) */}
        <div className="w-[30%] flex flex-col bg-black/20 relative">
           <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/50 to-transparent z-10 pointer-events-none"></div>
           <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
              {events.length > 0 ? events.map(ev => {
                  const isGoal = ev.event_type === 'goal';
                  return (
                    <div key={ev.id} className={`p-4 bg-white/5 border ${isGoal ? 'border-status-accepted/30' : 'border-status-rejected/30'} rounded-xl relative overflow-hidden group`}>
                       <div className={`absolute left-0 top-0 bottom-0 w-1 ${isGoal ? 'bg-status-accepted' : 'bg-status-rejected'}`}></div>
                       
                       <button onClick={() => handleDeleteEvent(ev.id)} className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-status-rejected/20 text-status-rejected flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-status-rejected hover:text-white" title="Удалить">
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                       </button>

                       <div className="text-center pr-6">
                         <span className="text-[12px] font-bold text-white/50 block mb-1">{formatTime(ev.time_seconds)} • {ev.period} пер</span>
                         <span className="text-[15px] font-black text-white block">
                           {isGoal ? `ГОЛ: ${ev.primary_last_name} ${ev.primary_first_name}` : `Удаление: ${ev.primary_last_name} ${ev.primary_first_name} (${ev.penalty_minutes} мин)`}
                         </span>
                         {isGoal && (ev.assist1_id || ev.assist2_id) && <span className="text-[12px] font-medium text-white/50 block mt-1">Пас: {[ev.assist1_last_name, ev.assist2_last_name].filter(Boolean).join(', ')}</span>}
                         {!isGoal && ev.penalty_violation && <span className="text-[12px] font-medium text-white/50 block mt-1">{ev.penalty_violation}</span>}
                       </div>
                    </div>
                  )
              }) : <div className="h-full flex items-center justify-center text-white/20 font-bold text-[14px]">Событий пока нет</div>}
           </div>
        </div>

        {/* ГОСТИ */}
        <div className="w-[35%] border-l border-white/10 flex flex-col bg-white/5">
          <div className="p-4 flex gap-3 shrink-0">
             <button onClick={() => openDrawer('penalty', game.away_team_id, game.away_team_name, game.home_team_id, game.home_team_name)} className="flex-1 py-4 bg-status-rejected/20 hover:bg-status-rejected border border-status-rejected/30 transition-colors rounded-xl text-white font-black text-[18px] shadow-lg flex flex-col items-center gap-1">
              УДАЛЕНИЕ
            </button>
            <button onClick={() => openDrawer('goal', game.away_team_id, game.away_team_name, game.home_team_id, game.home_team_name)} className="flex-1 py-4 bg-status-accepted/20 hover:bg-status-accepted border border-status-accepted/30 transition-colors rounded-xl text-white font-black text-[18px] shadow-lg flex flex-col items-center gap-1">
              ГОЛ ГОСТЕЙ
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pt-0 custom-scrollbar">{renderRosterGrid(awayRoster)}</div>
        </div>

        {/* ШТОРКА */}
        {drawer.isOpen && <div className="fixed inset-0 bg-black/60 z-40 transition-opacity backdrop-blur-sm" onClick={() => setDrawer({ ...drawer, isOpen: false })}></div>}
        
        <div className={`fixed top-0 bottom-0 w-[440px] bg-graphite border-${drawer.side === 'left' ? 'r' : 'l'} border-white/10 text-white shadow-2xl z-50 transition-transform duration-300 ease-out flex flex-col ${drawer.side === 'left' ? 'left-0' : 'right-0'} ${drawer.isOpen ? 'translate-x-0' : (drawer.side === 'left' ? '-translate-x-full' : 'translate-x-full')}`}>
           
           {selectionMode ? (
              <div className="p-6 flex-1 flex flex-col h-full bg-black/30">{renderSelectionGrid()}</div>
           ) : (
              <>
                 <div className={`p-6 border-b flex justify-between items-center shrink-0 ${drawer.type === 'goal' ? 'bg-status-accepted/10 border-status-accepted/30' : 'bg-status-rejected/10 border-status-rejected/30'}`}>
                    <div>
                       <div className="text-[11px] font-black uppercase tracking-widest text-white/50">{drawer.teamName}</div>
                       <h2 className={`text-[24px] font-black leading-none mt-1 ${drawer.type === 'goal' ? 'text-status-accepted' : 'text-status-rejected'}`}>
                         {drawer.type === 'goal' ? 'Добавить гол' : 'Добавить удаление'}
                       </h2>
                    </div>
                    <button onClick={() => setDrawer({ ...drawer, isOpen: false })} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                 </div>

                 <div className="p-6 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
                    
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">Время (ММ:СС)</label>
                        <input 
                          type="text" 
                          value={formData.time}
                          onChange={handleTimeChange}
                          placeholder="00:00" 
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-4 font-black text-[22px] text-center text-white focus:border-orange focus:bg-black/40 outline-none transition-all tracking-[4px]" 
                        />
                      </div>
                      
                      {drawer.type === 'goal' && (
                        <div className="flex-1">
                          <label className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">Состав</label>
                          <select 
                            value={formData.goalStrength}
                            onChange={(e) => setFormData({...formData, goalStrength: e.target.value})}
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-4 font-bold text-[14px] text-white focus:border-orange outline-none cursor-pointer"
                          >
                             <option value="equal" className="bg-graphite">В равных</option>
                             <option value="pp" className="bg-graphite">В большинстве</option>
                             <option value="sh" className="bg-graphite">В меньшинстве</option>
                             <option value="en" className="bg-graphite">В пустые ворота</option>
                             <option value="ps" className="bg-graphite">Буллит (ШБ)</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="h-px bg-white/10 w-full"></div>

                    <div>
                      <label className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">
                        {drawer.type === 'goal' ? 'Автор гола' : 'Нарушитель'}
                      </label>
                      <div 
                        onClick={() => setSelectionMode('primary')}
                        className={`w-full bg-black/20 border-2 ${formData.primaryPlayer ? 'border-orange text-orange' : 'border-dashed border-white/20 text-white/40'} rounded-xl p-4 flex items-center justify-center gap-3 cursor-pointer hover:border-orange hover:text-orange transition-colors font-bold text-[18px]`}
                      >
                         {formData.primaryPlayer ? (
                           <>
                             <span className="text-[24px] font-black">{formData.primaryPlayer.jersey_number || '?'}</span>
                             <span>{formData.primaryPlayer.last_name} {formData.primaryPlayer.first_name}</span>
                           </>
                         ) : 'Нажмите для выбора...'}
                      </div>
                    </div>

                    {drawer.type === 'goal' && (
                      <div>
                        <label className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">Ассистенты ({formData.assists.length}/2)</label>
                        <div 
                          onClick={() => setSelectionMode('assists')}
                          className={`w-full bg-black/20 border-2 ${formData.assists.length > 0 ? 'border-orange/50 text-white' : 'border-dashed border-white/20 text-white/40'} rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-orange/50 transition-colors font-bold text-[16px]`}
                        >
                           {formData.assists.length > 0 ? (
                             formData.assists.map(p => (
                               <div key={p.player_id} className="flex items-center gap-3 w-full justify-center">
                                 <span className="text-orange font-black text-[20px]">{p.jersey_number || '?'}</span>
                                 <span>{p.last_name} {p.first_name}</span>
                               </div>
                             ))
                           ) : 'Нажмите для выбора...'}
                        </div>
                      </div>
                    )}

                    {drawer.type === 'penalty' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">Штраф (Минуты)</label>
                          <select 
                            value={formData.penaltyMinutes}
                            onChange={(e) => {
                              const opt = PENALTY_OPTIONS.find(o => o.min === parseInt(e.target.value));
                              setFormData({...formData, penaltyMinutes: opt.min, penaltyClass: opt.cls});
                            }}
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-4 font-bold text-[16px] text-white focus:border-orange outline-none cursor-pointer"
                          >
                             {PENALTY_OPTIONS.map(opt => <option key={opt.min} value={opt.min} className="bg-graphite text-white">{opt.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">Нарушение (Формулировка)</label>
                          <input 
                            type="text" 
                            value={formData.penaltyViolation}
                            onChange={(e) => setFormData({...formData, penaltyViolation: e.target.value})}
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-4 font-bold text-[16px] text-white focus:border-orange outline-none transition-all" 
                          />
                        </div>
                      </div>
                    )}

                    {drawer.type === 'goal' && showPlusMinus && (
                      <>
                        <div className="h-px bg-white/10 w-full my-4"></div>
                        
                        <div>
                          <label className="flex justify-between items-center text-[11px] font-bold text-status-accepted uppercase tracking-widest mb-2">
                            <span>Игроки на льду (+ Плюс) • {formData.plusPlayers.length}</span>
                            <span className="text-white/30 text-[9px]">{drawer.teamName}</span>
                          </label>
                          <div 
                            onClick={() => setSelectionMode('plus')}
                            className="w-full bg-status-accepted/5 border-2 border-dashed border-status-accepted/30 rounded-xl p-4 flex flex-wrap items-center justify-center gap-2 cursor-pointer hover:border-status-accepted hover:text-status-accepted text-white/40 transition-colors font-bold text-[16px]"
                          >
                            {formData.plusPlayers.length > 0 ? (
                               formData.plusPlayers.map(p => <span key={p.player_id} className="bg-status-accepted/20 text-status-accepted px-3 py-1.5 rounded-lg border border-status-accepted/30">{p.jersey_number || '?'}</span>)
                            ) : 'Нажмите для выбора...'}
                          </div>
                        </div>

                        <div>
                          <label className="flex justify-between items-center text-[11px] font-bold text-status-rejected uppercase tracking-widest mb-2">
                            <span>Игроки на льду (- Минус) • {formData.minusPlayers.length}</span>
                            <span className="text-white/30 text-[9px]">{drawer.opponentName}</span>
                          </label>
                          <div 
                            onClick={() => setSelectionMode('minus')}
                            className="w-full bg-status-rejected/5 border-2 border-dashed border-status-rejected/30 rounded-xl p-4 flex flex-wrap items-center justify-center gap-2 cursor-pointer hover:border-status-rejected hover:text-status-rejected text-white/40 transition-colors font-bold text-[16px]"
                          >
                             {formData.minusPlayers.length > 0 ? (
                               formData.minusPlayers.map(p => <span key={p.player_id} className="bg-status-rejected/20 text-status-rejected px-3 py-1.5 rounded-lg border border-status-rejected/30">{p.jersey_number || '?'}</span>)
                            ) : 'Нажмите для выбора...'}
                          </div>
                        </div>
                      </>
                    )}
                 </div>

                 <div className="p-6 border-t border-white/10 bg-black/20 shrink-0">
                    <Button onClick={handleSubmit} disabled={isSaving} className="w-full py-4 !bg-orange hover:!bg-orange/80 !text-white border-0 text-[18px] font-black">
                      {isSaving ? 'Сохранение...' : 'ДОБАВИТЬ В ПРОТОКОЛ'}
                    </Button>
                 </div>
              </>
           )}
        </div>

      </main>
    </div>
  );
}