import React, { useEffect, useRef } from 'react';
import { onBandOnset } from '../audioReactive';

// Аудио-реактивные кольца позади логотипа — по одному независимому кольцу на КАЖДЫЙ
// удар каждой частотной полосы (см. onBandOnset в audioReactive.js).
//
// В отличие от дефолтной графики (мягкая «рябь на воде») здесь кольца ГРАНЁНЫЕ:
// шестиугольники с лёгким дрожанием граней, вращающиеся вокруг центра — та же
// плоская кристаллическая геометрия, что у снежинок паттерна лиги.
//   bass (бочка)        — крупные медленные шестиугольники, синие, толстая линия
//   mid  (вокал/гитары) — 12-гранники среднего размера, белые
//   high (хай-хэт)      — мелкие быстрые треугольные вспышки, светло-голубые
//
// Рендер на canvas: на плотных треках одновременно живёт до ~10 колец, каждое
// перерисовывается каждый кадр — DOM/SVG на этом объёме дороже.

const BAND_CONFIG = {
  bass: { minR: 0.42, maxR: 0.86, life: 1000, sides: 6, spin: 0.5, width: 3, color: '41,169,225', baseAlpha: 0.55, max: 3 },
  mid: { minR: 0.40, maxR: 0.78, life: 720, sides: 12, spin: -0.8, width: 1.5, color: '255,255,255', baseAlpha: 0.4, max: 3 },
  high: { minR: 0.34, maxR: 0.70, life: 560, sides: 3, spin: 1.6, width: 2, color: '127,203,238', baseAlpha: 0.45, max: 4 },
};

function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

export function RippleField({ size = 520, className = '' }) {
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

    const rings = []; // { band, born, phase, strength }
    let rafId = null;

    const spawn = (band, strength) => {
      const cfg = BAND_CONFIG[band];
      if (!cfg) return;
      const sameBand = rings.filter(r => r.band === band);
      if (sameBand.length >= cfg.max) {
        // Пул: вытесняем самое старое кольцо полосы, а не копим их бесконечно.
        const oldest = sameBand.reduce((a, b) => (a.born < b.born ? a : b));
        const idx = rings.indexOf(oldest);
        if (idx !== -1) rings.splice(idx, 1);
      }
      rings.push({
        band,
        born: performance.now(),
        phase: Math.random() * Math.PI * 2,
        strength: Math.max(0.4, strength),
      });
      if (rafId == null) rafId = requestAnimationFrame(loop);
    };

    const loop = () => {
      rafId = null;
      const now = performance.now();
      ctx.clearRect(0, 0, size, size);

      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const cfg = BAND_CONFIG[r.band];
        const t = (now - r.born) / cfg.life;
        if (t >= 1) { rings.splice(i, 1); continue; }

        const eased = easeOutQuad(t);
        const baseR = (cfg.minR + (cfg.maxR - cfg.minR) * eased) * R;
        const jitter = (1 - t) * R * 0.02; // грани слегка «дышат» и успокаиваются к концу
        const rot = r.phase + t * cfg.spin;
        const alpha = cfg.baseAlpha * r.strength * Math.pow(1 - t, 1.3);

        ctx.beginPath();
        for (let s = 0; s <= cfg.sides; s++) {
          const angle = rot + (s / cfg.sides) * Math.PI * 2;
          const rad = baseR + Math.sin(s * 2.7 + r.phase) * jitter;
          const x = cx + rad * Math.cos(angle);
          const y = cy + rad * Math.sin(angle);
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${cfg.color},${alpha.toFixed(3)})`;
        ctx.lineWidth = cfg.width;
        ctx.lineJoin = 'miter';
        ctx.stroke();
      }

      if (rings.length > 0) rafId = requestAnimationFrame(loop);
    };

    const unsubscribe = onBandOnset(spawn);
    return () => {
      unsubscribe();
      if (rafId) cancelAnimationFrame(rafId);
      rings.length = 0;
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
