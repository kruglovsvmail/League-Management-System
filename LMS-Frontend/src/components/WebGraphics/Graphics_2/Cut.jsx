import React, { useState, useEffect } from 'react';

// Появление/уход плашек лиги 2. Движение резкое и «осколочное»: плашка приходит
// срезом по диагонали, как отколовшийся кусок, элементы внутри собираются
// поочерёдно с лёгким разлётом.
//
// Здесь же лежат общие keyframes оверлея (их использует и Shards.jsx): Cut
// рендерит каждая плашка, значит стили гарантированно есть в документе.

const VARIANTS = {
  shear: ['g2-in-shear', 'g2-out-shear'],   // табло: срез от левой кромки
  lift: ['g2-in-lift', 'g2-out-lift'],      // карточка события: подъём снизу
  slide: ['g2-in-slide', 'g2-out-slide'],   // угловые плашки
  split: ['g2-in-split', 'g2-out-split'],   // весь кадр: раскол по диагонали
};

export function Cut({ isVisible, variant = 'split', className = '', style, children }) {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    if (isVisible) setHasBeenVisible(true);
  }, [isVisible]);

  const [inCls, outCls] = VARIANTS[variant] || VARIANTS.split;

  const activeClasses = !hasBeenVisible
    ? 'opacity-0 pointer-events-none'
    : isVisible
      ? `${inCls} pointer-events-auto`
      : `${outCls} pointer-events-none`;

  return (
    <>
      <style>{`
        /* ---- Табло: въезжает срезом ---- */
        .g2-in-shear  { animation: g2InShear 0.5s cubic-bezier(0.16, 1.1, 0.28, 1) forwards; }
        .g2-out-shear { animation: g2OutShear 0.3s cubic-bezier(0.7, 0, 0.9, 0.25) forwards; }
        @keyframes g2InShear {
          0%   { transform: translateX(-104%) skewX(-12deg); opacity: 0; }
          42%  { opacity: 1; }
          78%  { transform: translateX(1.6%) skewX(1.5deg); }
          100% { transform: translateX(0) skewX(0deg); opacity: 1; }
        }
        @keyframes g2OutShear {
          0%   { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(-108%) skewX(-12deg); opacity: 0; }
        }

        /* ---- Карточка события: подъём снизу ---- */
        .g2-in-lift  { animation: g2InLift 0.52s cubic-bezier(0.14, 1.16, 0.3, 1) forwards; }
        .g2-out-lift { animation: g2OutLift 0.32s cubic-bezier(0.7, 0, 0.9, 0.25) forwards; }
        @keyframes g2InLift {
          0%   { transform: translate(-50%, 112%); opacity: 0; }
          44%  { opacity: 1; }
          80%  { transform: translate(-50%, -2.2%); }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes g2OutLift {
          0%   { transform: translate(-50%, 0); opacity: 1; }
          100% { transform: translate(-50%, 116%); opacity: 0; }
        }

        /* ---- Угловые плашки ---- */
        .g2-in-slide  { animation: g2InSlide 0.46s cubic-bezier(0.16, 1.12, 0.3, 1) forwards; }
        .g2-out-slide { animation: g2OutSlide 0.28s cubic-bezier(0.7, 0, 0.9, 0.25) forwards; }
        @keyframes g2InSlide {
          0%   { transform: translateX(-104%); opacity: 0; }
          40%  { opacity: 1; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes g2OutSlide {
          0%   { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(-108%); opacity: 0; }
        }

        /* ---- Весь кадр: раскалывается по диагонали ---- */
        .g2-in-split  { animation: g2InSplit 0.62s cubic-bezier(0.2, 0.92, 0.22, 1) forwards; }
        .g2-out-split { animation: g2OutSplit 0.42s cubic-bezier(0.72, 0, 0.86, 0.24) forwards; }
        @keyframes g2InSplit {
          0%   { clip-path: polygon(0 0, 0 0, 0 100%, 0 100%); }
          100% { clip-path: polygon(0 0, 150% 0, 116% 100%, 0 100%); }
        }
        @keyframes g2OutSplit {
          0%   { clip-path: polygon(0 0, 150% 0, 116% 100%, 0 100%); }
          100% { clip-path: polygon(150% 0, 150% 0, 116% 100%, 116% 100%); }
        }

        /* ==== Общие ==== */

        /* Дрейф осколков: медленное покачивание, у каждого свои параметры. */
        @keyframes g2Float {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50%      { transform: translate(var(--g2-dx, 1px), calc(var(--g2-dx, 1px) * -0.6)) rotate(var(--g2-rot, 2deg)); }
        }

        /* Диагональный блик по плашке. */
        .g2-gleam {
          position: absolute; top: -60%; bottom: -60%; width: 20%;
          transform: rotate(20deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.13), transparent);
          animation: g2Gleam 6.5s cubic-bezier(0.4, 0, 0.3, 1) infinite;
          pointer-events: none; will-change: left;
        }
        @keyframes g2Gleam {
          0%   { left: -40%; opacity: 0; }
          8%   { opacity: 1; }
          34%  { left: 130%; opacity: 0; }
          100% { left: 130%; opacity: 0; }
        }

        @keyframes g2Blink { 0%, 100% { opacity: 0.28; } 50% { opacity: 1; } }
        .g2-blink { animation: g2Blink 1.05s ease-in-out infinite; }

        /* Разлёт осколков на голе. */
        @keyframes g2Burst {
          0%   { transform: translate(-50%,-50%) scale(0.25) rotate(0deg); opacity: 0; }
          16%  { opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(2.1) rotate(28deg); opacity: 0; }
        }
        .g2-burst { animation: g2Burst 1.05s cubic-bezier(0.18, 0.85, 0.3, 1); }

        /* Короткий толчок кадра. */
        @keyframes g2Jolt {
          0%, 100% { transform: translate3d(0,0,0); }
          14% { transform: translate3d(-6px, 2px, 0); }
          30% { transform: translate3d(5px, -2px, 0); }
          48% { transform: translate3d(-3px, 1px, 0); }
          70% { transform: translate3d(2px, 0, 0); }
        }
        .g2-jolt { animation: g2Jolt 0.6s ease-out; }

        /* Поочерёдная сборка элементов внутри плашки. */
        .g2-seq > * { animation: g2Shard 0.44s cubic-bezier(0.16, 1.12, 0.32, 1) backwards; }
        .g2-seq > *:nth-child(1) { animation-delay: 0.08s; }
        .g2-seq > *:nth-child(2) { animation-delay: 0.15s; }
        .g2-seq > *:nth-child(3) { animation-delay: 0.22s; }
        .g2-seq > *:nth-child(4) { animation-delay: 0.29s; }
        .g2-seq > *:nth-child(5) { animation-delay: 0.36s; }
        .g2-seq > *:nth-child(6) { animation-delay: 0.43s; }
        @keyframes g2Shard {
          0%   { opacity: 0; transform: translate(-18px, 10px) skewX(-6deg); }
          100% { opacity: 1; transform: translate(0, 0) skewX(0deg); }
        }
      `}</style>

      <div
        className={`${className} ${activeClasses} transform-gpu`}
        style={{ WebkitFontSmoothing: 'antialiased', ...style }}
      >
        {children}
      </div>
    </>
  );
}
