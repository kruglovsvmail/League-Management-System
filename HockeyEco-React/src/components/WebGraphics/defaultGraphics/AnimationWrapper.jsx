import React from 'react';

export function AnimationWrapper({ isVisible, type, className = '', children }) {
  // В новом дизайне мы используем единую резкую UI-анимацию для всех элементов
  // Плашка разворачивается из тонкой линии с небольшим scale-эффектом
  const activeClasses = isVisible
    ? 'animate-ui-reveal pointer-events-auto'
    : 'animate-ui-hide pointer-events-none';

  return (
    <>
      <style>{`
        /* Резкое UI-появление из центральной оси */
        .animate-ui-reveal {
          animation: uiReveal 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.1) forwards;
        }
        
        /* Быстрое схлопывание */
        .animate-ui-hide {
          animation: uiHide 0.35s cubic-bezier(0.55, 0.085, 0.68, 0.53) forwards;
        }

        /* Анимация пробегающего блика */
        .animate-glare {
          animation: sweepGlare 4s infinite;
        }

        @keyframes uiReveal {
          0% { 
            clip-path: inset(50% 0 50% 0); 
            transform: scaleY(0.01) scaleX(0.95); 
            opacity: 0; 
          }
          50% { 
            clip-path: inset(0 0 0 0); 
            transform: scaleY(1) scaleX(0.98); 
            opacity: 1; 
          }
          100% { 
            clip-path: inset(-20% -20% -20% -20%); 
            transform: scaleY(1) scaleX(1); 
            opacity: 1; 
          }
        }

        @keyframes uiHide {
          0% { 
            clip-path: inset(-20% -20% -20% -20%); 
            transform: scaleY(1) scaleX(1); 
            opacity: 1; 
          }
          40% { 
            clip-path: inset(0 0 0 0); 
            transform: scaleY(1) scaleX(0.98); 
            opacity: 1; 
          }
          100% { 
            clip-path: inset(50% 0 50% 0); 
            transform: scaleY(0.01) scaleX(0.95); 
            opacity: 0; 
          }
        }

        @keyframes sweepGlare {
          0% { left: -100%; opacity: 0; }
          10% { opacity: 1; }
          30% { left: 200%; opacity: 0; }
          100% { left: 200%; opacity: 0; }
        }
      `}</style>

      {/* Обертка с базовыми оптимизациями */}
      <div 
        className={`${className} ${activeClasses} transform-gpu`}
        style={{ WebkitFontSmoothing: 'antialiased' }}
      >
        {children}
      </div>
    </>
  );
}