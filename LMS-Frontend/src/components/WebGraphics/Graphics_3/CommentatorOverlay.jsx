import React, { useState, useEffect } from 'react';
import { AnimationWrapper } from './AnimationWrapper';
import { InfoPlate } from './InfoPlate';
import { TFH } from './theme';

// Микрофон, собранный из прямых граней — та же плоская геометрия, что у фигур паттерна.
const MicIcon = () => (
  <svg width="46" height="46" viewBox="0 0 48 48" fill="none">
    <path d="M24 5 L31 12 L31 24 L24 31 L17 24 L17 12 Z" fill={TFH.blue} />
    <path d="M11 22 L11 26 L24 39 L37 26 L37 22" stroke={TFH.blue} strokeWidth="3" strokeLinejoin="miter" />
    <path d="M24 39 L24 45" stroke={TFH.blue} strokeWidth="3" />
    <path d="M15 45 L33 45" stroke={TFH.blue} strokeWidth="3" />
  </svg>
);

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
      className="absolute bottom-16 left-12 z-40"
    >
      <InfoPlate icon={<MicIcon />} label="КОММЕНТАТОР МАТЧА" minWidth={420}>
        <div className="flex items-end gap-4 px-10 pt-10 pb-7">
          <span className="text-[36px] font-black uppercase tracking-[0.04em] leading-none" style={{ color: TFH.white }}>
            {media.last_name}
          </span>
          <span className="text-[20px] font-bold uppercase tracking-[0.16em] leading-none pb-1" style={{ color: TFH.blueSoft }}>
            {media.first_name}
          </span>
        </div>
      </InfoPlate>
    </AnimationWrapper>
  );
}
