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
    return `${currentPeriod} ПЕР`;
  };

  const displaySeconds = getDisplaySeconds();
  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';
  
  const homeLogo = getSafeUrl(game.home_team_logo);
  const awayLogo = getSafeUrl(game.away_team_logo);

  const homeColorHex = '#FF5722';
  const awayColorHex = '#0EA5E9';

  // Скрытие табло при полноэкранной графике
  const fullScreenOverlays = ['prematch', 'intermission', 'team_leaders', 'team_roster'];
  const isHidden = !isScoreboardVisible || (overlay?.visible && fullScreenOverlays.includes(overlay?.type));

  // --- ЛОГИКА ФОРМАТОВ И ШТРАФОВ ---
  const safePenalties = Array.isArray(activePenalties) ? activePenalties : [];
  
  const activeHome = safePenalties.filter(p => p.team_id === game.home_team_id);
  const activeAway = safePenalties.filter(p => p.team_id === game.away_team_id);

  // Ограничиваем показ двумя штрафами (правило 5 на 3)
  const visibleHome = activeHome.slice(0, 2);
  const visibleAway = activeAway.slice(0, 2);

  // Считаем фактическое количество игроков на льду
  const homePlayers = 5 - visibleHome.length;
  const awayPlayers = 5 - visibleAway.length;

  let strengthText = null;
  let isPP = false;

  // Если на льду кто-то отсутствует (не 5 на 5)
  if (homePlayers < 5 || awayPlayers < 5) {
    if (homePlayers === awayPlayers) {
        // Равные неполные составы (4 на 4, 3 на 3)
        strengthText = `${homePlayers} НА ${awayPlayers}`;
    } else if (homePlayers > awayPlayers) {
        // Большинство хозяев
        isPP = true;
        strengthText = `${homePlayers} НА ${awayPlayers}`;
    } else {
        // Большинство гостей
        isPP = true;
        strengthText = `${awayPlayers} НА ${homePlayers}`;
    }
  }

  return (
    <AnimationWrapper
      type="scoreboard"
      isVisible={!isHidden}
      className="absolute top-10 left-10 flex flex-col items-center z-50 w-auto"
    >
      <div className="flex items-stretch text-white shadow-2xl rounded-xl bg-black/85 backdrop-blur-md border border-white/10 overflow-hidden relative z-20">
        
        {/* Хозяева */}
        <div className="flex items-center px-8 py-3 relative min-w-[200px] justify-end">
          {homeLogo && (
            <img 
              src={homeLogo} 
              className="absolute -left-6 top-1/2 -translate-y-1/2 w-32 h-32 object-contain opacity-70 z-0 pointer-events-none" 
              alt="HomeLogo"
              onError={(e) => { e.target.style.display = 'none'; }} 
            />
          )}
          <div className="flex items-center gap-4 z-10 relative">
            <span className="font-bold text-2xl tracking-wide uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {homeShortName}
            </span>
            <span 
              className="font-black text-5xl tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" 
              style={{ color: homeColorHex }}
            >
              {game.home_score}
            </span>
          </div>
        </div>

        {/* Время матча */}
        <div className="flex flex-col items-center justify-center px-5 bg-white/5 border-x border-white/10 min-w-[130px] py-2 relative z-20 shadow-inner">
          <span className={`font-mono text-4xl font-black tabular-nums leading-none tracking-tight transition-colors drop-shadow-md ${isTimerRunning ? 'text-white' : 'text-red-400'}`}>
            {currentPeriod === 'SO' ? '0:00' : formatTime(displaySeconds)}
          </span>
          <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest mt-1">
            {getPeriodText()}
          </span>
        </div>

        {/* Гости */}
        <div className="flex items-center px-8 py-3 relative min-w-[200px] justify-start">
          <div className="flex items-center gap-4 z-10 relative">
            <span 
              className="font-black text-5xl tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" 
              style={{ color: awayColorHex }}
            >
              {game.away_score}
            </span>
            <span className="font-bold text-2xl tracking-wide uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {awayShortName}
            </span>
          </div>
          {awayLogo && (
            <img 
              src={awayLogo} 
              className="absolute -right-6 top-1/2 -translate-y-1/2 w-32 h-32 object-contain opacity-70 z-0 pointer-events-none" 
              alt="AwayLogo"
              onError={(e) => { e.target.style.display = 'none'; }} 
            />
          )}
        </div>
      </div>

      {/* Нижний блок: Штрафы и Плашка состава */}
      <div className="flex w-full justify-between items-start -mt-2 relative z-10 px-4">
        
        {/* Таймеры удалений хозяев */}
        <div className="flex flex-col gap-[1px] items-end w-[200px]">
          {visibleHome.map((p, idx) => (
            <div 
              key={p.id} 
              className={`flex items-center justify-center w-[110px] bg-black/80 backdrop-blur-md border-x border-b border-white/10 shadow-lg ${idx === 0 ? 'pt-4 pb-2' : 'py-2'} ${idx === visibleHome.length - 1 ? 'rounded-b-md' : ''}`}
            >
              <span className="font-mono text-3xl font-black text-yellow-400 tabular-nums tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                {formatTime(p.remaining)}
              </span>
            </div>
          ))}
        </div>

        {/* Центральная плашка формата игры (Большинство / 4 на 4) */}
        <div className="w-[130px] flex flex-col items-center justify-start pt-3">
          {strengthText && (
            <div className={`text-center leading-tight py-1 px-4 rounded-sm shadow-md whitespace-nowrap border ${
              isPP 
                ? 'bg-yellow-400 text-black border-yellow-500' 
                : 'bg-black/80 backdrop-blur-md text-white border-white/10'
            }`}>
              {isPP && <span className="text-[10px] font-black uppercase tracking-widest block mb-[1px]">Большинство</span>}
              <span className="text-[14px] font-black uppercase tracking-widest">{strengthText}</span>
            </div>
          )}
        </div>

        {/* Таймеры удалений гостей */}
        <div className="flex flex-col gap-[1px] items-start w-[200px]">
          {visibleAway.map((p, idx) => (
            <div 
              key={p.id} 
              className={`flex items-center justify-center w-[110px] bg-black/80 backdrop-blur-md border-x border-b border-white/10 shadow-lg ${idx === 0 ? 'pt-4 pb-2' : 'py-2'} ${idx === visibleAway.length - 1 ? 'rounded-b-md' : ''}`}
            >
              <span className="font-mono text-3xl font-black text-yellow-400 tabular-nums tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                {formatTime(p.remaining)}
              </span>
            </div>
          ))}
        </div>

      </div>
    </AnimationWrapper>
  );
}