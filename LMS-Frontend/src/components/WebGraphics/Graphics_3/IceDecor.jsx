import React, { useMemo } from 'react';
import { TFH, stripes } from './theme';

// Декоративный слой оверлея лиги 3: диагональная штриховка, снежинки, снегопад
// и диагональный бегущий текст. Всё держится на одних и тех же 45° — это и есть
// «клей» между плашками, ради которого паттерн узнаётся с любого кадра.

// ---------------------------------------------------------------------------
// Диагональная штриховка 45° — фоновая текстура любой плашки.
// ---------------------------------------------------------------------------
export function DiagonalStripes({
  color = 'rgba(255,255,255,0.05)',
  step = 26,
  ratio = 0.5,
  drift = false,
  className = '',
  style = {},
}) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none ${drift ? 'tfh-drift' : ''} ${className}`}
      style={{ backgroundImage: stripes(color, step, ratio), ...style }}
    />
  );
}

// ---------------------------------------------------------------------------
// Снежинка — та же плоская геометрия, что и в паттерне: 6 прямых лучей
// с короткими отростками, без скруглений.
// strokeWidth задаётся в px «при size = 24» и дальше масштабируется вместе с
// размером: у крупных снежинок лучи должны быть пропорционально толстыми,
// иначе на фоне плашки они выглядят паутиной, а не плоской графикой.
// ---------------------------------------------------------------------------
export function Snowflake({ size = 24, color = TFH.white, strokeWidth = 1.6, className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={style}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth * (100 / 24)}
      strokeLinecap="square"
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

// ---------------------------------------------------------------------------
// Снегопад внутри плашки. Позиции детерминированы (псевдослучайность от индекса) —
// иначе каждый ре-рендер плашки перекидывал бы снежинки в новые места.
// fallHeight — высота, которую снежинка пролетает; задаётся плашкой в px.
// Слой идёт ПОВЕРХ колонок плашки (у них непрозрачный фон, позади снега не видно),
// поэтому непрозрачность держим низкой — снег не должен спорить с контентом.
// ---------------------------------------------------------------------------
export function Snowfall({ count = 18, fallHeight = 760, className = 'z-30', color = TFH.white }) {
  const flakes = useMemo(() => {
    const rnd = (i, salt) => {
      const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: count }).map((_, i) => ({
      left: rnd(i, 1) * 100,
      size: 8 + rnd(i, 2) * 20,
      duration: 9 + rnd(i, 3) * 11,
      delay: -rnd(i, 4) * 16,
      drift: (rnd(i, 5) - 0.5) * 160,
      opacity: 0.08 + rnd(i, 6) * 0.2,
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
            top: `-${f.size + 10}px`,
            '--tfh-snow-drift': `${f.drift}px`,
            '--tfh-snow-fall': `${fallHeight + f.size + 20}px`,
            '--tfh-snow-op': f.opacity,
            animation: `tfhSnowFall ${f.duration}s linear ${f.delay}s infinite`,
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
// Диагональный бегущий текст — аналог TickerBackground дефолтной графики,
// но развёрнутый на -45°, чтобы строки шли вдоль диагоналей паттерна.
// ---------------------------------------------------------------------------
const TICKER_ROWS = [
  { speed: 90, dir: 'left', size: 74, opacity: 0.045, top: '6%' },
  { speed: 130, dir: 'right', size: 44, opacity: 0.03, top: '20%' },
  { speed: 70, dir: 'left', size: 96, opacity: 0.055, top: '33%' },
  { speed: 150, dir: 'right', size: 38, opacity: 0.025, top: '50%' },
  { speed: 85, dir: 'left', size: 64, opacity: 0.05, top: '64%' },
  { speed: 110, dir: 'right', size: 88, opacity: 0.035, top: '80%' },
];

export function DiagonalTicker({ texts = [], color = TFH.white }) {
  const text = texts.filter(Boolean).join(' ✳ ');
  if (!text) return null;
  const repeated = `${text} ✳ `.repeat(8);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
      {/* Полотно намеренно больше плашки и повёрнуто — строки уходят за срезы под 45°. */}
      <div className="absolute left-1/2 top-1/2 w-[240%] h-[240%] -translate-x-1/2 -translate-y-1/2 rotate-[-45deg]">
        {TICKER_ROWS.map((row, i) => (
          <div
            key={i}
            className="absolute whitespace-nowrap font-black uppercase tracking-[0.12em] select-none"
            style={{ top: row.top, fontSize: `${row.size}px`, color, opacity: row.opacity }}
          >
            <div
              style={{
                animation: `${row.dir === 'left' ? 'tfhTickerLeft' : 'tfhTickerRight'} ${row.speed}s linear infinite`,
                willChange: 'transform',
              }}
            >
              {repeated}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Диагональная лента-разделитель: сегменты навy/синий/лёд под 45°, ровно как
// цветные полосы исходного паттерна. Используется в шапках крупных плашек.
// ---------------------------------------------------------------------------
export function DiagonalRibbon({ height = 10, className = '', reverse = false }) {
  const seq = reverse
    ? [TFH.ice, TFH.blue, TFH.navyMid, TFH.white, TFH.blueDeep]
    : [TFH.blue, TFH.white, TFH.navyMid, TFH.blueSoft, TFH.ice];

  return (
    <div
      className={`w-full shrink-0 ${className}`}
      style={{
        height,
        backgroundImage: `repeating-linear-gradient(45deg, ${seq
          .map((c, i) => `${c} ${i * 22}px, ${c} ${(i + 1) * 22}px`)
          .join(', ')})`,
      }}
    />
  );
}
