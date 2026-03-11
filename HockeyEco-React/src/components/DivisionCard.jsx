import React, { useState, useEffect } from 'react';
import { getImageUrl, setExpiringStorage, getExpiringStorage, getToken, formatAge } from '../utils/helpers';
import { DivisionTeamsList } from './DivisionTeamsList';
import { TeamRosterTable } from './TeamRosterTable';
import { Loader } from '../ui/Loader';
import { Tabs } from '../ui/Tabs';
import { PlayerProfileModal } from '../modals/PlayerProfileModal';

// Модалки команд
import { TeamUniformModal } from '../modals/TeamUniformModal';
import { TeamDescriptionModal } from '../modals/TeamDescriptionModal';
import { TeamPhotoModal } from '../modals/TeamPhotoModal';
import { PublishStatusModal } from '../modals/PublishStatusModal';
import { TeamStatusModal } from '../modals/TeamStatusModal';

// Модалки игроков
import { QualSelectModal } from '../modals/QualSelectModal';
import { MedicalDocsModal } from '../modals/MedicalDocsModal';
import { FeeModal } from '../modals/FeeModal';

const TOURNAMENT_TYPES = {
  regular: 'Регулярный чемпионат',
  playoff: 'Плей-офф',
  mixed: 'Регулярный + Плей-офф'
};

