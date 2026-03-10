import React, { useEffect, useState } from 'react';

export function Toast({ title, message, type = 'info', onClose }) {
  const [isHiding, setIsHiding] = useState(false);

  // Стили для разных типов
  const types = {
    info: { bg: 'bg-[#007AFF]/20', iconColor: 'text-status-pending', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> },
    success: { bg: 'bg-[#1AA72F]/20', iconColor: 'text-status-accepted', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> },
    error: { bg: 'bg-[#FF453A]/20', iconColor: 'text-status-rejected', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> }
  };

  const current = types[type];

  // Автоматическое закрытие через 5 секунд
  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, 2000);
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
      onAnimationEnd={handleAnimationEnd}
      // ДОБАВЛЕНЫ КЛАССЫ: fixed bottom-6 right-6 z-[9999]
      className={`fixed bottom-2 right-2 z-[9999] backdrop-blur-md text-graphite p-4 rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.08)] flex items-start gap-3.5 w-[300px] font-sans ${current.bg} ${isHiding ? 'animate-slide-out' : 'animate-slide-in'}`}
    >
      <div className={`mt-0.5 text-[1.3rem] ${current.iconColor}`}>
        {current.icon}
      </div>
      <div className="flex-1 flex flex-col gap-1">
        <span className="font-bold text-[0.95rem] tracking-[0.2px]">{title}</span>
        <span className="text-[0.85rem] text-graphite-light font-medium leading-[1.4]">{message}</span>
      </div>
      <div 
        onClick={handleClose}
        className="cursor-pointer text-graphite-light text-[1.2rem] leading-none transition-colors duration-200 hover:text-graphite"
      >
        ×
      </div>
    </div>
  );
}