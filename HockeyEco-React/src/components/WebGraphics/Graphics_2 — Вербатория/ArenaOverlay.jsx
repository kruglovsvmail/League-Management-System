import React from 'react';
import { AnimationWrapper } from './AnimationWrapper';

export default function ArenaOverlay({ game, overlay }) {
  if (!game) return null;
  
  return (
    <AnimationWrapper type="arena" isVisible={overlay.visible && overlay.type === 'arena'} className="absolute bottom-12 left-12 z-40">
      <div className="flex items-stretch bg-white rounded-full shadow-[0_8px_30px_rgba(46,140,82,0.15)] border border-gray-100 overflow-hidden h-[80px] pr-8">
        
        {/* Иконка (Фирменный Зеленый Вербатории) */}
        <div className="flex items-center justify-center w-[80px] bg-verba-green-main shrink-0">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
           </svg>
        </div>

        <div className="flex flex-col justify-center px-6 min-w-[300px]">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 font-verba-lato">
            Место проведения
          </span>
          <span className="text-2xl font-black text-gray-800 uppercase tracking-tight leading-none mb-1 font-verba-lato">
            {game.arena_name || game.location_text || 'Ледовая арена'}
          </span>
          <span className="text-xs font-bold text-verba-green-light uppercase tracking-widest font-verba">
            {game.arena_city ? `г. ${game.arena_city}` : ''} {game.arena_address ? `• ${game.arena_address}` : ''}
          </span>
        </div>

      </div>
    </AnimationWrapper>
  );
}