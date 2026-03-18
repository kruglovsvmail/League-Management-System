import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { getToken, getImageUrl } from '../utils/helpers';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';

import { Loader } from '../ui/Loader';
import { Button } from '../ui/Button';
import { Table } from '../ui/Table2';
import { Tabs } from '../ui/Tabs';
import { Icon } from '../ui/Icon';
import { GameStatusModal } from '../modals/GameStatusModal';
import { GameRosterModal } from '../modals/GameRosterModal';
import { ManageOfficialsModal } from '../modals/ManageOfficialsModal';
import { EditGameInfoDrawer } from '../modals/EditGameInfoDrawer';
import { PlayerProfileModal } from '../modals/PlayerProfileModal';
import { useAccess } from '../hooks/useAccess';
import { Header } from '../components/Header';

dayjs.locale('ru');

const ROLE_MAP = {
  'head_coach': 'Главный тренер',
  'coach': 'Тренер',
  'team_manager': 'Менеджер команды',
  'team_admin': 'Администратор'
};

const POS_MAP = { 'G': 'Вр.', 'LD': 'Защ.', 'RD': 'Защ.', 'LW': 'Нап.', 'C': 'Нап.', 'RW': 'Нап.' };
const POS_ORDER = { 'G': 1, 'LD': 2, 'RD': 2, 'LW': 3, 'C': 3, 'RW': 3 };

