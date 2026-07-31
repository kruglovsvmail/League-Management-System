import React, { useEffect, useRef } from 'react';
import { onBandOnset } from '../audioReactive';

// Аудио-реактивный слой под эмблемой: на КАЖДЫЙ удар каждой частотной полосы
// (см. onBandOnset в audioReactive.js) от центра разлетаются ТРЕУГОЛЬНЫЕ ОСКОЛКИ —
// та же геометрия, что и во всей графике лиги, только живая. Кругов здесь нет
// принципиально: система построена на треугольниках.
//
//   bass (бочка)        — крупные редкие осколки, жёлтые
//   mid  (вокал/гитары) — средние, белые
//   high (хай-хэт)      — мелкая частая крошка, серая
//
// Рендер на canvas: одновременно живёт до ~10 залпов по 10–26 треугольников —
// это сотни нод, если делать через DOM.

const BAND_CONFIG = {
  bass: { minR: 0.28, maxR: 0.95, life: 950, count: 10, size: 17, color: '255,200,0', alpha: 0.8, spin: 1.1, max: 3 },
  mid: { minR: 0.24, maxR: 0.82, life: 700, count: 16, size: 11, color: '255,255,255', alpha: 0.6, spin: -1.5, max: 3 },
  high: { minR: 0.20, maxR: 0.70, life: 520, count: 26, size: 6, color: '142,142,142', alpha: 0.75, spin: 2.4, max: 4 },
};

// Детерминированный псевдослучай: залп с одним seed обязан выглядеть одинаково
// во всех кадрах своей жизни, иначе осколки «кипят» на месте.
function rnd(i, seed) {
  const x = Math.sin(i * 91.7 + seed * 47.3) * 43758.5453;
  return x - Math.floor(x);
}

function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

export function RippleField({ size = 380, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2;

    const bursts = []; // { band, born, seed, strength }
    let rafId = null;
    let seedCounter = 0;

    const spawn = (band, strength) => {
      const cfg = BAND_CONFIG[band];
      if (!cfg) return;
      const sameBand = bursts.filter(b => b.band === band);
      if (sameBand.length >= cfg.max) {
        // Пул: вытесняем самый старый залп полосы, а не копим их бесконечно.
        const oldest = sameBand.reduce((a, b) => (a.born < b.born ? a : b));
        const idx = bursts.indexOf(oldest);
        if (idx !== -1) bursts.splice(idx, 1);
      }
      bursts.push({ band, born: performance.now(), seed: ++seedCounter, strength: Math.max(0.4, strength) });
      if (rafId == null) rafId = requestAnimationFrame(loop);
    };

    const loop = () => {
      rafId = null;
      const now = performance.now();
      ctx.clearRect(0, 0, size, size);

      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        const cfg = BAND_CONFIG[b.band];
        const t = (now - b.born) / cfg.life;
        if (t >= 1) { bursts.splice(i, 1); continue; }

        const eased = easeOutQuad(t);
        const alpha = cfg.alpha * b.strength * Math.pow(1 - t, 1.3);
        ctx.fillStyle = `rgba(${cfg.color},${alpha.toFixed(3)})`;

        for (let d = 0; d < cfg.count; d++) {
          // У каждого осколка свои угол вылета, дальность и собственное вращение
          const a = (d / cfg.count) * Math.PI * 2 + rnd(d, b.seed) * 0.5;
          const spread = 0.72 + rnd(d + 50, b.seed) * 0.56;
          const r = (cfg.minR + (cfg.maxR - cfg.minR) * eased) * R * spread;
          const sc = cfg.size * (0.4 + rnd(d + 100, b.seed)) * (1 - t * 0.5) * b.strength;
          const rot = rnd(d + 150, b.seed) * Math.PI * 2 + t * cfg.spin;

          const px = cx + r * Math.cos(a);
          const py = cy + r * Math.sin(a);

          ctx.beginPath();
          for (let v = 0; v < 3; v++) {
            const va = rot + (v * 2 * Math.PI) / 3;
            const vr = sc * (0.6 + rnd(d * 3 + v + 200, b.seed) * 0.8);
            const x = px + Math.cos(va) * vr;
            const y = py + Math.sin(va) * vr;
            if (v === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        }
      }

      if (bursts.length > 0) rafId = requestAnimationFrame(loop);
    };

    const unsubscribe = onBandOnset(spawn);
    return () => {
      unsubscribe();
      if (rafId) cancelAnimationFrame(rafId);
      bursts.length = 0;
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none ${className}`}
    />
  );
}
