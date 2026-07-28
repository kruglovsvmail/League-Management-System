import React from 'react';
import { Badge } from '../../ui/Badge';

// История прошлых дисквалификаций выбранного игрока/представителя в этой лиге — общая для шторки
// решения СДК и лайт-модалки назначения дисквалификации.
export function DisqualificationHistoryPanel({ showHistory, isLoadingHistory, personHistory }) {
  if (!showHistory) return null;

  return (
    <div className="flex flex-col gap-2 animate-zoom-in">
      <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">История дисквалификаций в лиге</span>
      {isLoadingHistory ? (
        <div className="text-center text-graphite-light text-[12px] py-3">Загрузка...</div>
      ) : personHistory.length === 0 ? (
        <div className="text-[12px] text-graphite-light py-1 px-0.5">Ранее не наказывался</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
          {personHistory.map(h => (
            <div key={h.id} className="flex flex-col gap-1 bg-graphite/[0.03] border border-graphite/10 rounded-md px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-graphite-light uppercase truncate">{h.season_name || 'Без сезона'}</span>
                <Badge label={h.status === 'active' ? 'Дискв.' : 'Отбыл'} type={h.status === 'active' ? 'expired' : 'filled'} />
              </div>
              <span className="text-[12px] text-graphite leading-snug">{h.violation_code ? `${h.violation_code}. ` : ''}{h.violation_title || h.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
