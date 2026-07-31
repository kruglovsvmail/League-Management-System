// src/ui/OptionListModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../modals/Modal';

// Общий список опций (причина штрафа, игровая ситуация, штрафные минуты, вратарь и т.п.):
// клик по строке сразу выбирает значение и закрывает окно.
//
// Опция может нести необязательный `num` — порядковый номер из справочника. Тогда он
// показывается слева от наименования и участвует в поиске (справочник причин штрафа).
// Строка поиска появляется сама на длинных списках; `searchable` позволяет решить явно.
export function OptionListModal({ isOpen, onClose, title = 'Выбор', options = [], value, onSelect, hideEmpty = false, emptyLabel, searchable }) {
  const [query, setQuery] = useState('');

  // Сбрасываем поиск при каждом открытии, иначе список приедет уже отфильтрованным
  useEffect(() => { if (isOpen) setQuery(''); }, [isOpen]);

  const showSearch = searchable ?? options.length > 10;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(opt => {
      // Поиск по номеру: точное совпадение начала («1» находит 1, 10-19, но не 21)
      if (opt.num != null && String(opt.num).startsWith(q)) return true;
      return `${opt.label ?? ''} ${opt.shortLabel ?? ''}`.toLowerCase().includes(q);
    });
  }, [options, query]);

  const handlePick = (optValue, opt) => {
    onSelect(optValue, opt);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="normal">
      {showSearch && (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по номеру или названию..."
          autoFocus
          className="w-full mb-3 px-4 py-2.5 rounded-md border border-graphite/20 bg-white text-[14px] font-medium text-graphite outline-none focus:border-orange focus:ring-2 focus:ring-orange/20 transition-colors"
        />
      )}
      {/* С поиском высота списка фиксированная: иначе модалка прыгает и сжимается по мере
          того, как ввод отсекает варианты, и кнопки уезжают из-под курсора.
          Без поиска (короткие списки) оставляем прежнее поведение «по содержимому». */}
      <div className={`flex flex-col gap-1 overflow-y-auto custom-scrollbar -mx-2 px-2 ${showSearch ? 'h-[60vh]' : 'max-h-[60vh]'}`}>
        {!hideEmpty && !query && (
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
        {filtered.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            onClick={() => handlePick(opt.value, opt)}
            className={`text-left px-4 py-3 rounded-md font-semibold text-[14px] transition-colors border flex items-center gap-3 ${
              opt.disabled
                ? 'text-graphite/30 line-through border-transparent cursor-not-allowed'
                : String(value) === String(opt.value)
                  ? 'border-orange bg-orange/10 text-orange'
                  : 'border-transparent text-graphite hover:bg-orange/5 hover:text-orange'
            }`}
          >
            {opt.num != null && (
              <span className="shrink-0 w-7 text-right text-[12px] font-bold text-graphite/40 tabular-nums">{opt.num}</span>
            )}
            <span className="min-w-0">{opt.label}</span>
          </button>
        ))}
        {/* Заглушки живут внутри списка, а не под ним — так фиксированная высота
            сохраняется и когда поиск ничего не нашёл */}
        {options.length === 0 && (
          <div className="text-center text-graphite/40 text-sm font-medium py-6">Нет доступных вариантов</div>
        )}
        {options.length > 0 && filtered.length === 0 && (
          <div className="text-center text-graphite/40 text-sm font-medium py-6">Ничего не найдено</div>
        )}
      </div>
    </Modal>
  );
}
