import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Header } from '../components/Header';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { Table } from '../ui/Table2';
import { Loader } from '../ui/Loader';
import { Button } from '../ui/Button';
import { Modal } from '../modals/Modal';
import { getToken, getImageUrl } from '../utils/helpers';
import { useAccess } from '../hooks/useAccess';

const STAGES_ORDER = ['1/8', '1/4', '1/2', 'final', '3rd_place'];
const STAGES_LABELS = { '1/8': '1/8 Финала', '1/4': '1/4 Финала', '1/2': 'Полуфинал', 'final': 'Финал', '3rd_place': 'Матч за 3-е место' };

const getPlayoffSpots = (roundString) => {
  if (!roundString) return 0;
  switch (roundString) {
    case '1/32': return 64; case '1/16': return 32; case '1/8': return 16;
    case '1/4': return 8; case '1/2': return 4; case 'final': return 2; default: return 0;
  }
};

const formatNextGameDate = (dateString) => {
  if (!dateString) return 'Дата не назначена';
  const d = new Date(dateString);
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month}, в ${hours}:${minutes}`;
};

export function StandingsPage() {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  
  const [divisions, setDivisions] = useState([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState(null);
  
  const [standings, setStandings] = useState([]);
  const [bracket, setBracket] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [playoffGames, setPlayoffGames] = useState([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState(0); 

  const [editingMatchup, setEditingMatchup] = useState(null);
  const [tempTeam1, setTempTeam1] = useState(null);
  const [tempTeam2, setTempTeam2] = useState(null);

  // Стейт для модалки подтверждения генерации
  const [confirmGenerateOpen, setConfirmGenerateOpen] = useState(false);

  // Разделение прав доступа
  const canGenerateBracket = checkAccess('GENERATE_PLAYOFF');
  const canEditMatchup = checkAccess('EDIT_PLAYOFF_MATCHUP');

  useEffect(() => {
    if (selectedLeague?.id) {
      fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/seasons`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      .then(res => res.json()).then(data => {
        if (data.success && data.data.length > 0) {
          setSeasons(data.data);
          setSelectedSeasonId((data.data.find(s => s.is_active) || data.data[0]).id);
        } else { setSeasons([]); setSelectedSeasonId(null); }
      });
    }
  }, [selectedLeague]);

  useEffect(() => {
    if (selectedSeasonId) {
      fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/divisions`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      .then(res => res.json()).then(data => {
        if (data.success && data.data.length > 0) {
          setDivisions(data.data);
          setSelectedDivisionId(data.data[0].id);
        } else { setDivisions([]); setSelectedDivisionId(null); }
      });
    }
  }, [selectedSeasonId]);

  useEffect(() => {
    if (!selectedDivisionId) return;
    setIsLoading(true);
    
    if (viewMode === 0) {
      fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${selectedDivisionId}/standings`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      .then(res => res.json()).then(data => { if (data.success) setStandings(data.data); })
      .finally(() => setIsLoading(false));
    } else {
      fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${selectedDivisionId}/playoff`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      .then(res => res.json()).then(data => { 
        if (data.success) { 
            setBracket(data.bracket); 
            setAllTeams(data.allTeams); 
            setPlayoffGames(data.games || []);
        }
      })
      .finally(() => setIsLoading(false));
    }
  }, [selectedDivisionId, viewMode]);

  const handleGenerateBracket = async () => {
    setConfirmGenerateOpen(false); // Закрываем модалку предупреждения
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${selectedDivisionId}/playoff/generate`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        const brRes = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${selectedDivisionId}/playoff`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        const brData = await brRes.json();
        setBracket(brData.bracket); setAllTeams(brData.allTeams); setPlayoffGames(brData.games || []);
      } else alert(data.error);
    } finally { setIsLoading(false); }
  };

  const handleSaveMatchup = async () => {
    if (!editingMatchup) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${selectedDivisionId}/playoff/${editingMatchup.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ team1_id: tempTeam1?.id || null, team2_id: tempTeam2?.id || null })
      });
      if (res.ok) {
        const updated = bracket.map(b => b.id === editingMatchup.id ? { ...b, team1_id: tempTeam1?.id, team1_name: tempTeam1?.name, team1_logo: tempTeam1?.logo_url, team2_id: tempTeam2?.id, team2_name: tempTeam2?.name, team2_logo: tempTeam2?.logo_url } : b);
        setBracket(updated);
        setEditingMatchup(null);
      } else {
        const err = await res.json();
        alert(`Ошибка: ${err.error}`);
      }
    } catch (e) { alert('Ошибка сохранения'); }
  };

  const currentDivision = divisions.find(d => d.id === selectedDivisionId);
  const playoffSpotsCount = getPlayoffSpots(currentDivision?.playoff_start_round);
  
  const isCompactMode = currentDivision?.playoff_start_round === '1/8';

  const columns = [
    { key: 'rank', label: 'М', width: 'w-12', align: 'center', render: (row, idx) => <span className="font-bold text-graphite/60">{row.rank || idx + 1}</span> },
    { key: 'team', label: 'Команда', render: (row) => (
        <div className="flex items-center gap-3 py-1">
          <div className="w-9 h-9 shrink-0 bg-white rounded-md border border-graphite/10 flex items-center justify-center p-1 shadow-sm">
             <img src={getImageUrl(row.logo_url)} alt="logo" className="w-full h-full object-contain" onError={(e) => { e.target.style.display='none'; }} />
          </div>
          <span className="font-bold text-[14px]">{row.team_name}</span>
        </div>
      ) 
    },
    { key: 'games_played', label: 'Игр', align: 'center' }, { key: 'wins_reg', label: 'В', align: 'center' },
    { key: 'wins_ot', label: 'ВО/ВБ', align: 'center' }, { key: 'draws', label: 'Н', align: 'center' },
    { key: 'losses_ot', label: 'ПО/ПБ', align: 'center' }, { key: 'losses_reg', label: 'П', align: 'center' },
    { key: 'goals', label: 'Шайбы', align: 'center', render: (row) => <span className="text-graphite/80 font-medium">{row.goals_for}-{row.goals_against}</span> },
    { key: 'points', label: 'Очки', align: 'center', render: (row) => <span className="font-bold text-orange text-[15px]">{row.points}</span> }
  ];

  if (!selectedLeague) return (<div className="flex flex-col flex-1 animate-fade-in-down"><Header title="Турнирные таблицы" /><main className="p-10 flex flex-1 items-center justify-center"><div className="text-center text-graphite-light font-medium text-lg">Выберите лигу</div></main></div>);

  const getMatchupStats = (matchup) => {
    if (!matchup.team1_id || !matchup.team2_id) return { games: [], finishedGames: [], nextGame: null, t1Wins: 0, t2Wins: 0 };
    const games = playoffGames.filter(g =>
        (g.home_team_id === matchup.team1_id && g.away_team_id === matchup.team2_id) ||
        (g.home_team_id === matchup.team2_id && g.away_team_id === matchup.team1_id)
    );

    const finishedGames = games.filter(g => g.status === 'finished');
    const nextGame = games.find(g => ['scheduled', 'live'].includes(g.status));

    let t1Wins = 0; let t2Wins = 0;
    finishedGames.forEach(g => {
        const hScore = Number(g.home_score || 0); const aScore = Number(g.away_score || 0);
        if (hScore > aScore) {
            if (g.home_team_id === matchup.team1_id) t1Wins++; else t2Wins++;
        } else if (aScore > hScore) {
            if (g.away_team_id === matchup.team1_id) t1Wins++; else t2Wins++;
        }
    });
    return { games, finishedGames, nextGame, t1Wins, t2Wins };
  };

  const renderTeamBox = (name, logo, wins, isWinner) => (
    <div className={`flex items-center justify-between border rounded-md shadow-sm transition-colors ${
      isWinner 
        ? 'bg-white shadow-[0_0_0_1px_rgba(255,122,0,0.3)]' 
        : 'bg-white border-graphite/10'
    } ${isCompactMode ? 'p-1.5 px-2' : 'p-2'}`}>
      <div className={`flex items-center overflow-hidden ${isCompactMode ? 'gap-2 pr-1' : 'gap-2'}`}>
        {logo ? <img src={getImageUrl(logo)} className={`object-contain shrink-0 ${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'}`} /> : <div className={`bg-graphite/5 rounded-full shrink-0 ${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'}`} />}
        <span className={`font-bold truncate ${isCompactMode ? 'text-[11px]' : 'text-[13px]'} ${isWinner ? 'text-orange' : 'text-graphite/90'}`}>
          {name || ''}
        </span>
      </div>
      <span className={`font-black text-center shrink-0 ${isWinner ? 'text-orange' : 'text-graphite-light'} ${isCompactMode ? 'w-4 text-[12px]' : 'w-5 text-[13px]'}`}>
        {wins}
      </span>
    </div>
  );

  const bracketByStage = {};
  STAGES_ORDER.forEach(s => bracketByStage[s] = bracket.filter(b => b.stage === s));
  const activeStages = STAGES_ORDER.filter(s => bracketByStage[s]?.length > 0 && s !== '3rd_place');

  return (
    <div className="flex flex-col flex-1 relative pb-20 animate-fade-in-down">
      <Header title="Турнирные таблицы" actions={
        <div className="w-[220px]"><Select options={seasons.map(s => s.name)} value={seasons.find(s => s.id === selectedSeasonId)?.name || ''} onChange={(val) => { const s = seasons.find(s => s.name === val); if (s) setSelectedSeasonId(s.id); }} /></div>
      }/>
      
      <div className="p-6 md:px-10 flex flex-col gap-6">
        <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/50 p-4 shadow-sm flex flex-wrap gap-5 items-end">
          <div className="w-[300px]"><Select label="Дивизион" options={divisions.map(d => d.name)} value={currentDivision?.name || ''} onChange={(val) => { const d = divisions.find(d => d.name === val); if (d) setSelectedDivisionId(d.id); }} /></div>
          <div className="ml-auto w-[350px]"><SegmentButton options={['Регулярный чемпионат', 'Плей-офф']} defaultIndex={viewMode} onChange={setViewMode} /></div>
        </div>

        <div className="bg-white/80 backdrop-blur-md rounded-xl border border-white/50 shadow-sm min-h-[450px] relative">
          
          {canGenerateBracket && viewMode === 1 && bracket.length > 0 && !isLoading && (
            <div className="absolute top-4 right-8 z-10">
               <Button onClick={() => setConfirmGenerateOpen(true)} className="bg-white/80 text-graphite border border-graphite/20 hover:border-orange hover:text-orange text-[12px] py-1.5 px-4 shadow-sm">
                 Перегенерировать
               </Button>
            </div>
          )}

          {isLoading ? <div className="flex items-center justify-center h-[450px]"><Loader text="Загрузка данных..." /></div> : 
           viewMode === 0 ? (
             standings.length > 0 ? (
               <div className="overflow-hidden rounded-xl">
                 <Table columns={columns} data={standings} rowClassName={(row) => standings.findIndex(s => s.id === row.id) < playoffSpotsCount ? 'border-l-[3px] border-l-[#10B981]' : 'border-l-[3px] border-l-transparent'} />
               </div>
             ) : <div className="flex justify-center items-center h-[450px] text-graphite-light font-medium">Нет матчей</div>
          ) : (
            bracket.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[450px] gap-4">
                <span className="text-graphite-light font-medium">Сетка плей-офф еще не сформирована</span>
                {canGenerateBracket && <Button onClick={() => setConfirmGenerateOpen(true)}>Сгенерировать сетку</Button>}
              </div>
            ) : (
              <div className="p-6 md:p-8 pt-16 overflow-auto custom-scrollbar min-h-[450px]">
                <div className={`flex ${isCompactMode ? 'gap-6' : 'gap-12'} min-w-max pb-8`}>
                  
                  {activeStages.map((stage, sIdx) => {
                    const isRightSide = stage === 'final' || stage === '3rd_place';
                    const tooltipPosClass = isRightSide 
                      ? "right-[calc(100%+12px)] before:left-auto before:-right-[6px] before:border-r-transparent before:border-l-white" 
                      : "left-[calc(100%+12px)] before:-left-[6px] before:border-r-white";
                    
                    const tooltipWidthClass = isCompactMode ? 'w-[260px]' : 'w-[280px]';

                    return (
                    <div key={stage} className={`flex flex-col ${isCompactMode ? 'gap-6 w-[220px]' : 'gap-8 w-[280px]'}`}>
                      <h3 className="text-[12px] font-black uppercase text-graphite-light text-center mb-1 tracking-wide border-b border-graphite/10 pb-2">{STAGES_LABELS[stage]}</h3>
                      <div className={`flex flex-col justify-around h-full flex-1 ${isCompactMode ? 'gap-4' : 'gap-6'}`}>
                        {bracketByStage[stage].map(matchup => {
                          const stats = getMatchupStats(matchup);
                          const hasTooltipData = stats.finishedGames.length > 0 || stats.nextGame;

                          const isTeam1Winner = matchup.winner_id && matchup.winner_id === matchup.team1_id;
                          const isTeam2Winner = matchup.winner_id && matchup.winner_id === matchup.team2_id;

                          return (
                          <div key={matchup.id} className="relative group flex items-center">
                            <div className="flex flex-col gap-1 bg-graphite/5 p-1.5 rounded-lg border border-transparent group-hover:border-graphite/20 transition-all w-full relative z-20">
                              {renderTeamBox(matchup.team1_name, matchup.team1_logo, stats.t1Wins, isTeam1Winner)}
                              {renderTeamBox(matchup.team2_name, matchup.team2_logo, stats.t2Wins, isTeam2Winner)}
                            </div>

                            {hasTooltipData && (
                              <div className={`absolute top-1/2 -translate-y-1/2 ${tooltipPosClass} ${tooltipWidthClass} bg-white border border-graphite/20 shadow-[0_15px_40px_rgba(0,0,0,0.15)] rounded-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] pointer-events-none before:content-[''] before:absolute before:top-1/2 before:-translate-y-1/2 before:border-[6px] before:border-transparent`}>
                                
                                {stats.finishedGames.length > 0 && (
                                  <div className="flex flex-col gap-2">
                                    {stats.finishedGames.map(g => {
                                      const hLogo = g.home_team_id === matchup.team1_id ? matchup.team1_logo : matchup.team2_logo;
                                      const aLogo = g.away_team_id === matchup.team1_id ? matchup.team1_logo : matchup.team2_logo;
                                      const hName = g.home_team_id === matchup.team1_id ? (matchup.team1_short || matchup.team1_name) : (matchup.team2_short || matchup.team2_name);
                                      const aName = g.away_team_id === matchup.team1_id ? (matchup.team1_short || matchup.team1_name) : (matchup.team2_short || matchup.team2_name);
                                      const isOt = g.end_type === 'ot' ? '(ОТ)' : g.end_type === 'so' ? '(Б)' : '';

                                      return (
                                        <div key={g.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                           <div className="flex items-center justify-end gap-1.5 overflow-hidden">
                                             <span className={`${isCompactMode ? 'text-[11px]' : 'text-[12px]'} font-bold text-graphite truncate`}>{hName}</span>
                                             {hLogo ? <img src={getImageUrl(hLogo)} className={`object-contain shrink-0 ${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'}`} /> : <div className={`bg-graphite/10 rounded-full shrink-0 ${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'}`}/>}
                                           </div>
                                           <div className={`${isCompactMode ? 'text-[12px] min-w-[44px]' : 'text-[12px] min-w-[50px]'} font-black text-graphite text-center`}>
                                             {g.home_score}:{g.away_score} <span className={`${isCompactMode ? 'text-[9px]' : 'text-[10px]'} font-semibold text-graphite-light`}>{isOt}</span>
                                           </div>
                                           <div className="flex items-center justify-start gap-1.5 overflow-hidden">
                                             {aLogo ? <img src={getImageUrl(aLogo)} className={`object-contain shrink-0 ${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'}`} /> : <div className={`bg-graphite/10 rounded-full shrink-0 ${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'}`}/>}
                                             <span className={`${isCompactMode ? 'text-[11px]' : 'text-[12px]'} font-bold text-graphite truncate`}>{aName}</span>
                                           </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {stats.nextGame && (
                                  <div className={`text-center ${stats.finishedGames.length > 0 ? 'mt-3 pt-3 border-t border-graphite/10' : ''}`}>
                                     <div className="text-[11px] font-medium text-graphite">
                                       Следующий матч: <span className="font-bold">{formatNextGameDate(stats.nextGame.game_date)}</span>
                                     </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {canEditMatchup && (
                              <button onClick={() => { setEditingMatchup(matchup); setTempTeam1(allTeams.find(t => t.id === matchup.team1_id)); setTempTeam2(allTeams.find(t => t.id === matchup.team2_id)); }} className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-white border border-graphite/20 shadow-md text-graphite-light hover:text-orange rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-50">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                            )}
                          </div>
                        )})}
                      </div>
                    </div>
                  )})}

                  {/* Матч за 3 место */}
                  {bracketByStage['3rd_place']?.length > 0 && (
                     <div className={`flex flex-col ${isCompactMode ? 'gap-6 w-[220px] pl-6 md:pl-8' : 'gap-8 w-[280px] pl-12'} border-l border-dashed border-graphite/20`}>
                       <h3 className="text-[12px] font-black uppercase text-graphite/40 text-center mb-1 tracking-wide border-b border-graphite/10 pb-2">Матч за 3-е место</h3>
                       <div className={`flex flex-col ${isCompactMode ? 'gap-4' : 'gap-6'}`}>
                         {bracketByStage['3rd_place'].map(matchup => {
                            const stats = getMatchupStats(matchup);
                            const hasTooltipData = stats.finishedGames.length > 0 || stats.nextGame;
                            const tooltipWidthClass = isCompactMode ? 'w-[260px]' : 'w-[280px]';

                            const isTeam1Winner = matchup.winner_id && matchup.winner_id === matchup.team1_id;
                            const isTeam2Winner = matchup.winner_id && matchup.winner_id === matchup.team2_id;

                            return (
                            <div key={matchup.id} className="relative group flex items-center">
                              <div className="flex flex-col gap-1 bg-graphite/5 p-1.5 rounded-lg border border-transparent group-hover:border-graphite/20 transition-all w-full relative z-20">
                                {renderTeamBox(matchup.team1_name, matchup.team1_logo, stats.t1Wins, isTeam1Winner)}
                                {renderTeamBox(matchup.team2_name, matchup.team2_logo, stats.t2Wins, isTeam2Winner)}
                              </div>

                              {hasTooltipData && (
                                <div className={`absolute top-1/2 -translate-y-1/2 right-[calc(100%+12px)] ${tooltipWidthClass} bg-white border border-graphite/20 shadow-[0_15px_40px_rgba(0,0,0,0.15)] rounded-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] pointer-events-none before:content-[''] before:absolute before:top-1/2 before:-translate-y-1/2 before:-right-[6px] before:border-[6px] before:border-transparent before:border-l-white`}>
                                  {stats.finishedGames.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                      {stats.finishedGames.map(g => {
                                        const hLogo = g.home_team_id === matchup.team1_id ? matchup.team1_logo : matchup.team2_logo;
                                        const aLogo = g.away_team_id === matchup.team1_id ? matchup.team1_logo : matchup.team2_logo;
                                        const hName = g.home_team_id === matchup.team1_id ? (matchup.team1_short || matchup.team1_name) : (matchup.team2_short || matchup.team2_name);
                                        const aName = g.away_team_id === matchup.team1_id ? (matchup.team1_short || matchup.team1_name) : (matchup.team2_short || matchup.team2_name);
                                        const isOt = g.end_type === 'ot' ? '(ОТ)' : g.end_type === 'so' ? '(Б)' : '';

                                        return (
                                          <div key={g.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                             <div className="flex items-center justify-end gap-1.5 overflow-hidden">
                                               <span className={`${isCompactMode ? 'text-[11px]' : 'text-[12px]'} font-bold text-graphite truncate`}>{hName}</span>
                                               {hLogo ? <img src={getImageUrl(hLogo)} className={`object-contain shrink-0 ${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'}`} /> : <div className={`bg-graphite/10 rounded-full shrink-0 ${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'}`}/>}
                                             </div>
                                             <div className={`${isCompactMode ? 'text-[12px] min-w-[44px]' : 'text-[12px] min-w-[50px]'} font-black text-graphite text-center`}>
                                               {g.home_score}:{g.away_score} <span className={`${isCompactMode ? 'text-[9px]' : 'text-[10px]'} font-semibold text-graphite-light`}>{isOt}</span>
                                             </div>
                                             <div className="flex items-center justify-start gap-1.5 overflow-hidden">
                                               {aLogo ? <img src={getImageUrl(aLogo)} className={`object-contain shrink-0 ${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'}`} /> : <div className={`bg-graphite/10 rounded-full shrink-0 ${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'}`}/>}
                                               <span className={`${isCompactMode ? 'text-[11px]' : 'text-[12px]'} font-bold text-graphite truncate`}>{aName}</span>
                                             </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {stats.nextGame && (
                                    <div className={`text-center ${stats.finishedGames.length > 0 ? 'mt-3 pt-3 border-t border-graphite/10' : ''}`}>
                                       <div className="text-[11px] font-medium text-graphite">
                                         Следующий матч: <span className="font-bold">{formatNextGameDate(stats.nextGame.game_date)}</span>
                                       </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {canEditMatchup && (
                                <button onClick={() => { setEditingMatchup(matchup); setTempTeam1(allTeams.find(t => t.id === matchup.team1_id)); setTempTeam2(allTeams.find(t => t.id === matchup.team2_id)); }} className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-white border border-graphite/20 shadow-md text-graphite-light hover:text-orange rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-50">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                              )}
                            </div>
                         )})}
                       </div>
                     </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* МОДАЛКА: ЗАМЕНА КОМАНД */}
      <Modal isOpen={!!editingMatchup} onClose={() => setEditingMatchup(null)} title="Замена команд в серии" size="normal">
        <div className="flex flex-col gap-5">
          <Select 
             label="Команда (Верхняя)" 
             options={['Пусто (Не выбрана)', ...allTeams.map(t => t.name)]} 
             value={tempTeam1?.name || 'Пусто (Не выбрана)'} 
             onChange={(val) => setTempTeam1(val === 'Пусто (Не выбрана)' ? null : allTeams.find(t => t.name === val))} 
          />
          <Select 
             label="Команда (Нижняя)" 
             options={['Пусто (Не выбрана)', ...allTeams.map(t => t.name)]} 
             value={tempTeam2?.name || 'Пусто (Не выбрана)'} 
             onChange={(val) => setTempTeam2(val === 'Пусто (Не выбрана)' ? null : allTeams.find(t => t.name === val))} 
          />
          
          <div className="flex justify-end gap-3 mt-4">
            <Button onClick={handleSaveMatchup}>Сохранить выбор</Button>
          </div>
        </div>
      </Modal>

      {/* НОВАЯ МОДАЛКА: ПОДТВЕРЖДЕНИЕ ГЕНЕРАЦИИ СЕТКИ */}
      <Modal isOpen={confirmGenerateOpen} onClose={() => setConfirmGenerateOpen(false)} title="Генерация сетки плей-офф" size="normal">
        <div className="flex flex-col gap-5">
          <p className="text-[14px] text-graphite font-medium">
            Сгенерировать турнирную сетку на основе текущего положения команд в таблице?
          </p>
          
          {bracket.length > 0 && (
            <div className="p-3 bg-status-rejected/10 border border-status-rejected/20 rounded-xl flex items-start gap-3">
              <svg className="w-5 h-5 text-status-rejected shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-[13px] font-bold text-status-rejected leading-snug">
                Внимание: Текущая сетка будет удалена! Сами матчи останутся в базе, но распределение команд в парах будет пересчитано заново.
              </span>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-2">
            <Button onClick={() => setConfirmGenerateOpen(false)} className="bg-graphite/10 text-graphite hover:bg-graphite/20">
              Отмена
            </Button>
            <Button onClick={handleGenerateBracket} className="bg-orange text-white hover:bg-orange/90">
              Сгенерировать
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}