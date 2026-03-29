import React from 'react';
import { AnimationWrapper } from './AnimationWrapper';

export default function ArenaOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'arena';

  if (!game) return null;

  return (
    <AnimationWrapper
      type="event"
      isVisible={isVisible}
      className="absolute bottom-16 left-16 z-40"
    >
      <div className="flex items-stretch bg-white shadow-xl border border-mts-grey-light/30 overflow-hidden h-[100px]">
        
        {/* Фирменный красный блок с иконкой пина */}
        <div className="flex items-center justify-center w-[100px] bg-mts-red shrink-0">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
             <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
           </svg>
        </div>

        {/* Информационный блок */}
        <div className="flex flex-col justify-center px-10 min-w-[400px]">
          <span className="text-[10px] font-bold text-mts-grey-dark uppercase tracking-widest mb-1">
            МЕСТО ПРОВЕДЕНИЯ
          </span>
          <span className="text-3xl font-black text-mts-black uppercase tracking-tight leading-none mb-1.5">
            {game.arena_name || game.location_text || 'ЛЕДОВАЯ АРЕНА'}
          </span>
          <span className="text-sm font-bold text-mts-black uppercase tracking-widest">
            {game.arena_city ? `Г. ${game.arena_city}` : ''} {game.arena_address ? `• ${game.arena_address}` : ''}
          </span>
        </div>

      </div>
    </AnimationWrapper>
  );
}