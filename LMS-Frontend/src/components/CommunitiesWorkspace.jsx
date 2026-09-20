import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import { Table } from '../ui/Table2';
import { Input } from '../ui/Input';
import { Loader } from '../ui/Loader';
import { Pagination } from '../ui/Pagination';
import { SegmentButton } from '../ui/SegmentButton';
import { getImageUrl, getToken } from '../utils/helpers';
import { CommunityOwnerDrawer } from '../modals/CommunityOwnerDrawer';

/**
 * Вкладка «Сообщества» раздела управления командами (только глобальный админ).
 *
 * Сообщество — сущность Team-Room: любой пользователь создаёт его сам и проводит
 * события для вступивших — тренировки или солянки. Здесь всё только читается:
 * настройки, участников и штаб правит владелец у себя в Team-Room. Единственное
 * действие админа — смена владельца, когда создатель пропал или потерял аккаунт.
 */

// Подписи те же, что в Team-Room — чтобы админ и владелец говорили одними словами
const CATEGORY_MAP = { skating: 'Тренировки', open_game: 'Солянки' };
const POSITION_MAP = { skater: 'Полевой', goalie: 'Вратарь' };
const ROLE_MAP = { community_owner: 'Владелец', community_manager: 'Руководитель', community_admin: 'Администратор' };
const MESSENGER_MAP = { telegram: 'Telegram', max: 'MAX', vk: 'VK' };
const COST_MODE_MAP = { per_person: 'Фиксированный взнос с человека', split: 'Общая сумма делится между отметившимися' };
const CALENDAR_SCOPE_MAP = { own_groups: 'Только свою группу и открытые для всех', all: 'Все тренировки сообщества' };

// Фильтр по категории в списке: индекс в SegmentButton → значение для запроса
const CATEGORY_FILTERS = [
  { label: 'Все', value: '' },
  { label: 'Тренировки', value: 'skating' },
  { label: 'Солянки', value: 'open_game' },
];

const COMMUNITIES_PER_PAGE = 20;

const formatPhone = (phone) => {
  if (!phone) return '-';
  const cleaned = ('' + phone).replace(/\D/g, '');
  const match = cleaned.match(/^(7|8)?(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (match) return `+7 (${match[2]}) ${match[3]}-${match[4]}-${match[5]}`;
  return phone;
};

const formatDate = (d) => (d ? dayjs(d).format('DD.MM.YYYY') : '—');

// Склонение для счётчика над списком: 1 сообщество, 2 сообщества, 5 сообществ
const pluralCommunities = (n) => {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'сообществ';
  if (last > 1 && last < 5) return 'сообщества';
  if (last === 1) return 'сообщество';
  return 'сообществ';
};

// Минуты из базы → человеческий срок. Меньше часа читаемее в минутах («15 мин»,
// а не «0,25 ч»), от часа — в часах с запятой для дробных, как в Team-Room.
const formatSpan = (minutes) => {
  const m = Number(minutes) || 0;
  if (m > 0 && m < 60) return `${m} мин`;
  const h = m / 60;
  return `${Number.isInteger(h) ? h : String(Math.round(h * 100) / 100).replace('.', ',')} ч`;
};

// Лесенка резерва в строки «промежуток → сколько даётся на подтверждение».
// Логика зон та же, что в настройках Team-Room: читается сверху вниз, последняя
// ступень ловит всё оставшееся время, поэтому её нижняя граница — ноль.
const ladderRows = (ladder) => {
  const list = Array.isArray(ladder)
    ? [...ladder].sort((a, b) => Number(b.before_minutes) - Number(a.before_minutes))
    : [];
  return list.map((rung, idx) => {
    const isTail = idx === list.length - 1;
    const upper = idx > 0 ? Number(list[idx - 1].before_minutes) : null;
    const lower = isTail ? 0 : Number(rung.before_minutes);
    let zone;
    if (upper === null) zone = lower > 0 ? `Больше ${formatSpan(lower)} до события` : 'В любое время до события';
    else if (isTail) zone = `Меньше ${formatSpan(upper)} до события`;
    else zone = `От ${formatSpan(lower)} до ${formatSpan(upper)}`;
    return { zone, confirm: formatSpan(rung.confirm_minutes) };
  });
};

// Блок карточки настроек и поле внутри него — только чтение
function InfoBlock({ title, hint, children }) {
  return (
    <div className="bg-white/60 border border-graphite/10 rounded-md p-5 flex flex-col">
      <span className="text-[11px] font-black uppercase tracking-wide text-graphite-light block">{title}</span>
      {hint && <span className="text-[11px] text-graphite-light mt-1 leading-snug">{hint}</span>}
      <div className="flex flex-col gap-4 mt-4">{children}</div>
    </div>
  );
}

function Field({ label, children, muted = false }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wide text-graphite-light">{label}</span>
      <span className={`text-[13px] font-bold mt-0.5 break-words ${empty || muted ? 'text-graphite/40' : 'text-graphite'}`}>
        {empty ? 'Не задано' : children}
      </span>
    </div>
  );
}

function ColorDot({ value, title }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span className="w-5 h-5 rounded-full border border-graphite/20 shrink-0" style={{ background: value }} />
      <span className="font-mono text-[12px] text-graphite">{value.toUpperCase()}</span>
    </span>
  );
}

