import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export function Select({ options, value, onChange, placeholder = "Выберите опцию", label, hasError = false, className }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef(null);
  const [coords, setCoords] = useState({ left: 0, top: 0, width: 0 });

  useEffect(() => {
    if (isOpen && selectRef.current) {
      const rect = selectRef.current.getBoundingClientRect();
      const estimatedHeight = Math.min(options.length * 44 + 10, 250); 
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      let calculatedTop = rect.bottom + window.scrollY + 6;

      if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
        calculatedTop = rect.top + window.scrollY - estimatedHeight - 6;
      }

      setCoords({
        left: rect.left,
        top: calculatedTop,
        width: rect.width
      });
    }
  }, [isOpen, options.length]);

  useEffect(() => {
    const handleClose = () => setIsOpen(false);
    
    const handleClickOutside = (e) => {
      if (selectRef.current && !selectRef.current.contains(e.target) && !e.target.closest('.portal-dropdown')) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleClose, { capture: true, passive: true });
      window.addEventListener('resize', handleClose);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleClose, { capture: true });
      window.removeEventListener('resize', handleClose);
    };
  }, [isOpen]);

  // Размеры по умолчанию, если className не передан
  const sizeClass = className ? className : "w-full px-4 py-[10px]";

  return (
    <div className={`flex flex-col font-sans relative z-10 ${className && className.includes('w-') ? '' : 'w-full'}`}>
      {label && (
        <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">
          {label}
        </span>
      )}
      
      <div className="relative" ref={selectRef}>
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className={`${sizeClass} rounded-md border cursor-pointer flex justify-between items-center transition-all duration-300 ${
            hasError 
              ? 'border-status-rejected bg-status-rejected/5' 
              : isOpen 
                ? 'border-orange bg-white shadow-[0_0_0_3px_rgba(255,122,0,0.2)]' 
                : 'border-graphite/40 bg-white hover:border-orange hover:bg-white'
          }`}
        >
          <span className={`text-[13px] font-semibold truncate pr-2 ${value ? 'text-graphite' : 'text-graphite/50'}`}>
            {value || placeholder}
          </span>
          <span className={`text-[10px] transform transition-transform duration-300 ${isOpen ? 'rotate-180 text-orange' : 'text-graphite-light'}`}>
            ▼
          </span>
        </div>

        {isOpen && createPortal(
          <div 
            className="portal-dropdown absolute bg-white/95 backdrop-blur-xl rounded-md border border-white/50 shadow-[0_15px_35px_rgba(0,0,0,0.15)] z-[100005] animate-fade-in-down overflow-y-auto max-h-[650px]"
            style={{ top: `${coords.top}px`, left: `${coords.left}px`, width: `${coords.width}px` }}
          >
            {options.map((opt, idx) => (
              <div 
                key={idx}
                onClick={() => { 
                  onChange(opt);
                  setIsOpen(false); 
                }}
                className={`px-4 py-2.5 text-[13px] font-semibold cursor-pointer border-b border-graphite/5 last:border-0 transition-colors ${
                  value === opt 
                    ? 'bg-orange/10 text-orange' 
                    : 'text-graphite hover:bg-orange/5 hover:text-orange'
                }`}
              >
                {opt}
              </div>
            ))}
          </div>,
          document.body 
        )}
      </div>
    </div>
  );
}