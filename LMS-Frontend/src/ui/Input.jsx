import React from 'react';

export function Input({ placeholder, value, defaultValue, onChange, onBlur, label, type = "text", maxLength, disabled, hasError, className }) {
  const sizeClass = className ? className : "w-full px-3 py-2.5";
  
  return (
    <div className={`flex flex-col ${className && className.includes('w-') ? '' : 'w-full'}`}>
      {label && (
        <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">
          {label}
        </span>
      )}
      <input 
        type={type} 
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onBlur={onBlur}
        maxLength={maxLength}
        disabled={disabled}
        className={`${sizeClass} rounded-md font-medium outline-none transition-all duration-300 ${
          hasError 
            ? 'border-status-rejected border-2 bg-status-rejected/10 text-status-rejected font-black shadow-[0_0_12px_rgba(235,87,87,0.5)] focus:shadow-[0_0_15px_rgba(235,87,87,0.7)] z-10 relative' 
            : 'border border-graphite/40 bg-white/30 text-graphite focus:border-orange focus:shadow-[0_0_0_3px_rgba(255,122,0,0.2)]'
        } ${disabled ? 'opacity-60 cursor-not-allowed !bg-gray-50' : ''}`}
      />
    </div>
  );
}