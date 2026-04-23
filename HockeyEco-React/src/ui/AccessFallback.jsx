import React from 'react';
import { Icon } from './Icon'; // Предполагается, что у тебя есть компонент иконок из скелета проекта

export function AccessFallback({ 
  variant = 'full', // 'full' - полная заглушка страницы/блока, 'readonly' - баннер режима просмотра
  message = 'Приносим извинения, но Ваши права ограничены.' 
}) {
  
  // Режим 1: Информационный баннер "Только чтение" для форм и настроек
  if (variant === 'readonly') {
    return (
      <div className="bg-black/5 w-full border border-black/10 text-black px-4 py-2 rounded-lg flex items-center mb-4">
        <Icon name="eye" className="w-3 h-3 mr-3 text-black shrink-0" />
        <span className="text-[11px] font-medium">
          Режим просмотра.
        </span>
      </div>
    );
  }

  // Режим 2: Полная блокировка доступа к разделу
  return (
    <div className="flex flex-col items-center justify-center py-20 px-20 text-center bg-black/0 rounded-xl border border-dashed border-black/25 m-4">
      <div className="p-4 rounded-full mb-2">
        <Icon name="eye" className="w-16 h-16 text-black/80" />
      </div>
      <h3 className="text-xl font-bold text-black/80 mb-2">
        Доступ ограничен
      </h3>
      <p className="text-black/35 max-w-lg">
        {message}
      </p>
    </div>
  );
}