import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
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

  const PlayerCard = ({ player }) => {
    const isCaptain = player.is_captain === true || player.is_captain === 'true';
    const isAssistant = player.is_assistant === true || player.is_assistant === 'true';
    
    return (
      <div className="flex items-center gap-3 bg-white rounded-full p-2 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
        <div className="bg-verba-orange rounded-full w-10 h-10 flex items-center justify-center shrink-0 shadow-inner">
            <span className="font-verba-lato font-black text-white text-xl leading-none pt-0.5">
              {player.jersey_number || '00'}
            </span>
        </div>
        <div className="flex flex-col justify-center overflow-hidden flex-1 pl-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-gray-800 uppercase tracking-wide truncate">
              {player.last_name} <span className="font-normal text-gray-500">{player.first_name}</span>
            </span>
            {isCaptain && <span className="bg-verba-yellow text-gray-900 px-1.5 py-0.5 rounded-full text-[10px] font-black shrink-0">C</span>}
            {isAssistant && <span className="bg-verba-green-main text-white px-1.5 py-0.5 rounded-full text-[10px] font-black shrink-0">A</span>}
          </div>
        </div>
      </div>
    );
  };

  const PositionSection = ({ title, players }) => {
    if (!players || players.length === 0) return null;
    return (
      <div className="w-full mb-8 last:mb-0">
        <div className="flex items-center gap-4 mb-4">
            <div className="bg-verba-green-main w-2 h-6 rounded-full"></div>
            <span className="text-gray-800 font-black uppercase tracking-widest text-lg">{title}</span>
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
    <AnimationWrapper type="team_roster" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50 bg-black/10 backdrop-blur-sm">
      <div className="flex flex-col w-[1400px] h-[850px] bg-[#F8F9FA] rounded-[40px] shadow-2xl overflow-hidden border border-white/50">

        {/* Шапка в стиле Вербатории */}
        <div className="w-full bg-verba-green-main flex items-center justify-between px-16 py-6 shrink-0 bg-verba-pattern">
          <div className="bg-white/20 backdrop-blur-sm rounded-full px-6 py-2">
            <span className="text-sm font-bold text-white uppercase tracking-widest">
              Официальный состав
            </span>
          </div>
          
          <div className={`flex items-center gap-6 transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
            <span className="text-3xl font-black text-white uppercase tracking-wide drop-shadow-md">{currentTeamName}</span>
            {currentTeamLogo && (
              <div className="bg-white rounded-full p-2 w-16 h-16 flex items-center justify-center shadow-lg">
                <img src={currentTeamLogo} alt="Team" className="w-full h-full object-contain" />
              </div>
            )}
          </div>
        </div>

        {/* Списки игроков */}
        <div className="w-full flex-1 px-16 pt-10 pb-8 overflow-y-auto custom-scrollbar relative z-10">
            <div className={`transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'} h-full flex flex-col`}>
                <PositionSection title="Вратари" players={goalies} />
                <PositionSection title="Защитники" players={defense} />
                <PositionSection title="Нападающие" players={forwards} />
                
                {currentRoster.length === 0 && (
                    <div className="flex items-center justify-center flex-1">
                        <span className="font-bold text-gray-400 text-2xl uppercase tracking-widest">Данные отсутствуют</span>
                    </div>
                )}
            </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}