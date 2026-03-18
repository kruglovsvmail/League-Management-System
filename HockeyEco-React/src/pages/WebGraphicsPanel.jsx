import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getToken } from '../utils/helpers';
import { io } from 'socket.io-client';

export function WebGraphicsPanel() {
  const { gameId } = useParams();

  const [game, setGame] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(1200);
  const [currentPeriod, setCurrentPeriod] = useState('1');
  const [activePenalties, setActivePenalties] = useState([]);

  const [graphicCue, setGraphicCue] = useState([]);
  const [lastShownId, setLastShownId] = useState(null);

  const loadGameData = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) setGame(data.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadGameData(); }, [gameId]);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL);
    socket.emit('join_game', gameId);

    socket.on('timer_state', (state) => {
        setTimerSeconds(state.seconds);
        setCurrentPeriod(state.period || '1');
        setActivePenalties(state.penalties || []);
    });

    socket.on('timer_tick', (state) => {
      setTimerSeconds(state.seconds);
      if (state.penalties) setActivePenalties(state.penalties);
    });

    socket.on('new_event_saved', (eventData) => {
      setGraphicCue(prev => [...prev, { ...eventData, cueId: Date.now() }]);
      if (eventData.type === 'goal') loadGameData(); 
    });

    return () => socket.disconnect();
  }, [gameId]);

  const handleShowOverlay = (item) => {
    alert(`В ЭФИР: Плашка ${item.type.toUpperCase()} - ${item.text}`);
    setLastShownId(item.cueId);
    setTimeout(() => {
        setGraphicCue(prev => prev.filter(o => o.cueId !== item.cueId));
    }, 2000);
  };

  if (!game) return <div className="min-h-screen bg-slate-100 flex items-center justify-center">Загрузка...</div>;

  const formatTime = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans">
      
      <header className="bg-white p-4 shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-bold">Пульт Режиссера Графики</h1>
            <div className="text-sm text-slate-500">Матч ID: {gameId} | {game.home_team_name} vs {game.away_team_name}</div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 grid grid-cols-1 xl:grid-cols-[1fr,2fr] gap-6">

        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Статус Табло (Live)</h2>
                <div className="flex items-center justify-between border border-slate-200 rounded-lg p-4 bg-slate-50">
                    <div className="text-center">
                        <div className="text-4xl font-black text-slate-950">{game.home_score}</div>
                        <div className="text-xs font-bold uppercase text-slate-600 tracking-tight">{game.home_team_name}</div>
                    </div>
                    <div className="text-center">
                        <div className="font-mono text-5xl font-black text-orange-600 tabular-nums">{formatTime(timerSeconds)}</div>
                        <div className="text-xs font-bold uppercase text-slate-600">{currentPeriod} ПЕРИОД</div>
                    </div>
                    <div className="text-center">
                        <div className="text-4xl font-black text-slate-950">{game.away_score}</div>
                        <div className="text-xs font-bold uppercase text-slate-600 tracking-tight">{game.away_team_name}</div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Штрафы на табло</h2>
                {activePenalties.length === 0 && <p className="text-slate-500 text-sm">Нет активных штрафов</p>}
                <div className="space-y-2">
                    {activePenalties.map(p => (
                        <div key={p.id} className="flex justify-between items-center bg-slate-50 p-3 rounded border border-slate-200 font-medium text-sm">
                            <span className={p.team_id === game.home_team_id ? 'text-sky-700 font-bold' : 'text-red-700 font-bold'}>
                                {/* ЗДЕСЬ ВЫВОДИТСЯ ИМЯ */}
                                {p.player_name || `Игрок ID: ${p.player_id}`}
                            </span>
                            <span className="font-mono tabular-nums font-bold text-slate-950">{formatTime(p.remaining)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2"><span className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></span> Очередь оверлеев для эфира (CG)</h2>
                <span className="text-sm font-medium bg-slate-100 text-slate-600 px-3 py-1 rounded-full">{graphicCue.length} событий готовo</span>
            </div>

            <div className="space-y-4">
                {graphicCue.length === 0 && (
                    <div className="text-center py-20 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                        <div className="text-5xl mb-4">📺</div>
                        <div className="text-slate-600 font-medium">Ждем действий секретаря...</div>
                        <div className="text-sm text-slate-400">Голы и удаления появятся здесь</div>
                    </div>
                )}
                
                {[...graphicCue].reverse().map(item => (
                    <div key={item.cueId} className={`grid grid-cols-[80px,1fr,180px] items-center gap-4 p-5 rounded-xl border ${lastShownId === item.cueId ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className={`text-center font-bold px-3 py-1 rounded text-xs uppercase tracking-wider ${item.type === 'goal' ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
                            {item.type === 'goal' ? 'ГОЛ' : 'ШТРАФ'}
                        </div>
                        
                        <div>
                            <div className="font-bold text-slate-950 text-lg">{item.text}</div>
                            <div className="text-xs font-bold text-slate-500 uppercase">{item.team_name}</div>
                        </div>

                        <button 
                            onClick={() => handleShowOverlay(item)} 
                            disabled={lastShownId === item.cueId}
                            className={`w-full font-bold py-3 rounded-lg text-sm transition ${lastShownId === item.cueId ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 hover:bg-black text-white'}`}
                        >
                            {lastShownId === item.cueId ? 'В ЭФИРЕ...' : 'SHOW ON AIR'}
                        </button>
                    </div>
                ))}
            </div>
        </div>

      </main>
    </div>
  );
}