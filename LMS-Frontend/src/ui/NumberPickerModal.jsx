// src/ui/NumberPickerModal.jsx
import React from 'react';
import { Modal } from '../modals/Modal';

// Грид номеров игрока: клик по тайлу сразу выбирает значение и закрывает окно (без кнопки "Сохранить").
// Отдельного «пустого» тайла нет: повторный клик по уже выбранному номеру снимает выбор
// (так отменяют ассистента) и тоже закрывает окно.
//
// taken — номера, уже занятые в этом же событии другой ролью: { '7': 'Автор', '10': 'Ассистент 1' }.
// Такой тайл не прячем, а гасим и подписываем роль под номером: секретарь видит, кто
// уже вписан в гол, и не ищет номер, которого «нет в списке».
export function NumberPickerModal({ isOpen, onClose, title = 'Номер игрока', options = [], value, onSelect, taken = {} }) {
  const handlePick = (optValue, opt) => {
    onSelect(optValue, opt);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="medium">
      <div className="grid grid-cols-5 gap-2">
        {options.map((opt) => {
          const role = taken[String(opt.value)];
          const isSelected = String(value) === String(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              disabled={!!role}
              onClick={() => (isSelected ? handlePick('', { value: '', label: '—' }) : handlePick(opt.value, opt))}
              title={role ? `Уже вписан: ${role}` : isSelected ? 'Снять выбор' : undefined}
              className={`h-16 rounded-md border flex flex-col items-center justify-center font-bold text-[18px] leading-none transition-colors ${
                role
                  ? 'border-graphite/10 bg-graphite/[0.06] text-graphite/30 cursor-not-allowed'
                  : isSelected
                    ? 'border-orange bg-orange text-white shadow-sm'
                    : 'border-graphite/20 text-graphite hover:border-orange hover:bg-orange/5 hover:text-orange'
              }`}
            >
              {opt.label}
              {role && (
                <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-graphite/40">{role}</span>
              )}
            </button>
          );
        })}
      </div>
      {options.length === 0 && (
        <div className="text-center text-graphite/40 text-sm font-medium py-6">Нет доступных номеров</div>
      )}
    </Modal>
  );
}
