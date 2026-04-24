import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { Loader } from '../ui/Loader';
import { Table } from '../ui/Table2';
import { SegmentButton } from '../ui/SegmentButton';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';
import { getImageUrl, getToken, formatAge } from '../utils/helpers';

export function PlayerProfileModal({ isOpen, onClose, playerId }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [activeRole, setActiveRole] = useState(0); 
  
  const [activeTab, setActiveTab] = useState('stats');
  
  const [filterSeason, setFilterSeason] = useState('Все сезоны');
  const [filterLeague, setFilterLeague] = useState('Все лиги');
  const [filterOpponent, setFilterOpponent] = useState('Все соперники');

  useEffect(() => {
    if (isOpen && playerId) {
      setLoading(true);
      setPhotoIndex(0);
      setActiveTab('stats');
      setFilterSeason('Все сезоны');
      setFilterLeague('Все лиги');
      setFilterOpponent('Все соперники');
      
      const token = getToken();

      fetch(`${import.meta.env.VITE_API_URL}/api/players/${playerId}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.success) {
            const allPhotos = [];
            const seenUrls = new Set();

            if (resData.info.avatar_url) {
              allPhotos.push({ url: resData.info.avatar_url, type: 'avatar' });
              seenUrls.add(resData.info.avatar_url);
            }

            const teamPhotos = resData.info.team_photos || [];
            teamPhotos.forEach(p => {
              if (p.url && !seenUrls.has(p.url)) {
                allPhotos.push({ url: p.url, type: 'team', teamLogo: p.teamLogo });
                seenUrls.add(p.url);
              }
            });

            const oldPhotos = resData.info.photos || [];
            oldPhotos.forEach(url => {
              if (url && !seenUrls.has(url)) {
                allPhotos.push({ url, type: 'unknown' });
                seenUrls.add(url);
              }
            });

            resData.info.allPhotos = allPhotos;
            
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

  const goToGame = (gameId) => {
    onClose();
    navigate(`/games/${gameId}`);
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

      if (r.is_technical) {
        return (
          <span className={`font-black px-2.5 py-1 rounded-md shadow-sm ${scoreColorClass}`} title="Технический результат">
            {playerScore > opponentScore ? '+' : '-'}:{opponentScore > playerScore ? '+' : '-'}
          </span>
        );
      }

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
    { label: '', width: 'w-[50px] text-right', render: r => (
      <button 
        onClick={() => goToGame(r.game_id)}
        className="text-orange text-[12px] underline hover:no-underline transition-transform hover:scale-110 inline-flex"
        title="Перейти к матчу"
      >
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
          <path d="m560-240-56-58 142-142H160v-80h486L504-662l56-58 240 240-240 240Z"/>
        </svg>
      </button>
    )}
  ];

  const currentPhoto = data?.info?.allPhotos?.[photoIndex];
  const currentPhotoUrl = getImageUrl(currentPhoto?.url || '/default/user_default.webp');
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

  const StatItem = ({ value }) => (
    <span className="text-[14px] font-black text-graphite/50">{value || '-'}</span>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="extra-wide" title="Профиль игрока">
      <div className="flex flex-col w-full h-[700px] max-h-[calc(100vh-170px)] min-h-0 overflow-hidden px-0 pb-0 pt-0 font-sans">
        
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader /></div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center text-status-rejected">Ошибка загрузки профиля</div>
        ) : (
          <>
            {/* 1. HERO HEADER */}
            <div className="shrink-0 flex gap-4 items-center bg-white border border-graphite/10 pr-8 rounded-2xl shadow-sm mb-2 relative overflow-hidden mx-6 mt-4">
              
              <div 
                className={`relative w-[120px] h-[120px] shrink-0 mr-6 overflow-hidden border border-graphite/10 shadow-sm bg-graphite/15 ${data.info.allPhotos.length > 1 ? 'cursor-pointer group' : ''}`}
                onClick={handlePhotoClick}
              >
                <img src={currentPhotoUrl} alt="Игрок" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                
                {currentPhoto?.type === 'team' && (
                  <div className="absolute bottom-1 left-1 w-8 h-8 p-1 z-10 flex items-center justify-center">
                    <img src={getImageUrl(currentPhoto.teamLogo || '/default/Logo_team_default.webp')} alt="Лого" className="w-full h-full object-contain" />
                  </div>
                )}

                {data.info.allPhotos.length > 1 && (
                  <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-sm text-white px-1 py-0.5 rounded text-[8px] font-bold shadow-sm z-10">
                    {photoIndex + 1}/{data.info.allPhotos.length}
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-center">
                <h2 className="text-[24px] font-bold text-graphite/80 leading-tight mb-4 truncate">
  {data.info.last_name} {data.info.first_name} <span className="text-graphite/80 font-bold">{data.info.middle_name}</span>
</h2>
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-graphite/5 px-4 py-2.5 rounded-lg border border-graphite/0 w-fit">
                  <StatItem value={ageInt ? formatAge(ageInt) : null} />
                  <div className="w-px h-4 bg-graphite/20 block"></div>
                  <StatItem value={data.info.birth_date ? new Date(data.info.birth_date).toLocaleDateString('ru-RU') : null} />
                  <div className="w-px h-4 bg-graphite/20 block"></div>
                  <StatItem value={data.info.height ? `${data.info.height} см` : null} />
                  <div className="w-px h-4 bg-graphite/20 block"></div>
                  <StatItem value={data.info.weight ? `${data.info.weight} кг` : null} />
                  <div className="w-px h-4 bg-graphite/20 block"></div>
                  <StatItem value={data.info.grip === 'left' ? 'Левый хват' : (data.info.grip === 'right' ? 'Правый хват' : null)} />
                </div>
              </div>

              <div className="w-[180px] shrink-0">
                <SegmentButton options={['Полевой', 'Вратарь']} defaultIndex={activeRole} onChange={setActiveRole} />
              </div>
            </div>

            {/* 2. TAB NAVIGATION */}
            <div className="shrink-0 flex gap-2 border-b border-graphite/15 mb-3 px-6">
              <button 
                onClick={() => setActiveTab('stats')}
                className={`px-5 py-2.5 text-[13px] font-bold uppercase tracking-wider border-b-2 transition-colors duration-300 ${activeTab === 'stats' ? 'border-orange text-orange' : 'border-transparent text-graphite-light hover:text-graphite hover:border-graphite/30'}`}
              >
                Статистика
              </button>
              <button 
                onClick={() => setActiveTab('matches')}
                className={`px-5 py-2.5 text-[13px] font-bold uppercase tracking-wider border-b-2 transition-colors duration-300 ${activeTab === 'matches' ? 'border-orange text-orange' : 'border-transparent text-graphite-light hover:text-graphite hover:border-graphite/30'}`}
              >
                История матчей
              </button>
            </div>

            {/* 3. КОНТЕНТ */}
            <div className="flex-1 flex flex-col min-h-0 bg-white border border-graphite/15 rounded-2xl shadow-sm overflow-hidden mx-6 mb-6">
              
              {activeTab === 'stats' && (
                <div className="flex-1 overflow-y-auto p-5 animate-zoom-in [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-graphite/15 hover:[&::-webkit-scrollbar-thumb]:bg-graphite/25 [&::-webkit-scrollbar-thumb]:rounded-full">
                  <div className="mb-6">
                    <h4 className="text-[12px] font-bold text-graphite-light uppercase tracking-widest border-b border-graphite/10 pb-2 mb-3">Текущие сезоны</h4>
                    {currentSeasonsStats.length > 0 ? (
                      <Table columns={isGoalieTab ? goalieColumns : skaterColumns} data={currentSeasonsStats} />
                    ) : (
                      <div className="text-center text-graphite-light p-5 bg-graphite/5 rounded-xl border border-dashed border-graphite/20">Нет статистики в текущих сезонах</div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-[12px] font-bold text-graphite-light uppercase tracking-widest border-b border-graphite/10 pb-2 mb-3">Прошедшие сезоны</h4>
                    {pastSeasonsStats.length > 0 ? (
                      <Table columns={isGoalieTab ? goalieColumns : skaterColumns} data={pastSeasonsStats} />
                    ) : (
                      <div className="text-center text-graphite-light p-5 bg-graphite/5 rounded-xl border border-dashed border-graphite/20">Нет истории в прошедших сезонах</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'matches' && (
                <div className="flex flex-col h-full min-h-0 animate-zoom-in">
                  <div className="shrink-0 flex gap-4 p-4 border-b border-graphite/10 bg-graphite/5 relative z-[20]">
                    <div className="w-[160px] shrink-0">
                      <Select options={seasonOptions} value={filterSeason} onChange={setFilterSeason} />
                    </div>
                    <div className="w-[160px] shrink-0">
                      <Select options={leagueOptions} value={filterLeague} onChange={setFilterLeague} />
                    </div>
                    <div className="flex-1 min-w-[200px] max-w-[350px]">
                      <Select options={opponentOptions} value={filterOpponent} onChange={setFilterOpponent} />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 relative z-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-graphite/15 hover:[&::-webkit-scrollbar-thumb]:bg-graphite/25 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {filteredMatches.length > 0 ? (
                      <Table columns={matchColumns} data={filteredMatches} />
                    ) : (
                      <div className="text-center text-graphite-light p-10 mt-5 bg-white rounded-xl border border-dashed border-graphite/20">Матчи не найдены по заданным фильтрам</div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </Modal>
  );
}