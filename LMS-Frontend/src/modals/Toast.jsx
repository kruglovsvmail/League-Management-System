import React, { useEffect, useState } from 'react';

export function Toast({ title, message, type = 'info', onClose }) {
  const [isHiding, setIsHiding] = useState(false);

  // Стили для разных типов. Подложка плотная: тост всплывает и над светлыми страницами,
  // и над тёмной панелью таймера — полупрозрачный там не читался. Тип — оттенком и полоской слева.
  const types = {
    info: { tint: 'bg-status-pending/10', stripe: 'bg-status-pending', iconColor: 'text-status-pending', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> },
    success: { tint: 'bg-status-accepted/10', stripe: 'bg-status-accepted', iconColor: 'text-status-accepted', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> },
    error: { tint: 'bg-status-rejected/10', stripe: 'bg-status-rejected', iconColor: 'text-status-rejected', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> }
  };

  const current = types[type];

  // Автоматическое закрытие через 8 секунд — длинную ошибку ввода успеть прочитать
  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsHiding(true);
  };

  const handleAnimationEnd = () => {
    if (isHiding && onClose) onClose();
  };

  return (
    <div 
      onClick={handleClose} // ДОБАВЛЕНО: Закрытие по клику на весь блок
      onAnimationEnd={handleAnimationEnd}
      // ДОБАВЛЕН КЛАСС cursor-pointer для смены курсора при наведении
      className={`cursor-pointer fixed bottom-2 right-2 z-[100020] overflow-hidden bg-white text-graphite p-4 pl-5 rounded-lg ring-1 ring-graphite/10 shadow-[0_10px_40px_rgba(0,0,0,0.25)] flex items-start gap-3.5 w-[300px] font-sans transition-opacity hover:opacity-95 ${isHiding ? 'animate-slide-out' : 'animate-slide-in'}`}
    >
      <span className={`absolute inset-0 pointer-events-none ${current.tint}`} />
      <span className={`absolute left-0 inset-y-0 w-1 pointer-events-none ${current.stripe}`} />
      <div className={`relative mt-0.5 text-[1.3rem] ${current.iconColor}`}>
        {current.icon}
      </div>
      <div className="relative flex-1 flex flex-col gap-1">
        <span className="font-bold text-[0.95rem] tracking-[0.2px]">{title}</span>
        <span className="text-[0.85rem] text-graphite-light font-medium leading-[1.4]">{message}</span>
      </div>
      <div className="relative text-graphite-light text-[1.2rem] leading-none transition-colors duration-200 hover:text-graphite">
        ×
      </div>
    </div>
  );
}