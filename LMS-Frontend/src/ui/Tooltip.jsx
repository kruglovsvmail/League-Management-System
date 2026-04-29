import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export function Tooltip({ children, logo, title, subtitle, position = 'top', noUnderline = false }) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: -9999, left: -9999 });
  
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timerRef = useRef(null); // Реф для таймера задержки

  // --- НАСТРОЙКА 1: ЗАДЕРЖКА ПОЯВЛЕНИЯ ---
  // 300 мс — оптимальное время, чтобы отсечь случайные проведения мышкой
  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 500); 
  };

  // Если мышка ушла с элемента до истечения 300мс — отменяем появление
  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
  };

  // Очистка таймера при удалении компонента из DOM
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let left = 0;
      let top = 0;

      // Вычисляем позицию в зависимости от пропса
      if (position === 'left') {
        left = triggerRect.left - tooltipRect.width - 12;
        top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
        
        // Защита от выхода за левый край экрана
        if (left < 10) {
          left = triggerRect.right + 12;
        }
      } else {
        // Стандартное поведение (сверху)
        left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
        top = triggerRect.top - tooltipRect.height - 8; 

        if (top < 10) top = triggerRect.bottom + 8;
        if (left < 10) left = 10;
        else if (left + tooltipRect.width > window.innerWidth - 10) left = window.innerWidth - tooltipRect.width - 10;
      }

      setCoords({ left: left + window.scrollX, top: top + window.scrollY });
    }
  }, [isVisible, position]);

  useEffect(() => {
    const handleScroll = () => setIsVisible(false);
    if (isVisible) {
      window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
      window.addEventListener('resize', handleScroll);
    }
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleScroll);
    };
  }, [isVisible]);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="inline-block relative cursor-pointer"
    >
      {/* Если передали noUnderline - выводим без span с пунктиром */}
      {noUnderline ? (
        children
      ) : (
        <span className="border-b border-dashed border-graphite/40 hover:border-orange transition-colors">
          {children}
        </span>
      )}

      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          // --- НАСТРОЙКА 2: СКОРОСТЬ АНИМАЦИИ ---
          // duration-200 (200мс) — это скорость изменения прозрачности. 
          // Можете заменить на duration-300 или duration-500, если хотите медленнее.
          className="absolute z-[100010] bg-white/90 backdrop-blur-[10px] border border-graphite/10 shadow-[0_15px_35px_rgba(0,0,0,0.15)] rounded-md p-3 flex items-start gap-3.5 pointer-events-none animate-zoom-in transition-opacity duration-200"
          style={{ left: coords.left, top: coords.top }}
        >
          {logo && (
            <div className="w-[46px] h-[46px] shrink-0 rounded-lg p-1 flex justify-center items-center overflow-hidden bg-white/50 border border-graphite/5 mt-0.5">
              <img src={logo} alt="Логотип" className="w-full h-full object-contain" />
            </div>
          )}
          <div className="flex flex-col min-w-[120px] max-w-[260px]">
            <span className="text-[13px] font-bold text-graphite leading-tight">
              {title || 'Нет данных'}
            </span>
            {subtitle && (
              <span className="text-[11px] text-graphite-light font-medium mt-1 leading-relaxed">
                {subtitle}
              </span>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}