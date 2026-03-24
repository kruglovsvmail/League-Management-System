import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getToken } from '../utils/helpers';
import { io } from 'socket.io-client';
import { ConfirmModal } from '../modals/ConfirmModal';
import { GamePlusMinusModal } from '../modals/GamePlusMinusModal';

// --- Утилиты форматирования ---
const formatTime = (seconds) => {
  if (seconds === null || seconds === undefined) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const parseTime = (timeStr) => {
  if (!timeStr) return null;
  const cleanStr = timeStr.replace(/[^\d:]/g, '');
  if (!cleanStr) return null;
  const parts = cleanStr.split(':');
  if (parts.length === 2) return parseInt(parts[0] || 0, 10) * 60 + parseInt(parts[1] || 0, 10);
  return parseInt(cleanStr, 10) || 0;
};

const formatTimeMask = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return digits;
};

const localizePosition = (pos) => {
  if (!pos) return '';
  const p = pos.toUpperCase();
  if (['C', 'LW', 'RW', 'FORWARD'].includes(p)) return 'Нап.';
  if (['LD', 'RD', 'DEFENSE'].includes(p)) return 'Защ.';
  if (['G', 'GOALIE'].includes(p)) return 'Вр.';
  return pos;
};

// --- Умная логика расчета таймлайнов штрафов ---
const calculatePenaltyTimelines = (penalties) => {
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
const PENALTY_REASONS = [
  "Атака в область головы и шеи", "Атака вратаря", "Блокировка", "Выброс шайбы",
  "Грубость", "Дисциплинарный штраф", "Драка", "Задержка игры", "Задержка клюшкой",
  "Задержка руками", "Игра высоко поднятой клюшкой", "Игра сломанной клюшкой",
  "Кросс-чек", "Нарушение экипировки", "Нарушение численного состава",
  "Неправильная атака", "Оскорбление судей", "Отсечение", "Подножка", "Симуляция",
  "Сдвиг ворот", "Толчок клюшкой", "Толчок на борт", "Удар клюшкой",
  "Удар коленом", "Удар концом клюшки", "Удар локтем", "Удар сзади"
];

const GOAL_STRENGTH_DISPLAY = { 'equal': 'рав', 'pp': '+1', 'sh': '-1', 'en': 'пв', 'ps': 'бул' };

// --- Кастомный стильный УМНЫЙ Select ---
const CustomSelect = ({ value, onChange, options, className, placeholder = "", dropdownWidth = "min-w-[100%]" }) => {
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
      
      if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
        setDropdownPos('top');
      } else {
        setDropdownPos('bottom');
      }
    }
  }, [isOpen]);

  const filteredOptions = options.filter(opt => 
    String(opt.label).toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const scrollbarStyles = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400";

  return (
    <div className="relative w-full h-full" ref={containerRef}>
      <input
        className={`w-full h-[30px] flex items-center justify-start px-2 bg-white border border-slate-300 hover:border-blue-400 shadow-sm rounded-md cursor-pointer transition-all text-sm font-semibold text-slate-800 outline-none placeholder:font-medium placeholder-slate-400 focus:placeholder-slate-300 select-none ${isOpen ? 'ring-2 ring-blue-200 border-blue-500' : ''} ${className}`}
        placeholder={selectedOption ? selectedOption.label : placeholder}
        value={isOpen ? searchTerm : (selectedOption ? selectedOption.label : '')}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setIsOpen(true);
        }}
        onClick={() => setIsOpen(true)}
      />
      
      {isOpen && (
        <div className={`absolute z-[100] ${dropdownPos === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} ${dropdownWidth} left-0 bg-white border border-slate-300 shadow-xl rounded-md max-h-[320px] min-w-[80px] overflow-y-auto py-1.5 ${scrollbarStyles}`}>
          <div 
            className="px-3 py-2 hover:bg-slate-100 cursor-pointer text-slate-400 text-xs text-left transition-colors"
            onClick={() => { onChange({ target: { value: '' } }); setIsOpen(false); setSearchTerm(''); }}
          >
            —
          </div>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <div
                key={opt.value}
                className={`px-5 py-2 hover:bg-blue-50 cursor-pointer text-sm font-semibold transition-colors whitespace-nowrap text-left ${String(value) === String(opt.value) ? 'bg-blue-100 text-blue-800' : 'text-slate-700'}`}
                onClick={() => {
                  onChange({ target: { value: opt.value } });
                  setIsOpen(false);
                  setSearchTerm('');
                }}
              >
                {opt.label}
              </div>
            ))
          ) : (
            <div className="px-3 py-3 text-slate-400 text-xs text-center font-medium">Нет совпадений</div>
          )}
        </div>
      )}
    </div>
  );
};

// --- Обертки для инпутов ---
const StylishSelect = ({ value, onChange, exclude = [], className, roster }) => {
  const options = roster
    .filter(p => !exclude.includes(String(p.jersey_number)))
    .map(p => ({ value: p.jersey_number, label: p.jersey_number }));
    
  return <CustomSelect value={value} onChange={onChange} options={options} className={className} />;
};

const StylishInput = ({ value, onChange, placeholder, onBlur, className }) => (
  <input 
    className={`w-full h-[30px] text-center bg-white border border-slate-300 hover:border-blue-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 shadow-sm rounded-md outline-none placeholder-slate-400 transition-all text-sm font-mono font-semibold text-slate-800 ${className}`} 
    value={value} 
    placeholder={placeholder}
    onChange={onChange} 
    onBlur={onBlur}
  />
);

// --- Иконки ---
const EditIcon = () => (
  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
  </svg>
);

const DeleteIcon = () => (
  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
  </svg>
);

const SaveIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
  </svg>
);

const PlusIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path>
  </svg>
);

