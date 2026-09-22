// src/ui/PenaltyReasonsModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../modals/Modal';
import { Icon } from './Icon';

// Причины штрафа-группы: «2+2» — две причины, «2+10» — две, «4+10» — три, у 5+20
// одна на обе строки. Слева — справочник с поиском (как в OptionListModal), справа —
// состав штрафа: строки с минутами, у каждой своя причина. Клик по причине заполняет
// текущую строку и переводит выделение на следующую; клик по строке справа возвращает
// к ней, чтобы перевыбрать. Выбранное всегда на виду — и когда список прокручен вниз.
//
// slots — описание строк: [{ minutes }], у видов с общей причиной (sharedReason) —
// один слот. values — причины по слотам (полные наименования, как в БД), могут быть
// пустыми: секретарь вправе добавить удаление и вписать причину позже.
export function PenaltyReasonsModal({ isOpen, onClose, title = 'Причины удаления', options = [], slots = [], values = [], onSave }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [current, setCurrent] = useState(0);

  // Каждое открытие — от сохранённого значения; курсор на первой незаполненной строке
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    const next = slots.map((_, i) => values[i] || '');
    setPicked(next);
    const firstEmpty = next.findIndex(v => !v);
    setCurrent(firstEmpty === -1 ? 0 : firstEmpty);
  }, [isOpen, slots.length, values.join('|')]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(opt => {
      if (opt.num != null && String(opt.num).startsWith(q)) return true;
      return `${opt.label ?? ''} ${opt.shortLabel ?? ''}`.toLowerCase().includes(q);
    });
  }, [options, query]);

  const labelOf = (value) => options.find(o => String(o.value) === String(value))?.label || value || '';

  const pick = (value) => {
    // Одна строка — выбор по клику сразу закрывает окно, как в обычном списке
    if (slots.length === 1) {
      onSave([value]);
      onClose();
      return;
    }
    setPicked(prev => {
      const next = [...prev];
      next[current] = value;
      return next;
    });
    // Дальше — к следующей строке, если она есть; последняя остаётся выделенной
    if (current < slots.length - 1) setCurrent(current + 1);
  };

  const clearSlot = (i) => {
    setPicked(prev => { const next = [...prev]; next[i] = ''; return next; });
    setCurrent(i);
  };

  // «Та же причина» — повторить причину предыдущей строки: у 2+2 за одно нарушение
  // (высоко поднятая клюшка с травмой) причина одна на обе строки
  const previousReason = current > 0 ? picked[current - 1] : '';
  const currentValue = picked[current] || '';

  const handleSave = () => {
    onSave(picked);
    onClose();
  };

  const rowClassName = 'text-left px-3 py-1.5 rounded-md font-semibold text-[13px] transition-colors border';
  const single = slots.length === 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size={single ? 'normal' : 'wide'}>
      <div className={`flex gap-5 ${single ? '' : 'min-h-[60vh]'}`}>
        {/* Слева — справочник */}
        <div className="flex-1 min-w-0 flex flex-col">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по номеру или названию..."
            autoFocus
            className="w-full mb-3 px-4 py-2.5 rounded-md border border-graphite/20 bg-white text-[14px] font-medium text-graphite outline-none focus:border-orange focus:ring-2 focus:ring-orange/20 transition-colors"
          />
          <div className="flex flex-col gap-0.5 overflow-y-auto custom-scrollbar -mx-2 px-2 h-[60vh]">
            {filtered.map((opt) => {
              const isCurrent = String(currentValue) === String(opt.value);
              const isPickedElsewhere = !isCurrent && picked.some(v => String(v) === String(opt.value));
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => pick(opt.value)}
                  className={`${rowClassName} flex items-center gap-3 ${
                    isCurrent
                      ? 'border-orange bg-orange/10 text-orange'
                      : isPickedElsewhere
                        ? 'border-transparent text-graphite/60 bg-graphite/[0.04] hover:bg-orange/5 hover:text-orange'
                        : 'border-transparent text-graphite hover:bg-orange/5 hover:text-orange'
                  }`}
                >
                  {opt.num != null && (
                    <span className="shrink-0 w-7 text-right text-[12px] font-bold text-graphite/40 tabular-nums">{opt.num}</span>
                  )}
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

        {/* Справа — состав штрафа */}
        {!single && (
          <div className="w-[250px] shrink-0 flex flex-col">
            <div className="text-[10px] font-black uppercase text-graphite/40 tracking-widest mb-2 px-1">Состав штрафа</div>
            <div className="flex flex-col gap-2">
              {slots.map((slot, i) => {
                const value = picked[i] || '';
                const isCurrentSlot = i === current;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrent(i)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      isCurrentSlot
                        ? 'border-orange bg-orange/10 shadow-sm'
                        : value ? 'border-graphite/15 bg-white hover:border-orange/40' : 'border-dashed border-graphite/25 bg-graphite/[0.03] hover:border-orange/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-black uppercase tracking-wider ${isCurrentSlot ? 'text-orange' : 'text-graphite/50'}`}>
                        Строка {i + 1} · {slot.minutes} мин
                      </span>
                      {value && (
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); clearSlot(i); }}
                          className="text-graphite/30 hover:text-status-rejected transition-colors"
                          title="Убрать причину"
                        >
                          <Icon name="close" className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                    <div className={`mt-1 text-[13px] font-semibold leading-snug ${value ? 'text-graphite' : 'text-graphite/35 italic'}`}>
                      {value ? labelOf(value) : 'выберите причину'}
                    </div>
                  </button>
                );
              })}
            </div>

            {previousReason && !currentValue && (
              <button
                type="button"
                onClick={() => pick(previousReason)}
                className="mt-3 px-3 py-2 rounded-md border border-graphite/20 bg-white text-[12px] font-bold text-graphite hover:border-orange hover:text-orange transition-colors"
              >
                Та же причина, что в строке {current}
              </button>
            )}

            <div className="mt-auto pt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="w-full py-2.5 rounded-md bg-orange text-white text-[12px] font-bold uppercase tracking-wider hover:bg-orange/90 transition-colors shadow-sm"
              >
                Готово
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 rounded-md text-[12px] font-bold text-graphite/50 hover:text-graphite transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Одна строка — выбор по клику, как в обычном списке; кнопки только «без причины» */}
      {single && (
        <div className="mt-3 flex justify-start">
          <button
            type="button"
            onClick={() => { onSave(['']); onClose(); }}
            className="px-3 py-2 rounded-md text-[12px] font-bold text-graphite/50 hover:text-status-rejected transition-colors"
          >
            — не выбрано —
          </button>
        </div>
      )}
    </Modal>
  );
}
