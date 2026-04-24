import React, { useState, useEffect } from 'react';

export function OrientationGuard({ children }) {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Считаем мобильным устройством всё, что по ширине/высоте похоже на телефон или планшет (например, до 820px)
      const isMobileSize = window.innerWidth <= 820 || window.innerHeight <= 820; 
      // Проверяем, что высота больше ширины (вертикальная ориентация)
      const isPortraitMode = window.innerHeight > window.innerWidth;
      
      setIsPortrait(isMobileSize && isPortraitMode);
    };

    // Проверяем при загрузке
    checkOrientation();
    
    // Слушаем изменения экрана и повороты устройства
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  return (
    <>
      {children}
      
      {/* Заглушка, которая перекрывает весь интерфейс */}
      {isPortrait && (
        <div className="fixed inset-0 z-[9999999] bg-graphite flex flex-col items-center justify-center p-6 text-center text-white backdrop-blur-md animate-zoom-in touch-none">
          <div className="mb-8 relative flex items-center justify-center w-32 h-32 rounded-full bg-white/5 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.3)]">
            
            {/* Анимированная иконка телефона */}
            <svg 
              className="w-16 h-16 text-orange animate-rotate-phone origin-center drop-shadow-lg" 
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <rect x="5" y="2" width="14" height="20" rx="3" ry="3" strokeWidth="2"/>
              {/* Кнопка home / динамик */}
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01 M12 5h.01"/>
            </svg>

          </div>
          
          <h2 className="text-2xl font-black uppercase tracking-widest mb-4">
            Поверните устройство
          </h2>
          
          <p className="text-[14px] text-white/60 font-medium max-w-[320px] leading-relaxed">
            HockeyEco LMS использует сложные таблицы и панели трансляций, которые требуют <span className="text-white font-bold">горизонтальной</span> ориентации экрана.
          </p>
        </div>
      )}
    </>
  );
}