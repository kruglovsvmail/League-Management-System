import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom'; // Добавили импорт
import { Header } from '../components/Header';
import { Button } from '../ui/Button';
import { Table } from '../ui/Table2';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge'; 
import { Loader } from '../ui/Loader';
import { SegmentButton } from '../ui/SegmentButton';
import { getImageUrl, getToken } from '../utils/helpers';
import { AddMemberDrawer } from '../components/team-management/AddMemberDrawer';
import { PlayerAvatarModal } from '../modals/PlayerAvatarModal';
import { PlayerProfileModal } from '../modals/PlayerProfileModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { Toast } from '../modals/Toast';
import { MedicalDocsModal } from '../modals/MedicalDocsModal';
import dayjs from 'dayjs';

const POSITION_MAP = { 'goalie': 'Вратарь', 'defense': 'Защитник', 'forward': 'Нападающий' };

const ROLES = [
  { id: 'head_coach', label: 'Главный тренер' },
  { id: 'coach', label: 'Тренер' },
  { id: 'team_manager', label: 'Менеджер команды' },
  { id: 'team_admin', label: 'Администратор' }
];

export function TeamManagementPage() {
  // === НАСТРОЙКА URL-ПАРАМЕТРОВ И ХРАНИЛИЩА ===
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') || 'base';
  const appFilter = searchParams.get('filter') || 'current';
  const teamSearchQuery = searchParams.get('q') || '';

  const setActiveTab = (tab) => {
    setSearchParams(prev => { prev.set('tab', tab); return prev; }, { replace: true });
  };

  const setAppFilter = (filter) => {
    setSearchParams(prev => { prev.set('filter', filter); return prev; }, { replace: true });
  };

  const setTeamSearchQuery = (val) => {
    setSearchParams(prev => {
      if (val) prev.set('q', val);
      else prev.delete('q');
      return prev;
    }, { replace: true });
  };

  // Сохраняем выбранную команду в sessionStorage, чтобы не терять при F5
  const [selectedTeam, setSelectedTeamState] = useState(() => {
    const saved = sessionStorage.getItem('tm_selected_team_data');
    return saved ? JSON.parse(saved) : null;
  });

  const setSelectedTeam = (team) => {
    setSelectedTeamState(team);
    if (team) {
      sessionStorage.setItem('tm_selected_team_data', JSON.stringify(team));
    } else {
      sessionStorage.removeItem('tm_selected_team_data');
      setSearchParams(prev => {
        prev.delete('tab');
        prev.delete('filter');
        return prev;
      }, { replace: true });
    }
  };
  // ============================================

  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  
  const [base, setBase] = useState([]);
  const [roster, setRoster] = useState([]);
  const [staff, setStaff] = useState([]);
  
  const [applications, setApplications] = useState([]);
  const [isCreateAppDrawerOpen, setIsCreateAppDrawerOpen] = useState(false);
  const [availableLeagues, setAvailableLeagues] = useState([]);
  
  const [jerseyEdits, setJerseyEdits] = useState({});
  const [avatarModalUser, setAvatarModalUser] = useState(null);
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState(null);
  const [cacheBuster, setCacheBuster] = useState(Date.now());
  const [teamsList, setTeamsList] = useState([]);
  const [isSearchingTeams, setIsSearchingTeams] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, typeStr: null, actionArgs: null });
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastInfo, setToastInfo] = useState(null);

  const [appDocsModalPlayer, setAppDocsModalPlayer] = useState(null);
  const [isAppDocsSaving, setIsAppDocsSaving] = useState(false);

  const [addPlayerModalAppId, setAddPlayerModalAppId] = useState(null);
  const [isAddPlayerDrawerOpen, setIsAddPlayerDrawerOpen] = useState(false);

  const showToast = (title, message, type = 'error') => setToastInfo({ title, message, type });

  const formatDateToRU = (dateString) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  };

  const formatPhone = (phone) => {
    if (!phone) return '-';
    const cleaned = ('' + phone).replace(/\D/g, '');
    const match = cleaned.match(/^(7|8)?(\d{3})(\d{3})(\d{2})(\d{2})$/);
    if (match) return `+7 (${match[2]}) ${match[3]}-${match[4]}-${match[5]}`;
    return phone; 
  };

  const fetchMembers = async (teamId) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${teamId}/members`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) { setBase(data.base); setRoster(data.roster); setStaff(data.staff); setCacheBuster(Date.now()); }
    } catch (err) { console.error(err); }
  };

  const fetchApplications = async (teamId) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${teamId}/applications`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setApplications(data.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (selectedTeam) { fetchMembers(selectedTeam.id); fetchApplications(selectedTeam.id); }
  }, [selectedTeam]);

  useEffect(() => {
    if (!selectedTeam) {
      const fetchTeams = async () => {
        setIsSearchingTeams(true);
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/search?q=${teamSearchQuery}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
          const data = await res.json();
          if (data.success) setTeamsList(data.data);
        } catch (err) { console.error(err); } finally { setIsSearchingTeams(false); }
      };
      const timer = setTimeout(fetchTeams, 300);
      return () => clearTimeout(timer);
    }
  }, [teamSearchQuery, selectedTeam]);

  const duplicateJerseys = useMemo(() => {
    const counts = {};
    roster.forEach(r => {
      const num = jerseyEdits[r.user_id] !== undefined ? jerseyEdits[r.user_id] : r.jersey_number;
      if (num !== '' && num !== null) counts[num] = (counts[num] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter(num => counts[num] > 1).map(Number));
  }, [roster, jerseyEdits]);

  const autoSavePlayer = async (userId, overrides) => {
    const player = roster.find(r => r.user_id === userId);
    if (!player) return;
    setRoster(prev => prev.map(p => {
      if (p.user_id === userId) return { ...p, ...overrides };
      if (overrides.is_captain && p.is_captain) return { ...p, is_captain: false }; 
      return p;
    }));
    const payload = {
      userId, type: 'player', action: 'update',
      jerseyNumber: overrides.jersey_number !== undefined ? (overrides.jersey_number === '' ? null : Number(overrides.jersey_number)) : player.jersey_number,
      position: overrides.position !== undefined ? overrides.position : player.position,
      isCaptain: overrides.is_captain !== undefined ? overrides.is_captain : player.is_captain,
      isAssistant: overrides.is_assistant !== undefined ? overrides.is_assistant : player.is_assistant
    };
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) { showToast('Ошибка', data.error); fetchMembers(selectedTeam.id); return; }
      if (overrides.is_captain === true) {
        const oldC = roster.find(r => r.is_captain && r.user_id !== userId);
        if (oldC) await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/members`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
          body: JSON.stringify({ userId: oldC.user_id, type: 'player', action: 'update', jerseyNumber: oldC.jersey_number, position: oldC.position, isCaptain: false, isAssistant: oldC.is_assistant })
        });
      }
      fetchMembers(selectedTeam.id); 
    } catch (e) { showToast('Ошибка', 'Сбой сети'); fetchMembers(selectedTeam.id); }
  };

  const handleLetterClick = (userId, letter) => {
    const p = roster.find(r => r.user_id === userId);
    if (!p) return;
    if (letter === 'C') autoSavePlayer(userId, { is_captain: !p.is_captain, is_assistant: false });
    else if (letter === 'A') {
      if (p.is_assistant) autoSavePlayer(userId, { is_assistant: false });
      else {
        if (roster.filter(r => r.is_assistant).length >= 2) return; 
        autoSavePlayer(userId, { is_assistant: true, is_captain: false });
      }
    }
  };

  const toggleStaffRole = async (userId, roleId) => {
    const staffMem = staff.find(s => s.user_id === userId);
    const activeRoles = staffMem.roles ? staffMem.roles.split(', ') : [];
    const newRolesSet = new Set(activeRoles);
    if (newRolesSet.has(roleId)) newRolesSet.delete(roleId); else newRolesSet.add(roleId);
    const newRolesStr = [...newRolesSet].sort().join(', ');
    setStaff(prev => prev.map(s => s.user_id === userId ? { ...s, roles: newRolesStr } : s));
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ userId, type: 'staff', action: 'update', roles: newRolesStr ? newRolesStr.split(', ').filter(Boolean) : [] })
    });
    const data = await res.json();
    if (!data.success) showToast('Ошибка', data.error);
    fetchMembers(selectedTeam.id);
  };

  const requestRemove = (id, typeStr, extraArgs = null) => setConfirmDelete({ isOpen: true, id, typeStr, actionArgs: extraArgs });

  const confirmRemove = async () => {
    const { id, typeStr, actionArgs } = confirmDelete;
    if (!id || !typeStr) return;
    setIsDeleting(true);
    try {
      const token = getToken();
      if (['base', 'roster', 'staff'].includes(typeStr)) {
        let payload = {};
        if (typeStr === 'base') payload = { userId: id, type: 'base', action: 'remove_club' };
        else if (typeStr === 'roster') payload = { userId: id, type: 'player', action: 'remove' };
        else if (typeStr === 'staff') payload = { userId: id, type: 'staff', action: 'update', roles: [] };

        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) { fetchMembers(selectedTeam.id); showToast('Успешно', 'Участник удален', 'success'); } else showToast('Ошибка', data.error);
      } 
      else if (typeStr === 'application') {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/applications/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) { fetchApplications(selectedTeam.id); showToast('Успешно', 'Заявка удалена', 'success'); } else showToast('Ошибка', data.error);
      }
      else if (typeStr === 'app_roster') {
        const appId = actionArgs?.appId;
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/applications/${appId}/roster/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) { fetchApplications(selectedTeam.id); showToast('Успешно', 'Игрок удален из заявки', 'success'); } else showToast('Ошибка', data.error);
      }
    } catch (err) { showToast('Ошибка', 'Не удалось удалить'); } 
    finally { setIsDeleting(false); setConfirmDelete({ isOpen: false, id: null, typeStr: null, actionArgs: null }); }
  };

  const handlePhotoSave = async (file, isCleared) => {
    if (!avatarModalUser) return;
    setIsPhotoSaving(true);
    try {
      const url = `${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/members/${avatarModalUser.user_id}/photo`;
      if (file) {
        const fd = new FormData(); fd.append('file', file);
        await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: fd });
      } else if (isCleared) {
        await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` } });
      }
      fetchMembers(selectedTeam.id);
      fetchApplications(selectedTeam.id); 
      setAvatarModalUser(null);
      showToast('Успешно', 'Фото обновлено', 'success');
    } catch (err) { showToast('Ошибка', 'Не удалось сохранить фото'); } finally { setIsPhotoSaving(false); }
  };

  const getRenderPhoto = (r) => `${getImageUrl(r.photo_url || r.avatar_url || r.user_avatar_url || r.team_member_photo_url || '/default/user_default.webp')}?t=${cacheBuster}`;

  // --- МЕТОДЫ ЗАЯВОК В ЛИГУ ---

  const handleCreateApplicationOpen = async () => {
    setIsCreateAppDrawerOpen(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/available-divisions`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setAvailableLeagues(data.data);
    } catch (err) { console.error(err); }
  };

  const handleSendAppReview = async (appId) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/applications/${appId}/send-review`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) { fetchApplications(selectedTeam.id); showToast('Успешно', 'Заявка отправлена', 'success'); } else showToast('Ошибка', data.error);
    } catch (err) { showToast('Ошибка', 'Сбой сети'); }
  };

  const handleAppDocsSave = async ({ medFile, medCleared, medExp, insFile, insCleared, insExp }) => {
    if (!appDocsModalPlayer) return;
    setIsAppDocsSaving(true);
    const formData = new FormData();
    if (insFile) formData.append('insurance', insFile); if (insCleared) formData.append('insurance_cleared', 'true');
    if (medFile) formData.append('medical', medFile); if (medCleared) formData.append('medical_cleared', 'true');
    if (insExp !== undefined) formData.append('insurance_expires_at', insExp);
    if (medExp !== undefined) formData.append('medical_expires_at', medExp);
    formData.append('player_id', appDocsModalPlayer.player_id);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-rosters/${appDocsModalPlayer.id}/docs`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: formData });
      const data = await res.json();
      if (data.success) { fetchApplications(selectedTeam.id); showToast('Успешно', 'Документы загружены', 'success'); setAppDocsModalPlayer(null); } else showToast('Ошибка', data.error);
    } catch (err) { showToast('Ошибка', 'Сбой загрузки'); } finally { setIsAppDocsSaving(false); }
  };

  const handleUpdateAppPlayerInline = async (appId, rosterId, overrides) => {
    setApplications(prev => prev.map(app => {
      if (app.id !== appId) return app;
      return {
        ...app,
        roster: app.roster.map(r => {
          if (r.id !== rosterId) {
            if (overrides.is_captain && r.is_captain) return { ...r, is_captain: false };
            return r;
          }
          return { ...r, ...overrides };
        })
      };
    }));
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-rosters/${rosterId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify(overrides)
      });
      const data = await res.json();
      if (!data.success) showToast('Ошибка', data.error);
      fetchApplications(selectedTeam.id);
    } catch (err) { showToast('Ошибка', 'Не удалось сохранить'); fetchApplications(selectedTeam.id); }
  };

  const displayedApplications = useMemo(() => {
    const now = dayjs();
    return applications.filter(app => {
      const isPast = app.division_end_date && dayjs(app.division_end_date).isBefore(now);
      return appFilter === 'current' ? !isPast : isPast;
    });
  }, [applications, appFilter]);

  const baseColumns = [
    { label: '№', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Фото', width: 'w-[60px]', render: (r) => ( <div onClick={() => setAvatarModalUser(r)} className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10 cursor-pointer"><img src={getRenderPhoto(r)} className="w-full h-full object-cover" /></div> )},
    { label: 'ФИО', sortKey: 'last_name', render: (r) => ( <div onClick={() => setProfileModalUserId(r.user_id)} className="cursor-pointer group"><span className="font-bold text-[14px] leading-tight block truncate group-hover:text-orange">{r.last_name} {r.first_name}</span>{r.middle_name && <span className="text-[12px] text-graphite-light block truncate">{r.middle_name}</span>}</div> )},
    { label: 'ID', sortKey: 'member_id', width: 'w-[70px]', render: (r) => <span className="text-[12px] text-graphite/50 font-mono" title="ID в базе данных">{r.member_id}</span> },
    { label: 'Телефон', sortKey: 'phone', width: 'w-[160px]', render: (r) => <span className="text-[13px]">{formatPhone(r.phone)}</span> },
    { label: '', width: 'w-[50px] text-right', render: (r) => ( <button onClick={() => requestRemove(r.user_id, 'base')} className="text-status-rejected w-8 h-8 hover:bg-status-rejected/10 rounded">×</button> )}
  ];

  const rosterColumns = [
    { label: '№', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Фото', width: 'w-[60px]', render: (r) => ( <div onClick={() => setAvatarModalUser(r)} className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10 cursor-pointer"><img src={getRenderPhoto(r)} className="w-full h-full object-cover" /></div> )},
    { label: 'ФИО', sortKey: 'last_name', render: (r) => ( <div onClick={() => setProfileModalUserId(r.user_id)} className="cursor-pointer group"><span className="font-bold text-[14px] leading-tight block truncate group-hover:text-orange">{r.last_name} {r.first_name}</span>{r.middle_name && <span className="text-[12px] text-graphite-light block truncate">{r.middle_name}</span>}</div> )},
    { label: 'ID', sortKey: 'roster_id', width: 'w-[70px]', render: (r) => <span className="text-[12px] text-graphite/50 font-mono" title="ID в базе данных">{r.roster_id}</span> },
    { label: 'Амплуа', sortKey: 'position', width: 'w-[140px]', render: (r) => ( <Select options={['Вратарь', 'Защитник', 'Нападающий']} value={POSITION_MAP[r.position]} onChange={(val) => { const newPos = Object.keys(POSITION_MAP).find(k => POSITION_MAP[k] === val); if (newPos && newPos !== r.position) autoSavePlayer(r.user_id, { position: newPos }); }} className="h-8 pl-3 pr-2 bg-white border border-graphite/20" /> )},
    { label: 'Номер', sortKey: 'jersey_number', width: 'w-[80px]', render: (r) => {
      const currentNum = jerseyEdits[r.user_id] !== undefined ? jerseyEdits[r.user_id] : (r.jersey_number || '');
      const isConflict = duplicateJerseys.has(Number(currentNum)) && currentNum !== '';
      return ( <Input value={currentNum} maxLength={2} hasError={isConflict} className="w-14 h-8 text-center font-black bg-white border border-graphite/20" onChange={(e) => setJerseyEdits(prev => ({ ...prev, [r.user_id]: e.target.value.replace(/\D/g, '') }))} onBlur={() => { const typed = jerseyEdits[r.user_id]; if (typed !== undefined && typed !== String(r.jersey_number || '')) { if (typed !== '' && duplicateJerseys.has(Number(typed))) { showToast('Занят', `Номер ${typed} уже используется`); setJerseyEdits(prev => { const n = {...prev}; delete n[r.user_id]; return n; }); return; } autoSavePlayer(r.user_id, { jersey_number: typed }); setJerseyEdits(prev => { const n = {...prev}; delete n[r.user_id]; return n; }); }}} /> );
    }},
    { label: 'Нашивки', sortKey: 'is_captain', width: 'w-[100px]', render: (r) => { const canAddA = r.is_assistant || roster.filter(p => p.is_assistant).length < 2; return ( <div className="flex gap-1.5"><button onClick={() => handleLetterClick(r.user_id, 'C')} className={`w-7 h-7 rounded text-[12px] font-black border ${r.is_captain ? 'bg-orange text-white border-orange' : 'text-graphite/40 border-graphite/20'}`}>C</button><button onClick={() => handleLetterClick(r.user_id, 'A')} disabled={!canAddA && !r.is_assistant} className={`w-7 h-7 rounded text-[12px] font-black border ${r.is_assistant ? 'bg-status-accepted text-white border-status-accepted' : 'text-graphite/40 border-graphite/20'}`}>A</button></div> ); }},
    { label: '', width: 'w-[50px] text-right', render: (r) => ( <button onClick={() => requestRemove(r.user_id, 'roster')} className="text-status-rejected w-8 h-8 hover:bg-status-rejected/10 rounded">×</button> )}
  ];

  const staffColumns = [
    { label: '№', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Фото', width: 'w-[60px]', render: (r) => ( <div onClick={() => setAvatarModalUser(r)} className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10 cursor-pointer"><img src={getRenderPhoto(r)} className="w-full h-full object-cover" /></div> )},
    { label: 'ФИО', sortKey: 'last_name', render: (r) => ( <div onClick={() => setProfileModalUserId(r.user_id)} className="cursor-pointer group"><span className="font-bold text-[14px] leading-tight block truncate group-hover:text-orange">{r.last_name} {r.first_name}</span>{r.middle_name && <span className="text-[12px] text-graphite-light block truncate">{r.middle_name}</span>}</div> )},
    { label: 'ID', sortKey: 'member_id', width: 'w-[70px]', render: (r) => <span className="text-[12px] text-graphite/50 font-mono" title="ID в базе данных">{r.member_id}</span> },
    { label: 'Роли', sortKey: 'roles', render: (r) => { const activeRoles = r.roles ? r.roles.split(', ') : []; return ( <div className="flex flex-wrap gap-1.5 min-w-[250px]">{ROLES.map(role => ( <span key={role.id} onClick={() => toggleStaffRole(r.user_id, role.id)} className={`cursor-pointer px-2 py-1 text-[11px] font-bold uppercase rounded border ${activeRoles.includes(role.id) ? 'bg-orange/10 border-orange text-orange' : 'text-graphite/50 border-graphite/20'}`}>{role.label}</span> ))}</div> ); }},
    { label: '', width: 'w-[50px] text-right', render: (r) => ( <button onClick={() => requestRemove(r.user_id, 'staff')} className="text-status-rejected w-8 h-8 hover:bg-status-rejected/10 rounded">×</button> )}
  ];

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header title="Управление командой" subtitle={selectedTeam && ( <button onClick={() => setSelectedTeam(null)} className="flex items-center gap-2 text-[15px] font-bold text-graphite-light hover:text-orange">←  Вернуться к выбору команды</button> )} />

      <div className="flex items-start px-10 pt-8 gap-8 relative z-10">
        {selectedTeam && (
          <div className="w-[260px] shrink-0 sticky top-[128px] bg-white/30 backdrop-blur-md rounded-2xl p-4 flex flex-col gap-2 shadow-sm border border-white/50 animate-fade-in">
            <div className="flex flex-col items-center mb-4 text-center">
              <img src={getImageUrl(selectedTeam.logo_url) || '/default/Logo_team_default.webp'} className="w-16 h-16 object-contain mb-3" />
              <span className="font-black text-[16px] leading-tight">{selectedTeam.name}</span>
              {selectedTeam.city && <span className="text-[12px] font-bold text-graphite-light mt-1">{selectedTeam.city}</span>}
            </div>
            {['base', 'roster', 'staff', 'tournaments'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === tab ? 'bg-white text-orange shadow-sm' : 'text-graphite-light hover:bg-white/40'}`}>
                {tab === 'base' ? 'База команды' : tab === 'roster' ? 'Игровой состав' : tab === 'staff' ? 'Персонал (Штаб)' : 'Заявки в лигу'}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 relative z-10 min-h-[500px]">
          {!selectedTeam ? (
            <div className="bg-white/40 border border-graphite/10 rounded-xxl p-8 animate-fade-in-down">
              <Input placeholder="Поиск команды..." value={teamSearchQuery} onChange={(e) => setTeamSearchQuery(e.target.value)} />
              {isSearchingTeams ? <Loader text="Поиск..." /> : (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-5 mt-6">
                  {teamsList.map(t => (
                    <div key={t.id} onClick={() => setSelectedTeam(t)} className="flex items-center gap-4 p-5 bg-white rounded-xl border cursor-pointer hover:border-orange shadow-sm group">
                      <img src={getImageUrl(t.logo_url) || '/default/Logo_team_default.webp'} className="w-12 h-12 object-contain" />
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold group-hover:text-orange truncate">{t.name}</span>
                        <span className="text-[12px] text-graphite-light mt-1 truncate">{t.city || 'Город не указан'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Основной контейнер-шапка */}
              <div className={`bg-white/85 rounded-xxl shadow-sm border border-graphite/10 p-8 animate-fade-in-down ${activeTab === 'tournaments' ? 'mb-6' : ''}`}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-black text-graphite uppercase tracking-wide">
                    {activeTab === 'base' ? 'База команды' : activeTab === 'roster' ? 'Игровой состав' : activeTab === 'staff' ? 'Штаб команды' : 'Заявки в лигу'}
                  </h3>
                  
                  {activeTab !== 'tournaments' && (
                    <Button onClick={() => setIsAddDrawerOpen(true)}>+ Добавить {activeTab === 'base' ? '' : ''}</Button>
                  )}

                  {activeTab === 'tournaments' && (
                    <div className="flex items-center gap-5">
                      <div className="w-[200px]">
                        <SegmentButton options={['Текущие', 'Прошедшие']} defaultIndex={appFilter === 'current' ? 0 : 1} onChange={(idx) => setAppFilter(idx === 0 ? 'current' : 'past')} />
                      </div>
                      <Button onClick={handleCreateApplicationOpen}>+ Создать заявку</Button>
                    </div>
                  )}
                </div>

                {activeTab === 'base' && <Table columns={baseColumns} data={base} />}
                {activeTab === 'roster' && <Table columns={rosterColumns} data={roster} />}
                {activeTab === 'staff' && <Table columns={staffColumns} data={staff} />}
              </div>

              {/* Карточки заявок вне белого контейнера */}
              {activeTab === 'tournaments' && (
                <div className="flex flex-col gap-5 animate-fade-in-down">
                  {displayedApplications.length > 0 ? displayedApplications.map(app => (
                    <ApplicationCard 
                      key={app.id} app={app} getRenderPhoto={getRenderPhoto} showToast={showToast}
                      onSendReview={() => handleSendAppReview(app.id)}
                      onDeleteApp={() => requestRemove(app.id, 'application')}
                      onDeletePlayer={(rosterId) => requestRemove(rosterId, 'app_roster', { appId: app.id })}
                      onOpenDocs={(player) => setAppDocsModalPlayer({ ...player, appStatus: app.status })}
                      onAddPlayer={() => { setAddPlayerModalAppId(app.id); setIsAddPlayerDrawerOpen(true); }}
                      onOpenProfile={(id) => setProfileModalUserId(id)}
                      onUpdatePlayer={(rosterId, overrides) => handleUpdateAppPlayerInline(app.id, rosterId, overrides)}
                    />
                  )) : <div className="text-center py-10 text-graphite-light bg-white/40 border border-graphite/10 rounded-xl">Заявок не найдено</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AddMemberDrawer isOpen={isAddDrawerOpen} onClose={() => setIsAddDrawerOpen(false)} teamId={selectedTeam?.id} type={activeTab} onSuccess={() => fetchMembers(selectedTeam.id)} roster={roster} staff={staff} base={base} />
      <PlayerAvatarModal isOpen={!!avatarModalUser} onClose={() => setAvatarModalUser(null)} initialAvatar={avatarModalUser ? getRenderPhoto(avatarModalUser) : null} onSave={handlePhotoSave} isSaving={isPhotoSaving} />
      <PlayerProfileModal isOpen={!!profileModalUserId} onClose={() => setProfileModalUserId(null)} playerId={profileModalUserId} />
      <ConfirmModal isOpen={confirmDelete.isOpen} onClose={() => setConfirmDelete({ isOpen: false, id: null, typeStr: null, actionArgs: null })} onConfirm={confirmRemove} isLoading={isDeleting} />
      
      <MedicalDocsModal 
        isOpen={!!appDocsModalPlayer} 
        onClose={() => setAppDocsModalPlayer(null)} 
        initialMed={appDocsModalPlayer?.medical_url ? getImageUrl(appDocsModalPlayer.medical_url) : null} 
        initialIns={appDocsModalPlayer?.insurance_url ? getImageUrl(appDocsModalPlayer.insurance_url) : null} 
        initialMedExp={appDocsModalPlayer?.medical_expires_at} 
        initialInsExp={appDocsModalPlayer?.insurance_expires_at} 
        onSave={handleAppDocsSave} 
        isSaving={isAppDocsSaving} 
        readOnly={['pending', 'approved', 'rejected'].includes(appDocsModalPlayer?.appStatus)}
      />
      
      {toastInfo && <Toast title={toastInfo.title} message={toastInfo.message} type={toastInfo.type} onClose={() => setToastInfo(null)} />}

      <CreateApplicationDrawer isOpen={isCreateAppDrawerOpen} onClose={() => setIsCreateAppDrawerOpen(false)} leagues={availableLeagues} roster={roster} teamId={selectedTeam?.id} onSuccess={() => { fetchApplications(selectedTeam?.id); setIsCreateAppDrawerOpen(false); showToast('Успешно', 'Заявка создана', 'success'); }} showToast={showToast} />
      <AddAppPlayerDrawer isOpen={isAddPlayerDrawerOpen} onClose={() => { setIsAddPlayerDrawerOpen(false); setAddPlayerModalAppId(null); }} roster={roster} teamId={selectedTeam?.id} appId={addPlayerModalAppId} currentAppRoster={applications.find(a => a.id === addPlayerModalAppId)?.roster || []} onSuccess={() => { fetchApplications(selectedTeam?.id); setIsAddPlayerDrawerOpen(false); showToast('Успешно', 'Игроки добавлены', 'success'); }} showToast={showToast} />
    </div>
  );
}

// ==========================================
// КОМПОНЕНТ КАРТОЧКИ ЗАЯВКИ
// ==========================================
function ApplicationCard({ app, getRenderPhoto, showToast, onSendReview, onDeleteApp, onDeletePlayer, onOpenDocs, onAddPlayer, onOpenProfile, onUpdatePlayer }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [jerseyEdits, setJerseyEdits] = useState({});

  const canDeleteApp = app.status === 'draft' || app.status === 'rejected';
  const canEditRoster = app.status === 'draft' || app.status === 'revision';

  const statusMap = {
    'draft': { text: 'Кнопка', btn: true },
    'revision': { text: 'Кнопка', btn: true },
    'pending': { text: 'Проверяется лигой', style: 'text-orange bg-orange/10' },
    'approved': { text: 'Допущена лигой', style: 'text-status-accepted bg-status-accepted/10' },
    'rejected': { text: 'Отклонена лигой', style: 'text-status-rejected bg-status-rejected/10' }
  };
  const statusInfo = statusMap[app.status] || statusMap['draft'];

  const duplicateJerseys = useMemo(() => {
    const counts = {};
    (app.roster || []).forEach(r => {
      const num = jerseyEdits[r.id] !== undefined ? jerseyEdits[r.id] : r.jersey_number;
      if (num !== '' && num !== null) counts[num] = (counts[num] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter(num => counts[num] > 1).map(Number));
  }, [app.roster, jerseyEdits]);

  const columns = [
    { label: '№', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Фото', width: 'w-[50px]', render: (r) => ( <div className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10"><img src={getRenderPhoto(r)} className="w-full h-full object-cover" /></div> )},
    { label: 'ФИО', sortKey: 'last_name', render: (r) => ( <div onClick={() => onOpenProfile(r.player_id)} className="cursor-pointer group"><span className="font-bold text-[14px] leading-tight block truncate group-hover:text-orange">{r.last_name} {r.first_name}</span>{r.middle_name && <span className="text-[12px] text-graphite-light block truncate">{r.middle_name}</span>}</div> )},
    { label: 'ID', sortKey: 'id', width: 'w-[60px]', render: (r) => <span className="text-[12px] text-graphite/50 font-mono" title="ID в базе данных">{r.id}</span> },
    { label: 'Амплуа', sortKey: 'position', width: 'w-[130px]', render: (r) => (
      canEditRoster 
        ? <Select options={['Вратарь', 'Защитник', 'Нападающий']} value={POSITION_MAP[r.position]} onChange={(val) => { const newPos = Object.keys(POSITION_MAP).find(k => POSITION_MAP[k] === val); if (newPos && newPos !== r.position) onUpdatePlayer(r.id, { position: newPos }); }} className="h-8 pl-3 pr-2 bg-white border border-graphite/20" /> 
        : <span className="text-[13px]">{POSITION_MAP[r.position] || '-'}</span>
    )},
    { label: 'Номер', sortKey: 'jersey_number', width: 'w-[70px]', render: (r) => {
      if (!canEditRoster) return <span className="font-black text-[14px] ml-4">{r.jersey_number || '-'}</span>;
      const currentNum = jerseyEdits[r.id] !== undefined ? jerseyEdits[r.id] : (r.jersey_number || '');
      const isConflict = duplicateJerseys.has(Number(currentNum)) && currentNum !== '';
      return ( <Input value={currentNum} maxLength={2} hasError={isConflict} className="w-14 h-8 text-center font-black bg-white border border-graphite/20" onChange={(e) => setJerseyEdits(prev => ({ ...prev, [r.id]: e.target.value.replace(/\D/g, '') }))} onBlur={() => { const typed = jerseyEdits[r.id]; if (typed !== undefined && typed !== String(r.jersey_number || '')) { if (typed !== '' && duplicateJerseys.has(Number(typed))) { showToast('Занят', `Номер ${typed} уже используется`); setJerseyEdits(prev => { const n = {...prev}; delete n[r.id]; return n; }); return; } onUpdatePlayer(r.id, { jersey_number: typed === '' ? null : Number(typed) }); setJerseyEdits(prev => { const n = {...prev}; delete n[r.id]; return n; }); }}} /> );
    }},
    { label: 'Нашивки', sortKey: 'is_captain', width: 'w-[90px]', render: (r) => { 
      if (!canEditRoster) {
        return ( <div className="flex gap-1.5">{r.is_captain && <span className="w-6 h-6 flex items-center justify-center bg-orange text-white text-[10px] font-black rounded">C</span>}{r.is_assistant && <span className="w-6 h-6 flex items-center justify-center bg-status-accepted text-white text-[10px] font-black rounded">A</span>}</div> );
      }
      const canAddA = r.is_assistant || (app.roster || []).filter(p => p.is_assistant).length < 2; 
      return ( <div className="flex gap-1.5"><button onClick={() => onUpdatePlayer(r.id, { is_captain: !r.is_captain, is_assistant: false })} className={`w-7 h-7 rounded text-[12px] font-black border ${r.is_captain ? 'bg-orange text-white border-orange' : 'text-graphite/40 border-graphite/20'}`}>C</button><button onClick={() => { if (r.is_assistant) onUpdatePlayer(r.id, { is_assistant: false }); else onUpdatePlayer(r.id, { is_assistant: true, is_captain: false }); }} disabled={!canAddA && !r.is_assistant} className={`w-7 h-7 rounded text-[12px] font-black border ${r.is_assistant ? 'bg-status-accepted text-white border-status-accepted' : 'text-graphite/40 border-graphite/20'}`}>A</button></div> ); 
    }},
    { label: 'Документы', width: 'w-[100px]', render: (r) => { 
      const hasMed = !!r.medical_url;
      const hasIns = !!r.insurance_url;

      let type = 'empty';
      let text = 'Док.';

      if (hasMed && hasIns) type = 'filled';
      else if (hasMed || hasIns) type = 'half';

      const today = dayjs().startOf('day');
      let isExpired = false;
      let minDaysLeft = Infinity;

      const checkExp = (expDateStr) => {
        if (!expDateStr) return;
        const expDate = dayjs(expDateStr).startOf('day');
        const daysLeft = expDate.diff(today, 'day');

        if (daysLeft < 0) {
          isExpired = true;
        } else if (daysLeft <= 7) {
          if (daysLeft < minDaysLeft) minDaysLeft = daysLeft;
        }
      };

      if (hasMed) checkExp(r.medical_expires_at);
      if (hasIns) checkExp(r.insurance_expires_at);

      if (isExpired) {
        type = 'expired';
        text = 'Истек';
      } else if (minDaysLeft <= 7) {
        type = 'expiring';
        text = `${minDaysLeft} дн.`;
      }

      return (
        <div onClick={() => onOpenDocs(r)} className="cursor-pointer inline-block hover:scale-105">
          <Badge label={text} type={type} />
        </div>
      );
    }},
    { label: 'Допуск', sortKey: 'application_status', width: 'w-[100px]', render: (r) => ( <Badge label={r.application_status === 'approved' ? 'Доп.' : 'Не доп.'} type={r.application_status === 'approved' ? 'filled' : 'empty'} /> )},
  ];

  if (canEditRoster) columns.push({ label: '', width: 'w-[40px]', align: 'right', render: (r) => ( <button onClick={() => onDeletePlayer(r.id)} className="text-status-rejected w-8 h-8 hover:bg-status-rejected/10 rounded">×</button> ) });

  return (
    <div className="bg-white/70 border border-graphite/10 rounded-xxl shadow-sm hover:shadow-md transition-shadow">
      
      {/* КЛАСС relative ДОБАВЛЕН ЗДЕСЬ ДЛЯ АБСОЛЮТНОГО ПОЗИЦИОНИРОВАНИЯ ЦЕНТРА */}
      <div className="p-5 flex items-center justify-between cursor-pointer group relative" onClick={() => setIsExpanded(!isExpanded)}>
        
        {/* ЛЕВЫЙ БЛОК */}
        <div className="flex items-center gap-4 w-[700px] relative z-10">
          <img src={getImageUrl(app.league_logo) || '/default/Logo_division_default.webp'} className="w-12 h-12 object-contain bg-graphite/5 rounded-lg p-1" />
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-orange uppercase tracking-wider">{app.season_name}</span>
            <span className="font-black text-[16px] text-graphite">{app.league_name}</span>
            <span className="text-[13px] text-graphite-light font-medium">{app.division_name}</span>
          </div>
        </div>
        
        {/* ЦЕНТРАЛЬНЫЙ БЛОК (Абсолютно по центру, не зависит от кнопок) */}
        <div className="absolute left-3/4 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex justify-center items-center">
          {statusInfo.btn ? ( 
            <Button onClick={(e) => { e.stopPropagation(); onSendReview(); }} className="h-9 text-[13px]">Отправить</Button> 
          ) : ( 
            <div className={`px-4 py-2 rounded-lg font-bold text-[13px] ${statusInfo.style}`}>{statusInfo.text}</div> 
          )}
        </div>
        
        {/* ПРАВЫЙ БЛОК С КНОПКАМИ */}
        <div className="flex items-center gap-3 shrink-0 ml-auto justify-end relative z-10">
          {canDeleteApp && ( 
            <button onClick={(e) => { e.stopPropagation(); onDeleteApp(); }} className="w-12 h-12 rounded-lg flex items-center justify-center bg-status-rejected/10 text-status-rejected hover:bg-status-rejected hover:text-white transition-colors" title="Удалить заявку">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button> 
          )}
          
          {canDeleteApp && <div className="w-px h-10 bg-graphite/20 mx-1 hidden md:block"></div>}
          
          {/* Исправил опечатку с двойным group-hover в твоем коде */}
          <button 
            className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-300 ${isExpanded ? 'text-orange bg-orange/5' : 'text-graphite/40 group-hover:text-orange group-hover:bg-orange/5'}`}
          >
            <svg className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>
      </div>

      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="p-5 bg-graphite/[0.02] border-t border-graphite/10">
            <Table columns={columns} data={app.roster || []} />
            {canEditRoster && ( <div className="mt-4 flex justify-end"><Button onClick={onAddPlayer}>+ Добавить игрока</Button></div> )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ШТОРКА СОЗДАНИЯ НОВОЙ ЗАЯВКИ
// ==========================================
function CreateApplicationDrawer({ isOpen, onClose, leagues, roster, teamId, onSuccess, showToast }) {
  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const [selectedDivisionId, setSelectedDivisionId] = useState(null);
  const [selectedPlayers, setSelectedPlayers] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { if (!isOpen) { setSelectedLeagueId(null); setSelectedDivisionId(null); setSelectedPlayers(new Set()); } }, [isOpen]);

  const activeLeague = leagues.find(l => l.league_id === selectedLeagueId);
  const divisions = activeLeague ? activeLeague.divisions : [];
  
  const togglePlayer = (id) => { const next = new Set(selectedPlayers); if (next.has(id)) next.delete(id); else next.add(id); setSelectedPlayers(next); };

  const handleSave = async () => {
    if (!selectedDivisionId || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${teamId}/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ divisionId: selectedDivisionId, playerIds: Array.from(selectedPlayers) }) });
      const data = await res.json();
      if (data.success) onSuccess(); else showToast('Ошибка', data.error);
    } catch (err) { showToast('Ошибка сети', 'Не удалось связаться с сервером'); }
    setIsSaving(false);
  };

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-[800px] bg-white transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-8 py-6 border-b border-graphite/10 bg-white shrink-0"><h2 className="font-black text-2xl text-graphite uppercase tracking-wide">Создать заявку</h2><button onClick={onClose} className="text-graphite-light hover:text-orange"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div>
        <div className="p-8 flex flex-col flex-1 overflow-hidden bg-gray-50/50">
          <div className="flex gap-6 mb-8 shrink-0">
            <div className="flex-1"><label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide mb-2 block">Выберите лигу</label><Select options={leagues.map(l => l.league_name)} value={activeLeague?.league_name || ''} onChange={(val) => { const l = leagues.find(x => x.league_name === val); setSelectedLeagueId(l?.league_id); setSelectedDivisionId(null); }} /></div>
            <div className="flex-1"><label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide mb-2 block">Выберите дивизион</label><Select options={divisions.map(d => d.name)} value={divisions.find(d => d.id === selectedDivisionId)?.name || ''} onChange={(val) => { const d = divisions.find(x => x.name === val); setSelectedDivisionId(d?.id); }} disabled={!selectedLeagueId} /></div>
          </div>
          <div className="flex-1 flex gap-6 overflow-hidden">
            <div className="flex-1 flex flex-col bg-white border border-graphite/10 rounded-2xl overflow-hidden"><div className="p-4 bg-graphite/5 border-b border-graphite/10 font-bold text-[13px] text-graphite-light">Игровой состав ({roster.length})</div><div className="flex-1 overflow-y-auto p-2 custom-scrollbar">{roster.map(r => (<div key={r.user_id} className="flex items-center justify-between p-3 border-b border-graphite/5 hover:bg-orange/5"><div className="flex items-center gap-3"><img src={getImageUrl(r.photo_url || r.avatar_url || '/default/user_default.webp')} className="w-8 h-8 rounded-lg object-cover" /><span className="text-[13px] font-semibold">{r.last_name} {r.first_name}</span></div>{!selectedPlayers.has(r.user_id) && <button onClick={() => togglePlayer(r.user_id)} className="text-orange font-bold text-[12px] bg-orange/10 px-3 py-1 rounded hover:bg-orange hover:text-white">→</button>}</div>))}</div></div>
            <div className="flex-1 flex flex-col bg-white border border-orange/30 rounded-2xl overflow-hidden shadow-[0_0_15px_rgba(255,122,0,0.05)]"><div className="p-4 bg-orange/10 border-b border-orange/20 font-bold text-[13px] text-orange">В заявку ({selectedPlayers.size})</div><div className="flex-1 overflow-y-auto p-2 custom-scrollbar">{roster.filter(r => selectedPlayers.has(r.user_id)).map(r => (<div key={r.user_id} className="flex items-center justify-between p-3 border-b border-graphite/5"><div className="flex items-center gap-3"><img src={getImageUrl(r.photo_url || r.avatar_url || '/default/user_default.webp')} className="w-8 h-8 rounded-lg object-cover" /><span className="text-[13px] font-semibold">{r.last_name} {r.first_name}</span></div><button onClick={() => togglePlayer(r.user_id)} className="text-status-rejected font-bold text-[12px] bg-status-rejected/10 px-3 py-1 rounded hover:bg-status-rejected hover:text-white">✕</button></div>))}</div></div>
          </div>
        </div>
        <div className="p-6 bg-white border-t border-graphite/10 shrink-0"><Button onClick={handleSave} isLoading={isSaving} disabled={!selectedDivisionId || isSaving} className="w-full py-4 text-[16px]">Создать заявку</Button></div>
      </div>
    </div>
  );
}

// ==========================================
// ШТОРКА ДОБАВЛЕНИЯ ИГРОКОВ В СУЩЕСТВУЮЩУЮ ЗАЯВКУ
// ==========================================
function AddAppPlayerDrawer({ isOpen, onClose, roster, teamId, appId, currentAppRoster, onSuccess, showToast }) {
  const [query, setQuery] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { if (!isOpen) { setQuery(''); setSelectedPlayers(new Set()); } }, [isOpen]);

  let availableRoster = roster.filter(r => !currentAppRoster.some(cr => cr.player_id === r.user_id));
  if (query) {
    const q = query.toLowerCase();
    availableRoster = availableRoster.filter(u => u.last_name.toLowerCase().includes(q) || u.first_name.toLowerCase().includes(q));
  }

  const handleSave = async () => {
    if (selectedPlayers.size === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${teamId}/applications/${appId}/roster`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ playerIds: Array.from(selectedPlayers) }) });
      const data = await res.json();
      if (data.success) onSuccess(); else showToast('Ошибка', data.error);
    } catch (err) { showToast('Ошибка сети', 'Сбой связи с сервером'); }
    setIsSaving(false);
  };

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-[450px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Добавить в заявку</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>

        <div className="p-6 bg-white border-b border-graphite/5 shrink-0">
          <Input placeholder="Поиск по фамилии или имени..." value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <p className="text-[11px] text-graphite-light mt-2 px-1">Поиск только среди Игрового состава команды</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-2">
          {availableRoster.map(r => {
            const isSelected = selectedPlayers.has(r.user_id);
            return (
              <div key={r.user_id} onClick={() => { const s = new Set(selectedPlayers); if(s.has(r.user_id)) s.delete(r.user_id); else s.add(r.user_id); setSelectedPlayers(s); }} className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-orange/10 border-orange shadow-sm' : 'bg-white border-graphite/10 hover:border-orange'}`}>
                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-orange border-orange text-white' : 'border-graphite/30'}`}>{isSelected && '✓'}</div>
                <img src={getImageUrl(r.photo_url || r.avatar_url || '/default/user_default.webp')} className="w-10 h-10 object-cover rounded-lg bg-graphite/5" alt="avatar" />
                <span className="block font-bold text-graphite text-[14px]">{r.last_name} {r.first_name}</span>
              </div>
            );
          })}
          {availableRoster.length === 0 && !query && <div className="text-center text-graphite-light mt-10">Все игроки уже в заявке или игровой состав пуст.</div>}
        </div>

        <div className="p-6 bg-white border-t border-graphite/10 shrink-0">
          <Button onClick={handleSave} disabled={selectedPlayers.size === 0 || isSaving} className="w-full py-3">Добавить ({selectedPlayers.size})</Button>
        </div>
      </div>
    </div>
  );
}