// src/components/GameLiveDesk/PaperCells.jsx
import React, { useState, useRef, useLayoutEffect } from 'react';
import { formatTimeMask } from './GameDeskShared';
import { OptionListModal } from '../../ui/OptionListModal';
import { formatPenaltyOffender } from '../../ui/PenaltyOffenderModal';
import { Icon } from '../../ui/Icon';

// Ячейки вида «Бумажный протокол» (настройка лиги sec_panel_view = 'paper'): события
// вписываются прямо в строку таблицы, как ручкой в бланк. Логика та же, что у
// классического вида, — меняется только способ ввода. Ячейки без подсказок: пока в них
// ничего не вписали, они совсем пустые. Исключение — время строки ввода, когда лига берёт
// его с таймера: там бледно тикает время, которое уйдёт в запись, если не вписать своё.

// Что пропускает поле. Где вводятся только цифры — принимаются только цифры.
const FILTERS = {
  // Время ММ:СС: цифры, двоеточие ставит маска
  time: (v) => formatTimeMask(v),
  // Номер игрока
  number: (v) => v.replace(/\D/g, '').slice(0, 3),
  // Нарушитель: номер, «К» или «ОПК», отбывающий — через «/». Буквы пишем заглавными,
  // латинские K и O (соседняя раскладка, те же буквы на вид) — русскими.
  offender: (v) => v.toUpperCase().replace(/K/g, 'К').replace(/O/g, 'О').replace(/[^0-9КОП/ ]/g, '').slice(0, 14),
};

const ERROR_CELL = 'bg-status-rejected/10 ring-1 ring-inset ring-status-rejected/60';
// Строка ввода, пока её запись сохраняется: приглушена и не трогается
export const PAPER_SAVING_CELL = 'opacity-60 pointer-events-none';
const FOCUS_CELL = 'hover:bg-orange/5 focus:bg-orange/5 focus:ring-1 focus:ring-inset focus:ring-orange/50';

// Поле ввода на всю ячейку. На телефоне у цифровых полей — цифровая клавиатура, у
// нарушителя — обычная: на цифровой нет «/» и букв «К», «ОПК».
export function PaperInput({ value, onChange, type = 'number', error = false, onEnter, onBlur, title, placeholder = '', className = '' }) {
  const numeric = type !== 'offender';
  return (
    <input
      value={value || ''}
      onChange={(e) => onChange(FILTERS[type](e.target.value))}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } }}
      onBlur={onBlur}
      inputMode={numeric ? 'numeric' : 'text'}
      pattern={type === 'time' ? '[0-9:]*' : type === 'number' ? '[0-9]*' : undefined}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize={type === 'offender' ? 'characters' : 'off'}
      spellCheck={false}
      title={title}
      placeholder={placeholder}
      className={`block w-full h-[33px] bg-transparent text-center text-[13px] font-semibold text-graphite outline-none placeholder-graphite/40 transition-colors ${type === 'time' ? 'font-mono' : ''} ${error ? ERROR_CELL : FOCUS_CELL} ${className}`}
    />
  );
}

// Ячейка-кнопка: выбор через наше окно (игровая ситуация, вид штрафа, причина, вратарь).
// В отличие от кнопок классического вида, пустая — совсем пустая, без «—».
export function PaperPick({ display, onClick, error = false, title, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`block w-full h-[33px] px-1 text-center text-[12px] font-semibold text-graphite truncate outline-none transition-colors ${error ? ERROR_CELL : FOCUS_CELL} ${className}`}
    >
      {display || ''}
    </button>
  );
}

