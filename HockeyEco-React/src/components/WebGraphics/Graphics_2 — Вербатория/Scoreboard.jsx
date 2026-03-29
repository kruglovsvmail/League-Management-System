import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';

const formatTime = (s) => {
  if (s === undefined || s === null || isNaN(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;
};

export default function Scoreboard({ 
  game, timerSeconds, currentPeriod, isTimerRunning, 
  activePenalties, periodLength, otLength, overlay, isScoreboardVisible 
}) {

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

  const getPeriodText = () => {
    if (currentPeriod === 'OT') return 'ОТ';
    if (currentPeriod === 'SO') return 'БУЛ';
    return `${currentPeriod} ПЕРИОД`;
  };

  const displaySeconds = getDisplaySeconds();
  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';
  
  const fullScreenOverlays = ['prematch', 'intermission', 'team_leaders', 'team_roster'];
  const isHidden = !isScoreboardVisible || (overlay?.visible && fullScreenOverlays.includes(overlay?.type));

  const safePenalties = Array.isArray(activePenalties) ? activePenalties : [];
  const activeHome = safePenalties.filter(p => p.team_id === game.home_team_id).slice(0, 1);
  const activeAway = safePenalties.filter(p => p.team_id === game.away_team_id).slice(0, 1);

  return (
    <AnimationWrapper
      type="scoreboard"
      isVisible={!isHidden}
      className="absolute top-10 left-1/2 -translate-x-1/2 flex flex-col items-center z-50 drop-shadow-2xl"
    >
      {/* ГЛАВНОЕ ТАБЛО (Скругленная форма "Pill") */}
      <div className="flex items-center bg-white rounded-full p-1.5 shadow-[0_8px_30px_rgba(46,140,82,0.15)] border border-gray-100">
        
        {/* ХОЗЯЕВА */}
        <div className="flex items-center bg-verba-green-main text-white rounded-full px-6 py-2">
          <span className="font-verba-lato font-bold text-xl tracking-widest uppercase mr-4">
            {homeShortName}
          </span>
          <div className="bg-white/20 rounded-full w-10 h-10 flex items-center justify-center">
            <span className="font-verba-lato font-black text-2xl leading-none pt-1">
              {game.home_score}
            </span>
          </div>
        </div>

        {/* ТАЙМЕР (Центр) */}
        <div className="flex flex-col items-center justify-center px-8">
          <span className={`font-verba-lato font-black text-3xl leading-none tracking-wide ${isTimerRunning ? 'text-gray-800' : 'text-verba-orange'}`}>
            {currentPeriod === 'SO' ? '0:00' : formatTime(displaySeconds)}
          </span>
          <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mt-0.5">
            {getPeriodText()}
          </span>
        </div>

        {/* ГОСТИ */}
        <div className="flex items-center bg-gray-100 text-gray-800 rounded-full px-6 py-2 border border-gray-200">
          <div className="bg-white rounded-full w-10 h-10 flex items-center justify-center shadow-sm mr-4">
            <span className="font-verba-lato font-black text-2xl text-verba-green-main leading-none pt-1">
              {game.away_score}
            </span>
          </div>
          <span className="font-verba-lato font-bold text-xl tracking-widest uppercase">
            {awayShortName}
          </span>
        </div>

      </div>

      {/* ШТРАФЫ (Мягко выпадают снизу) */}
      <div className="flex w-full justify-between px-8 mt-2">
        {activeHome.map(p => (
          <div key={p.id} className="bg-verba-orange text-white rounded-full px-4 py-1 flex items-center shadow-md">
            <span className="text-xs font-bold tracking-widest mr-2">УДЛ</span>
            <span className="font-verba-lato font-bold">{formatTime(p.remaining)}</span>
          </div>
        ))}
        {activeAway.map(p => (
          <div key={p.id} className="bg-verba-orange text-white rounded-full px-4 py-1 flex items-center shadow-md ml-auto">
            <span className="font-verba-lato font-bold mr-2">{formatTime(p.remaining)}</span>
            <span className="text-xs font-bold tracking-widest">УДЛ</span>
          </div>
        ))}
      </div>
    </AnimationWrapper>
  );
}