import React, { useState, useEffect } from 'react';
import { AnimationWrapper } from './AnimationWrapper';
import { InfoPlate } from './InfoPlate';
import { TFH } from './theme';

// Свисток из прямых граней — плоская геометрия паттерна лиги.
const WhistleIcon = () => (
  <svg width="46" height="46" viewBox="0 0 48 48" fill="none">
    <path d="M6 16 L26 16 L26 32 L14 32 L6 24 Z" fill={TFH.blue} />
    <path d="M26 20 L42 12 L42 22 L26 22 Z" stroke={TFH.blue} strokeWidth="3" strokeLinejoin="miter" />
    <path d="M14 20 L20 26" stroke={TFH.navy} strokeWidth="3" />
  </svg>
);

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

  const Column = ({ title, people }) => (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-2.5 h-2.5 rotate-45 shrink-0" style={{ backgroundColor: TFH.blue }} />
        <span className="text-[11px] font-black uppercase tracking-[0.3em]" style={{ color: TFH.blue }}>
          {title}
        </span>
      </div>
      <div className="h-px w-full mb-4" style={{ backgroundColor: TFH.navyLine }} />
      {people.map((p, i) => (
        <div key={i} className="flex items-baseline gap-2.5 mb-2.5 last:mb-0">
          <span className="text-[24px] font-black uppercase tracking-[0.04em] leading-none" style={{ color: TFH.white }}>
            {p.last_name}
          </span>
          <span className="text-[15px] font-bold uppercase tracking-[0.14em] leading-none" style={{ color: TFH.iceDim }}>
            {p.first_name}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <AnimationWrapper
      type="referees"
      isVisible={localVisible}
      className="absolute bottom-16 left-12 z-40"
    >
      <InfoPlate icon={<WhistleIcon />} minWidth={520}>
        <div className="flex gap-14 px-12 py-8">
          {heads.length > 0 && <Column title="ГЛАВНЫЕ СУДЬИ" people={heads} />}
          {heads.length > 0 && linesmen.length > 0 && (
            <div className="w-px self-stretch" style={{ backgroundColor: TFH.navyLine }} />
          )}
          {linesmen.length > 0 && <Column title="ЛИНЕЙНЫЕ СУДЬИ" people={linesmen} />}
        </div>
      </InfoPlate>
    </AnimationWrapper>
  );
}
