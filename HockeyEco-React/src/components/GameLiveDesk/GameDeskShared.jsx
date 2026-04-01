// src/components/GameLiveDesk/GameDeskShared.jsx
import React, { useState, useEffect, useRef } from 'react';

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
  "Атака в область головы и шеи", "Атака вратаря", "Блокировка", "Выброс шайбы",
  "Грубость", "Дисциплинарный штраф", "Драка", "Задержка игры", "Задержка клюшкой",
  "Задержка руками", "Игра высоко поднятой клюшкой", "Игра сломанной клюшкой",
  "Кросс-чек", "Нарушение экипировки", "Нарушение численного состава",
  "Неправильная атака", "Оскорбление судей", "Отсечение", "Подножка", "Симуляция",
  "Сдвиг ворот", "Толчок клюшкой", "Толчок на борт", "Удар клюшкой",
  "Удар коленом", "Удар концом клюшки", "Удар локтем", "Удар сзади"
];

export const GOAL_STRENGTH_DISPLAY = { 'equal': 'рав', 'pp': '+1', 'sh': '-1', 'en': 'пв', 'ps': 'бул' };

export const goalStrengthOptions = [
  { value: 'equal', label: 'рав' }, { value: 'pp', label: '+1' }, 
  { value: 'sh', label: '-1' }, { value: 'en', label: 'пв' }, { value: 'ps', label: 'бул' }
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
export const CustomSelect = ({ value, onChange, options, className, placeholder = "", dropdownWidth = "min-w-[100%]" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownPos, setDropdownPos] = useState('bottom');
  const containerRef = useRef(null);

  const selectedOption = options.find(opt => String(opt.value) === String(value));

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 220;
      if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) setDropdownPos('top');
      else setDropdownPos('bottom');
    }
  }, [isOpen]);

  const filteredOptions = options.filter(opt => String(opt.label).toLowerCase().includes(searchTerm.toLowerCase()));
  const scrollbarStyles = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-graphite/20 hover:[&::-webkit-scrollbar-thumb]:bg-graphite/30 [&::-webkit-scrollbar-thumb]:rounded-full";

  return (
    <div className="relative w-full h-full" ref={containerRef}>
      <input
        className={`w-full h-[30px] flex items-center justify-start px-2 bg-white border border-graphite/20 hover:border-orange shadow-sm rounded-md cursor-pointer transition-all text-sm font-semibold text-graphite outline-none placeholder:font-medium placeholder-graphite/40 focus:placeholder-graphite/30 select-none ${isOpen ? 'ring-2 ring-orange/20 border-orange' : ''} ${className}`}
        placeholder={selectedOption ? selectedOption.label : placeholder}
        value={isOpen ? searchTerm : (selectedOption ? selectedOption.label : '')}
        onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }}
        onClick={() => setIsOpen(true)}
      />
      {isOpen && (
        <div className={`absolute z-[100] ${dropdownPos === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} ${dropdownWidth} left-0 bg-white border border-graphite/20 shadow-xl rounded-md max-h-[320px] min-w-[80px] overflow-y-auto py-1.5 ${scrollbarStyles}`}>
          <div className="px-3 py-2 hover:bg-graphite/5 cursor-pointer text-graphite/40 text-xs text-left transition-colors" onClick={() => { onChange({ target: { value: '' } }); setIsOpen(false); setSearchTerm(''); }}>—</div>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <div
                key={opt.value}
                className={`px-5 py-2 hover:bg-graphite/5 cursor-pointer text-sm font-semibold transition-colors whitespace-nowrap text-left ${String(value) === String(opt.value) ? 'bg-orange/10 text-orange' : 'text-graphite'}`}
                onClick={() => { onChange({ target: { value: opt.value } }); setIsOpen(false); setSearchTerm(''); }}
              >
                {opt.label}
              </div>
            ))
          ) : (
            <div className="px-3 py-3 text-graphite/40 text-xs text-center font-medium">Нет совпадений</div>
          )}
        </div>
      )}
    </div>
  );
};

export const StylishSelect = ({ value, onChange, exclude = [], className, roster }) => {
  const options = roster
    .filter(p => !exclude.includes(String(p.jersey_number)))
    .map(p => ({ value: p.jersey_number, label: p.jersey_number }));
  return <CustomSelect value={value} onChange={onChange} options={options} className={className} />;
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

// --- ИКОНКИ БУЛЛИТОВ ИЗ ПРЕДОСТАВЛЕННОГО SVG ---

// Зеленая шайба (Гол)
export const ShootoutGoalIcon = ({ className = "w-5 h-5 text-status-accepted" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="10" cy="10" rx="7" ry="2.5"></ellipse>
    <path d="M3 10v5c0 1.38 3.13 2.5 7 2.5 1.15 0 2.23-.13 3.18-.36"></path>
    <polyline points="14 17 17 20 23 13"></polyline>
  </svg>
);

// Красная шайба (Мимо)
export const ShootoutMissIcon = ({ className = "w-5 h-5 text-status-rejected" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="10" cy="10" rx="7" ry="2.5"></ellipse>
    <path d="M3 10v5c0 1.38 3.13 2.5 7 2.5 1.15 0 2.23-.13 3.18-.36"></path>
    <line x1="16" y1="14" x2="22" y2="20"></line>
    <line x1="22" y1="14" x2="16" y2="20"></line>
  </svg>
);