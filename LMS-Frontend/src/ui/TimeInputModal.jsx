// src/ui/TimeInputModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../modals/Modal';
import { Button } from './Button';

// Маска ММ:СС — локальная копия formatTimeMask (не импортируем из GameDeskShared,
// чтобы не создавать циклический импорт: GameDeskShared -> ui/TimeInputModal -> GameDeskShared).
const formatTimeMask = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return digits;
};

// Крупное текстовое поле ММ:СС вместо степперов — быстрее вводить точное время руками.
// Коммит ТОЛЬКО по явному действию (Enter или кнопка "Готово") — закрытие через фон/крестик
// ничего не сохраняет и не портит значение, если поле было пустым (в отличие от степперов,
// где любое открытие+закрытие фиксировало 00:00).
export function TimeInputModal({ isOpen, onClose, title = 'Время', value, defaultValue = '', onSave }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setText(value || defaultValue || '');
      // Автофокус с небольшой задержкой — модалка ещё не отрендерилась на момент эффекта.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen, value, defaultValue]);

  const commit = () => {
    onSave(text);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="mini">
      <div className="flex flex-col items-center gap-8 py-4">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(formatTimeMask(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          placeholder="00:00"
          className="w-[200px] h-16 text-center text-4xl font-mono font-black text-graphite bg-white border-2 border-graphite/20 rounded-lg outline-none focus:border-orange focus:ring-4 focus:ring-orange/15 transition-all"
        />
        <Button onClick={commit} className="w-[200px] py-3.5">Готово</Button>
      </div>
    </Modal>
  );
}
