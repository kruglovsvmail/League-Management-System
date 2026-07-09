import React, { useState, useEffect } from 'react';

export function Stepper({ initialValue = 0, min = 0, max = 99, onChange, disabled = false, readOnly = false }) {
  const isDisabled = disabled || readOnly;
  const [value, setValue] = useState(initialValue);

  // Синхронизация с внешним value, если оно изменится
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleMinus = () => {
    if (isDisabled) return;
    if (value > min) {
      const newVal = value - 1;
      setValue(newVal);
      if (onChange) onChange(newVal); 
    }
  };

  const handlePlus = () => {
    if (isDisabled) return;
    if (value < max) {
      const newVal = value + 1;
      setValue(newVal);
      if (onChange) onChange(newVal); 
    }
  };

  return (
    <div className={`inline-flex items-center rounded-md border shadow-sm h-[32px] transition-colors ${isDisabled ? 'bg-gray-50 border-graphite/10 opacity-70' : 'bg-white border-graphite/20'}`}>
      <button 
        onClick={handleMinus}
        disabled={isDisabled}
        className={`w-8 h-full flex justify-center items-center bg-transparent text-[14px] font-medium text-graphite rounded-l-md transition-colors duration-200 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-graphite/5 hover:text-orange'}`}
      >
        -
      </button>
      <div className={`w-[32px] flex justify-center items-center font-bold text-[13px] border-x h-full ${isDisabled ? 'border-graphite/5 text-graphite/60' : 'border-graphite/10'}`}>
        {value}
      </div>
      <button 
        onClick={handlePlus}
        disabled={isDisabled}
        className={`w-8 h-full flex justify-center items-center bg-transparent text-[14px] font-medium text-graphite rounded-r-md transition-colors duration-200 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-graphite/5 hover:text-orange'}`}
      >
        +
      </button>
    </div>
  );
}