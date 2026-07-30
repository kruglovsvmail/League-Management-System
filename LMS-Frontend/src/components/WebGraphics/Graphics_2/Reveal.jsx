import React, { useState, useEffect } from 'react';

// Появление/уход плашек лиги 3. В дефолтной графике один универсальный эффект на всё
// («жалюзи» по вертикали); здесь у каждого типа плашки своя механика, соответствующая
// её месту в кадре — табло падает сверху, постер события въезжает слева, нижняя лента
// раскрывается из центра, полноэкранные плашки распахиваются диагональной щелью.
//
// Здесь же лежат ОБЩИЕ keyframes оверлея: Reveal рендерит каждая плашка, значит стили
// гарантированно есть в документе.

const VARIANTS = {
  blade: ['g3-in-blade', 'g3-out-blade'],       // табло: сверху вниз с доводкой
  poster: ['g3-in-poster', 'g3-out-poster'],    // событие: вертикальный постер слева
  band: ['g3-in-band', 'g3-out-band'],          // нижняя лента: из центра по горизонтали
  takeover: ['g3-in-takeover', 'g3-out-takeover'], // весь кадр: диагональная щель
  slideL: ['g3-in-slidel', 'g3-out-slidel'],    // выезд от левой кромки, без вертикали
  slideR: ['g3-in-slider', 'g3-out-slider'],    // выезд от правой кромки
};

