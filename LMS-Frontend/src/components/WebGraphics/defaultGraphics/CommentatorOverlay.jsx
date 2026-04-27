import React, { useState, useEffect } from 'react';
import { AnimationWrapper } from './AnimationWrapper';

export default function CommentatorOverlay({ game, overlay }) {
  const isGlobalVisible = overlay.visible && overlay.type === 'commentator';
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

  if (!game || !game.officials?.media) return null;

  const media = game.officials.media;

  return (
    <AnimationWrapper
      type="commentator"
      isVisible={localVisible}
      className="absolute bottom-16 left-12 z-40 drop-shadow-2xl"
    >
      {/* Главный контейнер со скосом */}
      <div className="flex items-stretch bg-zinc-950 skew-x-[-10deg] overflow-hidden rounded-lg">
        
        {/* Пробегающий блик */}
        <div className="absolute top-0 bottom-0 w-[300%] bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-30deg] animate-glare pointer-events-none z-50"></div>
        
        {/* Иконка (компенсация скоса) */}
        <div className="flex items-center justify-center bg-zinc-800 px-8 relative z-10 skew-x-[0deg]">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
           </svg>
        </div>

        {/* Текст (компенсация скоса) */}
        <div className="flex flex-col justify-center px-10 py-5 z-10 min-w-[350px] skew-x-[10deg]">
          <span className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-1.5">
            КОММЕНТАТОР МАТЧА
          </span>
          <span className="text-3xl font-black text-white uppercase tracking-widest leading-none drop-shadow-md">
            {media.first_name} {media.last_name}
          </span>
        </div>
      </div>
    </AnimationWrapper>
  );
}