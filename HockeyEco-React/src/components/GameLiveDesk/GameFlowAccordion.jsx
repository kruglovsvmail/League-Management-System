// src/components/GameLiveDesk/GameFlowAccordion.jsx
import React, { useState } from 'react';
import { ProtocolSheet } from './ProtocolSheet';
import { getImageUrl } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';

export const GameFlowAccordion = ({ 
  game, 
  events, 
  homeRoster, 
  awayRoster, 
  timerSeconds, 
  onSaveEvent, 
  onDeleteEvent, 
  onToggleLineup, 
  trackPlusMinus, 
  onRequestPlusMinus, 
  isSaving,
  goalieLog,
  isReadOnly
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-white border border-graphite/20 shadow-lg flex flex-col font-sans rounded-md">
      <div 
         className="bg-gray-bg-light border-b border-graphite/20 px-5 py-3 flex justify-between items-center rounded-t-md select-none cursor-pointer hover:bg-graphite/5 transition-colors"
         onClick={() => setIsExpanded(!isExpanded)}
      >
          <div className="font-bold py-1 text-graphite text-base uppercase tracking-wide flex items-center gap-3">
             <Icon name="chevron" className={`w-6 h-6 text-graphite-light transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
             Ход игры (Основное время и ОТ)
          </div>
      </div>
      
      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
         <div className={isExpanded ? 'overflow-visible' : 'overflow-hidden'}>
             <div className="flex flex-col gap-6 p-6 bg-graphite/[0.02] rounded-b-md">
                
                <ProtocolSheet 
                  teamId={game.home_team_id} 
                  teamLetter="А" 
                  teamName={game.home_team_name} 
                  teamLogo={getImageUrl(game.home_team_logo || game.home_logo_url || game.home_logo)}
                  roster={homeRoster} 
                  teamEvents={events.filter(e => e.team_id === game.home_team_id)} 
                  oppEvents={events.filter(e => e.team_id === game.away_team_id)}
                  timerSeconds={timerSeconds} 
                  onSaveEvent={onSaveEvent} 
                  onDeleteEvent={onDeleteEvent}
                  onToggleLineup={onToggleLineup} 
                  isPlusMinusEnabled={trackPlusMinus} 
                  onRequestPlusMinus={onRequestPlusMinus} 
                  isSaving={isSaving}
                  goalieLog={goalieLog} 
                  isReadOnly={isReadOnly}
                />

                <ProtocolSheet 
                  teamId={game.away_team_id} 
                  teamLetter="Б" 
                  teamName={game.away_team_name} 
                  teamLogo={getImageUrl(game.away_team_logo || game.away_logo_url || game.away_logo)}
                  roster={awayRoster} 
                  teamEvents={events.filter(e => e.team_id === game.away_team_id)} 
                  oppEvents={events.filter(e => e.team_id === game.home_team_id)}
                  timerSeconds={timerSeconds} 
                  onSaveEvent={onSaveEvent} 
                  onDeleteEvent={onDeleteEvent}
                  onToggleLineup={onToggleLineup} 
                  isPlusMinusEnabled={trackPlusMinus} 
                  onRequestPlusMinus={onRequestPlusMinus} 
                  isSaving={isSaving}
                  goalieLog={goalieLog} 
                  isReadOnly={isReadOnly}
                />

             </div>
         </div>
      </div>
    </div>
  );
};