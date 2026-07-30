import React, { useMemo } from 'react';
import { C, hatch } from './theme';

// Графические примитивы паттерна лиги: диагонали 45°, снежинки, шайба, клюшка.
// Всё плоское, без градиентов и скруглений — как в фирменном паттерне.

// ---------------------------------------------------------------------------
export function Hatch({ color = 'rgba(255,255,255,0.05)', step = 26, ratio = 0.5, drift = false, className = '', style = {} }) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none ${drift ? 'g3-drift' : ''} ${className}`}
      style={{ backgroundImage: hatch(color, step, ratio), ...style }}
    />
  );
}

// Три параллельные диагонали 45° через весь кадр — главный композиционный приём
// полноэкранных плашек. Идут из левого нижнего угла в правый верхний.
export function DiagonalBars({ className = '', opacity = 1 }) {
  const bars = [
    { w: 3400, h: 26, color: C.blue, offset: -120, o: 0.85 },
    { w: 3400, h: 10, color: C.ice, offset: -60, o: 0.5 },
    { w: 3400, h: 54, color: C.navy2, offset: 74, o: 0.75 },
    { w: 3400, h: 6, color: C.blue, offset: 150, o: 0.45 },
  ];
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} style={{ opacity }}>
      {bars.map((b, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2"
          style={{
            width: b.w,
            height: b.h,
            marginLeft: -b.w / 2,
            marginTop: -b.h / 2 + b.offset,
            backgroundColor: b.color,
            opacity: b.o,
            transform: 'rotate(-45deg)',
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Снежинка: 6 прямых лучей с отростками. strokeWidth задан «при size = 24» и
// масштабируется вместе с размером — у крупной снежинки лучи должны быть
// пропорционально толстыми, иначе она читается паутиной, а не плоской графикой.
export function Snowflake({ size = 24, color = C.white, strokeWidth = 1.6, className = '', style = {} }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      className={className} style={style}
      fill="none" stroke={color} strokeWidth={strokeWidth * (100 / 24)} strokeLinecap="square"
    >
      {[0, 60, 120].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 50 50)`}>
          <line x1="50" y1="6" x2="50" y2="94" />
          <line x1="50" y1="20" x2="36" y2="32" />
          <line x1="50" y1="20" x2="64" y2="32" />
          <line x1="50" y1="42" x2="40" y2="51" />
          <line x1="50" y1="42" x2="60" y2="51" />
          <line x1="50" y1="80" x2="36" y2="68" />
          <line x1="50" y1="80" x2="64" y2="68" />
          <line x1="50" y1="58" x2="40" y2="49" />
          <line x1="50" y1="58" x2="60" y2="49" />
        </g>
      ))}
    </svg>
  );
}

// Снегопад. Позиции детерминированы (псевдослучайность от индекса) — иначе каждый
// ре-рендер плашки перекидывал бы снежинки на новые места. fallHeight в px.
export function Snowfall({ count = 20, fallHeight = 1080, className = 'z-30', color = C.white }) {
  const flakes = useMemo(() => {
    const rnd = (i, salt) => {
      const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: count }).map((_, i) => ({
      left: rnd(i, 1) * 100,
      size: 10 + rnd(i, 2) * 26,
      duration: 11 + rnd(i, 3) * 13,
      delay: -rnd(i, 4) * 20,
      drift: (rnd(i, 5) - 0.5) * 200,
      opacity: 0.07 + rnd(i, 6) * 0.16,
    }));
  }, [count]);

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {flakes.map((f, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${f.left}%`,
            top: `-${f.size + 12}px`,
            '--g3-drift': `${f.drift}px`,
            '--g3-fall': `${fallHeight + f.size + 24}px`,
            '--g3-op': f.opacity,
            animation: `g3Snow ${f.duration}s linear ${f.delay}s infinite`,
            willChange: 'transform, opacity',
          }}
        >
          <Snowflake size={f.size} color={color} strokeWidth={1.2} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Диагональная бегущая строка — подложка полноэкранных плашек. Полотно намеренно
// больше кадра и повёрнуто на -45°, поэтому строки идут вдоль диагоналей паттерна.
const MARQUEE_ROWS = [
  { speed: 95, dir: 'left', size: 86, opacity: 0.05, top: '4%' },
  { speed: 140, dir: 'right', size: 46, opacity: 0.03, top: '19%' },
  { speed: 72, dir: 'left', size: 112, opacity: 0.055, top: '32%' },
  { speed: 160, dir: 'right', size: 40, opacity: 0.025, top: '49%' },
  { speed: 88, dir: 'left', size: 70, opacity: 0.045, top: '63%' },
  { speed: 120, dir: 'right', size: 96, opacity: 0.035, top: '79%' },
];

export function DiagonalMarquee({ texts = [], color = C.white }) {
  const text = texts.filter(Boolean).join(' ✳ ');
  if (!text) return null;
  const repeated = `${text} ✳ `.repeat(8);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
      <div className="absolute left-1/2 top-1/2 w-[240%] h-[240%] -translate-x-1/2 -translate-y-1/2 rotate-[-45deg]">
        {MARQUEE_ROWS.map((row, i) => (
          <div
            key={i}
            className="absolute whitespace-nowrap font-black uppercase tracking-[0.1em] select-none"
            style={{ top: row.top, fontSize: `${row.size}px`, color, opacity: row.opacity }}
          >
            <div style={{ animation: `${row.dir === 'left' ? 'g3MarqueeL' : 'g3MarqueeR'} ${row.speed}s linear infinite`, willChange: 'transform' }}>
              {repeated}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Иконки: собраны из прямых граней, чтобы стоять в одном ряду с фигурами паттерна.
export function PinIcon({ size = 44, color = C.blue }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d="M24 4 L38 18 L24 44 L10 18 Z" stroke={color} strokeWidth="3.5" strokeLinejoin="miter" />
      <path d="M24 12 L31 19 L24 26 L17 19 Z" fill={color} />
    </svg>
  );
}

export function MicIcon({ size = 44, color = C.blue }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d="M24 5 L31 12 L31 24 L24 31 L17 24 L17 12 Z" fill={color} />
      <path d="M11 22 L11 26 L24 39 L37 26 L37 22" stroke={color} strokeWidth="3.5" strokeLinejoin="miter" />
      <path d="M24 39 L24 45 M15 45 L33 45" stroke={color} strokeWidth="3.5" />
    </svg>
  );
}

export function WhistleIcon({ size = 44, color = C.blue }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d="M5 15 L26 15 L26 33 L14 33 L5 24 Z" fill={color} />
      <path d="M26 19 L43 10 L43 22 L26 22 Z" stroke={color} strokeWidth="3.5" strokeLinejoin="miter" />
    </svg>
  );
}
