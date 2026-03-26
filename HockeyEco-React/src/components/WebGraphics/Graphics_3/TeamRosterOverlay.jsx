import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function TeamRosterOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'team_roster';
  
  const [activeTeam, setActiveTeam] = useState('home');
  const [isFading, setIsFading] = useState(false);

  const switchDuration = overlay.data?.switchDuration || 8;

  useEffect(() => {
    if (!isVisible) {
      setActiveTeam('home');
      setIsFading(false);
      return;
    }

    const interval = setInterval(() => {
      setIsFading(true);
      
      setTimeout(() => {
        setActiveTeam(prev => prev === 'home' ? 'away' : 'home');
        setIsFading(false);
      }, 600); // Немного увеличил для более плавного кибер-перехода
      
    }, switchDuration * 1000);

    return () => clearInterval(interval);
  }, [isVisible, switchDuration]);

  if (!game) return null;

  const currentTeamName = activeTeam === 'home' ? game.home_team_name : game.away_team_name;
  const currentTeamLogo = activeTeam === 'home' ? getImageUrl(game.home_team_logo) : getImageUrl(game.away_team_logo);
  const currentRoster = activeTeam === 'home' ? (game.home_roster || []) : (game.away_roster || []);

  const goalies = currentRoster.filter(p => p.position_in_line === 'G');
  const defense = currentRoster.filter(p => p.position_in_line === 'LD' || p.position_in_line === 'RD');
  const forwards = currentRoster.filter(p => p.position_in_line === 'LW' || p.position_in_line === 'C' || p.position_in_line === 'RW');

  const defaultAvatar = getImageUrl('default/user_default.webp');

  const PlayerCard = ({ player }) => {
    const photo = getSafeUrl(player.avatar_url) || defaultAvatar;
    const isCaptain = player.is_captain === true || player.is_captain === 'true';
    const isAssistant = player.is_assistant === true || player.is_assistant === 'true';
    
    return (
      <div className="flex items-center gap-4 bg-[#0A1D37]/60 border border-[#1A3A6D] p-2 pr-4 relative overflow-hidden group hover:bg-[#112547] transition-colors shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
        {/* Декоративный сканлайн */}
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,229,255,0.03)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
        {/* Неоновый уголок при наведении (имитация активности) */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#00E5FF] opacity-0 group-hover:opacity-100 transition-opacity"></div>
        
        <div className="w-12 h-12 bg-[#020611] border border-[#1A3A6D] shrink-0 overflow-hidden relative z-10" style={{ transform: 'skewX(-5deg)' }}>
            <img 
              src={photo} 
              alt="Player" 
              className="w-full h-full object-cover scale-110 saturate-50 contrast-125" 
              style={{ transform: 'skewX(5deg)' }}
              onError={(e) => { e.target.src = defaultAvatar; }}
            />
        </div>

        <span className="text-2xl font-black italic text-[#00E5FF] w-8 text-center shrink-0 drop-shadow-[0_0_8px_rgba(0,229,255,0.6)] font-mono z-10">
          {player.jersey_number || '00'}
        </span>
        
        <div className="flex flex-col justify-center overflow-hidden flex-1 z-10">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-black text-white uppercase tracking-wider truncate font-sans">
              {player.last_name} <span className="font-bold text-[#A0BCE0]">{player.first_name}</span>
            </span>
            {isCaptain && <span className="text-[#FF3366] font-black text-[13px] drop-shadow-[0_0_5px_rgba(255,51,102,0.8)] shrink-0">(К)</span>}
            {isAssistant && <span className="text-[#00E5FF] font-black text-[13px] drop-shadow-[0_0_5px_rgba(0,229,255,0.8)] shrink-0">(А)</span>}
          </div>
        </div>
      </div>
    );
  };

  const PositionSection = ({ title, players }) => {
    if (!players || players.length === 0) return null;
    return (
      <div className="w-full mb-8 last:mb-0 relative z-10">
        <div className="flex items-center gap-4 mb-4">
            <div className="w-2 h-2 bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]"></div>
            <span className="text-[#A0BCE0] font-black uppercase tracking-[0.3em] text-sm shrink-0">{title}</span>
            <div className="h-px bg-[linear-gradient(90deg,#1A3A6D,transparent)] flex-1"></div>
        </div>
        <div className="grid grid-cols-3 gap-x-6 gap-y-3 w-full">
          {players.map(p => (
            <PlayerCard key={`${p.jersey_number}_${p.last_name}`} player={p} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <AnimationWrapper type="complex_construct" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-[#020611]/85 backdrop-blur-[20px] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, transparent 0%, #000 100%)' }}></div>

      <div className="relative flex flex-col w-[1500px] h-[1000px] bg-[#051125]/90 border border-[#1A3A6D] shadow-[0_0_100px_rgba(0,229,255,0.05),_inset_0_0_50px_rgba(0,0,0,0.8)] overflow-hidden pb-10">

        {/* Неоновая линия сверху */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent shadow-[0_0_15px_#00E5FF]"></div>

        <div className="w-full bg-[#0A1D37]/80 border-b border-[#1A3A6D] flex flex-col items-center justify-center py-8 relative shrink-0 h-[160px] z-20">
          <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,229,255,0.02)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
          
          <span className="text-xs font-bold text-[#A0BCE0] uppercase tracking-[0.5em] mb-4">АКТИВНЫЙ СОСТАВ</span>
          
          <div className={`flex items-center gap-8 transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] ${isFading ? 'opacity-0 scale-95 blur-md' : 'opacity-100 scale-100 blur-0'}`}>
            <div className="w-20 h-20 bg-[#020611] border border-[#00E5FF] shadow-[0_0_15px_rgba(0,229,255,0.2)] flex items-center justify-center rotate-45">
               {currentTeamLogo && <img src={currentTeamLogo} alt="Team" className="h-14 object-contain -rotate-45 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]" />}
            </div>
            <span className="text-5xl font-black text-white uppercase tracking-widest font-sans drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">{currentTeamName}</span>
          </div>
        </div>

        <div className="w-full flex-1 px-16 pt-10 pb-4 overflow-y-auto custom-scrollbar relative z-10">
            <div className={`transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] h-full flex flex-col ${isFading ? 'opacity-0 translate-y-10 blur-sm' : 'opacity-100 translate-y-0 blur-0'}`}>
                <PositionSection title="ВРАТАРИ" players={goalies} />
                <PositionSection title="ЗАЩИТНИКИ" players={defense} />
                <PositionSection title="НАПАДАЮЩИЕ" players={forwards} />
                
                {currentRoster.length === 0 && (
                    <div className="flex items-center justify-center flex-1 opacity-20">
                        <span className="font-black font-mono text-3xl uppercase text-[#00E5FF] tracking-[0.3em]">ДАННЫЕ ОТСУТСТВУЮТ</span>
                    </div>
                )}
            </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}