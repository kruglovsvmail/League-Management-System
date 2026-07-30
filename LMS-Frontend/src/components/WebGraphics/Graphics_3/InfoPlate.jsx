import React from 'react';
import { DiagonalStripes, Snowflake } from './IceDecor';
import { TFH, cut, dropShadow } from './theme';

// Общий каркас «нижних» информационных плашек лиги 3 (арена, комментатор, судьи).
// В дефолтной графике эти три плашки скопированы друг у друга почти целиком —
// здесь общая форма вынесена сюда, а плашки задают только иконку и содержимое.
export function InfoPlate({ icon, label, children, minWidth = 380 }) {
  return (
    <div style={{ filter: dropShadow('lg') }}>
      <div
        className="flex items-stretch relative overflow-hidden"
        style={{ clipPath: cut(34, 0, 34, 0), backgroundColor: TFH.navy }}
      >
        <div className="tfh-sheen z-40" style={{ left: '-70%' }} />

        {/* Акцент лиги */}
        <div className="w-[10px] shrink-0 z-20" style={{ backgroundColor: TFH.blue }} />

        {/* Иконка на срезанном под 45° блоке */}
        <div
          className="flex items-center justify-center pl-9 pr-14 relative z-10"
          style={{ backgroundColor: TFH.navyMid, clipPath: 'polygon(0 0, 100% 0, calc(100% - 30px) 100%, 0 100%)' }}
        >
          <DiagonalStripes color="rgba(255,255,255,0.05)" step={20} drift />
          <div className="relative z-10">{icon}</div>
        </div>

        {/* Контент */}
        <div className="relative z-10 flex items-center" style={{ minWidth }}>
          <DiagonalStripes color="rgba(255,255,255,0.03)" step={34} />

          <Snowflake
            size={78}
            color={TFH.blue}
            strokeWidth={1}
            className="absolute -top-6 -right-4 pointer-events-none"
            style={{ opacity: 0.12, animation: 'tfhSpin 30s linear infinite' }}
          />

          {label && (
            <div
              className="absolute left-0 top-0 px-4 py-1 z-20"
              style={{ backgroundColor: TFH.blue, clipPath: cut(0, 0, 10, 0) }}
            >
              <span className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: TFH.navyDeep }}>
                {label}
              </span>
            </div>
          )}

          <div className="relative z-10 w-full">{children}</div>
        </div>
      </div>
    </div>
  );
}
