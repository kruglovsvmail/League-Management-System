import React from 'react';
import { AnimationWrapper } from './AnimationWrapper';

export default function ArenaOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'arena';

  if (!game) return null;

  return (
    <AnimationWrapper
      type="geometric_unfold"
      isVisible={isVisible}
      className="absolute bottom-24 left-10 z-40"
    >
      <div className="flex items-stretch bg-[#051125]/90 backdrop-blur-[15px] border border-[#1A3A6D] shadow-[0_20px_40px_rgba(0,0,0,0.8)] overflow-hidden min-w-[350px]" style={{ transform: 'skewX(-10deg)' }}>
        
        <div className="flex items-center justify-center bg-[#0A1D37] border-r border-[#1A3A6D] px-6 relative overflow-hidden">
           {/* Неоновый индикатор */}
           <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#00E5FF] shadow-[0_0_15px_#00E5FF]"></div>
           <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,229,255,0.05)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
           
           <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#00E5FF] relative z-10" style={{ transform: 'skewX(10deg)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
           </svg>
        </div>

        <div className="flex flex-col justify-center px-6 py-4 relative" style={{ transform: 'skewX(10deg)' }}>
          <span className="text-[10px] font-bold text-[#A0BCE0] uppercase tracking-[0.3em] mb-1">
            ЛОКАЦИЯ
          </span>
          <span className="text-2xl font-black text-white tracking-widest leading-none mb-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-sans">
            {game.arena_name || game.location_text || 'ЛЕДОВАЯ АРЕНА'}
          </span>
          <span className="text-[12px] font-bold text-[#A0BCE0]/80 tracking-[0.2em] uppercase">
            {game.arena_city ? `Г. ${game.arena_city}` : ''} {game.arena_address ? `• ${game.arena_address}` : ''}
          </span>
        </div>
      </div>
    </AnimationWrapper>
  );
}