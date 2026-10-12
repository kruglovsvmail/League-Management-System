import React, { useEffect, useRef } from 'react';
import { onBandOnset } from '../audioReactive';

// Рябь: неровные (не идеально круглые) расширяющиеся волны позади логотипа, по одной
// независимой волне на КАЖДЫЙ удар каждой частотной полосы (см. onBandOnset в
// audioReactive.js). В отличие от старого масштабирования лого сам логотип остаётся
// неподвижным — вся динамика уходит в эти волны.
//
// Полосы визуально разные, чтобы бас/средние/высокие читались отдельно:
//   bass (бочка)       — самые крупные и медленные волны, толстая линия, тёплый цвет
//   mid  (вокал/гитары) — среднего размера и скорости, нейтрально-белый
//   high (хай-хэт/крэк) — маленькие и быстрые, тонкая линия, холодный светлый цвет
//
// Рендер на canvas (не SVG/CSS) — на плотных треках одновременно живёт до ~10 волн,
// каждая с ~64-точечным неровным контуром; перерисовывать это стилями/DOM дороже.

const BAND_CONFIG = {
  bass: { minR: 0.55, maxR: 0.8, life: 950, wobble: 0.1, lobes: 4, width: 2, color: '255,255,255', baseAlpha: 0.2, max: 3 },
  mid: { minR: 0.50, maxR: 0.75, life: 700, wobble: 0.1, lobes: 7, width: 1, color: '255,255,255', baseAlpha: 0.2, max: 3 },
  high: { minR: 0.45, maxR: 0.80, life: 680, wobble: 0.1, lobes: 3, width: 2, color: '255,255,255', baseAlpha: 0.2, max: 4 },
};

// Неровный (рябистый) контур: две наложенные синусоиды разной частоты — читается как
// нерегулярная волна на воде, а не как правильный многоугольник.
function wobbleRadius(baseR, amp, lobes, angle, phase) {
  return baseR
    + amp * 0.7 * Math.sin(lobes * angle + phase)
    + amp * 0.3 * Math.sin((lobes * 1.7 + 2) * angle - phase * 1.3);
}

function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

export function RippleField({ size = 740, className = '' }) {
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

    const ripples = []; // { band, born, phase }
    let rafId = null;

    const spawn = (band, strength) => {
      const cfg = BAND_CONFIG[band];
      if (!cfg) return;
      const sameBand = ripples.filter(r => r.band === band);
      if (sameBand.length >= cfg.max) {
        // Пул: убираем самую старую волну этой полосы, а не копим бесконечно на плотных треках.
        const oldest = sameBand.reduce((a, b) => (a.born < b.born ? a : b));
        const idx = ripples.indexOf(oldest);
        if (idx !== -1) ripples.splice(idx, 1);
      }
      ripples.push({ band, born: performance.now(), phase: Math.random() * Math.PI * 2, strength: Math.max(0.4, strength) });
      if (rafId == null) rafId = requestAnimationFrame(loop);
    };

    const loop = () => {
      rafId = null;
      const now = performance.now();
      ctx.clearRect(0, 0, size, size);

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const cfg = BAND_CONFIG[r.band];
        const t = (now - r.born) / cfg.life;
        if (t >= 1) { ripples.splice(i, 1); continue; }

        const eased = easeOutQuad(t);
        const baseR = (cfg.minR + (cfg.maxR - cfg.minR) * eased) * R;
        const amp = cfg.wobble * R * (1 - t); // волна разглаживается к концу жизни
        const phase = r.phase + t * 3; // лёгкое вращение узора за время жизни
        const alpha = cfg.baseAlpha * r.strength * Math.pow(1 - t, 1.2);

        ctx.beginPath();
        const steps = 64;
        for (let s = 0; s <= steps; s++) {
          const angle = (s / steps) * Math.PI * 2;
          const rad = wobbleRadius(baseR, amp, cfg.lobes, angle, phase);
          const x = cx + rad * Math.cos(angle);
          const y = cy + rad * Math.sin(angle);
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${cfg.color},${alpha.toFixed(3)})`;
        ctx.lineWidth = cfg.width;
        ctx.stroke();
      }

      if (ripples.length > 0) rafId = requestAnimationFrame(loop);
    };

    const unsubscribe = onBandOnset(spawn);
    return () => {
      unsubscribe();
      if (rafId) cancelAnimationFrame(rafId);
      ripples.length = 0;
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
