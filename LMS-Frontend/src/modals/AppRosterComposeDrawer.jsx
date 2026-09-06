import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Table } from '../ui/Table2';
import { DisqualificationBadge } from '../ui/DisqualificationBadge';
import { AccessFallback } from '../ui/AccessFallback';
import { getImageUrl, getToken } from '../utils/helpers';

// Шторка «Состав заявки»: лига переносит людей из состава команды (слева) в заявку (справа).
// Работает только в дивизионах с league_managed_roster — там команда состав не ведёт вовсе,
// поэтому второго редактора у этих данных нет и блокировки на время правки не нужны.
//
// Заявка собирается локально и уходит на сервер целиком одной кнопкой: лига переносит
// два десятка человек за раз, и поштучные запросы тут только мешали бы.

const POSITION_MAP = { goalie: 'Вр', defense: 'Защ', forward: 'Нап' };
const POSITION_ORDER = { goalie: 1, defense: 2, forward: 3 };

// Роли в заявке. Главный тренер команды (head_coach) подаётся обычным тренером:
// разделения на главного и рядового в заявке нет.
const TOURNAMENT_ROLES = [
  { id: 'team_manager', label: 'Руководитель' },
  { id: 'team_admin', label: 'Администратор' },
  { id: 'coach', label: 'Тренер' }
];
const ROLE_LABELS = Object.fromEntries(TOURNAMENT_ROLES.map(r => [r.id, r.label]));
const toTournamentRole = (teamRole) => (teamRole === 'head_coach' ? 'coach' : teamRole);

const personPhoto = (p) => getImageUrl(p.photo_url || p.avatar_url || '/default/user_default.webp');
const fullName = (p) => `${p.last_name || ''} ${p.first_name || ''}`.trim();

