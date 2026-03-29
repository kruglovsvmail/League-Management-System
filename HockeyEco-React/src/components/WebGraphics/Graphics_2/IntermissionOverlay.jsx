import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function IntermissionOverlay({ game, overlay, timerSeconds, periodLength }) {
  const isVisible = overlay.visible && overlay.type === 'intermission';
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!isVisible || !overlay.data) return;
    if (overlay.data.isPaused) {
       setTimeLeft(overlay.data.timeLeft || 0);
       return;
    }
    if (overlay.data.endTime) {
       const updateTimer = () => {
          setTimeLeft(Math.max(0, Math.floor((overlay.data.endTime - Date.now()) / 1000)));
       };
       updateTimer(); 
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
    if (timerSeconds >= pLenSecs * 3) return "МАТЧ ЗАВЕРШЕН";
    if (timerSeconds >= pLenSecs * 2) return "СТАТИСТИКА ПОСЛЕ 2-ГО ПЕРИОДА";
    if (timerSeconds >= pLenSecs) return "СТАТИСТИКА ПОСЛЕ 1-ГО ПЕРИОДА";
    return "ПЕРЕРЫВ";
  };

  const formatGoalTime = (secs) => {
    const pLenSecs = (periodLength || 20) * 60;
    let p = 1; let rSecs = secs;
    if (secs >= pLenSecs * 3) { p = 'ОТ'; rSecs = secs - pLenSecs * 3; }
    else if (secs >= pLenSecs * 2) { p = 3; rSecs = secs - pLenSecs * 2; }
    else if (secs >= pLenSecs) { p = 2; rSecs = secs - pLenSecs; }
    return `${p}П ${Math.floor(rSecs / 60)}:${('0' + (rSecs % 60)).slice(-2)}`;
  };

  const GoalItem = ({ goal, badgeColorClass }) => {
    const scorer = `${goal.scorer_last_name} ${goal.scorer_first_name?.[0] || ''}.`;
    let assists = [];
    if (goal.a1_last_name) assists.push(`${goal.a1_last_name} ${goal.a1_first_name?.[0] || ''}.`);
    if (goal.a2_last_name) assists.push(`${goal.a2_last_name} ${goal.a2_first_name?.[0] || ''}.`);

    return (
       <div className="flex items-center gap-6 mb-4 border-b border-mts-grey-light/30 pb-4 last:border-0 last:mb-0">
          <div className={`px-3 py-1 text-sm font-bold text-white tracking-widest ${badgeColorClass}`}>
            {formatGoalTime(goal.time_seconds)}
          </div>
          <div className="flex flex-col">
             <span className="font-black text-mts-black tracking-wide uppercase text-lg leading-none">{scorer}</span>
             {assists.length > 0 && <span className="text-mts-grey-dark text-xs font-bold uppercase mt-1 tracking-widest">АСТ: {assists.join(', ')}</span>}
          </div>
       </div>
    );
  };

  return (
    <AnimationWrapper type="intermission" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50 bg-white">
      <div className="flex flex-col w-full h-full">

        {/* ШАПКА */}
        <div className="w-full bg-mts-red flex items-center justify-center py-6 shrink-0">
          <span className="text-xl font-bold text-white uppercase tracking-[0.3em]">
             {getPeriodStatusText()}
          </span>
        </div>

        {/* ОСНОВНОЙ СЧЕТ */}
        <div className="flex items-center justify-between w-full px-32 py-16 bg-mts-grey-light/10 border-b border-mts-grey-light/30 shrink-0">
           <div className="flex flex-col items-center w-[400px]">
             {homeLogo && <img src={homeLogo} alt="Home" className="w-40 h-40 object-contain mb-6" />}
             <span className="text-2xl font-bold text-mts-black text-center uppercase tracking-widest">{game.home_team_name}</span>
           </div>

           <div className="flex items-center justify-center gap-12">
              <span className="text-[120px] font-black text-mts-red tabular-nums leading-none">{game.home_score}</span>
              <span className="text-4xl font-black text-mts-grey-dark pb-4">:</span>
              <span className="text-[120px] font-black text-mts-black tabular-nums leading-none">{game.away_score}</span>
           </div>

           <div className="flex flex-col items-center w-[400px]">
             {awayLogo && <img src={awayLogo} alt="Away" className="w-40 h-40 object-contain mb-6" />}
             <span className="text-2xl font-bold text-mts-black text-center uppercase tracking-widest">{game.away_team_name}</span>
           </div>
        </div>

        {/* СТАТИСТИКА ГОЛОВ И ТАЙМЕР */}
        <div className="flex flex-1 w-full overflow-hidden">
           
           {/* Голы Хозяев */}
           <div className="flex flex-col flex-1 px-24 py-10 overflow-y-auto custom-scrollbar border-r border-mts-grey-light/30">
              <span className="text-sm font-bold text-mts-grey-dark uppercase tracking-widest mb-8">Голы команды</span>
              {homeGoals.map(g => <GoalItem key={`h_${g.id}`} goal={g} badgeColorClass="bg-mts-red" />)}
           </div>
           
           {/* Центральный таймер */}
           <div className="w-[400px] bg-mts-black flex flex-col items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white/50 uppercase tracking-[0.3em] mb-4">Время до начала</span>
              <span className={`text-8xl font-black tabular-nums tracking-tighter ${timeLeft <= 60 && !overlay.data?.isPaused ? 'text-mts-red' : 'text-white'}`}>
                 {formatCountdown(timeLeft)}
              </span>
           </div>

           {/* Голы Гостей */}
           <div className="flex flex-col flex-1 px-24 py-10 overflow-y-auto custom-scrollbar">
              <span className="text-sm font-bold text-mts-grey-dark uppercase tracking-widest mb-8">Голы команды</span>
              {awayGoals.map(g => <GoalItem key={`a_${g.id}`} goal={g} badgeColorClass="bg-mts-black" />)}
           </div>

        </div>

      </div>
    </AnimationWrapper>
  );
}