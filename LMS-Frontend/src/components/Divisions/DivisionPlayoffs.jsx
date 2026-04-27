import React, { useState, useEffect } from 'react';
import { Loader } from '../../ui/Loader';
import { getToken, getImageUrl } from '../../utils/helpers';
import { useAccess } from '../../hooks/useAccess';

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

const getMatchBadge = (type) => {
  const badges = {
      'place_1': { text: '1 место', classes: 'bg-[#FEF3C7] text-[#D97706]' },
      'place_3': { text: '3 место', classes: 'bg-[#FFEDD5] text-[#9A3412]' },
      'place_5': { text: '5 место', classes: 'bg-graphite/10 text-graphite' },
      'place_7': { text: '7 место', classes: 'bg-graphite/10 text-graphite' },
      'place_9': { text: '9 место', classes: 'bg-graphite/10 text-graphite' },
      'place_11': { text: '11 место', classes: 'bg-graphite/10 text-graphite' },
      'place_13': { text: '13 место', classes: 'bg-graphite/10 text-graphite' },
      'place_15': { text: '15 место', classes: 'bg-graphite/10 text-graphite' }
  };
  return badges[type] || null;
};

const formatWinsNeeded = (wins, capitalize = false) => {
    let text = '';
    if (wins === 1) text = 'до 1-ой победы';
    else if (wins >= 2 && wins <= 4) text = `до ${wins}-х побед`;
    else text = `до ${wins}-ти побед`;
    
    return capitalize ? text.charAt(0).toUpperCase() + text.slice(1) : text;
};

