import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';

const CATEGORIES = [
  { key: 'points', label: 'ЛУЧШИЕ БОМБАРДИРЫ', highlight: 'ОЧКИ' },
  { key: 'goals', label: 'ЛУЧШИЕ СНАЙПЕРЫ', highlight: 'ГОЛЫ' },
  { key: 'assists', label: 'ЛУЧШИЕ АССИСТЕНТЫ', highlight: 'ПЕРЕДАЧИ' },
  { key: 'plus_minus', label: 'ЛУЧШАЯ ПОЛЕЗНОСТЬ', highlight: '+ / -' }
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
      }, 600); // Чуть увеличил время затухания для кибер-глитч эффекта
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
    <div className={`flex items-center w-full py-4 px-10 transition-colors duration-500 relative ${highlight ? 'bg-[#00E5FF]/10 border-y border-[#00E5FF]/30 shadow-[inset_0_0_20px_rgba(0,229,255,0.1)]' : 'even:bg-[#0A1D37]/30 border-y border-transparent'}`}>
       {highlight && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#00E5FF] shadow-[0_0_10px_#00E5FF]"></div>}
       {highlight && <div className="absolute right-0 top-0 bottom-0 w-1 bg-[#00E5FF] shadow-[0_0_10px_#00E5FF]"></div>}
       
       <div className={`w-1/3 text-right text-4xl font-black tabular-nums transition-all duration-500 font-mono ${highlight ? 'text-[#00E5FF] drop-shadow-[0_0_10px_#00E5FF] scale-110 origin-right' : 'text-white'}`}>
         {homeValue ?? '-'}
       </div>
       <div className={`w-1/3 text-center text-sm font-bold uppercase tracking-[0.4em] font-sans transition-colors duration-500 ${highlight ? 'text-white drop-shadow-md' : 'text-[#A0BCE0]/60'}`}>
         {label}
       </div>
       <div className={`w-1/3 text-left text-4xl font-black tabular-nums transition-all duration-500 font-mono ${highlight ? 'text-[#00E5FF] drop-shadow-[0_0_10px_#00E5FF] scale-110 origin-left' : 'text-white'}`}>
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
        <div className={`flex flex-col items-center w-[450px] transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] ${isFading ? (isHome ? 'opacity-0 -translate-x-20 blur-md' : 'opacity-0 translate-x-20 blur-md') : 'opacity-100 translate-x-0 blur-0'}`}>
            <div className="relative mb-8">
                {/* Кибер-рамка вокруг фото */}
                <div className="w-60 h-60 bg-[#020611] border-2 border-[#1A3A6D] relative z-10 overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.8)]" style={{ transform: 'skewX(-5deg)' }}>
                    <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,229,255,0.05)_50%)] bg-[length:100%_4px] pointer-events-none z-20"></div>
                    <img 
                      src={photo} 
                      alt="Player" 
                      className="w-full h-full object-cover object-top opacity-90 saturate-50 contrast-125" 
                      style={{ transform: 'skewX(5deg) scale(1.1)' }}
                      onError={(e) => { e.target.src = defaultAvatar; }} 
                    />
                </div>
                {teamLogo && (
                    <div className={`absolute -bottom-6 ${isHome ? '-right-6' : '-left-6'} w-20 h-20 bg-[#051125] border border-[#00E5FF] shadow-[0_0_20px_rgba(0,229,255,0.3)] flex items-center justify-center p-3 z-20`} style={{ transform: 'rotate(45deg)' }}>
                        <img src={teamLogo} alt="Team" className="w-full h-full object-contain" style={{ transform: 'rotate(-45deg)' }} />
                    </div>
                )}
            </div>

            <div className="flex items-center justify-center gap-6 w-full px-4 bg-[#0A1D37]/50 py-3 border-y border-[#1A3A6D]">
                <div className="flex flex-col items-end text-right flex-1">
                    <span className="text-sm font-bold text-[#00E5FF] uppercase tracking-[0.2em] max-w-[200px] truncate leading-none mb-1">
                        {firstName}
                    </span>
                    <span className="text-3xl font-black text-white uppercase tracking-widest max-w-[200px] truncate leading-none drop-shadow-md">
                        {lastName}
                    </span>
                </div>
                <div className="w-px h-12 bg-[#1A3A6D] shrink-0"></div>
                <span className="text-6xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-[#00E5FF] to-[#0A1D37] shrink-0 w-[80px] text-center font-mono">
                    {number}
                </span>
            </div>
        </div>
    );
  };

  return (
    <AnimationWrapper type="complex_construct" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-[#020611]/80 backdrop-blur-[15px] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, transparent 0%, #000 100%)' }}></div>

      <div className="relative flex flex-col items-center w-[1400px] bg-[#051125]/90 border border-[#1A3A6D] shadow-[0_0_100px_rgba(0,229,255,0.05)] overflow-hidden pb-12">

        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent shadow-[0_0_15px_#00E5FF]"></div>

        <div className="w-full bg-[#0A1D37]/80 flex items-center justify-center py-6 relative mb-12 border-b border-[#1A3A6D]">
          {leagueLogo && <img src={leagueLogo} alt="League" className="absolute left-12 h-12 object-contain drop-shadow-[0_0_10px_rgba(0,229,255,0.3)]" />}
          
          <div className="flex items-center gap-4">
             <div className="w-2 h-2 bg-[#00E5FF] shadow-[0_0_10px_#00E5FF]"></div>
             <span className={`text-2xl font-black text-white uppercase tracking-[0.4em] drop-shadow-sm transition-all duration-500 ease-in-out font-sans ${isFading ? 'opacity-0 scale-95 blur-sm text-[#00E5FF]' : 'opacity-100 scale-100 blur-0 text-white'}`}>
               {activeCategory.label}
             </span>
             <div className="w-2 h-2 bg-[#00E5FF] shadow-[0_0_10px_#00E5FF]"></div>
          </div>
        </div>

        <div className="w-full px-10">
            <div className="flex justify-between items-end w-full px-10 mb-12 overflow-hidden relative z-20">
                <PlayerProfile leader={currentHomeLeader} teamLogo={homeLogo} isHome={true} />
                <PlayerProfile leader={currentAwayLeader} teamLogo={awayLogo} isHome={false} />
            </div>

            {/* Центральная неоновая консоль со статистикой */}
            <div className={`w-full px-16 transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] relative z-10 ${isFading ? 'opacity-0 translate-y-16 blur-sm scale-95' : 'opacity-100 translate-y-0 blur-0 scale-100'}`}>
                <div className="flex flex-col w-full bg-[#020611] border border-[#1A3A6D] py-4 shadow-[inset_0_0_50px_rgba(0,0,0,0.8)] relative">
                    {/* Декоративные углы */}
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00E5FF]/50"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#00E5FF]/50"></div>

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
                    <StatRow label="ШТРАФ (МИН)" homeValue={currentHomeLeader?.penalty_minutes} awayValue={currentAwayLeader?.penalty_minutes} highlight={activeCategory.highlight === 'ШТРАФ'} />
                </div>
            </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}