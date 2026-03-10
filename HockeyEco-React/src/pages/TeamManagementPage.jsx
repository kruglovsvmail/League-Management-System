import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/Header';
import { Button } from '../ui/Button';
import { Table } from '../ui/Table2';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge'; 
import { Loader } from '../ui/Loader';
import { getImageUrl, setExpiringStorage, getExpiringStorage, getToken } from '../utils/helpers';
import { AddMemberDrawer } from '../components/team-management/AddMemberDrawer';
import { PlayerAvatarModal } from '../modals/PlayerAvatarModal';
import { PlayerProfileModal } from '../modals/PlayerProfileModal';

const POSITION_MAP = { 'goalie': 'Вратарь', 'defense': 'Защитник', 'forward': 'Нападающий' };

const ROLES = [
  { id: 'head_coach', label: 'Главный тренер' },
  { id: 'coach', label: 'Тренер' },
  { id: 'team_manager', label: 'Менеджер команды' },
  { id: 'team_admin', label: 'Администратор' }
];

export function TeamManagementPage() {
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [activeTab, setActiveTab] = useState('base'); 
  
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  
  const [base, setBase] = useState([]);
  const [roster, setRoster] = useState([]);
  const [staff, setStaff] = useState([]);
  
  const [localEdits, setLocalEdits] = useState({});
  const [localRemovals, setLocalRemovals] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const [avatarModalUser, setAvatarModalUser] = useState(null);
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState(null);
  const [cacheBuster, setCacheBuster] = useState(Date.now());

  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [teamsList, setTeamsList] = useState([]);
  const [isSearchingTeams, setIsSearchingTeams] = useState(false);

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
      const token = getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${teamId}/members`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setBase(data.base);
        setRoster(data.roster);
        setStaff(data.staff);
        setLocalEdits({}); 
        setLocalRemovals(new Set());
        setCacheBuster(Date.now());
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (selectedTeam) fetchMembers(selectedTeam.id);
  }, [selectedTeam]);

  useEffect(() => {
    if (!selectedTeam) {
      const fetchTeams = async () => {
        setIsSearchingTeams(true);
        try {
          const token = getToken();
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/search?q=${teamSearchQuery}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.success) setTeamsList(data.data);
        } catch (err) { console.error(err); }
        finally { setIsSearchingTeams(false); }
      };
      
      const timer = setTimeout(fetchTeams, 300);
      return () => clearTimeout(timer);
    }
  }, [teamSearchQuery, selectedTeam]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setLocalEdits({});
    setLocalRemovals(new Set());
  };

  // --- ВЫЧИСЛЕНИЯ ---
  const currentRosterState = useMemo(() => {
    return roster.map(r => ({
      ...r,
      current_jersey: localEdits[r.user_id]?.jersey_number !== undefined ? localEdits[r.user_id].jersey_number : r.jersey_number,
      current_is_captain: localEdits[r.user_id]?.is_captain !== undefined ? localEdits[r.user_id].is_captain : r.is_captain,
      current_is_assistant: localEdits[r.user_id]?.is_assistant !== undefined ? localEdits[r.user_id].is_assistant : r.is_assistant,
    }));
  }, [roster, localEdits]);

  const duplicateJerseys = useMemo(() => {
    const counts = {};
    currentRosterState.forEach(r => {
      if (r.current_jersey !== '' && r.current_jersey !== null && !localRemovals.has(r.user_id)) {
        counts[r.current_jersey] = (counts[r.current_jersey] || 0) + 1;
      }
    });
    return new Set(Object.keys(counts).filter(num => counts[num] > 1).map(Number));
  }, [currentRosterState, localRemovals]);

  const hasChanges = useMemo(() => {
    if (localRemovals.size > 0) return true;

    return Object.keys(localEdits).some(userId => {
      const edited = localEdits[userId];
      if (activeTab === 'roster') {
        const original = roster.find(r => r.user_id === Number(userId));
        if (!original) return false;
        return (edited.jersey_number !== undefined && edited.jersey_number !== original.jersey_number) ||
               (edited.position !== undefined && edited.position !== original.position) ||
               (edited.is_captain !== undefined && edited.is_captain !== original.is_captain) ||
               (edited.is_assistant !== undefined && edited.is_assistant !== original.is_assistant);
      } else if (activeTab === 'staff') {
        const original = staff.find(s => s.user_id === Number(userId));
        if (!original) return false;
        const origRoles = original.roles ? original.roles.split(', ').sort().join(', ') : '';
        const editRoles = edited.roles ? edited.roles.split(', ').sort().join(', ') : '';
        return edited.roles !== undefined && editRoles !== origRoles;
      }
      return false;
    });
  }, [localEdits, roster, staff, activeTab, localRemovals]);

  const isSaveDisabled = activeTab === 'roster' ? (!hasChanges || duplicateJerseys.size > 0) : (!hasChanges);

  const handleEdit = (userId, field, value) => {
    setLocalEdits(prev => ({ ...prev, [userId]: { ...(prev[userId] || {}), [field]: value } }));
  };

  // --- УМНОЕ ИСКЛЮЧЕНИЕ / ВОЗВРАТ ---
  const toggleRemoval = (userId) => {
    const isCurrentlyRemoved = localRemovals.has(userId);

    if (isCurrentlyRemoved) {
      if (activeTab === 'roster') {
        const playerState = currentRosterState.find(r => r.user_id === userId);
        if (playerState) {
          const activeCaptains = currentRosterState.filter(r => r.current_is_captain && !localRemovals.has(r.user_id)).length;
          const activeAssistants = currentRosterState.filter(r => r.current_is_assistant && !localRemovals.has(r.user_id)).length;
          const stripC = playerState.current_is_captain && activeCaptains >= 1;
          const stripA = playerState.current_is_assistant && activeAssistants >= 2;
          if (stripC || stripA) {
            setLocalEdits(prev => ({
              ...prev,
              [userId]: {
                ...(prev[userId] || {}),
                ...(stripC ? { is_captain: false } : {}),
                ...(stripA ? { is_assistant: false } : {})
              }
            }));
          }
        }
      }
      setLocalRemovals(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    } else {
      setLocalRemovals(prev => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    }
  };

  const handleLetterToggle = (userId, letter) => {
    if (localRemovals.has(userId)) return;
    const currentState = currentRosterState.find(r => r.user_id === userId);
    if (!currentState) return;

    setLocalEdits(prev => {
      const newEdits = { ...prev };
      const updatePlayer = (id, updates) => { newEdits[id] = { ...(newEdits[id] || {}), ...updates }; };

      if (letter === 'C') {
        if (currentState.current_is_captain) {
          updatePlayer(userId, { is_captain: false });
        } else {
          updatePlayer(userId, { is_captain: true, is_assistant: false });
          const oldCaptain = currentRosterState.find(r => r.current_is_captain && r.user_id !== userId && !localRemovals.has(r.user_id));
          if (oldCaptain) updatePlayer(oldCaptain.user_id, { is_captain: false });
        }
      } else if (letter === 'A') {
        if (currentState.current_is_assistant) {
          updatePlayer(userId, { is_assistant: false });
        } else {
          const assistantsCount = currentRosterState.filter(r => r.current_is_assistant && !localRemovals.has(r.user_id)).length;
          if (assistantsCount >= 2) return newEdits; 
          updatePlayer(userId, { is_assistant: true, is_captain: false });
        }
      }
      return newEdits;
    });
  };

  const toggleRole = (userId, roleId, currentRolesStr) => {
    if (localRemovals.has(userId)) return;
    const activeRoles = currentRolesStr ? currentRolesStr.split(', ') : [];
    const newRolesSet = new Set(activeRoles);
    if (newRolesSet.has(roleId)) newRolesSet.delete(roleId); else newRolesSet.add(roleId);
    handleEdit(userId, 'roles', [...newRolesSet].sort().join(', '));
  };

  const handleSaveChanges = async () => {
    if (isSaveDisabled) return;
    setIsSaving(true);
    try {
      const promises = [];
      const token = getToken();

      localRemovals.forEach(userId => {
        const actionStr = activeTab === 'base' ? 'remove_club' : 'remove';
        promises.push(
          fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ userId, type: activeTab === 'roster' ? 'player' : 'base', action: actionStr })
          }).then(res => res.json())
        );
      });

      if (activeTab !== 'base') {
        Object.keys(localEdits).forEach(userIdStr => {
          const userId = Number(userIdStr);
          if (localRemovals.has(userId)) return;
          const edited = localEdits[userId];
          if (activeTab === 'roster') {
            const original = roster.find(r => r.user_id === userId);
            if ((edited.jersey_number === undefined || edited.jersey_number === original.jersey_number) && 
                (edited.position === undefined || edited.position === original.position) &&
                (edited.is_captain === undefined || edited.is_captain === original.is_captain) &&
                (edited.is_assistant === undefined || edited.is_assistant === original.is_assistant)) return;

            promises.push(fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({
                userId, type: 'player', action: 'update',
                jerseyNumber: edited.jersey_number !== undefined ? Number(edited.jersey_number) : original.jersey_number,
                position: edited.position !== undefined ? edited.position : original.position,
                isCaptain: edited.is_captain !== undefined ? edited.is_captain : original.is_captain,
                isAssistant: edited.is_assistant !== undefined ? edited.is_assistant : original.is_assistant
              })
            }).then(res => res.json()));
          } 
          else if (activeTab === 'staff') {
            promises.push(fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({
                userId, type: 'staff', action: 'update',
                roles: edited.roles ? edited.roles.split(', ').filter(Boolean) : [] 
              })
            }).then(res => res.json()));
          }
        });
      }
      const results = await Promise.all(promises);
      if (results.some(r => !r.success)) {
        alert('Некоторые изменения не удалось сохранить.');
      } else {
        fetchMembers(selectedTeam.id);
      }
    } catch (err) { alert('Ошибка сети при сохранении.'); } finally { setIsSaving(false); }
  };

  const handlePhotoSave = async (file, isCleared) => {
    if (!avatarModalUser) return;
    setIsPhotoSaving(true);
    try {
      const token = getToken();
      const url = `${import.meta.env.VITE_API_URL}/api/teams-manage/${selectedTeam.id}/members/${avatarModalUser.user_id}/photo`;
      if (file) {
        const fd = new FormData(); fd.append('file', file);
        await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
      } else if (isCleared) {
        await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      }
      fetchMembers(selectedTeam.id);
      setAvatarModalUser(null);
    } catch (err) { alert('Ошибка при сохранении фото'); } finally { setIsPhotoSaving(false); }
  };

  const getRenderPhoto = (r) => {
    const path = r.photo_url || r.avatar_url || '/default/user_default.webp';
    return `${getImageUrl(path)}?t=${cacheBuster}`;
  };

  // КОЛОНКИ: БАЗА КОМАНДЫ
  const baseColumns = [
    { label: '№', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Фото', width: 'w-[60px]', render: (r) => (
      <div onClick={() => setAvatarModalUser(r)} className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10 cursor-pointer hover:scale-105 transition-transform">
        <img src={getRenderPhoto(r)} className="w-full h-full object-cover" alt="avatar" />
      </div>
    )},
    { label: 'Участник команды', render: (r) => (
      <div onClick={() => setProfileModalUserId(r.user_id)} className="flex flex-col cursor-pointer group">
        <span className="font-bold text-graphite text-[14px] group-hover:text-orange transition-colors">{`${r.last_name || ''} ${r.first_name || ''}`.trim()}</span>
        {r.middle_name && <span className="text-[12px] text-graphite/50 font-medium block truncate w-full group-hover:text-orange/60 transition-colors">{r.middle_name}</span>}
      </div>
    )},
    { label: 'Код', width: 'w-[100px]', render: (r) => r.virtual_code ? <code className="bg-orange/10 text-orange px-2 py-0.5 rounded font-bold text-[12px]">{r.virtual_code}</code> : '-' },
    { label: 'Статус', width: 'w-[100px]', render: (r) => <Badge type={r.virtual_code ? 'empty' : 'filled'} label={r.virtual_code ? 'ВИРТ' : 'РЕАЛ'} /> },
    { label: 'Телефон', width: 'w-[160px]', render: (r) => <span className="text-[13px] font-medium text-graphite">{formatPhone(r.phone)}</span> },
    { label: 'В команде с', width: 'w-[120px]', render: (r) => <span className="text-[13px] font-medium text-graphite/70">{formatDateToRU(r.joined_at)}</span> },
    { label: '', width: 'w-[50px] text-right', render: (r) => {
      const isRemoved = localRemovals.has(r.user_id);
      return (
        <button onClick={() => toggleRemoval(r.user_id)} className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${isRemoved ? 'bg-graphite/20 text-graphite hover:bg-graphite/30' : 'bg-status-rejected/10 text-status-rejected hover:bg-status-rejected hover:text-white'}`} title={isRemoved ? "Вернуть" : "Полностью исключить из команды"}>
          {isRemoved ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>}
        </button>
      );
    }}
  ];

  // КОЛОНКИ: ИГРОВОЙ СОСТАВ
  const rosterColumns = [
    { label: '№', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Фото', width: 'w-[60px]', render: (r) => (
      <div onClick={() => setAvatarModalUser(r)} className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10 cursor-pointer hover:scale-105 transition-transform">
        <img src={getRenderPhoto(r)} className="w-full h-full object-cover" alt="avatar" />
      </div>
    )},
    { label: 'Игрок', render: (r) => (
      <div onClick={() => setProfileModalUserId(r.user_id)} className="flex flex-col cursor-pointer group">
        <span className="font-bold text-graphite text-[14px] group-hover:text-orange transition-colors">{`${r.last_name || ''} ${r.first_name || ''}`.trim()}</span>
        {r.middle_name && <span className="text-[12px] text-graphite/50 font-medium block truncate w-full group-hover:text-orange/60 transition-colors">{r.middle_name}</span>}
      </div>
    )},
    { label: 'Амплуа', width: 'w-[140px]', render: (r) => {
      const isRemoved = localRemovals.has(r.user_id);
      const currentPos = localEdits[r.user_id]?.position !== undefined ? localEdits[r.user_id].position : r.position;
      return (
        <div className={isRemoved ? 'pointer-events-none opacity-40' : ''}>
          <Select options={['Вратарь', 'Защитник', 'Нападающий']} value={POSITION_MAP[currentPos]} onChange={(val) => { const newPos = Object.keys(POSITION_MAP).find(k => POSITION_MAP[k] === val); if (newPos) handleEdit(r.user_id, 'position', newPos); }} className="h-8 pl-3 pr-2 bg-white border border-graphite/20" />
        </div>
      );
    }},
    { label: 'Номер', width: 'w-[80px]', render: (r) => {
      const isRemoved = localRemovals.has(r.user_id);
      const currentNum = localEdits[r.user_id]?.jersey_number !== undefined ? localEdits[r.user_id].jersey_number : (r.jersey_number || '');
      const isConflict = duplicateJerseys.has(Number(currentNum)) && currentNum !== '' && !isRemoved;
      return (
        <div className={isRemoved ? 'pointer-events-none opacity-40' : ''}>
          <Input value={currentNum} maxLength={2} hasError={isConflict} className="w-14 h-8 text-center font-black text-[14px] bg-white border border-graphite/20" onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); handleEdit(r.user_id, 'jersey_number', val ? parseInt(val) : ''); }} />
        </div>
      );
    }},
    { label: 'Нашивки', width: 'w-[100px]', render: (r) => {
      const isRemoved = localRemovals.has(r.user_id);
      const isC = localEdits[r.user_id]?.is_captain !== undefined ? localEdits[r.user_id].is_captain : r.is_captain;
      const isA = localEdits[r.user_id]?.is_assistant !== undefined ? localEdits[r.user_id].is_assistant : r.is_assistant;
      const assistantsCount = currentRosterState.filter(p => p.current_is_assistant && !localRemovals.has(p.user_id)).length;
      const canAddA = isA || assistantsCount < 2;
      return (
        <div className={`flex gap-1.5 ${isRemoved ? 'pointer-events-none opacity-40' : ''}`}>
          <button onClick={() => handleLetterToggle(r.user_id, 'C')} className={`w-7 h-7 rounded text-[12px] font-black transition-all border ${isC ? 'bg-orange text-white border-orange shadow-[0_0_8px_rgba(255,122,0,0.4)]' : 'bg-transparent text-graphite/40 border-graphite/20 hover:border-orange hover:text-orange'}`} title="Капитан">C</button>
          <button onClick={() => handleLetterToggle(r.user_id, 'A')} disabled={!canAddA && !isA} className={`w-7 h-7 rounded text-[12px] font-black transition-all border ${isA ? 'bg-status-accepted text-white border-status-accepted shadow-[0_0_8px_rgba(39,174,96,0.4)]' : canAddA ? 'bg-transparent text-graphite/40 border-graphite/20 hover:border-status-accepted hover:text-status-accepted' : 'bg-gray-100 text-graphite/20 border-transparent cursor-not-allowed'}`} title="Ассистент">A</button>
        </div>
      );
    }},
    { label: 'В составе с', width: 'w-[120px]', render: (r) => <span className="text-[13px] font-medium text-graphite/70">{formatDateToRU(r.joined_at)}</span> },
    { label: '', width: 'w-[50px] text-right', render: (r) => {
      const isRemoved = localRemovals.has(r.user_id);
      return (
        <button onClick={() => toggleRemoval(r.user_id)} className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${isRemoved ? 'bg-graphite/20 text-graphite hover:bg-graphite/30' : 'bg-status-rejected/10 text-status-rejected hover:bg-status-rejected hover:text-white'}`} title={isRemoved ? "Вернуть" : "Исключить из состава"}>
          {isRemoved ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>}
        </button>
      );
    }}
  ];

  // КОЛОНКИ: ШТАБ
  const staffColumns = [
    { label: '№', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Фото', width: 'w-[60px]', render: (r) => (
      <div onClick={() => setAvatarModalUser(r)} className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10 cursor-pointer hover:scale-105 transition-transform">
        <img src={getRenderPhoto(r)} className="w-full h-full object-cover" alt="avatar" />
      </div>
    )},
    { label: 'Сотрудник', render: (r) => (
      <div onClick={() => setProfileModalUserId(r.user_id)} className="flex flex-col cursor-pointer group">
        <span className="font-bold text-graphite text-[14px] group-hover:text-orange transition-colors">{`${r.last_name || ''} ${r.first_name || ''}`.trim()}</span>
        {r.middle_name && <span className="text-[12px] text-graphite/50 font-medium block truncate w-full group-hover:text-orange/60 transition-colors">{r.middle_name}</span>}
      </div>
    )},
    { label: 'Роли', render: (r) => {
      const isRemoved = localRemovals.has(r.user_id);
      const currentRolesStr = localEdits[r.user_id]?.roles !== undefined ? localEdits[r.user_id].roles : (r.roles || '');
      const activeRoles = currentRolesStr ? currentRolesStr.split(', ') : [];
      return (
        <div className={`flex flex-wrap gap-1.5 min-w-[250px] ${isRemoved ? 'pointer-events-none opacity-40' : ''}`}>
          {ROLES.map(role => {
            const isActive = activeRoles.includes(role.id);
            return (
              <span key={role.id} onClick={() => toggleRole(r.user_id, role.id, currentRolesStr)} className={`cursor-pointer px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-md transition-all border select-none ${isActive ? 'bg-orange/10 border-orange text-orange shadow-[0_0_8px_rgba(255,122,0,0.15)]' : 'bg-transparent border-graphite/20 text-graphite/50 hover:border-graphite/40 hover:text-graphite/80'}`}>
                {role.label}
              </span>
            );
          })}
        </div>
      );
    }},
    { label: 'В штабе с', width: 'w-[120px]', render: (r) => <span className="text-[13px] font-medium text-graphite/70">{formatDateToRU(r.joined_at)}</span> },
    { label: '', width: 'w-[50px] text-right', render: (r) => {
      const isRemoved = localRemovals.has(r.user_id);
      return (
        <button onClick={() => toggleRemoval(r.user_id)} className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${isRemoved ? 'bg-graphite/20 text-graphite hover:bg-graphite/30' : 'bg-status-rejected/10 text-status-rejected hover:bg-status-rejected hover:text-white'}`} title={isRemoved ? "Вернуть" : "Исключить из штаба"}>
          {isRemoved ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>}
        </button>
      );
    }}
  ];

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header 
        title="Управление командой" 
        subtitle={
          selectedTeam && (
            <button 
              onClick={() => setSelectedTeam(null)}
              className="flex items-center gap-2 text-[13px] font-bold text-graphite-light hover:text-orange transition-colors group"
            >
              <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Вернуться к выбору команд
            </button>
          )
        }
      />

      <div className="flex items-start px-10 pt-8 gap-8 relative z-10">
        {selectedTeam && (
          <div className="w-[260px] shrink-0 sticky top-[128px] bg-white/30 backdrop-blur-md rounded-2xl shadow-mg border border-white/50 p-4 flex flex-col gap-2 z-20 animate-fade-in">
            <div className="flex flex-col items-center p-4 bg-white/0 rounded-xl mb-4 text-center border border-white/0">
              <img src={getImageUrl(selectedTeam.logo_url) || '/default/Logo_team_default.webp'} className="w-16 h-16 object-contain drop-shadow-sm mb-3" alt="team_logo" />
              <span className="font-black text-[16px] text-graphite leading-tight">{selectedTeam.name}</span>
              <span className="text-[11px] font-bold text-graphite-light mt-1">{selectedTeam.city}</span>
            </div>

            <button onClick={() => handleTabChange('base')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'base' ? 'bg-white text-orange shadow-sm' : 'text-graphite-light hover:bg-white/40'}`}>База команды</button>
            <button onClick={() => handleTabChange('roster')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'roster' ? 'bg-white text-orange shadow-sm' : 'text-graphite-light hover:bg-white/40'}`}>Игровой состав</button>
            <button onClick={() => handleTabChange('staff')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'staff' ? 'bg-white text-orange shadow-sm' : 'text-graphite-light hover:bg-white/40'}`}>Персонал (Штаб)</button>
            <button onClick={() => handleTabChange('tournaments')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'tournaments' ? 'bg-white text-orange shadow-sm' : 'text-graphite-light hover:bg-white/40'}`}>Заявки в лигу</button>
          </div>
        )}

        <div className="flex-1 relative z-10 min-h-[500px]">
          {!selectedTeam ? (
            <div className="bg-white/40 border border-graphite/10 rounded-xxl shadow-mg p-8 animate-fade-in-down flex flex-col min-h-[500px]">
              <div className="mb-8 max-w-md">
                <Input 
                  placeholder="Поиск по названию или городу..." 
                  value={teamSearchQuery} 
                  onChange={(e) => setTeamSearchQuery(e.target.value)} 
                />
              </div>
              
              {isSearchingTeams ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader text="Поиск команд..." />
                </div>
              ) : teamsList.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {teamsList.map(team => (
                    <div 
                      key={team.id} 
                      onClick={() => setSelectedTeam(team)}
                      className="flex items-center gap-4 p-5 bg-white rounded-xl border border-graphite/10 cursor-pointer hover:border-orange hover:shadow-md transition-all group"
                    >
                      <div className="w-14 h-14 rounded-lg bg-graphite/5 flex items-center justify-center p-1.5 shrink-0">
                        <img src={getImageUrl(team.logo_url) || '/default/Logo_team_default.webp'} className="w-full h-full object-contain drop-shadow-sm" alt="logo" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="block font-bold text-graphite text-[16px] group-hover:text-orange transition-colors truncate">{team.name}</span>
                        <span className="block text-[13px] text-graphite-light mt-1 truncate">{team.city || 'Город не указан'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-graphite-light">
                  <svg className="w-12 h-12 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  <p className="text-lg font-medium">Команды не найдены</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/80 border rounded-xxl shadow-mg p-8 animate-fade-in-down">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-graphite uppercase tracking-wide">
                  {activeTab === 'base' ? 'База команды' : activeTab === 'roster' ? 'Игровой состав' : activeTab === 'staff' ? 'Штаб команды' : 'Заявки'}
                </h3>
                
                <div className="flex items-center gap-3">
                  {['base', 'roster', 'staff'].includes(activeTab) && (
                    <Button onClick={handleSaveChanges} isLoading={isSaving} disabled={isSaveDisabled} className={isSaveDisabled ? 'opacity-50 grayscale cursor-not-allowed' : 'shadow-md shadow-orange/20'}>
                      Сохранить изменения
                    </Button>
                  )}

                  {activeTab !== 'tournaments' && (
                    <Button onClick={() => setIsAddDrawerOpen(true)}>
                      + Добавить {activeTab === 'base' ? 'в базу' : activeTab === 'roster' ? 'игрока' : 'сотрудника'}
                    </Button>
                  )}
                </div>
              </div>

              {activeTab === 'base' && <Table columns={baseColumns} data={base} rowClassName={(r) => localRemovals.has(r.user_id) ? 'bg-status-rejected/5 opacity-60 grayscale relative after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-status-rejected/40 after:-translate-y-1/2' : ''} />}
              {activeTab === 'roster' && <Table columns={rosterColumns} data={roster} rowClassName={(r) => localRemovals.has(r.user_id) ? 'bg-status-rejected/5 opacity-60 grayscale relative after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-status-rejected/40 after:-translate-y-1/2' : ''} />}
              {activeTab === 'staff' && <Table columns={staffColumns} data={staff} rowClassName={(r) => localRemovals.has(r.user_id) ? 'bg-status-rejected/5 opacity-60 grayscale relative after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-status-rejected/40 after:-translate-y-1/2' : ''} />}
              {activeTab === 'tournaments' && <div className="text-graphite-light">Модуль заявок в разработке...</div>}
            </div>
          )}
        </div>
      </div>

      <AddMemberDrawer isOpen={isAddDrawerOpen} onClose={() => setIsAddDrawerOpen(false)} teamId={selectedTeam?.id} type={activeTab} onSuccess={() => fetchMembers(selectedTeam.id)} roster={roster} staff={staff} base={base} />
      
      <PlayerAvatarModal isOpen={!!avatarModalUser} onClose={() => setAvatarModalUser(null)} initialAvatar={avatarModalUser ? getRenderPhoto(avatarModalUser) : null} onSave={handlePhotoSave} isSaving={isPhotoSaving} />
      <PlayerProfileModal isOpen={!!profileModalUserId} onClose={() => setProfileModalUserId(null)} playerId={profileModalUserId} />
    </div>
  );
}