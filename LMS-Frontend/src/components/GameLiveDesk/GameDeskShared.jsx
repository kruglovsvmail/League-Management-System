// src/components/GameLiveDesk/GameDeskShared.jsx
import React, { useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { NumberPickerModal } from '../../ui/NumberPickerModal';
import { OptionListModal } from '../../ui/OptionListModal';
import { TimeInputModal } from '../../ui/TimeInputModal';

// --- Утилиты форматирования ---
export const formatTime = (seconds) => {
  if (seconds === null || seconds === undefined) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const parseTime = (timeStr) => {
  if (!timeStr) return null;
  const cleanStr = timeStr.replace(/[^\d:]/g, '');
  if (!cleanStr) return null;
  const parts = cleanStr.split(':');
  if (parts.length === 2) return parseInt(parts[0] || 0, 10) * 60 + parseInt(parts[1] || 0, 10);
  return parseInt(cleanStr, 10) || 0;
};

export const formatTimeMask = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return digits;
};

export const localizePosition = (pos) => {
  if (!pos) return '';
  const p = pos.toUpperCase();
  if (['C', 'LW', 'RW', 'FORWARD'].includes(p)) return 'Нап.';
  if (['LD', 'RD', 'DEFENSE'].includes(p)) return 'Защ.';
  if (['G', 'GOALIE'].includes(p)) return 'Вр.';
  return pos;
};

// --- Логика таймеров и штрафов ---
export const getPeriodLimits = (period, pLen, otLen, pCount = 3) => {
  const p = parseInt(pLen, 10) || 20;
  const o = isNaN(parseInt(otLen, 10)) ? 5 : parseInt(otLen, 10);
  const c = parseInt(pCount, 10) || 3;
  
  const regTime = p * c * 60;
  const soTime = regTime + (o * 60);
  
  if (period === 'OT') return { start: regTime, end: soTime };
  if (period === 'SO') return { start: soTime, end: soTime };
  
  const periodNum = parseInt(period, 10);
  if (!isNaN(periodNum) && periodNum >= 1 && periodNum <= c) {
    return { start: (periodNum - 1) * p * 60, end: periodNum * p * 60 };
  }
  
  return { start: 0, end: 0 };
};

export const calculatePeriodFromTime = (seconds, pLen, otLen, pCount = 3) => {
  const p = parseInt(pLen, 10) || 20;
  const o = isNaN(parseInt(otLen, 10)) ? 5 : parseInt(otLen, 10);
  const c = parseInt(pCount, 10) || 3;
  
  if (seconds === null || seconds === undefined) return '1';
  
  for (let i = 1; i <= c; i++) {
    if (seconds <= i * p * 60) return String(i);
  }

  const regTime = p * c * 60;
  const otTime = regTime + (o * 60);

  if (o > 0 && seconds <= otTime) return 'OT';
  return 'SO';
};

export const calculatePenaltyTimelines = (penalties) => {
  const sorted = [...penalties].sort((a, b) => parseInt(a.time_seconds, 10) - parseInt(b.time_seconds, 10));
  const slots = [0, 0];

  return sorted.map(p => {
    const mins = parseInt(p.penalty_minutes, 10);
    let effStart = parseInt(p.time_seconds, 10);
    let effEnd = parseInt(p.penalty_end_time, 10);

    if (isNaN(effStart) || isNaN(effEnd)) return { ...p, effStart: 0, effEnd: 0 };

    const isSlotPenalty = [2, 4, 5, 25].includes(mins);
    
    if (isSlotPenalty) {
      slots.sort((a, b) => a - b);
      if (slots[0] > effStart) {
        effStart = slots[0];
      }
      let duration = effEnd - parseInt(p.time_seconds, 10);
      effEnd = effStart + duration;
      let slotDuration = duration;
      if (mins === 25) slotDuration = Math.min(duration, 300); 
      slots[0] = effStart + slotDuration;
    }
    return { ...p, effStart, effEnd };
  });
};

// --- Справочники ---
// Справочник причин штрафа: номер, сокращение и полное наименование.
// Где что показывается:
//   - модалка выбора — номер + полное наименование (по ним же ищем);
//   - поле секретаря и PDF-протокол — только сокращение (code);
//   - в БД (game_events.penalty_violation) пишется ПОЛНОЕ наименование.
// Полные наименования менять нельзя «просто так»: их читает вслух диктор трансляции
// (PENALTY_REASON_ACCUSATIVE в ttsShared.js) и показывает веб-графика, а в PDF по ним
// подбирается сокращение (PENALTY_REASON_MAP в src/protocols/*). Правка формулировки —
// это правка сразу в четырёх местах плюс миграция уже сохранённых событий.
export const PENALTY_REASONS = [
  { num: 1,  code: 'АГРЕС',    title: 'Агрессор в драке' },
  { num: 2,  code: 'АТ-ГОЛ',   title: 'Атака в голову или шею' },
  { num: 3,  code: 'БЛОК',     title: 'Блокировка' },
  { num: 4,  code: 'БР-КЛ',    title: 'Бросок клюшки и снаряжения' },
  { num: 5,  code: 'ВБ-ШБ',    title: 'Выброс шайбы' },
  { num: 6,  code: 'ГРУБ',     title: 'Грубость' },
  { num: 7,  code: 'ДИС-КН',   title: 'Дисциплинарный до конца матча штраф' },
  { num: 8,  code: 'ДИСЦ',     title: 'Дисциплинарный штраф' },
  { num: 9,  code: 'ДРКА',     title: 'Драка' },
  { num: 10, code: 'ЗД-ИГ',    title: 'Задержка игры' },
  { num: 11, code: 'ЗД-КЛ-СП', title: 'Задержка клюшки соперника' },
  { num: 12, code: 'ЗД-КЛ',    title: 'Задержка клюшкой' },
  { num: 13, code: 'ЗД-СП',    title: 'Задержка соперника' },
  { num: 14, code: 'ЗД-ШБ',    title: 'Задержка шайбы руками' },
  { num: 15, code: 'ЗЧ-ДР',    title: 'Зачинщик драки' },
  { num: 16, code: 'ВП-КЛ',    title: 'Игра высоко поднятой клюшкой' },
  { num: 17, code: 'СЛ-КЛ',    title: 'Игра со сломанной клюшкой' },
  { num: 18, code: 'КЛ-УД',    title: 'Колющий удар' },
  { num: 19, code: 'СК-ШТ',    title: 'Малый скамеечный штраф' },
  { num: 20, code: 'ЧС-СТ',    title: 'Нарушение численного состава' },
  { num: 21, code: 'НП-АТ',    title: 'Неправильная атака' },
  { num: 22, code: 'НС-СН',    title: 'Нестандартное снаряжение' },
  { num: 23, code: 'ОП-СН',    title: 'Опасное снаряжение' },
  { num: 24, code: 'ОП-ДСТ',   title: 'Опасные действия' },
  { num: 25, code: 'НС-ПВ',    title: 'Оскорбление судей и неспортивное поведение' },
  { num: 26, code: 'ОТ-ИГ',    title: 'Отказ начать игру' },
  { num: 27, code: 'ОТСЧ',     title: 'Отсечение' },
  { num: 28, code: 'ПОДЖ',     title: 'Подножка' },
  { num: 29, code: 'ПК-СК',    title: 'Покидание скамейки штрафников / запасных / во время конфликта' },
  { num: 30, code: 'СД-ВР',    title: 'Сдвиг ворот' },
  { num: 31, code: 'СМЛЦ',     title: 'Симуляция' },
  { num: 32, code: 'ТЛ-КЛ',    title: 'Толчок клюшкой' },
  { num: 33, code: 'ТЛ-БР',    title: 'Толчок на борт' },
  { num: 34, code: 'УД-ГОЛ',   title: 'Удар головой' },
  { num: 35, code: 'УД-КЛ',    title: 'Удар клюшкой' },
  { num: 36, code: 'УКС',      title: 'Укус' },
  { num: 37, code: 'УД-К-КЛ',  title: 'Удар концом клюшки' },
  { num: 38, code: 'УД-ЛОК',   title: 'Удар локтем' },
  { num: 39, code: 'УД-НГ',    title: 'Удар ногой' },
  { num: 40, code: 'ФД-ЗРТ',   title: 'Физический контакт со зрителем' },
  // 41 и 42 намеренно делят одно сокращение ШТ-ВР — так в исходном справочнике
  { num: 41, code: 'ШТ-ВР',    title: 'Штрафы вратаря: игра за красной линией, покидание площади ворот в конфликте' },
  { num: 42, code: 'ШТ-ВР',    title: 'Помещающий шайбу на сетку ворот, отправляющийся к скамейке в остановке' },
];

// ОБНОВЛЕННЫЕ СТАТУСЫ ВЗЯТИЯ ВОРОТ
export const GOAL_STRENGTH_DISPLAY = { 
  'equal': 'РС', 
  'pp1': '+1', 
  'pp2': '+2', 
  'sh1': '-1', 
  'sh2': '-2', 
  'en': 'ПВ', 
  'ps': 'ШБ' 
};

export const goalStrengthOptions = [
  { value: 'equal', label: 'РС' }, 
  { value: 'pp1', label: '+1' }, 
  { value: 'pp2', label: '+2' }, 
  { value: 'sh1', label: '-1' }, 
  { value: 'sh2', label: '-2' }, 
  { value: 'en', label: 'ПВ' }, 
  { value: 'ps', label: 'ШБ' }
];

export const penaltyMinsOptions = [
  { value: '2', label: '2' },
  { value: '4', label: '2+2' },
  { value: '5', label: '5' },
  { value: 'match', label: '5+20' }
];

// value — полное наименование (именно оно уходит в БД), label — оно же для модалки,
// shortLabel — сокращение для поля секретаря, num — номер для модалки и поиска.
export const penaltyReasonOptions = PENALTY_REASONS.map(r => ({
  value: r.title,
  label: r.title,
  shortLabel: r.code,
  num: r.num,
}));

// Полное наименование -> сокращение. Нужно там, где причина уже сохранена и выводится
// текстом, а не выбирается из справочника (таблица «Удаления» в протоколе секретаря).
// Нижний блок — формулировки прежнего справочника: они остались в уже сыгранных матчах
// и сведены к ближайшему действующему сокращению.
const PENALTY_CODE_BY_TITLE = {
  ...Object.fromEntries(PENALTY_REASONS.map(r => [r.title, r.code])),
  'Покид. скамейки штрафников во время конфл.': 'ПК-СК',
  'Покид. скамейки запасных во время конфл.': 'ПК-СК',
  'Штр. вр: игра за красной линией': 'ШТ-ВР',
  'Штр. вр: покидание площади ворот в конфликте': 'ШТ-ВР',
  'Штр. вр: помещающий шайбу на сетку ворот': 'ШТ-ВР',
  'Штр. вр: отправился к скамейке в остановке': 'ШТ-ВР',
};

// Незнакомую причину (например, снятую из справочника) возвращаем как есть —
// лучше длинный текст, чем пустая ячейка.
export const getPenaltyReasonCode = (title) => {
  if (!title) return '';
  const trimmed = String(title).trim();
  return PENALTY_CODE_BY_TITLE[trimmed] || trimmed;
};

export const shootoutOptions = [
  { value: 'shootout_goal', label: 'Гол' },
  { value: 'shootout_miss', label: 'Мимо/Вр.' }
];

// --- Device-aware приватные хелперы ---

// Кнопка-триггер, открывающая модалку выбора (десктоп). Серая, слегка скруглённая, лёгкая —
// ширина всегда 100% (диктуется шириной ячейки таблицы). Пусто -> "-".
// dim=true (строка в режиме редактирования, уже подсвечена bg-orange/5) -> чуть прозрачнее.
const TriggerButton = ({ onClick, value, options = [], placeholder = '', className = '', dim = false }) => {
  const selected = options.find(o => String(o.value) === String(value));
  // В самом поле показываем сокращение, если оно задано (причина штрафа), иначе обычный label.
  // Полное наименование при этом остаётся в подсказке при наведении.
  const displayValue = selected ? (selected.shortLabel || selected.label) : (value || '');
  const fullValue = selected ? selected.label : (value || '');
  const hasValue = Boolean(displayValue || placeholder);
  return (
    <button
      type="button"
      onClick={onClick}
      title={hasValue ? (fullValue || displayValue) : undefined}
      className={`${className} w-full rounded-md overflow-hidden ${dim ? 'bg-graphite/[0.04]' : 'bg-graphite/[0.08]'} hover:bg-graphite/10 transition-colors duration-150 cursor-pointer text-center`}
    >
      {/* span должен быть блочным и с ограниченной шириной — иначе truncate (text-overflow:
          ellipsis) не работает на строчных элементах, и длинная причина штрафа просто
          вылезает за пределы кнопки вместо многоточия. */}
      <span className={`block w-full truncate text-[13px] font-semibold ${hasValue ? 'text-graphite' : 'text-graphite/40'}`}>
        {displayValue || placeholder || '-'}
      </span>
    </button>
  );
};

// Настоящий <select> (открывает системный пикер ОС при тапе), но стилизован под ту же
// серую кнопку, что и TriggerButton на десктопе — appearance-none убирает стандартный
// вид браузера (рамку, стрелку), сама выпадашка остаётся нативной.
const NativeSelect = ({ options = [], value, onChange, className = '', placeholder = '', hideEmpty = false }) => (
  <select
    value={value ?? ''}
    onChange={onChange}
    className={`${className} w-full h-[30px] rounded-md border-none bg-graphite/[0.08] px-1 text-[13px] font-semibold text-graphite text-center outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-orange/30`}
  >
    {!hideEmpty && <option value="">{placeholder || '-'}</option>}
    {options.map(opt => (
      <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
    ))}
  </select>
);

// --- Компоненты UI ---
// StylishSelect/CustomSelect/StylishInput сохраняют прежний внешний контракт пропсов
// (value/onChange/options|roster/exclude), но внутри рендерят разное в зависимости от устройства:
// мобильный (≤850px + touch) -> системный <select>/ввод, десктоп -> кастомная модалка на базе Modal.jsx.
export const StylishSelect = ({ value, onChange, exclude = [], className, roster, title, isEditing = false }) => {
  const isMobile = useIsMobile();
  // useState вызывается безусловно (Rules of Hooks) — даже если он не понадобится в мобильной ветке,
  // isMobile может измениться на лету при ресайзе окна через границу 850px.
  const [isOpen, setIsOpen] = useState(false);

  const options = roster
    .filter(p => !exclude.includes(String(p.jersey_number)))
    .map(p => ({ value: String(p.jersey_number), label: String(p.jersey_number) }));

  const mergedClassName = `h-[30px] !py-0 !px-2 ${className || ''}`;

  if (isMobile) {
    return <NativeSelect options={options} value={value} onChange={onChange} className={mergedClassName} />;
  }

  return (
    <>
      <TriggerButton onClick={() => setIsOpen(true)} value={value} options={options} className={mergedClassName} dim={isEditing} />
      <NumberPickerModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={title || 'Номер игрока'}
        options={options}
        value={value}
        onSelect={(val) => onChange({ target: { value: val } })}
      />
    </>
  );
};

export const CustomSelect = ({ value, onChange, options, className, placeholder = "", title, isEditing = false, hideEmpty = false }) => {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const mergedClassName = `h-[30px] !py-0 !px-2 ${className || ''}`;

  if (isMobile) {
    return <NativeSelect options={options} value={value} onChange={onChange} className={mergedClassName} placeholder={placeholder} hideEmpty={hideEmpty} />;
  }

  return (
    <>
      <TriggerButton onClick={() => setIsOpen(true)} value={value} options={options} className={mergedClassName} placeholder={placeholder} dim={isEditing} />
      <OptionListModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={title || 'Выбор'}
        options={options}
        value={value}
        onSelect={(val) => onChange({ target: { value: val } })}
        hideEmpty={hideEmpty}
        emptyLabel={placeholder || undefined}
      />
    </>
  );
};

// isTimeField=true -> поле хранит время в формате ММ:СС (formatTimeMask применяется вызывающей
// стороной как и раньше). isTimeField=false (по умолчанию) -> обычное текстовое/числовое поле
// (например счетчик бросков в SummaryTablesAccordion) — рендерится как и раньше, без модалок.
export const StylishInput = ({ value, onChange, placeholder, onBlur, className, isTimeField = false, title, isEditing = false }) => {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const plainClassName = `w-full h-[30px] text-center bg-white border border-graphite/20 hover:border-orange focus:bg-white focus:border-orange focus:ring-2 focus:ring-orange/20 shadow-sm rounded-md outline-none placeholder-graphite/40 transition-all text-sm font-mono font-semibold text-graphite ${className || ''}`;
  // Тот же серый стиль, что у NativeSelect/TriggerButton — визуально единообразные "кнопки" в таблице.
  // Настоящего системного пикера для формата ММ:СС (в отличие от ЧЧ:ММ у <input type="time">) не
  // существует — вызов цифровой клавиатуры телефона через inputMode="numeric" и есть системный ввод.
  const mobileTimeClassName = `w-full h-[30px] text-center rounded-md border-none bg-graphite/[0.08] outline-none placeholder-graphite/40 text-[13px] font-mono font-semibold text-graphite focus:ring-2 focus:ring-orange/30 ${className || ''}`;

  if (isTimeField && isMobile) {
    return (
      <input
        inputMode="numeric"
        pattern="[0-9:]*"
        className={mobileTimeClassName}
        value={value} placeholder={placeholder} onChange={onChange} onBlur={onBlur}
      />
    );
  }

  if (isTimeField && !isMobile) {
    return (
      <>
        <TriggerButton onClick={() => setIsOpen(true)} value={value} placeholder={placeholder} className={`h-[30px] !py-0 !px-2 ${className || ''}`} dim={isEditing} />
        <TimeInputModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title={title || 'Время'}
          value={value}
          defaultValue={placeholder}
          onSave={(val) => onChange({ target: { value: val } })}
        />
      </>
    );
  }

  return (
    <input
      className={plainClassName}
      value={value} placeholder={placeholder} onChange={onChange} onBlur={onBlur}
    />
  );
};