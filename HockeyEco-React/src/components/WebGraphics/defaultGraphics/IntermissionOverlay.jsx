import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function IntermissionOverlay({ game, overlay, timerSeconds, periodLength }) {
  const isVisible = overlay.visible && overlay.type === 'intermission';
  const [timeLeft, setTimeLeft] = useState(0);

  // Приемник команд от панели режиссера
  useEffect(() => {
    if (!isVisible || !overlay.data) return;

    // Если пришла команда ПАУЗЫ, просто фиксируем переданное время и ничего не считаем
    if (overlay.data.isPaused) {
       setTimeLeft(overlay.data.timeLeft || 0);
       return;
    }

    // Если таймер ИДЕТ, вычисляем остаток до переданного endTime
    if (overlay.data.endTime) {
       const updateTimer = () => {
          setTimeLeft(Math.max(0, Math.floor((overlay.data.endTime - Date.now()) / 1000)));
       };
       updateTimer(); // Моментальный пересчет при рендере
       const interval = setInterval(updateTimer, 1000);
       return () => clearInterval(interval);
    }
  }, [isVisible, overlay.data]);

  if (!game) return null;

  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);
  const allGoals = game.goals || [];

  const homeGoals = allGoals.filter(g => g.team_id === game.home_team_id);
  const awayGoals = allGoals.filter(g => g.team_id === game.away_team_id);

  const formatCountdown = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  const getPeriodStatusText = () => {
    const pLenSecs = (periodLength || 20) * 60;
    if (timerSeconds >= pLenSecs * 3) return "Матч завершен";
    if (timerSeconds >= pLenSecs * 2) return "Счет после 2-го периода";
    if (timerSeconds >= pLenSecs) return "Счет после 1-го периода";
    return "Перерыв";
  };

  const formatGoalTime = (secs) => {
    const pLenSecs = (periodLength || 20) * 60;
    let p = 1; let rSecs = secs;
    if (secs >= pLenSecs * 3) { p = 'ОТ'; rSecs = secs - pLenSecs * 3; }
    else if (secs >= pLenSecs * 2) { p = 3; rSecs = secs - pLenSecs * 2; }
    else if (secs >= pLenSecs) { p = 2; rSecs = secs - pLenSecs; }
    return `${p}П • ${Math.floor(rSecs / 60)}:${('0' + (rSecs % 60)).slice(-2)}`;
  };

  const GoalItem = ({ goal }) => {
    const scorer = `${goal.scorer_last_name} ${goal.scorer_first_name?.[0] || ''}.`;
    let assists = [];
    if (goal.a1_last_name) assists.push(`${goal.a1_last_name} ${goal.a1_first_name?.[0] || ''}.`);
    if (goal.a2_last_name) assists.push(`${goal.a2_last_name} ${goal.a2_first_name?.[0] || ''}.`);

    return (
       <div className="flex items-start gap-4 mb-3 border-b border-white/5 pb-2 last:border-0 last:mb-0">
          <span className="font-mono font-bold text-blue-400 shrink-0 mt-0.5">{formatGoalTime(goal.time_seconds)}</span>
          <div className="flex flex-col text-left">
             <span className="font-bold text-white tracking-wide uppercase">{scorer}</span>
             {assists.length > 0 && <span className="text-white/40 text-xs font-semibold uppercase mt-0.5 tracking-wider">({assists.join(', ')})</span>}
          </div>
       </div>
    );
  };

  return (
    <AnimationWrapper type="intermission" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/0 backdrop-blur-md pointer-events-none"></div>

      <div className="relative flex flex-col items-center w-[1400px] h-[1000px] bg-[#000000ff]/[98%] rounded-[3rem] border border-white/10 shadow-[0_0_120px_rgba(0,0,0,0.8)] overflow-hidden pb-10">

        <div className="w-full bg-white/5 border-b border-white/10 flex flex-col items-center justify-center py-6 relative shrink-0">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>
          <span className="text-2xl font-black text-white uppercase tracking-[0.3em] drop-shadow-sm">
             {getPeriodStatusText()}
          </span>
        </div>

        <div className="flex items-center justify-between w-full px-24 py-10 flex-1">
           <div className="flex flex-col items-center w-[400px]">
             {homeLogo && <img src={homeLogo} alt="Home" className="w-48 h-48 object-contain drop-shadow-2xl mb-6" />}
             <span className="text-3xl font-black text-white text-center uppercase tracking-wide drop-shadow-md">{game.home_team_name}</span>
           </div>

           <div className="flex items-center justify-center gap-8">
              <span className="text-[120px] font-black text-white tabular-nums leading-none drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)]">{game.home_score}</span>
              <span className="text-6xl font-black text-white/20 pb-4">:</span>
              <span className="text-[120px] font-black text-white tabular-nums leading-none drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)]">{game.away_score}</span>
           </div>

           <div className="flex flex-col items-center w-[400px]">
             {awayLogo && <img src={awayLogo} alt="Away" className="w-48 h-48 object-contain drop-shadow-2xl mb-6" />}
             <span className="text-3xl font-black text-white text-center uppercase tracking-wide drop-shadow-md">{game.away_team_name}</span>
           </div>
        </div>

        <div className="flex items-start justify-between w-full px-24 py-4 overflow-hidden shrink-0">
           <div className="flex flex-col w-[400px] overflow-y-auto custom-scrollbar max-h-[250px] pr-4">
              {homeGoals.map(g => <GoalItem key={`h_${g.id}`} goal={g} />)}
           </div>
           
           <div className="flex flex-col items-center justify-start pt-6 opacity-80">
              <span className="text-xs font-bold text-white/50 uppercase tracking-[0.3em] mb-2">До старта периода</span>
              <div className="bg-white/10 border border-white/10 px-8 py-3 rounded-2xl shadow-inner">
                 <span className={`text-5xl font-mono font-black tracking-tighter transition-colors ${timeLeft <= 60 && !overlay.data?.isPaused ? 'text-status-rejected animate-pulse drop-shadow-[0_0_15px_rgba(255,69,58,0.5)]' : 'text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.3)]'}`}>
                    {formatCountdown(timeLeft)}
                 </span>
              </div>
           </div>

           <div className="flex flex-col w-[400px] overflow-y-auto custom-scrollbar max-h-[250px] pl-4">
              {awayGoals.map(g => <GoalItem key={`a_${g.id}`} goal={g} />)}
           </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}