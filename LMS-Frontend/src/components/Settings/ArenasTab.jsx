import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { Table } from '../../ui/Table2';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Loader } from '../../ui/Loader';
import { AccessFallback } from '../../ui/AccessFallback';
import { Checkbox } from '../../ui/Checkbox';
import { getToken } from '../../utils/helpers';

// Порядок арен в выпадающих списках. Значения совпадают с leagues.arena_sort_order,
// саму сортировку применяет сервер при выдаче списка арен лиги (getArenas).
const ARENA_SORT_OPTIONS = [
  { value: 'name', label: 'Название', hint: 'По алфавиту, по названию арены' },
  { value: 'city', label: 'Город', hint: 'Сначала по городу, внутри города — по названию' },
  { value: 'added_desc', label: 'Новые сверху', hint: 'По дате добавления в лигу: недавно добавленные в начале списка' },
  { value: 'added_asc', label: 'Новые снизу', hint: 'По дате добавления в лигу: недавно добавленные в конце списка' },
];

export function ArenasTab({ setToast }) {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  
  const canView = checkAccess('SETTINGS_ARENAS_VIEW');
  const canManage = checkAccess('SETTINGS_ARENAS_MANAGE');

  const [allArenas, setAllArenas] = useState([]); // Все доступные в системе арены
  const [leagueArenas, setLeagueArenas] = useState([]); // Арены, уже привязанные к лиге
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Порядок арен в выпадающих списках матчей. Применяется на сервере при выдаче
  // списка (см. getArenas), поэтому вступает в силу сразу после сохранения.
  const [sortOrder, setSortOrder] = useState('name');
  const [isSavingSort, setIsSavingSort] = useState(false);

  const loadArenas = async () => {
    setIsLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${getToken()}` };
      
      const [allRes, leagueRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-arenas/all`, { headers }),
        fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-arenas`, { headers })
      ]);

      const allData = await allRes.json();
      const leagueData = await leagueRes.json();

      if (allData.success) setAllArenas(allData.arenas);
      if (leagueData.success) setLeagueArenas(leagueData.arenas);
    } catch (err) {
      console.error(err);
      setToast({ title: 'Ошибка', message: 'Не удалось загрузить список арен', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSortOrder = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/preferences`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success && data.data?.arena_sort_order) setSortOrder(data.data.arena_sort_order);
    } catch (err) {
      console.error('Не удалось загрузить порядок сортировки арен', err);
    }
  };

  const saveSortOrder = async (value) => {
    const previous = sortOrder;
    setSortOrder(value);
    setIsSavingSort(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ arena_sort_order: value })
      });
      const data = await res.json();
      if (!data.success) {
        setSortOrder(previous);
        setToast({ title: 'Ошибка', message: data.error || 'Не удалось сохранить сортировку', type: 'error' });
      }
    } catch (err) {
      setSortOrder(previous);
      setToast({ title: 'Ошибка', message: 'Не удалось сохранить сортировку', type: 'error' });
    } finally {
      setIsSavingSort(false);
    }
  };

  useEffect(() => {
    if (canView && selectedLeague?.id) { loadArenas(); loadSortOrder(); }
  }, [selectedLeague?.id, canView]);

  const toggleArena = async (arenaId, action) => {
    setIsProcessing(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-arenas/toggle`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ arenaId, action })
      });
      const data = await res.json();
      if (data.success) {
        await loadArenas();
        setToast({ 
          title: 'Успешно', 
          message: action === 'add' ? 'Арена добавлена в лигу' : 'Арена удалена из лиги', 
          type: 'success' 
        });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Ошибка при обновлении списка арен', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Фильтруем список всех арен для поиска, исключая те, что уже добавлены
  const availableArenas = allArenas.filter(a => {
    const isAlreadyInLeague = leagueArenas.some(la => la.id === a.id);
    if (isAlreadyInLeague) return false;
    
    const searchStr = `${a.name} ${a.city} ${a.address}`.toLowerCase();
    return searchStr.includes(searchTerm.toLowerCase());
  });

  if (!canView) return <AccessFallback variant="full" message="Нет прав для просмотра арен лиги." />;

  const leagueColumns = [
    { 
      label: 'Название арены', 
      sortKey: 'name', 
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-bold text-[14px] text-graphite">{row.name}</span>
          <span className="text-[11px] font-bold uppercase text-orange/50 tracking-widest">{row.city}</span>
        </div>
      )
    },
    { 
      label: 'Адрес', 
      sortKey: 'address', 
      render: (row) => (
        <span className="text-[13px] font-medium text-graphite/60 leading-tight">
          {row.address || '—'}
        </span>
      )
    },
    { 
      label: '', 
      width: 'w-16', 
      align: 'right',
      render: (row) => canManage && (
        <button 
          onClick={() => toggleArena(row.id, 'remove')}
          disabled={isProcessing}
          className="p-2 text-graphite-light hover:text-status-rejected hover:bg-status-rejected/10 rounded-lg transition-colors"
          title="Убрать из лиги"
        >
          <Icon name="delete" className="w-5 h-5" />
        </button>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-6 animate-zoom-in">
      {!canManage && (
        <AccessFallback variant="readonly" message="Режим просмотра. Для изменения списка арен обратитесь к администратору." />
      )}

      <div className="flex flex-col lg:flex-row gap-8 items-start">

        {/* ЛЕВАЯ КОЛОНКА: АРЕНЫ ЛИГИ + СОРТИРОВКА */}
        <div className="flex-1 w-full flex flex-col gap-6">
        <div className="w-full bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 min-h-[500px] relative">
          {isLoading && (
            <div className="absolute inset-0 z-30 flex pt-20 justify-center backdrop-blur-sm rounded-lg">
              <Loader text="" />
            </div>
          )}
          
          <div className="flex justify-between items-center mb-6">
            <div className="flex flex-col">
              <span className="text-[16px] font-black text-graphite uppercase tracking-wide">Арены лиги</span>
              <p className="text-[12px] font-medium text-graphite-light">Список арен, доступных при создании матчей</p>
            </div>
            <div className="bg-orange/10 text-orange px-3 py-1 rounded-full text-[12px] font-black">
              {leagueArenas.length}
            </div>
          </div>

          {leagueArenas.length > 0 ? (
            <Table columns={leagueColumns} data={leagueArenas} />
          ) : !isLoading && (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-graphite/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icon name="location" className="w-8 h-8 text-graphite/20" />
              </div>
              <span className="text-graphite-light font-medium">Арены еще не добавлены в лигу</span>
            </div>
          )}
        </div>

        {/* СОРТИРОВКА В ВЫПАДАЮЩИХ СПИСКАХ */}
        <div className="w-full bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 flex flex-col gap-4">
          <div className="flex flex-col">
            <span className="text-[16px] font-black text-graphite uppercase tracking-wide">Сортировка в выпадающих списках</span>
            <p className="text-[12px] font-medium text-graphite-light">
              Порядок арен при назначении арены матчу
            </p>
          </div>

          {/* Чекбоксы, но выбор одиночный: порядок может быть только один.
              Повторный клик по уже выбранному ничего не делает — иначе сортировка
              осталась бы вообще без значения. */}
          {/* Ряд с переносом: на узком экране пункты сами сложатся в столбец */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {ARENA_SORT_OPTIONS.map(option => (
              <Checkbox
                key={option.value}
                className="mb-0"
                label={option.label}
                checked={sortOrder === option.value}
                onChange={() => {
                  if (!canManage || isSavingSort || sortOrder === option.value) return;
                  saveSortOrder(option.value);
                }}
              />
            ))}
          </div>

          {/* Пояснение одно — к выбранному варианту: под каждым пунктом в строку оно не влезает */}
          <span className="text-[12px] text-graphite-light">
            {isSavingSort
              ? 'Сохраняем...'
              : ARENA_SORT_OPTIONS.find(o => o.value === sortOrder)?.hint}
          </span>
        </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА: ПОИСК И ДОБАВЛЕНИЕ */}
        {canManage && (
          <div className="w-full lg:w-[400px] shrink-0 bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 flex flex-col gap-5 sticky top-[100px]">
            <div className="border-b border-graphite/10 pb-4">
              <span className="text-[14px] font-black text-graphite uppercase tracking-wide">Добавить арену</span>
              <p className="text-[11px] text-graphite-light mt-1 uppercase font-bold">Поиск в глобальной базе</p>
            </div>

            <div className="flex flex-col gap-4">
              <Input 
                placeholder="Название, город или адрес..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />

              <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                {availableArenas.length > 0 ? (
                  availableArenas.map(arena => (
                    <div 
                      key={arena.id} 
                      className="group flex flex-col p-3 rounded-lg border border-graphite/10 bg-white/40 hover:border-orange/30 hover:bg-orange/5 transition-all relative"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-[13px] text-graphite leading-tight pr-8">{arena.name}</span>
                        <button 
                          onClick={() => toggleArena(arena.id, 'add')}
                          disabled={isProcessing}
                          className="absolute top-2.5 right-2 p-1.5 bg-orange text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-110 active:scale-95"
                          title="Добавить"
                        >
                          <Icon name="plus" className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-black uppercase text-orange tracking-widest">{arena.city}</span>
                        <span className="text-[11px] font-medium text-graphite/40 italic truncate">{arena.address}</span>
                      </div>
                    </div>
                  ))
                ) : searchTerm ? (
                  <div className="py-8 text-center text-[12px] text-graphite/40 font-medium">Ничего не найдено</div>
                ) : (
                  <div className="py-8 text-center text-[12px] text-graphite/40 font-medium italic">Начните вводить название...</div>
                )}
              </div>
            </div>
            
            <p className="text-[11px] text-graphite/50 leading-relaxed border-t border-graphite/10 pt-4">
              Если нужной арены нет в списке, обратитесь в техподдержку для внесения объекта в глобальный реестр.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}