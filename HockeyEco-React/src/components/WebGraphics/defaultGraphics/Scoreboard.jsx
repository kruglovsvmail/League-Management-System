import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';

const formatTime = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

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

  // Массив всех полноэкранных плашек, при которых табло должно скрываться
  const fullScreenOverlays = ['prematch', 'intermission', 'team_leaders', 'team_roster'];
  
  // Если табло скрыто режиссером вручную ИЛИ выведена любая полноэкранная графика
  const isHidden = !isScoreboardVisible || (overlay?.visible && fullScreenOverlays.includes(overlay?.type));

  return (
    <AnimationWrapper
      type="scoreboard"
      isVisible={!isHidden}
      className="absolute top-10 left-10 flex flex-col items-start z-50"
    >
      <div className="flex items-stretch text-white shadow-2xl rounded-xl bg-black/85 backdrop-blur-md border border-white/10 overflow-hidden relative">
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

        <div className="flex flex-col items-center justify-center px-5 bg-white/5 border-x border-white/10 min-w-[130px] py-2 relative z-20 shadow-inner">
          <span className={`font-mono text-4xl font-black tabular-nums leading-none tracking-tight transition-colors drop-shadow-md ${isTimerRunning ? 'text-white' : 'text-red-400'}`}>
            {currentPeriod === 'SO' ? '0:00' : formatTime(displaySeconds)}
          </span>
          <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest mt-1">
            {getPeriodText()}
          </span>
        </div>

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

      <div className="flex w-full justify-between mt-2 px-1">
          <div className="flex flex-col gap-1 w-[45%] items-start">
             {activePenalties.filter(p => p.team_id === game.home_team_id).map(p => (
               <div key={p.id} className="flex items-center gap-2 text-[12px] font-bold bg-black/80 backdrop-blur-md text-white px-3 py-1.5 rounded-md border border-white/10 shadow-lg">
                  <span className="text-white/70 uppercase truncate max-w-[90px]">{p.player_name || p.player_id}</span>
                  <span className="font-mono text-red-400 tabular-nums tracking-tight">{formatTime(p.remaining)}</span>
               </div>
             ))}
          </div>
          <div className="flex flex-col gap-1 w-[45%] items-end">
             {activePenalties.filter(p => p.team_id === game.away_team_id).map(p => (
               <div key={p.id} className="flex items-center gap-2 text-[12px] font-bold bg-black/80 backdrop-blur-md text-white px-3 py-1.5 rounded-md border border-white/10 shadow-lg">
                  <span className="font-mono text-red-400 tabular-nums tracking-tight">{formatTime(p.remaining)}</span>
                  <span className="text-white/70 uppercase truncate max-w-[90px]">{p.player_name || p.player_id}</span>
               </div>
             ))}
          </div>
      </div>
    </AnimationWrapper>
  );
}