export function GamePage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user, selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  
  const [game, setGame] = useState(null);
  const [arenas, setArenas] = useState([]);
  const [events, setEvents] = useState([]);
  
  const [homeRoster, setHomeRoster] = useState([]);
  const [awayRoster, setAwayRoster] = useState([]);
  const [homeStaff, setHomeStaff] = useState([]);
  const [awayStaff, setAwayStaff] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isEditInfoDrawerOpen, setIsEditInfoDrawerOpen] = useState(false);
  const [rosterModalState, setRosterModalState] = useState({ isOpen: false, teamId: null, teamName: '' });
  const [isOfficialsModalOpen, setIsOfficialsModalOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  
  const [obsCopied, setObsCopied] = useState(false);

  const loadAllData = async () => {
    try {
      const resGame = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const dataGame = await resGame.json();
      if (dataGame.success) setGame(dataGame.data);
      else return navigate('/games');

      const resArenas = await fetch(`${import.meta.env.VITE_API_URL}/api/arenas`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const dataArenas = await resArenas.json();
      if (dataArenas.success) setArenas(dataArenas.data);

      const resHome = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.home_team_id}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const dataHome = await resHome.json();
      if (dataHome.success) {
        setHomeRoster(dataHome.gameRoster);
        setHomeStaff(dataHome.staffRoster || []);
      }

      const resAway = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.away_team_id}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const dataAway = await resAway.json();
      if (dataAway.success) {
        setAwayRoster(dataAway.gameRoster);
        setAwayStaff(dataAway.staffRoster || []);
      }

      const resEvents = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`, { 
        headers: { 'Authorization': `Bearer ${getToken()}` } 
      });
      const dataEvents = await resEvents.json();
      if (dataEvents.success) setEvents(dataEvents.data);

    } catch (err) { console.error(err); } 
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadAllData(); }, [gameId]);

  // --- ЛОГИКА RBAC: ПРОВЕРКА ПРАВ ДОСТУПА ---
  const gameStaffArray = useMemo(() => {
    if (!game?.officials) return [];
    return Object.entries(game.officials)
      .filter(([role, off]) => off && off.id)
      .map(([role, off]) => ({ user_id: off.id, role }));
  }, [game]);

  const canEditGameInfo = checkAccess('EDIT_GAMES');
  const canManageStatus = checkAccess('MANAGE_GAME_STATUS', gameStaffArray);
  const canManageRoster = checkAccess('MANAGE_GAME_ROSTER', gameStaffArray);
  const canManageOfficials = checkAccess('MANAGE_GAME_REFEREES');
  const hasProtocolAccess = checkAccess('MANAGE_PROTOCOL', gameStaffArray);

  // Проверка права на управление ТВ-графикой (Админ, Руководство Лиги или медиа-офицер матча)
  const canManageGraphics = checkAccess('MANAGE_GRAPHICS', gameStaffArray);

  const isScheduled = game?.status === 'scheduled';
  const canEditRosters = isScheduled || game?.status === 'live'; 
  const canOpenLiveDesk = hasProtocolAccess && ['live', 'finished', 'cancelled'].includes(game?.status);
  // ------------------------------------------

  const gameDate = game ? dayjs(game.game_date) : dayjs();
  const officials = game?.officials || {}; 
  const hasOfficials = Object.values(officials).some(val => val && (typeof val === 'object' ? val.name : val.trim() !== ''));

  const handleCopyOBSLink = () => {
    const obsLink = `${window.location.origin}/games/${game.id}/graphics`;
    navigator.clipboard.writeText(obsLink);
    setObsCopied(true);
    setTimeout(() => setObsCopied(false), 2000);
  };

  const getStatusBadge = () => {
    if (!game) return null;
    let badgeClass = "flex items-center justify-center px-5 py-2.5 rounded-xl text-[12px] font-black tracking-widest uppercase shadow-sm leading-none border shrink-0 ";
    let content = "";

    switch (game.status) {
      case 'live': 
        badgeClass += canManageStatus 
          ? "bg-blue-500 text-white border-blue-500 hover:bg-blue-600 animate-pulse shadow-[0_4px_15px_rgba(59,130,246,0.3)] cursor-pointer group transition-all" 
          : "bg-blue-500 text-white border-blue-500 shadow-[0_4px_15px_rgba(59,130,246,0.3)]"; 
        content = "LIVE (Идет сейчас)"; 
        break;
      case 'finished': 
        badgeClass += canManageStatus 
          ? "bg-status-accepted/80 text-white border-status-accepted/20 hover:bg-status-accepted cursor-pointer group transition-all" 
          : "bg-status-accepted/80 text-white border-status-accepted/20"; 
        content = "Матч завершен"; 
        break;
      case 'cancelled': 
        badgeClass += canManageStatus 
          ? "bg-status-rejected/80 text-white border-status-rejected/20 hover:bg-status-rejected cursor-pointer group transition-all" 
          : "bg-status-rejected/80 text-white border-status-rejected/20"; 
        content = "Матч отменен"; 
        break;
      default: 
        badgeClass += canManageStatus 
          ? "bg-orange text-white border-orange hover:bg-orange/90 cursor-pointer group transition-all" 
          : "bg-orange text-white border-orange"; 
        content = "В расписании"; 
        break;
    }

    if (canManageStatus) {
      return (
        <button className={badgeClass} onClick={() => setIsStatusModalOpen(true)} title="Изменить статус матча">
          <span>{content}</span>
          <svg className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity ml-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      );
    }

    return (
      <div className={badgeClass}>
        <span>{content}</span>
      </div>
    );
  };

  const getJerseyUrl = (teamPrefix, type) => {
    if (!game) return getImageUrl(`/default/jersey_${type}.webp`);
    return getImageUrl(game[`${teamPrefix}_jersey_${type}`] || `/default/jersey_${type}.webp`);
  };

  const renderTeamCard = (side, teamName, roster, staff, teamId) => {
    const counts = {};
    roster.forEach(r => { if (r.jersey_number) counts[r.jersey_number] = (counts[r.jersey_number] || 0) + 1; });
    const duplicates = new Set(Object.keys(counts).filter(num => counts[num] > 1).map(Number));

    const sortedRoster = [...roster].sort((a, b) => {
      const posA = POS_ORDER[a.position_in_line] || 99;
      const posB = POS_ORDER[b.position_in_line] || 99;
      if (posA !== posB) return posA - posB;
      return (a.jersey_number || 999) - (b.jersey_number || 999);
    });

    const rosterColumns = [
      { label: '', width: 'w-[10px]', align: 'center', render: (_, idx) => <span className="font-normal text-graphite/50">{idx + 1}</span> },
      { label: 'Фото', width: 'w-[80px]', align: 'center', render: (r) => ( <img src={getImageUrl(r.photo_url || r.avatar_url || '/default/user_default.webp')} className="w-7 h-7 rounded object-cover bg-graphite/5" alt="" /> )},
      { label: 'Игрок',  render: (r) => (
        <button onClick={() => setSelectedPlayerId(r.player_id)} className="text-[13px] font-semibold text-graphite/85 hover:text-orange transition-colors flex items-center gap-2 truncate text-left">
          <span>{r.last_name} {r.first_name}</span>
          {r.is_captain && <span className="text-orange text-[12px] font-bold ml-1">К</span>}
          {r.is_assistant && <span className="text-orange text-[12px] font-bold ml-1">А</span>}
        </button>
      )},
      { label: '#', width: 'w-[30px]', render: (r) => (
        <span className={`text-[13px] font-bold ${duplicates.has(r.jersey_number) ? 'text-status-rejected animate-pulse' : 'text-graphite/80'}`}>{r.jersey_number || '-'}</span>
      )},
      { label: '', width: 'w-[40px]', render: (r) => <span className="text-[10px] font-semibold text-graphite/50 uppercase">{POS_MAP[r.position_in_line] || '-'}</span> }
    ];

    const staffColumns = [
      { label: 'Фото', width: 'w-[80px]', render: (r) => ( <img src={getImageUrl(r.photo_url || r.avatar_url || '/default/user_default.webp')} className="w-7 h-7 rounded object-cover bg-graphite/5" alt="" /> )},
      { label: 'Представитель', sortKey: 'last_name', render: (r) => <span className="text-[13px] font-semibold text-graphite/85">{r.last_name} {r.first_name}</span> },
      { label: 'Должность', sortKey: 'roles', render: (r) => (
        <div className="flex flex-col gap-1 py-1">
          {r.roles ? r.roles.split(', ').map((role, i) => (
            <span key={i} className="text-[9px] font-bold text-graphite/60 uppercase tracking-wider leading-tight">{ROLE_MAP[role] || role}</span>
          )) : <span className="text-[9px] font-bold text-orange uppercase tracking-wider leading-tight">Представитель</span>}
        </div>
      )}
    ];

    return (
      <div className="bg-white/70 p-6 pt-5 rounded-xxl border border-graphite/10 shadow-sm flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-graphite/10 pb-3 mb-4 shrink-0">
          <span className="text-[12px] font-black uppercase text-graphite/40 tracking-widest">{side === 'home' ? 'Хозяева' : 'Гости'}</span>
        </div>
        <div className="flex-1 mb-6 flex flex-col">
          {sortedRoster.length > 0 ? (
            <div className="mb-6"><Table columns={rosterColumns} data={sortedRoster} hideHeader={true} /></div>
          ) : (
            <div className="bg-white/40 rounded-xl border border-dashed border-graphite/10 p-8 flex flex-col items-center justify-center text-center mb-6 min-h-[120px]">
              <span className="text-[12px] font-medium text-graphite-light">Состав не сформирован</span>
            </div>
          )}
          {staff.length > 0 && (
            <div className="mt-2">
              <h4 className="text-[10px] font-black uppercase text-graphite/40 tracking-wider mb-2 px-2">Тренеры и персонал</h4>
              <div><Table columns={staffColumns} data={staff} hideHeader={true} /></div>
            </div>
          )}
        </div>
        {canManageRoster && canEditRosters && (
          <div className="pt-4 border-t border-graphite/10 shrink-0 mt-auto">
            <Button onClick={() => setRosterModalState({ isOpen: true, teamId, teamName })} className="w-full">
              {roster.length > 0 ? 'Изменить состав' : 'Заполнить состав'}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- ЛОГИКА ТАЙМЛАЙНА ---
  const sortedEvents = [...events].sort((a, b) => {
    const periodOrder = { '1': 1, '2': 2, '3': 3, 'OT': 4, 'SO': 5 };
    if (periodOrder[a.period] !== periodOrder[b.period]) {
      return periodOrder[a.period] - periodOrder[b.period];
    }
    return a.time_seconds - b.time_seconds;
  });

  let currentHomeScore = 0;
  let currentAwayScore = 0;
  const periodNames = { '1': '1-й период', '2': '2-й период', '3': '3-й период', 'OT': 'Овертайм', 'SO': 'Буллиты' };
  
  const groupedEvents = sortedEvents.reduce((acc, ev) => {
    if (ev.event_type === 'goal') {
      if (ev.team_id === game?.home_team_id) currentHomeScore++;
      else if (ev.team_id === game?.away_team_id) currentAwayScore++;
    }
    
    if (!acc[ev.period]) acc[ev.period] = [];
    acc[ev.period].push({
      ...ev,
      runningScore: `${currentHomeScore}:${currentAwayScore}`
    });
    return acc;
  }, {});
  // --- КОНЕЦ ЛОГИКИ ТАЙМЛАЙНА ---

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header 
        title="Матч" 
        subtitle={
          <button onClick={() => navigate('/games')} className="flex items-center gap-2 text-[14px] font-bold text-graphite-light hover:text-orange transition-colors">
            ← К списку матчей
          </button>
        } 
        actions={
          canEditGameInfo && (
            <Button onClick={() => setIsEditInfoDrawerOpen(true)}>
              Настройки матча
            </Button>
          )
        }
      />

      {isLoading || !game ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
          <Loader text="Загрузка данных матча..." />
        </div>
      ) : (
        <div className="flex items-start px-6 md:px-10 pt-8 gap-8 relative z-10 w-full">
          
          {/* ЛЕВАЯ КОЛОНКА - Основной контент */}
          <div className="flex-1 relative z-10 flex flex-col min-w-0 gap-6">
            
            {/* Скорборд (Табло) */}
            <div className="bg-white/85 rounded-xxl shadow-sm border border-graphite/10 p-6 md:p-8 animate-fade-in-down">
              <div className="flex items-center justify-between mb-8">
                {/* Хозяева */}
                <div className="flex-1 flex items-center justify-end gap-5">
                  <span className="text-[18px] md:text-[22px] font-black text-graphite text-right leading-tight">{game.home_team_name}</span>
                  <img src={getImageUrl(game.home_team_logo || '/default/Logo_team_default.webp')} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-sm" alt="Home" />
                </div>

                {/* Счет */}
                <div className="w-[160px] md:w-[200px] shrink-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-graphite-light uppercase tracking-widest mb-2 text-center truncate w-full">{game.division_name}</span>
                  <div className="flex items-center justify-center gap-3 text-[40px] md:text-[52px] font-black tracking-tighter leading-none text-graphite">
                    <span className="w-12 md:w-16 text-right">{game.status === 'scheduled' ? '-' : game.home_score}</span>
                    <span className="text-graphite/20 pb-2 md:pb-3">:</span>
                    <span className="w-12 md:w-16 text-left">{game.status === 'scheduled' ? '-' : game.away_score}</span>
                  </div>
                </div>

                {/* Гости */}
                <div className="flex-1 flex items-center justify-start gap-5">
                  <img src={getImageUrl(game.away_team_logo || '/default/Logo_team_default.webp')} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-sm" alt="Away" />
                  <span className="text-[18px] md:text-[22px] font-black text-graphite text-left leading-tight">{game.away_team_name}</span>
                </div>
              </div>

              {/* Табы и Смена статуса в одной строке */}
              <div className="flex items-center justify-between border-t border-graphite/5 pt-4">
                <div className="flex items-center gap-4">
                  <Tabs tabs={['Составы', 'Судьи', 'Ход игры']} activeTab={tabIndex} onChange={setTabIndex} />
                </div>
                {getStatusBadge()}
              </div>
            </div>

            {/* Контент вкладок */}
            <div className="animate-fade-in-down">
              
              {/* ВКЛАДКА: Составы */}
              {tabIndex === 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start w-full">
                  {renderTeamCard('home', game.home_team_name, homeRoster, homeStaff, game.home_team_id)}
                  {renderTeamCard('away', game.away_team_name, awayRoster, awayStaff, game.away_team_id)}
                </div>
              )}

              {/* ВКЛАДКА: Судьи */}
              {tabIndex === 1 && (
                <div className="bg-white/85 p-8 rounded-xxl border border-graphite/10 shadow-sm w-full min-h-[400px]">
                  <div className="flex justify-between items-center mb-10 border-b border-graphite/5 pb-4">
                    <h3 className="font-black text-[16px] uppercase text-graphite tracking-wide">Назначения на матч</h3>
                    {canManageOfficials && isScheduled && (
                      <Button onClick={() => setIsOfficialsModalOpen(true)}>
                        {hasOfficials ? 'Изменить бригаду' : '+ Назначить судей'}
                      </Button>
                    )}
                  </div>
                  
                  {hasOfficials ? (
                    <div className="flex flex-col gap-8">
                      
                      {/* 1. Главные судьи */}
                      <div>
                         <h4 className="text-[11px] font-black text-graphite/40 uppercase tracking-widest mb-4 px-1">Главные судьи</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <OfficialCard label="Главный судья" official={officials.head_1} />
                           <OfficialCard label="Главный судья" official={officials.head_2} />
                         </div>
                      </div>

                      {/* 2. Линейные судьи */}
                      <div>
                         <h4 className="text-[11px] font-black text-graphite/40 uppercase tracking-widest mb-4 px-1">Линейные судьи</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <OfficialCard label="Линейный судья" official={officials.linesman_1} />
                           <OfficialCard label="Линейный судья" official={officials.linesman_2} />
                         </div>
                      </div>

                      {/* 3. Секретарь */}
                      <div>
                         <h4 className="text-[11px] font-black text-graphite/40 uppercase tracking-widest mb-4 px-1">Секретариат</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <OfficialCard label="Секретарь матча" official={officials.scorekeeper} />
                         </div>
                      </div>

                      {/* 4. Медиа */}
                      <div>
                         <h4 className="text-[11px] font-black text-graphite/40 uppercase tracking-widest mb-4 px-1">Медиа</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <OfficialCard label="Фото / Видео" official={officials.media} />
                         </div>
                      </div>

                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-graphite-light bg-white/40 border border-dashed border-graphite/10 rounded-xl">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                        <Icon name="whistle" className="w-8 h-8 text-graphite/20" />
                      </div>
                      <span className="text-[14px] font-bold text-graphite/60 mb-1">Бригада арбитров не назначена</span>
                      <span className="text-[12px] font-medium text-graphite/40">Нажмите «Назначить судей» для формирования бригады</span>
                    </div>
                  )}
                </div>
              )}

              {/* ВКЛАДКА: Ход игры */}
              {tabIndex === 2 && (
                <div className="bg-white/85 p-8 rounded-xxl border border-graphite/10 shadow-sm w-full min-h-[400px]">
                  <div className="flex justify-between items-center mb-10 border-b border-graphite/5 pb-4">
                    <h3 className="font-black text-[16px] uppercase text-graphite tracking-wide">Протокол</h3>
                    {canOpenLiveDesk && (
                      <Button onClick={() => window.open(`/games/${game.id}/live-desk`, '_blank')}>
                        Панель секретаря
                      </Button>
                    )}
                  </div>

                  {events.length > 0 ? (
                    <div className="relative mx-auto max-w-4xl">
                      {/* Центральная линия */}
                      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-graphite/10 -translate-x-1/2 rounded-full"></div>

                      {['1', '2', '3', 'OT', 'SO'].filter(p => groupedEvents[p]).map(period => (
                        <div key={period} className="mb-10 relative z-10">
                          {/* Плашка периода */}
                          <div className="flex justify-center mb-8 sticky top-[140px] z-20">
                            <div className="bg-graphite text-white px-6 py-2.5 rounded-full text-[12px] font-black uppercase tracking-widest shadow-md border border-white/20 backdrop-blur-md">
                              {periodNames[period]}
                            </div>
                          </div>

                          <div className="space-y-8">
                            {groupedEvents[period].map(ev => {
                              const isGoal = ev.event_type === 'goal';
                              const isHome = ev.team_id === game.home_team_id;

                              return (
                                <div key={ev.id} className={`flex items-center w-full group ${isHome ? 'justify-start' : 'justify-end'}`}>
                                  
                                  {/* Левая сторона */}
                                  <div className={`w-[45%] flex ${isHome ? 'justify-end' : 'justify-end pr-8'} items-center`}>
                                    {isHome ? (
                                      <EventCard ev={ev} isHome={isHome} />
                                    ) : (
                                      isGoal && <ScoreBadge score={ev.runningScore} />
                                    )}
                                  </div>

                                  {/* Центральная ось: Иконка события + Время */}
                                  <div className="w-[10%] min-w-[80px] flex justify-center relative z-10 shrink-0">
                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border-[3px] border-white shadow-md transition-transform group-hover:scale-110 ${isGoal ? 'bg-status-accepted text-white' : 'bg-orange text-white'}`}>
                                      <Icon name={isGoal ? 'puck' : 'whistle'} className="w-3.5 h-3.5 shrink-0" />
                                      <span className="text-[12px] font-black leading-none tracking-tight">{formatTime(ev.time_seconds)}</span>
                                    </div>
                                  </div>

                                  {/* Правая сторона */}
                                  <div className={`w-[45%] flex ${!isHome ? 'justify-start' : 'justify-start pl-8'} items-center`}>
                                    {!isHome ? (
                                      <EventCard ev={ev} isHome={isHome} />
                                    ) : (
                                      isGoal && <ScoreBadge score={ev.runningScore} />
                                    )}
                                  </div>

                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-graphite-light bg-white/40 border border-dashed border-graphite/10 rounded-xl">
                      <span className="text-[13px] font-medium text-graphite/60">Событий пока нет</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ПРАВАЯ КОЛОНКА - Сайдбар */}
          <div className="w-[260px] shrink-0 sticky top-[128px] bg-white/30 backdrop-blur-md rounded-xxl p-5 flex flex-col gap-5 shadow-sm border border-white/50 z-20 animate-fade-in">
            
            <div className="flex flex-col gap-4 bg-white/60 p-4 rounded-xl border border-graphite/5">
              <div className="flex justify-between items-center mb-1">
                 <span className="text-[10px] font-black uppercase text-graphite-light tracking-widest">Информация</span>
              </div>
              
              <div>
                <div className="text-[10px] text-graphite-light mb-0.5">Дата и время</div>
                <div className="text-[13px] font-bold text-graphite">{gameDate.isValid() ? gameDate.format('DD MMMM YYYY, HH:mm') : 'Не назначено'}</div>
              </div>
              
              <div>
                <div className="text-[10px] text-graphite-light mb-0.5">Арена</div>
                <div className="text-[13px] font-bold text-graphite leading-tight">{game.location_text || 'Не назначена'}</div>
              </div>

              <div>
                <div className="text-[10px] text-graphite-light mb-0.5">Этап</div>
                <div className="text-[12px] font-bold text-graphite leading-tight mb-0.5">{game.stage_label || (game.stage_type === 'regular' ? 'Регулярный чемпионат' : 'Плей-офф')}</div>
                <div className="text-[11px] font-bold text-graphite/50">{game.stage_type === 'regular' ? 'Тур' : 'Матч'} {game.series_number || 1}</div>
              </div>
            </div>

            <div className="bg-white/60 p-4 rounded-xl border border-graphite/5 flex items-center justify-between">
              <div className="flex flex-col items-center gap-1">
                  <img src={getJerseyUrl('home', game.home_jersey_type)} className="w-16 h-16 object-contain mix-blend-multiply drop-shadow-sm" alt="jersey" />
                  <span className="text-[9px] font-bold text-graphite uppercase">{game.home_jersey_type === 'dark' ? 'Темная' : 'Светлая'}</span>
              </div>
              <span className="text-[10px] font-black text-graphite/30 uppercase">VS</span>
              <div className="flex flex-col items-center gap-1">
                  <img src={getJerseyUrl('away', game.away_jersey_type)} className="w-16 h-16 object-contain mix-blend-multiply drop-shadow-sm" alt="jersey" />
                  <span className="text-[9px] font-bold text-graphite uppercase">{game.away_jersey_type === 'dark' ? 'Темная' : 'Светлая'}</span>
              </div>
            </div>

            {/* БЛОК УПРАВЛЕНИЯ ТРАНСЛЯЦИЕЙ */}
            {canManageGraphics && (
              <div className="flex flex-col gap-3 bg-white/60 p-4 rounded-xl border border-graphite/5">
                <span className="text-[10px] font-black uppercase text-graphite-light tracking-widest mb-1">Веб-Графика</span>
                <button 
                  onClick={() => window.open(`/games/${gameId}/graphics-panel`, '_blank')}
                  className="bg-blue-500 text-white w-full py-2.5 rounded-xl text-[12px] font-bold hover:bg-blue-600 transition-colors shadow-sm"
                >
                  Панель трансляции
                </button>
                <button 
                  onClick={handleCopyOBSLink}
                  className="bg-graphite text-white w-full py-2.5 rounded-xl text-[12px] font-bold hover:bg-graphite/90 transition-colors shadow-sm"
                >
                  {obsCopied ? 'Ссылка скопирована!' : 'Ссылка для OBS'}
                </button>
              </div>
            )}

            {/* Блок медиа ссылок (ВК/YouTube) */}
            {(game.video_yt_url || game.video_vk_url) && (
              <div className="flex flex-col gap-2 bg-white/60 p-4 rounded-xl border border-graphite/5">
                <span className="text-[10px] font-black uppercase text-graphite-light tracking-widest mb-1">Медиа</span>
                {game.video_yt_url && <a href={game.video_yt_url} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-red-500 hover:underline flex items-center gap-2"><div className="w-2 h-2 bg-red-500 rounded-full"></div>YouTube трансляция</a>}
                {game.video_vk_url && <a href={game.video_vk_url} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-blue-500 hover:underline flex items-center gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full"></div>VK Видео</a>}
              </div>
            )}
          </div>
        </div>
      )}

      {game && (
        <>
          <GameStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} game={game} onSuccess={loadAllData} />
          <GameRosterModal isOpen={rosterModalState.isOpen} onClose={() => setRosterModalState({ isOpen: false, teamId: null, teamName: '' })} gameId={game.id} teamId={rosterModalState.teamId} teamName={rosterModalState.teamName} onSuccess={loadAllData} />
          <ManageOfficialsModal isOpen={isOfficialsModalOpen} onClose={() => setIsOfficialsModalOpen(false)} gameId={game.id} initialOfficials={game.officials} onSuccess={loadAllData} />
          <EditGameInfoDrawer isOpen={isEditInfoDrawerOpen} onClose={() => setIsEditInfoDrawerOpen(false)} game={game} arenas={arenas} onSuccess={loadAllData} />
        </>
      )}

      <PlayerProfileModal isOpen={!!selectedPlayerId} onClose={() => setSelectedPlayerId(null)} playerId={selectedPlayerId} />
    </div>
  );
}

