import React from 'react';
import { getImageUrl } from '../../utils/helpers';

export function ScoreBoardWidget({ 
  game, currentPeriod, isTimerRunning, activePenalties, 
  timerSeconds, periodLength, otLength, isActive, onToggle 
}) {
  if (!game) return null;

  const formatTime = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  // Вычисляем остаток времени периода
  const getCountdown = () => {
    if (currentPeriod === 'SO') return 0;
    const p = parseInt(periodLength, 10) || 20;
    const o = isNaN(parseInt(otLength, 10)) ? 5 : parseInt(otLength, 10);
    let end = 0;
    if (currentPeriod === '1') end = p * 60;
    else if (currentPeriod === '2') end = p * 2 * 60;
    else if (currentPeriod === '3') end = p * 3 * 60;
    else if (currentPeriod === 'OT') end = p * 3 * 60 + o * 60;
    return Math.max(0, end - timerSeconds);
  };

  const countdownSecs = getCountdown();

  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);
  
  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const homePens = activePenalties?.filter(p => p.team_id === game.home_team_id) || [];
  const awayPens = activePenalties?.filter(p => p.team_id === game.away_team_id) || [];

  return (
    <div 
      onClick={onToggle}
      className={`cursor-pointer transition-colors duration-200 border-b border-graphite/10 p-4 flex flex-col gap-4 relative select-none outline-none ${
        isActive 
          ? 'bg-status-accepted/10 shadow-[inset_0_0_20px_rgba(34,197,94,0.1)]' 
          : 'bg-white hover:bg-graphite/5'
      }`}
      title={isActive ? "Нажмите, чтобы убрать из эфира" : "Нажмите, чтобы вывести главное табло"}
    >
      {/* Маркер активного состояния */}
      {isActive && <div className="absolute top-0 left-0 right-0 h-1 bg-status-accepted"></div>}

      {/* Шапка виджета */}
      <div className="flex items-center justify-between">
         <span className={`text-xs font-black uppercase tracking-widest ${isActive ? 'text-status-accepted' : 'text-graphite/80'}`}>
            Главное табло
         </span>
         {isActive && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-status-accepted animate-pulse"></span>
              <span className="text-[9px] font-black text-status-accepted uppercase tracking-widest hidden xl:inline">В эфире</span>
            </div>
         )}
      </div>

      {/* Компактный блок Счета и Времени */}
      <div className="flex items-start justify-between w-full">
        
        {/* Хозяева */}
        <div className="flex flex-col items-center w-[30%]">
          {homeLogo && <img src={homeLogo} alt="Home" className="h-16 w-16 object-contain mb-1.5 drop-shadow-sm" />}
          <span className="text-[11px] font-bold uppercase tracking-wide truncate w-full text-center text-graphite">{homeShortName}</span>
          
          {/* Штрафы хозяев */}
          {homePens.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-1.5 w-full items-center">
              {homePens.map((p, i) => <span key={i} className="text-[9px] font-mono font-bold bg-status-rejected/10 text-status-rejected px-1 rounded">{formatTime(p.remaining)}</span>)}
            </div>
          )}
        </div>

        {/* Центр: Счет, Таймер, Период */}
        <div className="flex flex-col items-center justify-center w-[40%]">
           
           <div className="flex items-center justify-center gap-2 mb-1.5">
             <span className="text-3xl font-black text-graphite leading-none">{game.home_score || 0}</span>
             <span className="text-graphite/30 font-black text-xl leading-none -mt-1">:</span>
             <span className="text-3xl font-black text-graphite leading-none">{game.away_score || 0}</span>
           </div>
           
           {/* Крупный таймер (Остаток) */}
           <div className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded shadow-inner ${isTimerRunning ? 'bg-status-accepted/10 border-status-accepted/20' : 'bg-gray-bg-light/0 border-graphite/0'}`}>
             <span className={`w-2 h-2 rounded-full ${isTimerRunning ? 'bg-status-accepted animate-pulse' : 'bg-graphite/30'}`}></span>
             <span className={`font-mono text-2xl font-black tracking-tighter ${isTimerRunning && countdownSecs <= 60 ? 'text-status-rejected animate-pulse' : isTimerRunning ? 'text-status-accepted' : 'text-graphite'}`}>
                {currentPeriod === 'SO' ? '0:00' : formatTime(countdownSecs)}
             </span>
           </div>
           
           <span className="text-[12spx] font-bold text-graphite/40 uppercase tracking-widest mt-1.5">
              {currentPeriod === 'OT' ? 'Овертайм' : currentPeriod === 'SO' ? 'Буллиты' : `${currentPeriod} период`}
           </span>
        </div>

        {/* Гости */}
        <div className="flex flex-col items-center w-[30%]">
          {awayLogo && <img src={awayLogo} alt="Away" className="h-16 w-16 object-contain mb-1.5 drop-shadow-sm" />}
          <span className="text-[11px] font-bold uppercase tracking-wide truncate w-full text-center text-graphite">{awayShortName}</span>
          
          {/* Штрафы гостей */}
          {awayPens.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-1.5 w-full items-center">
              {awayPens.map((p, i) => <span key={i} className="text-[9px] font-mono font-bold bg-status-rejected/10 text-status-rejected px-1 rounded">{formatTime(p.remaining)}</span>)}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}