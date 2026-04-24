import React from 'react';
import { Icon } from './Icon';

export function AccessFallback({ 
  variant = 'full', 
  message = 'Приносим извинения, но Ваши права ограничены.' 
}) {
  
  // Режим 1: Информационный баннер "Только чтение" для форм и настроек
  if (variant === 'readonly') {
    return (
      <div className="flex items-center gap-3 w-full bg-slate-50/80 backdrop-slate-sm border border-slate-200/60 px-4 py-2 rounded-xl mb-2 shadow-sm transition-all hover:bg-slate-50">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white shadow-sm border border-slate-100 shrink-0">
          <Icon name="lock" className="w-4 h-4 text-slate-500" />
        </div>
        <span className="text-sm font-medium text-slate-700 tracking-tight">
          Только просмотр. Редактирование недоступно.
        </span>
      </div>
    );
  }

  // Режим 2: Полная блокировка доступа к разделу
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center bg-white rounded-3xl border border-slate-100 shadow-[0_2px_20px_rgb(0,0,0,0.02)] relative overflow-hidden group m-4">
      {/* Декоративный фон */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-50/50 to-transparent pointer-events-none" />

      <div className="relative mb-6">
        {/* Эффект мягкого свечения */}
        <div className="absolute inset-0 bg-red-100 rounded-full scale-[2] blur-3xl opacity-40 transition-transform duration-500 group-hover:scale-[2.5]" />
        
        {/* Контейнер иконки */}
        <div className="relative flex items-center justify-center w-20 h-20 bg-white border border-slate-100 rounded-2xl shadow-sm rotate-3 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105">
          <Icon name="lock" className="w-8 h-8 text-slate-400" />
        </div>
      </div>

      <h3 className="text-2xl font-bold text-slate-800 tracking-tight mb-3 relative z-10">
        Доступ ограничен
      </h3>
      <p className="text-slate-500 max-w-md leading-relaxed relative z-10 text-sm md:text-base">
        {message}
      </p>
    </div>
  );
}