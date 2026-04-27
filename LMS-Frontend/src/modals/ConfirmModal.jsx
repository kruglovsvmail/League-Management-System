import React from 'react';
import { createPortal } from 'react-dom';

export function ConfirmModal({ isOpen, onClose, onConfirm, isLoading = false }) {
  const alertIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>;

  if (!document.body) return null;

  return createPortal(
    <div className={`fixed inset-0 bg-black/40 backdrop-blur-md z-[100005] flex justify-center items-center p-5 transition-all duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className={`bg-white/85 border border-white/50 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-xl p-[30px] w-full max-w-[380px] text-center transition-transform duration-300 cubic-bezier(0.2, 0.8, 0.2, 1) ${isOpen ? 'translate-y-0 scale-100' : 'translate-y-5 scale-95'}`}>
        
        <div className="w-16 h-16 rounded-full mx-auto mb-5 bg-status-rejected/10 text-status-rejected flex justify-center items-center">
          <div className="w-8 h-8">{alertIcon}</div>
        </div>
        
        <div className="text-[1.25rem] font-bold text-graphite mb-2.5">Удаление</div>
        <div className="text-[0.95rem] text-graphite-light mb-[25px] leading-relaxed">
          Вы уверены, что хотите удалить? Это действие нельзя отменить.
        </div>
        
        <div className="flex gap-[15px]">
          <button 
            onClick={onClose}
            disabled={isLoading}
            className={`flex-1 p-3 rounded-md font-semibold transition-colors duration-200 border bg-white/60 text-graphite ${isLoading ? 'opacity-50 cursor-not-allowed border-transparent' : 'cursor-pointer hover:bg-graphite/10 border-graphite/20'}`}
          >
            Отмена
          </button>
          <button 
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 p-3 rounded-md font-semibold transition-all duration-200 border-none text-white flex justify-center items-center gap-2 ${isLoading ? 'bg-status-rejected/70 cursor-not-allowed shadow-none' : 'bg-status-rejected cursor-pointer shadow-[0_4px_15px_rgba(255,69,58,0.4)] hover:bg-status-rejected-hover hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(255,69,58,0.4)]'}`}
          >
            {isLoading && (
              <svg className="w-4 h-4 animate-spin text-white shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <span>{isLoading ? 'Удаление...' : 'Удалить'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}