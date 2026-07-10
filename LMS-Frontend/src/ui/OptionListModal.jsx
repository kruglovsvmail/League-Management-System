// src/ui/OptionListModal.jsx
import React from 'react';
import { Modal } from '../modals/Modal';

// Общий список опций (причина штрафа, игровая ситуация, штрафные минуты, вратарь и т.п.):
// клик по строке сразу выбирает значение и закрывает окно.
export function OptionListModal({ isOpen, onClose, title = 'Выбор', options = [], value, onSelect, hideEmpty = false, emptyLabel }) {
  const handlePick = (optValue, opt) => {
    onSelect(optValue, opt);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="normal">
      <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto custom-scrollbar -mx-2 px-2">
        {!hideEmpty && (
          <button
            type="button"
            onClick={() => handlePick('', { value: '', label: '-' })}
            className={`text-left px-4 py-3 rounded-md font-semibold text-[14px] transition-colors border ${
              !value ? 'border-orange bg-orange/10 text-orange' : 'border-transparent text-graphite/50 hover:bg-graphite/5'
            }`}
          >
            {emptyLabel || '— не выбрано —'}
          </button>
        )}
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            onClick={() => handlePick(opt.value, opt)}
            className={`text-left px-4 py-3 rounded-md font-semibold text-[14px] transition-colors border ${
              opt.disabled
                ? 'text-graphite/30 line-through border-transparent cursor-not-allowed'
                : String(value) === String(opt.value)
                  ? 'border-orange bg-orange/10 text-orange'
                  : 'border-transparent text-graphite hover:bg-orange/5 hover:text-orange'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {options.length === 0 && (
        <div className="text-center text-graphite/40 text-sm font-medium py-6">Нет доступных вариантов</div>
      )}
    </Modal>
  );
}
