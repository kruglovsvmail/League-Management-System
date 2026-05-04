import React from 'react';

export function Button({ 
  children, 
  onClick, 
  className = '', 
  disabled = false, 
  isLoading = false,
  type = 'button',
  loadingText = 'Сохранение...' 
}) {
  
  const baseClasses = "relative flex items-center justify-center gap-2 px-6 py-2.5 rounded-md font-bold text-[13px] transition-all duration-100 border-none before:rounded-md before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/20";
  const activeClasses = "bg-orange text-white cursor-pointer hover:bg-orange-hover shadow-[0_4px_10px_rgba(255,107,0,0.2)] hover:shadow-[0_6px_15px_rgba(255,107,0,0.4)]";
  const disabledClasses = "bg-graphite/10 text-graphite/40 cursor-not-allowed shadow-none";
  
  // Надежная проверка наличия класса цвета фона (например, bg-red-500)
  const hasCustomBg = /(^|\s)bg-[a-zA-Z0-9_-]+/.test(className);
  
  // Добавляем переданный className в ОБА состояния (и активное, и отключенное)
  const finalActiveClasses = hasCustomBg ? `${baseClasses} ${className}` : `${baseClasses} ${activeClasses} ${className}`;
  const finalDisabledClasses = `${baseClasses} ${disabledClasses} ${className}`;

  const isButtonDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isButtonDisabled}
      className={isButtonDisabled ? finalDisabledClasses : finalActiveClasses}
    >
      {isLoading && (
        <svg className="w-4 h-4 animate-spin text-current shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      <span>{isLoading ? loadingText : children}</span>
    </button>
  );
}