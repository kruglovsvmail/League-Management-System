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
      type="referees"
      isVisible={localVisible}
      className="absolute bottom-16 left-12 z-40 drop-shadow-2xl"
    >
      {/* Главный контейнер со скосом */}
      <div className="flex items-stretch bg-zinc-950 skew-x-[-10deg] overflow-hidden rounded-lg">
        
        {/* Пробегающий блик */}
        <div className="absolute top-0 bottom-0 w-[50%] bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-30deg] animate-glare pointer-events-none z-50"></div>
        
        {/* Иконка (компенсация скоса) */}
        <div className="flex items-center justify-center bg-zinc-800 px-8 relative z-10 skew-x-[0deg] mr-4">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
           </svg>
        </div>

        {/* Текст: Двухколончатая таблица (компенсация скоса) */}
        <div className="flex gap-16 px-12 py-6 z-10 bg-zinc-950 skew-x-[10deg]">
          {heads.length > 0 && (
            <div className="flex flex-col">
              <span className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-4 border-b border-zinc-800 pb-2">ГЛАВНЫЕ СУДЬИ</span>
              {heads.map((h, i) => (
                <span key={i} className="text-2xl font-black text-white uppercase tracking-widest leading-none drop-shadow-md mb-2 last:mb-0">
                  {h.first_name} {h.last_name}
                </span>
              ))}
            </div>
          )}
          
          {linesmen.length > 0 && (
            <div className="flex flex-col">
              <span className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-4 border-b border-zinc-800 pb-2">ЛИНЕЙНЫЕ СУДЬИ</span>
              {linesmen.map((l, i) => (
                <span key={i} className="text-2xl font-black text-white uppercase tracking-widest leading-none drop-shadow-md mb-2 last:mb-0">
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