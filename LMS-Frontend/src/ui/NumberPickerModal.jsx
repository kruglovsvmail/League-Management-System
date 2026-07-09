// src/ui/NumberPickerModal.jsx
import React from 'react';
import { Modal } from '../modals/Modal';

// Грид номеров игрока: клик по тайлу сразу выбирает значение и закрывает окно (без кнопки "Сохранить").
// Отдельный "пустой" тайл сбрасывает выбор — полезно, например, чтобы отменить ассистента.
export function NumberPickerModal({ isOpen, onClose, title = 'Номер игрока', options = [], value, onSelect }) {
  const handlePick = (optValue, opt) => {
    onSelect(optValue, opt);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="medium">
      <div className="grid grid-cols-5 gap-2">
        <button
          type="button"
          onClick={() => handlePick('', { value: '', label: '—' })}
          className={`h-16 rounded-md border-2 border-dashed flex items-center justify-center text-graphite/40 font-bold text-lg transition-colors ${
            !value ? 'border-orange text-orange bg-orange/5' : 'border-graphite/20 hover:border-orange hover:text-orange hover:bg-orange/5'
          }`}
          title="Очистить выбор"
        >
          —
        </button>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handlePick(opt.value, opt)}
            className={`h-16 rounded-md border flex items-center justify-center font-bold text-[18px] transition-colors ${
              String(value) === String(opt.value)
                ? 'border-orange bg-orange text-white shadow-sm'
                : 'border-graphite/20 text-graphite hover:border-orange hover:bg-orange/5 hover:text-orange'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {options.length === 0 && (
        <div className="text-center text-graphite/40 text-sm font-medium py-6">Нет доступных номеров</div>
      )}
    </Modal>
  );
}
