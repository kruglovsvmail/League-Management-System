import React, { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Окно «вышла новая версия». Поверх всего, оверлей без onClick: закрывается
 * только кнопками, иначе его слишком легко смахнуть мимо и продолжить сидеть
 * на старой сборке.
 *
 * Списка изменений здесь сознательно нет — только факт обновления и кнопка.
 */
export function UpdatePromptModal({ isOpen, onUpdate, onLater }) {
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen || !document.body) return null;

  const handleUpdate = () => {
    // Без искусственной паузы: сразу активируем новую сборку. Состояние нужно
    // только чтобы кнопка не принимала второй клик, пока идёт перезагрузка.
    setIsUpdating(true);
    onUpdate();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100010] flex justify-center items-center p-5 animate-zoom-in">
      <div className="bg-white/85 border border-white/50 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-md p-[30px] w-full max-w-[380px] text-center">

        <div className="w-16 h-16 rounded-full mx-auto mb-5 flex justify-center items-center bg-orange/10 text-orange">
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </div>

        <div className="text-[1.25rem] font-bold text-graphite mb-2.5">Есть обновление</div>
        <div className="text-[0.95rem] text-graphite-light leading-relaxed mb-[25px]">
          Вышла новая версия LMS. Нажмите «Обновить», чтобы перейти на неё —
          страница перезагрузится, из системы вас не выкинет.
        </div>

        <div className="flex gap-[15px]">
          <button
            onClick={onLater}
            disabled={isUpdating}
            className={`flex-1 p-3 rounded-md font-semibold transition-colors duration-200 border bg-white/60 text-graphite ${
              isUpdating ? 'opacity-50 cursor-not-allowed border-transparent' : 'cursor-pointer hover:bg-graphite/10 border-graphite/20'
            }`}
          >
            Позже
          </button>
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className={`flex-1 p-3 rounded-md font-semibold transition-all duration-200 border-none text-white flex justify-center items-center gap-2 ${
              isUpdating
                ? 'bg-orange/70 cursor-not-allowed shadow-none'
                : 'bg-orange cursor-pointer shadow-[0_4px_15px_rgba(255,122,0,0.35)] hover:bg-orange-hover hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(255,122,0,0.35)]'
            }`}
          >
            {isUpdating && (
              <svg className="w-4 h-4 animate-spin text-white shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <span>{isUpdating ? 'Обновляем...' : 'Обновить'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
