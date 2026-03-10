import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';

// Записываем полные строки классов, чтобы Tailwind их 100% увидел
const STATUS_OPTIONS = [
  { 
    value: 'approved', 
    label: 'Допущена', 
    styles: {
      bg: 'bg-status-accepted/10', border: 'border-status-accepted', 
      text: 'text-status-accepted', hover: 'hover:border-status-accepted/40', 
      dot: 'bg-status-accepted'
    },
    desc: 'Команда допущена к участию в турнире' 
  },
  { 
    value: 'pending', 
    label: 'На проверке', 
    styles: {
      bg: 'bg-status-pending/10', border: 'border-status-pending', 
      text: 'text-status-pending', hover: 'hover:border-status-pending/40', 
      dot: 'bg-status-pending'
    },
    desc: 'Заявка ожидает решения администратора' 
  },
  { 
    value: 'revision', 
    label: 'На исправлении', 
    styles: {
      bg: 'bg-orange/10', border: 'border-orange', 
      text: 'text-orange', hover: 'hover:border-orange/40', 
      dot: 'bg-orange'
    },
    desc: 'Команда исправляет недочеты в заявке' 
  },
  { 
    value: 'rejected', 
    label: 'Отклонена', 
    styles: {
      bg: 'bg-status-rejected/10', border: 'border-status-rejected', 
      text: 'text-status-rejected', hover: 'hover:border-status-rejected/40', 
      dot: 'bg-status-rejected'
    },
    desc: 'Команда не допущена к турниру' 
  }
];

export function TeamStatusModal({ isOpen, onClose, currentStatus, teamName, onSave, isSaving = false }) {
  const [selectedStatus, setSelectedStatus] = useState(currentStatus || 'pending');

  useEffect(() => {
    if (isOpen) setSelectedStatus(currentStatus || 'pending');
  }, [isOpen, currentStatus]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Статус команды" size="medium">
      <div className="mb-4 text-center">
        <span className="text-[13px] text-graphite-light font-semibold uppercase tracking-wide block mb-1">Команда</span>
        <span className="text-[18px] font-black text-graphite">{teamName}</span>
      </div>

      <div className="flex flex-col gap-2 mb-6 font-sans">
        {STATUS_OPTIONS.map(opt => (
          <div 
            key={opt.value}
            onClick={() => setSelectedStatus(opt.value)}
            className={`flex items-center gap-4 p-3.5 rounded-xl cursor-pointer transition-all border ${
              selectedStatus === opt.value 
                ? `${opt.styles.border} ${opt.styles.bg}` 
                : `border-graphite/10 ${opt.styles.hover} hover:bg-black/5`
            }`}
          >
            <div className="flex flex-col flex-1">
              <span className={`font-bold text-[14px] ${selectedStatus === opt.value ? opt.styles.text : 'text-graphite'}`}>
                {opt.label}
              </span>
              <span className="text-[12px] text-graphite-light mt-0.5">{opt.desc}</span>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
              selectedStatus === opt.value ? opt.styles.border : 'border-graphite-light'
            }`}>
              <div className={`w-2.5 h-2.5 rounded-full ${opt.styles.dot} transition-transform ${selectedStatus === opt.value ? 'scale-100' : 'scale-0'}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-5 border-t border-graphite/10">
        {/* Добавил явные цвета для кнопки, чтобы она гармонировала с общим стилем проекта */}
        <Button 
          onClick={() => onSave(selectedStatus)} 
          isLoading={isSaving} 
          disabled={isSaving} className={`w-full sm:w-auto bg-orange text-white border-none transition-all duration-300 ${isSaving ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-orange-hover'}`}
        >
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}