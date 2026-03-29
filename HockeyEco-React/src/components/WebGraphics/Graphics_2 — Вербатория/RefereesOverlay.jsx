import React, { useState, useEffect } from 'react';
import { AnimationWrapper } from './AnimationWrapper';

export default function RefereesOverlay({ game, overlay }) {
  const isGlobalVisible = overlay.visible && overlay.type === 'referees';
  const [localVisible, setLocalVisible] = useState(false);

  useEffect(() => {
    let timer;
    if (isGlobalVisible) {
      setLocalVisible(true);
      timer = setTimeout(() => setLocalVisible(false), (overlay.data?.displayDuration || 10) * 1000);
    } else setLocalVisible(false);
    return () => clearTimeout(timer);
  }, [isGlobalVisible, overlay.data]);

  if (!game || !game.officials) return null;
  const heads = [game.officials.head_1, game.officials.head_2].filter(Boolean);
  const linesmen = [game.officials.linesman_1, game.officials.linesman_2].filter(Boolean);

  if (heads.length === 0 && linesmen.length === 0) return null;

  return (
    <AnimationWrapper type="event" isVisible={localVisible} className="absolute bottom-12 left-12 z-40">
      <div className="flex items-stretch bg-white rounded-[40px] shadow-[0_8px_30px_rgba(46,140,82,0.15)] border border-gray-100 overflow-hidden min-h-[80px] pr-8">
        
        {/* Иконка (Фирменный Желтый) */}
        <div className="w-[80px] bg-verba-yellow flex items-center justify-center shrink-0">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
           </svg>
        </div>

        <div className="flex gap-10 px-8 py-4 items-center">
          {heads.length > 0 && (
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-verba-green-main uppercase tracking-widest mb-1 font-verba">Главные судьи</span>
              {heads.map((h, i) => (
                <span key={i} className="text-lg font-black text-gray-800 uppercase leading-tight font-verba-lato">
                  {h.first_name} {h.last_name}
                </span>
              ))}
            </div>
          )}

          {linesmen.length > 0 && (
            <div className="flex flex-col border-l border-gray-200 pl-10">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 font-verba">Линейные судьи</span>
              {linesmen.map((l, i) => (
                <span key={i} className="text-lg font-bold text-gray-600 uppercase leading-tight font-verba-lato">
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