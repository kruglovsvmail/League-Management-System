import React from 'react';

export function AnimationWrapper({ isVisible, type, className = '', children }) {
  const animationStyles = {
    'scoreboard': 'slide-left',
    'arena': 'slide-left',
    'commentator': 'slide-left',
    'referees': 'slide-left',
    'prematch': 'fade-scale',
    'team_leaders': 'fade-scale',
    'team_roster': 'fade-scale',
    'intermission': 'fade-scale',
    'event': 'expand-point'
  };

  const animation = animationStyles[type] || 'fade-scale';
  let activeClasses = '';

  // 1. Выезд слева (Только Transform + Opacity)
  if (animation === 'slide-left') {
    activeClasses = isVisible
      ? 'opacity-100 translate-x-0 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]'
      : 'opacity-0 -translate-x-12 pointer-events-none transition-[transform,opacity] duration-400 ease-in';
  }
  
  // 2. Кинематографичный 3D-показ (Моя авторская анимация вместо старого fade-scale)
  else if (animation === 'fade-scale') {
    activeClasses = isVisible ? 'animate-epic-in' : 'animate-epic-out pointer-events-none';
  }
  
  // 3. Раскрытие из точки (ширина -> высота)
  else if (animation === 'expand-point') {
    activeClasses = isVisible ? 'animate-expand-in' : 'animate-expand-out pointer-events-none';
  }

  return (
    <>
      {(animation === 'expand-point' || animation === 'fade-scale') && (
        <style>{`
          /* --- Анимация expand-point --- */
          .animate-expand-in {
            animation: expandIn 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          }
          .animate-expand-out {
            animation: expandOut 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          }

          @keyframes expandIn {
            0% { clip-path: inset(50% 50%); opacity: 0; }
            5% { clip-path: inset(50% 50%); opacity: 1; }
            40% { clip-path: inset(50% -50%); opacity: 1; }
            100% { clip-path: inset(-50% -50%); opacity: 1; }
          }

          @keyframes expandOut {
            0% { clip-path: inset(-50% -50%); opacity: 1; }
            30% { clip-path: inset(50% -50%); opacity: 1; }
            80% { clip-path: inset(50% 50%); opacity: 1; }
            100% { clip-path: inset(50% 50%); opacity: 0; }
          }

          /* --- Эффектная 3D-анимация (Cinematic Broadcast) --- */
          .animate-epic-in {
            /* Используем пружинистый cubic-bezier для эффекта "щелчка" в конце */
            animation: epicIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.1) forwards;
          }
          .animate-epic-out {
            /* Плавное, но быстрое затухание назад в глубину */
            animation: epicOut 0.5s cubic-bezier(0.55, 0.085, 0.68, 0.53) forwards;
          }

          @keyframes epicIn {
            0% {
              opacity: 0;
              transform: perspective(1000px) rotateY(-40deg) translateZ(-100px);
              filter: blur(12px);
              clip-path: polygon(0 0, 0 0, 0 100%, 0% 100%);
            }
            60% {
              opacity: 1;
              transform: perspective(1000px) rotateY(5deg) translateZ(15px);
              filter: blur(0px);
              clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
            }
            100% {
              opacity: 1;
              transform: perspective(1000px) rotateY(0deg) translateZ(0);
              filter: blur(0px);
              clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
            }
          }

          @keyframes epicOut {
            0% {
              opacity: 1;
              transform: perspective(1000px) rotateY(0deg) translateZ(0);
              filter: blur(0px);
              clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
            }
            100% {
              opacity: 0;
              transform: perspective(1000px) rotateY(40deg) translateZ(-100px);
              filter: blur(12px);
              /* Схлопываем маску вправо */
              clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%);
            }
          }
        `}</style>
      )}

      {/* Обертка с базовыми оптимизациями */}
      <div 
        className={`${className} ${activeClasses} origin-center`}
        style={{ WebkitFontSmoothing: 'antialiased', transformStyle: 'preserve-3d' }}
      >
        {children}
      </div>
    </>
  );
}