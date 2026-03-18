import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function Modal({ isOpen, onClose, title, children, size = 'default' }) {
  // Блокировка скролла страницы при открытой модалке
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    // Очистка при размонтировании компонента
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    normal: 'max-w-[500px]',
    medium: 'max-w-[550px]',
    wide: 'max-w-[800px]',
    wide2: 'max-w-[1100px]',
    'extra-wide': 'max-w-[1200px]',
  };

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 sm:p-6">
      {/* Затемнение фона */}
      <div 
        className="absolute inset-0 bg-graphite/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Контейнер модального окна */}
      <div className={`relative w-full ${sizeClasses[size]} bg-[#F8F9FA] rounded-xxl shadow-2xl flex flex-col max-h-full animate-fade-in-down`}>
        {/* Шапка */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-graphite/10 bg-white rounded-t-xxl shrink-0">
          <h2 className="text-xl font-black text-graphite uppercase tracking-wide">{title}</h2>
          <button 
            onClick={onClose}
            className="p-2 text-graphite-light hover:text-orange hover:bg-orange/10 rounded-circle transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Тело (контент) */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}