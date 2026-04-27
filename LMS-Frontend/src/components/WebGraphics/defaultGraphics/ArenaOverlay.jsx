import React from 'react';
import { AnimationWrapper } from './AnimationWrapper';

export default function ArenaOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'arena';

  if (!game) return null;

  return (
    <AnimationWrapper
      type="arena"
      isVisible={isVisible}
      className="absolute bottom-16 left-12 z-40 drop-shadow-2xl"
    >
      {/* Главный контейнер со скосом (parallelogram) */}
      <div className="flex items-stretch bg-zinc-950 skew-x-[-10deg] overflow-hidden rounded-lg">
        
        {/* Пробегающий блик */}
        <div className="absolute top-0 bottom-0 w-[300%] bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-30deg] animate-glare pointer-events-none z-50"></div>
        
        {/* Иконка (компенсация скоса для контента) */}
        <div className="flex items-center justify-center bg-zinc-800 px-8 relative z-10 skew-x-[0deg]">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
           </svg>
        </div>

        {/* Текст (компенсация скоса) */}
        <div className="flex flex-col justify-center px-10 py-5 z-10 min-w-[350px] skew-x-[10deg]">
          <span className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-1.5">
            МЕСТО ПРОВЕДЕНИЯ
          </span>
          <span className="text-3xl font-black text-white uppercase tracking-widest leading-none mb-2 drop-shadow-md">
            {game.arena_name || game.location_text || 'ЛЕДОВАЯ АРЕНА'}
          </span>
          <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest">
            {game.arena_city ? `Г. ${game.arena_city.toUpperCase()}` : ''} {game.arena_address ? `• ${game.arena_address.toUpperCase()}` : ''}
          </span>
        </div>
      </div>
    </AnimationWrapper>
  );
}