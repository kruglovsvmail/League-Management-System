// src/components/GameLiveDesk/GameDeskShared.jsx
import React from 'react';
// ИМПОРТИРУЕМ НАШ ГЛОБАЛЬНЫЙ УНИВЕРСАЛЬНЫЙ SELECT
import { Select } from '../../ui/Select';

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
export const PENALTY_REASONS = [
"Агрессор в драке",
"Атака в голову или шею",
"Блокировка",
"Бросок клюшки и снаряжения",
"Выброс шайбы",
"Грубость",
"Дисциплинарный до конца матча штраф",
"Дисциплинарный штраф",
"Драка",
"Задержка игры",
"Задержка клюшки соперника",
"Задержка клюшкой",
"Задержка соперника",
"Задержка шайбы руками",
"Зачинщик драки",
"Игра высоко поднятой клюшкой",
"Игра со сломанной клюшкой",
"Колющий удар",
"Малый скамеечный штраф",
"Нарушение численного состава",
"Неправильная атака",
"Нестандартное снаряжение",
"Опасное снаряжение",
"Опасные действия",
"Оскорбление судей и неспортивное поведение",
"Отказ начать игру	",
"Отсечение",
"Подножка",
"Покид. скамейки штрафников во время конфл.",
"Покид. скамейки запасных во время конфл.",
"Сдвиг ворот",
"Симуляция",
"Толчок клюшкой",
"Толчок на борт",
"Удар головой",
"Удар клюшкой",
"Удар коленом",
"Удар концом клюшки",
"Удар локтем",
"Удар ногой",
"Физический контакт со зрителем",
"Штр. вр: игра за красной линией",
"Штр. вр: покидание площади ворот в конфликте",
"Штр. вр: помещающий шайбу на сетку ворот",
"Штр. вр: отправился к скамейке в остановке	"
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
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '25', label: '25' }
];

export const penaltyReasonOptions = PENALTY_REASONS.map(r => ({ value: r, label: r }));

export const shootoutOptions = [
  { value: 'shootout_goal', label: 'Гол' },
  { value: 'shootout_miss', label: 'Мимо/Вр.' }
];

// --- Компоненты UI ---

// Выбрасываем тонну старого кода и просто используем универсальный Select!
export const StylishSelect = ({ value, onChange, exclude = [], className, roster }) => {
  const options = roster
    .filter(p => !exclude.includes(String(p.jersey_number)))
    .map(p => ({ value: String(p.jersey_number), label: String(p.jersey_number) }));
    
  return (
    <Select 
      isSearchable={true} 
      value={value} 
      // Протокол исторически ожидал onChange({target: {value}}), делаем микро-адаптер
      onChange={(val) => onChange({ target: { value: val } })} 
      options={options} 
      className={`h-[30px] !py-0 !px-2 ${className}`} 
      placeholder=""
    />
  );
};

// Тот же финт ушами для обычного кастомного селекта в протоколе (например, для типа штрафа)
export const CustomSelect = ({ value, onChange, options, className, placeholder = "" }) => {
  return (
    <Select 
      isSearchable={true} 
      value={value} 
      onChange={(val) => onChange({ target: { value: val } })} 
      options={options} 
      className={`h-[30px] !py-0 !px-2 ${className}`} 
      placeholder={placeholder}
    />
  );
};

export const StylishInput = ({ value, onChange, placeholder, onBlur, className }) => (
  <input 
    className={`w-full h-[30px] text-center bg-white border border-graphite/20 hover:border-orange focus:bg-white focus:border-orange focus:ring-2 focus:ring-orange/20 shadow-sm rounded-md outline-none placeholder-graphite/40 transition-all text-sm font-mono font-semibold text-graphite ${className}`} 
    value={value} placeholder={placeholder} onChange={onChange} onBlur={onBlur}
  />
);

// --- Иконки ---
export const EditIcon = () => (
  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
  </svg>
);

export const DeleteIcon = () => (
  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
  </svg>
);

export const SaveIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
  </svg>
);

export const PlusIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path>
  </svg>
);

export const UsersIcon = () => (
  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

export const ShootoutGoalIcon = ({ className = "w-5 h-5 text-status-accepted" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="10" cy="10" rx="7" ry="2.5"></ellipse>
    <path d="M3 10v5c0 1.38 3.13 2.5 7 2.5 1.15 0 2.23-.13 3.18-.36"></path>
    <polyline points="14 17 17 20 23 13"></polyline>
  </svg>
);

export const ShootoutMissIcon = ({ className = "w-5 h-5 text-status-rejected" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="10" cy="10" rx="7" ry="2.5"></ellipse>
    <path d="M3 10v5c0 1.38 3.13 2.5 7 2.5 1.15 0 2.23-.13 3.18-.36"></path>
    <line x1="16" y1="14" x2="22" y2="20"></line>
    <line x1="22" y1="14" x2="16" y2="20"></line>
  </svg>
);