const UsersIcon = () => (
  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const goalStrengthOptions = [
  { value: 'equal', label: 'рав' }, { value: 'pp', label: '+1' }, 
  { value: 'sh', label: '-1' }, { value: 'en', label: 'пв' }, { value: 'ps', label: 'бул' }
];

const penaltyMinsOptions = [
  { value: '2', label: '2' },
  { value: '4', label: '2+2' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '25', label: '25' }
];
const penaltyReasonOptions = PENALTY_REASONS.map(r => ({ value: r, label: r }));


// --- Компонент листа протокола команды ---
const ProtocolSheet = ({ teamId, teamLetter, teamName, roster, teamEvents, timerSeconds, onSaveEvent, onDeleteEvent, onToggleLineup, isPlusMinusEnabled, onRequestPlusMinus }) => {
  const goals = teamEvents.filter(e => e.event_type === 'goal').sort((a, b) => a.time_seconds - b.time_seconds);
  const penalties = teamEvents.filter(e => e.event_type === 'penalty');
  const timeouts = teamEvents.filter(e => e.event_type === 'timeout').sort((a, b) => a.time_seconds - b.time_seconds);

  const penaltiesWithTimeline = calculatePenaltyTimelines(penalties);

  const [newGoal, setNewGoal] = useState({ time: '', scorer: '', ast1: '', ast2: '', str: 'equal' });
  const [newPenalty, setNewPenalty] = useState({ player: '', mins: '2', violation: '', start: '', end: '' });

  const [editGoalId, setEditGoalId] = useState(null);
  const [editGoalData, setEditGoalData] = useState({});
  const [editPenaltyId, setEditPenaltyId] = useState(null);
  const [editPenaltyData, setEditPenaltyData] = useState({});

  const getPlayerId = (jersey) => roster.find(r => r.jersey_number == jersey)?.player_id || null;
  const getJersey = (id) => roster.find(r => r.player_id == id)?.jersey_number || '';

  const getPenaltyClass = (mins) => {
    const m = parseInt(mins);
    if (m === 2) return 'minor';
    if (m === 4) return 'double_minor';
    if (m === 5) return 'major';
    if (m === 10) return 'misconduct';
    if (m === 20) return 'game_misconduct';
    if (m === 25) return 'match';
    return 'minor';
  };

  const handleAddGoal = () => {
    onSaveEvent(teamId, 'goal', {
      time_seconds: parseTime(newGoal.time) ?? timerSeconds,
      player_id: getPlayerId(newGoal.scorer),
      assist1_id: getPlayerId(newGoal.ast1),
      assist2_id: getPlayerId(newGoal.ast2),
      goal_strength: newGoal.str
    });
    setNewGoal({ time: '', scorer: '', ast1: '', ast2: '', str: 'equal' });
  };

  const startEditGoal = (g) => {
    setEditGoalId(g.id);
    setEditGoalData({
      time: formatTime(g.time_seconds),
      scorer: getJersey(g.primary_player_id),
      ast1: getJersey(g.assist1_id),
      ast2: getJersey(g.assist2_id),
      str: g.goal_strength || 'equal'
    });
  };

  const saveEditGoal = async () => {
    const success = await onSaveEvent(teamId, 'goal', {
      time_seconds: parseTime(editGoalData.time),
      player_id: getPlayerId(editGoalData.scorer),
      assist1_id: getPlayerId(editGoalData.ast1),
      assist2_id: getPlayerId(editGoalData.ast2),
      goal_strength: editGoalData.str
    }, editGoalId);
    if (success) setEditGoalId(null);
  };

  const handleAddPenalty = () => {
    const startSecs = parseTime(newPenalty.start) ?? timerSeconds;
    const mins = parseInt(newPenalty.mins, 10);
    let endSecs = parseTime(newPenalty.end);
    
    if (endSecs === null || isNaN(endSecs)) {
      endSecs = startSecs + (mins * 60);
    }

    onSaveEvent(teamId, 'penalty', {
      time_seconds: startSecs,
      penalty_end_time: endSecs,
      player_id: getPlayerId(newPenalty.player),
      penalty_minutes: mins,
      penalty_violation: newPenalty.violation,
      penalty_class: getPenaltyClass(mins)
    });
    
    setNewPenalty({ player: '', mins: '2', violation: '', start: '', end: '' });
  };

  const startEditPenalty = (p) => {
    setEditPenaltyId(p.id);
    setEditPenaltyData({
      player: getJersey(p.primary_player_id),
      mins: String(p.penalty_minutes),
      violation: p.penalty_violation || '',
      start: formatTime(p.time_seconds),
      end: formatTime(p.penalty_end_time)
    });
  };

  const saveEditPenalty = async () => {
    const startSecs = parseTime(editPenaltyData.start);
    const mins = parseInt(editPenaltyData.mins, 10);
    let endSecs = parseTime(editPenaltyData.end);

    if (endSecs === null || isNaN(endSecs)) {
      endSecs = startSecs + (mins * 60);
    }

    const success = await onSaveEvent(teamId, 'penalty', {
      time_seconds: startSecs,
      penalty_end_time: endSecs,
      player_id: getPlayerId(editPenaltyData.player),
      penalty_minutes: mins,
      penalty_violation: editPenaltyData.violation,
      penalty_class: getPenaltyClass(mins)
    }, editPenaltyId);
    if (success) setEditPenaltyId(null);
  };

  const MAX_ROWS = Math.max(22, roster.length, goals.length + 1, penaltiesWithTimeline.length + 1);
  const rows = Array.from({ length: MAX_ROWS });

  return (
    <div className="bg-white border border-slate-400 shadow-lg mb-8 flex flex-col font-sans rounded-md">
      <div className="bg-slate-100 border-b-2 border-slate-500 px-5 py-3 flex justify-between items-center rounded-t-md">
        <div className="font-bold text-slate-900 text-base uppercase tracking-wide flex items-center gap-3">
          <span className="border-2 border-slate-800 w-8 h-8 flex items-center justify-center font-black rounded-sm">{teamLetter}</span>
          {teamName}
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <span>Тайм-аут:</span>
          {timeouts.length > 0 
            ? timeouts.map(t => <span key={t.id} className="text-red-700 border-b border-dashed border-red-700 cursor-pointer" onDoubleClick={()=>onDeleteEvent(t.id)} title="Двойной клик для удаления">{formatTime(t.time_seconds)}</span>)
            : <button onClick={() => onSaveEvent(teamId, 'timeout', {time_seconds: timerSeconds})} className="bg-white border-2 border-slate-300 hover:border-slate-500 hover:bg-slate-50 text-slate-800 px-3 py-1 rounded transition-colors shadow-sm text-xs font-bold uppercase tracking-wider">Взять ({formatTime(timerSeconds)})</button>
          }
        </div>
      </div>

      <div className="overflow-x-visible pb-12">
        <table className="w-full min-w-[1200px] text-sm text-center border-collapse table-fixed select-none">
          <colgroup>
            <col className="w-10" />
            <col className="w-[150px]" />
            <col className="w-10" />
            <col className="w-10" />
            <col className="w-10" />
            <col className="w-20" />
            <col className="w-12" />
            <col className="w-12" />
            <col className="w-12" />
            <col className="w-16" />
            <col className="w-24" />
            <col className="w-12" />
            <col className="w-12" />
            <col className="w-auto" /> 
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-24" />
          </colgroup>

          <thead>
            <tr className="bg-slate-200 border-b border-slate-400 text-slate-800">
              <th colSpan="4" className="border-r-2 border-slate-500 py-2.5 font-bold uppercase tracking-widest text-[11px]">Состав на матч</th>
              <th colSpan="7" className="border-r-2 border-slate-500 py-2.5 font-bold uppercase tracking-widest text-[11px] text-blue-900">Взятие ворот</th>
              <th colSpan="6" className="py-2.5 font-bold uppercase tracking-widest text-[11px] text-red-900">Удаления</th>
            </tr>
            <tr className="bg-slate-100 border-b-2 border-slate-500 text-xs text-slate-700 uppercase tracking-wider relative z-0">
              <th className="border-r border-slate-300 py-2 font-bold">№</th>
              <th className="border-r border-slate-300 py-2 text-left px-3 font-bold">Фамилия, Имя</th>
              <th className="border-r border-slate-300 py-2 font-bold">Поз</th>
              <th className="border-r-2 border-slate-500 py-2 font-bold">ИГ</th>
              
              <th className="border-r border-slate-300 py-2 font-bold text-blue-800 bg-blue-50/50">№</th>
              <th className="border-r border-slate-300 py-2 font-bold text-blue-800 bg-blue-50/50">Время</th>
              <th className="border-r border-slate-300 py-2 font-bold text-blue-800 bg-blue-50/50">Г</th>
              <th className="border-r border-slate-300 py-2 font-bold text-blue-800 bg-blue-50/50">П1</th>
              <th className="border-r border-slate-300 py-2 font-bold text-blue-800 bg-blue-50/50">П2</th>
              <th className="border-r border-slate-300 py-2 font-bold text-blue-800 bg-blue-50/50">Сост</th>
              <th className="border-r-2 border-slate-500 py-2 bg-blue-50/50"></th>
              
              <th className="border-r border-slate-300 py-2 font-bold text-red-800 bg-red-50/50">№</th>
              <th className="border-r border-slate-300 py-2 font-bold text-red-800 bg-red-50/50">Шт</th>
              <th className="border-r border-slate-300 py-2 text-left px-3 font-bold text-red-800 bg-red-50/50">Причина</th> 
              <th className="border-r border-slate-300 py-2 font-bold text-red-800 bg-red-50/50">Начало</th>
              <th className="border-r border-slate-300 py-2 font-bold text-red-800 bg-red-50/50">Оконч</th>
              <th className="py-2 bg-red-50/50"></th>
            </tr>
          </thead>
          
          <tbody className="bg-white text-slate-800 relative z-10">
            {rows.map((_, i) => {
              const player = roster[i];
              const goal = goals[i];
              const penalty = penaltiesWithTimeline[i];
              const isGoalInput = i === goals.length;
              const isPenaltyInput = i === penaltiesWithTimeline.length;
              const isEditingGoal = goal && goal.id === editGoalId;
              const isEditingPenalty = penalty && penalty.id === editPenaltyId;

              // ЛОГИКА ОТОБРАЖЕНИЯ УМНОГО ТАЙМЕРА ДЛЯ ШТРАФОВ
              let isFinished = false;
              let endTimeDisplay = '';
              let endTimeClass = 'font-mono font-semibold text-sm text-slate-700 bg-red-50/10';

              if (penalty && !isEditingPenalty) {
                const pStart = penalty.effStart;
                const pEnd = penalty.effEnd;
                
                if (!isNaN(pStart) && !isNaN(pEnd)) {
                  isFinished = timerSeconds >= pEnd;
                  const isActive = timerSeconds >= pStart && timerSeconds < pEnd;
                  const isDelayed = timerSeconds < pStart;

                  if (isActive) {
                    endTimeDisplay = formatTime(pEnd - timerSeconds);
                    endTimeClass = "font-mono font-black text-sm text-red-600 bg-red-50/10 animate-pulse";
                  } else if (isFinished) {
                    endTimeDisplay = formatTime(pEnd);
                    endTimeClass = "font-mono font-medium text-sm text-slate-400 bg-red-50/5";
                  } else if (isDelayed) {
                    endTimeDisplay = `⏱ ${formatTime(pEnd - pStart)}`;
                    endTimeClass = "font-mono font-bold text-sm text-amber-600 bg-yellow-50/50";
                  }
                } else {
                  endTimeDisplay = formatTime(penalty.penalty_end_time);
                }
              }

              return (
                <tr key={i} className={`border-b border-slate-300 last:border-0 even:bg-slate-50/80 hover:bg-slate-100 transition-colors group h-[36px]`}>
                  
                  {/* --- РОСТЕР --- */}
                  <td className="border-r border-slate-300 font-bold text-slate-900 text-sm">{player?.jersey_number || ''}</td>
                  <td className="border-r border-slate-300 text-left px-3 truncate whitespace-nowrap overflow-hidden font-semibold text-sm text-slate-800">
                    {player ? `${player.last_name} ${player.first_name?.[0] || ''}.` : ''}
                  </td>
                  <td className="border-r border-slate-300 text-xs text-slate-500 font-medium">
                    {player ? localizePosition(player.position_in_line || player.position) : ''}
                  </td>
                  <td className="border-r-2 border-slate-500 cursor-pointer font-bold text-lg text-emerald-600 hover:bg-slate-200/50 transition-colors" onClick={() => player && onToggleLineup(player.id, teamId, player.is_in_lineup)}>
                    {player ? (player.is_in_lineup ? '✓' : '') : ''}
                  </td>

                  {/* --- ВЗЯТИЕ ВОРОТ --- */}
                  <td className="border-r border-slate-300 font-bold text-slate-400 bg-slate-50/50 text-sm">{i + 1}</td>
                  
                  {isEditingGoal ? (
                    <>
                      <td className="border-r border-slate-300 p-1 bg-yellow-50"><StylishInput value={editGoalData.time} onChange={e=>setEditGoalData({...editGoalData, time: formatTimeMask(e.target.value)})} /></td>
                      <td className="border-r border-slate-300 p-1 bg-yellow-50"><StylishSelect roster={roster} value={editGoalData.scorer} onChange={e=>setEditGoalData({...editGoalData, scorer: e.target.value})} className="!text-blue-700" /></td>
                      <td className="border-r border-slate-300 p-1 bg-yellow-50"><StylishSelect roster={roster} value={editGoalData.ast1} onChange={e=>setEditGoalData({...editGoalData, ast1: e.target.value})} exclude={[editGoalData.scorer]} /></td>
                      <td className="border-r border-slate-300 p-1 bg-yellow-50"><StylishSelect roster={roster} value={editGoalData.ast2} onChange={e=>setEditGoalData({...editGoalData, ast2: e.target.value})} exclude={[editGoalData.scorer, editGoalData.ast1]} /></td>
                      <td className="border-r border-slate-300 p-1 bg-yellow-50">
                        <CustomSelect options={goalStrengthOptions} value={editGoalData.str} onChange={e=>setEditGoalData({...editGoalData, str: e.target.value})} />
                      </td>
                      <td className="border-r-2 border-slate-500 p-0 text-center bg-yellow-50">
                        <button onClick={saveEditGoal} className="bg-emerald-500 text-white w-full h-full min-h-[36px] hover:bg-emerald-600 transition-colors flex items-center justify-center shadow-inner">
                          <SaveIcon />
                        </button>
                      </td>
                    </>
                  ) : goal ? (
                    <>
                      <td className="border-r border-slate-300 font-mono text-sm font-semibold text-slate-700">{formatTime(goal.time_seconds)}</td>
                      <td className="border-r border-slate-300 font-bold text-sm text-slate-900">{getJersey(goal.primary_player_id)}</td>
                      <td className="border-r border-slate-300 font-semibold text-sm text-slate-600">{getJersey(goal.assist1_id)}</td>
                      <td className="border-r border-slate-300 font-semibold text-sm text-slate-600">{getJersey(goal.assist2_id)}</td>
                      <td className="border-r border-slate-300 text-xs text-slate-500 uppercase font-bold">{GOAL_STRENGTH_DISPLAY[goal.goal_strength] || ''}</td>
                      <td className="border-r-2 border-slate-500 p-0 text-center">
                         <div className="flex justify-center items-center h-full gap-2 px-1 opacity-50 hover:opacity-100 transition-opacity">
                            {isPlusMinusEnabled && (
                              <button 
                                onClick={() => onRequestPlusMinus(goal)} 
                                className={`transition-colors ${
                                  goal.has_plus_minus 
                                    ? 'text-emerald-500 hover:text-emerald-600' 
                                    : 'text-slate-500 hover:text-emerald-500'
                                }`} 
                                title="Показатель полезности (+/-)"
                              >
                                <UsersIcon />
                              </button>
                            )}
                            <button onClick={() => startEditGoal(goal)} className="text-slate-500 hover:text-blue-600 transition-colors" title="Редактировать">
                              <EditIcon />
                            </button>
                            <button onClick={() => onDeleteEvent(goal.id)} className="text-slate-500 hover:text-red-600 transition-colors" title="Удалить">
                              <DeleteIcon />
                            </button>
                         </div>
                      </td>
                    </>
                  ) : isGoalInput ? (
                    <>
                      <td className="border-r border-slate-300 p-1 bg-blue-50/30"><StylishInput value={newGoal.time} placeholder={formatTime(timerSeconds)} onChange={e=>setNewGoal({...newGoal, time: formatTimeMask(e.target.value)})} /></td>
                      <td className="border-r border-slate-300 p-1 bg-blue-50/30"><StylishSelect roster={roster} value={newGoal.scorer} onChange={e=>setNewGoal({...newGoal, scorer: e.target.value})} className="!text-blue-700" /></td>
                      <td className="border-r border-slate-300 p-1 bg-blue-50/30"><StylishSelect roster={roster} value={newGoal.ast1} onChange={e=>setNewGoal({...newGoal, ast1: e.target.value})} exclude={[newGoal.scorer]} /></td>
                      <td className="border-r border-slate-300 p-1 bg-blue-50/30"><StylishSelect roster={roster} value={newGoal.ast2} onChange={e=>setNewGoal({...newGoal, ast2: e.target.value})} exclude={[newGoal.scorer, newGoal.ast1]} /></td>
                      <td className="border-r border-slate-300 p-1 bg-blue-50/30">
                        <CustomSelect options={goalStrengthOptions} value={newGoal.str} onChange={e=>setNewGoal({...newGoal, str: e.target.value})} />
                      </td>
                      <td className="border-r-2 border-slate-500 p-0 text-center bg-blue-50/30">
                        <button onClick={handleAddGoal} className="w-full h-full min-h-[36px] bg-blue-100/50 hover:bg-blue-500 text-blue-600 hover:text-white transition-colors flex items-center justify-center">
                          <PlusIcon />
                        </button>
                      </td>
                    </>
                  ) : (
                    <><td className="border-r border-slate-300"></td><td className="border-r border-slate-300"></td><td className="border-r border-slate-300"></td><td className="border-r border-slate-300"></td><td className="border-r border-slate-300"></td><td className="border-r-2 border-slate-500"></td></>
                  )}

                  {/* --- УДАЛЕНИЯ --- */}
                  {isEditingPenalty ? (
                    <>
                      <td className="border-r border-slate-300 p-1 bg-yellow-50"><StylishSelect roster={roster} value={editPenaltyData.player} onChange={e=>setEditPenaltyData({...editPenaltyData, player: e.target.value})} className="!text-red-700" /></td>
                      <td className="border-r border-slate-300 p-1 bg-yellow-50">
                         <CustomSelect options={penaltyMinsOptions} value={editPenaltyData.mins} onChange={e=>setEditPenaltyData({...editPenaltyData, mins: e.target.value})} />
                      </td>
                      <td className="border-r border-slate-300 p-1 bg-yellow-50">
                        <CustomSelect options={penaltyReasonOptions} value={editPenaltyData.violation} onChange={e=>setEditPenaltyData({...editPenaltyData, violation: e.target.value})} dropdownWidth="min-w-[280px]" className="px-1" />
                      </td>
                      <td className="border-r border-slate-300 p-1 bg-yellow-50"><StylishInput value={editPenaltyData.start} onChange={e=>setEditPenaltyData({...editPenaltyData, start: formatTimeMask(e.target.value)})} /></td>
                      <td className="border-r border-slate-300 p-1 bg-yellow-50"><StylishInput value={editPenaltyData.end} onChange={e=>setEditPenaltyData({...editPenaltyData, end: formatTimeMask(e.target.value)})} /></td>
                      <td className="p-0 text-center bg-yellow-50">
                         <button onClick={saveEditPenalty} className="bg-emerald-500 text-white w-full h-full min-h-[36px] hover:bg-emerald-600 transition-colors flex items-center justify-center shadow-inner">
                            <SaveIcon />
                         </button>
                      </td>
                    </>
                  ) : penalty ? (
                    <>
                      <td className={`border-r border-slate-300 font-bold text-sm text-slate-900 bg-red-50/10`}>{getJersey(penalty.primary_player_id)}</td>
                      <td className={`border-r border-slate-300 font-semibold text-sm text-slate-800 bg-red-50/10`}>
                        {parseInt(penalty.penalty_minutes, 10) === 4 ? '2+2' : penalty.penalty_minutes}
                      </td>
                      <td className={`border-r border-slate-300 text-left px-3 text-xs truncate whitespace-nowrap overflow-hidden text-slate-700 font-medium bg-red-50/10`} title={penalty.penalty_violation}>{penalty.penalty_violation}</td>
                      <td className={`border-r border-slate-300 font-mono font-semibold text-sm text-slate-700 bg-red-50/10`}>{formatTime(penalty.effStart)}</td>
                      <td className={`border-r border-slate-300 ${endTimeClass}`}>{endTimeDisplay}</td>
                      <td className={`p-0 text-center bg-red-50/10`}>
                         <div className="flex justify-center items-center h-full gap-2 px-1 opacity-50 hover:opacity-100 transition-opacity">
                            <button onClick={() => startEditPenalty(penalty)} className="text-slate-500 hover:text-blue-600 transition-colors" title="Редактировать">
                              <EditIcon />
                            </button>
                            <button onClick={() => onDeleteEvent(penalty.id)} className="text-slate-500 hover:text-red-600 transition-colors" title="Удалить">
                              <DeleteIcon />
                            </button>
                         </div>
                      </td>
                    </>
                  ) : isPenaltyInput ? (
                    <>
                      <td className="border-r border-slate-300 p-1 bg-red-50/30"><StylishSelect roster={roster} value={newPenalty.player} onChange={e=>setNewPenalty({...newPenalty, player: e.target.value})} className="!text-red-700" /></td>
                      <td className="border-r border-slate-300 p-1 bg-red-50/30">
                         <CustomSelect options={penaltyMinsOptions} value={newPenalty.mins} onChange={e=>setNewPenalty({...newPenalty, mins: e.target.value})} />
                      </td>
                      <td className="border-r border-slate-300 p-1 bg-red-50/30">
                        <CustomSelect options={penaltyReasonOptions} value={newPenalty.violation} onChange={e=>setNewPenalty({...newPenalty, violation: e.target.value})} dropdownWidth="min-w-[280px]" className="px-1" />
                      </td>
                      <td className="border-r border-slate-300 p-1 bg-red-50/30"><StylishInput value={newPenalty.start} placeholder={formatTime(timerSeconds)} onChange={e=>setNewPenalty({...newPenalty, start: formatTimeMask(e.target.value)})} onBlur={()=>{ if(!newPenalty.start){ const s=timerSeconds; setNewPenalty(p=>({...p, start:formatTime(s), end:formatTime(s + parseInt(p.mins||0)*60)}))} }} /></td>
                      <td className="border-r border-slate-300 p-1 bg-red-50/30"><StylishInput value={newPenalty.end} onChange={e=>setNewPenalty({...newPenalty, end: formatTimeMask(e.target.value)})} /></td>
                      <td className="p-0 text-center bg-red-50/30">
                         <button onClick={handleAddPenalty} className="w-full h-full min-h-[36px] bg-red-100/50 hover:bg-blue-500 text-blue-600 hover:text-white transition-colors flex items-center justify-center">
                            <PlusIcon />
                         </button>
                      </td>
                    </>
                  ) : (
                    <><td className="border-r border-slate-300"></td><td className="border-r border-slate-300"></td><td className="border-r border-slate-300"></td><td className="border-r border-slate-300"></td><td className="border-r border-slate-300"></td><td></td></>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- ГЛАВНЫЙ КОМПОНЕНТ ---
export function GameLiveDesk() {
  const { gameId } = useParams();

  const [game, setGame] = useState(null);
  const [events, setEvents] = useState([]);
  const [homeRoster, setHomeRoster] = useState([]);
  const [awayRoster, setAwayRoster] = useState([]);
  
  const [socket, setSocket] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0); 
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('1'); 
  
  const [isEditingTimer, setIsEditingTimer] = useState(false);
  const [manualTimerInput, setManualTimerInput] = useState('');
  
  const [periodLength, setPeriodLength] = useState(20);
  const [otLength, setOtLength] = useState(5);

  // Состояния для новых фич
  const [isPlusMinusEnabled, setIsPlusMinusEnabled] = useState(false);
  const [plusMinusModalState, setPlusMinusModalState] = useState({ isOpen: false, event: null, scoringTeam: null, concedingTeam: null });

  const [deleteModalState, setDeleteModalState] = useState({ isOpen: false, eventId: null });
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);

  const headers = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };

  const loadInitialData = async () => {
    try {
      const resGame = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}`, { headers });
      const dataGame = await resGame.json();
      
      const resEvents = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`, { headers });
      const dataEvents = await resEvents.json();

      if (dataGame.success) {
        setGame(dataGame.data);
        if (dataGame.data.period_length) setPeriodLength(dataGame.data.period_length);
        if (dataGame.data.ot_length) setOtLength(dataGame.data.ot_length);

        if (dataEvents.success) setEvents(dataEvents.data);

        const [resHome, resAway] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.home_team_id}`, { headers }),
          fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.away_team_id}`, { headers })
        ]);
        const [dataHome, dataAway] = await Promise.all([resHome.json(), resAway.json()]);
        
        setHomeRoster((dataHome.gameRoster || []).sort((a,b)=>a.jersey_number - b.jersey_number));
        setAwayRoster((dataAway.gameRoster || []).sort((a,b)=>a.jersey_number - b.jersey_number));
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadInitialData(); }, [gameId]);

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_API_URL);
    setSocket(newSocket);
    newSocket.emit('join_game', gameId);
    
    newSocket.on('timer_state', (state) => {
      setTimerSeconds(state.seconds);
      setIsTimerRunning(state.isRunning);
      if (state.period) setCurrentPeriod(state.period);
      if (state.periodLength) setPeriodLength(state.periodLength);
      if (state.otLength) setOtLength(state.otLength);
    });
    
    newSocket.on('timer_tick', (state) => {
      setTimerSeconds(state.seconds);
    });
    
    return () => newSocket.disconnect();
  }, [gameId]);

  useEffect(() => {
    let interval = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const handleTimerAction = (action) => {
    if (action === 'start') setIsTimerRunning(true);
    if (action === 'stop') setIsTimerRunning(false);
    socket?.emit('timer_action', { gameId, action });
  };

  const changePeriod = (period) => {
    setCurrentPeriod(period);
    
    let newTime = 0;
    if (period === '2') newTime = periodLength * 60;
    if (period === '3') newTime = periodLength * 2 * 60;
    if (period === 'OT') newTime = periodLength * 3 * 60;
    if (period === 'SO') newTime = (periodLength * 3 + otLength) * 60;

    setTimerSeconds(newTime);
    socket?.emit('timer_action', { gameId, action: 'set_period', period });
    socket?.emit('timer_action', { gameId, action: 'set_time', seconds: newTime });
    socket?.emit('game_updated', { gameId });
  };

  const openTimerEdit = () => {
    setIsEditingTimer(true);
    setManualTimerInput(formatTime(timerSeconds));
  };

  const saveTimerEdit = () => {
    if (manualTimerInput.trim() === '') {
      setIsEditingTimer(false);
      return;
    }
    const secs = parseTime(manualTimerInput);
    if (secs !== null) {
      setTimerSeconds(secs); 
      socket?.emit('timer_action', { gameId, action: 'set_time', seconds: secs });
    }
    setIsEditingTimer(false);
  };

  const saveTimerSettings = () => {
    socket?.emit('timer_action', { gameId, action: 'update_settings', periodLength, otLength });
  };

  const toggleLineup = async (rosterId, teamId, currentState) => {
    const updateState = (prev) => prev.map(p => p.id === rosterId ? { ...p, is_in_lineup: !currentState } : p);
    if (teamId === game.home_team_id) setHomeRoster(updateState);
    else setAwayRoster(updateState);
  };

  const processGoalPenaltyLogic = async (scoringTeamId, goalTimeRaw) => {
    const concedingTeamId = scoringTeamId === game.home_team_id ? game.away_team_id : game.home_team_id;
    const goalTime = parseInt(goalTimeRaw, 10);

    const concedingTimeline = calculatePenaltyTimelines(events.filter(e => e.team_id === concedingTeamId && e.event_type === 'penalty'));
    const scoringTimeline = calculatePenaltyTimelines(events.filter(e => e.team_id === scoringTeamId && e.event_type === 'penalty'));

    const isPenaltyActiveOnIce = (p, time) => {
      if (![2, 4, 5, 25].includes(parseInt(p.penalty_minutes, 10))) return false;
      return time >= p.effStart && time < p.effEnd;
    };

    const activeConceding = concedingTimeline.filter(p => isPenaltyActiveOnIce(p, goalTime));
    const activeScoring = scoringTimeline.filter(p => isPenaltyActiveOnIce(p, goalTime));

    if (activeConceding.length > activeScoring.length) {
      const expirablePenalty = activeConceding
        .filter(p => [2, 4].includes(parseInt(p.penalty_minutes, 10)))
        .sort((a, b) => a.effStart - b.effStart)[0];

      if (expirablePenalty) {
        const mins = parseInt(expirablePenalty.penalty_minutes, 10);
        let reduction = 0;

        if (mins === 2) {
          reduction = expirablePenalty.effEnd - goalTime;
        } else if (mins === 4) {
          const currentDuration = goalTime - expirablePenalty.effStart;
          if (currentDuration < 120) {
            const newEffEnd = goalTime + 120;
            reduction = expirablePenalty.effEnd - newEffEnd;
          } else {
            reduction = expirablePenalty.effEnd - goalTime;
          }
        }

        if (reduction > 0) {
          const newDbEndTime = parseInt(expirablePenalty.penalty_end_time, 10) - reduction;
          await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${expirablePenalty.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ ...expirablePenalty, penalty_end_time: newDbEndTime })
          });
        }
      }
    }
  };

  const saveEventRow = async (teamId, eventType, rowData, existingId = null) => {
    const payload = { period: currentPeriod, team_id: teamId, event_type: eventType, ...rowData };
    try {
      const url = existingId ? `${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${existingId}` : `${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`;
      const method = existingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
      const data = await res.json();
      
      if (data.success) {
        if (eventType === 'goal' && !existingId) {
          await processGoalPenaltyLogic(teamId, rowData.time_seconds);
        }

        loadInitialData();
        socket?.emit('score_updated', { gameId });
        socket?.emit('game_updated', { gameId });
        return true;
      }
    } catch (err) { console.error('Ошибка сохранения события', err); }
    return false;
  };

  // --- Вызовы модалок ---
  const requestDeleteEvent = (eventId) => {
    setDeleteModalState({ isOpen: true, eventId });
  };

  const confirmDeleteEvent = async () => {
    const { eventId } = deleteModalState;
    if (!eventId) return;

    setIsDeletingEvent(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${eventId}`, { method: 'DELETE', headers });
      loadInitialData();
      socket?.emit('score_updated', { gameId });
      socket?.emit('game_updated', { gameId });
    } catch (err) { 
      console.error(err); 
    }
    setIsDeletingEvent(false);
    setDeleteModalState({ isOpen: false, eventId: null });
  };

  const handleRequestPlusMinus = (event) => {
    const isHome = event.team_id === game.home_team_id;
    setPlusMinusModalState({
      isOpen: true,
      event,
      scoringTeam: isHome ? { id: game.home_team_id, name: game.home_team_name } : { id: game.away_team_id, name: game.away_team_name },
      concedingTeam: isHome ? { id: game.away_team_id, name: game.away_team_name } : { id: game.home_team_id, name: game.home_team_name }
    });
  };

  if (!game) return <div className="min-h-screen bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xl uppercase tracking-widest">Загрузка бланка...</div>;

  return (
    <div className="flex w-full h-screen bg-slate-200 font-sans overflow-hidden text-slate-900">
      
      {/* ЛЕВАЯ ЧАСТЬ (80%): СВЕТЛАЯ, КЛАССИЧЕСКИЙ БЛАНК С ЗЕБРОЙ */}
      <div className="w-[80%] h-full overflow-y-auto p-6 scroll-smooth bg-[#f8fafc]">
        <div className="mb-5 border-b-2 border-slate-500 pb-3">
            <h1 className="font-bold text-2xl text-slate-900 uppercase tracking-tight">Официальный протокол матча</h1>
        </div>

        <ProtocolSheet 
          teamId={game.home_team_id} 
          teamLetter="А" 
          teamName={game.home_team_name} 
          roster={homeRoster} 
          teamEvents={events.filter(e => e.team_id === game.home_team_id)} 
          timerSeconds={timerSeconds}
          onSaveEvent={saveEventRow}
          onDeleteEvent={requestDeleteEvent}
          onToggleLineup={toggleLineup}
          isPlusMinusEnabled={isPlusMinusEnabled}
          onRequestPlusMinus={handleRequestPlusMinus}
        />
        <ProtocolSheet 
          teamId={game.away_team_id} 
          teamLetter="Б" 
          teamName={game.away_team_name} 
          roster={awayRoster} 
          teamEvents={events.filter(e => e.team_id === game.away_team_id)} 
          timerSeconds={timerSeconds}
          onSaveEvent={saveEventRow}
          onDeleteEvent={requestDeleteEvent}
          onToggleLineup={toggleLineup}
          isPlusMinusEnabled={isPlusMinusEnabled}
          onRequestPlusMinus={handleRequestPlusMinus}
        />
      </div>

      {/* ПРАВАЯ ЧАСТЬ (20%): ТЕМНАЯ ПАНЕЛЬ ТАЙМЕРА */}
      <div className="w-[20%] h-full bg-slate-900 text-slate-200 p-6 flex flex-col border-l-4 border-slate-800 overflow-y-auto z-10 shadow-[-4px_0_15px_rgba(0,0,0,0.3)]">
        
        <div className="text-center mb-6 border-b border-slate-800 pb-4">
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2">Команды</div>
          <div className="text-lg font-bold text-white leading-tight">{game.home_team_name} <br/><span className="text-slate-600 font-medium text-xs my-1 block">VS</span> {game.away_team_name}</div>
        </div>

        <div className="flex justify-center items-center gap-4 mb-6 bg-slate-950 py-4 border border-slate-800 rounded-lg">
          <div className="text-5xl font-black text-white">{game.home_score}</div>
          <div className="text-slate-600 font-bold text-2xl pb-1">:</div>
          <div className="text-5xl font-black text-white">{game.away_score}</div>
        </div>

        <div className="mb-6">
          <div className="text-[10px] text-slate-500 uppercase font-bold mb-2 tracking-widest text-center">Период</div>
          <div className="grid grid-cols-5 gap-1 bg-slate-950 p-1 border border-slate-800 rounded-lg">
            {['1', '2', '3', 'OT', 'SO'].map(p => (
              <button key={p} onClick={() => changePeriod(p)} className={`py-1.5 text-xs font-bold rounded-sm transition-colors ${currentPeriod === p ? 'bg-slate-300 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <div className="text-[10px] text-slate-500 uppercase font-bold mb-2 tracking-widest text-center flex items-center justify-center gap-1.5">
             <span className={`w-2 h-2 rounded-full ${isTimerRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></span>
             Сквозное время
          </div>
          
          {isEditingTimer ? (
            <input
              autoFocus
              className="w-full text-center font-mono text-5xl font-black text-emerald-400 bg-slate-950 py-4 border-2 border-emerald-600 rounded-lg mb-4 outline-none shadow-inner"
              value={manualTimerInput}
              onChange={(e) => setManualTimerInput(formatTimeMask(e.target.value))}
              onBlur={saveTimerEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveTimerEdit(); } }}
            />
          ) : (
            <div 
              onClick={openTimerEdit}
              className={`w-full text-center font-mono text-5xl font-black tabular-nums tracking-tighter py-4 border rounded-lg mb-4 cursor-pointer transition-colors bg-slate-950 shadow-inner ${isTimerRunning ? 'border-slate-800 text-emerald-400' : 'border-slate-800 text-slate-400 hover:border-slate-700'}`}
              title="Нажмите, чтобы изменить время"
            >
              {formatTime(timerSeconds)}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-2 w-full">
            <button 
              onClick={() => handleTimerAction('start')} 
              disabled={isTimerRunning} 
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-20 disabled:hover:bg-emerald-700 py-3 rounded-lg text-white font-bold text-sm transition-colors border border-emerald-800 shadow-sm"
            >
              СТАРТ
            </button>
            <button 
              onClick={() => handleTimerAction('stop')} 
              disabled={!isTimerRunning} 
              className="bg-rose-700 hover:bg-rose-600 disabled:opacity-20 disabled:hover:bg-rose-700 py-3 rounded-lg text-white font-bold text-sm transition-colors border border-rose-800 shadow-sm"
            >
              СТОП
            </button>
          </div>
        </div>

        <div className="mt-auto space-y-4">
          <div className="bg-slate-950 p-4 border border-slate-800 rounded-lg text-sm shadow-inner">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-3 text-center">Настройки матча</div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-slate-400 font-medium text-xs">Период (мин):</span>
              <input 
                type="number" 
                value={periodLength} 
                onChange={(e) => setPeriodLength(parseInt(e.target.value) || 0)} 
                onBlur={saveTimerSettings}
                className="w-16 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-center text-white font-bold outline-none focus:border-sky-500 transition-colors" 
              />
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-slate-400 font-medium text-xs">Овертайм (мин):</span>
              <input 
                type="number" 
                value={otLength} 
                onChange={(e) => setOtLength(parseInt(e.target.value) || 0)} 
                onBlur={saveTimerSettings}
                className="w-16 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-center text-white font-bold outline-none focus:border-sky-500 transition-colors" 
              />
            </div>
            
            <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
              <span className="text-slate-400 font-medium text-xs">Учет +/-</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={isPlusMinusEnabled} onChange={() => setIsPlusMinusEnabled(!isPlusMinusEnabled)} />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-500 text-center uppercase tracking-widest font-bold">
            <div className="flex items-center justify-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${socket?.connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
              {socket?.connected ? 'Синхронизировано' : 'Отключено'}
            </div>
          </div>
        </div>

      </div>

      <ConfirmModal 
        isOpen={deleteModalState.isOpen}
        onClose={() => setDeleteModalState({ isOpen: false, eventId: null })}
        onConfirm={confirmDeleteEvent}
        isLoading={isDeletingEvent}
      />

      <GamePlusMinusModal 
        isOpen={plusMinusModalState.isOpen}
        onClose={() => setPlusMinusModalState(p => ({ ...p, isOpen: false }))}
        gameId={gameId}
        event={plusMinusModalState.event}
        scoringTeam={plusMinusModalState.scoringTeam}
        concedingTeam={plusMinusModalState.concedingTeam}
        scoringRoster={plusMinusModalState.scoringTeam?.id === game.home_team_id ? homeRoster : awayRoster}
        concedingRoster={plusMinusModalState.concedingTeam?.id === game.home_team_id ? homeRoster : awayRoster}
        onSuccess={loadInitialData}
      />
    </div>
  );
}