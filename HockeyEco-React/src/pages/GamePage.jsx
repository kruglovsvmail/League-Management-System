import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useOutletContext, Link } from 'react-router-dom';
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
import { AccessFallback } from '../ui/AccessFallback';

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
  const { checkAccess, checkMatchEditAccess } = useAccess();
  
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
  const [isRecalculating, setIsRecalculating] = useState(false);

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

  const gameStaffArray = useMemo(() => {
    if (!game?.officials) return [];
    return Object.entries(game.officials)
      .filter(([role, off]) => off && off.id)
      .map(([role, off]) => ({ user_id: off.id, role }));
  }, [game]);

  // ==========================================================================
  // ПРОВЕРКИ ПРАВ ДОСТУПА (С УЧЕТОМ ВРЕМЕНИ И ПОДПИСЕЙ СЕКРЕТАРЯ)
  // ==========================================================================
  const matchEditAccess = game ? checkMatchEditAccess(game, gameStaffArray) : { hasAccess: false };

  const canView = checkAccess('MATCH_PAGE_VIEW', { gameStaff: gameStaffArray });
  const canEditGameInfo = checkAccess('MATCH_EDIT_INFO');
  
  // Статус и Составы могут менять только те, у кого есть базовая роль И открыт доступ (не заблокировано подписью/временем)
  const baseCanManageStatus = checkAccess('MATCH_STATUS_CHANGE', { gameStaff: gameStaffArray });
  const canManageStatus = baseCanManageStatus && matchEditAccess.hasAccess;
  
  const baseCanManageRoster = checkAccess('MATCH_ROSTER_FILL', { gameStaff: gameStaffArray });
  const canManageRoster = baseCanManageRoster && matchEditAccess.hasAccess;

  const canManageOfficials = checkAccess('MATCH_ASSIGN_STAFF');
  const canManageGraphics = checkAccess('MATCH_WEB_GRAPHICS_PANEL', { gameStaff: gameStaffArray });

  // Логика кнопки Панели Секретаря:
  // Если права есть, мы рендерим кнопку.
  // Разрешаем вход (canEnterLiveDesk), если доступ открыт (matchEditAccess.hasAccess) ИЛИ протокол уже подписан (входим в режиме чтения)
  const hasProtocolAccess = checkAccess('MATCH_SECRETARY_PANEL_ENTER', { gameStaff: gameStaffArray });
  const canEnterLiveDesk = hasProtocolAccess && (matchEditAccess.hasAccess || game?.is_protocol_signed);

  const isScheduled = game?.status === 'scheduled';
  const canEditRosters = isScheduled || game?.status === 'live'; 

  const gameDate = game ? dayjs(game.game_date) : dayjs();
  const officials = game?.officials || {}; 
  const hasOfficials = Object.values(officials).some(val => val && (typeof val === 'object' ? val.name : val.trim() !== ''));

  const handleCopyOBSLink = () => {
    const obsLink = `${window.location.origin}/games/${game.id}/graphics`;
    navigator.clipboard.writeText(obsLink);
    setObsCopied(true);
    setTimeout(() => setObsCopied(false), 2000);
  };

  const handleRecalculate = async (e) => {
    e.stopPropagation();
    setIsRecalculating(true);
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${game.id}/recalculate`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (res.ok) await loadAllData();
    } catch (err) { console.error(err); } 
    finally { setIsRecalculating(false); }
  };

  const getStatusBadge = () => {
    if (!game) return null;
    let badgeClass = "flex items-center w-[180px] justify-center px-4 py-2.5 rounded-lg text-[12px] font-bold tracking-widest uppercase transition-all duration-300 border border-transparent shrink-0 ";
    let content = "";

    switch (game.status) {
      case 'live': 
        content = "Идет сейчас"; 
        if (canManageStatus) {
          badgeClass += "bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white cursor-pointer group shadow-sm";
        } else {
          badgeClass += "bg-blue-500/5 text-blue-500/70 cursor-default";
        }
        break;
      case 'finished': 
        if (game.needs_recalc && canManageStatus) {
            content = isRecalculating ? "Пересчет..." : "Пересчет"; 
            badgeClass += isRecalculating 
              ? "bg-status-accepted/10 text-status-accepted/50 cursor-wait w-[180px]" 
              : "bg-status-accepted/10 text-status-accepted hover:bg-status-accepted hover:text-white cursor-pointer group shadow-sm w-[180px]"; 
            
            return (
                <button className={badgeClass} onClick={handleRecalculate} disabled={isRecalculating} title="Пересчитать статистику">
                    <span>{content}</span>
                    {isRecalculating ? (
                       <svg className="w-4 h-4 ml-2 animate-spin shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                       <Icon name="refresh" className="w-4 h-4 ml-2 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" />
                    )}
                </button>
            );
        } else {
            content = "Завершен"; 
            if (canManageStatus) {
              badgeClass += "bg-status-accepted/10 text-status-accepted hover:bg-status-accepted hover:text-white cursor-pointer group shadow-sm"; 
            } else {
              badgeClass += "bg-status-accepted/5 text-status-accepted/70 cursor-default"; 
            }
        }
        break;
      case 'cancelled': 
        content = "Матч отменен"; 
        if (canManageStatus) {
          badgeClass += "bg-status-rejected/10 text-status-rejected hover:bg-status-rejected hover:text-white cursor-pointer group shadow-sm"; 
        } else {
          badgeClass += "bg-status-rejected/5 text-status-rejected/70 cursor-default"; 
        }
        break;
      default: 
        content = "В расписании"; 
        if (canManageStatus) {
          badgeClass += "bg-orange/10 text-orange hover:bg-orange hover:text-white cursor-pointer group shadow-sm"; 
        } else {
          badgeClass += "bg-orange/5 text-orange/70 cursor-default"; 
        }
        break;
    }

    if (canManageStatus) {
      return (
        <button className={badgeClass} onClick={() => setIsStatusModalOpen(true)} title="Изменить статус матча">
          <span>{content}</span>
          <Icon name="edit" className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity ml-2 shrink-0" />
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

    const countG = roster.filter(r => r.position_in_line === 'G').length;
    const countD = roster.filter(r => ['LD', 'RD'].includes(r.position_in_line)).length;
    const countF = roster.filter(r => ['LW', 'C', 'RW'].includes(r.position_in_line)).length;
    const totalPlayers = roster.length;

    const rosterColumns = [
      { label: 'Фото', width: 'w-[80px]', align: 'left', render: (r) => ( <img src={getImageUrl(r.photo_url || r.avatar_url || '/default/user_default.webp')} className="w-7 h-7 rounded object-cover bg-graphite/10" alt="" /> )},
      { label: 'Игрок',  align: 'left',  render: (r) => (
        <button onClick={() => setSelectedPlayerId(r.player_id)} className="text-[13px] font-semibold text-graphite/85 hover:text-orange transition-colors flex items-center gap-1 truncate text-left">
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
      <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-xxl p-6 pt-5 shadow-sm flex flex-col h-full animate-zoom-in">
        <div className="flex items-center justify-between border-b border-graphite/10 pb-3 mb-4 shrink-0">
          <div className="flex flex-wrap items-center gap-3 w-full justify-between">
             <span className="text-[12px] font-black uppercase text-graphite/40 tracking-widest">{side === 'home' ? 'Хозяева' : 'Гости'}</span>
             
             {totalPlayers > 0 && (
               <div className="flex items-center gap-1 text-[10px] font-bold text-graphite/40 tracking-wider">
                 <span>Вр: {countG}</span>
                 <span className="text-graphite/30 px-0.5">|</span>
                 <span>Защ: {countD}</span>
                 <span className="text-graphite/30 px-0.5">|</span>
                 <span>Нап: {countF}</span>
               </div>
             )}
          </div>
        </div>
        <div className="flex-1 mb-6 flex flex-col">
          {sortedRoster.length > 0 ? (
            <div className="mb-6"><Table columns={rosterColumns} data={sortedRoster} hideHeader={true} /></div>
          ) : (
            <div className="p-8 flex flex-col items-center justify-center text-center mb-6 min-h-[120px]">
              <span className="text-[14px] font-medium text-graphite-light">Состав не сформирован</span>
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

  const getPeriodScoresString = () => {
    if (!game || !game.period_scores || game.status === 'scheduled' || game.status === 'cancelled') return null;
    
    const pCount = game.periods_count || 3;
    const scores = game.period_scores;
    const parts = [];

    for (let i = 1; i <= pCount; i++) {
        const h = scores[i]?.home || 0;
        const a = scores[i]?.away || 0;
        parts.push({ text: `${h}:${a}` });
    }

    if (scores['OT'] && (scores['OT'].home > 0 || scores['OT'].away > 0)) {
        parts.push({ text: `${scores['OT'].home}:${scores['OT'].away}`, label: 'ОТ' });
    }

    if (parts.length === 0) return null;

    return (
        <div className="flex items-center justify-center gap-2.5 mt-3">
            <div className="w-[1px] h-3 bg-graphite/20 rounded-full"></div>
            
            {parts.map((part, index) => (
                <React.Fragment key={index}>
                    <span className="flex items-center gap-1.5 text-[14px] font-bold text-graphite/80 tracking-widest leading-none">
                        {part.label && <span className="text-[11px] font-black text-graphite/40 tracking-normal uppercase">{part.label}</span>}
                        {part.text}
                    </span>
                    <div className="w-[1px] h-3 bg-graphite/20 rounded-full"></div>
                </React.Fragment>
            ))}
        </div>
    );
  };

  const isHomeSO = game?.status === 'finished' && game?.end_type === 'so' && game?.home_score > game?.away_score;
  const isAwaySO = game?.status === 'finished' && game?.end_type === 'so' && game?.away_score > game?.home_score;

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header 
        title="Матч" 
        subtitle={
          <Link to="/games" className="flex items-center gap-1.5 text-[14px] font-bold text-graphite-light hover:text-orange transition-colors">
            <Icon name="chevron_left" className="w-4 h-4" /> К списку матчей
          </Link>
        } 
      />

      {isLoading || !game ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] animate-zoom-in">
          <Loader text="" />
        </div>
      ) : !canView ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] animate-zoom-in px-10">
          <AccessFallback variant="full" message="У вас нет прав для просмотра страницы этого матча." />
        </div>
      ) : (
        <div className="flex items-start px-6 md:px-10 pt-8 gap-8 relative z-10 w-full">
          
          <div className="flex-1 relative z-10 flex flex-col min-w-0 gap-6">
            
            <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-xxl shadow-sm p-6 md:p-6 animate-zoom-in">
              <div className="flex items-center justify-between mb-8 flex-1">
                {/* Хозяева */}
                <div className="flex-1 flex items-center justify-end gap-5">
                  <span className="text-[18px] md:text-[22px] font-black text-graphite text-right leading-tight">{game.home_team_name}</span>
                  <img src={getImageUrl(game.home_team_logo || '/default/Logo_team_default.webp')} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-sm" alt="Home" />
                </div>

                {/* Центральный блок Счета */}
                <div className="w-[160px] md:w-[220px] shrink-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-graphite-light uppercase tracking-widest mb-2 text-center truncate w-full">{game.division_name}</span>
                  
                  {game.is_technical ? (
                    <>
                      <div className="relative inline-flex items-center justify-center text-[40px] md:text-[52px] font-black tracking-tighter leading-none text-status-rejected">
                        <span className="w-12 md:w-16 flex justify-end">
                          {typeof game.is_technical === 'string' ? game.is_technical.split('/')[0] : '+'}
                        </span>
                        <span className="text-graphite/20 mx-3 md:mx-4 relative -top-1 md:-top-1.5">:</span>
                        <span className="w-12 md:w-16 flex justify-start">
                          {typeof game.is_technical === 'string' ? game.is_technical.split('/')[1] : '-'}
                        </span>
                      </div>
                      <div className="mt-3 text-[10px] font-black text-status-rejected uppercase tracking-widest bg-status-rejected/10 px-3 py-1.5 rounded-lg border border-status-rejected/20 text-center leading-tight">
                        Технический результат
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative inline-flex items-center justify-center gap-3 text-[40px] md:text-[52px] font-black tracking-tighter leading-none text-graphite">
                        {isHomeSO && <span className="absolute right-full mt-2 mr-0 text-[20px] md:text-[24px] text-orange top-1/2 -translate-y-1/2">Б</span>}
                        
                        <span className="w-12 md:w-16 text-right">{game.status === 'scheduled' ? '-' : game.home_score}</span>
                        <span className="text-graphite/20 pb-2 md:pb-3">:</span>
                        <span className="w-12 md:w-16 text-left">{game.status === 'scheduled' ? '-' : game.away_score}</span>
                        
                        {isAwaySO && <span className="absolute left-full mt-2 ml-0 text-[20px] md:text-[24px] text-orange top-1/2 -translate-y-1/2">Б</span>}
                      </div>
                      {getPeriodScoresString()}
                    </>
                  )}
                </div>

                {/* Гости */}
                <div className="flex-1 flex items-center justify-start gap-5">
                  <img src={getImageUrl(game.away_team_logo || '/default/Logo_team_default.webp')} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-sm" alt="Away" />
                  <span className="text-[18px] md:text-[22px] font-black text-graphite text-left leading-tight">{game.away_team_name}</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-graphite/5 pt-4 mt-auto shrink-0">
                <div className="flex items-center gap-4">
                  <Tabs tabs={['Составы команд', 'Судьи и медиа ', 'Ход матча']} activeTab={tabIndex} onChange={setTabIndex} />
                </div>
                {getStatusBadge()}
              </div>
            </div>

            <div className="animate-zoom-in">
              
              {tabIndex === 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start w-full">
                  {renderTeamCard('home', game.home_team_name, homeRoster, homeStaff, game.home_team_id)}
                  {renderTeamCard('away', game.away_team_name, awayRoster, awayStaff, game.away_team_id)}
                </div>
              )}

              {tabIndex === 1 && (
                <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-xxl p-8 shadow-sm w-full min-h-[400px] animate-zoom-in">
                  <div className="flex justify-between items-center mb-10 border-b border-graphite/5 pb-4">
                    <h3 className="font-black text-[16px] uppercase text-graphite tracking-wide">Обслуживающие матч</h3>
                  </div>
                  
                  {hasOfficials ? (
                    <div className="flex flex-col gap-8">
                      <div>
                         <h4 className="text-[11px] font-black text-graphite/40 uppercase tracking-widest mb-4 px-1">Главные судьи</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <OfficialCard label="Главный судья" official={officials.head_1} />
                           <OfficialCard label="Главный судья" official={officials.head_2} />
                         </div>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-graphite/40 uppercase tracking-widest mb-4 px-1">Линейные судьи</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <OfficialCard label="Линейный судья" official={officials.linesman_1} />
                           <OfficialCard label="Линейный судья" official={officials.linesman_2} />
                         </div>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-graphite/40 uppercase tracking-widest mb-4 px-1">Секретариат</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <OfficialCard label="Секретарь матча" official={officials.scorekeeper} />
                         </div>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-graphite/40 uppercase tracking-widest mb-4 px-1">Медиа</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <OfficialCard label="Фото / Видео" official={officials.media} />
                         </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-graphite-light border border-dashed border-graphite/10 rounded-xl">
                      <span className="text-[14px] font-medium text-graphite/60 mb-1">Бригада арбитров не назначена</span>
                    </div>
                  )}
                </div>
              )}

              {tabIndex === 2 && (
                <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-xxl p-8 shadow-sm w-full min-h-[400px] animate-zoom-in">
                  <div className="flex justify-between items-center mb-10 border-b border-graphite/5 pb-4">
                    <h3 className="font-black text-[16px] uppercase text-graphite tracking-wide">Ход Матча</h3>
                  </div>

                  {events.length > 0 ? (
                    <div className="relative mx-auto max-w-4xl">
                      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-graphite/10 -translate-x-1/2 rounded-full"></div>

                      {['1', '2', '3', 'OT', 'SO'].filter(p => groupedEvents[p]).map(period => (
                        <div key={period} className="mb-10 relative z-10">
                          <div className="flex justify-center mb-8 sticky top-[140px] z-20">
                            <div className="bg-graphite text-white px-6 py-2.5 rounded-full text-[12px] font-black uppercase tracking-widest shadow-md border border-white/20 backdrop-blur-md">
                              {periodNames[period]}
                            </div>
                          </div>

                          <div className="space-y-8">
                            {groupedEvents[period].map(ev => {
                              const isGoal = ev.event_type === 'goal';
                              const isSOGoal = ev.event_type === 'shootout_goal';
                              const isSOMiss = ev.event_type === 'shootout_miss';
                              const isHome = ev.team_id === game.home_team_id;

                              let badgeBg = 'bg-orange text-white';
                              let iconName = 'whistle';
                              if (isGoal || isSOGoal) {
                                badgeBg = 'bg-status-accepted text-white';
                                iconName = 'puck';
                              } else if (isSOMiss) {
                                badgeBg = 'bg-status-rejected text-white';
                                iconName = 'puck'; 
                              }

                              return (
                                <div key={ev.id} className={`flex items-center w-full group ${isHome ? 'justify-start' : 'justify-end'}`}>
                                  <div className={`w-[45%] flex ${isHome ? 'justify-end' : 'justify-end pr-8'} items-center`}>
                                    {isHome ? <EventCard ev={ev} isHome={isHome} /> : isGoal && <ScoreBadge score={ev.runningScore} />}
                                  </div>

                                  <div className="w-[10%] min-w-[80px] flex justify-center relative z-10 shrink-0">
                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border-[3px] border-white shadow-md transition-transform group-hover:scale-110 ${badgeBg}`}>
                                      <Icon name={iconName} className="w-3.5 h-3.5 shrink-0" />
                                      <span className="text-[12px] font-black leading-none tracking-tight">
                                        {period === 'SO' ? 'SO' : formatTime(ev.time_seconds)}
                                      </span>
                                    </div>
                                  </div>

                                  <div className={`w-[45%] flex ${!isHome ? 'justify-start' : 'justify-start pl-8'} items-center`}>
                                    {!isHome ? <EventCard ev={ev} isHome={isHome} /> : isGoal && <ScoreBadge score={ev.runningScore} />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-graphite-light border border-dashed border-graphite/10 rounded-xl">
                      <span className="text-[14px] font-medium text-graphite/60">Событий пока нет</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="w-[260px] shrink-0 sticky top-[128px] bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-xxl p-5 flex flex-col gap-1 shadow-sm z-20 animate-zoom-in">
            
            <div className="flex flex-col gap-4 bg-white/0 py-5 px-3 border-b border-graphite/10">
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

            <div className="bg-white/0 px-3 py-5 border-b border-graphite/10 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                 <span className="text-[10px] font-black uppercase text-graphite-light tracking-widest"></span>
                 {canEditGameInfo && canView && (
                    <button onClick={() => setIsEditInfoDrawerOpen(true)} className="text-graphite-light hover:text-orange transition-colors" title="Редактировать форму и медиа">
                       <Icon name="edit" className="w-3.5 h-3.5" />
                    </button>
                 )}
              </div>

              <div className="flex items-center justify-between">
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

              {(game.video_yt_url || game.video_vk_url) && (
                 <div className="flex gap-10 pt-3">
                    {game.video_yt_url && <a href={game.video_yt_url} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-red-500 hover:underline flex items-center gap-2"><div className="w-2 h-2 bg-red-500 rounded-full"></div>YouTube</a>}
                    {game.video_vk_url && <a href={game.video_vk_url} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-blue-500 hover:underline flex items-center gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full"></div>VK Видео</a>}
                 </div>
              )}
            </div>

            {(hasProtocolAccess || (canManageOfficials && isScheduled)) && (
              <div className="flex flex-col gap-3 bg-white/0 py-6 px-2  border-b border-graphite/10">
                {hasProtocolAccess && (
                   canEnterLiveDesk ? (
                     <Link
                       to={`/games/${game.id}/live-desk`}
                       className="block text-center w-full py-2.5 rounded-xl text-[12px] font-bold transition-all shadow-sm bg-graphite/80 text-white hover:bg-graphite"
                     >
                       {game?.is_protocol_signed ? 'Панель секретаря' : 'Панель секретаря'}
                     </Link>
                   ) : (
                     <button
                       disabled
                       title={matchEditAccess.reason}
                       className="w-full py-2.5 rounded-xl text-[12px] font-bold transition-all shadow-sm bg-graphite/20 text-graphite/50 cursor-not-allowed"
                     >
                       Панель секретаря
                     </button>
                   )
                )}
                {canManageOfficials && isScheduled && (
                   <button 
                     onClick={() => setIsOfficialsModalOpen(true)} 
                     className="bg-graphite/80 text-white w-full py-2.5 rounded-xl text-[12px] font-bold hover:bg-graphite transition-colors shadow-sm"
                   >
                     {hasOfficials ? 'Изменить бригаду' : 'Назначить судей'}
                   </button>
                )}
              </div>
            )}

            {canManageGraphics && (
              <div className="flex flex-col gap-3 bg-white/0 p-2 py-6">
                <Link 
                  to={`/games/${gameId}/graphics-panel`}
                  className="block text-center bg-green-500 text-white w-full py-2.5 rounded-xl text-[12px] font-bold hover:bg-green-600 transition-colors shadow-sm"
                >
                  Панель трансляции
                </Link>
                <button 
                  onClick={handleCopyOBSLink}
                  className="bg-green-500 text-white w-full py-2.5 rounded-xl text-[12px] font-bold hover:bg-green-600 transition-colors shadow-sm"
                >
                  {obsCopied ? 'Ссылка скопирована!' : 'Ссылка для OBS'}
                </button>
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

const ScoreBadge = ({ score }) => (
  <div className="bg-graphite/5 px-4 py-1.5 rounded-xl border border-graphite/10 text-[18px] font-black text-graphite/80 tracking-widest shadow-inner">
    {score}
  </div>
);

const EventCard = ({ ev, isHome }) => {
  const isGoal = ev.event_type === 'goal';
  const isPenalty = ev.event_type === 'penalty';
  const isSOGoal = ev.event_type === 'shootout_goal';
  const isSOMiss = ev.event_type === 'shootout_miss';

  let borderClass = 'border-orange/20';
  let bgClass = 'from-white to-orange/5';

  if (isGoal || isSOGoal) {
    borderClass = 'border-status-accepted/20';
    bgClass = 'from-white to-status-accepted/5';
  } else if (isSOMiss) {
    borderClass = 'border-status-rejected/20';
    bgClass = 'from-white to-status-rejected/5';
  }

  return (
    <div className={`flex items-start gap-4 p-4 rounded-xxl border ${borderClass} bg-gradient-to-br ${bgClass} shadow-sm hover:shadow-md transition-all w-full max-w-[340px] ${isHome ? 'flex-row' : 'flex-row-reverse text-right'}`}>
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
          {isPenalty && (
             <span className="text-[9px] font-bold text-orange uppercase bg-orange/10 px-1.5 py-0.5 rounded shadow-sm">
               {ev.penalty_minutes} мин
             </span>
          )}
          {(isSOGoal || isSOMiss) && (
             <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm ${isSOGoal ? 'text-status-accepted bg-status-accepted/10' : 'text-status-rejected bg-status-rejected/10'}`}>
               Буллит
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
        ) : isPenalty ? (
          <span className="text-[11px] font-medium text-graphite/60 mt-0.5 truncate w-full">{ev.penalty_violation || 'Нарушение правил'}</span>
        ) : (
          <span className={`text-[12px] font-bold mt-0.5 truncate w-full ${isSOGoal ? 'text-status-accepted' : 'text-status-rejected'}`}>
            {isSOGoal ? 'Реализован' : 'Не реализован'}
          </span>
        )}
      </div>
    </div>
  );
};