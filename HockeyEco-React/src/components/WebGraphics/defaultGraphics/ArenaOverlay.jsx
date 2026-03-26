import React from 'react';
import { AnimationWrapper } from './AnimationWrapper';

export default function ArenaOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'arena';

  if (!game) return null;

  return (
    <AnimationWrapper
      type="arena"
      isVisible={isVisible}
      className="absolute bottom-24 left-10 z-40"
    >
      <div className="flex items-stretch bg-[#000000ff]/[98%] backdrop-blur-md rounded-xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden">
        
        <div className="flex items-center justify-center bg-white/5 border-r border-white/10 px-6 relative overflow-hidden">
           <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500"></div>
           <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
           </svg>
        </div>

        <div className="flex flex-col justify-center px-6 py-4">
          <span className="text-[11px] font-bold text-white/50 uppercase tracking-[0.2em] mb-1">
            Место проведения матча
          </span>
          <span className="text-3xl font-black text-white tracking-wide leading-none mb-1.5 drop-shadow-md">
            {game.arena_name || game.location_text || 'Ледовая арена'}
          </span>
          <span className="text-[13px] font-semibold text-white/70 tracking-wider">
            {game.arena_city ? `г. ${game.arena_city}` : ''} {game.arena_address ? `• ${game.arena_address}` : ''}
          </span>
        </div>
      </div>
    </AnimationWrapper>
  );
}