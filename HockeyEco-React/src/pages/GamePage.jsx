import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  
  const [game, setGame] = useState(null);
  const [arenas, setArenas] = useState([]);
  
  const [homeRoster, setHomeRoster] = useState([]);
  const [awayRoster, setAwayRoster] = useState([]);
  const [homeStaff, setHomeStaff] = useState([]);
  const [awayStaff, setAwayStaff] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  
  // Табы: 0 = Составы, 1 = Судьи, 2 = Протокол
  const [tabIndex, setTabIndex] = useState(0);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isEditInfoDrawerOpen, setIsEditInfoDrawerOpen] = useState(false);
  const [rosterModalState, setRosterModalState] = useState({ isOpen: false, teamId: null, teamName: '' });
  const [isOfficialsModalOpen, setIsOfficialsModalOpen] = useState(false);

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
    
    const editIcon = (
      <svg className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity ml-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    );

    let badgeClass = "flex items-center justify-center w-[300px] px-1 py-3 rounded-lg text-[12px] font-black tracking-widest uppercase transition-all shadow-sm leading-none border";
    let content = "";

    switch (game.status) {
      case 'live': 
        badgeClass += " bg-blue-500 text-white border-blue-500 hover:bg-blue-600 animate-pulse shadow-[0_4px_15px_rgba(59,130,246,0.3)]"; 
        content = "LIVE (Идет сейчас)"; 
        break;
      case 'finished': 
        badgeClass += " bg-status-accepted/80 text-white border-status-accepted/20 group-hover:bg-status-accepted/20"; 
        content = "Матч завершен"; 
        break;
      case 'cancelled': 
        badgeClass += " bg-status-rejected/80 text-white border-status-rejected/20 group-hover:bg-status-rejected/20"; 
        content = "Матч отменен"; 
        break;
      default: 
        badgeClass += " bg-orange/80 text-white border-orange/20 group-hover:bg-orange/20"; 
        content = "В расписании"; 
        break;
    }

    return (
      <div className={badgeClass}>
        <span>{content}</span>
        {editIcon}
      </div>
    );
  };

  const getJerseyUrl = (teamPrefix, type) => {
    if (!game) return getImageUrl(`/default/jersey_${type}.webp`);
    return getImageUrl(game[`${teamPrefix}_jersey_${type}`] || `/default/jersey_${type}.webp`);
  };

  const renderOfficialCard = (label, official, roleTitle) => (
    <div className="bg-white border border-graphite/10 rounded-2xl p-4 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
      {official ? (
        <>
          <img src={getImageUrl(official.avatar_url || '/default/user_default.webp')} className="w-14 h-14 rounded-xl object-cover border border-graphite/5 shadow-sm" alt="" />
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase text-graphite/40 tracking-wider block mb-0.5">{label}</span>
            <span className="text-[14px] font-bold text-graphite leading-tight block truncate">{official.name}</span>
            {roleTitle && <span className="text-[11px] font-bold text-orange mt-1 block uppercase tracking-wide truncate">{roleTitle}</span>}
          </div>
        </>
      ) : (
        <>
          <div className="w-14 h-14 rounded-xl bg-graphite/[0.03] border border-dashed border-graphite/20 flex items-center justify-center text-graphite/20 shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
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
    // Вычисляем дубликаты для подсветки
    const counts = {};
    roster.forEach(r => {
      if (r.jersey_number) counts[r.jersey_number] = (counts[r.jersey_number] || 0) + 1;
    });
    const duplicates = new Set(Object.keys(counts).filter(num => counts[num] > 1).map(Number));

    const sortedRoster = [...roster].sort((a, b) => {
      const posA = POS_ORDER[a.position_in_line] || 99;
      const posB = POS_ORDER[b.position_in_line] || 99;
      if (posA !== posB) return posA - posB;
      return (a.jersey_number || 999) - (b.jersey_number || 999);
    });

    const rosterColumns = [
      { label: '', width: 'w-[10px]', align: 'center', render: (_, idx) => <span className="font-normal text-graphite/50">{idx + 1}</span> },
      { label: 'Фото', width: 'w-[60px]', align: 'center', render: (r) => ( <img src={getImageUrl(r.photo_url || r.avatar_url || '/default/user_default.webp')} className="w-7 h-7 rounded object-cover bg-graphite/5" alt="" /> )},
      { label: 'Игрок',  render: (r) => (
        <span className="text-[14px] font-semibold text-graphite/85 flex items-center gap-3 truncate">
          {r.last_name} {r.first_name}
          {r.is_captain && <span className="text-orange text-[13px] font-bold">К</span>}
          {r.is_assistant && <span className="text-orange text-[13px] font-bold">А</span>}
        </span>
      )},
      { label: '#', width: 'w-[20px]', render: (r) => (
        // Подсветка дубликатов красным
        <span className={`text-[14px] font-bold ${duplicates.has(r.jersey_number) ? 'text-status-rejected animate-pulse' : 'text-graphite/80'}`}>
          {r.jersey_number || '-'}
        </span>
      )},
      { label: '', width: 'w-[40px]', render: (r) => <span className="text-[11px] font-semibold text-graphite/50 uppercase">{POS_MAP[r.position_in_line] || '-'}</span> }
    ];

    const staffColumns = [
      { label: 'Фото', width: 'w-[80px]', render: (r) => ( <img src={getImageUrl(r.photo_url || r.avatar_url || '/default/user_default.webp')} className="w-7 h-7 rounded object-cover bg-graphite/5 shadow-sm" alt="" /> )},
      { label: 'Представитель', sortKey: 'last_name', render: (r) => <span className="text-[14px] font-semibold text-graphite/85">{r.last_name} {r.first_name}</span> },
      { label: 'Должность', sortKey: 'roles', render: (r) => (
        <div className="flex flex-col gap-1 py-1">
          {r.roles ? r.roles.split(', ').map((role, i) => (
            <span key={i} className="text-[10px] font-bold text-graphite/60 uppercase tracking-wider leading-tight">{ROLE_MAP[role] || role}</span>
          )) : <span className="text-[10px] font-bold text-orange uppercase tracking-wider leading-tight">Представитель</span>}
        </div>
      )}
    ];

    return (
      <div className="bg-white/70 p-6 pt-5 rounded-xxl border border-graphite/10 shadow-sm flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-graphite/5 pb-3 mb-4 shrink-0">
          <span className="text-[12px] font-black uppercase text-graphite/40 tracking-widest">{side === 'home' ? 'Состав хозяев' : 'Состав гостей'}</span>
        </div>
        <div className="flex-1 mb-6 flex flex-col">
          {sortedRoster.length > 0 ? (
            <div className="mb-6"><Table columns={rosterColumns} data={sortedRoster} hideHeader={true} /></div>
          ) : (
            <div className="bg-graphite/[0.03] rounded-xl border border-dashed border-graphite/10 p-10 flex flex-col items-center justify-center text-center mt-2 mb-6 min-h-[150px]">
              <span className="text-[13px] font-bold text-graphite/50">Состав не сформирован</span>
            </div>
          )}
          {staff.length > 0 && (
            <div className="mt-2">
              <h4 className="text-[11px] font-black uppercase text-graphite/50 tracking-wider mb-2 px-4">Представители</h4>
              <div><Table columns={staffColumns} data={staff} hideHeader={true} /></div>
            </div>
          )}
        </div>
        {canEditRosters && (
          <div className="pt-4 border-t border-graphite/10 shrink-0 mt-auto">
            <Button onClick={() => setRosterModalState({ isOpen: true, teamId, teamName })} className="w-full">
              {roster.length > 0 ? 'Изменить заявку' : 'Сформировать состав'}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      
      {/* ИДЕАЛЬНО ВЫРОВНЕННАЯ ШАПКА */}
      <header className="bg-white/50 backdrop-blur-[12px] border-b border-white/80 sticky top-0 z-30 shadow-sm transition-all pt-6 pb-2">
        <div className="flex items-start px-10 gap-8 w-full max-w-[1600px] mx-auto">
          
          {/* ЛЕВЫЙ БЛОК: Кнопка "Назад" + Статус матча */}
          <div className="w-[300px] shrink-0 flex flex-col items-start pt-1">
            <button onClick={() => navigate('/games')} className="flex items-center gap-2 text-[14px] font-bold text-graphite-light hover:text-orange transition-colors">
              ←  К списку матчей
            </button>
            
            {game && (
              <div 
                className="mt-6 cursor-pointer group w-full max-w-[260px]" 
                onClick={() => setIsStatusModalOpen(true)} 
                title="Изменить статус матча"
              >
                {getStatusBadge()}
              </div>
            )}
          </div>

          {/* ПРАВЫЙ БЛОК: Табло и Табы */}
          <div className="flex-1 flex flex-col min-w-0">
            
            {/* ТАБЛО (Увеличенное и отцентрированное по блокам) */}
            {game ? (
              <div className="flex items-center animate-fade-in mb-6 w-full">
                
                {/* ХОЗЯЕВА (Выравнивание по центру левой половины) */}
                <div className="flex-1 flex items-center justify-center gap-5 min-w-0 pr-4">
                  <span className="text-[20px] font-black text-graphite leading-tight truncate text-right w-full" title={game.home_team_name}>
                    {game.home_team_name}
                  </span>
                  <div className="w-20 h-20 shrink-0 rounded-xxl flex items-center justify-center">
                    <img src={getImageUrl(game.home_team_logo || '/default/Logo_team_default.webp')} className="w-14 h-14 object-contain" alt="Home" />
                  </div>
                </div>

                {/* ЦЕНТР (Счет и Дивизион - строго по центру экрана) */}
                <div className="shrink-0 flex flex-col items-center justify-center px-4 w-[240px]">
                  <span className="text-[10px] font-bold text-graphite-light uppercase tracking-widest mb-1.5 truncate w-full text-center" title={game.division_name}>
                    {game.division_name}
                  </span>
                  <div className="flex items-center justify-center gap-4 text-[46px] font-black tracking-tighter leading-none text-graphite">
                    <span className="w-16 text-right">{game.status === 'scheduled' ? '-' : game.home_score}</span>
                    <span className="text-graphite/20 pb-2.5">:</span>
                    <span className="w-16 text-left">{game.status === 'scheduled' ? '-' : game.away_score}</span>
                  </div>
                </div>

                {/* ГОСТИ (Выравнивание по центру правой половины) */}
                <div className="flex-1 flex items-center justify-center gap-5 min-w-0 pl-4">
                  <div className="w-20 h-20 shrink-0 rounded-xxl flex items-center justify-center">
                    <img src={getImageUrl(game.away_team_logo || '/default/Logo_team_default.webp')} className="w-14 h-14 object-contain" alt="Away" />
                  </div>
                  <span className="text-[20px] font-black text-graphite leading-tight truncate text-left w-full" title={game.away_team_name}>
                    {game.away_team_name}
                  </span>
                </div>

              </div>
            ) : <div className="h-[104px]" />}

            {/* ТАБЫ (Отцентрованы через Tailwind селектор [&>div]:justify-center) */}
            <div className="w-full flex justify-center [&>div]:justify-center">
              <Tabs 
                tabs={['Составы на игру', 'Судейская бригада', 'Протокол матча']} 
                activeTab={tabIndex} 
                onChange={setTabIndex} 
              />
            </div>

          </div>
        </div>
      </header>

      {/* ОСНОВНАЯ СЕТКА (Сайдбар слева + Контент справа) */}
      <div className="flex items-start px-10 pt-8 gap-8 relative z-10 w-full max-w-[1600px] mx-auto">
        
        {/* ЛЕВЫЙ САЙДБАР: Детали матча (300px) */}
        <div className="w-[300px] shrink-0 sticky top-[180px] flex flex-col gap-4 animate-fade-in-left z-20">
          {!isLoading && game && (
            <>
              <div className="bg-white/80 rounded-2xl border border-graphite/10 shadow-sm p-6 relative overflow-hidden">
                <div className="flex justify-between items-center mb-5 border-b border-graphite/5 pb-3">
                  <h3 className="font-black text-[13px] uppercase text-graphite tracking-wide">Детали матча</h3>
                  <button onClick={() => setIsEditInfoDrawerOpen(true)} className="text-graphite-light hover:text-orange transition-colors" title="Настройки матча">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange/10 flex items-center justify-center text-orange shrink-0"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                    <div>
                      <div className="text-[10px] font-bold text-graphite-light uppercase tracking-wider mb-0.5">Дата и время</div>
                      <div className="text-[13px] font-black text-graphite leading-tight">{gameDate.isValid() ? gameDate.format('DD MMM YYYY') : 'Не назначено'}</div>
                      {gameDate.isValid() && <div className="text-[11px] font-medium text-graphite-light mt-0.5">{gameDate.format('в HH:mm')}</div>}
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-graphite/5 flex items-center justify-center text-graphite/40 shrink-0"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
                    <div>
                      <div className="text-[10px] font-bold text-graphite-light uppercase tracking-wider mb-0.5">Арена</div>
                      <div className="text-[13px] font-black text-graphite leading-tight">{game.location_text || 'Не назначена'}</div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-graphite/5 flex items-center justify-center text-graphite/40 shrink-0"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div>
                    <div>
                      <div className="text-[10px] font-bold text-graphite-light uppercase tracking-wider mb-0.5">Турнир</div>
                      <div className="text-[12px] font-black text-graphite leading-tight mb-1">{game.stage_type === 'regular' ? 'Регулярка' : 'Плей-офф'}</div>
                      <div className="text-[11px] font-bold text-graphite-light">{game.stage_label || '—'} <span className="mx-1">•</span> {game.stage_type === 'regular' ? 'Тур' : 'Матч'} {game.series_number || 1}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white/80 rounded-2xl border border-graphite/10 shadow-sm p-6">
                <h3 className="font-black text-[11px] uppercase text-graphite-light tracking-widest mb-4">Цвета формы</h3>
                <div className="flex items-center justify-between px-2">
                    <div className="flex flex-col items-center gap-2">
                        <img src={getJerseyUrl('home', game.home_jersey_type)} className="w-10 h-10 object-contain mix-blend-multiply drop-shadow-sm" alt="jersey" />
                        <span className="text-[11px] font-bold text-graphite">{game.home_jersey_type === 'dark' ? 'Темная' : 'Светлая'}</span>
                    </div>
                    <div className="text-graphite/20 text-[16px] font-black italic">VS</div>
                    <div className="flex flex-col items-center gap-2">
                        <img src={getJerseyUrl('away', game.away_jersey_type)} className="w-10 h-10 object-contain mix-blend-multiply drop-shadow-sm" alt="jersey" />
                        <span className="text-[11px] font-bold text-graphite">{game.away_jersey_type === 'dark' ? 'Темная' : 'Светлая'}</span>
                    </div>
                </div>
              </div>

              <div className="bg-white/80 rounded-2xl border border-graphite/10 shadow-sm p-6">
                <h3 className="font-black text-[11px] uppercase text-graphite-light tracking-widest mb-4">Медиа</h3>
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-red-100 flex items-center justify-center text-red-600 shrink-0"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg></div>
                            <span className="text-[12px] font-bold text-graphite">YouTube</span>
                        </div>
                        {game.video_yt_url ? <a href={game.video_yt_url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-orange hover:underline">Смотреть</a> : <span className="text-[11px] font-medium text-graphite/40">Нет ссылки</span>}
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M22.666 4.666c0-1.104-.896-2-2-2H3.333c-1.104 0-2 .896-2 2v14.666c0 1.104.896 2 2 2H20.666c1.104 0 2-.896 2-2V4.666zM15.441 15.26c-.34.34-1.041.565-1.921.565-.632 0-1.282-.128-1.94-.377a5.532 5.532 0 0 1-1.748-1.121 5.57 5.57 0 0 1-1.161-1.785c-.244-.664-.372-1.32-.372-1.956 0-.882.222-1.581.565-1.921.343-.343 1.042-.566 1.921-.566.635 0 1.287.128 1.946.377a5.532 5.532 0 0 1 1.748 1.121 5.57 5.57 0 0 1 1.161 1.785c.244.664.372 1.32.372 1.956 0 .882-.222 1.581-.565 1.921l-.006.002z"/></svg></div>
                            <span className="text-[12px] font-bold text-graphite">VK Видео</span>
                        </div>
                        {game.video_vk_url ? <a href={game.video_vk_url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-blue-500 hover:underline">Смотреть</a> : <span className="text-[11px] font-medium text-graphite/40">Нет ссылки</span>}
                    </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ЦЕНТРАЛЬНАЯ КОЛОНКА: Контент вкладок */}
        <div className="flex-1 relative z-10 min-h-[500px] flex flex-col min-w-0">
          {isLoading || !game ? (
            <div className="flex-1 flex flex-col items-center justify-center pt-32 animate-fade-in"><Loader text="Загрузка данных матча..." /></div>
          ) : (
            <>
              {/* === ТАБ 0: СОСТАВЫ === */}
              {tabIndex === 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start animate-fade-in-down w-full">
                  {renderTeamCard('home', game.home_team_name, homeRoster, homeStaff, game.home_team_id)}
                  {renderTeamCard('away', game.away_team_name, awayRoster, awayStaff, game.away_team_id)}
                </div>
              )}

              {/* === ТАБ 1: СУДЕЙСКАЯ БРИГАДА === */}
              {tabIndex === 1 && (
                <div className="bg-white/70 p-8 rounded-2xl border border-graphite/10 shadow-sm animate-fade-in-down w-full min-h-[500px]">
                  <div className="flex justify-between items-center mb-8 border-b border-graphite/10 pb-5">
                    <div>
                       <h3 className="font-black text-[18px] uppercase text-graphite tracking-wide">Судейская бригада и персонал</h3>
                       <p className="text-[13px] font-medium text-graphite-light mt-1">Официальные лица, обслуживающие данный матч</p>
                    </div>
                    {isScheduled && (
                      <Button onClick={() => setIsOfficialsModalOpen(true)} className="py-2.5 px-6">
                        {hasOfficials ? 'Изменить назначения' : '+ Назначить персонал'}
                      </Button>
                    )}
                  </div>
                  
                  {hasOfficials ? (
                    <div className="space-y-10">
                      <div>
                         <h4 className="text-[12px] font-black text-graphite/30 uppercase tracking-widest mb-4 px-2">Бригада на льду</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           {renderOfficialCard('Главный судья 1', officials.head_1)}
                           {renderOfficialCard('Главный судья 2', officials.head_2)}
                           {renderOfficialCard('Линейный судья 1', officials.linesman_1)}
                           {renderOfficialCard('Линейный судья 2', officials.linesman_2)}
                         </div>
                      </div>
                      <div className="w-full h-px bg-graphite/5"></div>
                      <div>
                         <h4 className="text-[12px] font-black text-graphite/30 uppercase tracking-widest mb-4 px-2">Персонал за бортом</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           {renderOfficialCard('Секретарь матча', officials.scorekeeper, 'Хронометраж / Протокол')}
                           {renderOfficialCard('Медиа', officials.media, 'Фото / Видео съемка')}
                         </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-graphite-light bg-graphite/[0.02] border-2 border-dashed border-graphite/10 rounded-2xl">
                      <svg className="w-16 h-16 text-graphite/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      <span className="text-[15px] font-bold text-graphite/50">Персонал на этот матч еще не назначен</span>
                    </div>
                  )}
                </div>
              )}

              {/* === ТАБ 2: ПРОТОКОЛ === */}
              {tabIndex === 2 && (
                <div className="flex-1 flex items-center justify-center text-graphite-light text-[13px] font-medium py-32 text-center border-2 border-dashed border-graphite/10 rounded-2xl bg-graphite/[0.02] animate-fade-in-down">
                  Модуль ведения протокола матча (LIVE-статистика) находится в разработке.<br/>Скоро здесь появятся события матча.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Модалки и шторки */}
      {game && (
        <>
          <GameStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} game={game} onSuccess={loadAllData} />
          <GameRosterModal isOpen={rosterModalState.isOpen} onClose={() => setRosterModalState({ isOpen: false, teamId: null, teamName: '' })} gameId={game.id} teamId={rosterModalState.teamId} teamName={rosterModalState.teamName} onSuccess={loadAllData} />
          <ManageOfficialsModal isOpen={isOfficialsModalOpen} onClose={() => setIsOfficialsModalOpen(false)} gameId={game.id} initialOfficials={game.officials} onSuccess={loadAllData} />
          <EditGameInfoDrawer isOpen={isEditInfoDrawerOpen} onClose={() => setIsEditInfoDrawerOpen(false)} game={game} arenas={arenas} onSuccess={loadAllData} />
        </>
      )}
    </div>
  );
}