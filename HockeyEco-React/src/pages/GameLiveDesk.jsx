import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getToken } from '../utils/helpers';
import { io } from 'socket.io-client';

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export function GameLiveDesk() {
  const { gameId } = useParams();

  const [game, setGame] = useState(null);
  const [homeRoster, setHomeRoster] = useState([]);
  const [awayRoster, setAwayRoster] = useState([]);
  
  const [socket, setSocket] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(1200);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('1'); 
  const [activePenalties, setActivePenalties] = useState([]);
  
  const [activeModal, setActiveModal] = useState(null); 
  const [selectedTeam, setSelectedTeam] = useState(null);

  const [formData, setFormData] = useState({
    playerId: '', assist1Id: '', assist2Id: '', goalStrength: 'equal',
    penaltyMinutes: 2, penaltyViolation: 'Подножка'
  });

  const headers = { 'Authorization': `Bearer ${getToken()}` };

  const loadInitialData = async () => {
    try {
      const resGame = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}`, { headers });
      const dataGame = await resGame.json();
      if (dataGame.success) {
        setGame(dataGame.data);
        const [resHome, resAway] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.home_team_id}`, { headers }),
          fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.away_team_id}`, { headers })
        ]);
        const [dataHome, dataAway] = await Promise.all([resHome.json(), resAway.json()]);
        setHomeRoster(dataHome.gameRoster || []);
        setAwayRoster(dataAway.gameRoster || []);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadInitialData(); }, [gameId]);

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_API_URL);
    setSocket(newSocket);
    newSocket.emit('join_game', gameId);
    newSocket.on('timer_state', (state) => {
      setTimerSeconds(state.seconds);
      setIsTimerRunning(state.isRunning);
      setActivePenalties(state.penalties || []);
    });
    newSocket.on('timer_tick', (state) => {
      setTimerSeconds(state.seconds);
      if (state.penalties) setActivePenalties(state.penalties);
    });
    return () => newSocket.disconnect();
  }, [gameId]);

  const handleTimerAction = (action) => socket?.emit('timer_action', { gameId, action });
  
  const changePeriod = (period) => {
    setCurrentPeriod(period);
    socket?.emit('timer_action', { gameId, action: 'set_period', period });
  };

  const openEventModal = (type, team) => {
    setSelectedTeam(team);
    setFormData({
      playerId: '', assist1Id: '', assist2Id: '', goalStrength: 'equal',
      penaltyMinutes: 2, penaltyViolation: 'Подножка'
    });
    setActiveModal(type);
  };

  const closeModals = () => {
    setActiveModal(null);
    setSelectedTeam(null);
  };

  const submitGoal = async (e) => {
    e.preventDefault();
    if (!formData.playerId) return alert('Выберите автора!');
    try {
      const payload = {
        period: currentPeriod, time_seconds: timerSeconds, event_type: 'goal',
        team_id: selectedTeam.id, player_id: formData.playerId,
        assist1_id: formData.assist1Id || null, assist2_id: formData.assist2Id || null, goal_strength: formData.goalStrength
      };
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        closeModals();
        loadInitialData(); 
        const roster = selectedTeam.id === game.home_team_id ? homeRoster : awayRoster;
        const player = roster.find(p => p.player_id === parseInt(formData.playerId));
        
        // Передаем полное имя
        const playerFullName = `#${player?.jersey_number || ''} ${player?.first_name || ''} ${player?.last_name || ''}`.trim();

        socket?.emit('broadcast_event_saved', {
          gameId, eventData: { id: data.eventId, type: 'goal', text: playerFullName, team_name: selectedTeam.name }
        });
      }
    } catch (err) { console.error(err); }
  };

  const submitPenalty = async (e) => {
    e.preventDefault();
    if (!formData.playerId) return alert('Выберите нарушителя!');
    try {
      const penaltyClass = formData.penaltyMinutes == 5 ? 'major' : (formData.penaltyMinutes == 4 ? 'double_minor' : 'minor');
      const payload = {
        period: currentPeriod, time_seconds: timerSeconds, event_type: 'penalty', team_id: selectedTeam.id,
        player_id: formData.playerId, penalty_violation: formData.penaltyViolation, penalty_minutes: formData.penaltyMinutes, penalty_class: penaltyClass
      };
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        closeModals();
        
        const roster = selectedTeam.id === game.home_team_id ? homeRoster : awayRoster;
        const player = roster.find(p => p.player_id === parseInt(formData.playerId));
        
        // Собираем полное имя нарушителя
        const playerFullName = `#${player?.jersey_number || ''} ${player?.first_name || ''} ${player?.last_name || ''}`.trim();

        socket?.emit('timer_action', { 
            gameId, action: 'add_penalty', 
            penaltyData: { 
                id: data.eventId, 
                team_id: selectedTeam.id, 
                player_id: formData.playerId, 
                player_name: playerFullName, // ДОБАВЛЕНО ИМЯ И ФАМИЛИЯ
                remaining: parseInt(formData.penaltyMinutes) * 60, 
                isRunning: isTimerRunning 
            } 
        });
        
        socket?.emit('broadcast_event_saved', {
          gameId, eventData: { id: data.eventId, type: 'penalty', text: `${playerFullName} (${formData.penaltyMinutes} мин)`, team_name: selectedTeam.name }
        });
      }
    } catch (err) { console.error(err); }
  };

  if (!game) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Загрузка...</div>;

  const activeRoster = selectedTeam?.id === game.home_team_id ? homeRoster : awayRoster;
  const formatTime = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  const teamData = {
    home: { id: game.home_team_id, name: game.home_team_name, logo: game.home_team_logo, score: game.home_score },
    away: { id: game.away_team_id, name: game.away_team_name, logo: game.away_team_logo, score: game.away_score }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      
      <header className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
        <h1 className="text-xl font-bold">Секретарь Матча #{game.id}</h1>
        <div className="flex gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
          {['1', '2', '3', 'OT', 'SO'].map(p => (
            <button key={p} onClick={() => changePeriod(p)} className={`px-4 py-2 rounded-md font-semibold ${currentPeriod === p ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}>{p}</button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-6">
        
        <div className="space-y-6">
          <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-6 w-1/3">
              <img src={teamData.home.logo} alt="Logo" className="w-20 h-20 object-contain" />
              <div className="text-right flex-1">
                <div className="text-4xl font-black">{teamData.home.score}</div>
                <div className="text-slate-400 text-sm font-medium uppercase tracking-wider">{teamData.home.name}</div>
              </div>
            </div>
            
            <div className="text-center w-1/3">
              <div className="font-mono text-7xl font-black tabular-nums tracking-tight text-white">{formatTime(timerSeconds)}</div>
              <div className="text-orange-500 font-bold text-xl uppercase tracking-widest">{currentPeriod} ПЕРИОД</div>
            </div>

            <div className="flex items-center gap-6 w-1/3 flex-row-reverse">
              <img src={teamData.away.logo} alt="Logo" className="w-20 h-20 object-contain" />
              <div className="text-left flex-1">
                <div className="text-4xl font-black">{teamData.away.score}</div>
                <div className="text-slate-400 text-sm font-medium uppercase tracking-wider">{teamData.away.name}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => handleTimerAction('start')} disabled={isTimerRunning} className="bg-green-600 hover:bg-green-700 disabled:opacity-30 text-white font-bold py-6 rounded-xl text-xl flex items-center justify-center gap-3 transition">
              <span className="text-3xl">▶</span> СТАРТ ТАЙМЕРА
            </button>
            <button onClick={() => handleTimerAction('stop')} disabled={!isTimerRunning} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white font-bold py-6 rounded-xl text-xl flex items-center justify-center gap-3 transition">
              <span className="text-3xl">⏸</span> ПАУЗА ТАЙМЕРА
            </button>
          </div>

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <h3 className="text-slate-400 font-bold uppercase tracking-wider mb-5 text-sm">Добавить событие в протокол</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <button onClick={() => openEventModal('goal', teamData.home)} className="w-full bg-slate-800 border border-emerald-900 text-emerald-300 hover:bg-emerald-950 font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition"><span className="text-emerald-500">⚽</span> Гол Хозяев</button>
                <button onClick={() => openEventModal('penalty', teamData.home)} className="w-full bg-slate-800 border border-red-900 text-red-300 hover:bg-red-950 font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition"><span className="text-red-500">🚫</span> Удаление Хозяев</button>
              </div>
              <div className="space-y-3">
                <button onClick={() => openEventModal('goal', teamData.away)} className="w-full bg-slate-800 border border-emerald-900 text-emerald-300 hover:bg-emerald-950 font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition"><span className="text-emerald-500">⚽</span> Гол Гостей</button>
                <button onClick={() => openEventModal('penalty', teamData.away)} className="w-full bg-slate-800 border border-red-900 text-red-300 hover:bg-red-950 font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition"><span className="text-red-500">🚫</span> Удаление Гостей</button>
              </div>
            </div>
          </div>

        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white"><span className="text-red-500">⏳</span> Активные таймеры штрафов</h2>
          <div className="space-y-3">
            {activePenalties.length === 0 && (
              <div className="text-center py-10 text-slate-600 bg-slate-950 rounded-lg border border-dashed border-slate-800">Нет активных удалений</div>
            )}
            {activePenalties.map(p => {
              const isHome = p.team_id === game.home_team_id;
              return (
                <div key={p.id} className="bg-slate-800 p-4 rounded-lg border border-slate-700 space-y-3 relative overflow-hidden">
                  <div className={`absolute top-0 left-0 bottom-0 w-1 ${isHome ? 'bg-sky-500' : 'bg-red-500'}`}></div>
                  <div className="flex justify-between items-start pl-2">
                    <div>
                      <div className={`font-bold ${isHome ? 'text-sky-300' : 'text-red-300'}`}>{isHome ? 'Хозяева' : 'Гости'}</div>
                      {/* ВЫВОДИМ ИМЯ, А НЕ ПРОСТО ID */}
                      <div className="text-white text-lg">{p.player_name || `Игрок ID: ${p.player_id}`}</div>
                    </div>
                    <div className={`font-mono text-3xl font-black tabular-nums ${p.isRunning ? 'text-white' : 'text-slate-500'}`}>{formatTime(p.remaining)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700 pl-2">
                    <button onClick={() => socket?.emit('timer_action', { gameId, action: 'toggle_penalty', penaltyId: p.id })} className="bg-slate-700 hover:bg-slate-600 text-xs text-white font-semibold py-2 rounded">⏯ {p.isRunning ? 'Пауза' : 'Пуск'}</button>
                    <button onClick={() => socket?.emit('timer_action', { gameId, action: 'remove_penalty', penaltyId: p.id })} className="bg-red-950 hover:bg-red-900 text-xs text-red-200 font-semibold py-2 rounded">❌ Сброс (Гол)</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      <Modal isOpen={activeModal === 'goal'} onClose={closeModals} title={`Фиксация ГОЛА (${selectedTeam?.name})`}>
        <form onSubmit={submitGoal} className="space-y-4">
          <div className="grid grid-cols-[1fr,2fr] gap-4 items-center">
            <label className="text-slate-400">Автор гола:</label>
            <select value={formData.playerId} onChange={e => setFormData({...formData, playerId: e.target.value})} required className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-white">
              <option value="">Выберите...</option>
              {activeRoster.map(p => <option key={p.player_id} value={p.player_id}>#{p.jersey_number} {p.first_name} {p.last_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-[1fr,2fr] gap-4 items-center">
            <label className="text-slate-400">Ассистент 1:</label>
            <select value={formData.assist1Id} onChange={e => setFormData({...formData, assist1Id: e.target.value})} className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-white">
              <option value="">Нет ассистента</option>
              {activeRoster.map(p => <option key={p.player_id} value={p.player_id}>#{p.jersey_number} {p.first_name} {p.last_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-[1fr,2fr] gap-4 items-center">
            <label className="text-slate-400">Состав:</label>
            <select value={formData.goalStrength} onChange={e => setFormData({...formData, goalStrength: e.target.value})} className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-white">
              <option value="equal">В равных составах</option>
              <option value="pp">В большинстве (PP)</option>
              <option value="sh">В меньшинстве (SH)</option>
            </select>
          </div>
          <div className="pt-6 flex justify-end gap-3">
            <button type="button" onClick={closeModals} className="bg-slate-700 text-white px-6 py-3 rounded-lg font-bold">Отмена</button>
            <button type="submit" className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-bold">✅ Внести в протокол</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={activeModal === 'penalty'} onClose={closeModals} title={`Фиксация УДАЛЕНИЯ (${selectedTeam?.name})`}>
        <form onSubmit={submitPenalty} className="space-y-4">
          <div className="grid grid-cols-[1fr,2fr] gap-4 items-center">
            <label className="text-slate-400">Нарушитель:</label>
            <select value={formData.playerId} onChange={e => setFormData({...formData, playerId: e.target.value})} required className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-white">
              <option value="">Выберите...</option>
              {activeRoster.map(p => <option key={p.player_id} value={p.player_id}>#{p.jersey_number} {p.first_name} {p.last_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-[1fr,2fr] gap-4 items-center">
            <label className="text-slate-400">Время штрафа:</label>
            <select value={formData.penaltyMinutes} onChange={e => setFormData({...formData, penaltyMinutes: e.target.value})} className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-white">
              <option value="2">2 минуты (Малый)</option>
              <option value="4">4 минуты (2+2)</option>
              <option value="5">5 минут (Большой)</option>
              <option value="20">20 минут (Дисциплинарный)</option>
            </select>
          </div>
          <div className="grid grid-cols-[1fr,2fr] gap-4 items-center">
            <label className="text-slate-400">Нарушение:</label>
            <input type="text" value={formData.penaltyViolation} onChange={e => setFormData({...formData, penaltyViolation: e.target.value})} required className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="Подножка, задержка и т.д." />
          </div>
          <div className="pt-6 flex justify-end gap-3">
            <button type="button" onClick={closeModals} className="bg-slate-700 text-white px-6 py-3 rounded-lg font-bold">Отмена</button>
            <button type="submit" className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold">🚫 Сохранить штраф</button>
          </div>
        </form>
      </Modal>

    </div>
  );
}