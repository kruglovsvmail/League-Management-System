import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';

const CATEGORIES = [
  { key: 'points', label: 'ОЧКИ' },
  { key: 'goals', label: 'ГОЛЫ' },
  { key: 'assists', label: 'ПЕРЕДАЧИ' },
  { key: 'plus_minus', label: '+ / -' }
];

export default function TeamLeadersOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'team_leaders';

  const [catIndex, setCatIndex] = useState(0);
  const switchDuration = overlay.data?.switchDuration || 7;

  useEffect(() => {
    if (!isVisible) {
      setCatIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setCatIndex(prev => (prev + 1) % CATEGORIES.length);
    }, switchDuration * 1000);

    return () => clearInterval(interval);
  }, [isVisible, switchDuration]);

  if (!game) return null;

  const divisionLogo = getImageUrl(game.division_logo);
  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);
  const defaultAvatar = getImageUrl('default/user_default.webp');

  const dateObj = game.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
  const cityText = game.arena_city ? game.arena_city.toUpperCase() : 'ГОРОД НЕ УКАЗАН';
  const arenaText = (game.arena_name || game.location_text || 'ЛЕДОВАЯ АРЕНА').toUpperCase();
  const displayDate = dateStr ? dateStr.toUpperCase() : 'ДАТА НЕ УКАЗАНА';

  // Функция поиска лучшего игрока по категории
  const getBestPlayer = (roster, statKey, fallbackLeader) => {
    if (!roster || !Array.isArray(roster) || roster.length === 0) return fallbackLeader;
    
    const sorted = [...roster].sort((a, b) => {
      const valA = parseFloat(a[statKey]) || 0;
      const valB = parseFloat(b[statKey]) || 0;
      return valB - valA;
    });
    
    const best = sorted[0];
    if (best && (parseFloat(best[statKey]) !== 0 || statKey === 'plus_minus')) {
      return best;
    }
    return fallbackLeader || best;
  };

  // Вычисляем лидеров для КАЖДОЙ категории заранее
  const homeLeaders = CATEGORIES.map(cat => getBestPlayer(game.home_roster, cat.key, game.home_leader));
  const awayLeaders = CATEGORIES.map(cat => getBestPlayer(game.away_roster, cat.key, game.away_leader));

  // Рендер карточки игрока для карусели
  const renderPlayerCard = (leader, idx, isHome) => {
    const isActive = idx === catIndex;
    const isPrev = idx === (catIndex - 1 + CATEGORIES.length) % CATEGORIES.length;

    // Анимация: сверху выезжает, вниз заезжает
    let positionClass = '-translate-y-full opacity-0 pointer-events-none z-0'; // Ждет сверху
    if (isActive) {
      positionClass = 'translate-y-0 opacity-100 z-10'; // В центре
    } else if (isPrev) {
      positionClass = 'translate-y-full opacity-0 pointer-events-none z-0'; // Уехал вниз
    }

    const photo = leader ? (getSafeUrl(leader.avatar_url) || defaultAvatar) : defaultAvatar;
    const firstName = leader?.first_name || 'НЕТ ДАННЫХ';
    const lastName = leader?.last_name || '';
    const number = leader?.jersey_number || '00';
    const teamLogo = isHome ? homeLogo : awayLogo;

    return (
      <div 
        key={`player_${isHome ? 'home' : 'away'}_${idx}`} 
        className={`absolute inset-0 flex flex-col items-center justify-center p-8 transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] ${positionClass}`}
      >
         {/* Полупрозрачный номер на фоне */}
         <span className={`absolute top-10 ${isHome ? 'left-10' : 'right-10'} text-[100px] font-black italic text-white/10 leading-none select-none z-0`}>
           #{number}
         </span>

         {/* Фотография игрока */}
         <div className="relative w-56 h-56 mb-6 z-10">
            <img 
              src={photo} 
              alt="Player" 
              className="w-full h-full rounded-[24%] object-cover object-top" 
              onError={(e) => { e.target.src = defaultAvatar; }} 
            />
            {teamLogo && (
               <div className={`absolute -bottom-5 ${isHome ? '-right-5' : '-left-5'} w-16 h-16 bg-zinc-950 rounded-full border border-zinc-800 p-2 shadow-xl flex items-center justify-center`}>
                  <img src={teamLogo} alt="Team" className="w-full h-full object-contain" onError={(e) => e.target.style.display = 'none'} />
               </div>
            )}
         </div>

         {/* Имя и фамилия */}
         <div className="flex flex-col items-center text-center z-10 w-full px-4">
            <span className="text-4xl font-black text-white uppercase tracking-tight leading-none truncate w-full drop-shadow-md mb-2">
               {lastName}
            </span>
            <span className="text-xl font-bold text-zinc-400 uppercase tracking-widest leading-none truncate w-full">
               {firstName}
            </span>
         </div>
      </div>
    );
  };

  return (
    <AnimationWrapper type="team_leaders" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50 p-20">
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
             <span className="font-black uppercase tracking-[0.15em] text-sm text-white">
               ЛИДЕРЫ КОМАНД
             </span>
          </div>
        </div>

        {/* ТЕЛО ПЛАШКИ (3 КОЛОНКИ: Игрок - Статистика - Игрок) */}
        <div className="flex w-full h-[550px] bg-zinc-950 overflow-hidden relative z-0">
          
          {/* ЛЕВАЯ КОЛОНКА: Игрок Хозяев (35%) */}
          <div className="w-[35%] flex flex-col relative overflow-hidden bg-zinc-950 group">
             {/* Крупный логотип на фоне (с сильным затемнением) */}
             {homeLogo && (
               <img src={homeLogo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15 blur-xl scale-[150%] z-0 pointer-events-none" />
             )}
             
             {/* Карусель игроков хозяев */}
             <div className="relative w-full h-full">
               {CATEGORIES.map((cat, idx) => renderPlayerCard(homeLeaders[idx], idx, true))}
             </div>
          </div>

          {/* ЦЕНТРАЛЬНАЯ КОЛОНКА: Динамический список (30%) */}
          <div className="w-[30%] flex flex-col items-center justify-center bg-zinc-900 relative z-10 shadow-[0_0_50px_rgba(0,0,0,0.8)] px-6">
             
             <span className="text-zinc-500/20 font-black uppercase tracking-[0.3em] text-xs mb-8 z-20">
               СРАВНЕНИЕ СТАТИСТИКИ
             </span>

             <div className="relative flex flex-col w-full gap-2 z-10">
                
                {/* Физический скользящий бегунок */}
                <div 
                  className="absolute left-0 right-0 h-[72px] bg-zinc-100/5 shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] z-0 rounded-xl"
                  style={{ transform: `translateY(${catIndex * 80}px)` }} // 72px (высота) + 8px (отступ gap-2) = 80px шаг
                />

                {/* Статический список категорий (значения обновляются под игроков) */}
                {CATEGORIES.map((cat, idx) => {
                  const isActive = idx === catIndex;
                  
                  // Берем статистику АКТИВНЫХ в данный момент игроков для всех строк
                  const currentHLeader = homeLeaders[catIndex];
                  const currentALeader = awayLeaders[catIndex];
                  
                  let hStat = currentHLeader ? currentHLeader[cat.key] : '-';
                  let aStat = currentALeader ? currentALeader[cat.key] : '-';
                  
                  if (cat.key === 'plus_minus') {
                    if (hStat > 0) hStat = `+${hStat}`;
                    if (aStat > 0) aStat = `+${aStat}`;
                  }

                  return (
                    <div 
                      key={cat.key} 
                      className="flex items-center justify-between w-full h-[72px] px-6 relative z-10"
                    >
                       <span className={`w-16 text-center text-3xl font-black tabular-nums transition-colors duration-700 ${isActive ? 'text-white' : 'text-white/30'}`}>
                         {hStat}
                       </span>
                       <span className={`text-xl font-black uppercase tracking-widest transition-colors duration-700 ${isActive ? 'text-white' : 'text-zinc-500'}`}>
                         {cat.label}
                       </span>
                       <span className={`w-16 text-center text-3xl font-black tabular-nums transition-colors duration-700 ${isActive ? 'text-white' : 'text-white/30'}`}>
                         {aStat}
                       </span>
                    </div>
                  );
                })}
             </div>
          </div>

          {/* ПРАВАЯ КОЛОНКА: Игрок Гостей (35%) */}
          <div className="w-[35%] flex flex-col relative overflow-hidden bg-zinc-950 group">
             {/* Крупный логотип на фоне (с сильным затемнением) */}
             {awayLogo && (
               <img src={awayLogo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15 blur-xl scale-[150%] z-0 pointer-events-none" />
             )}

             {/* Карусель игроков гостей */}
             <div className="relative w-full h-full">
               {CATEGORIES.map((cat, idx) => renderPlayerCard(awayLeaders[idx], idx, false))}
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