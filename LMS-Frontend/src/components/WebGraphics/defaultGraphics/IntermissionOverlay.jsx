import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function IntermissionOverlay({ game, overlay, timerSeconds, periodLength }) {
  const isVisible = overlay.visible && overlay.type === 'intermission';
  const [timeLeft, setTimeLeft] = useState(0);
  const [goalIndex, setGoalIndex] = useState(0);

  // Таймер перерыва
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

  // Собираем и сортируем все голы хронологически
  const allGoals = [...(game.goals || [])].sort((a, b) => a.time_seconds - b.time_seconds);

  // Таймер для карусели голов (перелистывание каждые 5 секунд)
  useEffect(() => {
    if (!isVisible || allGoals.length <= 1) {
      setGoalIndex(0);
      return;
    }
    
    const carouselInterval = setInterval(() => {
      setGoalIndex((prev) => (prev + 1) % allGoals.length);
    }, 3000);

    return () => clearInterval(carouselInterval);
  }, [isVisible, allGoals.length]);

  if (!game) return null;

  const formatCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sc = ('0' + (s % 60)).slice(-2);
    return `${m}:${sc}`;
  };

  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);
  const divisionLogo = getImageUrl(game.division_logo);
  const defaultAvatar = getImageUrl('default/user_default.webp');

  const dateObj = game.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
  const cityText = game.arena_city ? game.arena_city.toUpperCase() : 'ГОРОД НЕ УКАЗАН';
  const arenaText = (game.arena_name || game.location_text || 'ЛЕДОВАЯ АРЕНА').toUpperCase();
  const displayDate = dateStr ? dateStr.toUpperCase() : 'ДАТА НЕ УКАЗАНА';

  // Определение статуса периода
  const getPeriodStatusText = () => {
    const pLenSecs = (periodLength || 20) * 60;
    if (timerSeconds >= pLenSecs * 3) return "МАТЧ ЗАВЕРШЕН";
    if (timerSeconds >= pLenSecs * 2) return "ПЕРЕРЫВ • ПОСЛЕ 2 ПЕРИОДА";
    if (timerSeconds >= pLenSecs) return "ПЕРЕРЫВ • ПОСЛЕ 1 ПЕРИОДА";
    return "ПЕРЕРЫВ";
  };

  // Форматирование времени гола
  const formatGoalTime = (secs) => {
    const pLenSecs = (periodLength || 20) * 60;
    let p = 1; let rSecs = secs;
    if (secs >= pLenSecs * 3) { p = 'ОТ'; rSecs = secs - pLenSecs * 3; }
    else if (secs >= pLenSecs * 2) { p = 3; rSecs = secs - pLenSecs * 2; }
    else if (secs >= pLenSecs) { p = 2; rSecs = secs - pLenSecs; }
    return `${p}П • ${Math.floor(rSecs / 60)}:${('0' + (rSecs % 60)).slice(-2)}`;
  };

  // Поиск фото игрока в ростере
  const getPlayerPhoto = (goal) => {
    const isHome = goal.team_id === game.home_team_id;
    const roster = isHome ? game.home_roster : game.away_roster;
    if (!roster) return defaultAvatar;
    
    const player = roster.find(p => p.last_name === goal.scorer_last_name && p.first_name === goal.scorer_first_name);
    return getSafeUrl(player?.avatar_url) || defaultAvatar;
  };

  return (
    <AnimationWrapper
      type="intermission"
      isVisible={isVisible}
      className="absolute inset-0 flex items-center justify-center z-50 p-20"
    >
      <div className="flex flex-col items-center w-full max-w-[1500px] relative overflow-hidden rounded-xxl shadow-2xl transform-gpu">
        
        {/* ГЛОБАЛЬНЫЙ БЛИК */}
        <div className="absolute top-0 bottom-0 w-[80%] bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-30deg] animate-glare pointer-events-none z-50"></div>

        {/* ШАПКА */}
        <div className="flex justify-between items-center bg-zinc-800 text-zinc-300 px-8 py-3 w-full relative z-10">
          <div className="flex items-center gap-4">
             {divisionLogo && (
               <img src={divisionLogo} alt="Division" className="h-10 object-contain" onError={(e) => e.target.style.display = 'none'} />
             )}
             <div className="flex flex-col">
               <span className="font-black uppercase tracking-[0.2em] text-sm leading-tight text-white">
                 {game.league_name}
               </span>
               <span className="font-bold uppercase tracking-[0.15em] text-xs text-zinc-400">
                 {game.division_name || 'ДИВИЗИОН'}
               </span>
             </div>
          </div>
          
          <div className="flex flex-col text-right justify-center">
             {/* Убрали лишнюю надпись, оставили только сам статус */}
             <span className="font-black uppercase tracking-[0.15em] text-sm text-white">
               {getPeriodStatusText()}
             </span>
          </div>
        </div>

        {/* ТЕЛО ПЛАШКИ (2 КОЛОНКИ) */}
        <div className="flex w-full h-[600px] bg-zinc-950 overflow-hidden relative z-0">
          
          {/* ЛЕВАЯ КОЛОНКА: СКОРБОРД (60% ширины) */}
          <div className="w-[60%] flex flex-col border-r-4 border-zinc-900 relative">
             
             {/* ХОЗЯЕВА */}
             <div className="flex-1 flex items-center justify-between px-12 relative border-b-2 border-zinc-900 overflow-hidden group bg-zinc-950">
                {/* Крупный логотип на фоне (с сильным затемнением) */}
                {homeLogo && (
                  <img src={homeLogo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15 blur-xl scale-[100%] z-0 pointer-events-none" />
                )}
                
                <div className="flex items-center gap-8 z-10 w-full">
                   {homeLogo && (
                     <img src={homeLogo} alt="Home" className="w-40 h-40 object-contain drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)] shrink-0" onError={(e) => e.target.style.display = 'none'} />
                   )}
                   <span className="text-6xl font-black text-white uppercase tracking-tighter leading-none flex-1 line-clamp-2 drop-shadow-sm">
                     {game.home_team_name}
                   </span>
                   <span className="text-[140px] font-mono font-black text-white tabular-nums leading-none tracking-tighter drop-shadow-lg shrink-0">
                     {game.home_score}
                   </span>
                </div>
             </div>

             {/* ГОСТИ */}
             <div className="flex-1 flex items-center justify-between px-12 relative border-t-2 border-zinc-900 overflow-hidden group bg-zinc-950">
                {/* Крупный логотип на фоне (с сильным затемнением) */}
                {awayLogo && (
                  <img src={awayLogo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15 blur-xl scale-[100%] z-0 pointer-events-none" />
                )}

                <div className="flex items-center gap-8 z-10 w-full">
                   {awayLogo && (
                     <img src={awayLogo} alt="Away" className="w-40 h-40 object-contain drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)] shrink-0" onError={(e) => e.target.style.display = 'none'} />
                   )}
                   <span className="text-6xl font-black text-white uppercase tracking-tighter leading-none flex-1 line-clamp-2 drop-shadow-sm">
                     {game.away_team_name}
                   </span>
                   <span className="text-[140px] font-mono font-black text-white tabular-nums leading-none tracking-tighter drop-shadow-lg shrink-0">
                     {game.away_score}
                   </span>
                </div>
             </div>
          </div>

          {/* ПРАВАЯ КОЛОНКА: ТАЙМЕР И ИНФО (40% ширины) */}
          <div className="w-[40%] flex flex-col bg-zinc-900 relative">
             
             {/* БЛОК ТАЙМЕРА (Сверху) */}
             <div className="flex flex-col items-center justify-center p-6 bg-zinc-950 border-b-4 border-zinc-900 h-[35%] shrink-0 relative overflow-hidden">
                <span className="text-zinc-500 font-black uppercase tracking-[0.3em] text-sm mb-2 z-10">
                  ДО СТАРТА ПЕРИОДА
                </span>
                <span className={`font-mono text-8xl font-black tabular-nums tracking-tighter leading-none transition-colors z-10 ${timeLeft <= 60 && !overlay.data?.isPaused ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                  {formatCountdown(timeLeft)}
                </span>
             </div>

             {/* БЛОК КАРУСЕЛИ ГОЛОВ (Снизу) */}
             <div className="flex flex-col flex-1 bg-zinc-950 p-8 overflow-hidden relative">
                
                {allGoals.length > 0 ? (
                  <>
                    <div className="flex justify-between items-end mb-6 shrink-0 z-20">
                      <span className="text-zinc-600 font-bold uppercase tracking-[0.2em] text-xs">
                        АВТОРЫ ЗАБРОШЕННЫХ ШАЙБ
                      </span>
                      <span className="text-zinc-600 font-black uppercase tracking-widest text-xs">
                        {goalIndex + 1} / {allGoals.length}
                      </span>
                    </div>
                    
                    {/* Контейнер карусели */}
                    <div className="relative flex-1 w-full overflow-hidden">
                      {allGoals.map((goal, idx) => {
                        const isHome = goal.team_id === game.home_team_id;
                        const teamLogo = isHome ? homeLogo : awayLogo;
                        
                        // Логика карусели: активный, предыдущий (уезжает вверх), следующие (ждут внизу)
                        const isActive = idx === goalIndex;
                        const isPrev = idx === (goalIndex - 1 + allGoals.length) % allGoals.length && allGoals.length > 1;
                        
                        let positionClass = 'translate-y-full opacity-0 pointer-events-none';
                        if (isActive) positionClass = 'translate-y-0 opacity-100 z-10';
                        else if (isPrev) positionClass = '-translate-y-full opacity-0 pointer-events-none z-0';

                        let assists = [];
                        if (goal.a1_last_name) assists.push(`${goal.a1_last_name} ${goal.a1_first_name?.[0] || ''}.`.trim());
                        if (goal.a2_last_name) assists.push(`${goal.a2_last_name} ${goal.a2_first_name?.[0] || ''}.`.trim());

                        return (
                          <div 
                            key={goal.id || idx} 
                            // Убрали цветные бордеры
                            className={`absolute inset-0 flex items-center rounded-lg bg-zinc-950 p-6 transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] ${positionClass}`}
                          >
                            {/* Фото игрока */}
                            <div className="relative w-48 h-48 rounded-xxl shrink-0 mr-6">
                               <img 
                                 src={getPlayerPhoto(goal)} 
                                 alt="Player" 
                                 className="w-full h-full rounded-xxl object-cover object-top" 
                                 onError={(e) => { e.target.src = defaultAvatar; }}
                               />
                               <div className="absolute -bottom-3 -right-4 w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center p-2 shadow-lg">
                                  {teamLogo && <img src={teamLogo} alt="team" className="w-full h-full object-contain" onError={(e) => e.target.style.display = 'none'} />}
                               </div>
                            </div>
                            
                            {/* Данные гола */}
                            <div className="flex flex-col flex-1 justify-center min-w-0">
                               <div className="flex items-center gap-3 mb-2">
                                 <div className="bg-zinc-800 px-2 py-0.5 rounded-sm">
                                   <span className="font-mono font-black text-white text-sm">
                                     {formatGoalTime(goal.time_seconds)}
                                   </span>
                                 </div>
                               </div>
                               
                               <span className="text-3xl font-black text-white uppercase tracking-tight leading-none truncate w-full drop-shadow-sm mb-1">
                                 {goal.scorer_last_name}
                               </span>
                               <span className="text-lg font-bold text-zinc-400 uppercase tracking-tight leading-none truncate w-full mb-3">
                                 {goal.scorer_first_name}
                               </span>
                               
                               {assists.length > 0 ? (
                                 <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest truncate w-full border-t border-zinc-800 pt-2">
                                 {assists.join(', ')}
                                 </span>
                               ) : (
                                 <span className="text-zinc-700 text-xs font-bold uppercase tracking-widest italic border-t border-zinc-800 pt-2">
                                 </span>
                               )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  // Состояние "Нет данных"
                  <div className="h-full flex flex-col items-center justify-center opacity-30">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-zinc-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                     </svg>
                     <span className="text-zinc-400 font-black tracking-widest uppercase text-2xl">

                     </span>
                     <span className="text-zinc-500 font-bold uppercase tracking-widest text-xs mt-2 text-center">
                       Заброшенные шайбы отсутствуют
                     </span>
                  </div>
                )}
             </div>

          </div>
        </div>

        {/* ПОДВАЛ */}
        <div className="flex justify-between items-center bg-zinc-800 text-zinc-300 px-12 py-4 w-full relative z-10">
          <div className="flex items-center gap-4 text-left w-[33%]">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
             </svg>
             <span className={`font-bold uppercase tracking-widest text-base ${dateStr ? 'text-zinc-200' : 'text-zinc-500'}`}>
               {displayDate}
             </span>
          </div>
          <div className="text-center w-[33%] px-4">
             <span className={`font-bold uppercase tracking-widest text-base ${game.arena_city ? 'text-zinc-200' : 'text-zinc-500'}`}>
               {cityText}
             </span>
          </div>
          <div className="text-right w-[33%]">
             <span className={`font-bold uppercase tracking-widest text-base ${(game.arena_name || game.location_text) ? 'text-zinc-200' : 'text-zinc-500'}`}>
               {arenaText}
             </span>
          </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}