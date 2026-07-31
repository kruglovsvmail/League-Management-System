import React, { useId, useMemo } from 'react';
import { S, SHARD_PALETTE, makeShards, rnd } from './theme';

// Осколочная графика оверлея лиги 2.
//
// Россыпи треугольников — единственный фоновый элемент системы: ими держатся
// углы кадра, из них же собираются акценты у плашек. Часть осколков залита
// полутоновым растром — это прямая цитата с референса и заодно то, что не даёт
// россыпи выглядеть плоской заливкой.

// ---------------------------------------------------------------------------
// РОССЫПЬ. Координаты осколков считаются в процентах, viewBox 0..100 по обеим
// осям с preserveAspectRatio="none" — так одна и та же россыпь садится в любой
// бокс, а форма треугольников подстраивается под его пропорции.
export function ShardField({
  count = 22,
  seed = 1,
  origin = [0, 100],
  dir = -45,
  spread = 70,
  reach = 78,
  size = 16,
  palette = SHARD_PALETTE.onCoal,
  opacity = 1,
  drift = true,
  className = '',
  style = {},
}) {
  const uid = useId().replace(/:/g, '');
  const shards = useMemo(
    () => makeShards(count, { seed, origin, dir, spread, reach, size, palette }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, seed, dir, spread, reach, size, origin[0], origin[1], palette]
  );

  return (
    <div className={`absolute pointer-events-none overflow-hidden ${className}`} style={{ opacity, ...style }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <defs>
          {/* Полутоновая заливка для части осколков */}
          <pattern id={`ht-${uid}`} width="2.4" height="2.4" patternUnits="userSpaceOnUse">
            <circle cx="1.2" cy="1.2" r="0.5" fill={S.yellow} />
          </pattern>
        </defs>

        {shards.map((s, i) => (
          <polygon
            key={i}
            points={s.pts.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}
            fill={s.fill === 'halftone' ? `url(#ht-${uid})` : s.fill}
            opacity={s.opacity}
            style={drift ? {
              animation: `g2Float ${s.float}s ease-in-out ${s.delay}s infinite`,
              transformOrigin: `${s.pts[0][0].toFixed(2)}% ${s.pts[0][1].toFixed(2)}%`,
              '--g2-dx': `${s.drift}px`,
              '--g2-rot': `${s.spin}deg`,
            } : undefined}
          />
        ))}
      </svg>
    </div>
  );
}

// Готовые углы кадра: россыпь снизу слева и справа — как на референсе.
export function ShardCorners({ palette = SHARD_PALETTE.onCoal, seedBase = 1, opacity = 1 }) {
  return (
    <>
      <ShardField
        count={26} seed={seedBase} origin={[-4, 104]} dir={-52} spread={62} reach={72} size={15}
        palette={palette} opacity={opacity}
        className="left-0 bottom-0 w-[46%] h-[62%]"
      />
      <ShardField
        count={30} seed={seedBase + 5} origin={[104, 96]} dir={-128} spread={74} reach={78} size={13}
        palette={palette} opacity={opacity}
        className="right-0 bottom-0 w-[42%] h-[86%]"
      />
      <ShardField
        count={12} seed={seedBase + 9} origin={[102, 0]} dir={128} spread={56} reach={54} size={11}
        palette={palette} opacity={opacity * 0.8}
        className="right-0 top-0 w-[30%] h-[38%]"
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Полутоновое поле — отдельным слоем под контентом, для лёгкой фактуры.
export function Halftone({ color = 'rgba(255,255,255,0.16)', cell = 9, dot = 1.4, fade = 'to right', opacity = 1, className = '', style = {} }) {
  const mask = fade ? `linear-gradient(${fade}, #000 0%, rgba(0,0,0,0.5) 50%, transparent 92%)` : undefined;
  return (
    <div
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        opacity,
        backgroundImage: `radial-gradient(circle, ${color} ${dot}px, transparent ${dot + 0.6}px)`,
        backgroundSize: `${cell}px ${cell}px`,
        WebkitMaskImage: mask,
        maskImage: mask,
        ...style,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Одиночный треугольник — маркер, буллит, метка. Направление задаётся поворотом.
export function Tri({ size = 14, color = S.yellow, rotate = 0, className = '', style = {} }) {
  return (
    <div
      className={`shrink-0 ${className}`}
      style={{
        width: size, height: size,
        backgroundColor: color,
        clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
        transform: `rotate(${rotate}deg)`,
        ...style,
      }}
    />
  );
}

// Контурный треугольник — для «пустых» состояний (непробитый буллит и т.п.).
export function TriOutline({ size = 14, color = S.ash, rotate = 0, width = 2, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={`shrink-0 ${className}`} style={{ transform: `rotate(${rotate}deg)` }}>
      <polygon points="10,2 18,18 2,18" fill="none" stroke={color} strokeWidth={width} strokeLinejoin="miter" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Взрыв осколков — вспышка на голе. Разлетается от центра во все стороны.
export function ShardBurst({ size = 420, seed = 3, palette = [S.yellow, S.white, S.yellowDeep], className = '', style = {} }) {
  const tris = useMemo(() => Array.from({ length: 18 }).map((_, i) => {
    const a = (i / 18) * Math.PI * 2 + rnd(i, seed);
    const d = 26 + rnd(i + 30, seed) * 22;
    const sc = 4 + rnd(i + 60, seed) * 9;
    const base = rnd(i + 90, seed) * Math.PI * 2;
    const pts = [0, 1, 2].map(v => {
      const va = base + (v * 2 * Math.PI) / 3;
      return [50 + Math.cos(a) * d + Math.cos(va) * sc, 50 + Math.sin(a) * d + Math.sin(va) * sc];
    });
    return { pts, fill: palette[i % palette.length] };
  }), [seed, palette]);

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`absolute pointer-events-none ${className}`} style={style}>
      {tris.map((t, i) => (
        <polygon key={i} points={t.pts.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')} fill={t.fill} />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Жёлтая полоса-акцент со скошенным торцом — отбивка под заголовками.
export function Bar({ w = 78, h = 8, color = S.yellow, className = '', style = {} }) {
  return (
    <div
      className={`shrink-0 ${className}`}
      style={{ width: w, height: h, backgroundColor: color, clipPath: `polygon(0 0, 100% 0, calc(100% - ${h}px) 100%, 0 100%)`, ...style }}
    />
  );
}
