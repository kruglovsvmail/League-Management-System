import React from 'react';

export function Switch({ checked, onChange, disabled }) {
  return (
    <label className={`relative w-[40px] h-[22px] inline-block ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <input 
        type="checkbox" 
        className="peer sr-only"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <div className="absolute inset-0 bg-graphite/20 rounded-pill transition-colors duration-7000 peer-checked:bg-orange"></div>
      <div className="absolute left-[3px] bottom-[3px] h-[16px] w-[16px] bg-white rounded-circle shadow-md transition-transform duration-300 peer-checked:translate-x-[18px]"></div>
    </label>
  );
}