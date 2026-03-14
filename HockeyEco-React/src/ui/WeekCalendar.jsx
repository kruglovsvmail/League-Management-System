import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';

dayjs.locale('ru');

export function WeekCalendar({ onWeekChange }) {
  const getMonday = (date) => {
    const d = dayjs(date);
    const day = d.day();
    const diff = day === 0 ? 6 : day - 1; 
    return d.subtract(diff, 'day').startOf('day');
  };

  const [currentMonday, setCurrentMonday] = useState(getMonday(dayjs()));
  // По умолчанию календарь свернут (false). Если хотите, чтобы он был открыт сразу, поставьте true
  const [isOpen, setIsOpen] = useState(false); 
  const [viewDate, setViewDate] = useState(dayjs().startOf('month'));

  const currentSunday = currentMonday.add(6, 'day').endOf('day');

  // Коллбек передачи дат наверх
  useEffect(() => {
    if (onWeekChange) onWeekChange(currentMonday.toDate(), currentSunday.toDate());
  }, [currentMonday]);

  // Навигация
  const handlePrevWeek = (e) => { e.stopPropagation(); setCurrentMonday(prev => prev.subtract(7, 'day')); };
  const handleNextWeek = (e) => { e.stopPropagation(); setCurrentMonday(prev => prev.add(7, 'day')); };
  const handlePrevMonth = (e) => { e.stopPropagation(); setViewDate(prev => prev.subtract(1, 'month')); };
  const handleNextMonth = (e) => { e.stopPropagation(); setViewDate(prev => prev.add(1, 'month')); };

  // Выбор НЕДЕЛИ: просто меняем дату, но НЕ закрываем календарь
  const handleWeekSelect = (mondayOfWeek) => {
    setCurrentMonday(mondayOfWeek);
  };

  // Генерация сетки из 6 строк (по 7 дней)
  const generateCalendarWeeks = () => {
    const startOfMonth = viewDate.startOf('month');
    const firstDayOfGrid = getMonday(startOfMonth);
    const weeks = [];
    for (let i = 0; i < 6; i++) {
      const week = [];
      for (let j = 0; j < 7; j++) {
        week.push(firstDayOfGrid.add(i * 7 + j, 'day'));
      }
      weeks.push(week);
    }
    return weeks;
  };

  const weeksGrid = generateCalendarWeeks();
  const weekDaysShort = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  // Тексты для UI
  const startStr = currentMonday.format('D MMM');
  const endStr = currentSunday.format('D MMM YYYY');
  const monthNameRaw = viewDate.format('MMMM YYYY');
  const monthName = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);

  return (
    <div className="flex flex-col gap-2 font-sans w-full">
      <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">
        Игровая неделя
      </span>
      
      {/* Главная кнопка-индикатор */}
      <div 
        className={`flex items-center justify-between bg-white border rounded-lg p-1 transition-all duration-300 cursor-pointer ${isOpen ? 'border-orange shadow-[0_0_0_3px_rgba(255,107,0,0.1)]' : 'border-graphite/20 shadow-sm hover:border-orange/50'}`}
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) setViewDate(currentMonday.startOf('month')); 
        }}
      >
        <button onClick={handlePrevWeek} className="w-8 h-8 flex items-center justify-center rounded text-graphite-light hover:bg-orange/10 hover:text-orange transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        
        <div className="flex-1 text-center select-none" title="Развернуть календарь">
          <span className={`text-[13px] font-bold transition-colors ${isOpen ? 'text-orange' : 'text-graphite'}`}>
            {startStr} — {endStr}
          </span>
        </div>

        <button onClick={handleNextWeek} className="w-8 h-8 flex items-center justify-center rounded text-graphite-light hover:bg-orange/10 hover:text-orange transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* Разворачиваемая часть (Аккордеон) */}
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="bg-white/60 border border-graphite/10 rounded-xl p-3 mt-1 shadow-inner">
            
            {/* Шапка (Месяц) */}
            <div className="flex justify-between items-center mb-3">
              <button onClick={handlePrevMonth} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-graphite-light transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="text-[13px] font-bold text-graphite tracking-tight select-none">
                {monthName}
              </span>
              <button onClick={handleNextMonth} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-graphite-light transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>

            {/* Дни недели */}
            <div className="grid grid-cols-7 mb-1.5 text-center">
              {weekDaysShort.map((day, i) => (
                <span key={i} className={`text-[10px] font-black uppercase tracking-wider ${i >= 5 ? 'text-status-rejected/60' : 'text-graphite-light/60'}`}>
                  {day}
                </span>
              ))}
            </div>

            {/* Сетка НЕДЕЛЬ (строчками) */}
            <div className="flex flex-col gap-0.5 relative">
              {weeksGrid.map((week, wIdx) => {
                const weekMonday = week[0];
                const isSelectedWeek = currentMonday.isSame(weekMonday, 'day');

                return (
                  <div 
                    key={wIdx}
                    onClick={() => handleWeekSelect(weekMonday)}
                    className={`grid grid-cols-7 rounded-md cursor-pointer transition-colors duration-150 relative overflow-hidden group ${
                      isSelectedWeek ? 'bg-orange/10' : 'hover:bg-white hover:shadow-sm'
                    }`}
                  >
                    {/* Красивый акцент слева для выбранной недели */}
                    <div className={`absolute left-0 top-0 bottom-0 w-[3px] transition-colors z-20 ${isSelectedWeek ? 'bg-orange' : 'group-hover:bg-orange/30'}`}></div>
                    
                    {/* Дни текущей недели */}
                    {week.map((day, dIdx) => {
                      const isCurrentMonth = day.month() === viewDate.month();
                      const isToday = day.isSame(dayjs(), 'day');

                      return (
                        <div key={dIdx} className={`flex items-center justify-center h-7 select-none ${!isSelectedWeek && !isCurrentMonth ? 'opacity-30' : 'opacity-100'}`}>
                          <span className={`text-[12px] font-bold z-10 
                            ${isSelectedWeek ? 'text-orange' : 'text-graphite'} 
                            ${isToday && !isSelectedWeek ? 'border-b-[1.5px] border-status-rejected text-status-rejected' : ''}
                          `}>
                            {day.format('D')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Возврат к сегодня */}
            <div className="mt-3 flex justify-center pt-2 border-t border-graphite/5">
              <button 
                onClick={() => handleWeekSelect(getMonday(dayjs()))}
                className="text-[10px] font-bold text-graphite-light hover:text-orange uppercase tracking-wider transition-colors"
              >
                Выбрать текущую неделю
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}