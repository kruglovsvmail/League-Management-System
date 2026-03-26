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
      className="absolute bottom-24 left-10 z-40"
    >
      <div className="flex items-stretch bg-[#000000ff]/[98%] backdrop-blur-md rounded-xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden">
        
        <div className="flex items-center justify-center bg-white/5 border-r border-white/10 px-6 relative overflow-hidden">
           <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500"></div>
           <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
           </svg>
        </div>

        <div className="flex flex-col justify-center px-6 py-4 pr-10">
          <span className="text-[11px] font-bold text-white/50 uppercase tracking-[0.2em] mb-1">
            Комментатор матча
          </span>
          <span className="text-3xl font-black text-white tracking-wide leading-none drop-shadow-md">
            {media.first_name} {media.last_name}
          </span>
        </div>
      </div>
    </AnimationWrapper>
  );
}