import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken, getImageUrl } from '../utils/helpers';
import { Header } from '../components/Header';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Table } from '../ui/Table';
import { Loader } from '../ui/Loader';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';

dayjs.locale('ru');

const GAME_TYPE_OPTIONS = [
  { value: '', label: 'Все типы' },
  { value: 'friendly_pwa', label: 'Товарищеский (в системе)' },
  { value: 'friendly_ext', label: 'Товарищеский (внешний соперник)' },
  { value: 'tournament_ext', label: 'Внешний турнир' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'draft', label: 'Черновик' },
  { value: 'scheduled', label: 'Запланирован' },
  { value: 'live', label: 'Идёт' },
  { value: 'finished', label: 'Завершён' },
  { value: 'finished_no_result', label: 'Без результата' },
  { value: 'cancelled', label: 'Отменён' },
];

const GAME_TYPE_LABELS = GAME_TYPE_OPTIONS.reduce((acc, o) => (o.value ? { ...acc, [o.value]: o.label } : acc), {});

const STATUS_BADGE = {
  draft:              { label: 'Черновик',       cls: 'bg-graphite/10 text-graphite-light' },
  scheduled:          { label: 'Запланирован',   cls: 'bg-orange/10 text-orange' },
  live:               { label: 'Идёт',            cls: 'bg-status-accepted/10 text-status-accepted' },
  finished:           { label: 'Завершён',       cls: 'bg-graphite/10 text-graphite' },
  finished_no_result: { label: 'Без результата', cls: 'bg-status-rejected/10 text-status-rejected' },
  cancelled:          { label: 'Отменён',        cls: 'bg-status-rejected/10 text-status-rejected' },
};

// Раздел только для глобального администратора (см. PERMISSIONS.LEAGUELESS_MATCHES_ACCESS = []
// в App.jsx/Sidebar.jsx) — показывает все матчи, которые команды создают сами в
// Team-Room без участия лиги (division_id IS NULL): товарищеские и внешние турниры.
// Таких матчей могут быть тысячи, поэтому — постраничная выдача (20/страница) + фильтры.
export function LeaguelessMatchesPage() {
  const navigate = useNavigate();

  const [games, setGames] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [gameType, setGameType] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounce поиска по названию команды — не дёргаем бэкенд на каждое нажатие клавиши.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Смена любого фильтра — всегда возвращаемся на первую страницу.
  useEffect(() => { setPage(1); }, [gameType, status, search]);

  const fetchGames = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (gameType) params.set('gameType', gameType);
      if (status) params.set('status', status);
      if (search) params.set('search', search);

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagueless-games?${params}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setGames(data.data);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Ошибка загрузки матчей вне лиг:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, gameType, status, search]);

  useEffect(() => { fetchGames(); }, [fetchGames]);

  const columns = [
    {
      label: 'Дата', key: 'game_date', width: 'w-[110px]',
      render: (row) => row.game_date ? (
        <div className="flex flex-col leading-tight">
          <span>{dayjs(row.game_date).format('DD.MM.YYYY')}</span>
          <span className="text-graphite-light">{dayjs(row.game_date).format('HH:mm')}</span>
        </div>
      ) : '—',
    },
    {
      label: 'Тип', key: 'game_type', width: 'w-[200px]',
      render: (row) => GAME_TYPE_LABELS[row.game_type] || row.game_type || '—',
    },
    {
      label: 'Хозяева',
      render: (row) => (
        <div className="flex items-center gap-2 min-w-0">
          {row.home_team_logo && <img src={getImageUrl(row.home_team_logo)} alt="" className="w-6 h-6 object-contain shrink-0" />}
          <span className="truncate">{row.home_team_name || 'Не указано'}</span>
        </div>
      ),
    },
    {
      label: 'Гости',
      render: (row) => (
        <div className="flex items-center gap-2 min-w-0">
          {row.away_team_logo && <img src={getImageUrl(row.away_team_logo)} alt="" className="w-6 h-6 object-contain shrink-0" />}
          <span className="truncate">{row.away_team_name || 'Не указано'}</span>
        </div>
      ),
    },
    {
      label: 'Арена', width: 'w-[160px]',
      render: (row) => <span className="truncate block">{row.arena_name || '—'}</span>,
    },
    {
      label: 'Город', width: 'w-[120px]',
      // Город известен только для арены из справочника — для арены, указанной
      // вручную свободным текстом (games.location), отдельного города нет.
      render: (row) => row.arena_city || '—',
    },
    {
      label: 'Счёт', width: 'w-[90px]', align: 'center',
      render: (row) => (row.status === 'finished' || row.status === 'finished_no_result')
        ? `${row.home_score ?? 0} : ${row.away_score ?? 0}`
        : '—',
    },
    {
      label: 'Статус', width: 'w-[150px]', align: 'center',
      render: (row) => {
        const s = STATUS_BADGE[row.status] || { label: row.status || '—', cls: 'bg-graphite/10 text-graphite-light' };
        return <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${s.cls}`}>{s.label}</span>;
      },
    },
  ];

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header
        title="Внешние матчи"
        subtitle={<span className="text-[13px] text-graphite-light font-medium">Всего найдено: {total}</span>}
        actions={
          <div className="flex items-center gap-4">
            <div className="w-64">
              <Input
                placeholder="Поиск по названию команды"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="w-64">
              <Select
                options={GAME_TYPE_OPTIONS}
                value={gameType}
                onChange={(val) => setGameType(val)}
              />
            </div>
            <div className="w-48">
              <Select
                options={STATUS_OPTIONS}
                value={status}
                onChange={(val) => setStatus(val)}
              />
            </div>
          </div>
        }
      />

      <main className="flex-1 px-10 pt-8 relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-start pt-20 justify-center">
            <Loader />
          </div>
        ) : (
          <div className="w-full mx-auto flex flex-col gap-4">
            <Table
              columns={columns}
              data={games}
              onRowClick={(row) => navigate(`/games/${row.id}`)}
            />

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 py-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 rounded-md text-[13px] font-bold uppercase tracking-wide border border-graphite/20 text-graphite bg-white/30 hover:bg-white/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Назад
                </button>
                <span className="text-[13px] font-semibold text-graphite-light">
                  Страница {page} из {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 rounded-md text-[13px] font-bold uppercase tracking-wide border border-graphite/20 text-graphite bg-white/30 hover:bg-white/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Вперёд →
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
