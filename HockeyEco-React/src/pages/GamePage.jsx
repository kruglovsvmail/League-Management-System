import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { getToken, getImageUrl } from '../utils/helpers';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';

import { Loader } from '../ui/Loader';
import { Button } from '../ui/Button';
import { Table } from '../ui/Table2';
import { Tabs } from '../ui/Tabs';
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

  const isScheduled = game?.status === 'scheduled';
  const canEditRosters = isScheduled || game?.status === 'live'; 
  const gameDate = game ? dayjs(game.game_date) : dayjs();
  const officials = game?.officials || {}; 
  const hasOfficials = Object.values(officials).some(val => val && (typeof val === 'object' ? val.name : val.trim() !== ''));

  const getStatusBadge = () => {
    if (!game) return null;
    let badgeClass = "flex items-center justify-center px-5 py-2.5 rounded-xl text-[12px] font-black tracking-widest uppercase transition-all shadow-sm leading-none border cursor-pointer group shrink-0";
    let content = "";

    switch (game.status) {
      case 'live': 
        badgeClass += " bg-blue-500 text-white border-blue-500 hover:bg-blue-600 animate-pulse shadow-[0_4px_15px_rgba(59,130,246,0.3)]"; 
        content = "LIVE (Идет сейчас)"; 
        break;
      case 'finished': 
        badgeClass += " bg-status-accepted/80 text-white border-status-accepted/20 hover:bg-status-accepted"; 
        content = "Матч завершен"; 
        break;
      case 'cancelled': 
        badgeClass += " bg-status-rejected/80 text-white border-status-rejected/20 hover:bg-status-rejected"; 
        content = "Матч отменен"; 
        break;
      default: 
        badgeClass += " bg-orange text-white border-orange hover:bg-orange/90"; 
        content = "В расписании"; 
        break;
    }

    return (
      <button className={badgeClass} onClick={() => setIsStatusModalOpen(true)} title="Изменить статус матча">
        <span>{content}</span>
        <svg className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity ml-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    );
  };

  const getJerseyUrl = (teamPrefix, type) => {
    if (!game) return getImageUrl(`/default/jersey_${type}.webp`);
    return getImageUrl(game[`${teamPrefix}_jersey_${type}`] || `/default/jersey_${type}.webp`);
  };

  const renderOfficialCard = (label, official, roleTitle) => (
    <div className="bg-white/60 border border-graphite/10 rounded-xl p-4 flex items-center gap-4 hover:border-orange/30 transition-colors">
      {official ? (
        <>
          <img src={getImageUrl(official.avatar_url || '/default/user_default.webp')} className="w-12 h-12 rounded-lg object-cover bg-graphite/5" alt="" />
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase text-graphite/40 tracking-wider block mb-0.5">{label}</span>
            <span className="text-[14px] font-bold text-graphite leading-tight block truncate">{official.name}</span>
            {roleTitle && <span className="text-[11px] font-bold text-orange mt-1 block uppercase tracking-wide truncate">{roleTitle}</span>}
          </div>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-lg bg-graphite/[0.03] border border-dashed border-graphite/20 flex items-center justify-center text-graphite/20 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div>
             <span className="text-[10px] font-black uppercase text-graphite/40 tracking-wider block mb-0.5">{label}</span>
             <span className="text-[13px] font-medium text-graphite/40">Не назначен</span>
          </div>
        </>
      )}
    </div>
  );

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
        {canEditRosters && (
          <div className="pt-4 border-t border-graphite/10 shrink-0 mt-auto">
            <Button onClick={() => setRosterModalState({ isOpen: true, teamId, teamName })} className="w-full">
              {roster.length > 0 ? 'Изменить состав' : 'Заполнить состав'}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const { checkAccess } = useAccess();
  const isLeagueManager = checkAccess('MANAGE_PROTOCOL'); 
  const isSecretary = game?.officials?.scorekeeper?.id === user?.id;
  const canOpenLiveDesk = (isLeagueManager && ['live', 'finished', 'cancelled'].includes(game?.status)) || (isSecretary && game?.status === 'live');

  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

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
          <Button onClick={() => setIsEditInfoDrawerOpen(true)}>
            Настройки матча
          </Button>
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
                  <div className="flex justify-between items-center mb-8 border-b border-graphite/5 pb-4">
                    <h3 className="font-black text-[16px] uppercase text-graphite tracking-wide">Назначения на матч</h3>
                    {isScheduled && (
                      <Button onClick={() => setIsOfficialsModalOpen(true)}>
                        {hasOfficials ? 'Изменить' : '+ Назначить'}
                      </Button>
                    )}
                  </div>
                  
                  {hasOfficials ? (
                    <div className="space-y-8">
                      <div>
                         <h4 className="text-[11px] font-black text-graphite/40 uppercase tracking-widest mb-3 px-1">На льду</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                           {renderOfficialCard('Главный', officials.head_1)}
                           {renderOfficialCard('Главный', officials.head_2)}
                           {renderOfficialCard('Линейный', officials.linesman_1)}
                           {renderOfficialCard('Линейный', officials.linesman_2)}
                         </div>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-graphite/40 uppercase tracking-widest mb-3 px-1">За бортом</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                           {renderOfficialCard('Секретарь', officials.scorekeeper, 'Протокол')}
                           {renderOfficialCard('Медиа', officials.media, 'Фото/Видео')}
                         </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-graphite-light bg-white/40 border border-dashed border-graphite/10 rounded-xl">
                      <span className="text-[13px] font-medium text-graphite/60">Судейская бригада еще не назначена</span>
                    </div>
                  )}
                </div>
              )}

              {/* ВКЛАДКА: Ход игры */}
              {tabIndex === 2 && (
                <div className="bg-white/85 p-8 rounded-xxl border border-graphite/10 shadow-sm w-full min-h-[400px]">
                  <div className="flex justify-between items-center mb-8 border-b border-graphite/5 pb-4">
                    <h3 className="font-black text-[16px] uppercase text-graphite tracking-wide">Протокол</h3>
                    {canOpenLiveDesk && (
                      <Button onClick={() => window.open(`/games/${game.id}/live-desk`, '_blank')}>
                        Панель секретаря
                      </Button>
                    )}
                  </div>

                  {events.length > 0 ? (
                    <div className="relative border-l-2 border-dashed border-graphite/10 ml-6 pl-8 space-y-6 pb-4">
                      {events.map((ev) => {
                        const isGoal = ev.event_type === 'goal';
                        const isHome = ev.team_id === game.home_team_id;

                        return (
                          <div key={ev.id} className="relative group max-w-2xl">
                            <div className={`absolute -left-[41px] top-1 w-5 h-5 rounded-full border-4 border-white flex items-center justify-center shadow-sm ${isGoal ? 'bg-status-accepted' : 'bg-status-rejected'}`}>
                              <div className="w-1 h-1 bg-white rounded-full"></div>
                            </div>
                            
                            <div className="flex items-start gap-5">
                              <div className="flex flex-col items-center shrink-0 w-[40px]">
                                <span className="text-[12px] font-black text-graphite">{formatTime(ev.time_seconds)}</span>
                                <span className="text-[9px] font-bold text-graphite/40 uppercase">{ev.period} пер.</span>
                              </div>

                              <div className={`flex-1 flex items-center gap-4 p-3 rounded-xl border border-graphite/5 bg-white/60 hover:bg-white transition-colors ${isHome ? 'flex-row' : 'flex-row-reverse text-right'}`}>
                                <img src={getImageUrl(ev.team_logo || '/default/Logo_team_default.webp')} className="w-8 h-8 object-contain shrink-0 opacity-80" alt="" />
                                
                                <div className={`flex flex-col flex-1 ${isHome ? 'items-start' : 'items-end'}`}>
                                  {isGoal ? (
                                    <>
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[9px] font-black uppercase text-status-accepted tracking-wider">Гол</span>
                                        {ev.goal_strength !== 'equal' && (
                                          <span className="text-[9px] font-bold text-orange uppercase">
                                            ({ev.goal_strength === 'pp' ? 'Бол.' : ev.goal_strength === 'sh' ? 'Мен.' : ev.goal_strength === 'en' ? 'П.В.' : 'Буллит'})
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[14px] font-bold text-graphite">{ev.primary_last_name} {ev.primary_first_name}</span>
                                      {(ev.assist1_id || ev.assist2_id) && (
                                        <span className="text-[11px] font-medium text-graphite/50 mt-0.5">
                                          Асс: {[ev.assist1_id ? `${ev.assist1_last_name}` : null, ev.assist2_id ? `${ev.assist2_last_name}` : null].filter(Boolean).join(', ')}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[9px] font-black uppercase text-status-rejected tracking-wider mb-0.5">
                                        Удаление ({ev.penalty_minutes} мин.)
                                      </span>
                                      <span className="text-[14px] font-bold text-graphite">{ev.primary_last_name} {ev.primary_first_name}</span>
                                      <span className="text-[11px] font-medium text-graphite/50 mt-0.5">{ev.penalty_violation || 'Нарушение правил'}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
                  <img src={getJerseyUrl('home', game.home_jersey_type)} className="w-8 h-8 object-contain mix-blend-multiply drop-shadow-sm" alt="jersey" />
                  <span className="text-[9px] font-bold text-graphite uppercase">{game.home_jersey_type === 'dark' ? 'Темная' : 'Светлая'}</span>
              </div>
              <span className="text-[10px] font-black text-graphite/30 uppercase">Форма</span>
              <div className="flex flex-col items-center gap-1">
                  <img src={getJerseyUrl('away', game.away_jersey_type)} className="w-8 h-8 object-contain mix-blend-multiply drop-shadow-sm" alt="jersey" />
                  <span className="text-[9px] font-bold text-graphite uppercase">{game.away_jersey_type === 'dark' ? 'Темная' : 'Светлая'}</span>
              </div>
            </div>

            {/* Блок медиа */}
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