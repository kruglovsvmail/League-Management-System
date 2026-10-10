import React, { useState, useEffect, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import { Button } from '../ui/Button';
import { Table } from '../ui/Table2';
import { Input } from '../ui/Input';
import { Loader } from '../ui/Loader';
import { Pagination } from '../ui/Pagination';
import { getImageUrl, getToken } from '../utils/helpers';
import { ClubOwnerDrawer } from '../modals/ClubOwnerDrawer';
import { AddClubMemberDrawer } from '../modals/AddClubMemberDrawer';
import { AttachTeamDrawer } from '../modals/AttachTeamDrawer';
import { ConfirmModal } from '../modals/ConfirmModal';
import { ClubProfileDrawer } from '../modals/ClubProfileDrawer';

// Клубные роли — те же три, что и в Team-Room. Игрового ростера у клуба нет:
// номера и амплуа живут в командах, поэтому вкладки здесь другие, чем у команды.
const CLUB_ROLES = [
  { id: 'top_manager', label: 'Руководитель' },
  { id: 'club_admin', label: 'Администратор' },
  { id: 'coach', label: 'Тренер' }
];

const CLUB_ROLE_MAP = {
  top_manager: 'Руководитель клуба',
  club_admin: 'Администратор клуба',
  coach: 'Тренер клуба'
};

const CLUBS_PER_PAGE = 20;

const formatPhone = (phone) => {
  if (!phone) return '-';
  const cleaned = ('' + phone).replace(/\D/g, '');
  const match = cleaned.match(/^(7|8)?(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (match) return `+7 (${match[2]}) ${match[3]}-${match[4]}-${match[5]}`;
  return phone;
};

/**
 * Вкладка «Клубы» раздела управления командами (только глобальный админ).
 * Клуб — организация над командами: общая база людей, штаб, владелец и набор команд.
 *
 * Выбранный клуб живёт на странице (selectedClub / onSelectClub), а не здесь:
 * кнопка «Вернуться к выбору клуба» рисуется в шапке рядом с заголовком, как у
 * команд и лиг, и страница должна уметь сбросить выбор сама.
 */
export function ClubsWorkspace({ showToast, onOpenProfile, selectedClub, onSelectClub }) {
  const [clubsList, setClubsList] = useState([]);
  const [clubsTotal, setClubsTotal] = useState(0);
  const [clubsPage, setClubsPage] = useState(1);
  const [clubSearchQuery, setClubSearchQuery] = useState('');
  const [isSearchingClubs, setIsSearchingClubs] = useState(false);
  const [listRevision, setListRevision] = useState(0);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const [detailsClubId, setDetailsClubId] = useState(null);
  const selectedClubIdRef = useRef(selectedClub?.id);
  selectedClubIdRef.current = selectedClub?.id;

  const [activeTab, setActiveTab] = useState('members');

  const [members, setMembers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [teams, setTeams] = useState([]);
  const [owner, setOwner] = useState(undefined);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const [isOwnerDrawerOpen, setIsOwnerDrawerOpen] = useState(false);
  const [isAddMemberDrawerOpen, setIsAddMemberDrawerOpen] = useState(false);
  const [addMemberMode, setAddMemberMode] = useState('members');
  const [isAttachTeamDrawerOpen, setIsAttachTeamDrawerOpen] = useState(false);

  const [confirmState, setConfirmState] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // ── Список клубов ────────────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    const fetchClubs = async () => {
      setIsSearchingClubs(true);
      try {
        const url = `${import.meta.env.VITE_API_URL}/api/clubs-manage/search?q=${encodeURIComponent(clubSearchQuery)}&page=${clubsPage}&limit=${CLUBS_PER_PAGE}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` }, signal: controller.signal });
        const data = await res.json();
        if (data.success && !controller.signal.aborted) {
          setClubsList(data.data);
          setClubsTotal(data.total);
          const lastPage = Math.max(1, Math.ceil(data.total / CLUBS_PER_PAGE));
          if (clubsPage > lastPage) setClubsPage(lastPage);
        }
      } catch (err) {
        if (!controller.signal.aborted) console.error('Ошибка загрузки клубов:', err);
      } finally {
        if (!controller.signal.aborted) setIsSearchingClubs(false);
      }
    };

    const timer = setTimeout(fetchClubs, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [clubSearchQuery, clubsPage, listRevision, selectedClub?.id]);

  useEffect(() => { setClubsPage(1); }, [clubSearchQuery]);

  // ── Детали выбранного клуба ──────────────────────────────────────────────
  const fetchClubDetails = useCallback(async (clubId) => {
    if (!clubId) return;
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/clubs-manage/${clubId}/details`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (String(selectedClubIdRef.current) !== String(clubId)) return;
      if (data.success) {
        setDetailsClubId(clubId);
        setMembers(data.members || []);
        setStaff(data.staff || []);
        setTeams(data.teams || []);
        setOwner(data.owner || null);
        // Название и логотип могли поменяться в Team-Room — освежаем карточку слева
        if (data.club) onSelectClub(prev => (String(prev?.id) === String(clubId) ? { ...prev, ...data.club } : prev));
      }
    } catch (err) { console.error('Ошибка загрузки клуба:', err); }
    if (String(selectedClubIdRef.current) === String(clubId)) setIsLoadingDetails(false);
  }, [onSelectClub]);

  // Смена клуба (в том числе сброс из шапки) — чистим всё, что относилось к прежнему,
  // и грузим новый; иначе до ответа сервера мигал бы чужой владелец и состав
  useEffect(() => {
    setOwner(undefined);
    setDetailsClubId(null);
    setIsProfileDrawerOpen(false);
    setIsOwnerDrawerOpen(false);
    setIsAddMemberDrawerOpen(false);
    setIsAttachTeamDrawerOpen(false);
    setConfirmState(null);
    setActiveTab('members');
    setMembers([]); setStaff([]); setTeams([]);
    if (selectedClub?.id) fetchClubDetails(selectedClub.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClub?.id]);

  // ── Действия ─────────────────────────────────────────────────────────────
  const toggleClubRole = async (userId, roleId) => {
    const member = members.find(m => String(m.user_id) === String(userId));
    const current = new Set(member?.roles ? member.roles.split(', ') : []);
    if (current.has(roleId)) current.delete(roleId); else current.add(roleId);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/clubs-manage/${selectedClub.id}/members/${userId}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ roles: Array.from(current) })
      });
      const data = await res.json();
      if (!data.success) {
        showToast?.('Ошибка', data.error || 'Не удалось изменить роли');
        return;
      }
      fetchClubDetails(selectedClub.id);
    } catch (err) {
      console.error(err);
      showToast?.('Ошибка', 'Сбой сети');
    }
  };

  const requestRemoveMember = (member) => {
    const teamNames = (member.teams || []).map(t => t.name).join(', ');
    setConfirmState({
      kind: 'member',
      id: member.user_id,
      title: 'Исключить из клуба?',
      message: teamNames
        ? `${member.last_name} ${member.first_name} будет исключён из клуба, а вместе с ним — из команд клуба: ${teamNames}. Полномочия в клубе и этих командах будут сняты. История участия сохранится.`
        : `${member.last_name} ${member.first_name} будет исключён из клуба. Полномочия в клубе будут сняты. История участия сохранится.`,
      confirmLabel: 'Исключить'
    });
  };

  const requestDetachTeam = (team) => {
    setConfirmState({
      kind: 'team',
      id: team.id,
      title: 'Отвязать команду?',
      message: `Команда «${team.name}» перестанет принадлежать клубу и станет самостоятельной. Её состав, ростер и заявки не изменятся. Из базы клуба её люди уйдут — кроме тех, кто состоит в другой команде клуба, имеет клубную роль или владеет клубом.`,
      confirmLabel: 'Отвязать'
    });
  };

  const handleProfileSaved = (club) => {
    const created = !selectedClub;
    setIsProfileDrawerOpen(false);
    setListRevision(value => value + 1);
    if (created) {
      setClubSearchQuery('');
      setClubsPage(1);
      onSelectClub(club);
    } else {
      onSelectClub(prev => (String(prev?.id) === String(club.id) ? { ...prev, ...club } : prev));
    }
    showToast?.('Успешно', created ? 'Клуб создан' : 'Профиль клуба обновлён', 'success');
  };

  const canDeleteClub = !!selectedClub && String(detailsClubId) === String(selectedClub.id) && !isLoadingDetails && teams.length === 0;
  const requestDeleteClub = () => {
    if (!canDeleteClub) return;
    setConfirmState({
      kind: 'club', id: selectedClub.id, title: 'Удалить клуб?',
      message: `Клуб «${selectedClub.name}» будет удалён вместе с составом, клубными ролями, тренировками и собраниями. Аккаунты пользователей и данные самостоятельных команд сохранятся. Удаление нельзя отменить.`,
      confirmLabel: 'Удалить клуб'
    });
  };

  const handleConfirm = async () => {
    if (!confirmState || isConfirming) return;
    setIsConfirming(true);
    try {
      const url = confirmState.kind === 'club'
        ? `${import.meta.env.VITE_API_URL}/api/clubs-manage/${confirmState.id}`
        : confirmState.kind === 'member'
          ? `${import.meta.env.VITE_API_URL}/api/clubs-manage/${selectedClub.id}/members/${confirmState.id}`
          : `${import.meta.env.VITE_API_URL}/api/clubs-manage/${selectedClub.id}/teams/${confirmState.id}`;

      const res = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();

      if (data.success && confirmState.kind === 'club') {
        onSelectClub(null);
        setDetailsClubId(null);
        setListRevision(value => value + 1);
        setConfirmState(null);
        showToast?.('Успешно', 'Клуб удалён', 'success');
      } else if (data.success) {
        const removed = Number(data.removedMembers) || 0;
        showToast?.(
          'Успешно',
          confirmState.kind === 'member'
            ? 'Участник исключён из клуба'
            : (removed > 0
                ? `Команда отвязана, из состава клуба вышло человек: ${removed}`
                : 'Команда отвязана от клуба'),
          'success'
        );
        fetchClubDetails(selectedClub.id);
        setConfirmState(null);
      } else {
        showToast?.('Ошибка', data.error || 'Не удалось выполнить действие');
        if (confirmState.kind === 'club') {
          fetchClubDetails(confirmState.id);
          setConfirmState(null);
        }
      }
    } catch (err) {
      console.error(err);
      showToast?.('Ошибка', 'Сбой сети');
    }
    setIsConfirming(false);
  };

  // ── Колонки таблиц ───────────────────────────────────────────────────────
  const memberColumns = [
    { label: '№', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Фото', width: 'w-[60px]', render: (r) => (
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10">
        <img src={getImageUrl(r.avatar_url || '/default/user_default.webp')} className="w-full h-full object-cover" onError={(e) => { e.target.src = getImageUrl('/default/user_default.webp') }} />
      </div>
    )},
    { label: 'ФИО', sortKey: 'last_name', render: (r) => (
      <div onClick={() => onOpenProfile?.(r.user_id)} className="cursor-pointer group">
        <span className="font-bold text-[14px] leading-tight truncate group-hover:text-orange flex items-center gap-1.5">
          {r.last_name} {r.first_name}
          {r.is_virtual && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-graphite/10 text-graphite-light shrink-0" title="Аккаунт создан менеджером — человек ни разу не входил в систему">вирт.</span>}
        </span>
        {r.middle_name && <span className="text-[12px] text-graphite-light block truncate">{r.middle_name}</span>}
      </div>
    )},
    { label: 'Телефон', sortKey: 'phone', width: 'w-[160px]', render: (r) => <span className="text-[13px]">{formatPhone(r.phone)}</span> },
    { label: 'Команды клуба', render: (r) => (
      <div className="flex flex-wrap gap-1.5 min-w-[180px]">
        {(r.teams || []).length > 0 ? r.teams.map(t => (
          <span key={t.id} className="text-[11px] font-bold px-2 py-1 rounded bg-graphite/5 text-graphite-light">{t.name}</span>
        )) : <span className="text-[12px] text-graphite/40 italic">Резерв клуба</span>}
      </div>
    )},
    { label: 'В клубе с', sortKey: 'joined_at', width: 'w-[110px]', render: (r) => (
      <span className="text-[13px] text-graphite-light">{r.joined_at ? dayjs(r.joined_at).format('DD.MM.YYYY') : '—'}</span>
    )},
    { label: '', width: 'w-[50px] text-right', render: (r) => (
      <button onClick={() => requestRemoveMember(r)} className="text-status-rejected w-8 h-8 hover:bg-status-rejected/10 rounded" title="Исключить из клуба">×</button>
    )}
  ];

  const staffColumns = [
    { label: '№', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Фото', width: 'w-[60px]', render: (r) => (
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10">
        <img src={getImageUrl(r.avatar_url || '/default/user_default.webp')} className="w-full h-full object-cover" onError={(e) => { e.target.src = getImageUrl('/default/user_default.webp') }} />
      </div>
    )},
    { label: 'ФИО', sortKey: 'last_name', render: (r) => (
      <div onClick={() => onOpenProfile?.(r.user_id)} className="cursor-pointer group">
        <span className="font-bold text-[14px] leading-tight truncate group-hover:text-orange">{r.last_name} {r.first_name}</span>
        {r.middle_name && <span className="text-[12px] text-graphite-light block truncate">{r.middle_name}</span>}
      </div>
    )},
    { label: 'Роли в клубе', sortKey: 'roles', render: (r) => {
      const activeRoles = r.roles ? r.roles.split(', ') : [];
      return (
        <div className="flex flex-wrap gap-1.5 min-w-[250px]">
          {CLUB_ROLES.map(role => (
            <span
              key={role.id}
              onClick={() => toggleClubRole(r.user_id, role.id)}
              className={`cursor-pointer px-2 py-1 text-[11px] font-bold uppercase rounded border ${activeRoles.includes(role.id) ? 'bg-orange/10 border-orange text-orange' : 'text-graphite/50 border-graphite/20'}`}
            >
              {role.label}
            </span>
          ))}
        </div>
      );
    }},
    { label: '', width: 'w-[50px] text-right', render: (r) => (
      <button onClick={() => requestRemoveMember(members.find(m => String(m.user_id) === String(r.user_id)) || r)} className="text-status-rejected w-8 h-8 hover:bg-status-rejected/10 rounded" title="Исключить из клуба">×</button>
    )}
  ];

  const teamColumns = [
    { label: '№', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Лого', width: 'w-[60px]', render: (r) => (
      <div className="w-10 h-10 shrink-0">
        <img src={getImageUrl(r.logo_url) || '/default/Logo_team_default.webp'} className="w-full h-full object-contain" />
      </div>
    )},
    { label: 'Команда', sortKey: 'name', render: (r) => (
      <div>
        <span className="font-bold text-[14px] leading-tight truncate block">{r.name}</span>
        <span className="text-[12px] text-graphite-light block truncate">{r.city || 'Город не указан'}</span>
      </div>
    )},
    { label: 'В базе', sortKey: 'base_count', width: 'w-[100px]', render: (r) => (
      <span className="text-[13px] font-bold text-graphite">{r.base_count}</span>
    )},
    { label: 'Владелец', width: 'w-[140px]', render: (r) => (
      <span className={`text-[11px] font-bold px-2 py-1 rounded ${r.has_owner ? 'bg-status-accepted/10 text-status-accepted' : 'bg-status-rejected/10 text-status-rejected'}`}>
        {r.has_owner ? 'Назначен' : 'Не назначен'}
      </span>
    )},
    { label: '', width: 'w-[50px] text-right', render: (r) => (
      <button onClick={() => requestDetachTeam(r)} className="text-status-rejected w-8 h-8 hover:bg-status-rejected/10 rounded" title="Отвязать от клуба">×</button>
    )}
  ];

  // ── Выбор клуба ──────────────────────────────────────────────────────────
  if (!selectedClub) {
    return (
      <div className="bg-white/40 border border-graphite/10 rounded-lg p-8 animate-zoom-in">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <Input placeholder="Поиск клуба..." value={clubSearchQuery} onChange={(e) => setClubSearchQuery(e.target.value)} />
          </div>
          <span className="shrink-0 bg-graphite/5 text-graphite/60 px-3 py-1.5 rounded-md text-[13px] font-black whitespace-nowrap">
            {clubsTotal} клубов
          </span>
          <Button onClick={() => setIsProfileDrawerOpen(true)}>Создать клуб</Button>
        </div>

        {isSearchingClubs ? <Loader text="Поиск..." /> : (
          <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 mt-6">
            {clubsList.map(c => (
              <div key={c.id} onClick={() => onSelectClub(c)} className="flex flex-col gap-3 p-5 bg-white rounded-md border cursor-pointer hover:border-orange shadow-sm group">
                <div className="flex items-center gap-4">
                  <img src={getImageUrl(c.logo_url) || '/default/Logo_team_default.webp'} className="w-12 h-12 object-contain shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold group-hover:text-orange truncate">{c.name}</span>
                    <span className="text-[12px] text-graphite-light mt-1 truncate">{c.city || 'Город не указан'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-graphite/10">
                  <span className="text-[11px] font-bold px-2 py-1 rounded bg-graphite/5 text-graphite-light" title="Людей в общей базе клуба">
                    База: {c.members_count ?? 0}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-1 rounded bg-graphite/5 text-graphite-light" title="Команд клуба">
                    Команды: {c.teams_count ?? 0}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-1 rounded ${c.has_owner ? 'bg-status-accepted/10 text-status-accepted' : 'bg-status-rejected/10 text-status-rejected'}`}
                    title={c.has_owner ? 'Владелец клуба назначен' : 'Владелец клуба не назначен'}
                  >
                    {c.has_owner ? 'Владелец есть' : 'Без владельца'}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-1 rounded ${c.last_activity && dayjs(c.last_activity).isAfter(dayjs().subtract(7, 'day')) ? 'bg-status-accepted/10 text-status-accepted' : 'bg-graphite/5 text-graphite-light'}`}
                    title="Последний визит человека из клуба в Team-Room"
                  >
                    {c.last_activity ? `Актив: ${dayjs(c.last_activity).format('D MMM')}` : 'Не заходили'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isSearchingClubs && clubsList.length === 0 && (
          <div className="text-center py-16 text-graphite-light font-medium">
            Клубы не найдены. Создайте новый клуб или измените поиск.
          </div>
        )}

        <Pagination page={clubsPage} total={clubsTotal} limit={CLUBS_PER_PAGE} onChange={setClubsPage} className="mt-8" />
        <ClubProfileDrawer isOpen={isProfileDrawerOpen} onClose={() => setIsProfileDrawerOpen(false)} onSaved={handleProfileSaved} />
      </div>
    );
  }

  // ── Рабочая область клуба ────────────────────────────────────────────────
  const tabTitle = activeTab === 'members' ? 'Состав клуба' : activeTab === 'staff' ? 'Штаб клуба' : 'Команды клуба';

  return (
    <div className="flex items-start gap-8">
      <div className="w-[260px] shrink-0 sticky top-[128px] bg-white/70 backdrop-blur-md rounded-lg p-4 flex flex-col gap-2 shadow-sm border border-white/50 animate-zoom-in">
        <div className="flex flex-col items-center mb-4 text-center">
          <img src={getImageUrl(selectedClub.logo_url) || '/default/Logo_team_default.webp'} className="w-16 h-16 object-contain mb-3" />
          <span className="font-black text-[16px] leading-tight">{selectedClub.name}</span>
          {selectedClub.city && <span className="text-[12px] font-bold text-graphite-light mt-1">{selectedClub.city}</span>}
        </div>

        <button onClick={() => setIsProfileDrawerOpen(true)} className="text-left px-4 py-3 rounded-md font-bold text-graphite-light hover:bg-white/70 hover:text-orange transition-colors">
          Редактировать профиль
        </button>

        {/* Владелец клуба — свойство самого клуба, поэтому виден с любой вкладки */}
        <button
          onClick={() => setIsOwnerDrawerOpen(true)}
          className="text-left px-4 py-3 mb-2 rounded-md border border-graphite/10 bg-white/60 hover:border-orange hover:bg-white transition-all group"
        >
          <span className="text-[10px] font-black uppercase tracking-wide text-graphite-light block">Владелец клуба</span>
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
          { id: 'members', label: 'Состав клуба', count: members.length },
          { id: 'staff', label: 'Штаб клуба', count: staff.length },
          { id: 'teams', label: 'Команды клуба', count: teams.length },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`text-left px-4 py-3 rounded-md font-bold transition-all flex items-center justify-between gap-2 ${activeTab === tab.id ? 'bg-white text-orange shadow-sm' : 'text-graphite-light hover:bg-white/40'}`}>
            <span>{tab.label}</span>
            <span className={`text-[12px] font-black px-2 py-0.5 rounded-full shrink-0 ${activeTab === tab.id ? 'bg-orange/10 text-orange' : 'bg-graphite/10 text-graphite-light'}`}>
              {tab.count}
            </span>
          </button>
        ))}
        <div className="mt-4 pt-4 border-t border-graphite/10">
          <button onClick={requestDeleteClub} disabled={!canDeleteClub}
            title={teams.length > 0 ? 'Сначала отвяжите все команды от клуба' : 'Удалить клуб'}
            className="w-full text-left px-4 py-3 rounded-md font-bold text-status-rejected hover:bg-status-rejected/10 disabled:text-graphite/40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors">
            Удалить клуб
          </button>
          {teams.length > 0 && <p className="px-4 text-[11px] text-graphite-light leading-snug">Удаление доступно после отвязки всех команд.</p>}
        </div>
      </div>

      <div className="flex-1 relative z-10 min-h-[500px]">
        <div className="bg-white/85 rounded-lg shadow-sm border border-graphite/10 p-8 animate-zoom-in">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-black text-graphite uppercase tracking-wide">{tabTitle}</h3>

            {activeTab === 'teams' ? (
              <Button onClick={() => setIsAttachTeamDrawerOpen(true)}>+ Привязать команду</Button>
            ) : (
              <Button onClick={() => { setAddMemberMode(activeTab === 'staff' ? 'staff' : 'members'); setIsAddMemberDrawerOpen(true); }}>
                + Добавить
              </Button>
            )}
          </div>

          {activeTab === 'staff' && (
            <div className="mb-5 -mt-2 text-[12px] font-bold text-graphite-light">
              Роль работает только у человека из состава клуба. Клик по роли назначает или снимает её.
            </div>
          )}

          {isLoadingDetails ? <Loader text="Загрузка..." /> : (
            <>
              {activeTab === 'members' && <Table columns={memberColumns} data={members} />}
              {activeTab === 'staff' && <Table columns={staffColumns} data={staff} />}
              {activeTab === 'teams' && <Table columns={teamColumns} data={teams} />}
            </>
          )}
        </div>
      </div>

      <ClubOwnerDrawer
        isOpen={isOwnerDrawerOpen}
        onClose={() => setIsOwnerDrawerOpen(false)}
        clubId={selectedClub.id}
        clubName={selectedClub.name}
        owner={owner}
        onSaved={(nextOwner) => {
          setOwner(nextOwner);
          showToast?.('Успешно', nextOwner ? 'Владелец клуба назначен' : 'Владелец клуба снят', 'success');
        }}
      />

      <AddClubMemberDrawer
        isOpen={isAddMemberDrawerOpen}
        onClose={() => setIsAddMemberDrawerOpen(false)}
        clubId={selectedClub.id}
        clubName={selectedClub.name}
        mode={addMemberMode}
        members={members}
        onSuccess={() => {
          fetchClubDetails(selectedClub.id);
          showToast?.('Успешно', addMemberMode === 'staff' ? 'Роли обновлены' : 'Участник добавлен в клуб', 'success');
        }}
      />

      <AttachTeamDrawer
        isOpen={isAttachTeamDrawerOpen}
        onClose={() => setIsAttachTeamDrawerOpen(false)}
        clubId={selectedClub.id}
        clubName={selectedClub.name}
        onSuccess={(result) => {
          fetchClubDetails(selectedClub.id);
          const added = Number(result?.addedMembers) || 0;
          showToast?.(
            'Успешно',
            added > 0
              ? `Команда привязана к клубу, в состав добавлено человек: ${added}`
              : 'Команда привязана к клубу',
            'success'
          );
        }}
      />

      <ClubProfileDrawer isOpen={isProfileDrawerOpen} onClose={() => setIsProfileDrawerOpen(false)} clubId={selectedClub.id} onSaved={handleProfileSaved} />

      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={handleConfirm}
        isLoading={isConfirming}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        confirmingLabel="Выполняем..."
      />
    </div>
  );
}
