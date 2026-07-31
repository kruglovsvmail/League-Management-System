import { useState, useEffect } from 'react';
import { getToken } from '../utils/helpers';
import { penaltyReasonOptions as BUILTIN_REASONS } from '../components/GameLiveDesk/GameDeskShared';

// Причины удаления для панели секретаря: справочник сезона (penalty_types), который лига
// ведёт в настройках -> «Справочники» -> «Причины удалений».
//
// Пока лига справочник не заполнила, отдаём встроенный список из GameDeskShared —
// иначе выпадающий список окажется пустым и записать удаление будет нечем.
// Признак isFallback пригодится, если захочется показать секретарю подсказку.
export function usePenaltyReasons(gameId) {
  const [options, setOptions] = useState(BUILTIN_REASONS);
  const [isFallback, setIsFallback] = useState(true);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;

    fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/penalty-types`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        const items = data?.success ? (data.data || []) : [];
        if (items.length === 0) {
          setOptions(BUILTIN_REASONS);
          setIsFallback(true);
          return;
        }
        setOptions(items.map(r => ({
          value: r.title,        // именно наименование уходит в game_events.penalty_violation
          label: r.title,        // модалка выбора
          shortLabel: r.code,    // поле секретаря и PDF
          num: r.number,         // номер в модалке и поиск по нему
          reasonId: r.id,        // ссылка на пункт справочника
        })));
        setIsFallback(false);
      })
      .catch(() => {
        // Сеть отвалилась — на встроенном списке протокол вести всё равно можно
        if (!cancelled) { setOptions(BUILTIN_REASONS); setIsFallback(true); }
      });

    return () => { cancelled = true; };
  }, [gameId]);

  return { penaltyReasons: options, isFallback };
}
