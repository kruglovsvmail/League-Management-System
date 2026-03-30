import React, { useState, useEffect } from 'react';
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
    return `${currentPeriod} ПЕР`;
  };

  const displaySeconds = getDisplaySeconds();
  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';
  
  const homeLogo = getSafeUrl(game.home_team_logo);
  const awayLogo = getSafeUrl(game.away_team_logo);

  const homeColorHex = '#FF5722'; // Можно заменить на динамические из game.home_color
  const awayColorHex = '#0EA5E9'; // Можно заменить на динамические из game.away_color

  // =======================================================================
  // УМНАЯ ЛОГИКА СКРЫТИЯ ТАБЛО (ЗАЩИТА ОТ МИГАНИЯ ПРИ ТРАНЗИШЕНАХ)
  // =======================================================================
  const fullScreenOverlays = ['prematch', 'intermission', 'team_leaders', 'team_roster'];
  const isFullScreenActive = overlay?.visible && fullScreenOverlays.includes(overlay?.type);

  const [hideForOverlay, setHideForOverlay] = useState(false);

  useEffect(() => {
    if (isFullScreenActive) {
      // Если появилась большая плашка — прячем табло мгновенно
      setHideForOverlay(true);
    } else {
      // Если плашка пропала, ждем 600мс. 
      // Это покрывает время транзишена (450мс) при смене плашек в автопилоте,
      // а также дает красивую паузу перед возвращением табло в эфир.
      const timer = setTimeout(() => {
        setHideForOverlay(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isFullScreenActive]);

  // Табло скрыто, если его выключил режиссер ИЛИ если висит большая плашка
  const isHidden = !isScoreboardVisible || hideForOverlay;
  // =======================================================================

  const safePenalties = Array.isArray(activePenalties) ? activePenalties : [];
  
  // Берем до 2 штрафов на команду
  const visibleHome = safePenalties.filter(p => p.team_id === game.home_team_id).slice(0, 2);
  const visibleAway = safePenalties.filter(p => p.team_id === game.away_team_id).slice(0, 2);

  const homePlayers = 5 - visibleHome.length;
  const awayPlayers = 5 - visibleAway.length;

  let strengthText = null;
  let isPP = false;

  if (homePlayers < 5 || awayPlayers < 5) {
    if (homePlayers === awayPlayers) {
        strengthText = `${homePlayers} НА ${awayPlayers}`;
    } else if (homePlayers > awayPlayers) {
        isPP = true;
        strengthText = `БОЛЬШИНСТВО`;
    } else {
        isPP = true;
        strengthText = `БОЛЬШИНСТВО`;
    }
  }

  // Внутренний компонент для отрисовки строки команды (чтобы не дублировать код)
  const TeamRow = ({ logo, shortName, score, color, penalties, isTopRow }) => (
    <div className={`flex items-stretch h-[44px] bg-zinc-900 relative ${isTopRow ? 'border-b border-zinc-800' : ''}`}>
      {/* Цветовой маркер команды */}
      <div className="w-2 shrink-0 z-10" style={{ backgroundColor: color }}></div>
      
      {/* Название и счет (компенсация скоса для текста) */}
      <div className="flex items-center justify-between w-[200px] px-4 skew-x-[10deg] z-10">
        <div className="flex items-center gap-3">
          {logo && (
            <img 
              src={logo} 
              alt="logo" 
              className="w-8 h-8 object-contain"
              onError={(e) => { e.target.style.display = 'none'; }} 
            />
          )}
          <span className="font-bold text-lg uppercase tracking-wider text-white">
            {shortName}
          </span>
        </div>
        <span className="font-mono font-black text-3xl text-white tracking-tighter">
          {score}
        </span>
      </div>

      {/* Штрафы (если есть, прилипают справа) */}
      {penalties.length > 0 && (
        <div className="flex items-center bg-yellow-400 px-3 border-l border-zinc-800 z-0">
          <div className="skew-x-[10deg] flex gap-3 text-black font-mono font-black text-xl tracking-tighter">
            {penalties.map(p => (
              <span key={p.id}>{formatTime(p.remaining)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <AnimationWrapper
      type="scoreboard"
      isVisible={!isHidden}
      className="absolute top-10 left-12 flex flex-col items-start z-50 drop-shadow-2xl"
    >
      {/* Главный контейнер со скосом */}
      <div className="flex items-stretch skew-x-[-10deg] overflow-hidden rounded-md bg-zinc-950">
        
        {/* Левый блок: Команды (в две строки) */}
        <div className="flex flex-col">
          <TeamRow 
            logo={homeLogo} shortName={homeShortName} score={game.home_score} 
            color={homeColorHex} penalties={visibleHome} isTopRow={true} 
          />
          <TeamRow 
            logo={awayLogo} shortName={awayShortName} score={game.away_score} 
            color={awayColorHex} penalties={visibleAway} isTopRow={false} 
          />
        </div>

        {/* Правый блок: Таймер и Период */}
        <div className="flex flex-col items-center justify-center w-[120px] bg-zinc-950 relative overflow-hidden">
          {/* Блик, пробегающий по блоку времени */}
          <div className="absolute top-0 bottom-0 w-[200%] bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-[-20deg] animate-glare pointer-events-none z-0"></div>
          
          {/* Компенсация скоса */}
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

      {/* Плашка "Большинство / Формат", выезжающая снизу */}
      {strengthText && (
        <div className="flex justify-start ml-8 -mt-1 z-[-1]">
          <div className={`skew-x-[-10deg] px-5 py-1 rounded-b-sm border-x border-b border-zinc-950 shadow-md ${isPP ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-white'}`}>
            <span className="skew-x-[10deg] block text-[11px] font-black uppercase tracking-[0.2em]">
              {strengthText}
            </span>
          </div>
        </div>
      )}
    </AnimationWrapper>
  );
}