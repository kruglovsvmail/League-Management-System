import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { getToken } from '../utils/helpers';

const TECH_OPTIONS = [
  { 
    value: 'home_win', 
    styles: {
      bg: 'bg-blue-500/10', border: 'border-blue-500', 
      text: 'text-blue-600', hover: 'hover:border-blue-500/40', 
      dot: 'bg-blue-500'
    },
    desc: 'Техническая победа хозяев' 
  },
  { 
    value: 'away_win', 
    styles: {
      bg: 'bg-blue-500/10', border: 'border-blue-500', 
      text: 'text-blue-600', hover: 'hover:border-blue-500/40', 
      dot: 'bg-blue-500'
    },
    desc: 'Техническая победа гостей' 
  },
  { 
    value: 'both_lose', 
    styles: {
      bg: 'bg-status-rejected/10', border: 'border-status-rejected', 
      text: 'text-status-rejected', hover: 'hover:border-status-rejected/40', 
      dot: 'bg-status-rejected'
    },
    desc: 'Обоюдное техническое поражение' 
  },
  { 
    value: 'none', 
    styles: {
      bg: 'bg-graphite/5', border: 'border-graphite/10', 
      text: 'text-graphite', hover: 'hover:border-graphite/40', 
      dot: 'bg-graphite'
    },
    desc: 'Нет технического результата' 
  }
];

export function TechDefeatModal({ isOpen, onClose, game, onSuccess }) {
  const [selectedResult, setSelectedResult] = useState('none');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && game) {
      if (game.is_technical === '+/-') {
        setSelectedResult('home_win');
      } else if (game.is_technical === '-/+') {
        setSelectedResult('away_win');
      } else if (game.is_technical === '-/-') {
        setSelectedResult('both_lose');
      } else {
        setSelectedResult('none');
      }
    }
  }, [isOpen, game]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Принудительно отправляем статус. Если снимаем технарь - отправляем текущий статус 
      // (даже если он 'finished'), чтобы бэкенд гарантированно запустил пересчет.
      const targetStatus = selectedResult === 'none' ? (game.status || 'scheduled') : 'finished';

      const payload = selectedResult === 'none'
        ? { status: targetStatus, end_type: 'regular', tech_result: null }
        : { status: targetStatus, end_type: 'tech', tech_result: selectedResult };

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${game.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        if (onSuccess) onSuccess();
        onClose();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Ошибка сети при сохранении результата');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Технический результат" size="medium">
      <div className="flex flex-col gap-3 mb-6">
        {TECH_OPTIONS.map(opt => (
          <div 
            key={opt.value}
            onClick={() => setSelectedResult(opt.value)}
            className={`flex items-center gap-4 p-3 rounded-md transition-all border ${
              selectedResult === opt.value 
                ? `${opt.styles.border} ${opt.styles.bg}` 
                : `border-graphite/10 cursor-pointer ${opt.styles.hover} hover:bg-black/5`
            }`}
          >
            <div className="flex flex-col flex-1 min-w-0">
              <span className={`font-bold text-[14px] leading-[1.3] ${selectedResult === opt.value ? opt.styles.text : 'text-graphite'}`}>
                {opt.desc}
              </span>
            </div>
            
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
              selectedResult === opt.value ? opt.styles.border : 'border-graphite-light'
            }`}>
              <div className={`w-2.5 h-2.5 rounded-full ${opt.styles.dot} transition-transform ${selectedResult === opt.value ? 'scale-100' : 'scale-0'}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-5 border-t border-graphite/10">
        <Button 
          onClick={handleSave} 
          isLoading={isSaving} 
          disabled={isSaving} 
          className="w-full md:w-auto"
        >
          Сохранить изменения
        </Button>
      </div>
    </Modal>
  );
}