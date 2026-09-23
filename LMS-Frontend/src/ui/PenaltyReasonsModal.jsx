// src/ui/PenaltyReasonsModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../modals/Modal';
import { isTouchDevice } from '../utils/device';

// Причина штрафа — у штрафа она одна при любом виде (у «4» — на обе двойки, десятка и
// двадцатка в связках получают свою дисциплинарную сами, см. PENALTY_KINDS). Справочник
// с поиском по номеру и названию, клик по причине выбирает её и закрывает окно.
//
// value — выбранная причина (полное наименование, как в БД) или ''. Пустой выбор
// допустим: секретарь вправе добавить удаление и вписать причину позже.
export function PenaltyReasonsModal({ isOpen, onClose, title = 'Причина удаления', options = [], value = '', onSave }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(opt => {
      if (opt.num != null && String(opt.num).startsWith(q)) return true;
      return `${opt.label ?? ''} ${opt.shortLabel ?? ''}`.toLowerCase().includes(q);
    });
  }, [options, query]);

  const pick = (next) => {
    onSave(next);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="normal">
      <div className="flex flex-col">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по номеру или названию..."
          // На телефоне и планшете фокус сразу открыл бы клавиатуру на пол-экрана
          autoFocus={!isTouchDevice()}
          className="w-full mb-3 px-4 py-2.5 rounded-md border border-graphite/20 bg-white text-[14px] font-medium text-graphite outline-none focus:border-orange focus:ring-2 focus:ring-orange/20 transition-colors"
        />
        <div className="flex flex-col gap-0.5 overflow-y-auto custom-scrollbar -mx-2 px-2 h-[60vh]">
          {filtered.map((opt) => {
            const isCurrent = String(value) === String(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => pick(opt.value)}
                className={`text-left px-3 py-1.5 rounded-md font-semibold text-[13px] transition-colors border flex items-center gap-3 ${
                  isCurrent
                    ? 'border-orange bg-orange/10 text-orange'
                    : 'border-transparent text-graphite hover:bg-orange/5 hover:text-orange'
                }`}
              >
                <span className="shrink-0 w-7 text-right text-[12px] font-bold text-graphite/40 tabular-nums">{opt.num ?? ''}</span>
                <span className="min-w-0 truncate">{opt.label}</span>
              </button>
            );
          })}
          {options.length === 0 && (
            <div className="text-center text-graphite/40 text-sm font-medium py-6">Нет доступных вариантов</div>
          )}
          {options.length > 0 && filtered.length === 0 && (
            <div className="text-center text-graphite/40 text-sm font-medium py-6">Ничего не найдено</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-start">
        <button
          type="button"
          onClick={() => pick('')}
          className="px-3 py-2 rounded-md text-[12px] font-bold text-graphite/50 hover:text-status-rejected transition-colors"
        >
          — не выбрано —
        </button>
      </div>
    </Modal>
  );
}
