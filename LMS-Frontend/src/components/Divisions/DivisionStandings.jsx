import React, { useState, useEffect } from 'react';
import { Table } from '../../ui/Table2';
import { Loader } from '../../ui/Loader';
import { getToken, getImageUrl } from '../../utils/helpers';

const getPlayoffSpots = (roundString) => {
  if (!roundString) return 0;
  switch (roundString) {
    case '1/32': return 64; case '1/16': return 32; case '1/8': return 16;
    case '1/4': return 8; case '1/2': return 4; case 'final': return 2; default: return 0;
  }
};

export function DivisionStandings({ division }) {
  const [standings, setStandings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!division?.id) return;
    
    setIsLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${division.id}/standings`, { 
      headers: { 'Authorization': `Bearer ${getToken()}` } 
    })
    .then(res => res.json())
    .then(data => { 
      if (data.success) {
        setStandings(data.data);
      } 
    })
    .catch(err => console.error('Ошибка загрузки таблицы:', err))
    .finally(() => setIsLoading(false));
  }, [division?.id]);

  const approvedTeams = (division?.teams || []).filter(t => t.status === 'approved');
  let displayData = standings;

  if (displayData.length === 0 && approvedTeams.length > 0) {
    displayData = approvedTeams.map((t, idx) => ({
      id: `mock-${t.id}`,
      team_id: t.id,
      team_name: t.name,
      logo_url: t.logo_url,
      games_played: 0, 
      wins_reg: 0, 
      wins_ot: 0, 
      draws: 0, 
      losses_ot: 0, 
      losses_reg: 0,
      goals_for: 0, 
      goals_against: 0, 
      points: 0,
      rank: idx + 1
    }));
  }

  const playoffSpotsCount = getPlayoffSpots(division?.playoff_start_round);

  // ЗАДАЕМ ЖЕСТКУЮ ШИРИНУ СТОЛБЦАМ
  const columns = [
    { 
      key: 'rank', label: 'Место', width: 'w-[60px]', align: 'center', 
      render: (row, idx) => <span className="font-bold text-graphite/60">{row.rank || idx + 1}</span> 
    },
    { 
      key: 'team', label: 'Команда', width: 'w-full min-w-[200px]', // Занимает все свободное место
      render: (row) => (
        <div className="flex items-center gap-3 py-1">
          <div className="w-8 h-8 shrink-0 flex items-center justify-center">
             <img 
               src={getImageUrl(row.logo_url || '/default/Logo_division_default.webp')} 
               alt="logo" 
               className="w-full h-full object-contain" 
             />
          </div>
          <span className="font-bold text-[14px] truncate" title={row.team_name}>{row.team_name}</span>
        </div>
      ) 
    },
    { key: 'games_played', label: 'Игр', width: 'min-w-[100px]', align: 'center' }, 
    { key: 'wins_reg', label: 'Выигрыши', width: 'min-w-[100px]', align: 'center' },
    { key: 'wins_ot', label: 'ВО/ВБ', width: 'min-w-[100px]', align: 'center' }, 
    { key: 'draws', label: 'Ничьи', width: 'min-w-[100px]', align: 'center' },
    { key: 'losses_ot', label: 'ПО/ПБ', width: 'min-w-[100px]', align: 'center' }, 
    { key: 'losses_reg', label: 'Проигрыши', width: 'min-w-[100px]', align: 'center' },
    { 
      key: 'goals', label: 'Шайбы', width: 'min-w-[100px]', align: 'center', 
      render: (row) => <span className="text-graphite/80 font-medium whitespace-nowrap">{row.goals_for} - {row.goals_against}</span> 
    },
    { 
      key: 'points', label: 'Очки', width: 'min-w-[180px]', align: 'center', 
      render: (row) => <span className="font-bold text-orange text-[15px]">{row.points}</span> 
    }
  ];

  return (
    <div className="w-full flex flex-col mb-8">
      <div className="mb-6 flex items-center min-h-[38px]">
        <h3 className="text-[18px] font-black text-graphite leading-tight tracking-tight">
          Регулярный чемпионат
        </h3>
      </div>
      
      {isLoading ? (
        <div className="h-[200px] flex items-center justify-center">
          <Loader text="" />
        </div>
      ) : displayData.length > 0 ? (
        <div className="overflow-hidden">
          <Table 
            columns={columns} 
            data={displayData} 
            rowClassName={(row) => {
              const isPlayoffSpot = playoffSpotsCount > 0 && displayData.findIndex(s => s.team_id === row.team_id) < playoffSpotsCount;
              return isPlayoffSpot ? 'border-l-[3px] border-l-[#10B981]' : 'border-l-[3px] border-l-transparent';
            }} 
          />
        </div>
      ) : (
        <div className="h-[200px] flex items-center justify-center border-2 border-dashed border-graphite/10 rounded-md bg-graphite/[0.02]">
          <span className="text-sm font-medium text-graphite-light/50">
            В дивизионе пока нет допущенных команд
          </span>
        </div>
      )}
    </div>
  );
}