import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';

const CATEGORIES = [
  { key: 'points', label: 'ЛУЧШИЕ БОМБАРДИРЫ', highlight: 'ОЧКИ' },
  { key: 'goals', label: 'ЛУЧШИЕ СНАЙПЕРЫ', highlight: 'ГОЛЫ' },
  { key: 'assists', label: 'ЛУЧШИЕ АССИСТЕНТЫ', highlight: 'ПЕРЕДАЧИ' },
  { key: 'plus_minus', label: 'ПОЛЕЗНОСТЬ', highlight: '+ / -' }
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
    <div className={`flex items-center w-full py-4 px-10 transition-colors duration-500 border-b border-mts-grey-light/30 ${highlight ? 'bg-mts-grey-light/10' : 'bg-white'}`}>
       <div className={`w-1/3 text-right text-3xl font-black tabular-nums transition-colors duration-500 ${highlight ? 'text-mts-red' : 'text-mts-black'}`}>
         {homeValue ?? '-'}
       </div>
       <div className={`w-1/3 text-center text-sm font-bold uppercase tracking-[0.25em] transition-colors duration-500 ${highlight ? 'text-mts-red' : 'text-mts-grey-dark'}`}>
         {label}
       </div>
       <div className={`w-1/3 text-left text-3xl font-black tabular-nums transition-colors duration-500 ${highlight ? 'text-mts-red' : 'text-mts-black'}`}>
         {awayValue ?? '-'}
       </div>
    </div>
  );

  const PlayerProfile = ({ leader, teamLogo, isHome }) => {
    const photo = leader ? (getSafeUrl(leader.avatar_url) || defaultAvatar) : defaultAvatar;
    const firstName = leader?.first_name || 'ИГРОК';
    const lastName = leader?.last_name || 'НЕИЗВЕСТЕН';
    const number = leader?.jersey_number || '00';

    return (
        <div className={`flex flex-col w-[400px] transition-opacity duration-500 ease-in-out ${isFading ? 'opacity-0' : 'opacity-100'} ${isHome ? 'items-end' : 'items-start'}`}>
            <div className="relative mb-6 w-[280px] h-[280px] bg-white">
                <img 
                  src={photo} 
                  alt="Player" 
                  className="w-full h-full object-cover object-top" 
                  onError={(e) => { e.target.src = defaultAvatar; }} 
                />
                <div className={`absolute bottom-0 ${isHome ? 'left-0' : 'right-0'} bg-mts-red px-4 py-2`}>
                   <span className="text-4xl font-black text-white">{number}</span>
                </div>
            </div>

            <div className={`flex flex-col w-full ${isHome ? 'text-right' : 'text-left'}`}>
                <span className="text-xl font-bold text-mts-grey-dark uppercase tracking-widest leading-none mb-2">
                    {firstName}
                </span>
                <span className="text-4xl font-black text-mts-black uppercase tracking-wide leading-none">
                    {lastName}
                </span>
            </div>
        </div>
    );
  };

  return (
    <AnimationWrapper type="team_leaders" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50 bg-white">
      <div className="flex flex-col w-full h-full">

        <div className="w-full bg-mts-red flex items-center justify-center py-8 shrink-0 mb-16">
          <span className={`text-2xl font-bold text-white uppercase tracking-[0.3em] transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
            {activeCategory.label}
          </span>
        </div>

        <div className="w-full flex-1 flex flex-col justify-center px-32 pb-20">
            <div className="flex justify-between items-center w-full mb-12">
                <div className="flex items-center gap-8">
                   {homeLogo && <img src={homeLogo} alt="Home" className="w-24 h-24 object-contain" />}
                   <span className="text-2xl font-bold text-mts-black uppercase tracking-widest">{game.home_team_name}</span>
                </div>
                <div className="flex items-center gap-8">
                   <span className="text-2xl font-bold text-mts-black uppercase tracking-widest">{game.away_team_name}</span>
                   {awayLogo && <img src={awayLogo} alt="Away" className="w-24 h-24 object-contain" />}
                </div>
            </div>

            <div className="flex justify-between items-stretch w-full">
                <PlayerProfile leader={currentHomeLeader} teamLogo={homeLogo} isHome={true} />
                
                <div className={`flex-1 flex flex-col mx-16 border border-mts-grey-light/30 transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
                    <StatRow label="ИГРЫ" homeValue={currentHomeLeader?.games_played} awayValue={currentAwayLeader?.games_played} highlight={activeCategory.highlight === 'ИГРЫ'} />
                    <StatRow label="ОЧКИ" homeValue={currentHomeLeader?.points} awayValue={currentAwayLeader?.points} highlight={activeCategory.highlight === 'ОЧКИ'} />
                    <StatRow label="ГОЛЫ" homeValue={currentHomeLeader?.goals} awayValue={currentAwayLeader?.goals} highlight={activeCategory.highlight === 'ГОЛЫ'} />
                    <StatRow label="ПЕРЕДАЧИ" homeValue={currentHomeLeader?.assists} awayValue={currentAwayLeader?.assists} highlight={activeCategory.highlight === 'ПЕРЕДАЧИ'} />
                    <StatRow 
                      label="+ / -" 
                      homeValue={currentHomeLeader?.plus_minus > 0 ? `+${currentHomeLeader?.plus_minus}` : currentHomeLeader?.plus_minus} 
                      awayValue={currentAwayLeader?.plus_minus > 0 ? `+${currentAwayLeader?.plus_minus}` : currentAwayLeader?.plus_minus} 
                      highlight={activeCategory.highlight === '+ / -'}
                    />
                    <StatRow label="ШТРАФ" homeValue={currentHomeLeader?.penalty_minutes} awayValue={currentAwayLeader?.penalty_minutes} highlight={activeCategory.highlight === 'ШТРАФ'} />
                </div>

                <PlayerProfile leader={currentAwayLeader} teamLogo={awayLogo} isHome={false} />
            </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}