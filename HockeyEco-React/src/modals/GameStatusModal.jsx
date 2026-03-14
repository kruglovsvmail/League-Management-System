import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { getToken } from '../utils/helpers';

// Записываем полные строки классов, чтобы Tailwind их 100% увидел
const STATUS_OPTIONS = [
  { 
    value: 'scheduled', 
    label: 'В расписании', 
    styles: {
      bg: 'bg-orange/10', border: 'border-orange', 
      text: 'text-orange', hover: 'hover:border-orange/40', 
      dot: 'bg-orange'
    },
    desc: 'Матч запланирован, разрешено редактирование параметров' 
  },
  { 
    value: 'live', 
    label: 'LIVE (Идет сейчас)', 
    styles: {
      bg: 'bg-blue-500/10', border: 'border-blue-500', 
      text: 'text-blue-600', hover: 'hover:border-blue-500/40', 
      dot: 'bg-blue-500'
    },
    desc: 'Матч начался, зрители видят онлайн-статистику' 
  },
  { 
    value: 'finished', 
    label: 'Завершен', 
    styles: {
      bg: 'bg-status-accepted/10', border: 'border-status-accepted', 
      text: 'text-status-accepted', hover: 'hover:border-status-accepted/40', 
      dot: 'bg-status-accepted'
    },
    desc: 'Матч окончен, результат зафиксирован в таблице' 
  },
  { 
    value: 'cancelled', 
    label: 'Отменен', 
    styles: {
      bg: 'bg-status-rejected/10', border: 'border-status-rejected', 
      text: 'text-status-rejected', hover: 'hover:border-status-rejected/40', 
      dot: 'bg-status-rejected'
    },
    desc: 'Матч не состоялся и отменен' 
  }
];

export function GameStatusModal({ isOpen, onClose, game, onSuccess }) {
  const [selectedStatus, setSelectedStatus] = useState('scheduled');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && game) {
      setSelectedStatus(game.status || 'scheduled');
    }
  }, [isOpen, game]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${game.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ status: selectedStatus })
      });
      const data = await res.json();
      if (data.success) {
        if (onSuccess) onSuccess();
        onClose();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Ошибка сети');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Статус матча" size="medium">
      <div className="mb-4 text-center">
        <span className="text-[13px] text-graphite-light font-semibold uppercase tracking-wide block mb-1">Изменение статуса</span>
        <span className="text-[18px] font-black text-graphite">{game?.home_team_name} - {game?.away_team_name}</span>
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
        <Button 
          onClick={handleSave} 
          isLoading={isSaving} 
          disabled={isSaving} 
          className="w-full sm:w-auto"
        >
          Сохранить статус
        </Button>
      </div>
    </Modal>
  );
}