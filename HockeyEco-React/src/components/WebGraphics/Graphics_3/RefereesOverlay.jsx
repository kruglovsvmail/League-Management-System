import React, { useState, useEffect } from 'react';
import { AnimationWrapper } from './AnimationWrapper';

export default function RefereesOverlay({ game, overlay }) {
  const isGlobalVisible = overlay.visible && overlay.type === 'referees';
  const [localVisible, setLocalVisible] = useState(false);
  const displayDuration = overlay.data?.displayDuration || 10;

  useEffect(() => {
    let timer;
    if (isGlobalVisible) {
      setLocalVisible(true);
      timer = setTimeout(() => {
        setLocalVisible(false);
      }, displayDuration * 1000);
    } else {
      setLocalVisible(false);
    }
    return () => clearTimeout(timer);
  }, [isGlobalVisible, displayDuration, overlay.data]);

  if (!game || !game.officials) return null;

  const heads = [game.officials.head_1, game.officials.head_2].filter(Boolean);
  const linesmen = [game.officials.linesman_1, game.officials.linesman_2].filter(Boolean);

  if (heads.length === 0 && linesmen.length === 0) return null;

  return (
    <AnimationWrapper
      type="geometric_unfold"
      isVisible={localVisible}
      className="absolute bottom-24 left-10 z-40"
    >
      <div className="flex items-stretch bg-[#051125]/90 backdrop-blur-[15px] border border-[#1A3A6D] shadow-[0_20px_40px_rgba(0,0,0,0.8)] overflow-hidden" style={{ transform: 'skewX(-10deg)' }}>
        
        <div className="flex items-center justify-center bg-[#0A1D37] border-r border-[#1A3A6D] px-6 relative overflow-hidden">
           <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#A0BCE0] shadow-[0_0_15px_#A0BCE0]"></div>
           <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(160,188,224,0.05)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
           
           <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#A0BCE0] relative z-10" style={{ transform: 'skewX(10deg)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
           </svg>
        </div>

        <div className="flex gap-12 px-8 py-4 relative" style={{ transform: 'skewX(10deg)' }}>
          {heads.length > 0 && (
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-[#A0BCE0] uppercase tracking-[0.3em] mb-2">ГЛАВНЫЕ АРБИТРЫ</span>
              {heads.map((h, i) => (
                <span key={i} className="text-xl font-black text-white tracking-widest leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-sans mb-1 last:mb-0">
                  {h.first_name} {h.last_name}
                </span>
              ))}
            </div>
          )}
          
          {linesmen.length > 0 && (
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-[#A0BCE0] uppercase tracking-[0.3em] mb-2">ЛИНЕЙНЫЕ СУДЬИ</span>
              {linesmen.map((l, i) => (
                <span key={i} className="text-xl font-black text-white tracking-widest leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-sans mb-1 last:mb-0">
                  {l.first_name} {l.last_name}
                </span>
              ))}
            </div>
          )}
        </div>

      </div>
    </AnimationWrapper>
  );
}