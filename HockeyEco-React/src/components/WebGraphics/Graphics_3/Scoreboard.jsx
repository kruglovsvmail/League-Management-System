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

  const fullScreenOverlays = ['prematch', 'intermission', 'team_leaders', 'team_roster'];
  const isHidden = !isScoreboardVisible || (overlay?.visible && fullScreenOverlays.includes(overlay?.type));

  // Кастомная задержка для плашки удалений, чтобы они появлялись после основного табло
  const penaltyAnimationDelay = 200;

  return (
    <AnimationWrapper
      type="complex_construct" // Используем новую 3D-анимацию сборки
      isVisible={!isHidden}
      className="absolute top-8 left-1/2 -translate-x-1/2 z-50 w-[1200px]"
    >
      {/* Главный многослойный геометрический контейнер */}
      <div className="relative flex items-center h-[120px] bg-[#051125]/80 backdrop-blur-[20px] border border-[#1A3A6D]/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] px-4 py-2 overflow-hidden">
          
          {/* Геометрические фоновые панели и скосы */}
          <div className="absolute inset-0 z-0 flex pointer-events-none">
             {/* Скошенный левый фон */}
             <div className="w-[45%] h-full bg-[#112547] border-r border-[#1A3A6D]/80" style={{ transform: 'skewX(-15deg) translateX(-15px)' }}></div>
             {/* Скошенный правый фон */}
             <div className="w-[45%] h-full bg-[#112547] border-l border-[#1A3A6D]/80 ml-auto" style={{ transform: 'skewX(15deg) translateX(15px)' }}></div>
          </div>
          
          {/* Слой с неоновым свечением по краям */}
          <div className="absolute top-0 left-10 right-10 h-[1px] bg-[#00E5FF] shadow-[0_0_20px_#00E5FF]"></div>
          <div className="absolute bottom-0 left-10 right-10 h-[1px] bg-[#00E5FF] shadow-[0_0_20px_#00E5FF]"></div>

          {/* Блок Хозяев */}
          <div className="relative z-10 w-[40%] flex items-center justify-end h-full px-6 gap-6 pr-10">
              <div className="flex flex-col items-end gap-1">
                  {/* Имя команды */}
                  <span className="font-bold text-4xl text-white tracking-wider uppercase leading-none font-sans" style={{ textShadow: '0 4px 8px rgba(0,0,0,0.5)' }}>
                      {homeShortName}
                  </span>
                  {/* Полное имя (необязательно, но добавим для детальности) */}
                  <span className="text-[12px] font-black text-[#A0BCE0] uppercase tracking-widest">{game.home_team_name}</span>
              </div>
              {/* Логотип */}
              <div className="relative w-20 h-20 flex items-center justify-center p-1 border-2 border-[#1A3A6D] bg-[#0A1D37]">
                <div className="absolute inset-0 bg-[#00E5FF]/5 shadow-[inset_0_0_10px_#00E5FF/10]"></div>
                {homeLogo && <img src={homeLogo} className="w-full h-full object-contain relative z-10" alt="HomeLogo" onError={(e) => { e.target.style.display = 'none'; }} /> }
              </div>
              {/* Счет */}
              <span className="font-black text-7xl tabular-nums text-white leading-none relative z-10 tracking-tight" style={{ textShadow: '0 0 20px #FFF, 0 4px 8px rgba(0,0,0,0.5)' }}>
                  {game.home_score}
              </span>
          </div>

          {/* Центральный блок: Таймер + Период */}
          <div className="relative z-20 w-[20%] flex flex-col items-center justify-center h-full border-x-4 border-[#1A3A6D] bg-[#0A1D37] shadow-[inset_0_0_30px_#000]">
              {/* Таймер */}
              <span className={`font-mono text-5xl font-black tabular-nums tracking-tighter leading-none mb-1 ${isTimerRunning ? 'text-[#00E5FF]' : 'text-white'}`} style={{ textShadow: isTimerRunning ? '0 0 15px #00E5FF' : '0 4px 8px rgba(0,0,0,0.5)' }}>
                {currentPeriod === 'SO' ? '0:00' : formatTime(displaySeconds)}
              </span>
              {/* Период */}
              <div className="bg-[#112547] px-5 py-1 border border-[#1A3A6D] relative" style={{ transform: 'skewX(-10deg)' }}>
                  <span className="block text-sm font-black text-white uppercase tracking-widest" style={{ transform: 'skewX(10deg)' }}>
                    {getPeriodText()}
                  </span>
              </div>
          </div>

          {/* Блок Гостей */}
          <div className="relative z-10 w-[40%] flex items-center justify-start h-full px-6 gap-6 pl-10">
              {/* Счет */}
              <span className="font-black text-7xl tabular-nums text-white leading-none relative z-10 tracking-tight" style={{ textShadow: '0 0 20px #FFF, 0 4px 8px rgba(0,0,0,0.5)' }}>
                  {game.away_score}
              </span>
              {/* Логотип */}
              <div className="relative w-20 h-20 flex items-center justify-center p-1 border-2 border-[#1A3A6D] bg-[#0A1D37]">
                <div className="absolute inset-0 bg-[#00E5FF]/5 shadow-[inset_0_0_10px_#00E5FF/10]"></div>
                {awayLogo && <img src={awayLogo} className="w-full h-full object-contain relative z-10" alt="AwayLogo" onError={(e) => { e.target.style.display = 'none'; }} /> }
              </div>
              <div className="flex flex-col items-start gap-1">
                  {/* Имя команды */}
                  <span className="font-bold text-4xl text-white tracking-wider uppercase leading-none font-sans" style={{ textShadow: '0 4px 8px rgba(0,0,0,0.5)' }}>
                      {awayShortName}
                  </span>
                  {/* Полное имя */}
                  <span className="text-[12px] font-black text-[#A0BCE0] uppercase tracking-widest">{game.away_team_name}</span>
              </div>
          </div>
      </div>

      {/* Блок удалений - анимируем отдельно со сдвигом, в геометрических плашках */}
      <div className="flex w-full mt-4 justify-center gap-10">
          {[game.home_team_id, game.away_team_id].map((teamId, index) => {
             const teamPenalties = activePenalties.filter(p => p.team_id === teamId);
             if (teamPenalties.length === 0) return null;
             
             return (
               <AnimationWrapper
                 key={teamId}
                 type="geometric_unfold" // Используем 3D-слайд для боковых плашек
                 isVisible={!isHidden}
                 delay={penaltyAnimationDelay * (index + 1)}
                 className={`w-[45%] flex flex-col gap-2 ${index === 0 ? 'items-end' : 'items-start'}`}
               >
                 {teamPenalties.map(p => (
                   <div 
                     key={p.id} 
                     className="flex items-center gap-3 h-[40px] bg-[#051125]/90 backdrop-blur-[10px] border border-[#1A3A6D] px-6 py-1 relative shadow-[0_10px_30px_-5px_rgba(0,0,0,0.6)]"
                     style={{ transform: index === 0 ? 'skewX(-15deg)' : 'skewX(15deg)' }}
                   >
                       {/* Декоративный неоновый угол */}
                       <div className={`absolute top-0 ${index === 0 ? 'left-0' : 'right-0'} h-[1px] w-10 bg-[#00E5FF]`}></div>
                       
                       <div className="flex items-center gap-4" style={{ transform: index === 0 ? 'skewX(15deg)' : 'skewX(-15deg)' }}>
                         {index === 1 && <span className="font-black text-2xl text-[#00E5FF] tabular-nums font-mono w-[30px] text-left">{p.primary_jersey_number}</span>}
                         <span className="text-[13px] font-black text-white uppercase truncate max-w-[120px]">{p.player_name || p.player_id}</span>
                         <span className={`font-mono text-2xl font-black tabular-nums tracking-tight ${p.remaining <= 30 ? 'text-[#FF5722] shadow-[0_0_10px_#FF5722]' : 'text-white'}`}>{formatTime(p.remaining)}</span>
                         {index === 0 && <span className="font-black text-2xl text-[#00E5FF] tabular-nums font-mono w-[30px] text-right">{p.primary_jersey_number}</span>}
                       </div>
                   </div>
                 ))}
               </AnimationWrapper>
             );
          })}
      </div>
    </AnimationWrapper>
  );
}