import React, { useState, useEffect } from 'react';
import { FONT_TEXT } from './theme';

// Появление/уход плашек лиги 3 + общие стили всего оверлея.
//
// Движение здесь «ледовое»: плавное скольжение и мягкое проявление, без рубящих
// шторок. Главный приём — КРУГОВОЕ раскрытие полноэкранных плашек: круг растёт
// из центра кадра, как шайба на вбрасывании, и повторяет форму эмблемы лиги.
//
// Reveal рендерит каждая плашка, поэтому здесь же лежат общие keyframes и
// подключение шрифтов — стили гарантированно есть в документе. @import стоит
// первой строкой блока: иначе браузер отбросит его как невалидный.

const VARIANTS = {
  full: ['g3-in-iris', 'g3-out-iris'],       // полный кадр: круговое раскрытие
  rise: ['g3-in-rise', 'g3-out-rise'],       // карточка события: подъём снизу
  slide: ['g3-in-slide', 'g3-out-slide'],    // табло и нижние плашки: выезд слева
};

export function Reveal({ isVisible, variant = 'full', className = '', style, children }) {
  // Стартовое значение — сам isVisible, а не false: если плашка смонтирована уже
  // видимой (восстановление overlay_state после перезагрузки OBS), при false
  // первый кадр уходил бы в opacity-0 и в эфире мигало бы пустое место.
  const [hasBeenVisible, setHasBeenVisible] = useState(isVisible);

  useEffect(() => {
    if (isVisible) setHasBeenVisible(true);
  }, [isVisible]);

  const [inCls, outCls] = VARIANTS[variant] || VARIANTS.full;

  const activeClasses = !hasBeenVisible
    ? 'opacity-0 pointer-events-none'
    : isVisible
      ? `${inCls} pointer-events-auto`
      : `${outCls} pointer-events-none`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');

        /* Шрифт заголовков лиги — тот же файл, что на сайте ТФХ.
           Лежит в LMS-Frontend/public/fonts/, отдаётся с корня. */
        @font-face {
          font-family: 'Aire Exterior';
          src: url('/fonts/AireExterior.ttf') format('truetype');
          font-display: swap;
        }

        /* Базовая гарнитура оверлея. Класс ставится на корень каждой плашки:
           контейнер страницы трансляции носит tailwind-класс font-sans, и без
           этого весь текст ушёл бы в системный шрифт, а не в шрифт лиги. */
        .g3 { font-family: ${FONT_TEXT}; -webkit-font-smoothing: antialiased; }

        /* ---- Полный кадр: круг раскрывается из центра ---- */
        .g3-in-iris  { animation: g3IrisIn 0.66s cubic-bezier(0.22, 0.9, 0.24, 1) forwards; }
        .g3-out-iris { animation: g3IrisOut 0.4s cubic-bezier(0.6, 0.02, 0.9, 0.3) forwards; }
        @keyframes g3IrisIn {
          0%   { clip-path: circle(0% at 50% 50%); opacity: 0; transform: scale(1.03); }
          10%  { opacity: 1; }
          100% { clip-path: circle(78% at 50% 50%); opacity: 1; transform: scale(1); }
        }
        @keyframes g3IrisOut {
          0%   { clip-path: circle(78% at 50% 50%); opacity: 1; transform: scale(1); }
          100% { clip-path: circle(78% at 50% 50%); opacity: 0; transform: scale(1.04); }
        }

        /* ---- Карточка события: подъём снизу ----
           Плашка уже спозиционирована через left-1/2, поэтому в кадрах живёт
           собственный translateX(-50%) — иначе она уехала бы вправо. */
        .g3-in-rise  { animation: g3RiseIn 0.56s cubic-bezier(0.16, 1.05, 0.3, 1) forwards; }
        .g3-out-rise { animation: g3RiseOut 0.34s cubic-bezier(0.6, 0.02, 0.9, 0.3) forwards; }
        @keyframes g3RiseIn {
          0%   { transform: translate(-50%, 46px); opacity: 0; }
          40%  { opacity: 1; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes g3RiseOut {
          0%   { transform: translate(-50%, 0); opacity: 1; }
          100% { transform: translate(-50%, 40px); opacity: 0; }
        }

        /* ---- Табло и нижние плашки: выезд слева ---- */
        .g3-in-slide  { animation: g3SlideIn 0.52s cubic-bezier(0.16, 1.05, 0.3, 1) forwards; }
        .g3-out-slide { animation: g3SlideOut 0.32s cubic-bezier(0.6, 0.02, 0.9, 0.3) forwards; }
        @keyframes g3SlideIn {
          0%   { transform: translateX(-46px); opacity: 0; }
          45%  { opacity: 1; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes g3SlideOut {
          0%   { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(-40px); opacity: 0; }
        }

        /* ==== Общие ==== */

        /* Блик по стеклу — светлая полоса, редко проходящая по плашке.
           Родитель обязан быть overflow:hidden. */
        .g3-sheen {
          position: absolute; top: -60%; bottom: -60%; width: 26%;
          transform: rotate(18deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent);
          animation: g3Sheen 7s cubic-bezier(0.4, 0, 0.3, 1) infinite;
          pointer-events: none; will-change: left;
        }
        @keyframes g3Sheen {
          0%   { left: -40%; opacity: 0; }
          8%   { opacity: 1; }
          36%  { left: 130%; opacity: 0; }
          100% { left: 130%; opacity: 0; }
        }

        @keyframes g3Spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        /* Мягкая пульсация — истекающий отсчёт, метка «в эфире». */
        @keyframes g3Breathe { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        .g3-breathe { animation: g3Breathe 1.15s ease-in-out infinite; }

        /* Счёт на голе: цифра «выпрыгивает» и возвращается. */
        @keyframes g3ScorePop {
          0%   { transform: scale(1); }
          14%  { transform: scale(1.55); }
          34%  { transform: scale(1.16); }
          54%  { transform: scale(1.34); }
          78%  { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        .g3-score-pop { animation: g3ScorePop 2.8s cubic-bezier(0.2, 0.9, 0.2, 1); display: inline-block; }

        /* Толчок табло на голе — короткий и мягкий: система светлая и спокойная,
           тряска «как от взрыва» ей не идёт. */
        @keyframes g3Nudge {
          0%, 100% { transform: translate3d(0, 0, 0); }
          18% { transform: translate3d(-4px, 1px, 0); }
          40% { transform: translate3d(3px, -1px, 0); }
          64% { transform: translate3d(-2px, 1px, 0); }
          84% { transform: translate3d(1px, 0, 0); }
        }
        .g3-nudge { animation: g3Nudge 0.62s ease-out; }

        /* Расходящееся кольцо на голе — «круги по льду» от места события. */
        @keyframes g3Ring {
          0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0.9; }
          100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
        }
        .g3-ring { animation: g3Ring 1.15s cubic-bezier(0.15, 0.7, 0.3, 1) forwards; }

        /* Поочерёдная сборка строк внутри плашки. */
        .g3-seq > * { animation: g3Step 0.46s cubic-bezier(0.16, 1.05, 0.32, 1) backwards; }
        .g3-seq > *:nth-child(1) { animation-delay: 0.10s; }
        .g3-seq > *:nth-child(2) { animation-delay: 0.17s; }
        .g3-seq > *:nth-child(3) { animation-delay: 0.24s; }
        .g3-seq > *:nth-child(4) { animation-delay: 0.31s; }
        .g3-seq > *:nth-child(5) { animation-delay: 0.38s; }
        .g3-seq > *:nth-child(6) { animation-delay: 0.45s; }
        @keyframes g3Step {
          0%   { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Ледяная пыль: медленный снос мелких частиц по светлой сцене.
           Дистанцию задаёт сам слой через --g3-dust-x/--g3-dust-y — vh здесь
           непригоден, плашки живут внутри отмасштабированного кадра 1920×1080. */
        @keyframes g3Dust {
          0%   { transform: translate3d(0, 0, 0); opacity: 0; }
          12%  { opacity: var(--g3-dust-op, 0.5); }
          88%  { opacity: var(--g3-dust-op, 0.5); }
          100% { transform: translate3d(var(--g3-dust-x, 60px), var(--g3-dust-y, 700px), 0); opacity: 0; }
        }
      `}</style>

      <div className={`g3 ${className} ${activeClasses} transform-gpu`} style={style}>
        {children}
      </div>
    </>
  );
}