// Выбранное сообщество живёт на странице (selectedCommunity / onSelectCommunity),
// а не здесь: кнопка «Вернуться к выбору сообщества» рисуется в шапке рядом с
// заголовком, как у команд, клубов и лиг, и страница должна уметь сбросить выбор сама.
export function CommunitiesWorkspace({ showToast, onOpenProfile, selectedCommunity: selected, onSelectCommunity }) {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryIdx, setCategoryIdx] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  const [activeTab, setActiveTab] = useState('settings');

  const [community, setCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [groups, setGroups] = useState([]);
  const [infoBlocks, setInfoBlocks] = useState([]);
  // undefined = ещё не загружен, null = загружен и не назначен — различаем,
  // чтобы при переключении сообществ не мигало тревожное «Не назначен»
  const [owner, setOwner] = useState(undefined);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [showLeft, setShowLeft] = useState(false);

  const [isOwnerDrawerOpen, setIsOwnerDrawerOpen] = useState(false);

  // ── Список сообществ ─────────────────────────────────────────────────────
  useEffect(() => {
    const fetchList = async () => {
      setIsSearching(true);
      try {
        const category = CATEGORY_FILTERS[categoryIdx]?.value || '';
        const url = `${import.meta.env.VITE_API_URL}/api/communities-manage/search?q=${encodeURIComponent(searchQuery)}&category=${category}&page=${page}&limit=${COMMUNITIES_PER_PAGE}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        const data = await res.json();
        if (data.success) {
          setList(data.data);
          setTotal(data.total);
        }
      } catch (err) { console.error('Ошибка загрузки сообществ:', err); }
      setIsSearching(false);
    };

    const timer = setTimeout(fetchList, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, categoryIdx, page]);

  useEffect(() => { setPage(1); }, [searchQuery, categoryIdx]);

  // ── Детали выбранного сообщества ─────────────────────────────────────────
  const fetchDetails = useCallback(async (communityId) => {
    if (!communityId) return;
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/communities-manage/${communityId}/details`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setCommunity(data.community || null);
        setMembers(data.members || []);
        setStaff(data.staff || []);
        setGroups(data.groups || []);
        setInfoBlocks(data.info_blocks || []);
        setOwner(data.owner || null);
        // Название и логотип могли поменяться в Team-Room — освежаем карточку слева
        if (data.community) onSelectCommunity(prev => (prev ? { ...prev, ...data.community } : prev));
      } else {
        showToast?.('Ошибка', data.error || 'Не удалось загрузить сообщество');
      }
    } catch (err) { console.error('Ошибка загрузки сообщества:', err); }
    setIsLoadingDetails(false);
  }, [showToast, onSelectCommunity]);

  // Смена сообщества (в том числе сброс из шапки) — чистим всё, что относилось к
  // прежнему, и грузим новое; иначе до ответа сервера мигал бы чужой владелец и состав
  useEffect(() => {
    setOwner(undefined);
    setActiveTab('settings');
    setShowLeft(false);
    setCommunity(null); setMembers([]); setStaff([]); setGroups([]); setInfoBlocks([]);
    if (selected?.id) fetchDetails(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const activeMembers = useMemo(() => members.filter(m => !m.left_at), [members]);
  const leftMembers = useMemo(() => members.filter(m => !!m.left_at), [members]);

  const isSkating = (community?.category || selected?.category) === 'skating';

  // ── Колонки таблиц ───────────────────────────────────────────────────────
  // Таблицы рисуем с fixedLayout: ширины колонок обязательны, а ФИО — единственная
  // без ширины — забирает остаток и обрезается многоточием. Иначе на ноутбуке
  // таблица раздувалась под длинные фамилии и вылезал горизонтальный скролл.
  const indexColumn = { label: '№', width: 'w-[44px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> };

  const photoColumn = {
    label: 'Фото', width: 'w-[72px]', render: (r) => (
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10">
        <img src={getImageUrl(r.avatar_url || '/default/user_default.webp')} className="w-full h-full object-cover" onError={(e) => { e.target.src = getImageUrl('/default/user_default.webp') }} />
      </div>
    )
  };

  const nameColumn = {
    label: 'ФИО', sortKey: 'last_name', render: (r) => (
      <div onClick={() => onOpenProfile?.(r.user_id)} className="cursor-pointer group min-w-0">
        <span className="font-bold text-[14px] leading-tight group-hover:text-orange flex items-center gap-1.5 min-w-0">
          <span className="truncate" title={`${r.last_name} ${r.first_name} ${r.middle_name || ''}`.trim()}>{r.last_name} {r.first_name}</span>
          {r.is_virtual && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-graphite/10 text-graphite-light shrink-0" title="Аккаунт создан менеджером — человек ни разу не входил в систему">вирт.</span>}
        </span>
        {r.middle_name && <span className="text-[12px] text-graphite-light block truncate">{r.middle_name}</span>}
      </div>
    )
  };

  const phoneColumn = { label: 'Телефон', sortKey: 'phone', width: 'w-[160px]', render: (r) => <span className="text-[13px] whitespace-nowrap">{formatPhone(r.phone)}</span> };

  const memberColumns = [
    indexColumn,
    photoColumn,
    nameColumn,
    phoneColumn,
    { label: 'Амплуа', sortKey: 'position', width: 'w-[110px]', render: (r) => (
      r.position
        ? <span className={`text-[11px] font-bold px-2 py-1 rounded whitespace-nowrap ${r.position === 'goalie' ? 'bg-orange/10 text-orange' : 'bg-graphite/5 text-graphite-light'}`}>{POSITION_MAP[r.position]}</span>
        : <span className="text-[12px] text-graphite/40 italic whitespace-nowrap" title="Амплуа не указано — на событиях считается полевым">Не указано</span>
    )},
    // Группы бывают только у тренировочных сообществ — у солянок колонку не показываем
    ...(isSkating ? [{ label: 'Группа', sortKey: 'group_name', width: 'w-[140px]', render: (r) => (
      r.group_name
        ? <span className="text-[11px] font-bold px-2 py-1 rounded bg-graphite/5 text-graphite-light block truncate" title={r.group_name}>{r.group_name}</span>
        : <span className="text-[12px] text-graphite/40 italic whitespace-nowrap" title="Видит только события, открытые для тех, кто без группы">Без группы</span>
    )}] : []),
    { label: 'Вступил', sortKey: 'joined_at', width: 'w-[110px]', render: (r) => (
      <span className="text-[13px] text-graphite-light whitespace-nowrap">{formatDate(r.joined_at)}</span>
    )},
  ];

  const leftColumns = [
    indexColumn,
    photoColumn,
    nameColumn,
    phoneColumn,
    { label: 'Вступил', sortKey: 'joined_at', width: 'w-[110px]', render: (r) => <span className="text-[13px] text-graphite-light whitespace-nowrap">{formatDate(r.joined_at)}</span> },
    { label: 'Вышел', sortKey: 'left_at', width: 'w-[110px]', render: (r) => <span className="text-[13px] text-graphite-light whitespace-nowrap">{formatDate(r.left_at)}</span> },
  ];

  const staffColumns = [
    indexColumn,
    photoColumn,
    nameColumn,
    phoneColumn,
    { label: 'Роль', sortKey: 'role', width: 'w-[140px]', render: (r) => (
      <span className={`text-[11px] font-bold uppercase px-2 py-1 rounded border whitespace-nowrap ${r.role === 'community_owner' ? 'bg-orange/10 border-orange text-orange' : 'border-graphite/20 text-graphite-light'}`}>
        {ROLE_MAP[r.role] || r.role}
      </span>
    )},
    { label: 'Подпись', sortKey: 'title', width: 'w-[170px]', render: (r) => (
      r.title
        ? <span className="text-[13px] font-bold text-graphite block truncate" title={r.title}>{r.title}</span>
        : <span className="text-[12px] text-graphite/40 italic block truncate" title="Ручная подпись не задана — участники видят стандартную по роли">{ROLE_MAP[r.role] || '—'}</span>
    )},
    { label: 'Назначен', sortKey: 'since', width: 'w-[110px]', render: (r) => <span className="text-[13px] text-graphite-light whitespace-nowrap">{formatDate(r.since)}</span> },
  ];

  // ── Выбор сообщества ─────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="bg-white/40 border border-graphite/10 rounded-lg p-8 animate-zoom-in">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <Input placeholder="Поиск сообщества по названию или городу..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="w-[300px]">
            <SegmentButton
              options={CATEGORY_FILTERS.map(f => f.label)}
              defaultIndex={categoryIdx}
              onChange={(idx) => setCategoryIdx(idx)}
            />
          </div>
          <span className="shrink-0 bg-graphite/5 text-graphite/60 px-3 py-1.5 rounded-md text-[13px] font-black whitespace-nowrap">
            {total} {pluralCommunities(total)}
          </span>
        </div>

        {isSearching ? <Loader text="Поиск..." /> : (
          <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 mt-6">
            {list.map(c => {
              const ownerName = c.has_owner ? `${c.owner_last_name || ''} ${c.owner_first_name || ''}`.trim() : null;
              return (
                <div key={c.id} onClick={() => onSelectCommunity(c)} className="flex flex-col gap-3 p-5 bg-white rounded-md border cursor-pointer hover:border-orange shadow-sm group">
                  <div className="flex items-center gap-4">
                    <img src={getImageUrl(c.logo_url) || '/default/Logo_team_default.webp'} className="w-12 h-12 object-contain shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold group-hover:text-orange truncate">{c.name}</span>
                      <span className="text-[12px] text-graphite-light mt-1 truncate">
                        {CATEGORY_MAP[c.category] || c.category}{c.city ? ` · ${c.city}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="text-[12px] text-graphite-light truncate">
                    <span className="font-bold uppercase text-[10px] tracking-wide mr-1.5">Владелец</span>
                    {ownerName ? <span className="font-bold text-graphite">{ownerName}</span> : <span className="font-bold text-status-rejected">не назначен</span>}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-graphite/10">
                    <span className="text-[11px] font-bold px-2 py-1 rounded bg-graphite/5 text-graphite-light" title="Действующих участников">
                      Участники: {c.members_count ?? 0}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-1 rounded bg-graphite/5 text-graphite-light" title="Людей в штабе, не считая владельца">
                      Штаб: {c.staff_count ?? 0}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-1 rounded bg-graphite/5 text-graphite-light" title="Событий за всё время — тренировок и солянок">
                      События: {c.events_count ?? 0}
                    </span>
                    {c.next_event_at ? (
                      <span className="text-[11px] font-bold px-2 py-1 rounded bg-status-accepted/10 text-status-accepted" title="Ближайшее событие">
                        Ближайшее: {dayjs(c.next_event_at).format('D MMM')}
                      </span>
                    ) : c.last_event_at ? (
                      <span className="text-[11px] font-bold px-2 py-1 rounded bg-graphite/5 text-graphite-light" title="Последнее прошедшее событие, новых не запланировано">
                        Последнее: {dayjs(c.last_event_at).format('D MMM')}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-1 rounded bg-graphite/5 text-graphite-light">Событий не было</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isSearching && list.length === 0 && (
          <div className="text-center py-16 text-graphite-light font-medium">
            Сообщества не найдены. Сообщество создаёт сам пользователь в Team-Room — здесь им можно только управлять.
          </div>
        )}

        <Pagination page={page} total={total} limit={COMMUNITIES_PER_PAGE} onChange={setPage} className="mt-8" />
      </div>
    );
  }

  // ── Рабочая область сообщества ───────────────────────────────────────────
  const tabTitle = activeTab === 'settings' ? 'Настройки сообщества' : activeTab === 'members' ? 'Участники сообщества' : 'Штаб сообщества';
  const rows = ladderRows(community?.reserve_ladder);

  // Взнос-заготовка: 0 — бесплатно, NULL — не задан, иначе сумма по режиму
  const feeLabel = (() => {
    if (!community) return null;
    const isSplit = community.default_cost_mode === 'split';
    const amount = isSplit ? community.default_total_cost : community.default_cost;
    if (amount === null || amount === undefined) return null;
    if (Number(amount) === 0) return 'Бесплатно';
    return isSplit ? `${amount} ₽ за событие, делится между отметившимися` : `${amount} ₽ с человека`;
  })();

  const publishLabel = (() => {
    if (!community) return null;
    switch (community.default_publish_mode) {
      case 'before_event': return `За ${community.default_publish_hours_before ?? '?'} ч до начала`;
      case 'manual': return 'Вручную — пока штаб не нажмёт «Опубликовать»';
      default: return 'Сразу после создания';
    }
  })();

  const limitLabel = (value, { zeroText } = {}) => {
    if (value === null || value === undefined) return <span className="text-graphite/40">Без ограничения</span>;
    if (Number(value) === 0 && zeroText) return zeroText;
    return `${value}`;
  };

  return (
    <div className="flex items-start gap-8">
      <div className="w-[260px] shrink-0 sticky top-[128px] bg-white/70 backdrop-blur-md rounded-lg p-4 flex flex-col gap-2 shadow-sm border border-white/50 animate-zoom-in">
        <div className="flex flex-col items-center mb-4 text-center">
          <img src={getImageUrl(selected.logo_url) || '/default/Logo_team_default.webp'} className="w-16 h-16 object-contain mb-3" />
          <span className="font-black text-[16px] leading-tight">{selected.name}</span>
          <span className="text-[12px] font-bold text-graphite-light mt-1">
            {CATEGORY_MAP[selected.category] || selected.category}{selected.city ? ` · ${selected.city}` : ''}
          </span>
        </div>

        {/* Владелец — свойство самого сообщества, поэтому виден с любой вкладки.
            Это единственное, что здесь можно изменить */}
        <button
          onClick={() => setIsOwnerDrawerOpen(true)}
          className="text-left px-4 py-3 mb-2 rounded-md border border-graphite/10 bg-white/60 hover:border-orange hover:bg-white transition-all group"
        >
          <span className="text-[10px] font-black uppercase tracking-wide text-graphite-light block">Владелец сообщества</span>
          {owner === undefined ? (
            <span className="text-[13px] font-bold text-graphite-light block mt-1">Загрузка…</span>
          ) : owner ? (
            <span className="text-[13px] font-bold text-graphite block truncate mt-1 group-hover:text-orange">
              {owner.last_name} {owner.first_name}
            </span>
          ) : (
            <span className="text-[13px] font-bold text-status-rejected block mt-1">Не назначен</span>
          )}
          <span className="text-[11px] font-bold text-orange block mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {owner ? 'Изменить' : 'Назначить'}
          </span>
        </button>

        {[
          // У настроек счётчика нет — это свойства самого сообщества, а не список
          { id: 'settings', label: 'Настройки' },
          { id: 'members', label: 'Участники', count: activeMembers.length },
          { id: 'staff', label: 'Штаб', count: staff.length },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`text-left px-4 py-3 rounded-md font-bold transition-all flex items-center justify-between gap-2 ${activeTab === tab.id ? 'bg-white text-orange shadow-sm' : 'text-graphite-light hover:bg-white/40'}`}>
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`text-[12px] font-black px-2 py-0.5 rounded-full shrink-0 ${activeTab === tab.id ? 'bg-orange/10 text-orange' : 'bg-graphite/10 text-graphite-light'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 relative z-10 min-h-[500px]">
        <div className="bg-white/85 rounded-lg shadow-sm border border-graphite/10 p-8 animate-zoom-in">
          <div className="flex justify-between items-center mb-6 gap-4">
            <h3 className="text-2xl font-black text-graphite uppercase tracking-wide">{tabTitle}</h3>
            <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded bg-graphite/5 text-graphite-light shrink-0" title="Настройки, участников и штаб правит владелец у себя в Team-Room">
              Только просмотр
            </span>
          </div>

          {isLoadingDetails || !community ? <Loader text="Загрузка..." /> : (
            <>
              {/* ── Настройки ─────────────────────────────────────────────── */}
              {activeTab === 'settings' && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <InfoBlock title="Профиль">
                    <Field label="Название">{community.name}</Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Категория">{CATEGORY_MAP[community.category] || community.category}</Field>
                      <Field label="Город">{community.city}</Field>
                    </div>
                    <Field label="Описание">
                      {community.description ? <span className="whitespace-pre-line font-medium">{community.description}</span> : null}
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Цвета">
                        {community.color_1 || community.color_2 ? (
                          <span className="flex items-center gap-4 flex-wrap">
                            {community.color_1 && <ColorDot value={community.color_1} title="Основной" />}
                            {community.color_2 && <ColorDot value={community.color_2} title="Дополнительный" />}
                          </span>
                        ) : null}
                      </Field>
                      <Field label="Чат сообщества">
                        {community.chat_url ? (
                          <a href={community.chat_url} target="_blank" rel="noreferrer" className="text-orange hover:underline break-all">
                            {MESSENGER_MAP[community.chat_messenger] || community.chat_messenger}: {community.chat_url}
                          </a>
                        ) : null}
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Подпись владельца в штабе">{community.owner_title || <span className="text-graphite/40">Владелец (стандартная)</span>}</Field>
                      <Field label="Создано">{formatDate(community.created_at)}</Field>
                    </div>
                  </InfoBlock>

                  <InfoBlock
                    title="Календарь и резерв"
                    hint="Чем ближе событие, тем меньше времени даётся на подтверждение места из резерва."
                  >
                    {isSkating && (
                      <Field label="Что участники видят в календаре">{CALENDAR_SCOPE_MAP[community.calendar_scope] || community.calendar_scope}</Field>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-graphite-light mb-1.5">Подтверждение места из резерва</span>
                      {rows.length === 0 ? (
                        <span className="text-[13px] font-bold text-graphite/40">Лесенка не задана</span>
                      ) : (
                        <div className="flex flex-col divide-y divide-graphite/10 border border-graphite/10 rounded-md overflow-hidden">
                          {rows.map((r, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 bg-white/60">
                              <span className="text-[13px] font-bold text-graphite">{r.zone}</span>
                              <span className="text-[12px] font-bold text-graphite-light shrink-0">даётся {r.confirm}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </InfoBlock>

                  <InfoBlock
                    title="Заготовка события: взнос"
                    hint="Чем заполняется форма нового события. В самой форме владелец может поменять."
                  >
                    <Field label="Режим">{COST_MODE_MAP[community.default_cost_mode] || community.default_cost_mode}</Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Взнос">{feeLabel}</Field>
                      <Field label="Вратари">{community.default_goalies_free ? 'Бесплатно' : 'Платят как все'}</Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Показывать цену от">{community.default_cost_min_participants ?? 1} чел.</Field>
                      <Field label="Дедлайн снятия отметки">
                        {community.default_attendance_deadline_hours != null ? `${community.default_attendance_deadline_hours} ч до начала` : null}
                      </Field>
                    </div>
                  </InfoBlock>

                  <InfoBlock
                    title="Заготовка события: состав и публикация"
                    hint="Лишние отметившиеся сверх лимита уходят в резерв."
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Лимит полевых">{limitLabel(community.default_max_skaters)}</Field>
                      <Field label="Лимит вратарей">{limitLabel(community.default_max_goalies, { zeroText: 'Вратари не набираются' })}</Field>
                    </div>
                    <Field label="Публикация новых событий">{publishLabel}</Field>
                  </InfoBlock>

                  {isSkating && (
                    <InfoBlock
                      title={`Тренировочные группы · ${groups.length}`}
                      hint="Участник без группы видит только тренировки, открытые для всех."
                    >
                      {groups.length === 0 ? (
                        <span className="text-[13px] font-bold text-graphite/40">Групп нет</span>
                      ) : (
                        <div className="flex flex-col divide-y divide-graphite/10 border border-graphite/10 rounded-md overflow-hidden">
                          {groups.map(g => (
                            <div key={g.id} className="flex items-start justify-between gap-3 px-3 py-2 bg-white/60">
                              <div className="min-w-0">
                                <span className="text-[13px] font-bold text-graphite block">{g.name}</span>
                                {g.description && <span className="text-[12px] text-graphite-light block whitespace-pre-line">{g.description}</span>}
                              </div>
                              <span className="text-[11px] font-bold px-2 py-1 rounded bg-graphite/5 text-graphite-light shrink-0" title="Действующих участников в группе">
                                {g.members_count} чел.
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </InfoBlock>
                  )}

                  <InfoBlock
                    title={`Информационные блоки · ${infoBlocks.length}`}
                    hint="Вкладка «Инфо» сообщества в Team-Room: правила, полезное и что ещё написал владелец."
                  >
                    {infoBlocks.length === 0 ? (
                      <span className="text-[13px] font-bold text-graphite/40">Блоков нет</span>
                    ) : (
                      infoBlocks.map(b => (
                        <div key={b.id} className="flex flex-col min-w-0">
                          <span className="text-[13px] font-bold text-graphite">{b.title}</span>
                          <span className="text-[12px] text-graphite-light whitespace-pre-line mt-0.5">{b.content}</span>
                        </div>
                      ))
                    )}
                  </InfoBlock>
                </div>
              )}

              {/* ── Участники ─────────────────────────────────────────────── */}
              {activeTab === 'members' && (
                <>
                  {activeMembers.length === 0 ? (
                    <div className="text-center py-12 text-graphite-light font-medium">Действующих участников нет</div>
                  ) : (
                    <Table columns={memberColumns} data={activeMembers} fixedLayout />
                  )}

                  {/* Ушедшие: строка в базе остаётся с left_at — по ней считается
                      посещаемость, поэтому люди не исчезают, а уходят в отдельный список */}
                  {leftMembers.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-graphite/10">
                      <button
                        onClick={() => setShowLeft(v => !v)}
                        className="flex items-center gap-2 text-[13px] font-bold text-graphite-light hover:text-orange transition-colors"
                      >
                        <span className={`transition-transform ${showLeft ? 'rotate-90' : ''}`}>›</span>
                        Ушедшие из сообщества
                        <span className="text-[12px] font-black px-2 py-0.5 rounded-full bg-graphite/10 text-graphite-light">{leftMembers.length}</span>
                      </button>
                      {showLeft && (
                        <div className="mt-4 animate-zoom-in">
                          <Table columns={leftColumns} data={leftMembers} fixedLayout />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── Штаб ──────────────────────────────────────────────────── */}
              {activeTab === 'staff' && (
                <>
                  <div className="mb-5 -mt-2 text-[12px] font-bold text-graphite-light">
                    Владелец идёт первой строкой и получает все права сразу. Должности штаба и подписи к ним назначает владелец в Team-Room; участником сообщества человек из штаба быть не обязан.
                  </div>
                  {staff.length === 0 ? (
                    <div className="text-center py-12 text-graphite-light font-medium">Штаб пуст: у сообщества нет ни владельца, ни должностей</div>
                  ) : (
                    <Table columns={staffColumns} data={staff} fixedLayout />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <CommunityOwnerDrawer
        isOpen={isOwnerDrawerOpen}
        onClose={() => setIsOwnerDrawerOpen(false)}
        communityId={selected.id}
        communityName={selected.name}
        owner={owner}
        staff={staff}
        onSaved={(nextOwner, result) => {
          setOwner(nextOwner);
          const closed = Number(result?.closedRoles) || 0;
          showToast?.(
            'Успешно',
            nextOwner
              ? (closed > 0 ? 'Владелец назначен, его должность в штабе закрыта' : 'Владелец сообщества назначен')
              : 'Владелец сообщества снят',
            'success'
          );
          // Штаб поменялся: владелец — его первая строка
          fetchDetails(selected.id);
        }}
      />
    </div>
  );
}
