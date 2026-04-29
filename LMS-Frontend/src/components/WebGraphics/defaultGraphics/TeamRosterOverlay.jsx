import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function TeamRosterOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'team_roster';
  
  const [activeTeam, setActiveTeam] = useState('home');
  const [isAnimating, setIsAnimating] = useState(false);

  // Извлекаем переданное время (в секундах) из панели управления
  const switchDuration = overlay.data?.switchDuration || 10;

  useEffect(() => {
    if (!isVisible) {
      setActiveTeam('home');
      setIsAnimating(false);
      return;
    }

    const interval = setInterval(() => {
      setIsAnimating(true);
      
      // Через 500мс (когда кончится CSS fade-анимация) переключаем команду и возвращаем видимость
      setTimeout(() => {
        setActiveTeam(prev => prev === 'home' ? 'away' : 'home');
        setIsAnimating(false);
      }, 500);
      
    }, switchDuration * 1000);

    return () => clearInterval(interval);
  }, [isVisible, switchDuration]);

  if (!game) return null;

  // Данные для шапки
  const divisionLogo = getImageUrl(game.division_logo);

  // Определение текущей отображаемой команды
  const isHome = activeTeam === 'home';
  const currentTeamName = isHome ? game.home_team_name : game.away_team_name;
  const currentTeamLogo = isHome ? getImageUrl(game.home_team_logo) : getImageUrl(game.away_team_logo);
  const currentRoster = isHome ? (game.home_roster || []) : (game.away_roster || []);
  const currentCoach = isHome ? game.home_coach : game.away_coach;

  // Точная фильтрация из БД
  const goalies = currentRoster.filter(p => p.position_in_line === 'G');
  const defense = currentRoster.filter(p => p.position_in_line === 'LD' || p.position_in_line === 'RD');
  const forwards = currentRoster.filter(p => p.position_in_line === 'LW' || p.position_in_line === 'C' || p.position_in_line === 'RW');

  // Компонент строки игрока
  const PlayerRow = ({ player }) => {
    const isCaptain = player.is_captain === true || player.is_captain === 'true';
    const isAssistant = player.is_assistant === true || player.is_assistant === 'true';

    return (
      <div className="flex items-center gap-4 py-2 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/50 transition-colors">
         <span className="w-8 text-right font-mono font-black text-zinc-500 text-xl tracking-tighter shrink-0">
           {player.jersey_number || '00'}
         </span>
         <div className="flex items-baseline gap-2 truncate flex-1">
            <span className="font-black text-white text-xl uppercase tracking-wide truncate">
              {player.last_name}
            </span>
            <span className="font-bold text-zinc-400 text-sm uppercase tracking-widest truncate">
              {player.first_name}
            </span>
         </div>
         {/* Статус Капитана / Ассистента */}
         {isCaptain && (
           <div className="border border-orange px-1.5 rounded-sm shrink-0 shadow-sm">
             <span className="text-orange font-black text-[18px] uppercase leading-none">K</span>
           </div>
         )}
         {isAssistant && (
           <div className="border border-status-accepted px-1.5 rounded-sm shrink-0 shadow-sm">
             <span className="text-status-accepted font-black text-[18px] leading-none">A</span>
           </div>
         )}
      </div>
    );
  };

  return (
    <AnimationWrapper type="team_roster" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50 p-20">
      <div className="flex flex-col items-center w-full max-w-[1500px] relative overflow-hidden rounded-lg shadow-2xl transform-gpu">
        
        {/* ГЛОБАЛЬНЫЙ БЛИК */}
        <div className="absolute top-0 bottom-0 w-[80%] bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-30deg] animate-glare pointer-events-none z-50"></div>

        {/* ШАПКА */}
        <div className="flex justify-between items-center bg-zinc-800 text-zinc-300 px-8 py-3 w-full relative z-10 shrink-0">
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
               СОСТАВ КОМАНДЫ
             </span>
          </div>
        </div>

        {/* ТЕЛО ПЛАШКИ (Увеличена высота до 720px для компенсации убранного подвала) */}
        <div className="flex w-full h-[830px] bg-zinc-950 overflow-hidden relative z-0">
          
          {/* ЛЕВАЯ КОЛОНКА: Логотип, Название, Тренер (35%) */}
          <div className="w-[35%] flex flex-col items-center justify-center relative bg-zinc-950 px-10 py-12 z-10">
             
             {/* Фоновый размытый логотип */}
             <div className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
               {currentTeamLogo && (
                 <img src={currentTeamLogo} alt="" className="w-full h-full object-cover opacity-10 blur-xl scale-150 z-0 pointer-events-none" />
               )}
             </div>

             <div className={`flex flex-col items-center w-full z-10 transition-all duration-500 transform ${isAnimating ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}>
                {currentTeamLogo && (
                  <img src={currentTeamLogo} alt="Team Logo" className="w-64 h-64 object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)] mb-8" onError={(e) => e.target.style.display = 'none'} />
                )}
                
                <span className="text-5xl font-black text-white text-center uppercase tracking-tighter leading-none drop-shadow-md w-full">
                  {currentTeamName}
                </span>

                {/* Главный тренер */}
                {currentCoach && (
                  <div className="mt-12 bg-zinc-900 border-l-4 border-blue-600 p-5 shadow-xl w-full text-left">
                     <span className="text-zinc-500 font-bold uppercase tracking-[0.2em] text-xs block mb-2">
                       ГЛАВНЫЙ ТРЕНЕР
                     </span>
                     <span className="font-black text-white text-2xl uppercase tracking-wide block truncate">
                       {currentCoach.last_name}
                     </span>
                     <span className="font-bold text-zinc-400 text-base uppercase tracking-widest block truncate">
                       {currentCoach.first_name}
                     </span>
                  </div>
                )}
             </div>
          </div>

          {/* ПРАВАЯ КОЛОНКА: 2 списка игроков (65%) */}
          <div className="w-[65%] flex bg-zinc-900 relative z-10 overflow-hidden">
             
             <div className={`flex w-full h-full transition-all duration-500 transform ${isAnimating ? 'translate-x-12 opacity-0' : 'translate-x-0 opacity-100'}`}>
                
                {/* ВНУТРЕННЯЯ ЛЕВАЯ (Вратари и Защитники) */}
                <div className="w-1/2 flex flex-col px-10 py-8 border-r-2 border-zinc-800">
                   
                   {/* Вратари */}
                   <div className="flex flex-col shrink-0 mb-8">
                      <span className="text-zinc-500 font-black uppercase tracking-[0.3em] text-xs mb-4 border-b border-zinc-800 pb-2">
                        ВРАТАРИ
                      </span>
                      <div className="flex flex-col">
                         {goalies.map(p => <PlayerRow key={p.id || `${p.jersey_number}_${p.last_name}`} player={p} />)}
                      </div>
                   </div>

                   {/* Защитники */}
                   <div className="flex flex-col flex-1 overflow-hidden">
                      <span className="text-zinc-500 font-black uppercase tracking-[0.3em] text-xs mb-4 border-b border-zinc-800 pb-2 shrink-0">
                        ЗАЩИТНИКИ
                      </span>
                      <div className="flex flex-col overflow-y-auto custom-scrollbar pr-2 h-full">
                         {defense.map(p => <PlayerRow key={p.id || `${p.jersey_number}_${p.last_name}`} player={p} />)}
                      </div>
                   </div>

                </div>

                {/* ВНУТРЕННЯЯ ПРАВАЯ (Нападающие) */}
                <div className="w-1/2 flex flex-col px-10 py-8">
                   <div className="flex flex-col flex-1 overflow-hidden">
                      <span className="text-zinc-500 font-black uppercase tracking-[0.3em] text-xs mb-4 border-b border-zinc-800 pb-2 shrink-0">
                        НАПАДАЮЩИЕ
                      </span>
                      <div className="flex flex-col overflow-y-auto custom-scrollbar pr-2 h-full">
                         {forwards.map(p => <PlayerRow key={p.id || `${p.jersey_number}_${p.last_name}`} player={p} />)}
                      </div>
                   </div>
                </div>

             </div>

             {/* Заглушка, если пустой ростер */}
             {currentRoster.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-zinc-900/90 backdrop-blur-sm">
                   <span className="text-zinc-600 font-black italic uppercase text-3xl">Состав не заполнен</span>
                </div>
             )}
          </div>

        </div>

        {/* Подвал удален для увеличения места под контент */}

      </div>
    </AnimationWrapper>
  );
}