export function DivisionCard({ division, leagueId, userRole, onEdit, onDelete, onRefresh, setGlobalToast }) {
  const initialExpanded = getExpiringStorage(`div_${division.id}_expanded`) === true;
  const initialTeamsTab = Number(getExpiringStorage(`div_${division.id}_teamsTab`)) || 0;
  const initialRosterTab = Number(getExpiringStorage(`div_${division.id}_rosterTab`)) || 0;
  
  const initialTeamId = getExpiringStorage(`div_${division.id}_selectedTeamId`);
  const teams = division.teams || [];
  const initialTeam = initialTeamId ? teams.find(t => t.id === Number(initialTeamId)) : null;

  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [teamsTab, setTeamsTab] = useState(initialTeamsTab); 
  const [rosterTab, setRosterTab] = useState(initialRosterTab);

  const [selectedTeam, setSelectedTeam] = useState(initialTeam || null);
  const [isDetailVisible, setIsDetailVisible] = useState(!!initialTeam);
  const [isCompactView, setIsCompactView] = useState(!!initialTeam);

  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isPublishSaving, setIsPublishSaving] = useState(false);

  const [activeTeamForModal, setActiveTeamForModal] = useState(null);
  const [modalType, setModalType] = useState(null);
  const [isDataSaving, setIsDataSaving] = useState(false);
  
  const [rosterData, setRosterData] = useState([]);
  const [staffData, setStaffData] = useState([]);
  const [isRosterLoading, setIsRosterLoading] = useState(false);

  const [activePlayerForModal, setActivePlayerForModal] = useState(null);
  const [playerModalType, setPlayerModalType] = useState(null);
  const [isPlayerSaving, setIsPlayerSaving] = useState(false);
  const [profileModalPlayerId, setProfileModalPlayerId] = useState(null);
  const [leagueQuals, setLeagueQuals] = useState([]);

  useEffect(() => { setExpiringStorage(`div_${division.id}_teamsTab`, teamsTab); }, [teamsTab, division.id]);
  useEffect(() => { setExpiringStorage(`div_${division.id}_rosterTab`, rosterTab); }, [rosterTab, division.id]);

  useEffect(() => {
    if (leagueId && leagueQuals.length === 0) {
      fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${leagueId}/settings-qualifications`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      .then(res => res.json())
      .then(data => { if (data.success) setLeagueQuals(data.qualifications); })
      .catch(console.error);
    }
  }, [leagueId]);

  const loadTeamData = async (teamId) => {
    setIsRosterLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-teams/${teamId}/roster`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) {
        setRosterData(data.data);
        setStaffData(data.staff || []); 
      } else {
        setGlobalToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) { setGlobalToast({ title: 'Ошибка', message: 'Сбой загрузки состава', type: 'error' }); } 
    finally { setIsRosterLoading(false); }
  };

  useEffect(() => {
    if (initialTeam) loadTeamData(initialTeam.id);
  }, []);

  const activePlayers = rosterData.filter(p => !p.period_end);
  const inactivePlayers = rosterData.filter(p => p.period_end);
  const staffMembers = staffData; 

  let currentRosterDisplay = activePlayers;
  if (rosterTab === 1) currentRosterDisplay = inactivePlayers;
  if (rosterTab === 2) currentRosterDisplay = staffMembers;

  const rosterTabsCounts = [
    `Игроки в составе (${activePlayers.length})`,
    `Отзаявленные (${inactivePlayers.length})`,
    `Представители (${staffMembers.length})`
  ];

  const toggleExpand = () => {
    const nextState = !isExpanded;
    setIsExpanded(nextState);
    setExpiringStorage(`div_${division.id}_expanded`, nextState);
    if (!nextState) closeDetailPanel();
  };

  const handleTeamSelect = (team) => {
    if (selectedTeam?.id === team.id) {
      closeDetailPanel();
      return;
    }
    setSelectedTeam(team);
    setExpiringStorage(`div_${division.id}_selectedTeamId`, team.id);
    
    if (!selectedTeam) {
      setIsCompactView(true);
      setTimeout(() => setIsDetailVisible(true), 0);
    }
    loadTeamData(team.id);
  };

  const closeDetailPanel = () => {
    setIsDetailVisible(false);
    setIsCompactView(false);
    sessionStorage.removeItem(`div_${division.id}_selectedTeamId`);
    
    setTimeout(() => {
      setSelectedTeam(null);
      setRosterTab(0);
      sessionStorage.removeItem(`div_${division.id}_rosterTab`);
    }, 300); 
  };

  const handleToggleRosterStatus = async (rosterId, currentStatus) => {
    const newStatus = currentStatus === 'approved' ? 'declined' : 'approved';
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-rosters/${rosterId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ application_status: newStatus }) });
      const data = await res.json();
      if (data.success) {
        setRosterData(prev => prev.map(p => p.tournament_roster_id === rosterId ? { ...p, application_status: newStatus } : p));
        setGlobalToast({ title: 'Успешно', message: 'Допуск игрока изменен', type: 'success' });
        onRefresh(true);
      }
    } catch (err) { setGlobalToast({ title: 'Ошибка', message: 'Сбой сети', type: 'error' }); }
  };

  const handlePlayerQualSave = async (qualId) => {
    if (!activePlayerForModal) return;
    setIsPlayerSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-rosters/${activePlayerForModal.tournament_roster_id}/qualification`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ qualification_id: qualId }) });
      const data = await res.json();
      if (data.success) {
        setRosterData(prev => prev.map(p => p.tournament_roster_id === activePlayerForModal.tournament_roster_id ? { ...p, qualification_id: qualId, qualification_short_name: data.qualification_short_name } : p));
        setGlobalToast({ title: 'Успешно', message: 'Квалификация обновлена', type: 'success' });
        setPlayerModalType(null);
      }
    } catch (err) { setGlobalToast({ title: 'Ошибка', message: 'Сбой сохранения', type: 'error' }); } finally { setIsPlayerSaving(false); }
  };

  const handlePlayerFeeSave = async (isPaid) => {
    if (!activePlayerForModal) return;
    setIsPlayerSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-rosters/${activePlayerForModal.tournament_roster_id}/fee`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ is_fee_paid: isPaid }) });
      const data = await res.json();
      if (data.success) {
        setRosterData(prev => prev.map(p => p.tournament_roster_id === activePlayerForModal.tournament_roster_id ? { ...p, is_fee_paid: isPaid } : p));
        setGlobalToast({ title: 'Успешно', message: 'Статус взноса обновлен', type: 'success' });
        setPlayerModalType(null);
      }
    } catch (err) { setGlobalToast({ title: 'Ошибка', message: 'Сбой сохранения', type: 'error' }); } finally { setIsPlayerSaving(false); }
  };

  const handlePlayerDocsSave = async ({ medFile, medCleared, medExp, insFile, insCleared, insExp }) => {
    if (!activePlayerForModal) return;
    setIsPlayerSaving(true);
    const formData = new FormData();
    if (insFile) formData.append('insurance', insFile); if (insCleared) formData.append('insurance_cleared', 'true');
    if (medFile) formData.append('medical', medFile); if (medCleared) formData.append('medical_cleared', 'true');
    if (insExp !== undefined) formData.append('insurance_expires_at', insExp);
    if (medExp !== undefined) formData.append('medical_expires_at', medExp);
    formData.append('player_id', activePlayerForModal.player_id);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-rosters/${activePlayerForModal.tournament_roster_id}/docs`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: formData });
      const data = await res.json();
      if (data.success) {
        setRosterData(prev => prev.map(p => p.tournament_roster_id === activePlayerForModal.tournament_roster_id ? { 
          ...p, 
          insurance_url: data.insurance_url !== undefined ? data.insurance_url : p.insurance_url, 
          medical_url: data.medical_url !== undefined ? data.medical_url : p.medical_url,
          insurance_expires_at: insExp || null,
          medical_expires_at: medExp || null
        } : p));
        setGlobalToast({ title: 'Успешно', message: 'Документы загружены', type: 'success' });
        setPlayerModalType(null);
      } else setGlobalToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) { setGlobalToast({ title: 'Ошибка', message: 'Сбой загрузки документов', type: 'error' }); } finally { setIsPlayerSaving(false); }
  };

  const handlePublishSave = async (newStatus) => {
    setIsPublishSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${division.id}/publish`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ is_published: newStatus }) });
      const data = await res.json();
      if (data.success) { setGlobalToast({ title: 'Успешно', message: 'Статус обновлен', type: 'success' }); setIsPublishModalOpen(false); onRefresh(true); }
    } catch (err) { setGlobalToast({ title: 'Ошибка', message: 'Сбой обновления', type: 'error' }); } finally { setIsPublishSaving(false); }
  };

  const handleTeamStatusSave = async (newStatus) => {
    if (!activeTeamForModal) return;
    setIsDataSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-teams/${activeTeamForModal.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ status: newStatus }) });
      const data = await res.json();
      if (data.success) { 
        setGlobalToast({ title: 'Успешно', message: 'Статус изменен', type: 'success' }); 
        const STATUS_KEYS = ['approved', 'pending', 'revision', 'rejected'];
        const newIndex = STATUS_KEYS.indexOf(newStatus);
        if (newIndex !== -1) setTeamsTab(newIndex);
        if (selectedTeam && selectedTeam.id === activeTeamForModal.id) {
          setSelectedTeam(prev => ({ ...prev, status: newStatus }));
        }
        closeModals(); 
        onRefresh(true); 
      }
    } catch (err) { setGlobalToast({ title: 'Ошибка', message: 'Сбой сохранения', type: 'error' }); } finally { setIsDataSaving(false); }
  };

  const uploadTeamFile = async (teamId, type, file) => {
    const formData = new FormData(); formData.append('file', file);
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-teams/${teamId}/upload/${type}`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.url;
  };

  const handleCustomDataSave = async (updates) => {
    if (!activeTeamForModal) return;
    setIsDataSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-teams/${activeTeamForModal.id}/custom-data`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify(updates) });
      const data = await res.json();
      if (data.success) { setGlobalToast({ title: 'Успешно', message: 'Данные обновлены', type: 'success' }); closeModals(); onRefresh(true); }
    } catch (err) { setGlobalToast({ title: 'Ошибка', message: 'Сбой сохранения', type: 'error' }); } finally { setIsDataSaving(false); }
  };

  const handleUniformSave = async (lightFile, darkFile, lightCleared, darkCleared) => {
    setIsDataSaving(true);
    try {
      let lightUrl = undefined, darkUrl = undefined;
      const teamId = activeTeamForModal.id;
      if (lightFile) lightUrl = await uploadTeamFile(teamId, 'jersey_light', lightFile); else if (lightCleared) lightUrl = null;
      if (darkFile) darkUrl = await uploadTeamFile(teamId, 'jersey_dark', darkFile); else if (darkCleared) darkUrl = null;
      await handleCustomDataSave({ custom_jersey_light_url: lightUrl, custom_jersey_dark_url: darkUrl });
    } catch (err) { setGlobalToast({ title: 'Ошибка', message: 'Сбой загрузки файлов', type: 'error' }); setIsDataSaving(false); }
  };

  const handleDescSave = (text) => handleCustomDataSave({ custom_description: text || null });

  const handlePhotoSave = async (photoFile, photoCleared) => {
    setIsDataSaving(true);
    try {
      let photoUrl = undefined; const teamId = activeTeamForModal.id;
      if (photoFile) photoUrl = await uploadTeamFile(teamId, 'team_photo', photoFile); else if (photoCleared) photoUrl = null;
      await handleCustomDataSave({ custom_team_photo_url: photoUrl });
    } catch (err) { setGlobalToast({ title: 'Ошибка', message: 'Сбой загрузки фото', type: 'error' }); setIsDataSaving(false); }
  };

  const openModal = (team, type) => { setActiveTeamForModal(team); setModalType(type); };
  const closeModals = () => { setActiveTeamForModal(null); setModalType(null); };

  const now = new Date();
  const appStart = division.application_start ? new Date(division.application_start) : null;
  const appEnd = division.application_end ? new Date(division.application_end) : null;
  const isAppWindowOpen = appStart && appEnd ? (now >= appStart && now <= appEnd) : true; 

  const isAdmin = userRole === 'admin';
  const canEditRoster = isAdmin || (selectedTeam && selectedTeam.status !== 'revision');
  const canChangeTeamStatus = isAdmin || (isAppWindowOpen && selectedTeam && selectedTeam.status !== 'revision');
  const canEditActiveTeamParams = isAdmin || (activeTeamForModal && activeTeamForModal.status !== 'revision');

  const STATUS_LABELS = {
    approved: 'Команда допущена',
    pending: 'Команда на проверке',
    revision: 'Команда на исправлении',
    rejected: 'Команда отклонена'
  };

  // --- НОВАЯ ФУНКЦИЯ ДЛЯ ЦВЕТОВ КНОПКИ СТАТУСА ---
  const getStatusButtonStyle = (status, canChange) => {
    // 1. "На исправлении" — синяя и всегда неактивная
    if (status === 'revision') {
      return 'bg-blue-500/10 text-blue-600 cursor-not-allowed border-transparent opacity-90';
    }

    // 2. Если нет прав (или окно закрыто) — бледные цвета и блокировка
    if (!canChange) {
      if (status === 'approved') return 'bg-status-accepted/5 text-status-accepted/50 cursor-not-allowed border-transparent';
      if (status === 'pending') return 'bg-orange/5 text-orange/50 cursor-not-allowed border-transparent';
      if (status === 'rejected') return 'bg-status-rejected/5 text-status-rejected/50 cursor-not-allowed border-transparent';
      return 'border-graphite/5 text-graphite/40 bg-graphite/5 cursor-not-allowed';
    }

    // 3. Активные красивые кнопки с hover-эффектом для лиги
    switch (status) {
      case 'approved':
        return 'bg-status-accepted/10 text-status-accepted hover:bg-status-accepted hover:text-white border-transparent cursor-pointer';
      case 'pending':
        return 'bg-orange/10 text-orange hover:bg-orange hover:text-white border-transparent cursor-pointer';
      case 'rejected':
        return 'bg-status-rejected/10 text-status-rejected hover:bg-status-rejected hover:text-white border-transparent cursor-pointer';
      default:
        return 'border-graphite/10 text-graphite-light hover:text-orange hover:border-orange/30 hover:bg-orange/5 cursor-pointer';
    }
  };

  // Финальная проверка: можно ли кликать на кнопку статуса?
  const isStatusClickable = canChangeTeamStatus && selectedTeam?.status !== 'revision';

  return (
    <div className="bg-white/50 backdrop-blur-xl rounded-xxl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden font-sans w-full transition-all duration-300 relative">
      <div 
        className="p-6 md:p-8 flex flex-col xl:flex-row gap-8 items-center justify-between relative z-10 cursor-pointer group hover:transition-colors"
        onClick={toggleExpand}
      >
        <div className="flex items-center gap-4 w-[500px] min-w-0">
          <div className="w-[72px] h-[72px] rounded-lg flex justify-center items-center p-2 shrink-0">
            <img src={division.logo_url ? getImageUrl(division.logo_url) : '/img/Logo_division_default.webp'} alt="Logo" className="w-full h-full object-contain drop-shadow-sm" />
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="text-[22px] font-black text-graphite leading-tight tracking-tight truncate">{division.name}</h3>
            <span className="text-[11px] font-bold text-graphite-light/60 uppercase tracking-widest mt-1.5">{TOURNAMENT_TYPES[division.tournament_type] || 'Турнир'}</span>
          </div>
        </div>

        <div className="flex gap-8 md:gap-14 w-[200px] shrink-0 justify-center xl:justify-center">
          <div className="flex flex-col items-center">
            <span className="text-[28px] font-black text-graphite/80 leading-none tracking-tight">{division.approved_teams_count || 0}</span>
            <span className="text-[10px] font-bold text-graphite-light/50 uppercase tracking-widest mt-2">Команд</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[28px] font-black text-graphite/80 leading-none tracking-tight">{division.approved_players_count || 0}</span>
            <span className="text-[10px] font-bold text-graphite-light/50 uppercase tracking-widest mt-2">Игроков</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[28px] font-black text-graphite/80 leading-none tracking-tight">{division.finished_games_count || 0}</span>
            <span className="text-[10px] font-bold text-graphite-light/50 uppercase tracking-widest mt-2">Матчей</span>
          </div>
        </div>

        <div className="flex items-center gap-5 shrink-0 ml-auto w-[400px] justify-end">
          <button onClick={(e) => { e.stopPropagation(); setIsPublishModalOpen(true); }} className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-300 ${division.is_published ? 'text-status-accepted hover:bg-graphite/5' : 'bg-orange/10 text-orange hover:bg-orange hover:text-white'}`} title={division.is_published ? "Опубликован" : "Скрыт"}>
            {division.is_published ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-12 h-12 rounded-lg flex items-center justify-center text-graphite/50 hover:bg-graphite/5 hover:transition-all duration-300" title="Настройки дивизиона">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
          {userRole === 'admin' && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="w-12 h-12 rounded-lg flex items-center justify-center text-status-rejected hover:bg-graphite/5 hover:transition-all duration-300" title="Удалить дивизион">
              <svg className="w-8 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}
          <div className="w-px mx-6 h-10 bg-graphite/20 mx-1 hidden xl:block"></div>
          <button 
            className={`w-12 h-12 rounded-lg border-1 flex items-center justify-center transition-all duration-300 ${isExpanded ? 'border-orange text-orange bg-orange/5' : 'border-graphite/10 text-graphite/40 group-hover:border-orange group-hover:text-orange group-hover:bg-orange/5'}`}
          >
            <svg className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>
      </div>

      <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="p-6 md:p-8 pt-4 bg-gradient-to-b from-graphite/[0.03] to-transparent border-t border-graphite/5 flex gap-6 items-start transition-all duration-500 overflow-hidden w-full">
            
            <div className={`transition-all duration-300 ease-in-out overflow-hidden flex flex-col ${isDetailVisible ? 'w-[100px] shrink-0' : 'w-full'}`}>
              {isCompactView && (
                <div className="mb-6 pb-2 w-full animate-fade-in flex items-center h-[40px]">
                  <button 
                    onClick={closeDetailPanel}
                    className="w-10 h-10 mx-auto rounded-lg flex items-center justify-center text-graphite-light hover:text-orange hover:border-orange/30 hover:bg-orange/5 transition-all duration-300"
                    title="Вернуться к списку команд"
                  >
                    <svg className="w-6 h-6 pr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>
              )}
              <div className={`overflow-hidden ${!isCompactView ? "w-full min-w-[1310px]" : "w-full"}`}>
                <DivisionTeamsList 
                  teams={teams} 
                  onOpenModal={openModal} 
                  selectedTeamId={isCompactView ? selectedTeam?.id : null} 
                  onTeamSelect={handleTeamSelect} 
                  userRole={userRole}
                  activeTab={teamsTab}      
                  onTabChange={setTeamsTab} 
                  isAppWindowOpen={isAppWindowOpen}
                />
              </div>
            </div>

            {selectedTeam && (
              <div className={`flex-1 w-0 min-w-[1px] pl-6 border-l border-graphite/20 relative transition-all duration-300 ease-in-out ${isDetailVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10 pointer-events-none'}`}>
                <div className="mb-6 flex items-start justify-between min-h-[38px]">
                  <div className="overflow-x-auto pb-2 custom-scrollbar flex-1">
                    <Tabs tabs={rosterTabsCounts} activeTab={rosterTab} onChange={setRosterTab} />
                  </div>
                  
                  {/* ОБНОВЛЕННАЯ ЦВЕТНАЯ КНОПКА СТАТУСА КОМАНДЫ */}
                  <button 
                    onClick={() => isStatusClickable && openModal(selectedTeam, 'status')}
                    className={`ml-4 shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-300 text-[13px] font-bold shadow-sm ${getStatusButtonStyle(selectedTeam.status, canChangeTeamStatus)}`}
                    title={isStatusClickable ? "Изменить статус команды" : "Изменение статуса недоступно"}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    {STATUS_LABELS[selectedTeam.status] || 'Статус команды'}
                  </button>
                  
                </div>
                <div className="relative min-h-[500px] transition-all duration-300">
                  {isRosterLoading && (
                    <div className="absolute inset-0 z-10 flex items-start pt-16 justify-center transition-all duration-700">
                      <Loader text="Загрузка состава..." />
                    </div>
                  )}
                  <div className={`transition-opacity duration-300 ${isRosterLoading ? 'opacity-5 pointer-events-none' : 'opacity-100'}`}>
                    <TeamRosterTable 
                      roster={currentRosterDisplay} 
                      isStaff={rosterTab === 2} 
                      onOpenModal={(player, type) => { setActivePlayerForModal(player); setPlayerModalType(type); }} 
                      onToggleStatus={handleToggleRosterStatus} 
                      onOpenProfile={(id) => setProfileModalPlayerId(id)} 
                      canEditRoster={canEditRoster}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PublishStatusModal isOpen={isPublishModalOpen} onClose={() => setIsPublishModalOpen(false)} isPublished={division.is_published} onSave={handlePublishSave} isSaving={isPublishSaving} />
      <TeamStatusModal isOpen={modalType === 'status'} onClose={closeModals} currentStatus={activeTeamForModal?.status} teamName={activeTeamForModal?.name} onSave={handleTeamStatusSave} isSaving={isDataSaving} />
      
      <TeamUniformModal isOpen={modalType === 'uniform'} onClose={closeModals} initialLight={activeTeamForModal?.custom_jersey_light_url ? `${getImageUrl(activeTeamForModal.custom_jersey_light_url)}?t=${Date.now()}` : (activeTeamForModal?.jersey_light_url ? getImageUrl(activeTeamForModal.jersey_light_url) : null)} initialDark={activeTeamForModal?.custom_jersey_dark_url ? `${getImageUrl(activeTeamForModal.custom_jersey_dark_url)}?t=${Date.now()}` : (activeTeamForModal?.jersey_dark_url ? getImageUrl(activeTeamForModal.jersey_dark_url) : null)} canClearLight={!!activeTeamForModal?.custom_jersey_light_url} canClearDark={!!activeTeamForModal?.custom_jersey_dark_url} onSave={handleUniformSave} isSaving={isDataSaving} readOnly={!canEditActiveTeamParams} />
      <TeamDescriptionModal isOpen={modalType === 'desc'} onClose={closeModals} initialText={activeTeamForModal?.custom_description || activeTeamForModal?.description || ''} onSave={handleDescSave} isSaving={isDataSaving} readOnly={!canEditActiveTeamParams} />
      <TeamPhotoModal isOpen={modalType === 'photo'} onClose={closeModals} initialPhoto={activeTeamForModal?.custom_team_photo_url ? `${getImageUrl(activeTeamForModal.custom_team_photo_url)}?t=${Date.now()}` : (activeTeamForModal?.team_photo_url ? getImageUrl(activeTeamForModal.team_photo_url) : null)} canClearPhoto={!!activeTeamForModal?.custom_team_photo_url} onSave={handlePhotoSave} isSaving={isDataSaving} readOnly={!canEditActiveTeamParams} />

      <QualSelectModal isOpen={playerModalType === 'qual'} onClose={() => setPlayerModalType(null)} qualifications={leagueQuals} currentQualId={activePlayerForModal?.qualification_id} onSelect={handlePlayerQualSave} isSaving={isPlayerSaving} readOnly={!canEditRoster} />
      <FeeModal isOpen={playerModalType === 'fee'} onClose={() => setPlayerModalType(null)} initialPaid={activePlayerForModal?.is_fee_paid} playerName={activePlayerForModal ? `${activePlayerForModal.last_name} ${activePlayerForModal.first_name}` : 'Игрок'} onSave={handlePlayerFeeSave} isSaving={isPlayerSaving} readOnly={!canEditRoster} />
      <MedicalDocsModal 
        isOpen={playerModalType === 'docs'} 
        onClose={() => setPlayerModalType(null)} 
        initialMed={activePlayerForModal?.medical_url ? getImageUrl(activePlayerForModal.medical_url) : null} 
        initialIns={activePlayerForModal?.insurance_url ? getImageUrl(activePlayerForModal.insurance_url) : null} 
        initialMedExp={activePlayerForModal?.medical_expires_at} 
        initialInsExp={activePlayerForModal?.insurance_expires_at}
        onSave={handlePlayerDocsSave} 
        isSaving={isPlayerSaving} 
        readOnly={!canEditRoster}
      />
      <PlayerProfileModal isOpen={!!profileModalPlayerId} onClose={() => setProfileModalPlayerId(null)} playerId={profileModalPlayerId} />
    </div>
  );
}