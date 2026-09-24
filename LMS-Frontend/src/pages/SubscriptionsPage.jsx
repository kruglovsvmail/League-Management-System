import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from '../components/Header';
import { SegmentButton } from '../ui/SegmentButton';
import { Table } from '../ui/Table';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { Tooltip } from '../ui/Tooltip';
import { Toast } from '../modals/Toast';
import { SubscriptionChangeDrawer } from '../modals/SubscriptionChangeDrawer';
import { SubscriptionHistoryDrawer } from '../modals/SubscriptionHistoryDrawer';
import { SubscriptionJournalDrawer } from '../modals/SubscriptionJournalDrawer';
import { getImageUrl, getAuthHeaders } from '../utils/helpers';
import { STATUS_FILTERS, describeExpiry, EXPIRY_TONE, formatDate, peopleLabel } from '../utils/subscriptionStatus';

const API = import.meta.env.VITE_API_URL;
const PAGE_SIZE = 30;

const TYPE_OPTIONS = ['Все', 'Реальные', 'Виртуальные'];

const SORT_OPTIONS = [
  { value: 'name', label: 'По ФИО' },
  { value: 'expires_asc', label: 'Сначала кончаются раньше' },
  { value: 'expires_desc', label: 'Сначала кончаются позже' },
];

// Цвет числа на плитке: истекающие и истёкшие видно издалека
const TILE_TONE = { expiring: 'text-status-pending', expired: 'text-status-rejected' };

