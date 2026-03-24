import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';

export function WebGraphics() {
  const { gameId } = useParams();

  const [game, setGame] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0); 
  const [currentPeriod, setCurrentPeriod] = useState('1');
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [activePenalties, setActivePenalties] = useState([]);
  
  // НАСТРОЙКИ СИНХРОНИЗИРУЕМЫЕ ЧЕРЕЗ СОКЕТ
  const [periodLength, setPeriodLength] = useState(20);
  const [otLength, setOtLength] = useState(5);
  
  const [goalAnimation, setGoalAnimation] = useState(null);

  const loadGameData = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/games/${gameId}`);
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
        if (state.period) setCurrentPeriod(state.period);
        setIsTimerRunning(state.isRunning); 
        setActivePenalties(state.penalties || []);
        if (state.periodLength) setPeriodLength(state.periodLength);
        if (state.otLength) setOtLength(state.otLength);
    });

    socket.on('timer_tick', (state) => {
      setTimerSeconds(state.seconds);
      if (state.isRunning !== undefined) setIsTimerRunning(state.isRunning);
      if (state.penalties) setActivePenalties(state.penalties);
    });

    socket.on('score_updated', () => loadGameData());
    socket.on('game_updated', () => loadGameData());

    socket.on('trigger_obs_overlay', (overlayData) => {
      if (overlayData.type === 'goal') {
        setGoalAnimation(overlayData);
        setTimeout(() => setGoalAnimation(null), 8000); 
      }
    });

    return () => socket.disconnect();
  }, [gameId]);

  useEffect(() => {
    let interval = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
        setActivePenalties(prev => prev.map(p => ({ ...p, remaining: p.remaining > 0 ? p.remaining - 1 : 0 })));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  if (!game) return <div style={{ backgroundColor: 'transparent' }}></div>;

  const formatTime = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  // ТОЧНЫЙ РАСЧЕТ ОСТАВШЕГОСЯ ВРЕМЕНИ НА БАЗЕ ДАННЫХ ИЗ СОКЕТА
  const getDisplaySeconds = () => {
    let maxTime = 0;
    if (currentPeriod === '1') maxTime = periodLength * 60;
    else if (currentPeriod === '2') maxTime = periodLength * 2 * 60;
    else if (currentPeriod === '3') maxTime = periodLength * 3 * 60;
    else if (currentPeriod === 'OT') maxTime = (periodLength * 3 + otLength) * 60;
    else return 0;

    const remaining = maxTime - timerSeconds;
    return remaining > 0 ? remaining : 0;
  };

  const displaySeconds = getDisplaySeconds();

  return (
    <div className="w-screen h-screen relative font-sans overflow-hidden" style={{ backgroundColor: 'transparent' }}>
      <div className={`absolute top-10 left-10 flex flex-col transition-all duration-500 ${goalAnimation ? 'opacity-0 -translate-y-10' : 'opacity-100 translate-y-0'}`}>
         <div className="flex items-center h-12 bg-slate-950 bg-opacity-90 rounded-t-lg shadow-2xl border border-slate-800 overflow-hidden">
            <div className="flex items-center gap-3 px-4 h-full border-r border-slate-800">
                <span className="font-black text-2xl text-white tracking-tighter">{game.home_team_name.substring(0, 3).toUpperCase()}</span>
                <span className="font-black text-4xl text-sky-400 tabular-nums">{game.home_score}</span>
            </div>
            <div className="w-28 text-center font-mono text-3xl font-black text-white tabular-nums border-r border-slate-800">
                {formatTime(displaySeconds)}
            </div>
            <div className="flex items-center gap-3 px-4 h-full border-r border-slate-800">
                <span className="font-black text-4xl text-red-400 tabular-nums">{game.away_score}</span>
                <span className="font-black text-2xl text-white tracking-tighter">{game.away_team_name.substring(0, 3).toUpperCase()}</span>
            </div>
            <div className="px-4 font-bold text-lg text-slate-300 uppercase tracking-widest">{currentPeriod}</div>
         </div>

         {activePenalties.length > 0 && (
           <div className="bg-slate-900 bg-opacity-95 rounded-b-lg border border-t-0 border-slate-800 p-2 space-y-1 shadow-lg">
              {activePenalties.map(p => (
                <div key={p.id} className="flex justify-between items-center bg-slate-800 bg-opacity-50 px-3 py-1 rounded gap-4">
                  <span className={`font-bold text-sm tracking-wider ${p.team_id === game.home_team_id ? 'text-sky-300' : 'text-red-300'}`}>
                    {p.player_name || `Игрок ID: ${p.player_id}`}
                  </span>
                  <span className="font-mono text-sm font-black text-red-500 tabular-nums">
                    {formatTime(p.remaining)}
                  </span>
                </div>
              ))}
           </div>
         )}
      </div>

      <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 transition-all duration-1000 ease-out flex flex-col items-center ${goalAnimation ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`}>
        <div className="bg-emerald-600 text-white font-black text-6xl px-12 py-4 rounded-t-2xl shadow-2xl tracking-tighter uppercase">ГОЛ!</div>
        <div className="bg-slate-950 bg-opacity-90 border border-emerald-500 text-center px-10 py-5 rounded-b-2xl shadow-xl min-w-[400px]">
            <div className="text-white font-bold text-2xl">{goalAnimation?.text}</div>
            <div className="text-emerald-400 font-semibold text-sm uppercase tracking-widest mt-1">{goalAnimation?.team_name}</div>
        </div>
      </div>
    </div>
  );
}