export function DivisionPlayoffs({ divisionId }) {
  const { checkAccess } = useAccess();
  // Права на управление распределением
  const canManagePlayoff = checkAccess('PLAYOFF_DISTRIBUTE') || checkAccess('SETTINGS_PLAYOFF_CONSTRUCTOR');

  const [brackets, setBrackets] = useState([]);
  const [games, setGames] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchPlayoffs = () => {
    if (!divisionId) return;
    setIsLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/playoff`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setBrackets(data.brackets || []);
        setGames(data.games || []);
        setAllTeams(data.allTeams || []);
      }
    })
    .catch(err => console.error('Ошибка загрузки плей-офф:', err))
    .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchPlayoffs();
  }, [divisionId]);

  const handleDistribute = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/playoff/distribute`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) fetchPlayoffs();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/playoff/reset`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) fetchPlayoffs();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSelect = async (matchupId, field, teamId) => {
    try {
      const payload = { [field]: teamId || null };
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/playoff/${matchupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) fetchPlayoffs();
    } catch (err) {
      console.error('Ошибка ручного выбора:', err);
    }
  };

  const getMatchupStats = (matchup) => {
    if (!matchup.team1_id || !matchup.team2_id) return { finishedGames: [], nextGame: null };
    
    const matchupGames = games.filter(g =>
        (g.home_team_id === matchup.team1_id && g.away_team_id === matchup.team2_id) ||
        (g.home_team_id === matchup.team2_id && g.away_team_id === matchup.team1_id)
    );

    const finishedGames = matchupGames.filter(g => g.status === 'finished');
    const nextGame = matchupGames.find(g => ['scheduled', 'live'].includes(g.status));

    return { finishedGames, nextGame };
  };

  const renderTeamBox = (matchup, teamIndex) => {
    const isTeam1 = teamIndex === 1;
    const teamId = isTeam1 ? matchup.team1_id : matchup.team2_id;
    const wins = isTeam1 ? matchup.team1_wins : matchup.team2_wins;
    const isWinner = matchup.winner_id && matchup.winner_id === teamId;
    const isTbd = !teamId;
    const name = isTeam1 ? (matchup.team1_name || matchup.team1_short) : (matchup.team2_name || matchup.team2_short);
    const logo = isTeam1 ? matchup.team1_logo : matchup.team2_logo;
    const sourceType = isTeam1 ? matchup.team1_source_type : matchup.team2_source_type;

    return (
      <div className={`flex items-center justify-between border rounded-md transition-colors p-2 ${
        isWinner 
          ? 'bg-white shadow-[0_0_0_1px_rgba(255,122,0,0.3)]' 
          : 'bg-white/60 border-graphite/10'
      }`}>
        <div className="flex items-center overflow-hidden gap-2 w-full">
          {isTbd ? (
             <div className="bg-graphite/5 rounded-full shrink-0 w-5 h-5 flex items-center justify-center text-[10px] text-graphite/40 font-bold">?</div>
          ) : logo ? (
             <img src={getImageUrl(logo)} className="object-contain shrink-0 w-5 h-5" alt="logo" />
          ) : (
             <div className="bg-graphite/10 rounded-full shrink-0 w-5 h-5" />
          )}
          
          {isTbd && sourceType === 'manual' && canManagePlayoff ? (
             <select 
               className="text-[12px] bg-transparent outline-none w-full text-graphite font-bold cursor-pointer"
               onChange={(e) => handleManualSelect(matchup.id, isTeam1 ? 'team1_id' : 'team2_id', e.target.value)}
             >
                <option value="">Выберите...</option>
                {allTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
             </select>
          ) : (
             <span className={`font-bold truncate text-[13px] ${isWinner ? 'text-orange' : isTbd ? 'text-graphite/40' : 'text-graphite/90'}`}>
                {isTbd ? 'Ожидается' : (name || 'Неизвестно')}
             </span>
          )}
        </div>
        {!isTbd && (
          <span className={`font-black text-center shrink-0 w-5 text-[13px] ${isWinner ? 'text-orange' : 'text-graphite-light'}`}>
            {wins || 0}
          </span>
        )}
      </div>
    );
  };

  // Проверяем, есть ли хотя бы один заполненный слот (чтобы показать кнопку сброса)
  const isDistributed = brackets.some(b => 
    b.rounds.some(r => 
        r.matchups.some(m => m.team1_id !== null || m.team2_id !== null)
    )
  );

  return (
    <div className="w-full flex flex-col">
      <div className="mb-6 flex items-center justify-between min-h-[38px]">
        <h3 className="text-[18px] font-black text-graphite leading-tight tracking-tight">
          Стадия Плей-офф
        </h3>
        
        {canManagePlayoff && brackets.length > 0 && (
           <div className="flex items-center">
              {isDistributed ? (
                 <button 
                   onClick={handleReset} 
                   disabled={isProcessing}
                   className="px-4 py-2 bg-status-rejected/10 text-status-rejected rounded-lg text-sm font-bold hover:bg-status-rejected hover:text-white transition-colors disabled:opacity-50"
                 >
                   {isProcessing ? 'Обработка...' : 'Сбросить плей-офф'}
                 </button>
              ) : (
                 <button 
                   onClick={handleDistribute} 
                   disabled={isProcessing}
                   className="px-4 py-2 bg-orange/10 text-orange rounded-lg text-sm font-bold hover:bg-orange hover:text-white transition-colors disabled:opacity-50"
                 >
                   {isProcessing ? 'Распределяем...' : 'Распределить команды'}
                 </button>
              )}
           </div>
        )}
      </div>

      {isLoading ? (
        <div className="h-[300px] flex items-center justify-center border border-dashed border-graphite/10 rounded-xl bg-graphite/[0.02]">
          <Loader text="" />
        </div>
      ) : brackets.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center border-2 border-dashed border-graphite/10 rounded-xl bg-graphite/[0.02]">
          <span className="text-sm font-medium text-graphite-light/50">
            Сетка плей-офф еще не сформирована
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-14">
          {brackets.map((bracket, bIdx) => (
            <div key={bracket.id} className="flex flex-col relative w-full">
              
              <div className="flex items-center gap-3 mb-6">
                <h4 className="text-[16px] font-bold text-graphite">
                  {bracket.name}
                </h4>
                {bracket.is_main && (
                  <span className="px-2 py-1 bg-orange/10 text-orange text-[10px] font-black uppercase tracking-widest rounded-md">
                    Главный кубок
                  </span>
                )}
              </div>

              <div className="overflow-x-auto pb-6 custom-scrollbar w-full">
                <div className="flex gap-10 min-w-max">
                  {bracket.rounds?.map((round, rIdx) => {
                    const isRightSide = rIdx > (bracket.rounds.length / 2); 

                    return (
                      <div key={round.id} className="flex flex-col gap-6 w-[260px]">
                        
                        <div className="text-[12px] font-black uppercase text-graphite-light text-center border-b border-graphite/10 pb-2">
                          {round.name} 
                          <span className="block text-[10px] font-medium text-graphite/40 mt-0.5 normal-case">
                            {formatWinsNeeded(round.wins_needed)}
                          </span>
                        </div>

                        <div className="flex flex-col justify-around h-full flex-1 gap-6">
                          {round.matchups?.map(matchup => {
                            const stats = getMatchupStats(matchup);
                            const hasTooltipData = stats.finishedGames.length > 0 || stats.nextGame;
                            const matchType = matchup.ui_metadata?.match_type || 'regular';
                            const badge = getMatchBadge(matchType);

                            const tooltipPosClass = isRightSide 
                              ? "right-[calc(100%+12px)] before:left-auto before:-right-[6px] before:border-r-transparent before:border-l-white" 
                              : "left-[calc(100%+12px)] before:-left-[6px] before:border-r-white";

                            return (
                              <div key={matchup.id} className="relative group flex items-center">
                                <div className="flex flex-col gap-1 bg-graphite/[0.03] p-1.5 rounded-lg border border-transparent group-hover:border-graphite/20 transition-all w-full relative z-20">
                                  {badge && (
                                    <div className="flex justify-center pb-1">
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm ${badge.classes}`}>
                                            За {badge.text}
                                        </span>
                                    </div>
                                  )}
                                  {renderTeamBox(matchup, 1)}
                                  {renderTeamBox(matchup, 2)}
                                </div>

                                {hasTooltipData && (
                                  <div className={`absolute top-1/2 -translate-y-1/2 ${tooltipPosClass} w-[280px] bg-white border border-graphite/20 shadow-[0_15px_40px_rgba(0,0,0,0.15)] rounded-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] pointer-events-none before:content-[''] before:absolute before:top-1/2 before:-translate-y-1/2 before:border-[6px] before:border-transparent`}>
                                    
                                    {stats.finishedGames.length > 0 && (
                                      <div className="flex flex-col gap-2">
                                        {stats.finishedGames.map(g => {
                                          const hLogo = g.home_team_id === matchup.team1_id ? matchup.team1_logo : matchup.team2_logo;
                                          const aLogo = g.away_team_id === matchup.team1_id ? matchup.team1_logo : matchup.team2_logo;
                                          const hName = g.home_team_id === matchup.team1_id ? (matchup.team1_name || matchup.team1_short) : (matchup.team2_name || matchup.team2_short);
                                          const aName = g.away_team_id === matchup.team1_id ? (matchup.team1_name || matchup.team1_short) : (matchup.team2_name || matchup.team2_short);
                                          const isOt = g.end_type === 'ot' ? '(ОТ)' : g.end_type === 'so' ? '(Б)' : '';

                                          return (
                                            <div key={g.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                               <div className="flex items-center justify-end gap-1.5 overflow-hidden">
                                                 <span className="text-[12px] font-bold text-graphite truncate">{hName}</span>
                                                 {hLogo ? <img src={getImageUrl(hLogo)} className="object-contain shrink-0 w-4 h-4" /> : <div className="bg-graphite/10 rounded-full shrink-0 w-4 h-4"/>}
                                               </div>
                                               <div className="text-[12px] min-w-[48px] font-black text-graphite text-center">
                                                 {g.is_technical ? 'ТП' : `${g.home_score}:${g.away_score}`} <span className="text-[10px] font-semibold text-graphite-light">{isOt}</span>
                                               </div>
                                               <div className="flex items-center justify-start gap-1.5 overflow-hidden">
                                                 {aLogo ? <img src={getImageUrl(aLogo)} className="object-contain shrink-0 w-4 h-4" /> : <div className="bg-graphite/10 rounded-full shrink-0 w-4 h-4"/>}
                                                 <span className="text-[12px] font-bold text-graphite truncate">{aName}</span>
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
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}