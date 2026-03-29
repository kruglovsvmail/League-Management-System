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
    if (currentPeriod === 'SO') return 'БУЛЛИТЫ';
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
      className="absolute top-10 left-10 flex flex-col items-start z-50"
    >
      {/* ГЛАВНОЕ ТАБЛО */}
      <div className="flex bg-white shadow-lg border border-mts-grey-light/30">
        
        {/* ХОЗЯЕВА */}
        <div className="flex items-center">
          <div className="px-6 py-3 min-w-[120px] text-center">
            <span className="text-mts-black font-bold text-2xl tracking-widest uppercase">
              {homeShortName}
            </span>
          </div>
          {/* Фирменный красный квадрат со счетом */}
          <div className="w-[60px] h-[60px] bg-mts-red flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-3xl">
              {game.home_score}
            </span>
          </div>
        </div>

        {/* ТАЙМЕР И ПЕРИОД (Центральный блок) */}
        <div className="flex flex-col items-center justify-center px-6 bg-mts-black text-white min-w-[140px]">
          <span className="text-2xl font-bold tabular-nums leading-none tracking-wide mb-1">
            {currentPeriod === 'SO' ? '0:00' : formatTime(displaySeconds)}
          </span>
          <span className="text-[10px] text-mts-grey-light font-semibold tracking-widest uppercase">
            {getPeriodText()}
          </span>
        </div>

        {/* ГОСТИ */}
        <div className="flex items-center">
          <div className="w-[60px] h-[60px] bg-mts-grey-dark flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-3xl">
              {game.away_score}
            </span>
          </div>
          <div className="px-6 py-3 min-w-[120px] text-center">
            <span className="text-mts-black font-bold text-2xl tracking-widest uppercase">
              {awayShortName}
            </span>
          </div>
        </div>

      </div>

      {/* БЛОК ШТРАФОВ */}
      <div className="flex w-full justify-between mt-1">
        {/* Штраф хозяев */}
        <div className="flex flex-col gap-1 w-[180px]">
          {activeHome.map(p => (
            <div key={p.id} className="bg-mts-red text-white px-4 py-1 flex items-center justify-between text-sm font-bold shadow-sm">
              <span className="tracking-widest">PEN</span>
              <span>{formatTime(p.remaining)}</span>
            </div>
          ))}
        </div>

        {/* Штраф гостей */}
        <div className="flex flex-col gap-1 w-[180px] items-end">
          {activeAway.map(p => (
            <div key={p.id} className="bg-mts-grey-dark text-white px-4 py-1 flex items-center justify-between text-sm font-bold shadow-sm w-full">
              <span>{formatTime(p.remaining)}</span>
              <span className="tracking-widest">PEN</span>
            </div>
          ))}
        </div>
      </div>
    </AnimationWrapper>
  );
}