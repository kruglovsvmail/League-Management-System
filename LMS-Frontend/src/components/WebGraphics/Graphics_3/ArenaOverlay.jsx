import React from 'react';
import { AnimationWrapper } from './AnimationWrapper';
import { InfoPlate } from './InfoPlate';
import { TFH } from './theme';

// Плоская геометрическая метка места — без скруглений, как фигуры паттерна лиги.
const PinIcon = () => (
  <svg width="46" height="46" viewBox="0 0 48 48" fill="none">
    <path d="M24 4 L38 18 L24 44 L10 18 Z" stroke={TFH.blue} strokeWidth="3" strokeLinejoin="miter" />
    <path d="M24 12 L31 19 L24 26 L17 19 Z" fill={TFH.blue} />
  </svg>
);

export default function ArenaOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'arena';

  if (!game) return null;

  const cityLine = [
    game.arena_city ? `Г. ${game.arena_city.toUpperCase()}` : '',
    game.arena_address ? game.arena_address.toUpperCase() : '',
  ].filter(Boolean).join(' • ');

  return (
    <AnimationWrapper
      type="arena"
      isVisible={isVisible}
      className="absolute bottom-16 left-12 z-40"
    >
      <InfoPlate icon={<PinIcon />} label="МЕСТО ПРОВЕДЕНИЯ" minWidth={420}>
        <div className="flex flex-col justify-center px-10 pt-9 pb-6">
          <span className="text-[34px] font-black uppercase tracking-[0.06em] leading-none mb-2.5" style={{ color: TFH.white }}>
            {game.arena_name || game.location_text || 'ЛЕДОВАЯ АРЕНА'}
          </span>
          {cityLine && (
            <span className="text-[14px] font-bold uppercase tracking-[0.22em]" style={{ color: TFH.blueSoft }}>
              {cityLine}
            </span>
          )}
        </div>
      </InfoPlate>
    </AnimationWrapper>
  );
}
