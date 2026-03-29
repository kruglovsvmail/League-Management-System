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
      type="event"
      isVisible={localVisible}
      className="absolute bottom-16 left-16 z-40"
    >
      <div className="flex items-stretch bg-white shadow-xl border border-mts-grey-light/30 overflow-hidden min-h-[100px]">
        
        {/* Иконка (Фирменный Черный для судей) */}
        <div className="w-[100px] bg-mts-black flex items-center justify-center shrink-0">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
           </svg>
        </div>

        <div className="flex gap-16 px-10 py-5">
          {heads.length > 0 && (
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-mts-red uppercase tracking-widest mb-2">
                ГЛАВНЫЕ АРБИТРЫ
              </span>
              {heads.map((h, i) => (
                <span key={i} className="text-xl font-black text-mts-black uppercase tracking-wide leading-tight mb-1 last:mb-0">
                  {h.first_name} {h.last_name}
                </span>
              ))}
            </div>
          )}
          
          {linesmen.length > 0 && (
            <div className="flex flex-col border-l border-mts-grey-light/30 pl-16">
              <span className="text-[10px] font-bold text-mts-grey-dark uppercase tracking-widest mb-2">
                ЛИНЕЙНЫЕ СУДЬИ
              </span>
              {linesmen.map((l, i) => (
                <span key={i} className="text-xl font-black text-mts-black uppercase tracking-wide leading-tight mb-1 last:mb-0">
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