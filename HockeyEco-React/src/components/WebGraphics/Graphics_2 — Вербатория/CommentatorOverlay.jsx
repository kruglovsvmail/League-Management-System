import React, { useState, useEffect } from 'react';
import { AnimationWrapper } from './AnimationWrapper';

export default function CommentatorOverlay({ game, overlay }) {
  const isGlobalVisible = overlay.visible && overlay.type === 'commentator';
  const [localVisible, setLocalVisible] = useState(false);

  useEffect(() => {
    let timer;
    if (isGlobalVisible) {
      setLocalVisible(true);
      timer = setTimeout(() => setLocalVisible(false), (overlay.data?.displayDuration || 10) * 1000);
    } else setLocalVisible(false);
    return () => clearTimeout(timer);
  }, [isGlobalVisible, overlay.data]);

  if (!game || !game.officials?.media) return null;

  return (
    <AnimationWrapper type="commentator" isVisible={localVisible} className="absolute bottom-12 left-12 z-40">
      <div className="flex items-stretch bg-white rounded-full shadow-[0_8px_30px_rgba(255,93,24,0.15)] border border-gray-100 overflow-hidden h-[80px] pr-8">
        
        {/* Иконка (Фирменный Оранжевый) */}
        <div className="w-[80px] bg-verba-orange flex items-center justify-center shrink-0">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
           </svg>
        </div>

        <div className="flex flex-col justify-center px-6 min-w-[300px]">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 font-verba-lato">
            Комментатор матча
          </span>
          <span className="text-2xl font-black text-gray-800 uppercase tracking-tight leading-none font-verba-lato">
            {game.officials.media.first_name} {game.officials.media.last_name}
          </span>
        </div>

      </div>
    </AnimationWrapper>
  );
}