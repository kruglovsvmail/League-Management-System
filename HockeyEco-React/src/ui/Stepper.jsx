import React, { useState } from 'react';

export function Stepper({ initialValue = 0, min = 0, max = 99, onChange }) {
  const [value, setValue] = useState(initialValue);

  const handleMinus = () => {
    if (value > min) {
      const newVal = value - 1;
      setValue(newVal);
      if (onChange) onChange(newVal); 
    }
  };

  const handlePlus = () => {
    if (value < max) {
      const newVal = value + 1;
      setValue(newVal);
      if (onChange) onChange(newVal); 
    }
  };

  return (
    <div className="inline-flex items-center rounded-md bg-white border border-graphite/20 shadow-sm h-[32px]">
      <button 
        onClick={handleMinus}
        className="w-8 h-full flex justify-center items-center bg-transparent cursor-pointer text-[14px] font-medium text-graphite transition-colors duration-200 hover:bg-graphite/5 hover:text-orange rounded-l-md"
      >
        -
      </button>
      <div className="w-[32px] flex justify-center items-center font-bold text-[13px] border-x border-graphite/10 h-full">
        {value}
      </div>
      <button 
        onClick={handlePlus}
        className="w-8 h-full flex justify-center items-center bg-transparent cursor-pointer text-[14px] font-medium text-graphite transition-colors duration-200 hover:bg-graphite/5 hover:text-orange rounded-r-md"
      >
        +
      </button>
    </div>
  );
}