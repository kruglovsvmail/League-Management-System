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
    const sorted = [...roster].sort((a, b) => (parseFloat(b[statKey]) || 0) - (parseFloat(a[statKey]) || 0));
    const best = sorted[0];
    return (best && (parseFloat(best[statKey]) !== 0 || statKey === 'plus_minus')) ? best : fallbackLeader || best;
  };

  const currentHomeLeader = getBestPlayer(game.home_roster, activeCategory.key, game.home_leader);
  const currentAwayLeader = getBestPlayer(game.away_roster, activeCategory.key, game.away_leader);

  const StatRow = ({ label, homeValue, awayValue, highlight }) => (
    <div className={`flex items-center w-full py-3 px-8 transition-colors duration-500 rounded-full mb-2 ${highlight ? 'bg-verba-green-light text-white shadow-md' : 'bg-white text-gray-800 border border-gray-100'}`}>
       <div className={`w-1/3 text-right font-verba-lato text-3xl font-black tabular-nums ${highlight ? 'text-white' : 'text-verba-green-main'}`}>
         {homeValue ?? '-'}
       </div>
       <div className={`w-1/3 text-center text-sm font-bold uppercase tracking-widest ${highlight ? 'text-white' : 'text-gray-400'}`}>
         {label}
       </div>
       <div className={`w-1/3 text-left font-verba-lato text-3xl font-black tabular-nums ${highlight ? 'text-white' : 'text-verba-orange'}`}>
         {awayValue ?? '-'}
       </div>
    </div>
  );

  const PlayerProfile = ({ leader, isHome }) => {
    const photo = leader ? (getSafeUrl(leader.avatar_url) || defaultAvatar) : defaultAvatar;
    const firstName = leader?.first_name || 'ИГРОК';
    const lastName = leader?.last_name || 'НЕИЗВЕСТЕН';
    const number = leader?.jersey_number || '00';
    const accentBg = isHome ? 'bg-verba-green-main' : 'bg-verba-orange';

    return (
        <div className={`flex flex-col items-center w-[350px] transition-opacity duration-500 ease-in-out ${isFading ? 'opacity-0' : 'opacity-100'}`}>
            <div className={`relative mb-6 w-[260px] h-[260px] bg-white rounded-full border-[8px] border-white shadow-xl overflow-hidden`}>
                <img src={photo} alt="Player" className="w-full h-full object-cover object-top" onError={(e) => { e.target.src = defaultAvatar; }} />
                <div className={`absolute bottom-2 right-4 ${accentBg} rounded-full w-16 h-16 flex items-center justify-center border-4 border-white shadow-lg`}>
                   <span className="font-verba-lato text-2xl font-black text-white leading-none pt-1">{number}</span>
                </div>
            </div>
            <div className="flex flex-col items-center w-full text-center bg-white py-4 px-6 rounded-3xl shadow-md border border-gray-100">
                <span className="text-sm font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">{firstName}</span>
                <span className="text-3xl font-black text-gray-800 uppercase tracking-tight leading-none">{lastName}</span>
            </div>
        </div>
    );
  };

  return (
    <AnimationWrapper type="team_leaders" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50 bg-black/10 backdrop-blur-sm">
      <div className="flex flex-col w-[1400px] h-[850px] bg-[#F8F9FA] rounded-[40px] shadow-2xl overflow-hidden border border-white/50 relative">
        
        {/* Декоративные пятна на фоне */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-verba-lime rounded-full blur-[150px] opacity-10 pointer-events-none"></div>

        <div className="w-full bg-verba-green-main flex items-center justify-center py-6 shrink-0 shadow-md z-10 bg-verba-pattern">
          <span className={`text-2xl font-bold text-white uppercase tracking-[0.2em] transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'} bg-black/10 px-6 py-2 rounded-full`}>
            {activeCategory.label}
          </span>
        </div>

        <div className="w-full flex-1 flex flex-col justify-center px-16 pb-12 relative z-10">
            <div className="flex justify-between items-center w-full mb-10 mt-6">
                <div className="flex items-center gap-6 bg-white pr-8 rounded-r-full shadow-sm border border-gray-100">
                   {homeLogo && <div className="bg-gray-50 rounded-full p-2 w-20 h-20 shadow-inner"><img src={homeLogo} alt="Home" className="w-full h-full object-contain" /></div>}
                   <span className="text-2xl font-black text-gray-800 uppercase tracking-widest">{game.home_team_name}</span>
                </div>
                <div className="flex items-center gap-6 bg-white pl-8 rounded-l-full shadow-sm border border-gray-100">
                   <span className="text-2xl font-black text-gray-800 uppercase tracking-widest">{game.away_team_name}</span>
                   {awayLogo && <div className="bg-gray-50 rounded-full p-2 w-20 h-20 shadow-inner"><img src={awayLogo} alt="Away" className="w-full h-full object-contain" /></div>}
                </div>
            </div>

            <div className="flex justify-between items-center w-full">
                <PlayerProfile leader={currentHomeLeader} isHome={true} />
                <div className={`flex-1 flex flex-col mx-12 transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
                    <StatRow label="ИГРЫ" homeValue={currentHomeLeader?.games_played} awayValue={currentAwayLeader?.games_played} highlight={activeCategory.highlight === 'ИГРЫ'} />
                    <StatRow label="ОЧКИ" homeValue={currentHomeLeader?.points} awayValue={currentAwayLeader?.points} highlight={activeCategory.highlight === 'ОЧКИ'} />
                    <StatRow label="ГОЛЫ" homeValue={currentHomeLeader?.goals} awayValue={currentAwayLeader?.goals} highlight={activeCategory.highlight === 'ГОЛЫ'} />
                    <StatRow label="ПЕРЕДАЧИ" homeValue={currentHomeLeader?.assists} awayValue={currentAwayLeader?.assists} highlight={activeCategory.highlight === 'ПЕРЕДАЧИ'} />
                    <StatRow label="+ / -" homeValue={currentHomeLeader?.plus_minus} awayValue={currentAwayLeader?.plus_minus} highlight={activeCategory.highlight === '+ / -'} />
                    <StatRow label="ШТРАФ" homeValue={currentHomeLeader?.penalty_minutes} awayValue={currentAwayLeader?.penalty_minutes} highlight={activeCategory.highlight === 'ШТРАФ'} />
                </div>
                <PlayerProfile leader={currentAwayLeader} isHome={false} />
            </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}