export function Reveal({ isVisible, variant = 'takeover', className = '', style, children }) {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    if (isVisible) setHasBeenVisible(true);
  }, [isVisible]);

  const [inCls, outCls] = VARIANTS[variant] || VARIANTS.takeover;

  const activeClasses = !hasBeenVisible
    ? 'opacity-0 pointer-events-none'
    : isVisible
      ? `${inCls} pointer-events-auto`
      : `${outCls} pointer-events-none`;

  return (
    <>
      <style>{`
        /* ---- Табло: падает от верхней кромки кадра ---- */
        .g3-in-blade  { animation: g3InBlade 0.6s cubic-bezier(0.18, 1.15, 0.35, 1) forwards; }
        .g3-out-blade { animation: g3OutBlade 0.36s cubic-bezier(0.6, 0, 0.9, 0.3) forwards; }
        @keyframes g3InBlade {
          0%   { transform: translate(-50%, -120%); opacity: 0; }
          55%  { opacity: 1; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes g3OutBlade {
          0%   { transform: translate(-50%, 0); opacity: 1; }
          100% { transform: translate(-50%, -125%); opacity: 0; }
        }

        /* ---- Постер события: въезжает слева, гасит наклон в конце ---- */
        .g3-in-poster  { animation: g3InPoster 0.66s cubic-bezier(0.16, 1.05, 0.3, 1) forwards; }
        .g3-out-poster { animation: g3OutPoster 0.4s cubic-bezier(0.6, 0, 0.9, 0.3) forwards; }
        @keyframes g3InPoster {
          0%   { transform: translate(-130%, -50%) skewX(-7deg); opacity: 0; }
          40%  { opacity: 1; }
          72%  { transform: translate(2%, -50%) skewX(2deg); }
          100% { transform: translate(0, -50%) skewX(0deg); opacity: 1; }
        }
        @keyframes g3OutPoster {
          0%   { transform: translate(0, -50%) skewX(0deg); opacity: 1; }
          100% { transform: translate(-132%, -50%) skewX(-7deg); opacity: 0; }
        }

        /* ---- Выезд от левой кромки (угловые плашки) ---- */
        .g3-in-slidel  { animation: g3InSlideL 0.55s cubic-bezier(0.16, 1.05, 0.3, 1) forwards; }
        .g3-out-slidel { animation: g3OutSlideL 0.34s cubic-bezier(0.6, 0, 0.9, 0.3) forwards; }
        @keyframes g3InSlideL {
          0%   { transform: translateX(-115%); opacity: 0; }
          40%  { opacity: 1; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes g3OutSlideL {
          0%   { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(-118%); opacity: 0; }
        }

        .g3-in-slider  { animation: g3InSlideR 0.55s cubic-bezier(0.16, 1.05, 0.3, 1) forwards; }
        .g3-out-slider { animation: g3OutSlideR 0.34s cubic-bezier(0.6, 0, 0.9, 0.3) forwards; }
        @keyframes g3InSlideR {
          0%   { transform: translateX(115%); opacity: 0; }
          40%  { opacity: 1; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes g3OutSlideR {
          0%   { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(118%); opacity: 0; }
        }

        /* ---- Нижняя лента: раскрывается из центра ---- */
        .g3-in-band  { animation: g3InBand 0.55s cubic-bezier(0.2, 0.9, 0.25, 1) forwards; }
        .g3-out-band { animation: g3OutBand 0.36s cubic-bezier(0.6, 0, 0.9, 0.3) forwards; }
        @keyframes g3InBand {
          0%   { clip-path: inset(0 49% 0 49%); transform: translateY(30%); opacity: 0; }
          25%  { opacity: 1; }
          100% { clip-path: inset(0 0 0 0); transform: translateY(0); opacity: 1; }
        }
        @keyframes g3OutBand {
          0%   { clip-path: inset(0 0 0 0); transform: translateY(0); opacity: 1; }
          100% { clip-path: inset(0 49% 0 49%); transform: translateY(34%); opacity: 0; }
        }

        /* ---- Полный кадр: диагональная щель распахивается вверх и вниз ---- */
        .g3-in-takeover  { animation: g3InTakeover 0.78s cubic-bezier(0.16, 0.9, 0.2, 1) forwards; }
        .g3-out-takeover { animation: g3OutTakeover 0.5s cubic-bezier(0.7, 0, 0.85, 0.25) forwards; }
        @keyframes g3InTakeover {
          0%   { clip-path: polygon(0 51%, 100% 43%, 100% 49%, 0 57%); opacity: 0; }
          12%  { opacity: 1; }
          100% { clip-path: polygon(0 -40%, 100% -55%, 100% 152%, 0 140%); opacity: 1; }
        }
        @keyframes g3OutTakeover {
          0%   { clip-path: polygon(0 -40%, 100% -55%, 100% 152%, 0 140%); opacity: 1; }
          78%  { clip-path: polygon(0 51%, 100% 43%, 100% 49%, 0 57%); opacity: 1; }
          100% { clip-path: polygon(0 53%, 100% 46%, 100% 46%, 0 53%); opacity: 0; }
        }

        /* ---- Вспомогательные ---- */

        /* Диагональный блик 45° — общий для всех плашек. */
        .g3-gleam {
          position: absolute; top: -70%; bottom: -70%; width: 34%;
          transform: rotate(45deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent);
          animation: g3Gleam 6s cubic-bezier(0.4, 0, 0.25, 1) infinite;
          pointer-events: none; will-change: left;
        }
        .g3-gleam-dark { background: linear-gradient(90deg, transparent, rgba(4,18,43,0.10), transparent); }
        @keyframes g3Gleam {
          0%   { left: -60%; opacity: 0; }
          7%   { opacity: 1; }
          34%  { left: 150%; opacity: 0; }
          100% { left: 150%; opacity: 0; }
        }

        /* Дрейф диагональной штриховки фона. */
        .g3-drift { animation: g3Drift 10s linear infinite; }
        @keyframes g3Drift { 0% { background-position: 0 0; } 100% { background-position: 76px 76px; } }

        /* Снегопад. Дистанцию задаёт сам <Snowfall/> через --g3-fall: плашки живут
           внутри отмасштабированного контейнера 1920×1080, vh здесь непригоден. */
        @keyframes g3Snow {
          0%   { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
          10%  { opacity: var(--g3-op, 0.35); }
          88%  { opacity: var(--g3-op, 0.35); }
          100% { transform: translate3d(var(--g3-drift, 40px), var(--g3-fall, 900px), 0) rotate(210deg); opacity: 0; }
        }

        @keyframes g3Spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes g3MarqueeL { 0% { transform: translateX(0); }    100% { transform: translateX(-50%); } }
        @keyframes g3MarqueeR { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }

        @keyframes g3Blink { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
        .g3-blink { animation: g3Blink 1.1s ease-in-out infinite; }

        /* Поочерёдное проявление элементов внутри плашки. */
        .g3-stagger > * { animation: g3Pop 0.5s cubic-bezier(0.2, 0.9, 0.25, 1) backwards; }
        .g3-stagger > *:nth-child(1) { animation-delay: 0.10s; }
        .g3-stagger > *:nth-child(2) { animation-delay: 0.17s; }
        .g3-stagger > *:nth-child(3) { animation-delay: 0.24s; }
        .g3-stagger > *:nth-child(4) { animation-delay: 0.31s; }
        .g3-stagger > *:nth-child(5) { animation-delay: 0.38s; }
        .g3-stagger > *:nth-child(6) { animation-delay: 0.45s; }
        @keyframes g3Pop {
          0%   { opacity: 0; transform: translateY(18px); }
          100% { opacity: 1; transform: translateY(0); }
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
