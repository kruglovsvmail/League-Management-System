import React, { useState, useEffect } from 'react';

export function Calendar({ label = "Календарь", value, onChange, disabled = false }) {
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) setViewDate(d);
    }
  }, [value]);

  const today = new Date();
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let firstDayIndex = new Date(year, month, 1).getDay() - 1;
  if (firstDayIndex === -1) firstDayIndex = 6;

  const totalCells = 42;

  const changeMonth = (offset) => {
    setViewDate(new Date(year, month + offset, 1));
  };

  const handleDayClick = (dayNumber) => {
    const newDate = new Date(year, month, dayNumber);
    newDate.setHours(12, 0, 0, 0); 
    if (onChange) onChange(newDate);
  };

  const parsedValue = value ? new Date(value) : null;
  const isValidValue = parsedValue && !isNaN(parsedValue.getTime());

  return (
    <div className={`bg-white/60 border border-black/5 rounded-lg p-4 flex flex-col font-sans backdrop-blur-md shadow-sm h-[360px] w-full max-w-sm overflow-hidden mx-auto ${disabled ? 'opacity-80' : ''}`}>
      <div className="flex justify-between items-center mb-3 font-bold text-sm text-graphite">
        <button 
          onClick={() => !disabled && changeMonth(-1)} 
          className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${disabled ? 'opacity-50 cursor-not-allowed text-graphite-light' : 'hover:bg-orange/10 text-graphite-light hover:text-orange'}`}
        >
          &lt;
        </button>
        <span className="text-center">{monthNames[month]} {year}</span>
        <button 
          onClick={() => !disabled && changeMonth(1)} 
          className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${disabled ? 'opacity-50 cursor-not-allowed text-graphite-light' : 'hover:bg-orange/10 text-graphite-light hover:text-orange'}`}
        >
          &gt;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center grow content-start">
        {dayNames.map(name => (
          <div key={name} className="text-[0.65rem] text-graphite-light font-black uppercase mb-1">
            {name}
          </div>
        ))}
        
        {Array.from({ length: totalCells }).map((_, index) => {
          const dayNumber = index - firstDayIndex + 1;
          const isCurrentMonth = dayNumber > 0 && dayNumber <= daysInMonth;

          if (!isCurrentMonth) {
            return <div key={`empty-${index}`} className="h-8 py-1 opacity-0 pointer-events-none">.</div>;
          }

          const isToday = dayNumber === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          const isSelected = isValidValue && dayNumber === parsedValue.getDate() && month === parsedValue.getMonth() && year === parsedValue.getFullYear();

          return (
            <div 
              key={`day-${dayNumber}`}
              onClick={() => !disabled && handleDayClick(dayNumber)}
              className={`
                relative h-8 text-[0.8rem] rounded-md transition-all duration-200 font-semibold flex items-center justify-center
                ${disabled ? (isSelected ? 'bg-orange/70 text-white cursor-default' : 'text-graphite/40 cursor-not-allowed') : 'cursor-pointer'}
                ${!disabled && isSelected ? 'bg-orange text-white shadow-md z-10 scale-105' : ''}
                ${!disabled && !isSelected ? 'hover:bg-orange/10 hover:text-orange text-graphite' : ''}
                ${isToday && !isSelected ? 'text-orange ring-1 ring-orange/30' : ''}
              `}
            >
              {dayNumber}
              {isToday && (
                <div className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-0.5 h-0.5 rounded-full ${isSelected ? 'bg-white' : 'bg-orange'}`}></div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-auto border-t border-black/5 pt-3">
        <div className="flex justify-between items-center h-8">
          <div className="flex flex-col">
            <span className="text-[0.75rem] font-bold text-graphite leading-tight">
              {isValidValue
                ? `${parsedValue.getDate()} ${monthNames[parsedValue.getMonth()].toLowerCase().replace(/ь$/, 'я').replace(/т$/, 'та')} ${parsedValue.getFullYear()}` 
                : 'Дата не выбрана'}
            </span>
          </div>
          {isValidValue && !disabled && (
            <button 
              onClick={() => onChange && onChange(null)} 
              className="text-[0.65rem] text-graphite-light hover:text-status-rejected font-bold uppercase transition-colors"
            >
              Сбросить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}