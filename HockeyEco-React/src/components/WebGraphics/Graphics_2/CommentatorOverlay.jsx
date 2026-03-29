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
      className="absolute bottom-16 left-16 z-40"
    >
      <div className="flex items-stretch bg-white shadow-xl border border-mts-grey-light/30 overflow-hidden h-[100px]">
        
        {/* Акцентный блок (Красный) */}
        <div className="w-[100px] bg-mts-red flex items-center justify-center shrink-0">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
           </svg>
        </div>

        {/* Информационный блок */}
        <div className="flex flex-col justify-center px-10 min-w-[400px]">
          <span className="text-[10px] font-bold text-mts-grey-dark uppercase tracking-widest mb-1">
            КОММЕНТАТОР МАТЧА
          </span>
          <span className="text-3xl font-black text-mts-black uppercase tracking-tight leading-none">
            {media.first_name} {media.last_name}
          </span>
        </div>
        
      </div>
    </AnimationWrapper>
  );
}