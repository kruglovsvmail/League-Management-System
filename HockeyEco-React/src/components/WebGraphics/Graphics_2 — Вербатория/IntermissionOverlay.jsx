import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function IntermissionOverlay({ game, overlay, timerSeconds, periodLength }) {
  const isVisible = overlay.visible && overlay.type === 'intermission';
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!isVisible || !overlay.data) return;
    if (overlay.data.isPaused) {
       setTimeLeft(overlay.data.timeLeft || 0); return;
    }
    if (overlay.data.endTime) {
       const updateTimer = () => setTimeLeft(Math.max(0, Math.floor((overlay.data.endTime - Date.now()) / 1000)));
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
    if (timerSeconds >= pLenSecs * 2) return "ПЕРЕРЫВ (ПОСЛЕ 2-ГО ПЕРИОДА)";
    if (timerSeconds >= pLenSecs) return "ПЕРЕРЫВ (ПОСЛЕ 1-ГО ПЕРИОДА)";
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

  const GoalItem = ({ goal, badgeColorClass }) => (
       <div className="flex items-center gap-4 mb-3 bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
          <div className={`px-3 py-1.5 text-xs font-black text-white rounded-full shadow-sm ${badgeColorClass}`}>
            {formatGoalTime(goal.time_seconds)}
          </div>
          <div className="flex flex-col">
             <span className="font-bold text-gray-800 uppercase text-sm leading-none">{`${goal.scorer_last_name} ${goal.scorer_first_name?.[0] || ''}.`}</span>
             {(goal.a1_last_name || goal.a2_last_name) && <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-1">АСТ: {[goal.a1_last_name, goal.a2_last_name].filter(Boolean).join(', ')}</span>}
          </div>
       </div>
  );

  return (
    <AnimationWrapper type="intermission" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50 bg-black/10 backdrop-blur-sm">
      <div className="flex flex-col w-[1400px] h-[850px] bg-[#F8F9FA] rounded-[40px] shadow-2xl overflow-hidden border border-white/50 relative">
        
        {/* Мягкие блики */}
        <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-verba-green-main rounded-full blur-[150px] opacity-10 pointer-events-none"></div>

        <div className="w-full bg-verba-green-main flex items-center justify-center py-6 shrink-0 bg-verba-pattern z-10">
          <div className="bg-white/20 backdrop-blur-sm rounded-full px-6 py-2">
             <span className="text-lg font-bold text-white uppercase tracking-[0.2em]">{getPeriodStatusText()}</span>
          </div>
        </div>

        <div className="flex items-center justify-between w-full px-24 py-12 bg-white border-b border-gray-100 shrink-0 z-10 shadow-sm">
           <div className="flex items-center gap-6 w-[450px]">
             {homeLogo && <div className="bg-gray-50 rounded-full p-4 w-32 h-32 shadow-inner shrink-0"><img src={homeLogo} alt="Home" className="w-full h-full object-contain" /></div>}
             <span className="text-3xl font-black text-gray-800 uppercase tracking-wider leading-tight">{game.home_team_name}</span>
           </div>
           
           <div className="flex items-center justify-center gap-10">
              <span className="font-verba-lato text-8xl font-black text-verba-green-main drop-shadow-sm">{game.home_score}</span>
              <span className="text-4xl font-black text-gray-300 pb-2">:</span>
              <span className="font-verba-lato text-8xl font-black text-gray-800 drop-shadow-sm">{game.away_score}</span>
           </div>

           <div className="flex items-center justify-end gap-6 w-[450px] text-right">
             <span className="text-3xl font-black text-gray-800 uppercase tracking-wider leading-tight">{game.away_team_name}</span>
             {awayLogo && <div className="bg-gray-50 rounded-full p-4 w-32 h-32 shadow-inner shrink-0"><img src={awayLogo} alt="Away" className="w-full h-full object-contain" /></div>}
           </div>
        </div>

        <div className="flex flex-1 w-full overflow-hidden z-10">
           <div className="flex flex-col flex-1 px-16 py-8 overflow-y-auto custom-scrollbar border-r border-gray-100">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 text-center">Голы хозяев</span>
              {homeGoals.map(g => <GoalItem key={`h_${g.id}`} goal={g} badgeColorClass="bg-verba-green-main" />)}
           </div>
           
           <div className="w-[350px] flex flex-col items-center justify-center shrink-0">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">До старта периода</span>
              <div className="bg-white border border-gray-100 rounded-full w-64 h-64 flex items-center justify-center shadow-lg">
                 <span className={`font-verba-lato text-7xl font-black tracking-tighter ${timeLeft <= 60 && !overlay.data?.isPaused ? 'text-verba-orange' : 'text-gray-800'}`}>
                    {formatCountdown(timeLeft)}
                 </span>
              </div>
           </div>

           <div className="flex flex-col flex-1 px-16 py-8 overflow-y-auto custom-scrollbar border-l border-gray-100">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 text-center">Голы гостей</span>
              {awayGoals.map(g => <GoalItem key={`a_${g.id}`} goal={g} badgeColorClass="bg-verba-orange" />)}
           </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}