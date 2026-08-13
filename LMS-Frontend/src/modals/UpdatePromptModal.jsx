import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Окно «вышла новая версия». Поверх всего, оверлей без onClick: закрывается
 * только кнопкой, иначе его слишком легко смахнуть мимо и продолжить сидеть
 * на старой сборке.
 *
 * Ни списка изменений, ни «Позже»: откладывать обновление незачем — работать
 * дальше на старой сборке смысла нет. Нажатие сразу перезагружает систему.
 */
export function UpdatePromptModal({ isOpen, onUpdate }) {
  if (!isOpen || !document.body) return null;

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
          В LMS есть новые обновления. Нажмите «Обновить» — страница перезагрузится
          на актуальную версию.
        </div>

        <button
          onClick={onUpdate}
          className="w-full p-3 rounded-md font-semibold transition-all duration-200 border-none text-white bg-orange cursor-pointer shadow-[0_4px_15px_rgba(255,122,0,0.35)] hover:bg-orange-hover hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(255,122,0,0.35)]"
        >
          Обновить
        </button>
      </div>
    </div>,
    document.body
  );
}
