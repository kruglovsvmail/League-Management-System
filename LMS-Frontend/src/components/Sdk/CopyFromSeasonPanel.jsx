import React, { useState } from 'react';
import { Select } from '../../ui/Select';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

// Клонирование справочника из другого сезона. Показывается в пустом состоянии обеих
// вкладок («Причины удалений», «Таблица штрафов»): заполнять полсотни строк руками
// каждый август бессмысленно, если в прошлом сезоне они уже есть.
//
// onCopy(fromSeasonId) должен вернуть { success, copied?, error? }.
export function CopyFromSeasonPanel({ seasons = [], seasonId, onCopy, canManage = true, hint }) {
  const [fromId, setFromId] = useState('');
  const [isCopying, setIsCopying] = useState(false);

  // Сезон сам в себя не копируем — из списка его убираем
  const otherSeasons = seasons.filter(s => String(s.id) !== String(seasonId));
  if (!canManage || !seasonId || otherSeasons.length === 0) return null;

  const handleCopy = async () => {
    if (!fromId || isCopying) return;
    setIsCopying(true);
    try {
      await onCopy(fromId);
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className="mx-auto max-w-[460px] bg-white/70 border border-graphite/10 rounded-lg p-5 flex flex-col gap-3 text-left">
      <div className="flex items-center gap-2">
        <Icon name="refresh" className="w-4 h-4 text-orange" />
        <span className="text-[13px] font-black text-graphite uppercase tracking-wide">Скопировать из другого сезона</span>
      </div>
      {hint && <p className="text-[12px] text-graphite-light leading-tight">{hint}</p>}
      <Select
        options={otherSeasons.map(s => ({ value: s.id, label: s.name }))}
        value={fromId}
        onChange={setFromId}
        placeholder="Выберите сезон"
      />
      <Button onClick={handleCopy} isLoading={isCopying} disabled={!fromId} className="w-full">
        Скопировать
      </Button>
    </div>
  );
}
