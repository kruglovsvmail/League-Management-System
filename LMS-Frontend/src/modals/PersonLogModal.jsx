import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { Modal } from './Modal';
import { Loader } from '../ui/Loader';
import { getToken } from '../utils/helpers';
import { describeLogEntry, SOURCE_LABELS } from '../utils/personLog';

// История изменений по человеку в заявке — открывается щелчком по колонке «Обновлено»
// в составе дивизиона. Список из tournament_person_log, новые сверху; коды событий
// переводит utils/personLog.js. Оформление — как у «Истории квалификаций» и «Истории
// дисквалификаций»: карточки списком под заголовком капителью.
export function PersonLogModal({ isOpen, onClose, appId, person }) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !appId || !person?.player_id) return;
    let cancelled = false;
    setIsLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/tournament-teams/${appId}/persons/${person.player_id}/log`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => { if (!cancelled) setEntries(data.success ? data.data : []); })
      .catch(() => { if (!cancelled) setEntries([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, appId, person?.player_id]);

  const personName = person ? `${person.last_name || ''} ${person.first_name || ''}`.trim() : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="История изменений" size="medium">
      <div className="text-[13px] font-bold text-graphite mb-4">{personName}</div>

      {isLoading ? (
        <Loader text="" />
      ) : entries.length === 0 ? (
        <div className="text-[12px] text-graphite-light leading-tight">
          Записей пока нет: журнал ведётся с момента его включения, более ранние изменения в него не попали.
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
          {entries.map(entry => {
            const { title, note } = describeLogEntry(entry);
            // Время — в поясе браузера, как и в колонке «Обновлено»
            const when = dayjs(entry.created_at);
            const isAuto = !!entry.details?.auto;
            const who = [entry.actor_name || null, SOURCE_LABELS[entry.source] || entry.source]
              .filter(Boolean)
              .join(' · ');
            return (
              <div key={entry.id} className="flex flex-col gap-1 bg-graphite/[0.03] border border-graphite/10 rounded-md px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide whitespace-nowrap">
                    {when.format('DD.MM.YYYY')} <span className="normal-case tracking-normal">{when.format('HH:mm')}</span>
                  </span>
                  <span className="text-[11px] text-graphite-light truncate" title={who}>
                    {isAuto ? `автоматически · ${who}` : who}
                  </span>
                </div>
                <span className="text-[13px] text-graphite leading-snug">{title}</span>
                {note && <span className="text-[11px] text-graphite-light leading-tight">{note}</span>}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
