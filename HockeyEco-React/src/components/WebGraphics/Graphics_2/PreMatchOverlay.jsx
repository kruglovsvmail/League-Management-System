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

  const leagueLogo = getImageUrl(game.league_logo);
  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);

  const dateObj = game.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  const isPlayoff = game.stage_type === 'playoff';
  const tournamentType = isPlayoff ? 'ПЛЕЙ-ОФФ' : 'РЕГУЛЯРНЫЙ ЧЕМПИОНАТ';
  const stageLabel = game.stage_label ? game.stage_label.toUpperCase() : (isPlayoff ? 'РАУНД' : 'ТУР');

  const cityText = game.arena_city ? `${game.arena_city}` : '';
  const arenaText = game.arena_name || game.location_text || 'Арена';
  const fullLocation = [cityText, arenaText].filter(Boolean).join(' • ');

  return (
    <AnimationWrapper
      type="prematch"
      isVisible={isVisible}
      className="absolute inset-0 flex items-center justify-center z-50 bg-white"
    >
      <div className="flex w-full h-full">
        
        {/* ЛЕВАЯ ЧАСТЬ (Логотипы и Команды) */}
        <div className="flex-1 flex flex-col justify-center items-center px-20">
          
          <div className="w-full flex items-center justify-between">
             {/* ХОЗЯЕВА */}
             <div className="flex flex-col items-center w-[400px]">
               {homeLogo && <img src={homeLogo} alt="Home" className="w-[280px] h-[280px] object-contain mb-8" />}
               <span className="text-mts-black text-4xl font-bold uppercase text-center tracking-wide">
                 {game.home_team_name}
               </span>
             </div>

             {/* РАЗДЕЛИТЕЛЬ VS */}
             <div className="flex flex-col items-center">
                <div className="w-px h-32 bg-mts-grey-light mb-6"></div>
                <span className="text-mts-grey-dark text-2xl font-bold uppercase tracking-widest">VS</span>
                <div className="w-px h-32 bg-mts-grey-light mt-6"></div>
             </div>

             {/* ГОСТИ */}
             <div className="flex flex-col items-center w-[400px]">
               {awayLogo && <img src={awayLogo} alt="Away" className="w-[280px] h-[280px] object-contain mb-8" />}
               <span className="text-mts-black text-4xl font-bold uppercase text-center tracking-wide">
                 {game.away_team_name}
               </span>
             </div>
          </div>
        </div>

        {/* ПРАВАЯ ЧАСТЬ (Информация и Таймер, строгий красный блок) */}
        <div className="w-[450px] bg-mts-red flex flex-col justify-between text-white px-16 py-20 shrink-0">
            
            {/* Лого лиги */}
            <div className="flex items-center gap-4 mb-16">
              {leagueLogo && <img src={leagueLogo} alt="League" className="h-16 object-contain filter brightness-0 invert" />}
              <div className="flex flex-col">
                <span className="font-bold tracking-widest uppercase text-sm">{game.league_name}</span>
                <span className="text-white/80 text-xs tracking-widest uppercase">{game.division_name}</span>
              </div>
            </div>

            {/* Детали матча */}
            <div className="flex flex-col gap-6 flex-1 justify-center border-y border-white/30 py-10 my-10">
               <div>
                 <span className="text-white/70 text-xs font-semibold tracking-widest uppercase block mb-1">Стадия</span>
                 <span className="text-3xl font-bold uppercase leading-tight tracking-wide block">{tournamentType}</span>
                 <span className="text-xl font-semibold mt-1 block">{stageLabel}</span>
               </div>
               
               <div>
                 <span className="text-white/70 text-xs font-semibold tracking-widest uppercase block mb-1">Дата и Место</span>
                 <span className="text-xl font-semibold block">{dateStr}</span>
                 <span className="text-lg block mt-1">{fullLocation}</span>
               </div>
            </div>

            {/* Таймер */}
            <div className="flex flex-col">
              <span className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-2">Начало трансляции через</span>
              <span className="text-7xl font-bold tabular-nums tracking-tighter">
                {formatCountdown(timeLeft)}
              </span>
            </div>
            
        </div>

      </div>
    </AnimationWrapper>
  );
}