export function AppRosterComposeDrawer({ isOpen, onClose, teamApp, onSaved, showToast }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const [teamPlayers, setTeamPlayers] = useState([]);   // игровой состав команды
  const [teamStaff, setTeamStaff] = useState([]);       // штаб команды
  const [selectedPlayers, setSelectedPlayers] = useState([]); // игроки в заявке
  const [selectedStaff, setSelectedStaff] = useState([]);     // представители заявки
  const [blockReason, setBlockReason] = useState(null);
  const [hasGames, setHasGames] = useState(false);

  useEffect(() => {
    if (!isOpen || !teamApp?.id) {
      setTeamPlayers([]); setTeamStaff([]); setSelectedPlayers([]); setSelectedStaff([]);
      setSearch(''); setError(''); setBlockReason(null); setHasGames(false);
      return;
    }

    setIsLoading(true);
    setError('');
    fetch(`${import.meta.env.VITE_API_URL}/api/tournament-teams/${teamApp.id}/roster-pool`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success) { setError(data.error || 'Не удалось загрузить состав команды'); return; }

        setTeamPlayers(data.players || []);
        setTeamStaff(data.staff || []);
        setBlockReason(data.application?.block_reason || null);
        setHasGames(!!data.application?.division_has_games);

        // Правое поле собираем из заявки, а карточку человека (фото, ФИО) берём оттуда же:
        // в заявке может стоять тот, кого команда уже вывела из игрового состава.
        setSelectedPlayers((data.roster || []).map(r => ({
          // id нужен таблице для устойчивого key: правка амплуа пересортировывает строки,
          // и без него ввод номера терял бы фокус на переехавшей строке
          id: r.player_id,
          player_id: r.player_id,
          first_name: r.first_name, last_name: r.last_name, middle_name: r.middle_name,
          photo_url: r.photo_url, avatar_url: r.avatar_url,
          position: r.position || 'forward',
          jersey_number: r.jersey_number ?? '',
          is_captain: !!r.is_captain,
          is_assistant: !!r.is_assistant
        })));

        setSelectedStaff((data.appStaff || []).map(s => ({
          user_id: s.user_id,
          first_name: s.first_name, last_name: s.last_name, middle_name: s.middle_name,
          photo_url: s.photo_url, avatar_url: s.avatar_url,
          roles: (s.roles || '').split(',').filter(Boolean)
        })));
      })
      .catch(() => setError('Сбой связи с сервером'))
      .finally(() => setIsLoading(false));
  }, [isOpen, teamApp?.id]);

  const readOnly = !!blockReason;

  const selectedPlayerIds = useMemo(() => new Set(selectedPlayers.map(p => p.player_id)), [selectedPlayers]);
  const selectedStaffIds = useMemo(() => new Set(selectedStaff.map(s => s.user_id)), [selectedStaff]);

  const matchesSearch = (p) => `${p.last_name || ''} ${p.first_name || ''} ${p.middle_name || ''}`
    .toLowerCase().includes(search.trim().toLowerCase());

  const availablePlayers = teamPlayers.filter(p => !selectedPlayerIds.has(p.player_id) && matchesSearch(p));
  const availableStaff = teamStaff.filter(s => !selectedStaffIds.has(s.user_id) && matchesSearch(s));

  const sortedSelected = useMemo(
    () => [...selectedPlayers].sort((a, b) => {
      const byPos = (POSITION_ORDER[a.position] || 99) - (POSITION_ORDER[b.position] || 99);
      return byPos !== 0 ? byPos : fullName(a).localeCompare(fullName(b));
    }),
    [selectedPlayers]
  );

  // Номер в заявке уникален. Считаем дубли на лету: номера тянутся из состава команды,
  // и при массовом переносе столкновения — обычное дело.
  const duplicateNumbers = useMemo(() => {
    const counts = {};
    selectedPlayers.forEach(p => {
      const num = String(p.jersey_number ?? '').trim();
      if (num) counts[num] = (counts[num] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter(num => counts[num] > 1));
  }, [selectedPlayers]);

  const addPlayer = (player) => {
    if (readOnly || player.qual_block_reason) return;
    setSelectedPlayers(prev => [...prev, {
      id: player.player_id,
      player_id: player.player_id,
      first_name: player.first_name, last_name: player.last_name, middle_name: player.middle_name,
      photo_url: player.photo_url, avatar_url: player.avatar_url,
      position: player.position || 'forward',
      jersey_number: player.jersey_number ?? '',
      is_captain: false,
      is_assistant: false
    }]);
  };

  const removePlayer = (playerId) => {
    if (readOnly) return;
    setSelectedPlayers(prev => prev.filter(p => p.player_id !== playerId));
  };

  const updatePlayer = (playerId, field, value) => {
    if (readOnly) return;
    setSelectedPlayers(prev => prev.map(p => p.player_id === playerId ? { ...p, [field]: value } : p));
  };

  // Капитан в заявке один, ассистентов не больше двух — те же правила, что в протоколе.
  const toggleLetter = (playerId, letter) => {
    if (readOnly) return;
    setSelectedPlayers(prev => {
      const idx = prev.findIndex(p => p.player_id === playerId);
      if (idx === -1) return prev;
      const player = prev[idx];

      if (letter === 'C') {
        if (player.is_captain) return prev.map(p => p.player_id === playerId ? { ...p, is_captain: false } : p);
        return prev.map(p => p.player_id === playerId
          ? { ...p, is_captain: true, is_assistant: false }
          : { ...p, is_captain: false });
      }

      if (player.is_assistant) return prev.map(p => p.player_id === playerId ? { ...p, is_assistant: false } : p);
      if (prev.filter(p => p.is_assistant).length >= 2) return prev;
      return prev.map(p => p.player_id === playerId ? { ...p, is_assistant: true, is_captain: false } : p);
    });
  };

  // Роль в заявке подставляем из штата команды: чаще всего она и нужна. Если ни одна
  // из ролей команды не переводится в турнирную, ставим тренера — её потом можно сменить.
  const addStaff = (person) => {
    if (readOnly) return;
    const fromTeam = [...new Set((person.team_roles || '').split(',').filter(Boolean).map(toTournamentRole))]
      .filter(role => ROLE_LABELS[role]);
    setSelectedStaff(prev => [...prev, {
      user_id: person.user_id,
      first_name: person.first_name, last_name: person.last_name, middle_name: person.middle_name,
      photo_url: person.photo_url, avatar_url: person.avatar_url,
      roles: fromTeam.length > 0 ? fromTeam : ['coach']
    }]);
  };

  const removeStaff = (userId) => {
    if (readOnly) return;
    setSelectedStaff(prev => prev.filter(s => s.user_id !== userId));
  };

  // Один человек может занимать в заявке сразу несколько ролей. Снятие последней роли
  // равносильно удалению из заявки, поэтому последнюю не снимаем — для этого есть крестик.
  const toggleStaffRole = (userId, role) => {
    if (readOnly) return;
    setSelectedStaff(prev => prev.map(s => {
      if (s.user_id !== userId) return s;
      if (s.roles.includes(role)) {
        if (s.roles.length === 1) return s;
        return { ...s, roles: s.roles.filter(r => r !== role) };
      }
      return { ...s, roles: [...s.roles, role] };
    }));
  };

  const handleSave = async () => {
    if (readOnly || isSaving || duplicateNumbers.size > 0) return;
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-teams/${teamApp.id}/roster-composition`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({
          players: selectedPlayers.map(p => ({
            player_id: p.player_id,
            position: p.position,
            jersey_number: String(p.jersey_number ?? '').trim() === '' ? null : Number(p.jersey_number),
            is_captain: p.is_captain,
            is_assistant: p.is_assistant
          })),
          staff: selectedStaff.map(s => ({ user_id: s.user_id, roles: s.roles }))
        })
      });
      const data = await res.json();
      if (data.success) {
        if (showToast) showToast('Успешно', 'Состав заявки сохранён', 'success');
        if (onSaved) onSaved();
        onClose();
      } else {
        setError(data.error || 'Не удалось сохранить состав');
      }
    } catch (err) {
      setError('Сбой связи с сервером');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedColumns = [
    {
      label: 'Фото', width: 'w-[60px]',
      render: (p) => <img src={personPhoto(p)} className="w-9 h-9 rounded-md object-cover bg-graphite/5 shrink-0" alt="av" />
    },
    {
      label: 'Игрок',
      render: (p) => (
        <div className="min-w-0 flex flex-col justify-center">
          <span className="text-[13px] font-bold text-graphite leading-tight block truncate">{p.last_name} {p.first_name}</span>
          {p.middle_name && <span className="text-[11px] text-graphite-light block truncate mt-[2px]">{p.middle_name}</span>}
        </div>
      )
    },
    {
      label: 'Амплуа', width: 'w-[110px]',
      render: (p) => (
        <Select
          options={['Вр', 'Защ', 'Нап']}
          value={POSITION_MAP[p.position] || 'Нап'}
          disabled={readOnly}
          onChange={(val) => {
            const next = Object.keys(POSITION_MAP).find(k => POSITION_MAP[k] === val);
            if (next) updatePlayer(p.player_id, 'position', next);
          }}
          className="w-full h-8 px-2 text-[11px]"
        />
      )
    },
    {
      label: 'Номер', width: 'w-[60px]',
      render: (p) => {
        const num = String(p.jersey_number ?? '').trim();
        const isDuplicate = num && duplicateNumbers.has(num);
        return (
          <div className="flex justify-center w-full">
            {/* Номер необязателен: игрока можно внести в заявку и без него — в поле
                тогда стоит прочерк, как и в таблице состава дивизиона. */}
            <Input
              value={p.jersey_number ?? ''}
              onChange={(e) => updatePlayer(p.player_id, 'jersey_number', e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="-"
              disabled={readOnly}
              className={`w-11 h-8 text-center text-[13px] font-bold px-1 transition-colors ${
                isDuplicate ? 'bg-status-rejected/10 border-status-rejected text-status-rejected' : 'bg-white border-graphite/20'
              }`}
            />
          </div>
        );
      }
    },
    {
      label: 'Нашивки', width: 'w-[80px]',
      render: (p) => {
        const canAddA = p.is_assistant || selectedPlayers.filter(x => x.is_assistant).length < 2;
        return (
          <div className="flex gap-1.5 shrink-0 justify-center">
            <button
              onClick={() => toggleLetter(p.player_id, 'C')}
              disabled={readOnly}
              className={`w-7 h-7 rounded flex items-center justify-center text-[12px] font-black border transition-colors ${
                p.is_captain ? 'bg-orange text-white border-orange' : 'text-graphite/40 border-graphite/20 hover:bg-graphite/10'
              } ${readOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
              title="Капитан"
            >C</button>
            <button
              onClick={() => toggleLetter(p.player_id, 'A')}
              disabled={readOnly || (!canAddA && !p.is_assistant)}
              className={`w-7 h-7 rounded flex items-center justify-center text-[12px] font-black border transition-colors ${
                p.is_assistant ? 'bg-status-accepted text-white border-status-accepted' : 'text-graphite/40 border-graphite/20 hover:bg-graphite/10'
              } ${(readOnly || (!canAddA && !p.is_assistant)) && !p.is_assistant ? 'opacity-30 cursor-not-allowed' : ''}`}
              title="Ассистент"
            >A</button>
          </div>
        );
      }
    },
    {
      label: '', width: 'w-[40px]', align: 'right',
      render: (p) => (
        <button
          onClick={() => removePlayer(p.player_id)}
          disabled={readOnly}
          className={`w-7 h-7 flex items-center justify-center shrink-0 transition-colors ${
            readOnly ? 'text-graphite/10 cursor-not-allowed' : 'text-graphite/30 hover:text-status-rejected'
          }`}
          title="Убрать из заявки"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )
    }
  ];

  const renderPoolRow = (person, key, { onAdd, blockedReason, subtitle, tone = 'orange' }) => (
    <div
      key={key}
      className={`flex items-center justify-between p-3 rounded-md group transition-colors border border-transparent ${
        blockedReason ? 'opacity-70' : tone === 'blue' ? 'hover:bg-blue-500/5 hover:border-blue-500/10' : 'hover:bg-orange/5 hover:border-orange/10'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0 pr-2">
        <img src={personPhoto(person)} className="w-10 h-10 rounded-lg object-cover bg-graphite/5 shrink-0" alt="av" />
        <div className="min-w-0 flex flex-col justify-center">
          <span className="block text-[13px] font-bold text-graphite leading-tight truncate">{person.last_name} {person.first_name}</span>
          {subtitle && <span className="block text-[11px] font-medium text-graphite-light mt-[2px] truncate">{subtitle}</span>}
          {blockedReason && (
            <span className="block text-[11px] font-semibold text-status-rejected leading-snug mt-1">{blockedReason}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {person.active_disqualifications?.length > 0 && (
          <DisqualificationBadge activeDisqualifications={person.active_disqualifications} />
        )}
        <button
          onClick={onAdd}
          disabled={readOnly || !!blockedReason}
          title={blockedReason || 'Добавить в заявку'}
          className={`w-8 h-8 flex items-center justify-center rounded-md shrink-0 transition-colors ${
            readOnly || blockedReason
              ? 'bg-graphite/5 text-graphite/20 cursor-not-allowed'
              : tone === 'blue'
                ? 'bg-graphite/5 text-graphite hover:bg-blue-600 hover:text-white'
                : 'bg-graphite/5 text-graphite hover:bg-orange hover:text-white'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>
    </div>
  );

  const drawerContent = (
    <div className={`fixed inset-0 z-[35] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-full max-w-[1100px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <div className="flex flex-col">
            <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Состав заявки: {teamApp?.name || ''}</h2>
            <span className="text-[12px] text-graphite-light font-medium mt-0.5">Игроки и представители по утверждённому заявочному листу</span>
          </div>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 p-6 md:p-8 overflow-hidden flex flex-col">

          {readOnly && (
            <div className="mb-4">
              <AccessFallback variant="readonly" message={blockReason} />
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-status-rejected/10 border border-status-rejected/20 rounded-md text-[13px] font-bold text-status-rejected">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-graphite-light font-bold">Загрузка состава команды...</span>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-8 flex-1 overflow-hidden h-full">

              {/* Левая панель: кого можно внести в заявку */}
              <div className="col-span-2 flex flex-col bg-white border border-graphite/10 rounded-2xl shadow-sm overflow-hidden h-full">
                <div className="p-5 border-b border-graphite/10 bg-graphite/[0.02] shrink-0">
                  <h3 className="text-[14px] font-black uppercase text-graphite mb-4">Состав команды</h3>
                  <Input
                    placeholder="Поиск по ФИО..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-2 py-2 text-[12px]"
                  />
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                  <div className="px-3 pb-2 pt-1">
                    <div className="text-[12px] font-black uppercase text-graphite tracking-wide">
                      Игровой состав ({availablePlayers.length})
                    </div>
                  </div>

                  {availablePlayers.length === 0 ? (
                    <div className="px-3 py-4 text-[12px] text-graphite-light/70 italic">
                      {search ? 'По запросу никого нет' : 'Все игроки уже в заявке'}
                    </div>
                  ) : availablePlayers.map(p => renderPoolRow(p, `player-${p.player_id}`, {
                    onAdd: () => addPlayer(p),
                    blockedReason: p.qual_block_reason,
                    subtitle: [
                      p.middle_name,
                      POSITION_MAP[p.position] || null,
                      p.jersey_number != null ? `№${p.jersey_number}` : null,
                      p.qualification_short_name || null
                    ].filter(Boolean).join(' | ')
                  }))}

                  {/* Штаб команды отдельным блоком: он уходит в другой раздел заявки —
                      представители, а не игроки. Один человек может попасть в оба. */}
                  <div className="mt-4 pt-4 border-t-2 border-dashed border-graphite/15">
                    <div className="px-3 pb-2">
                      <div className="text-[12px] font-black uppercase text-graphite tracking-wide">
                        Штаб команды ({availableStaff.length})
                      </div>
                      <div className="text-[11px] text-graphite-light leading-snug mt-1">
                        Руководитель, администратор и тренер заявки. Роль можно сменить справа.
                      </div>
                    </div>

                    {availableStaff.length === 0 ? (
                      <div className="px-3 py-4 text-[12px] text-graphite-light/70 italic">
                        {search ? 'По запросу никого нет' : 'Весь штаб уже в заявке'}
                      </div>
                    ) : availableStaff.map(s => renderPoolRow(s, `staff-${s.user_id}`, {
                      onAdd: () => addStaff(s),
                      tone: 'blue',
                      subtitle: [
                        s.middle_name,
                        [...new Set((s.team_roles || '').split(',').filter(Boolean).map(toTournamentRole))]
                          .map(r => ROLE_LABELS[r]).filter(Boolean).join(', ') || null
                      ].filter(Boolean).join(' | ')
                    }))}
                  </div>

                  <div className="px-3 pt-4 pb-2 text-[11px] text-graphite-light/80 leading-snug">
                    Нужного человека нет в списке? Команда должна сначала добавить его в игровой состав или штаб у себя.
                  </div>
                </div>
              </div>

              {/* Правая панель: что уйдёт в заявку */}
              <div className="col-span-3 flex flex-col bg-white border-2 border-orange/30 rounded-2xl shadow-md overflow-hidden h-full">
                <div className="p-4 border-b border-graphite/10 bg-orange/5 flex justify-between items-center shrink-0">
                  <h3 className="text-[14px] font-black uppercase text-graphite">В заявке</h3>
                  <div className="flex gap-3 text-[11px] font-bold">
                    <span className="text-graphite bg-white px-2 py-1 rounded shadow-sm border border-graphite/10">
                      Игроков: <span className="text-orange text-[13px]">{selectedPlayers.length}</span>
                    </span>
                    <span className="text-graphite bg-white px-2 py-1 rounded shadow-sm border border-graphite/10">
                      Представителей: <span className="text-orange text-[13px]">{selectedStaff.length}</span>
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {selectedPlayers.length === 0 ? (
                    <div className="py-10 flex items-center justify-center text-[13px] font-bold text-graphite/40 text-center px-10">
                      Игроков пока нет.<br />Выберите их из состава команды слева.
                    </div>
                  ) : (
                    <Table columns={selectedColumns} data={sortedSelected} hideHeader={true} />
                  )}

                  <div className="p-4 border-t border-graphite/10 bg-graphite/[0.02]">
                    <div className="text-[12px] font-black uppercase text-graphite tracking-wide mb-3">Представители</div>

                    {selectedStaff.length === 0 ? (
                      <div className="text-[12px] text-graphite-light/70 italic">
                        Руководитель, администратор и тренер добавляются из штаба команды слева.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {selectedStaff.map(s => (
                          <div key={`app-staff-${s.user_id}`} className="flex items-center gap-3 p-3 bg-white rounded-md border border-graphite/10">
                            <img src={personPhoto(s)} className="w-9 h-9 rounded-md object-cover bg-graphite/5 shrink-0" alt="av" />
                            <div className="min-w-0 flex flex-col justify-center w-[180px] shrink-0">
                              <span className="text-[13px] font-bold text-graphite leading-tight truncate">{s.last_name} {s.first_name}</span>
                              {s.middle_name && <span className="text-[11px] text-graphite-light truncate mt-[2px]">{s.middle_name}</span>}
                            </div>

                            <div className="flex flex-wrap gap-1.5 flex-1">
                              {TOURNAMENT_ROLES.map(role => (
                                <button
                                  key={role.id}
                                  type="button"
                                  onClick={() => toggleStaffRole(s.user_id, role.id)}
                                  disabled={readOnly}
                                  className={`px-2.5 py-1.5 rounded text-[10px] font-black uppercase tracking-wider border transition-colors ${
                                    s.roles.includes(role.id)
                                      ? 'border-orange text-orange bg-orange/10'
                                      : 'border-graphite/20 text-graphite/60 bg-white'
                                  } ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  {role.label}
                                </button>
                              ))}
                            </div>

                            <button
                              onClick={() => removeStaff(s.user_id)}
                              disabled={readOnly}
                              className={`w-7 h-7 flex items-center justify-center shrink-0 transition-colors ${
                                readOnly ? 'text-graphite/10 cursor-not-allowed' : 'text-graphite/30 hover:text-status-rejected'
                              }`}
                              title="Убрать из заявки"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {!readOnly && (
                  <div className="p-5 border-t border-graphite/10 bg-gray-50 shrink-0 flex flex-col gap-2">
                    {/* Пока в дивизионе не сыграно ни одного матча, убранный игрок удаляется
                        из заявки; после первого матча он уходит в «Отзаявленные» — на него
                        уже ссылаются протоколы. */}
                    {hasGames && (
                      <span className="text-[11px] text-graphite-light leading-snug">
                        В дивизионе уже сыграны матчи: убранные игроки не удаляются, а попадают в «Отзаявленные».
                      </span>
                    )}
                    <Button
                      onClick={handleSave}
                      isLoading={isSaving}
                      disabled={duplicateNumbers.size > 0}
                      className={`w-full transition-all ${
                        duplicateNumbers.size > 0
                          ? 'bg-graphite/20 border-graphite/20 text-graphite/50 cursor-not-allowed hover:bg-graphite/20 hover:border-graphite/20 hover:text-graphite/50'
                          : ''
                      }`}
                    >
                      {duplicateNumbers.size > 0 ? 'Исправьте дублирующиеся номера' : 'Сохранить состав заявки'}
                    </Button>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