// Выбор из списка через OptionListModal. value === undefined — ещё не выбрано (пусто);
// emptyDisplay — что писать, если выбран пустой пункт ('': «Пустые ворота»);
// blankValues — значения, которые в ячейке не пишутся («равные составы» — пустая ИС).
export function PaperSelect({ value, onChange, options = [], title, error = false, hideEmpty = false, emptyLabel, emptyDisplay = '', blankValues = [], className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find(o => String(o.value) === String(value));
  const display = blankValues.includes(value) ? ''
    : selected ? (selected.shortLabel || selected.label)
    : (value === '' ? emptyDisplay : '');
  return (
    <>
      <PaperPick display={display} onClick={() => setIsOpen(true)} error={error} title={title} className={className} />
      <OptionListModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={title || 'Выбор'}
        options={options}
        // Ещё не выбрано — в окне ничего не подсвечено (иначе горел бы пустой пункт,
        // у вратарей это «Пустые ворота», будто его уже выбрали)
        value={value === undefined ? '__unset__' : value}
        onSelect={(v) => onChange(v)}
        hideEmpty={hideEmpty}
        emptyLabel={emptyLabel}
      />
    </>
  );
}

// «+» строки ввода: серый и неактивный, пока нет обязательного (время, нарушитель и вид);
// активный — в цвет своего блока. Ошибки (номера нет в составе и т.п.) проверяются по
// нажатию — секретарь получает уведомление, ячейки с ошибкой подсвечиваются.
const ADD_TONES = {
  goal: 'bg-status-accepted hover:bg-status-accepted/90',
  penalty: 'bg-status-rejected hover:bg-status-rejected/90',
  log: 'bg-status-pending hover:bg-status-pending/90',
};
export function PaperAddButton({ active, tone = 'goal', onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!active}
      title={title}
      className={`mx-auto w-[calc(100%-8px)] max-w-[44px] h-[26px] rounded-md flex items-center justify-center transition-colors ${
        active ? `${ADD_TONES[tone]} text-white shadow-sm` : 'bg-transparent ring-1 ring-inset ring-graphite/20 text-graphite/25 cursor-not-allowed'
      }`}
    >
      <Icon name="plus" className="w-5 h-5" />
    </button>
  );
}

// Сохранить правку строки — как в классическом виде
export function PaperSaveButton({ onClick, tone = 'goal' }) {
  return (
    <button onClick={onClick} className={`${tone === 'log' ? 'min-h-[36px]' : 'min-h-[34px]'} bg-status-accepted text-white w-full h-full hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner`}>
      <Icon name="save" className="w-5 h-5" />
    </button>
  );
}

// Запись нарушителя: «5», «5/12», «5 / 12», «к», «К/12», «опк / 75» — с пробелами или без.
// → { type: 'player'|'team'|'official', jersey, server }; null — разобрать не удалось.
export const parseOffenderText = (text) => {
  const t = FILTERS.offender(text || '').replace(/\s+/g, '');
  const m = t.match(/^(\d+|К|ОПК)(?:\/(\d+))?$/);
  if (!m) return null;
  const type = m[1] === 'К' ? 'team' : m[1] === 'ОПК' ? 'official' : 'player';
  return { type, jersey: type === 'player' ? m[1] : '', server: m[2] || '' };
};

// Как пишется в ячейке: заглавными и с пробелами вокруг «/» — «5 / 12», «ОПК / 75».
// Не разобралось — оставляем как ввели, ошибку покажет проверка по «+».
export const normalizeOffenderText = (text) => {
  const who = parseOffenderText(text);
  return who ? formatPenaltyOffender(who) : FILTERS.offender(text || '').trim();
};

// Секунды в «ММ:СС» — не больше 59. Без двоеточия (1–2 цифры) — это секунды, так и
// в классическом виде.
export const isClockValid = (text) => {
  if (!text || !text.includes(':')) return true;
  const secs = text.split(':')[1];
  return secs.length > 0 && Number(secs) < 60;
};

// Сохранение строки ввода. После «+» запись уходит на сервер, таблица перезагружается —
// и только потом приходит ответ. Если очищать строку по ответу, между этими моментами
// новая запись уже стоит на своём месте, а строка ввода со старыми цифрами «съезжает»
// на следующую. Поэтому очищаем её до отрисовки (useLayoutEffect) в тот же момент, когда
// в таблице прибавилась строка. Пока запись в пути — строка заблокирована (не уйдёт дважды).
// rowCount — сколько записей в таблице сейчас, clear — очистить строку ввода.
// → [saving, run]: run(save) — save возвращает true, если сервер запись принял.
export function usePaperDraftSaving(rowCount, clear) {
  const pendingFrom = useRef(null);
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    if (pendingFrom.current !== null && rowCount > pendingFrom.current) {
      pendingFrom.current = null;
      clear();
      setSaving(false);
    }
  }, [rowCount]);

  const run = async (save) => {
    if (pendingFrom.current !== null) return;
    pendingFrom.current = rowCount;
    setSaving(true);
    document.activeElement?.blur?.();
    const ok = await save();
    // Строка в таблице так и не прибавилась (ошибка или таблица не перезагрузилась):
    // при ошибке набранное остаётся — поправить и нажать «+» снова
    if (pendingFrom.current !== null) {
      pendingFrom.current = null;
      if (ok) clear();
      setSaving(false);
    }
  };

  return [saving, run];
}
