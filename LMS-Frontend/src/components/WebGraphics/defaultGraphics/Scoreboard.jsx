// src/components/WebGraphics/defaultGraphics/Scoreboard.jsx
import React, { useState, useEffect } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';

const formatTime = (s) => {
  if (s === undefined || s === null || isNaN(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;
};

// Иконки для буллитов
const ShootoutGoalIcon = () => (
  <svg className="w-3.5 h-3.5 text-status-accepted drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" />
    <path fill="white" d="M10.5 16.5l-4-4 1.41-1.41L10.5 13.67l7.09-7.09L19 8l-8.5 8.5z" />
  </svg>
);
const ShootoutMissIcon = () => (
  <svg className="w-3.5 h-3.5 text-status-rejected drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" />
    <path fill="white" d="M15.5 14.09L14.09 15.5 12 13.41 9.91 15.5 8.5 14.09 10.59 12 8.5 9.91 9.91 8.5 12 10.59 14.09 8.5 15.5 9.91 13.41 12 15.5 14.09z" />
  </svg>
);

export default function Scoreboard({ 
  game, events = [], soLength = 3, timerSeconds, currentPeriod, isTimerRunning, 
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
    return `${currentPeriod} ПЕР`;
  };

  const displaySeconds = getDisplaySeconds();
  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';
  
  const homeLogo = getSafeUrl(game.home_team_logo);
  const awayLogo = getSafeUrl(game.away_team_logo);

  const homeColorHex = '#FF5722'; 
  const awayColorHex = '#0EA5E9'; 

  const isTech = !!game.is_technical;
  const techHome = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[0] : '+';
  const techAway = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[1] : '-';

  // =======================================================================
  // ЛОГИКА СЕРИИ БУЛЛИТОВ
  // =======================================================================
  const homeShootout = events.filter(e => e.period === 'SO' && e.team_id === game.home_team_id && ['shootout_goal', 'shootout_miss'].includes(e.event_type));
  const awayShootout = events.filter(e => e.period === 'SO' && e.team_id === game.away_team_id && ['shootout_goal', 'shootout_miss'].includes(e.event_type));
  
  let displaySlots = soLength;

  if (currentPeriod === 'SO') {
    const maxTaken = Math.max(homeShootout.length, awayShootout.length);
    const isRoundComplete = homeShootout.length === maxTaken && awayShootout.length === maxTaken;
    const homeSOGoals = homeShootout.filter(s => s.event_type === 'shootout_goal').length;
    const awaySOGoals = awayShootout.filter(s => s.event_type === 'shootout_goal').length;
    
    // Если раунд завершен, счет равный, и бросков сделано не меньше базового soLength - добавляем слот для sudden death
    if (isRoundComplete && homeSOGoals === awaySOGoals && maxTaken >= displaySlots) {
        displaySlots = maxTaken + 1; 
    } else {
        displaySlots = Math.max(displaySlots, maxTaken);
    }
  }

  // =======================================================================
  // УМНАЯ ЛОГИКА СКРЫТИЯ ТАБЛО (ЗАЩИТА ОТ МИГАНИЯ ПРИ ТРАНЗИШЕНАХ)
  // =======================================================================
  const fullScreenOverlays = ['prematch', 'intermission', 'team_leaders', 'team_roster'];
  const isFullScreenActive = overlay?.visible && fullScreenOverlays.includes(overlay?.type);

  const [hideForOverlay, setHideForOverlay] = useState(false);

  useEffect(() => {
    if (isFullScreenActive) setHideForOverlay(true);
    else {
      const timer = setTimeout(() => setHideForOverlay(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isFullScreenActive]);

  const isHidden = !isScoreboardVisible || hideForOverlay;

  // =======================================================================
  // ЛОГИКА ШТРАФОВ
  // =======================================================================
  const safePenalties = Array.isArray(activePenalties) ? activePenalties : [];
  const visibleHome = safePenalties.filter(p => p.team_id === game.home_team_id).slice(0, 2);
  const visibleAway = safePenalties.filter(p => p.team_id === game.away_team_id).slice(0, 2);

  const homePlayers = 5 - visibleHome.length;
  const awayPlayers = 5 - visibleAway.length;

  let strengthText = null;
  let isPP = false;

  if (homePlayers < 5 || awayPlayers < 5) {
    if (homePlayers === awayPlayers) {
        strengthText = `${homePlayers} НА ${awayPlayers}`;
    } else {
        isPP = true;
        strengthText = `БОЛЬШИНСТВО`;
    }
  }

  // =======================================================================
  // ВНУТРЕННИЙ КОМПОНЕНТ СТРОКИ КОМАНДЫ
  // =======================================================================
  const TeamRow = ({ logo, shortName, score, color, penalties, shootoutShots, isTopRow, isTechnical }) => (
    <div className={`flex items-stretch h-[44px] bg-zinc-900 relative ${isTopRow ? 'border-b border-zinc-800' : ''}`}>
      <div className="w-2 shrink-0 z-10" style={{ backgroundColor: color }}></div>
      
      <div className="flex items-center justify-between w-[200px] px-4 skew-x-[10deg] z-10">
        <div className="flex items-center gap-3">
          {logo && (
            <img src={logo} alt="logo" className="w-8 h-8 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
          )}
          <span className="font-bold text-lg uppercase tracking-wider text-white">
            {shortName}
          </span>
        </div>
        <span className={`font-mono font-black text-3xl tracking-tighter ${isTechnical ? 'text-status-rejected' : 'text-white'}`}>
          {score}
        </span>
      </div>

      {/* Отрисовываем либо слоты Буллитов, либо таймеры Штрафов, если это НЕ технический результат */}
      {!isTechnical && (
        currentPeriod === 'SO' ? (
          <div className="flex items-center bg-zinc-900/80 px-4 border-l border-zinc-800 z-0">
            <div className="skew-x-[10deg] flex gap-2 items-center justify-center">
              {Array.from({ length: displaySlots }).map((_, i) => {
                const shot = shootoutShots[i];
                if (!shot) return <div key={i} className="w-2.5 h-2.5 rounded-full border-2 border-zinc-600/50"></div>; // Пустой слот
                if (shot.event_type === 'shootout_goal') return <ShootoutGoalIcon key={i} />; // Гол
                return <ShootoutMissIcon key={i} />; // Мимо
              })}
            </div>
          </div>
        ) : penalties.length > 0 && (
          <div className="flex items-center bg-yellow-400 px-3 border-l border-zinc-800 z-0">
            <div className="skew-x-[10deg] flex gap-3 text-black font-mono font-black text-xl tracking-tighter">
              {penalties.map(p => (
                <span key={p.id}>{formatTime(p.remaining)}</span>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );

  return (
    <AnimationWrapper
      type="scoreboard"
      isVisible={!isHidden}
      className="absolute top-10 left-12 flex flex-col items-start z-50 drop-shadow-2xl"
    >
      <div className="flex items-stretch skew-x-[-10deg] overflow-hidden rounded-md bg-zinc-950">
        
        <div className="flex flex-col">
          <TeamRow 
            logo={homeLogo} shortName={homeShortName} score={isTech ? techHome : game.home_score} 
            color={homeColorHex} penalties={visibleHome} shootoutShots={homeShootout} isTopRow={true} isTechnical={isTech}
          />
          <TeamRow 
            logo={awayLogo} shortName={awayShortName} score={isTech ? techAway : game.away_score} 
            color={awayColorHex} penalties={visibleAway} shootoutShots={awayShootout} isTopRow={false} isTechnical={isTech}
          />
        </div>

        <div className="flex flex-col items-center justify-center w-[120px] bg-zinc-950 relative overflow-hidden">
          <div className="absolute top-0 bottom-0 w-[200%] bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-[-20deg] animate-glare pointer-events-none z-0"></div>
          
          <div className="skew-x-[10deg] flex flex-col items-center z-10 w-full px-2">
            <span className={`font-mono text-3xl font-black tabular-nums leading-none tracking-tight transition-colors ${isTimerRunning ? 'text-white' : 'text-zinc-500'}`}>
              {currentPeriod === 'SO' ? '0:00' : formatTime(displaySeconds)}
            </span>
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
              {getPeriodText()}
            </span>
          </div>
        </div>
      </div>

      {/* Вывод плашки Технического Результата или Большинства */}
      {isTech ? (
        <div className="flex justify-start ml-8 -mt-1 z-[-1]">
          <div className="skew-x-[-10deg] px-5 py-1 rounded-b-sm border-x border-b border-zinc-950 shadow-md bg-status-rejected text-white">
            <span className="skew-x-[10deg] block text-[11px] font-black uppercase tracking-[0.2em]">
              ТЕХНИЧЕСКИЙ РЕЗУЛЬТАТ
            </span>
          </div>
        </div>
      ) : strengthText && currentPeriod !== 'SO' ? (
        <div className="flex justify-start ml-8 -mt-1 z-[-1]">
          <div className={`skew-x-[-10deg] px-5 py-1 rounded-b-sm border-x border-b border-zinc-950 shadow-md ${isPP ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-white'}`}>
            <span className="skew-x-[10deg] block text-[11px] font-black uppercase tracking-[0.2em]">
              {strengthText}
            </span>
          </div>
        </div>
      ) : null}
      
    </AnimationWrapper>
  );
}