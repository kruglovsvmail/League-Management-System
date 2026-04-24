import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export function DateTimePicker({ value, onChange, placeholder = "Дата и время" }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  
  // Состояния для даты и времени
  const initialDate = value ? new Date(value) : new Date();
  const [viewDate, setViewDate] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(value ? initialDate : null);
  
  const [time, setTime] = useState(() => {
    if (!value) return '12:00';
    const d = new Date(value);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  const updatePosition = () => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const popupWidth = 260; 
      const popupHeight = 360; 
      const gap = 8;
      let calculatedLeft = rect.left;
      let calculatedTop = rect.bottom + window.scrollY + gap;
      if (calculatedLeft + popupWidth > window.innerWidth - 20) calculatedLeft = rect.right - popupWidth;
      if (calculatedLeft < 10) calculatedLeft = 10;
      if (rect.bottom + popupHeight + gap > window.innerHeight && rect.top - popupHeight - gap > 0) {
        calculatedTop = rect.top + window.scrollY - popupHeight - gap;
      }
      setCoords({ left: calculatedLeft, top: calculatedTop });
    }
  };

  useEffect(() => {
    updatePosition();
    if (isOpen) {
      window.addEventListener('scroll', updatePosition, { passive: true });
      window.addEventListener('resize', updatePosition);
    }
    return () => { window.removeEventListener('scroll', updatePosition); window.removeEventListener('resize', updatePosition); };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target) && !e.target.closest('.datetimepicker-portal')) {
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

  // Отправка итогового значения наверх
  const emitChange = (d, t) => {
    if (!d) return onChange(null);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onChange(`${dateStr} ${t}:00`); // Формат для БД
  };

  const handleSelectDate = (dayNum) => {
    const d = new Date(year, month, dayNum);
    setSelectedDate(d);
    emitChange(d, time);
  };

  const handleTimeChange = (e) => {
    const newTime = e.target.value;
    setTime(newTime);
    if (selectedDate) emitChange(selectedDate, newTime);
  };

  const handleReset = (e) => {
    e.stopPropagation();
    setSelectedDate(null);
    setTime('12:00');
    onChange(null);
    setIsOpen(false);
  };

  // Красивое отображение в инпуте
  const displayValue = selectedDate ? `${selectedDate.toLocaleDateString('ru-RU')} в ${time}` : '';

  return (
    <div className="relative font-sans w-full" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-[10px] rounded-md bg-white border cursor-pointer flex justify-between items-center transition-all duration-300 hover:border-orange ${isOpen ? 'border-orange shadow-[0_0_0_3px_rgba(255,122,0,0.2)]' : 'border-graphite/40'}`}
      >
        <span className={`text-[13px] font-semibold truncate ${value ? 'text-graphite' : 'text-graphite/40'}`}>
          {displayValue || placeholder}
        </span>
        <svg className={`w-4 h-4 shrink-0 transition-colors duration-300 ${value ? 'text-graphite-light' : 'text-graphite/40'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>

      {isOpen && createPortal(
        <div 
          className="datetimepicker-portal absolute bg-white/95 backdrop-blur-xl rounded-xl border border-graphite/10 shadow-[0_15px_35px_rgba(0,0,0,0.15)] z-[100000] animate-zoom-in p-4 w-[260px]"
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
        >
          <div className="flex justify-between items-center mb-3 text-sm font-bold text-graphite">
            <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-orange/10 hover:text-orange transition-colors">&lt;</button>
            <span>{monthNames[month]} {year}</span>
            <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-orange/10 hover:text-orange transition-colors">&gt;</button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-3">
            {dayNames.map(d => <div key={d} className="text-[10px] text-graphite-light font-bold">{d}</div>)}
            {Array.from({ length: 42 }).map((_, i) => {
              const dayNum = i - firstDayIndex + 1;
              const isCurrentMonth = dayNum > 0 && dayNum <= daysInMonth;
              if (!isCurrentMonth) return <div key={i} className="h-7"></div>;

              const isSelected = selectedDate && selectedDate.getDate() === dayNum && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;

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

          {/* Блок выбора времени */}
          <div className="border-t border-graphite/10 pt-3 mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Время матча</span>
            <input 
              type="time" 
              value={time} 
              onChange={handleTimeChange}
              className="bg-graphite/5 border border-graphite/10 text-graphite font-bold text-[13px] px-2 py-1 rounded-md outline-none focus:border-orange transition-colors"
            />
          </div>

          <div className="border-t border-graphite/10 pt-2 flex justify-center mt-2">
            <button onClick={handleReset} className="text-[11px] font-bold text-status-rejected hover:text-status-rejected-hover uppercase tracking-wide">
              Сбросить
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}