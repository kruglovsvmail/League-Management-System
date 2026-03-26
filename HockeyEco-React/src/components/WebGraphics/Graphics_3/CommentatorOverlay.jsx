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
      type="geometric_unfold"
      isVisible={localVisible}
      className="absolute bottom-24 left-10 z-40"
    >
      <div className="flex items-stretch bg-[#051125]/90 backdrop-blur-[15px] border border-[#1A3A6D] shadow-[0_20px_40px_rgba(0,0,0,0.8)] overflow-hidden min-w-[350px]" style={{ transform: 'skewX(-10deg)' }}>
        
        <div className="flex items-center justify-center bg-[#0A1D37] border-r border-[#1A3A6D] px-6 relative overflow-hidden">
           <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#FF3366] shadow-[0_0_15px_#FF3366]"></div>
           <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(255,51,102,0.05)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
           
           <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#FF3366] relative z-10" style={{ transform: 'skewX(10deg)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
           </svg>
        </div>

        <div className="flex flex-col justify-center px-6 py-4 pr-10 relative" style={{ transform: 'skewX(10deg)' }}>
          <span className="text-[10px] font-bold text-[#A0BCE0] uppercase tracking-[0.3em] mb-1">
            ГОЛОС МАТЧА
          </span>
          <span className="text-2xl font-black text-white tracking-widest leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-sans">
            {media.first_name} {media.last_name}
          </span>
        </div>
      </div>
    </AnimationWrapper>
  );
}