// --- ЛОКАЛЬНЫЕ КОМПОНЕНТЫ ---

// Унифицированная карточка судьи
const OfficialCard = ({ label, official }) => {
  if (!official) {
    return (
      <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/40 border border-dashed border-graphite/20 w-full h-[72px]">
         <div className="w-10 h-10 rounded-full bg-graphite/5 flex items-center justify-center shrink-0">
            <Icon name="player" className="w-4 h-4 text-graphite/20" />
         </div>
         <div className="flex flex-col items-start min-w-0">
            <span className="text-[9px] font-black uppercase text-graphite/30 tracking-widest mb-0.5">{label}</span>
            <span className="text-[13px] font-medium text-graphite/40">Не назначен</span>
         </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-graphite/5 shadow-sm hover:shadow-md transition-shadow group w-full h-[72px]">
      <img src={getImageUrl(official.avatar_url || '/default/user_default.webp')} className="w-14 h-14 rounded-lg object-cover bg-graphite/10 transition-transform group-hover:scale-105 shrink-0" alt="" />
      <div className="flex flex-col min-w-0 flex-1">
         <span className="text-[9px] font-black uppercase tracking-widest mb-0.5 text-graphite/40">{label}</span>
         <span className="text-[14px] font-bold text-graphite leading-tight truncate">{official.name}</span>
      </div>
    </div>
  );
};

// Компоненты таймлайна
const ScoreBadge = ({ score }) => (
  <div className="bg-graphite/5 px-4 py-1.5 rounded-xl border border-graphite/10 text-[18px] font-black text-graphite/80 tracking-widest shadow-inner">
    {score}
  </div>
);

const EventCard = ({ ev, isHome }) => {
  const isGoal = ev.event_type === 'goal';

  return (
    <div className={`flex items-start gap-4 p-4 rounded-xxl border ${isGoal ? 'border-status-accepted/20 bg-gradient-to-br from-white to-status-accepted/5' : 'border-orange/20 bg-gradient-to-br from-white to-orange/5'} shadow-sm hover:shadow-md transition-all w-full max-w-[340px] ${isHome ? 'flex-row' : 'flex-row-reverse text-right'}`}>
      <div className="relative shrink-0 mt-1">
        <img 
          src={getImageUrl(ev.primary_photo_url || ev.primary_avatar_url || '/default/user_default.webp')} 
          className="w-14 h-14 rounded-lg bg-graphite/10 object-cover border-2 border-white shadow-sm" 
          alt="" 
        />
      </div>
      
      <div className={`flex flex-col flex-1 min-w-0 ${isHome ? 'items-start' : 'items-end'}`}>
        <div className={`flex items-center gap-2 mb-1.5 w-full ${isHome ? 'justify-start' : 'justify-end'}`}>
          {isGoal && ev.goal_strength !== 'equal' && (
            <span className="text-[9px] font-bold text-orange uppercase bg-orange/10 px-1.5 py-0.5 rounded shadow-sm">
               {ev.goal_strength === 'pp' ? 'Бол.' : ev.goal_strength === 'sh' ? 'Мен.' : ev.goal_strength === 'en' ? 'П.В.' : 'Буллит'}
            </span>
          )}
          {!isGoal && (
             <span className="text-[9px] font-bold text-orange uppercase bg-orange/10 px-1.5 py-0.5 rounded shadow-sm">
               {ev.penalty_minutes} мин
             </span>
          )}
        </div>

        <span className="text-[15px] font-bold text-graphite leading-tight mb-1 truncate w-full">{ev.primary_last_name} {ev.primary_first_name}</span>
        
        {isGoal ? (
          (ev.assist1_id || ev.assist2_id) && (
            <div className={`flex flex-col gap-0.5 mt-1.5 w-full ${isHome ? 'items-start text-left' : 'items-end text-right'}`}>
              <span className="text-[9px] font-black text-graphite/40 uppercase mb-0.5">Ассистенты:</span>
              {ev.assist1_id && (
                <span className="text-[11px] font-semibold text-graphite/60 leading-tight">
                  {ev.assist1_last_name} {ev.assist1_first_name ? `${ev.assist1_first_name.charAt(0)}.` : ''}
                </span>
              )}
              {ev.assist2_id && (
                <span className="text-[11px] font-semibold text-graphite/60 leading-tight">
                  {ev.assist2_last_name} {ev.assist2_first_name ? `${ev.assist2_first_name.charAt(0)}.` : ''}
                </span>
              )}
            </div>
          )
        ) : (
          <span className="text-[11px] font-medium text-graphite/60 mt-0.5 truncate w-full">{ev.penalty_violation || 'Нарушение правил'}</span>
        )}
      </div>
    </div>
  );
};