import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function PreMatchOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'prematch';
  const [timeLeft, setTimeLeft] = useState(0);

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

  if (!game) return null;

  const formatCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sc = ('0' + (s % 60)).slice(-2);
    return `${m}:${sc}`;
  };

  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);
  const divisionLogo = getImageUrl(game.division_logo);

  const dateObj = game.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  // Подготовка данных для подвала
  const cityText = game.arena_city ? game.arena_city.toUpperCase() : 'ГОРОД НЕ УКАЗАН';
  const arenaText = (game.arena_name || game.location_text || 'ЛЕДОВАЯ АРЕНА').toUpperCase();
  const displayDate = dateStr ? dateStr.toUpperCase() : 'ДАТА НЕ УКАЗАНА';

  // Определяем стадию и номер матча
  const isPlayoff = game.stage_type === 'playoff';
  const stageLabel = game.stage_label ? game.stage_label.toUpperCase() : (isPlayoff ? 'РАУНД' : 'ПЕРИОД');
  const matchNumberText = isPlayoff 
    ? `МАТЧ № ${game.series_number || 1}` 
    : `ТУР: ${game.series_number || 1}`;

  return (
    <AnimationWrapper
      type="prematch"
      isVisible={isVisible}
      className="absolute inset-0 flex items-center justify-center z-50 p-20"
    >
      {/* ГЛАВНЫЙ КОНТЕЙНЕР ПЛАШКИ (Общий для всего эффект блика) */}
      <div className="flex flex-col items-center w-full max-w-[1500px] relative overflow-hidden rounded-xxl shadow-2xl transform-gpu">
        
        {/* ГЛОБАЛЬНЫЙ БЛИК ПО ВСЕЙ ПЛАШКЕ - Наложен поверх всех секций для полного покрытия */}
        <div className="absolute top-0 bottom-0 w-[80%] bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-30deg] animate-glare pointer-events-none z-50"></div>

        {/* Верхняя лента: Турнирная информация (Фон как у подвала) */}
        <div className="flex justify-between items-center bg-zinc-800 text-zinc-300 px-8 py-3 w-full relative z-10">
          {/* Левая часть шапки */}
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
          
          {/* Правая часть шапки */}
          <div className="flex flex-col text-right">
             <span className="font-bold uppercase tracking-[0.2em] text-sm leading-tight text-zinc-400">
               {stageLabel}
             </span>
             <span className="font-black uppercase tracking-[0.15em] text-xs text-white">
               {matchNumberText}
             </span>
          </div>
        </div>

        {/* Центральный блок: Команды и Таймер (Единый фон без лишних рамок) */}
        <div className="flex w-full h-[550px] bg-zinc-950 overflow-hidden relative z-0">
          
          {/* Блок Хозяев */}
          <div className="w-[40%] flex items-center justify-center relative group">
             {/* Крупный логотип на фоне (с сильным затемнением) */}
             {homeLogo && (
               <img src={homeLogo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 blur-xl scale-[150%] z-0 pointer-events-none" />
             )}
             
             {/* Основной контент */}
             <div className="flex flex-col items-center z-10 p-10 w-full text-center">
               {homeLogo && (
                 <img src={homeLogo} alt="Home" className="w-64 h-64 object-contain drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)] mb-10" onError={(e) => e.target.style.display = 'none'} />
               )}
               <div className="w-full flex justify-center px-4">
                 <span className="text-5xl font-black text-white uppercase tracking-tighter leading-none w-full line-clamp-2 drop-shadow-sm">
                   {game.home_team_name}
                 </span>
               </div>
             </div>
          </div>

          {/* Центральный блок: Время (Чистый единый фон bg-zinc-950) */}
          <div className="w-[20%] flex items-center justify-center relative">
             <div className="flex flex-col items-center justify-center bg-zinc-950 w-full h-full p-6 z-10 overflow-hidden relative">
                {/* Индивидуальный блик на таймере убран для использования глобального блика */}

                <span className="text-zinc-500 font-black uppercase tracking-[0.3em] text-xs mb-3 z-10">
                  До начала
                </span>
                <span className={`font-mono text-7xl font-black tabular-nums tracking-tighter leading-none transition-colors z-10 ${timeLeft <= 60 && !overlay.data?.isPaused ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                  {formatCountdown(timeLeft)}
                </span>
                <div className="mt-8 text-3xl font-black text-zinc-700 italic leading-none z-10 select-none">
                </div>
             </div>
          </div>

          {/* Блок Гостей */}
          <div className="w-[40%] flex items-center justify-center relative">
             {/* Крупный логотип на фоне (с сильным затемнением) */}
             {awayLogo && (
               <img src={awayLogo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 blur-xl scale-[150%] z-0 pointer-events-none" />
             )}
             
             {/* Основной контент */}
             <div className="flex flex-col items-center z-10 p-10 w-full text-center">
               {awayLogo && (
                 <img src={awayLogo} alt="Away" className="w-64 h-64 object-contain drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)] mb-10" onError={(e) => e.target.style.display = 'none'} />
               )}
               <div className="w-full flex justify-center px-4">
                 <span className="text-5xl font-black text-white uppercase tracking-tighter leading-none w-full line-clamp-2 drop-shadow-sm">
                   {game.away_team_name}
                 </span>
               </div>
             </div>
          </div>

        </div>

        {/* Нижняя лента: Место проведения (3-колончатая верстка) */}
        <div className="flex justify-between items-center bg-zinc-800 text-zinc-300 px-12 py-4 w-full relative z-10">
          
          {/* Слева: Дата с иконкой */}
          <div className="flex items-center gap-4 text-left w-[33%]">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
             </svg>
             <span className={`font-bold uppercase tracking-widest text-base ${dateStr ? 'text-zinc-200' : 'text-zinc-500'}`}>
               {displayDate}
             </span>
          </div>

          {/* По центру: Город */}
          <div className="text-center w-[33%] px-4">
             <span className={`font-bold uppercase tracking-widest text-base ${game.arena_city ? 'text-zinc-200' : 'text-zinc-500'}`}>
               {cityText}
             </span>
          </div>

          {/* Справа: Арена */}
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