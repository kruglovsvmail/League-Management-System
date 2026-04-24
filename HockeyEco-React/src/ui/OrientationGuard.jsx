import React, { useState, useEffect } from 'react';

export function OrientationGuard({ children }) {
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      // 1. Проверяем, что это мобильное устройство или планшет (ширина меньше 850px)
      // Берем screen.width для надежности на телефонах
      const isMobile = window.innerWidth <= 850 || window.screen.width <= 850; 
      
      // 2. Используем нативный медиа-запрос браузера для 100% точного определения портрета
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      
      // Выводим в консоль для отладки
      console.log(`[Guard] Ширина: ${window.innerWidth}, Мобилка: ${isMobile}, Портрет: ${isPortrait}`);
      
      setIsBlocked(isMobile && isPortrait);
    };

    checkOrientation();
    
    // Слушаем изменение размера окна (поворот экрана на телефоне)
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
      
      {/* Заглушка. style={{ zIndex }} используем напрямую, чтобы Tailwind точно не обрезал его */}
      {isBlocked && (
        <div 
          style={{ zIndex: 9999999 }}
          className="fixed inset-0 w-full h-full bg-graphite flex flex-col items-center justify-center p-6 text-center text-white backdrop-blur-xl touch-none"
        >
          <div className="mb-8 relative flex items-center justify-center w-32 h-32 rounded-full bg-white/5 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.3)]">
            
            <svg 
              className="w-16 h-16 text-orange animate-rotate-phone origin-center drop-shadow-lg" 
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <rect x="5" y="2" width="14" height="20" rx="3" ry="3" strokeWidth="2"/>
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