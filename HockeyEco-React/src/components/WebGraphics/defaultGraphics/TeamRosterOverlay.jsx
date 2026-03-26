import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function TeamRosterOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'team_roster';
  
  const [activeTeam, setActiveTeam] = useState('home');
  const [isFading, setIsFading] = useState(false);

  // Извлекаем переданное время (в секундах) из панели управления
  const switchDuration = overlay.data?.switchDuration || 8;

  useEffect(() => {
    if (!isVisible) {
      setActiveTeam('home');
      setIsFading(false);
      return;
    }

    const interval = setInterval(() => {
      setIsFading(true);
      
      // Через 500мс (когда кончится CSS fade-анимация) переключаем команду и возвращаем видимость
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
    const photo = getSafeUrl(player.avatar_url) || defaultAvatar;
    const isCaptain = player.is_captain === true || player.is_captain === 'true';
    const isAssistant = player.is_assistant === true || player.is_assistant === 'true';
    
    return (
      <div className="flex items-center gap-3 bg-white/5 rounded-2xl p-2 pr-4 border border-white/5 shadow-sm">
        <img 
          src={photo} 
          alt="Player" 
          className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0 bg-[#0a0b0c]" 
          onError={(e) => { e.target.src = defaultAvatar; }}
        />
        <span className="text-2xl font-black italic text-blue-400 w-8 text-center shrink-0 drop-shadow-sm">
          {player.jersey_number || '00'}
        </span>
        <div className="flex flex-col justify-center overflow-hidden flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-white uppercase tracking-wide truncate">
              {player.last_name} <span className="font-normal text-white/60">{player.first_name}</span>
            </span>
            {isCaptain && <span className="text-blue-400 font-black text-[13px] drop-shadow-md shrink-0">(К)</span>}
            {isAssistant && <span className="text-blue-400 font-black text-[13px] drop-shadow-md shrink-0">(А)</span>}
          </div>
        </div>
      </div>
    );
  };

  const PositionSection = ({ title, players }) => {
    if (!players || players.length === 0) return null;
    return (
      <div className="w-full mb-6 last:mb-0">
        <div className="flex items-center gap-4 mb-4">
            <span className="text-white/40 font-black uppercase tracking-[0.2em] text-sm shrink-0">{title}</span>
            <div className="h-px bg-white/10 flex-1"></div>
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
    <AnimationWrapper type="team_roster" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/0 backdrop-blur-md pointer-events-none"></div>

      <div className="relative flex flex-col w-[1400px] h-[1000px] bg-[#000000ff]/[98%] rounded-[3rem] border border-white/10 shadow-[0_0_120px_rgba(0,0,0,0.8)] overflow-hidden pb-6">

        <div className="w-full bg-white/5 border-b border-white/10 flex flex-col items-center justify-center py-6 relative shrink-0 h-[140px]">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>
          <span className="text-sm font-bold text-white/50 uppercase tracking-[0.4em] mb-3">Состав на матч</span>
          
          <div className={`flex items-center gap-6 transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
            {currentTeamLogo && <img src={currentTeamLogo} alt="Team" className="h-16 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]" />}
            <span className="text-4xl font-black text-white uppercase tracking-widest drop-shadow-md">{currentTeamName}</span>
          </div>
        </div>

        <div className="w-full flex-1 px-16 pt-8 pb-4 overflow-y-auto custom-scrollbar">
            <div className={`transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'} h-full flex flex-col`}>
                <PositionSection title="Вратари" players={goalies} />
                <PositionSection title="Защитники" players={defense} />
                <PositionSection title="Нападающие" players={forwards} />
                
                {currentRoster.length === 0 && (
                    <div className="flex items-center justify-center flex-1 opacity-20">
                        <span className="font-black italic text-2xl uppercase">Состав не заполнен</span>
                    </div>
                )}
            </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}