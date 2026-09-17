import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { getImageUrl } from '../utils/helpers';

// Импортируем заглушку
import { AccessFallback } from '../ui/AccessFallback';

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
      bg: 'bg-orange/10', border: 'border-orange', 
      text: 'text-orange', hover: 'hover:border-orange/40', 
      dot: 'bg-orange'
    },
    desc: 'Заявка ожидает решения' 
  },
  { 
    value: 'revision', 
    label: 'На исправлении', 
    styles: {
      bg: 'bg-blue-500/10', border: 'border-blue-500', 
      text: 'text-blue-600', hover: 'hover:border-blue-500/40', 
      dot: 'bg-blue-500'
    },
    desc: 'Команда исправляет недочеты или дополняет заявку' 
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

// Одно значение поля слепка для строки «было → стало»: текст, картинка или пара цветов
function SnapshotValue({ kind, value }) {
  if (kind === 'image') {
    return value
      ? <img src={getImageUrl(value)} alt="" className="w-10 h-10 object-contain rounded border border-graphite/10 bg-white" />
      : <span className="text-graphite-light">—</span>;
  }
  if (kind === 'color') {
    const colors = Array.isArray(value) ? value : [value];
    return (
      <span className="inline-flex items-center gap-1">
        {colors.map((c, i) => c
          ? <span key={i} className="w-5 h-5 rounded border border-graphite/20 inline-block" style={{ backgroundColor: c }} title={c} />
          : <span key={i} className="text-graphite-light">—</span>
        )}
      </span>
    );
  }
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  return <span className="break-words" title={text}>{text.length > 60 ? `${text.slice(0, 60)}…` : text}</span>;
}

export function TeamStatusModal({ isOpen, onClose, currentStatus, teamName, onSave, isSaving = false, readOnly = false, hasSnapshot = false, snapshotDiff = [] }) {
  const [selectedStatus, setSelectedStatus] = useState(currentStatus || 'pending');
  // Какие изменения профиля команды принять в слепок заявки. По умолчанию — ничего:
  // «Сохранить» вместо крестика не должно молча переписать зафиксированные данные.
  const [accepted, setAccepted] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedStatus(currentStatus || 'pending');
      setAccepted([]);
    }
  }, [isOpen, currentStatus]);

  const toggleAccepted = (key) =>
    setAccepted(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));

  // Блок расхождений — только у заявки со слепком, только при выборе «Допущена»
  // и только если команда что-то изменила после допуска
  const showDiff = hasSnapshot && selectedStatus === 'approved' && snapshotDiff.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Статус команды" size="medium">
      
      {readOnly && (
        <AccessFallback variant="readonly" message="Режим просмотра. Изменение статуса команды недоступно." />
      )}

      <div className="mb-4 text-center mt-2">
        <span className="text-[20px] font-black text-graphite">{teamName}</span>
      </div>

      <div className="flex flex-col gap-2 mb-6 font-sans">
        {STATUS_OPTIONS.map(opt => (
          <div 
            key={opt.value}
            onClick={() => !readOnly && setSelectedStatus(opt.value)}
            className={`flex items-center gap-4 p-3.5 rounded-md transition-all border ${
              selectedStatus === opt.value 
                ? `${opt.styles.border} ${opt.styles.bg}` 
                : `border-graphite/10 ${opt.styles.hover} hover:bg-black/5`
            } ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
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

      {showDiff && (
        <div className="mb-6 font-sans">
          <div className="px-3 py-2 rounded-md bg-status-pending/10 border border-status-pending/30 text-[12px] text-graphite leading-snug mb-3">
            Команда изменила профиль после допуска. Данные в заявке зафиксированы на момент допуска
            и сами не меняются. Отметьте, какие изменения принять в заявку; без отметки всё останется как было.
          </div>
          <div className="flex flex-col gap-2">
            {snapshotDiff.map(d => (
              <div key={d.key} className="px-3 py-2 rounded-md border border-graphite/10 bg-white/50">
                <Checkbox
                  className=""
                  checked={accepted.includes(d.key)}
                  onChange={() => !readOnly && toggleAccepted(d.key)}
                  label={(
                    <span className="flex flex-col gap-1 text-[13px]">
                      <span className="font-bold text-graphite">{d.label}</span>
                      <span className="flex items-center gap-2 text-graphite-light">
                        <SnapshotValue kind={d.kind} value={d.old} />
                        <span className="text-graphite/40">→</span>
                        <SnapshotValue kind={d.kind} value={d.new} />
                      </span>
                    </span>
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-end pt-5 border-t border-graphite/10">
          <Button
            onClick={() => onSave(selectedStatus, showDiff ? accepted : [])}
isLoading={isSaving} 
            disabled={isSaving} 
            className="w-full sm:w-auto bg-orange text-white border-none transition-all duration-300 hover:bg-orange-hover"
          >
            Сохранить
          </Button>
        </div>
      )}
    </Modal>
  );
}