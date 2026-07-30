import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export function Select({ 
  options = [], 
  value, 
  onChange, 
  placeholder = "Выберите опцию", 
  label, 
  hasError = false, 
  className, 
  disabled = false,
  isSearchable = false,
  wrapText = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const selectRef = useRef(null);
  const [coords, setCoords] = useState({ left: 0, top: 0, width: 0 });
  const [isMobile, setIsMobile] = useState(false);

  // Определяем, является ли устройство мобильным или сенсорным
  useEffect(() => {
    const checkMobile = () => {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const hasMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      return hasTouch || hasMobileUA;
    };
    setIsMobile(checkMobile());
  }, []);

  // Итоговый флаг: поиск включен только если это запрошено пропсами И мы не на мобилке
  const effectiveIsSearchable = isSearchable && !isMobile;

  const normalizedOptions = options.map(opt =>
    typeof opt === 'object' && opt !== null ? opt : { value: opt, label: opt, disabled: false }
  );

  // Строки-заголовки (type: 'section' | 'subsection') структурируют длинный список,
  // но выбрать их нельзя — они не значения, а разделители
  const isHeaderOption = (opt) => opt.type === 'section' || opt.type === 'subsection';

  // prefix — выделяемая часть перед текстом опции (например, номер пункта нарушения):
  // в списке она красится акцентом, но при поиске и в закрытом поле участвует как обычный текст
  const optionText = (opt) => [opt.prefix, opt.label].filter(Boolean).join(' ');

  const selectedOption = normalizedOptions.find(opt => !isHeaderOption(opt) && String(opt.value) === String(value));
  const displayValue = selectedOption ? optionText(selectedOption) : '';

  // При поиске заголовки прячем: пользователь ищет конкретный пункт, а не раздел
  const filteredOptions = effectiveIsSearchable && searchTerm
    ? normalizedOptions.filter(opt => !isHeaderOption(opt) && optionText(opt).toLowerCase().includes(searchTerm.toLowerCase()))
    : normalizedOptions;

  const maxHeight = wrapText ? 560 : 320;

  useEffect(() => {
    if (isOpen && selectRef.current) {
      const rect = selectRef.current.getBoundingClientRect();

      // Ширина списка намеренно не привязана к полю: длинные формулировки в него не влезают
      const panelWidth = wrapText
        ? Math.min(Math.max(rect.width * 1.5, 420), window.innerWidth - 40)
        : rect.width;

      // Если справа не хватает места — раскрываемся влево, выравниваясь по правому краю поля
      let calculatedLeft = rect.left;
      if (calculatedLeft + panelWidth > window.innerWidth - 20) {
        calculatedLeft = Math.max(20, rect.right - panelWidth);
      }

      const estimatedHeight = Math.min(filteredOptions.length * (wrapText ? 60 : 40) + 10, maxHeight);
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      let calculatedTop = rect.bottom + window.scrollY + 6;
      if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
        calculatedTop = rect.top + window.scrollY - estimatedHeight - 6;
      }

      setCoords({ left: calculatedLeft, top: calculatedTop, width: panelWidth });
    }
  }, [isOpen, filteredOptions.length, wrapText]);

  useEffect(() => {
    const handleClose = () => { setIsOpen(false); setSearchTerm(''); };
    
    const handleClickOutside = (e) => {
      if (selectRef.current && !selectRef.current.contains(e.target) && !e.target.closest('.portal-dropdown')) {
        handleClose();
      }
    };

    const handleScroll = (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('portal-dropdown')) return;
      handleClose();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
      window.addEventListener('resize', handleClose);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleClose);
    };
  }, [isOpen]);

  const sizeClass = className ? className : "w-full px-4 py-[10px]";
  const scrollbarStyles = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-graphite/20 hover:[&::-webkit-scrollbar-thumb]:bg-graphite/30 [&::-webkit-scrollbar-thumb]:rounded-full";

  const handleSelect = (optValue, opt) => {
    onChange(optValue, opt);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className={`flex flex-col font-sans relative z-10 ${className && className.includes('w-') ? '' : 'w-full'}`}>
      {label && <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">{label}</span>}
      
      <div className="relative" ref={selectRef}>
        
        {effectiveIsSearchable ? (
          wrapText && !isOpen ? (
            <div
              onClick={() => { if (!disabled) setIsOpen(true); }}
              className={`${sizeClass} rounded-md border flex justify-between items-start gap-2 transition-all duration-300 ${
                disabled ? 'border-graphite/10 bg-graphite/5 cursor-not-allowed opacity-70'
                  : hasError ? 'border-status-rejected bg-status-rejected/5 cursor-pointer'
                  : 'border-graphite/40 bg-white/70 hover:border-orange cursor-pointer'
              }`}
            >
              <span className={`text-[13px] font-semibold leading-snug whitespace-normal ${value ? 'text-graphite' : 'text-graphite/50'}`}>
                {selectedOption?.prefix && <span className="font-black text-orange">{selectedOption.prefix} </span>}
                {selectedOption ? selectedOption.label : placeholder}
              </span>
              {!disabled && <span className="text-[10px] text-graphite-light shrink-0 mt-0.5">▼</span>}
            </div>
          ) : (
            <div className="relative w-full h-full">
               <input
                  className={`${sizeClass} w-full rounded-md border flex items-center transition-all duration-300 outline-none text-[13px] font-semibold text-graphite placeholder:font-medium placeholder-graphite/40 ${
                    disabled ? 'border-graphite/10 bg-graphite/5 cursor-not-allowed opacity-70'
                    : hasError ? 'border-status-rejected bg-status-rejected/5'
                    : isOpen ? 'border-orange bg-white/70 shadow-[0_0_0_3px_rgba(255,122,0,0.2)]'
                    : 'border-graphite/40 bg-white/70 hover:border-orange'
                  }`}
                  placeholder={displayValue || placeholder}
                  value={isOpen ? searchTerm : displayValue}
                  onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }}
                  onClick={() => { if (!disabled) setIsOpen(true); }}
                  readOnly={disabled}
                  autoFocus={wrapText}
               />
            </div>
          )
        ) : (
          <div 
            onClick={() => { if (!disabled) setIsOpen(!isOpen) }}
            className={`${sizeClass} rounded-md border flex justify-between items-center transition-all duration-300 ${
              disabled ? 'border-graphite/10 bg-graphite/5 cursor-not-allowed opacity-70'
                : hasError ? 'border-status-rejected bg-status-rejected/5 cursor-pointer' 
                : isOpen ? 'border-orange bg-white/70 shadow-[0_0_0_3px_rgba(255,122,0,0.2)] cursor-pointer' 
                : 'border-graphite/40 bg-white/70 hover:border-orange cursor-pointer'
            }`}
          >
            <span className={`text-[13px] font-semibold truncate pr-2 ${value ? 'text-graphite' : 'text-graphite/50'}`}>
              {displayValue || placeholder}
            </span>
            {!disabled && (
              <span className={`text-[10px] transform transition-transform duration-300 ${isOpen ? 'rotate-180 text-orange' : 'text-graphite-light'}`}>
                ▼
              </span>
            )}
          </div>
        )}

        {isOpen && !disabled && createPortal(
          <div 
            className={`portal-dropdown absolute bg-white/50 backdrop-blur-[14px] rounded-md border border-white/50 shadow-[0_15px_35px_rgba(0,0,0,0.15)] z-[100005] animate-zoom-in overflow-y-auto ${scrollbarStyles}`}
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              maxHeight: `${maxHeight}px`,
              ...(wrapText
                ? { width: `${coords.width}px` }
                : { minWidth: `${Math.max(coords.width, 100)}px`, maxWidth: 'calc(100vw - 40px)' })
            }}
          >
            {effectiveIsSearchable && (
              <div className="px-3 py-2 hover:bg-graphite/5 cursor-pointer text-graphite/40 text-xs text-left transition-colors whitespace-nowrap" onClick={() => handleSelect('', { value: '', label: '—' })}>—</div>
            )}

            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => (
                isHeaderOption(opt) ? (
                  <div
                    key={idx}
                    className={`px-4 border-b border-graphite/5 last:border-0 whitespace-normal leading-snug select-none ${
                      opt.type === 'section'
                        ? 'py-2.5 text-[13px] font-black text-orange uppercase tracking-wide text-center bg-orange/5'
                        : 'py-2 text-[12px] font-bold italic text-status-pending text-left bg-status-pending/5'
                    }`}
                  >
                    {opt.label}
                  </div>
                ) : (
                  <div
                    key={idx}
                    onClick={() => handleSelect(opt.value, opt)}
                    className={`px-4 py-2.5 text-[13px] font-semibold cursor-pointer border-b border-graphite/5 last:border-0 transition-colors text-left leading-snug ${
                      wrapText ? 'whitespace-normal' : 'whitespace-nowrap overflow-hidden text-ellipsis'
                    } ${
                      opt.disabled
                        ? 'line-through text-graphite/40 bg-graphite/[0.02] hover:bg-graphite/5'
                        : String(value) === String(opt.value)
                          ? 'bg-orange/10 text-orange'
                          : typeof opt.label === 'string' && opt.label.includes('Очистите')
                              ? 'text-status-rejected hover:bg-status-rejected/10'
                              : 'text-graphite hover:bg-orange/5 hover:text-orange'
                    }`}
                  >
                    {opt.prefix && (
                      <span className={String(value) === String(opt.value) ? 'font-black' : 'font-black text-orange'}>{opt.prefix} </span>
                    )}
                    {opt.label}
                  </div>
                )
              ))
            ) : (
              <div className="px-3 py-3 text-graphite/40 text-xs text-center font-medium">Нет совпадений</div>
            )}
          </div>,
          document.body 
        )}
      </div>
    </div>
  );
}