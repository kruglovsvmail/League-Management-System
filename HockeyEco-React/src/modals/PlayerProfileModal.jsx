import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Loader } from '../ui/Loader';
import { Table } from '../ui/Table';
import { SegmentButton } from '../ui/SegmentButton';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';
import { getImageUrl, setExpiringStorage, getExpiringStorage, getToken } from '../utils/helpers';

export function PlayerProfileModal({ isOpen, onClose, playerId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [activeRole, setActiveRole] = useState(0); 
  
  const [openPanel, setOpenPanel] = useState('stats');
  const [readyPanel, setReadyPanel] = useState('stats');
  
  const [filterSeason, setFilterSeason] = useState('Все сезоны');
  const [filterLeague, setFilterLeague] = useState('Все лиги');
  const [filterOpponent, setFilterOpponent] = useState('Все соперники');

  useEffect(() => {
    if (isOpen && playerId) {
      setLoading(true);
      setPhotoIndex(0);
      setOpenPanel('stats');
      setReadyPanel('stats');
      
      setFilterSeason('Все сезоны');
      setFilterLeague('Все лиги');
      setFilterOpponent('Все соперники');
      
      // Достаем токен
      const token = getToken();

      // Прикрепляем токен к запросу
      fetch(`${import.meta.env.VITE_API_URL}/api/players/${playerId}/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.success) {
            const allPhotos = [resData.info.avatar_url, ...(resData.info.photos || [])].filter(Boolean);
            resData.info.allPhotos = [...new Set(allPhotos)];
            
            const hasSkater = resData.stats.some(s => s.position !== 'goalie');
            const hasGoalie = resData.stats.some(s => s.position === 'goalie');
            
            if (hasGoalie && !hasSkater) setActiveRole(1);
            else setActiveRole(0);

            setData(resData);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, playerId]);

  const handlePanelSwitch = (panelName) => {
    if (openPanel === panelName) return;
    setReadyPanel(null);
    setOpenPanel(panelName);
    setTimeout(() => {
      setReadyPanel(panelName);
    }, 500);
  };

  const handlePhotoClick = () => {
    if (data?.info?.allPhotos?.length > 1) {
      setPhotoIndex((prev) => (prev + 1) % data.info.allPhotos.length);
    }
  };

  const calculateAgeInt = (birthDate) => {
    if (!birthDate) return null;
    const diff = Date.now() - new Date(birthDate).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  if (!isOpen) return null;

  const skaterColumns = [
    { label: 'Сезон', render: r => <span className="font-semibold">{r.season_name}</span> },
    { label: 'Лига', render: r => (
       <Tooltip logo={getImageUrl(r.league_logo || '/default/Logo_league_default.webp')} title={r.league_full_name} subtitle={r.league_city}>
         <span className="font-semibold text-graphite hover:text-orange">{r.league_name}</span>
       </Tooltip>
    )},
    { label: 'Дивизион', width: 'w-[220px]', render: r => r.division_name },
    { label: 'Команда', render: r => <span className="text-graphite">{r.team_name}</span> },
    { label: 'Квал.', width: 'text-center', render: r => r.qual_name ? (
       <Tooltip title={r.qual_full_name} subtitle={r.qual_description}>
         <span><Badge label={r.qual_name} type="filled" /></span>
       </Tooltip>
    ) : <Badge label="Квал." type="empty" /> },
    { label: 'И', width: 'text-center', render: r => <span className="font-bold">{r.gp}</span> },
    { label: 'Ш', width: 'text-center', render: r => r.g },
    { label: 'П', width: 'text-center', render: r => r.a },
    { label: 'О', width: 'text-center', render: r => <span className="font-bold text-orange">{r.pts}</span> },
    { label: '+/-', width: 'text-center', render: r => <span className={r.pm > 0 ? 'text-status-accepted' : (r.pm < 0 ? 'text-status-rejected' : '')}>{r.pm > 0 ? `+${r.pm}` : r.pm}</span> },
    { label: 'Штр', width: 'text-center', render: r => r.pim },
  ];

  const goalieColumns = [
    { label: 'Сезон', render: r => <span className="font-semibold">{r.season_name}</span> },
    { label: 'Лига', render: r => (
       <Tooltip logo={getImageUrl(r.league_logo || '/default/Logo_league_default.webp')} title={r.league_full_name} subtitle={r.league_city}>
         <span className="font-semibold text-graphite hover:text-orange">{r.league_name}</span>
       </Tooltip>
    )},
    { label: 'Дивизион', width: 'w-[220px]', render: r => r.division_name },
    { label: 'Команда', render: r => <span className="text-graphite">{r.team_name}</span> },
    { label: 'Квал.', width: 'text-center', render: r => r.qual_name ? (
       <Tooltip title={r.qual_full_name} subtitle={r.qual_description}>
         <span><Badge label={r.qual_name} type="filled" /></span>
       </Tooltip>
    ) : <Badge label="Квал." type="empty" /> },
    { label: 'И', width: 'text-center', render: r => <span className="font-bold">{r.gp}</span> },
    { label: 'Штр', width: 'text-center', render: r => r.pim },
    { label: 'ПШ', width: 'text-center', render: r => r.ga },
    { label: 'Об', width: 'text-center', render: r => r.sv },
    { label: '%Об', width: 'text-center', render: r => <span className="font-bold text-orange">{r.svp}%</span> },
  ];

  const matchColumns = [
    { label: 'Сезон', width: 'w-[20px] text-center', render: r => (
    <span className="text-[13px] text-graphite">{r.season_name || '-'}</span> 
)},
    { label: 'Лига / Дивизион', width: 'w-[180px]', render: r => (
        <div className="whitespace-nowrap flex gap-1.5 items-center">
           <Tooltip logo={getImageUrl(r.league_logo || '/default/Logo_league_default.webp')} title={r.league_full_name || r.league_name} subtitle={r.league_city}>
             <span className="text-[13px] text-graphite hover:text-orange">{r.league_name || '-'}</span>
           </Tooltip>
           <span className="text-graphite/40">/</span>
           <span className="text-graphite-light text-[13px]">{r.division_name || '-'}</span>
        </div>
    )},
    { label: 'Тип', width: 'w-[40px] text-center', render: r => <span className="text-[13px] text-graphite">{r.stage_type === 'playoff' ? 'ПО' : 'Рег.'}</span> },
    { label: 'Команда', width: 'w-[250px] text-right', render: r => <span className="text-[13px] text-graphite">{r.player_team_id === r.home_team_id ? r.home_team_full : (r.away_team_full || '-')}</span> },
    { label: 'Счет',  width: 'w-[120px] text-center', render: r => {
      const isHome = r.player_team_id === r.home_team_id;
      const playerScore = isHome ? r.home_score : r.away_score;
      const opponentScore = isHome ? r.away_score : r.home_score;
      
      let scoreColorClass = 'text-orange bg-orange/10'; 
      if (playerScore > opponentScore) scoreColorClass = 'text-status-accepted bg-status-accepted/10'; 
      else if (playerScore < opponentScore) scoreColorClass = 'text-status-rejected bg-status-rejected/10'; 

      return (
        <span className={`font-black px-2.5 py-1 rounded-md shadow-sm ${scoreColorClass}`}>
          {playerScore} : {opponentScore}
        </span>
      );
    }},
    { label: 'Соперник', width: 'w-[250px]', render: r => {
    const [full, logo, city] = r.player_team_id === r.home_team_id ? [r.away_team_full, r.away_team_logo, r.away_team_city] : [r.home_team_full, r.home_team_logo, r.home_team_city];
    return (
        <Tooltip logo={getImageUrl(logo || '/default/Logo_team_default.webp')} title={full} subtitle={city}>
            <span className="text-[13px] hover:text-orange text-graphite-light">{full || '-'}</span>
        </Tooltip>
    );
    }},
    { label: 'Дата', width: 'w-[40px] text-center', render: r => (
    <span className="text-[13px] text-graphite">
        {r.game_date ? new Date(r.game_date).toLocaleDateString('ru-RU') : '-'}
    </span> 
)},
    { label: '', width: 'w-[50px] text-right', render: r => <a href={`/games/${r.game_id}`} target="_blank" rel="noreferrer" className="text-orange text-[12px] underline hover:no-underline"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ff9500ff"><path d="m560-240-56-58 142-142H160v-80h486L504-662l56-58 240 240-240 240Z"/></svg></a> }
  ];

  const currentPhotoUrl = getImageUrl(data?.info?.allPhotos?.[photoIndex] || '/default/user_default.webp');
  const ageInt = calculateAgeInt(data?.info?.birth_date);
  
  const isGoalieTab = activeRole === 1;

  const filteredStats = data?.stats?.filter(s => isGoalieTab ? s.position === 'goalie' : s.position !== 'goalie') || [];
  const currentSeasonsStats = filteredStats.filter(s => s.is_current);
  const pastSeasonsStats = filteredStats.filter(s => !s.is_current);

  const availableRoleMatches = data?.matches?.filter(m => {
    const isGoalie = m.position === 'goalie' || m.position === 'G' || m.position === 'Вратарь';
    return isGoalieTab ? isGoalie : !isGoalie;
  }) || [];

  const uniqueSeasons = [...new Set(availableRoleMatches.map(m => m.season_name).filter(Boolean))];
  const seasonOptions = ['Все сезоны', ...uniqueSeasons];
  
  const uniqueLeagues = [...new Set(availableRoleMatches.map(m => m.league_name).filter(Boolean))];
  const leagueOptions = ['Все лиги', ...uniqueLeagues];

  const uniqueOpponents = [...new Set(availableRoleMatches.map(m => m.player_team_id === m.home_team_id ? m.away_team_full : m.home_team_full).filter(Boolean))].sort();
  const opponentOptions = ['Все соперники', ...uniqueOpponents];

  const filteredMatches = availableRoleMatches.filter(m => {
    if (filterSeason !== 'Все сезоны' && m.season_name !== filterSeason) return false;
    if (filterLeague !== 'Все лиги' && m.league_name !== filterLeague) return false;
    if (filterOpponent !== 'Все соперники') {
      const opponentFull = m.player_team_id === m.home_team_id ? m.away_team_full : m.home_team_full;
      if (opponentFull !== filterOpponent) return false;
    }
    return true;
  });

  const VerticalTitle = ({ title, isActive }) => (
    <div className="flex items-center justify-center h-full w-full">
      <span className={`-rotate-90 whitespace-nowrap text-[16px] tracking-widest uppercase font-black transition-colors duration-300 ${isActive ? 'text-orange' : 'text-graphite-light group-hover:text-graphite'}`}>
        {title}
      </span>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="extra-wide" title="Профиль игрока">
      {loading ? (
        <div className="h-[600px] flex items-center justify-center"><Loader /></div>
      ) : !data ? (
        <div className="h-[600px] flex items-center justify-center text-status-rejected">Ошибка загрузки профиля</div>
      ) : (
        <div className="flex gap-4 h-[650px] font-sans">
          
          <div className="w-[240px] shrink-0 flex flex-col gap-4 bg-white/50 backdrop-blur-md p-4 rounded-xl border border-graphite/10 shadow-sm overflow-y-auto">
            <div 
              className={`relative w-full aspect-square rounded-[34px] overflow-hidden bg-graphite/5 border border-graphite/10 ${data.info.allPhotos.length > 1 ? 'cursor-pointer group' : ''}`}
              onClick={handlePhotoClick}
            >
              <img src={currentPhotoUrl} alt="Игрок" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              {data.info.allPhotos.length > 1 && (
                <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white px-2 py-0.5 rounded-md text-[10px] font-bold shadow-md">
                  {photoIndex + 1} / {data.info.allPhotos.length}
                </div>
              )}
            </div>

            <div className="text-center">
              <h2 className="text-[18px] font-black text-graphite leading-tight mt-4 mb-1">
                {data.info.last_name} {data.info.first_name}
              </h2>
              <p className="text-[16px] font-black text-graphite leading-tight mb-2">{data.info.middle_name}</p>
            </div>

            <div className="bg-white/70 rounded-xl border border-graphite/10 p-3 flex flex-col gap-3">
              <div className="text-center border-b border-graphite/10 pb-4">
                <span className="text-[10px] uppercase font-bold text-graphite-light/70 tracking-wider block mb-0.5">Дата рождения</span>
                <span className="text-[14px] font-bold text-graphite">
                  {data.info.birth_date ? new Date(data.info.birth_date).toLocaleDateString('ru-RU') : '-'}
                </span>
              </div>
              
              <div className="flex justify-between items-center px-1">
                <div className="flex flex-col text-left">
                  <span className="text-[10px] uppercase font-bold text-graphite-light/70 tracking-wider mb-0.5">Возраст</span>
                  <span className="text-[14px] font-bold text-graphite">{ageInt ? formatAge(ageInt) : '-'}</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[10px] uppercase font-bold text-graphite-light/70 tracking-wider mb-0.5">Рост</span>
                  <span className="text-[14px] font-bold text-graphite">{data.info.height ? `${data.info.height} см` : '-'}</span>
                </div>
              </div>

              <div className="flex justify-between items-center px-1">
                <div className="flex flex-col text-left">
                  <span className="text-[10px] uppercase font-bold text-graphite-light/70 tracking-wider mb-0.5">Хват</span>
                  <span className="text-[14px] font-bold text-graphite">
                    {data.info.grip === 'left' ? 'Левый' : (data.info.grip === 'right' ? 'Правый' : '-')}
                  </span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[10px] uppercase font-bold text-graphite-light/70 tracking-wider mb-0.5">Вес</span>
                  <span className="text-[14px] font-bold text-graphite">{data.info.weight ? `${data.info.weight} кг` : '-'}</span>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-2">
              <SegmentButton options={['Полевой', 'Вратарь']} defaultIndex={activeRole} onChange={setActiveRole} />
            </div>
          </div>

          <div className="flex-1 flex gap-3">
            
            <div 
              onClick={() => handlePanelSwitch('matches')}
              className={`group flex flex-col rounded-xl border transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                openPanel === 'matches' 
                  ? 'flex-1 bg-white/70 border-graphite/15 shadow-sm p-6 cursor-default' 
                  : 'w-[60px] bg-white/40 border-graphite/10 hover:border-orange/40 hover:bg-orange/5 cursor-pointer shadow-sm overflow-hidden'
              }`}
            >
              {openPanel === 'matches' ? (
                readyPanel === 'matches' && (
                  <div className="flex flex-col h-full animate-fade-in-down">
                    <h3 className="text-[18px] font-bold text-graphite mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      История матчей ({isGoalieTab ? 'Вратарь' : 'Полевой'})
                    </h3>
                    
                    <div className="flex gap-4 mb-5 flex-wrap relative z-[9999]">
                      <div className="w-[150px] shrink-0">
                        <Select options={seasonOptions} value={filterSeason} onChange={setFilterSeason} />
                      </div>
                      <div className="w-[150px] shrink-0">
                        <Select options={leagueOptions} value={filterLeague} onChange={setFilterLeague} />
                      </div>
                      <div className="flex-1 min-w-[200px] max-w-[350px]">
                        <Select options={opponentOptions} value={filterOpponent} onChange={setFilterOpponent} />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-0">
                      {filteredMatches.length > 0 ? (
                        <Table columns={matchColumns} data={filteredMatches} />
                      ) : (
                        <div className="text-center text-graphite-light p-10 mt-10">Матчи не найдены по заданным фильтрам</div>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <VerticalTitle title="История матчей" isActive={false} />
              )}
            </div>

            <div 
              onClick={() => handlePanelSwitch('stats')}
              className={`group flex flex-col rounded-xl border transition-all duration-1000 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                openPanel === 'stats' 
                  ? 'flex-1 bg-white/70 border-graphite/15 shadow-sm p-6 cursor-default overflow-hidden' 
                  : 'w-[60px] bg-white/40 border-graphite/10 hover:border-orange/40 hover:bg-orange/5 cursor-pointer shadow-sm overflow-hidden'
              }`}
            >
              {openPanel === 'stats' ? (
                readyPanel === 'stats' && (
                  <div className="flex flex-col h-full animate-fade-in-down overflow-y-auto pr-2 custom-scrollbar">
                    <h3 className="text-[18px] font-bold text-graphite mb-5 flex items-center gap-2">
                      <svg className="w-5 h-5 text-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>
                      Статистика ({isGoalieTab ? 'Вратарь' : 'Полевой'})
                    </h3>

                    <div className="mb-8">
                      <h4 className="text-[14px] font-bold text-graphite-light uppercase tracking-widest border-b border-graphite/10 pb-2 mb-4">Текущие сезоны</h4>
                      {currentSeasonsStats.length > 0 ? (
                        <Table columns={isGoalieTab ? goalieColumns : skaterColumns} data={currentSeasonsStats} />
                      ) : (
                        <div className="text-center text-graphite-light p-5 bg-white/50 rounded-xl border border-dashed border-graphite/20">Нет статистики в текущих сезонах</div>
                      )}
                    </div>

                    <div>
                      <h4 className="text-[14px] font-bold text-graphite-light uppercase tracking-widest border-b border-graphite/10 pb-2 mb-4">Прошедшие сезоны</h4>
                      {pastSeasonsStats.length > 0 ? (
                        <Table columns={isGoalieTab ? goalieColumns : skaterColumns} data={pastSeasonsStats} />
                      ) : (
                        <div className="text-center text-graphite-light p-5 bg-white/50 rounded-xl border border-dashed border-graphite/20">Нет истории в прошедших сезонах</div>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <VerticalTitle title="Статистика" isActive={false} />
              )}
            </div>

          </div>
        </div>
      )}
    </Modal>
  );
}