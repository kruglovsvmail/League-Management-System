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
    if (timerSeconds >= pLenSecs * 2) return "СЧЕТ ПОСЛЕ 2-ГО ПЕРИОДА";
    if (timerSeconds >= pLenSecs) return "СЧЕТ ПОСЛЕ 1-ГО ПЕРИОДА";
    return "ПЕРЕРЫВ";
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
       <div className="flex items-start gap-4 mb-3 border-b border-[#1A3A6D]/50 pb-3 last:border-0 last:mb-0 relative group">
          {/* Неоновый индикатор слева */}
          <div className="absolute -left-4 top-1 bottom-1 w-[2px] bg-[#00E5FF] opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_10px_#00E5FF]"></div>
          
          <span className="font-mono font-black text-[#00E5FF] shrink-0 mt-0.5 w-16 text-left drop-shadow-[0_0_5px_rgba(0,229,255,0.4)]">{formatGoalTime(goal.time_seconds)}</span>
          <div className="flex flex-col text-left">
             <span className="font-bold text-white tracking-widest uppercase font-sans text-sm">{scorer}</span>
             {assists.length > 0 && <span className="text-[#A0BCE0] text-[11px] font-bold uppercase mt-1 tracking-[0.2em]">АСТ: {assists.join(', ')}</span>}
          </div>
       </div>
    );
  };

  return (
    <AnimationWrapper type="complex_construct" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50">
      {/* Технологичный фон */}
      <div className="absolute inset-0 bg-[#020611]/85 backdrop-blur-[20px] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, transparent 0%, #000 100%)' }}></div>

      <div className="relative flex flex-col items-center w-[1500px] min-h-[700px] bg-[#051125]/90 border border-[#1A3A6D] shadow-[0_0_100px_rgba(0,229,255,0.05),_inset_0_0_80px_rgba(0,0,0,0.8)] overflow-hidden">

        {/* Декоративные кибер-элементы */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent shadow-[0_0_20px_#00E5FF]"></div>
        <div className="absolute -top-10 -left-10 w-32 h-32 border-t-4 border-l-4 border-[#1A3A6D] opacity-50"></div>
        <div className="absolute -bottom-10 -right-10 w-32 h-32 border-b-4 border-r-4 border-[#1A3A6D] opacity-50"></div>

        {/* Шапка статуса */}
        <div className="w-full bg-[#0A1D37]/80 border-b border-[#1A3A6D] flex flex-col items-center justify-center py-6 relative shrink-0 z-10">
          <div className="absolute bottom-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#00E5FF]/50 to-transparent"></div>
          <span className="text-2xl font-black text-[#00E5FF] uppercase tracking-[0.4em] drop-shadow-[0_0_15px_rgba(0,229,255,0.5)]">
             {getPeriodStatusText()}
          </span>
        </div>

        {/* Блок команд и счета */}
        <div className="flex items-center justify-between w-full px-20 py-12 relative z-10">
           {/* Хозяева */}
           <div className="flex flex-col items-center w-[400px]">
             <div className="w-48 h-48 relative mb-8 flex items-center justify-center">
               <div className="absolute inset-0 bg-[#112547]/40 rotate-45 border border-[#1A3A6D] shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]"></div>
               {homeLogo && <img src={homeLogo} alt="Home" className="w-40 h-40 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] relative z-10" />}
             </div>
             <div className="bg-[#112547] px-8 py-2 border-l-4 border-[#00E5FF] shadow-[10px_10px_30px_rgba(0,0,0,0.5)]" style={{ transform: 'skewX(-10deg)' }}>
               <span className="block text-3xl font-black text-white text-center uppercase tracking-widest drop-shadow-md" style={{ transform: 'skewX(10deg)' }}>{game.home_team_name}</span>
             </div>
           </div>

           {/* Счет */}
           <div className="flex items-center justify-center gap-10 bg-[#020611] px-12 py-6 border border-[#1A3A6D] shadow-[inset_0_0_50px_rgba(0,0,0,0.8)] relative">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00E5FF]"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#00E5FF]"></div>
              
              <span className="text-[140px] font-black text-white tabular-nums leading-none drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">{game.home_score}</span>
              <span className="text-7xl font-black text-[#00E5FF] pb-4 animate-pulse drop-shadow-[0_0_20px_#00E5FF]">:</span>
              <span className="text-[140px] font-black text-white tabular-nums leading-none drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">{game.away_score}</span>
           </div>

           {/* Гости */}
           <div className="flex flex-col items-center w-[400px]">
             <div className="w-48 h-48 relative mb-8 flex items-center justify-center">
               <div className="absolute inset-0 bg-[#112547]/40 rotate-45 border border-[#1A3A6D] shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]"></div>
               {awayLogo && <img src={awayLogo} alt="Away" className="w-40 h-40 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] relative z-10" />}
             </div>
             <div className="bg-[#112547] px-8 py-2 border-r-4 border-[#00E5FF] shadow-[10px_10px_30px_rgba(0,0,0,0.5)]" style={{ transform: 'skewX(-10deg)' }}>
               <span className="block text-3xl font-black text-white text-center uppercase tracking-widest drop-shadow-md" style={{ transform: 'skewX(10deg)' }}>{game.away_team_name}</span>
             </div>
           </div>
        </div>

        {/* Нижний блок: Голы и Таймер */}
        <div className="flex items-stretch justify-between w-full px-24 py-6 flex-1 overflow-hidden z-10">
           
           {/* Голы Хозяев */}
           <div className="flex flex-col w-[400px] overflow-y-auto custom-scrollbar max-h-[200px] pr-6 bg-[#0A1D37]/30 p-4 border border-[#1A3A6D]/30">
              {homeGoals.length > 0 ? homeGoals.map(g => <GoalItem key={`h_${g.id}`} goal={g} />) : <div className="text-[#A0BCE0] font-bold tracking-widest uppercase opacity-30 text-center mt-10">НЕТ ГОЛОВ</div>}
           </div>
           
           {/* Таймер до старта */}
           <div className="flex flex-col items-center justify-start opacity-90">
              <span className="text-xs font-bold text-[#A0BCE0] uppercase tracking-[0.4em] mb-3">ДО СТАРТА ПЕРИОДА</span>
              <div className="bg-[#020611] border border-[#1A3A6D] px-10 py-4 shadow-[inset_0_0_30px_rgba(0,0,0,0.8)] relative">
                 <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#00E5FF] shadow-[0_0_10px_#00E5FF]"></div>
                 <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#00E5FF] shadow-[0_0_10px_#00E5FF]"></div>
                 
                 <span className={`text-6xl font-mono font-black tracking-tighter drop-shadow-lg ${timeLeft <= 60 && !overlay.data?.isPaused ? 'text-[#FF3366] animate-pulse drop-shadow-[0_0_15px_#FF3366]' : 'text-[#00E5FF] drop-shadow-[0_0_15px_#00E5FF]'}`}>
                    {formatCountdown(timeLeft)}
                 </span>
              </div>
           </div>

           {/* Голы Гостей */}
           <div className="flex flex-col w-[400px] overflow-y-auto custom-scrollbar max-h-[200px] pl-6 bg-[#0A1D37]/30 p-4 border border-[#1A3A6D]/30">
              {awayGoals.length > 0 ? awayGoals.map(g => <GoalItem key={`a_${g.id}`} goal={g} />) : <div className="text-[#A0BCE0] font-bold tracking-widest uppercase opacity-30 text-center mt-10">НЕТ ГОЛОВ</div>}
           </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}