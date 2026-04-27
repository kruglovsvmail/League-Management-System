import React from 'react';

export function Loader({ text = "" }) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[250px] animate-zoom-in font-sans">
      {/* Круговой спиннер. Используем Tailwind для анимации вращения */}
      <div className="w-[50px] h-[50px] border-[5px] border-graphite/10 border-t-orange rounded-full animate-spin mb-4 shadow-sm"></div>
      
      {/* Текст под спиннером */}
      <span className="text-graphite-light font-bold text-[10px] uppercase tracking-[0.1em]">
        {text}
      </span>
    </div>
  );
}