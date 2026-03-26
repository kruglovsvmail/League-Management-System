import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';

const CATEGORIES = [
  { key: 'points', label: 'Лучшие бомбардиры', highlight: 'Очки' },
  { key: 'goals', label: 'Лучшие снайперы', highlight: 'Голы' },
  { key: 'assists', label: 'Лучшие ассистенты', highlight: 'Передачи' },
  { key: 'plus_minus', label: 'Лучшая полезность', highlight: '+ / -' }
];

export default function TeamLeadersOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'team_leaders';

  const [catIndex, setCatIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  const switchDuration = overlay.data?.switchDuration || 7;

  useEffect(() => {
    if (!isVisible) {
      setCatIndex(0);
      setIsFading(false);
      return;
    }

    const interval = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setCatIndex(prev => (prev + 1) % CATEGORIES.length);
        setIsFading(false);
      }, 500);
    }, switchDuration * 1000);

    return () => clearInterval(interval);
  }, [isVisible, switchDuration]);

  if (!game) return null;

  const leagueLogo = getImageUrl(game.league_logo);
  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);
  const defaultAvatar = getImageUrl('default/user_default.webp');

  const activeCategory = CATEGORIES[catIndex];

  const getBestPlayer = (roster, statKey, fallbackLeader) => {
    if (!roster || !Array.isArray(roster) || roster.length === 0) return fallbackLeader;
    
    const sorted = [...roster].sort((a, b) => {
      const valA = parseFloat(a[statKey]) || 0;
      const valB = parseFloat(b[statKey]) || 0;
      return valB - valA;
    });
    
    const best = sorted[0];
    
    if (best && (parseFloat(best[statKey]) !== 0 || statKey === 'plus_minus')) {
      return best;
    }
    
    return fallbackLeader || best;
  };

  const currentHomeLeader = getBestPlayer(game.home_roster, activeCategory.key, game.home_leader);
  const currentAwayLeader = getBestPlayer(game.away_roster, activeCategory.key, game.away_leader);

  const StatRow = ({ label, homeValue, awayValue, highlight }) => (
    <div className={`flex items-center w-full py-4 px-10 transition-colors duration-500 ${highlight ? 'bg-blue-500/10 border-y border-blue-500/20 shadow-inner' : 'even:bg-white/[0.02] border-y border-transparent'}`}>
       <div className={`w-1/3 text-right text-4xl font-black tabular-nums transition-all duration-500 ${highlight ? 'text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.5)] scale-110 origin-right' : 'text-white'}`}>
         {homeValue ?? '-'}
       </div>
       <div className={`w-1/3 text-center text-sm font-bold uppercase tracking-[0.25em] transition-colors duration-500 ${highlight ? 'text-blue-300' : 'text-white/50'}`}>
         {label}
       </div>
       <div className={`w-1/3 text-left text-4xl font-black tabular-nums transition-all duration-500 ${highlight ? 'text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.5)] scale-110 origin-left' : 'text-white'}`}>
         {awayValue ?? '-'}
       </div>
    </div>
  );

  const PlayerProfile = ({ leader, teamLogo, isHome }) => {
    const photo = leader ? (getSafeUrl(leader.avatar_url) || defaultAvatar) : defaultAvatar;
    const firstName = leader?.first_name || 'Игрок';
    const lastName = leader?.last_name || 'Неизвестен';
    const number = leader?.jersey_number || '00';

    return (
        <div className={`flex flex-col items-center w-[480px] transition-all duration-500 ease-in-out ${isFading ? (isHome ? 'opacity-0 -translate-x-16 blur-sm' : 'opacity-0 translate-x-16 blur-sm') : 'opacity-100 translate-x-0 blur-0'}`}>
            <div className="relative mb-6">
                <div className="w-48 h-48 rounded-[2.5rem] overflow-hidden border-2 border-white/10 shadow-2xl relative z-10 bg-[#0a0b0c]">
                    <img 
                      src={photo} 
                      alt="Player" 
                      className="w-full h-full object-cover object-top" 
                      onError={(e) => { e.target.src = defaultAvatar; }} 
                    />
                </div>
                {teamLogo && (
                    <div className={`absolute -bottom-5 ${isHome ? '-right-10' : '-left-10'} w-16 h-16 bg-[#0a0b0c]/50 rounded-full shadow-xl flex items-center justify-center p-2 z-20`}>
                        <img src={teamLogo} alt="Team" className="w-full h-full object-contain" />
                    </div>
                )}
            </div>

            <div className="flex items-center justify-center gap-6 w-full px-2">
                <div className="flex flex-col items-end text-right">
                    <span className="text-xl font-bold text-white/80 uppercase tracking-tight max-w-[270px] truncate leading-none mb-1.5">
                        {firstName}
                    </span>
                    <span className="text-4xl font-black text-white uppercase tracking-tight max-w-[270px] truncate leading-none drop-shadow-md">
                        {lastName}
                    </span>
                </div>
                <span className="w-0.5 h-12 bg-white/20 shrink-0"></span>
                <span className="text-5xl font-black italic text-blue-400 drop-shadow-md shrink-0">
                    #{number}
                </span>
            </div>
        </div>
    );
  };

  return (
    <AnimationWrapper type="team_leaders" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/0 backdrop-blur-md pointer-events-none"></div>

      <div className="relative flex flex-col items-center w-[1400px] h-[1000px] bg-[#000000ff]/[98%] rounded-[3rem] border border-white/10 shadow-[0_0_120px_rgba(0,0,0,0.8)] overflow-hidden pb-10">

        <div className="w-full bg-white/5 border-b border-white/10 flex items-center justify-center py-6 relative shrink-0 mb-12">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>
          {leagueLogo && <img src={leagueLogo} alt="League" className="absolute left-12 h-12 object-contain drop-shadow-lg" />}
          
          <span className={`text-2xl font-black text-white uppercase tracking-[0.3em] drop-shadow-sm transition-all duration-500 ease-in-out ${isFading ? 'opacity-0 scale-90 blur-sm' : 'opacity-100 scale-100 blur-0'}`}>
            {activeCategory.label}
          </span>
        </div>

        <div className="w-full flex-1">
            <div className="flex justify-between items-end w-full px-24 mb-10 overflow-hidden">
                <PlayerProfile leader={currentHomeLeader} teamLogo={homeLogo} isHome={true} />
                <PlayerProfile leader={currentAwayLeader} teamLogo={awayLogo} isHome={false} />
            </div>

            <div className={`w-full px-24 transition-all duration-500 ease-in-out ${isFading ? 'opacity-0 translate-y-12 blur-sm' : 'opacity-100 translate-y-0 blur-0'}`}>
                <div className="flex flex-col w-full bg-black/40 rounded-3xl border border-white/5 overflow-hidden py-4 shadow-inner">
                    <StatRow label="Игры" homeValue={currentHomeLeader?.games_played} awayValue={currentAwayLeader?.games_played} highlight={activeCategory.highlight === 'Игры'} />
                    <StatRow label="Очки" homeValue={currentHomeLeader?.points} awayValue={currentAwayLeader?.points} highlight={activeCategory.highlight === 'Очки'} />
                    <StatRow label="Голы" homeValue={currentHomeLeader?.goals} awayValue={currentAwayLeader?.goals} highlight={activeCategory.highlight === 'Голы'} />
                    <StatRow label="Передачи" homeValue={currentHomeLeader?.assists} awayValue={currentAwayLeader?.assists} highlight={activeCategory.highlight === 'Передачи'} />
                    <StatRow 
                      label="+ / -" 
                      homeValue={currentHomeLeader?.plus_minus > 0 ? `+${currentHomeLeader?.plus_minus}` : currentHomeLeader?.plus_minus} 
                      awayValue={currentAwayLeader?.plus_minus > 0 ? `+${currentAwayLeader?.plus_minus}` : currentAwayLeader?.plus_minus} 
                      highlight={activeCategory.highlight === '+ / -'}
                    />
                    <StatRow label="Штраф (мин)" homeValue={currentHomeLeader?.penalty_minutes} awayValue={currentAwayLeader?.penalty_minutes} highlight={activeCategory.highlight === 'Штраф'} />
                </div>
            </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}