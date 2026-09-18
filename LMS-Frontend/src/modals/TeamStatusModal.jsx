import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
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

// Одно значение поля слепка в ячейке таблицы расхождений: текст (до двух строк),
// картинка или пара цветов. Пустое значение у картинки и цвета — пунктирный квадрат
// того же размера, чтобы строки не прыгали по высоте.
function SnapshotValue({ kind, value }) {
  if (kind === 'image') {
    return value
      ? <img src={getImageUrl(value)} alt="" className="w-7 h-7 object-contain rounded border border-graphite/10 bg-white shrink-0" />
      : <span className="w-7 h-7 rounded border border-dashed border-graphite/25 shrink-0" />;
  }
  if (kind === 'color') {
    const colors = Array.isArray(value) ? value : [value];
    return (
      <span className="inline-flex items-center gap-1 shrink-0">
        {colors.map((c, i) => c
          ? <span key={i} className="w-4 h-4 rounded border border-graphite/20 inline-block" style={{ backgroundColor: c }} title={c} />
          : <span key={i} className="w-4 h-4 rounded border border-dashed border-graphite/25 inline-block" />
        )}
      </span>
    );
  }
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  return <span className="line-clamp-2 break-words min-w-0" title={text}>{text}</span>;
}

// Сетка таблицы расхождений: галочка, поле, значение в заявке, значение в профиле
const DIFF_GRID = 'grid grid-cols-[28px_180px_1fr_1fr] gap-x-2';

// Строка таблицы — кликается целиком, отмеченная подсвечивается
function SnapshotDiffRow({ diff, checked, disabled, isLast, onToggle }) {
  return (
    <div
      onClick={() => !disabled && onToggle()}
      className={`${DIFF_GRID} items-center px-2 py-2 transition-colors ${isLast ? '' : 'border-b border-graphite/10'} ${
        checked ? 'bg-orange/5' : 'hover:bg-graphite/[0.03]'
      } ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
    >
      <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center transition-colors ${
        checked ? 'bg-orange border-orange' : 'border-graphite-light'
      }`}>
        <svg className={`w-3.5 h-3.5 text-white transition-opacity ${checked ? 'opacity-100' : 'opacity-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <span className="font-bold text-[12px] text-graphite truncate">{diff.label}</span>
      <span className="text-[12px] text-graphite-light min-w-0 flex items-center"><SnapshotValue kind={diff.kind} value={diff.old} /></span>
      <span className="text-[12px] text-graphite min-w-0 flex items-center"><SnapshotValue kind={diff.kind} value={diff.new} /></span>
    </div>
  );
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

  // Расхождения между заявкой и профилем команды есть только у заявки со слепком.
  // Колонка с ними раскрывается справа при выборе «Допущена» — окно при этом плавно
  // растягивается (см. transition в Modal); при другом статусе сворачивается обратно.
  const hasDiff = hasSnapshot && snapshotDiff.length > 0;
  const showDiff = hasDiff && selectedStatus === 'approved';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Статус команды" size={showDiff ? 'wide-lg' : 'medium'}>

      {readOnly && (
        <AccessFallback variant="readonly" message="Режим просмотра. Изменение статуса команды недоступно." />
      )}

      <div className="mb-4 text-center mt-2">
        <span className="text-[20px] font-black text-graphite">{teamName}</span>
      </div>

      <div className="flex items-start mb-6">
      <div className="flex-1 min-w-0 flex flex-col gap-2 font-sans">
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

      {/* Правая колонка — расхождения заявки с профилем команды. Содержимое фиксированной
          ширины, чтобы текст не переливался, пока колонка анимируется от нуля. */}
      {hasDiff && (
        <div className={`shrink-0 overflow-hidden transition-all duration-300 ease-out ${showDiff ? 'w-[550px] ml-6 opacity-100' : 'w-0 ml-0 opacity-0'}`}>
          <div className="w-[550px] font-sans">
            <div className="text-[13px] font-bold text-graphite mb-1">Расхождения с профилем команды</div>
            <div className="text-[12px] text-graphite-light leading-snug mb-3">
              Данные в заявке зафиксированы при допуске и отличаются от профиля команды.
              Отметьте, что принять из профиля; без отметки всё останется как было.
            </div>
            <div className="rounded-md border border-graphite/10 bg-white/60 overflow-hidden">
              <div className={`${DIFF_GRID} px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-graphite/45 border-b border-graphite/10 bg-graphite/[0.03]`}>
                <span /><span>Поле</span><span>Заявка</span><span>Профиль</span>
              </div>
              <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                {snapshotDiff.map((d, i) => (
                  <SnapshotDiffRow
                    key={d.key}
                    diff={d}
                    checked={accepted.includes(d.key)}
                    disabled={readOnly}
                    isLast={i === snapshotDiff.length - 1}
                    onToggle={() => toggleAccepted(d.key)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

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