const formatPhone = (raw) => {
  if (!raw) return null;
  const m = String(raw).replace(/\D/g, '').match(/^(7|8)?(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 (${m[2]}) ${m[3]}-${m[4]}-${m[5]}` : raw;
};

const formatMoney = (value) => `${Math.round(Number(value)).toLocaleString('ru-RU')} ₽`;

// Галочка в строке: клик по ней не открывает историю человека
function CheckCell({ checked, disabled, onToggle }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(); }}
      className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
        checked ? 'bg-orange border-orange text-white' : 'border-graphite/25 text-transparent hover:border-orange'
      } ${disabled ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </button>
  );
}

/**
 * Раздел «Подписки» — даты подписок Team Room у всех пользователей (только глобальный админ).
 *
 * Список фильтруется и подгружается страницами, как Реестр. Поменять подписку можно
 * отмеченным галочками, всем по фильтру или составу команд — в шторке изменения
 * (SubscriptionChangeDrawer). Каждое изменение пишется в журнал и оттуда отменяется
 * (SubscriptionJournalDrawer). Клик по человеку — его история (SubscriptionHistoryDrawer).
 */
export function SubscriptionsPage() {
  const [status, setStatus] = useState('all');
  const [type, setType] = useState(0);
  const [teamId, setTeamId] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [reloadKey, setReloadKey] = useState(0);

  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const requestSeqRef = useRef(0); // защита от «протухших» ответов при смене фильтра
  const observer = useRef();

  const [teams, setTeams] = useState([]);

  // Отмеченные галочками (id → строка: имена нужны шторке) переживают смену фильтра —
  // людей можно набрать из разных поисков. «Все по фильтру» при смене фильтра
  // сбрасывается: иначе изменение ушло бы уже другому набору людей.
  const [selected, setSelected] = useState(() => new Map());
  const [allByFilter, setAllByFilter] = useState(false);

  const [changeMode, setChangeMode] = useState(null); // 'selected' | 'filter' | 'teams' | null
  const [historyUserId, setHistoryUserId] = useState(null);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [toastInfo, setToastInfo] = useState(null);
  const showToast = (title, message, toastType = 'error') => setToastInfo({ title, message, type: toastType });

  const q = search.trim();
  const filter = { status, type, teamId, q };
  // Сколько человек под фильтром — столько и попадёт в «все по фильтру»
  const filterCount = counts ? (status === 'all' ? counts.total : counts[status]) : null;

  const fetchPage = async (pageNum, isInitial) => {
    const seq = requestSeqRef.current;
    if (isInitial) setIsLoading(true);
    else setIsFetchingMore(true);

    try {
      const url = new URL(`${API}/api/subscriptions/users`);
      url.searchParams.set('page', pageNum);
      url.searchParams.set('limit', PAGE_SIZE);
      url.searchParams.set('status', status);
      url.searchParams.set('type', type);
      url.searchParams.set('sort', sort);
      if (teamId) url.searchParams.set('teamId', teamId);
      if (q) url.searchParams.set('q', q);

      const res = await fetch(url.toString(), { headers: getAuthHeaders() });
      const json = await res.json();
      if (seq !== requestSeqRef.current) return;

      if (json.success) {
        setRows(prev => (isInitial ? json.data : [...prev, ...json.data]));
        setHasMore(json.hasMore);
        if (json.counts) setCounts(json.counts);
      } else {
        showToast('Ошибка', json.error || 'Не удалось загрузить подписки');
      }
    } catch (err) {
      console.error('Ошибка загрузки подписок:', err);
      if (seq === requestSeqRef.current) showToast('Ошибка', 'Сбой связи с сервером');
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoading(false);
        setIsFetchingMore(false);
      }
    }
  };

  useEffect(() => {
    requestSeqRef.current += 1;
    setPage(1);
    setRows([]);
    setHasMore(true);
    setIsLoading(true);
    setIsFetchingMore(false);
    const timeout = setTimeout(() => fetchPage(1, true), 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type, teamId, q, sort, reloadKey]);

  useEffect(() => { setAllByFilter(false); }, [status, type, teamId, q]);

  useEffect(() => {
    if (page > 1) fetchPage(page, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    fetch(`${API}/api/subscriptions/teams`, { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(json => { if (json.success) setTeams(json.data); })
      .catch(() => {});
  }, []);

  const lastElementRef = useCallback(node => {
    // Пока идёт загрузка или больше нечего грузить — сентинел не наблюдаем
    if (observer.current) observer.current.disconnect();
    if (isLoading || isFetchingMore || !hasMore) return;
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setPage(prev => prev + 1);
    });
    if (node) observer.current.observe(node);
  }, [isLoading, isFetchingMore, hasMore]);

  const toggleRow = (row) => setSelected(prev => {
    const next = new Map(prev);
    if (next.has(row.id)) next.delete(row.id); else next.set(row.id, row);
    return next;
  });

  const clearSelection = () => { setSelected(new Map()); setAllByFilter(false); };

  const handleApplied = () => {
    clearSelection();
    setChangeMode(null);
    setReloadKey(k => k + 1);
  };

  const teamOptions = [
    { value: '', label: 'Все команды' },
    ...teams.map(t => ({ value: String(t.id), label: t.city ? `${t.name} · ${t.city}` : t.name })),
  ];

  const columns = [
    { label: '', width: 'w-12', render: (r) => (
      <CheckCell checked={allByFilter || selected.has(r.id)} disabled={allByFilter} onToggle={() => toggleRow(r)} />
    ) },
    { label: 'ФИО', render: (r) => (
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 bg-black/10 rounded-md overflow-hidden shrink-0">
          <img src={getImageUrl(r.avatar_url || '/default/user_default.webp')} className="w-full h-full object-cover" alt="" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold leading-tight truncate">
            {r.last_name} {r.first_name}
            {r.is_virtual && <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-orange align-middle">вирт</span>}
          </span>
          {r.middle_name && <span className="text-[12px] font-medium text-graphite-light leading-tight mt-0.5 truncate">{r.middle_name}</span>}
        </div>
      </div>
    ) },
    { label: 'Телефон', width: 'w-40', render: (r) => (
      r.phone ? <span className="text-[13px] whitespace-nowrap">{formatPhone(r.phone)}</span> : <span className="text-graphite/40">—</span>
    ) },
    { label: 'Команды', width: 'w-40', render: (r) => {
      const list = r.current_teams || [];
      if (list.length === 0) return <span className="text-graphite/40">—</span>;
      return (
        <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {list.map(t => (
            <Tooltip key={t.id} title={t.name} subtitle={t.city || ''} noUnderline>
              <div className="w-8 h-8 flex items-center justify-center p-0.5 rounded cursor-help">
                <img src={getImageUrl(t.logo_url || '/default/Logo_team_default.webp')} className="w-full h-full object-contain" alt="" />
              </div>
            </Tooltip>
          ))}
        </div>
      );
    } },
    { label: 'Подписка', width: 'w-44', render: (r) => {
      const exp = describeExpiry(r.subscription_expires_at);
      return (
        <div className="flex flex-col leading-tight">
          <span className={`text-[13px] font-bold whitespace-nowrap ${EXPIRY_TONE[exp.status]}`}>{exp.text}</span>
          {exp.hint && <span className="text-[11px] font-semibold text-status-pending mt-0.5">{exp.hint}</span>}
        </div>
      );
    } },
    { label: 'Последняя оплата', width: 'w-40', render: (r) => (
      r.last_paid_at ? (
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] whitespace-nowrap">{formatDate(r.last_paid_at)}</span>
          <span className="text-[11px] font-semibold text-graphite-light mt-0.5">{formatMoney(r.last_paid_amount)}</span>
        </div>
      ) : <span className="text-graphite/40">—</span>
    ) },
    { label: 'Заходил в TR', width: 'w-32', render: (r) => (
      r.last_seen_at ? <span className="text-[13px] whitespace-nowrap">{formatDate(r.last_seen_at)}</span> : <span className="text-graphite/40">—</span>
    ) },
  ];

  return (
    <div className="flex flex-col min-h-screen pb-12">
      <Header
        title="Подписки"
        subtitle={<span className="text-[13px] text-graphite-light">Подписки Team Room · видна только глобальному администратору</span>}
        actions={
          <div className="flex items-center gap-4">
            <Button onClick={() => setIsJournalOpen(true)} className="bg-graphite/10 text-graphite hover:bg-graphite/15">
              Журнал изменений
            </Button>
            <div className="w-[260px] shrink-0">
              <Input placeholder="ФИО или телефон..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        }
      />

      <div className="px-6 pt-8 flex flex-col gap-5">

        {/* Счётчики — они же быстрый фильтр по статусу */}
        <div className="grid grid-cols-5 gap-3">
          {STATUS_FILTERS.map(s => {
            const count = counts ? (s.value === 'all' ? counts.total : counts[s.value]) : null;
            const isActive = status === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatus(s.value)}
                className={`text-left bg-white/70 backdrop-blur-[12px] border rounded-lg shadow-sm px-5 py-4 transition-colors ${
                  isActive ? 'border-orange' : 'border-white/40 hover:border-orange/40'
                }`}
              >
                <span className={`block text-[26px] font-black leading-none tabular-nums ${TILE_TONE[s.value] || 'text-graphite'}`}>
                  {count ?? '—'}
                </span>
                <span className={`block mt-2 text-[11px] font-bold uppercase tracking-widest ${isActive ? 'text-orange' : 'text-graphite/50'}`}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Фильтры и выбор */}
        <div className="bg-white/70 backdrop-blur-[12px] border border-white/40 rounded-lg shadow-sm p-4 flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-[300px]">
              <Select isSearchable options={teamOptions} value={teamId ? String(teamId) : ''} onChange={(v) => setTeamId(v ? Number(v) : null)} placeholder="Все команды" />
            </div>
            <div className="w-[300px]">
              <SegmentButton options={TYPE_OPTIONS} defaultIndex={type} onChange={setType} />
            </div>
            <div className="w-[260px]">
              <Select options={SORT_OPTIONS} value={sort} onChange={setSort} />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap pt-4 border-t border-graphite/10">
            <span className="text-[13px] font-bold text-graphite">
              {allByFilter
                ? `Выбраны все по фильтру: ${filterCount !== null ? peopleLabel(filterCount) : '…'}`
                : selected.size > 0
                  ? `Отмечено: ${peopleLabel(selected.size)}`
                  : 'Отметьте людей в списке'}
            </span>
            {!allByFilter && (
              <button
                type="button"
                onClick={() => setAllByFilter(true)}
                disabled={!filterCount}
                className="text-[12px] font-bold text-orange hover:text-orange/70 transition-colors disabled:text-graphite/30"
              >
                Выбрать всех по фильтру{filterCount !== null ? ` (${filterCount})` : ''}
              </button>
            )}
            {(allByFilter || selected.size > 0) && (
              <button type="button" onClick={clearSelection} className="text-[12px] font-bold text-graphite-light hover:text-status-rejected transition-colors">
                Снять выбор
              </button>
            )}

            <div className="flex-1" />

            <Button onClick={() => setChangeMode('teams')} className="bg-graphite/10 text-graphite hover:bg-graphite/15">
              По командам…
            </Button>
            <Button
              onClick={() => setChangeMode(allByFilter ? 'filter' : 'selected')}
              disabled={!allByFilter && selected.size === 0}
            >
              Изменить подписку
            </Button>
          </div>
        </div>

        {isLoading && rows.length === 0 ? (
          <div className="py-16 flex justify-center"><Loader text="Загрузка подписок..." /></div>
        ) : (
          <Table columns={columns} data={rows} onRowClick={(r) => setHistoryUserId(r.id)} />
        )}
        <div ref={lastElementRef} className="h-10 w-full flex items-center justify-center">
          {isFetchingMore && <span className="text-graphite-light text-sm font-bold animate-pulse">Загрузка данных...</span>}
        </div>
      </div>

      <SubscriptionChangeDrawer
        isOpen={changeMode !== null}
        initialMode={changeMode || 'selected'}
        onClose={() => setChangeMode(null)}
        selectedPeople={[...selected.values()]}
        filter={filter}
        filterCount={filterCount}
        teams={teams}
        onApplied={handleApplied}
        showToast={showToast}
      />

      <SubscriptionHistoryDrawer
        userId={historyUserId}
        onClose={() => setHistoryUserId(null)}
      />

      <SubscriptionJournalDrawer
        isOpen={isJournalOpen}
        onClose={() => setIsJournalOpen(false)}
        onChanged={() => setReloadKey(k => k + 1)}
        showToast={showToast}
      />

      {toastInfo && <Toast title={toastInfo.title} message={toastInfo.message} type={toastInfo.type} onClose={() => setToastInfo(null)} />}
    </div>
  );
}
