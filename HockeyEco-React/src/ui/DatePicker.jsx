import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export function DatePicker({ value, onChange, placeholder = "Выберите дату" }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());

  // --- УМНОЕ ПОЗИЦИОНИРОВАНИЕ ---
  const updatePosition = () => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const popupWidth = 260; 
      const popupHeight = 310; // Примерная высота самого календаря
      const gap = 8; // Отступ от инпута

      let calculatedLeft = rect.left;
      let calculatedTop = rect.bottom + window.scrollY + gap; // По умолчанию открываем вниз

      // 1. Проверка по горизонтали (Ось X)
      if (calculatedLeft + popupWidth > window.innerWidth - 20) {
        // Если вылезает справа — выравниваем по правому краю инпута
        calculatedLeft = rect.right - popupWidth;
      }
      if (calculatedLeft < 10) {
        // Если после выравнивания вылез слева — прижимаем к левому краю экрана
        calculatedLeft = 10;
      }

      // 2. Проверка по вертикали (Ось Y)
      if (rect.bottom + popupHeight + gap > window.innerHeight) {
        // Если внизу нет места, проверяем есть ли место сверху
        if (rect.top - popupHeight - gap > 0) {
          // Открываем ВВЕРХ
          calculatedTop = rect.top + window.scrollY - popupHeight - gap;
        }
      }

      setCoords({ left: calculatedLeft, top: calculatedTop });
    }
  };

  // Пересчитываем позицию при открытии
  useEffect(() => {
    updatePosition();
    
    // Опционально: пересчитываем позицию при скролле (чтобы календарь не отрывался от инпута)
    if (isOpen) {
      window.addEventListener('scroll', updatePosition, { passive: true });
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target) && !e.target.closest('.datepicker-portal')) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let firstDayIndex = new Date(year, month, 1).getDay() - 1;
  if (firstDayIndex === -1) firstDayIndex = 6;

  const handleSelectDate = (day) => {
    const selected = new Date(year, month, day);
    const formatted = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const handleReset = (e) => {
    e.stopPropagation();
    onChange(null);
    setIsOpen(false);
  };

  const displayValue = value ? new Date(value).toLocaleDateString('ru-RU') : '';

  return (
    <div className="relative font-sans w-full" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-[10px] rounded-md bg-white/60 border cursor-pointer flex justify-between items-center transition-all duration-300 hover:border-orange hover:bg-white ${isOpen ? 'border-orange bg-white shadow-[0_0_0_3px_rgba(255,122,0,0.2)]' : 'border-graphite/20'}`}
      >
        <span className={`text-[14px] font-semibold truncate ${value ? 'text-graphite' : 'text-graphite/40'}`}>
          {displayValue || placeholder}
        </span>
        {/* Смягченная и изящная иконка */}
        <svg 
          className={`w-[18px] h-[18px] shrink-0 ml-2 transition-colors duration-300 ${value ? 'text-graphite-light' : 'text-graphite/40'}`} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>

      {isOpen && createPortal(
        <div 
          className="datepicker-portal absolute bg-white/95 backdrop-blur-xl rounded-xl border border-graphite/10 shadow-[0_15px_35px_rgba(0,0,0,0.15)] z-[100000] animate-fade-in-down p-4 w-[260px]"
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
        >
          <div className="flex justify-between items-center mb-3 text-sm font-bold text-graphite">
            <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-orange/10 hover:text-orange transition-colors">&lt;</button>
            <span>{monthNames[month]} {year}</span>
            <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-orange/10 hover:text-orange transition-colors">&gt;</button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {dayNames.map(d => <div key={d} className="text-[10px] text-graphite-light font-bold">{d}</div>)}
            {Array.from({ length: 42 }).map((_, i) => {
              const dayNum = i - firstDayIndex + 1;
              const isCurrentMonth = dayNum > 0 && dayNum <= daysInMonth;
              if (!isCurrentMonth) return <div key={i} className="h-7"></div>;

              const isSelected = value && new Date(value).getDate() === dayNum && new Date(value).getMonth() === month && new Date(value).getFullYear() === year;

              return (
                <div 
                  key={i} 
                  onClick={() => handleSelectDate(dayNum)}
                  className={`h-7 flex items-center justify-center text-[12px] font-semibold rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-orange text-white' : 'text-graphite hover:bg-orange/10 hover:text-orange'}`}
                >
                  {dayNum}
                </div>
              );
            })}
          </div>

          <div className="border-t border-graphite/10 pt-2 flex justify-center mt-2">
            <button onClick={handleReset} className="text-[11px] font-bold text-status-rejected hover:text-status-rejected-hover uppercase tracking-wide">
              Сбросить дату
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}