import React, { useState, useEffect } from 'react';

// Появление/уход плашек лиги 3: диагональная шторка под 45° (clip-path polygon),
// а не «жалюзи» по вертикали как в дефолтной графике. Направление совпадает с
// диагоналями паттерна лиги, поэтому плашка выглядит «вырезанной» из него.
//
// Здесь же лежат ОБЩИЕ keyframes всего оверлея: AnimationWrapper используется
// каждой плашкой, значит стили гарантированно есть на экране ровно один раз.

export function AnimationWrapper({ isVisible, type, className = '', children }) {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    if (isVisible) setHasBeenVisible(true);
  }, [isVisible]);

  const activeClasses = !hasBeenVisible
    ? 'opacity-0 pointer-events-none'
    : isVisible
      ? 'tfh-reveal pointer-events-auto'
      : 'tfh-hide pointer-events-none';

  return (
    <>
      <style>{`
        .tfh-reveal { animation: tfhWipeIn 0.62s cubic-bezier(0.16, 0.9, 0.24, 1) forwards; }
        .tfh-hide   { animation: tfhWipeOut 0.42s cubic-bezier(0.7, 0.02, 0.86, 0.3) forwards; }

        /* Шторка идёт слева направо, её кромка наклонена на 45° (сдвиг низа на 30%). */
        @keyframes tfhWipeIn {
          0%   { clip-path: polygon(0 0, 0 0, -34% 100%, -34% 100%); opacity: 0; transform: translateX(-26px); }
          6%   { opacity: 1; }
          100% { clip-path: polygon(0 0, 150% 0, 116% 100%, 0 100%); opacity: 1; transform: translateX(0); }
        }
        @keyframes tfhWipeOut {
          0%   { clip-path: polygon(0 0, 150% 0, 116% 100%, 0 100%); opacity: 1; transform: translateX(0); }
          100% { clip-path: polygon(150% 0, 150% 0, 116% 100%, 116% 100%); opacity: 1; transform: translateX(22px); }
        }

        /* Диагональный блик — «луч» под тем же углом 45°, что и весь паттерн. */
        .tfh-sheen {
          position: absolute;
          top: -60%;
          bottom: -60%;
          width: 42%;
          transform: rotate(45deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent);
          animation: tfhSheen 5.5s cubic-bezier(0.4, 0, 0.25, 1) infinite;
          pointer-events: none;
          will-change: left;
        }
        .tfh-sheen-fast { animation-duration: 3.4s; }
        @keyframes tfhSheen {
          0%   { left: -70%; opacity: 0; }
          8%   { opacity: 1; }
          38%  { left: 150%; opacity: 0; }
          100% { left: 150%; opacity: 0; }
        }

        /* Медленный дрейф диагональной штриховки фона. */
        .tfh-drift { animation: tfhDrift 9s linear infinite; }
        @keyframes tfhDrift {
          0%   { background-position: 0 0; }
          100% { background-position: 74px 74px; }
        }

        /* Снежинки: падение с боковым сносом + вращение. Дистанцию падения задаёт
           сам <Snowfall/> через --tfh-snow-fall — vh здесь непригоден, плашки живут
           внутри отмасштабированного контейнера 1920×1080, а не во весь экран. */
        @keyframes tfhSnowFall {
          0%   { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
          10%  { opacity: var(--tfh-snow-op, 0.5); }
          88%  { opacity: var(--tfh-snow-op, 0.5); }
          100% { transform: translate3d(var(--tfh-snow-drift, 40px), var(--tfh-snow-fall, 800px), 0) rotate(220deg); opacity: 0; }
        }
        @keyframes tfhSpin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Диагональный бегущий текст (подложка крупных плашек). */
        @keyframes tfhTickerLeft  { 0% { transform: translateX(0); }      100% { transform: translateX(-50%); } }
        @keyframes tfhTickerRight { 0% { transform: translateX(-50%); }   100% { transform: translateX(0); } }

        /* Мягкое «дыхание» акцентных элементов. */
        @keyframes tfhBreathe {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1; }
        }
        .tfh-breathe { animation: tfhBreathe 2.4s ease-in-out infinite; }
      `}</style>

      <div
        className={`${className} ${activeClasses} transform-gpu`}
        style={{ WebkitFontSmoothing: 'antialiased' }}
      >
        {children}
      </div>
    </>
  );
}
