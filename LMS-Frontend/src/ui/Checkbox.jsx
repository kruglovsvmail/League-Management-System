import React from 'react';

export function Checkbox({ label, checked, onChange }) {
  return (
    <div className="mb-4">
      <label className="flex items-center cursor-pointer gap-2 relative z-10 group">
        {/* Невидимый системный чекбокс */}
        <input 
          type="checkbox" 
          className="peer sr-only" 
          checked={checked}
          onChange={onChange}
        />
        
        {/* Наш кастомный квадратик: он сосед инпута, поэтому peer-checked тут работает */}
        <div className="w-4 h-4 border-[1px] border-graphite-light rounded-[5px] flex justify-center items-center transition-all duration-200 peer-checked:bg-orange peer-checked:border-orange">
           
           {/* Галочка: используем проп checked для переключения opacity */}
           <svg 
             className={`w-4 h-4 text-white transition-opacity duration-200 ${
               checked ? 'opacity-100' : 'opacity-0'
             }`} 
             fill="none" 
             viewBox="0 0 24 24" 
             stroke="currentColor" 
             strokeWidth={3}
           >
             <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
           </svg>
           
        </div>
        
        <span className="text-graphite">{label}</span>
      </label>
    </div>
  );
}