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
      }, 500);
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
    const isCaptain = player.is_captain === true || player.is_captain === 'true';
    const isAssistant = player.is_assistant === true || player.is_assistant === 'true';
    
    return (
      <div className="flex items-center gap-4 bg-white border border-mts-grey-light/30 p-3">
        <span className="text-xl font-black text-mts-red w-8 text-center shrink-0">
          {player.jersey_number || '00'}
        </span>
        <div className="flex flex-col justify-center overflow-hidden flex-1 border-l border-mts-grey-light/30 pl-4">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-mts-black uppercase tracking-wide truncate">
              {player.last_name} <span className="font-normal text-mts-grey-dark">{player.first_name}</span>
            </span>
            {isCaptain && <span className="text-mts-red font-black text-[12px] shrink-0">(К)</span>}
            {isAssistant && <span className="text-mts-red font-black text-[12px] shrink-0">(А)</span>}
          </div>
        </div>
      </div>
    );
  };

  const PositionSection = ({ title, players }) => {
    if (!players || players.length === 0) return null;
    return (
      <div className="w-full mb-10 last:mb-0">
        <div className="flex items-center gap-4 mb-4 bg-mts-grey-light/10 p-3 border-l-4 border-mts-red">
            <span className="text-mts-black font-bold uppercase tracking-widest text-sm">{title}</span>
        </div>
        <div className="grid grid-cols-3 gap-4 w-full">
          {players.map(p => (
            <PlayerCard key={`${p.jersey_number}_${p.last_name}`} player={p} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <AnimationWrapper type="team_roster" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50 bg-white">
      <div className="flex flex-col w-full h-full">

        <div className="w-full bg-mts-red flex items-center justify-between px-20 py-8 shrink-0">
          <span className="text-sm font-bold text-white/80 uppercase tracking-[0.4em]">Официальный состав</span>
          
          <div className={`flex items-center gap-6 transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
            <span className="text-3xl font-black text-white uppercase tracking-widest">{currentTeamName}</span>
            {currentTeamLogo && <img src={currentTeamLogo} alt="Team" className="h-12 object-contain filter brightness-0 invert" />}
          </div>
        </div>

        <div className="w-full flex-1 px-20 pt-12 pb-8 overflow-y-auto custom-scrollbar">
            <div className={`transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'} h-full flex flex-col`}>
                <PositionSection title="Вратари" players={goalies} />
                <PositionSection title="Защитники" players={defense} />
                <PositionSection title="Нападающие" players={forwards} />
                
                {currentRoster.length === 0 && (
                    <div className="flex items-center justify-center flex-1">
                        <span className="font-bold text-mts-grey-dark text-2xl uppercase tracking-widest">Данные отсутствуют</span>
                    </div>
                )}
            </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}