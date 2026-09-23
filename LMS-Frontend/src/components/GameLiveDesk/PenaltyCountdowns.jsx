// src/components/GameLiveDesk/PenaltyCountdowns.jsx
import React, { useEffect, useState } from 'react';
import { formatTime } from './GameDeskShared';

const ANIMATION_MS = 300;

// Плавно раскрывается и сворачивается по высоте (grid-template-rows 0fr ↔ 1fr), поэтому
// всё, что ниже, — блок корректировки времени — съезжает и возвращается без рывка.
// Раскрытие — со следующего кадра после появления, иначе браузеру нечего анимировать.
function Collapse({ show, onExited, children }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (show) {
      let inner;
      const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setOpen(true)); });
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    }
    setOpen(false);
    const t = setTimeout(() => onExited?.(), ANIMATION_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  return (
    <div className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

// Номер того, кто сидит на скамейке штрафников (servingJersey — отбывающий за нарушителя
// или сам нарушитель, см. activePenalties в GameLiveDesk): по нему секретарь понимает, кого
// выпускать. Номера нет — фамилия нарушителя, у командного без отбывающего — «Команда».
const offenderLabel = (p) => {
  if (p.servingJersey !== null && p.servingJersey !== undefined && p.servingJersey !== '') {
    return `№${p.servingJersey}`;
  }
  return p.primary_last_name || 'Команда';
};

/**
 * Бейджи удалений под таймером панели секретаря: левая команда слева, правая справа, у
 * каждого — обратный отсчёт до конца меньшинства. Отложенные (ждут свободный слот) —
 * тоже здесь, приглушённые и без отсчёта; начавшись, тот же бейдж становится обычным.
 *
 * penalties — уже отобранные позиции табло (calculateOnIcePenalties, как у трансляции)
 * с полями remaining и waiting. Бейджи держим в своём списке: истёкший штраф пропадает
 * из penalties сразу, а бейдж должен ещё свернуться — он доигрывает анимацию на 0:00.
 */
export function PenaltyCountdowns({ penalties, homeTeamId, awayTeamId }) {
  const [items, setItems] = useState([]); // { key, penalty, show }

  useEffect(() => {
    setItems(prev => {
      const live = new Map(penalties.map(p => [p.id, p]));
      const next = prev.map(it => (live.has(it.key)
        ? { ...it, penalty: live.get(it.key), show: true }
        : { ...it, show: false }));
      live.forEach((p, key) => {
        if (!prev.some(it => it.key === key)) next.push({ key, penalty: p, show: true });
      });
      return next;
    });
  }, [penalties]);

  const removeItem = (key) => setItems(prev => prev.filter(it => it.key !== key || it.show));

  const column = (teamId, align) => (
    <div className="flex-1 min-w-0 flex flex-col">
      {items.filter(it => it.penalty.team_id === teamId).map(it => (
        <Collapse key={it.key} show={it.show} onExited={() => removeItem(it.key)}>
          {/* Бейдж на всю ширину своей половины панели, у правой команды зеркально.
              Отложенный — пунктиром и приглушённо, с полной длительностью: отсчёт у него
              начнётся, когда освободится место на скамейке штрафников. */}
          <div className="pt-2">
            <div
              title={it.penalty.waiting ? 'Отложенное удаление: начнётся, когда освободится место на скамейке штрафников' : undefined}
              className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border transition-colors duration-300 ${
                it.penalty.waiting ? 'bg-white/5 border-dashed border-white/25' : 'bg-status-rejected/15 border-status-rejected/30'
              } ${align === 'right' ? 'flex-row-reverse' : ''}`}
            >
              <span className={`min-w-0 text-[12px] font-black uppercase tracking-wider truncate ${it.penalty.waiting ? 'text-white/45' : 'text-white/75'}`}>
                {offenderLabel(it.penalty)}
              </span>
              <span className={`shrink-0 font-mono text-[18px] font-bold leading-none tabular-nums ${it.penalty.waiting ? 'text-white/45' : 'text-status-rejected'}`}>
                {formatTime(it.show ? it.penalty.remaining : 0)}
              </span>
            </div>
          </div>
        </Collapse>
      ))}
    </div>
  );

  return (
    <div className="flex items-start gap-2">
      {column(homeTeamId, 'left')}
      {column(awayTeamId, 'right')}
    </div>
  );
}
