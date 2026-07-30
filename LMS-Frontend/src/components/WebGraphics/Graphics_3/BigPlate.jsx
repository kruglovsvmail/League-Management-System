import React from 'react';
import { DiagonalStripes, DiagonalRibbon, Snowflake } from './IceDecor';
import { TFH, cutDiag, dropShadow } from './theme';

// Каркас полноэкранных плашек лиги 3 (предматч, перерыв, лидеры, составы):
// синяя шапка → диагональная лента → тело → подвал. Общая форма — прямоугольник
// со срезанными под 45° левым верхним и правым нижним углом (cutDiag), из-за чего
// плашка читается как фрагмент диагонального паттерна лиги.

export function PlateFooter({ game }) {
  const dateObj = game.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  const displayDate = dateStr ? dateStr.toUpperCase() : 'ДАТА НЕ УКАЗАНА';
  const cityText = game.arena_city ? game.arena_city.toUpperCase() : 'ГОРОД НЕ УКАЗАН';
  const arenaText = (game.arena_name || game.location_text || 'ЛЕДОВАЯ АРЕНА').toUpperCase();

  const Cell = ({ children, muted, className = '' }) => (
    <span
      className={`font-bold uppercase tracking-[0.18em] text-[19px] ${className}`}
      style={{ color: muted ? TFH.iceDim : TFH.ice }}
    >
      {children}
    </span>
  );

  return (
    <>
      <DiagonalRibbon height={8} reverse />
      <div className="flex justify-between items-center px-14 py-3.5 w-full relative z-10" style={{ backgroundColor: TFH.navyDeep }}>
        <DiagonalStripes color="rgba(255,255,255,0.028)" step={26} />

        <div className="flex items-center gap-4 text-left w-[33%] relative z-10">
          <div className="w-2.5 h-2.5 rotate-45 shrink-0" style={{ backgroundColor: TFH.blue }} />
          <Cell muted={!dateStr}>{displayDate}</Cell>
        </div>
        <div className="text-center w-[33%] px-4 relative z-10">
          <Cell muted={!game.arena_city}>{cityText}</Cell>
        </div>
        <div className="text-right w-[33%] relative z-10">
          <Cell muted={!(game.arena_name || game.location_text)}>{arenaText}</Cell>
        </div>
      </div>
    </>
  );
}

export function BigPlate({ title, game, showFooter = true, children }) {
  return (
    <div className="w-full max-w-[1520px]" style={{ filter: dropShadow('lg') }}>
      <div
        className="flex flex-col items-center w-full relative"
        style={{ clipPath: cutDiag(64), backgroundColor: TFH.navy }}
      >
        {/* Диагональный блик по всей плашке */}
        <div className="tfh-sheen z-50" style={{ left: '-70%', width: '30%' }} />

        {/* ШАПКА */}
        <div
          className="flex justify-center items-center w-full py-3.5 relative z-10 overflow-hidden"
          style={{ backgroundColor: TFH.blue }}
        >
          <DiagonalStripes color="rgba(6,21,48,0.13)" step={22} drift />
          <Snowflake size={54} color={TFH.navyDeep} strokeWidth={1.2} className="absolute left-24 -top-3" style={{ opacity: 0.18 }} />
          <Snowflake size={54} color={TFH.navyDeep} strokeWidth={1.2} className="absolute right-24 -bottom-3" style={{ opacity: 0.18 }} />

          <div className="flex items-center gap-5 relative z-10">
            <div className="w-3 h-3 rotate-45" style={{ backgroundColor: TFH.navyDeep }} />
            <span className="font-black uppercase tracking-[0.2em] text-[25px] leading-none" style={{ color: TFH.navyDeep }}>
              {title}
            </span>
            <div className="w-3 h-3 rotate-45" style={{ backgroundColor: TFH.navyDeep }} />
          </div>
        </div>

        <DiagonalRibbon height={8} />

        {children}

        {showFooter && game && <PlateFooter game={game} />}
      </div>
    </div>
  );
}
