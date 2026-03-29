import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function EventOverlay({ game, overlay }) {
  if (!overlay.data) return null;

  const isVisible = overlay.visible && (overlay.type === 'goal' || overlay.type === 'penalty');

  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const playerPhoto = getSafeUrl(overlay.data?.primary_photo_url) || getImageUrl('default/user_default.webp');
  const defaultPhoto = getImageUrl('default/user_default.webp');
  const overlayTeamLogo = getSafeUrl(overlay.data?.team_logo);
  
  const isGoal = overlay.type === 'goal';
  const isHomeEvent = overlay.data?.team_id === game.home_team_id;

  const accentColorClass = isHomeEvent ? 'bg-mts-red' : 'bg-mts-black';

  return (
    <AnimationWrapper
      type="event"
      isVisible={isVisible}
      className="absolute bottom-16 left-16 z-50 flex flex-col items-start"
    >
      <div className="flex bg-white shadow-xl border border-mts-grey-light/30 h-[140px] overflow-hidden">
        
        {/* Квадрат с логотипом команды */}
        <div className={`w-[140px] flex items-center justify-center ${accentColorClass} p-5 shrink-0`}>
          {overlayTeamLogo && (
            <img 
              src={overlayTeamLogo} 
              className="w-full h-full object-contain" 
              alt="TeamLogo"
            />
          )}
        </div>

        {/* Строгий квадрат с цветным фото */}
        <div className="w-[140px] h-[140px] shrink-0 bg-white relative border-r border-mts-grey-light/30">
            <img 
              key={overlay.data.id || overlay.data.primary_player_id}
              src={playerPhoto} 
              alt="Player"
              className="w-full h-full object-cover"
              onError={(e) => { 
                e.target.onerror = null; 
                e.target.src = defaultPhoto; 
              }}
            />
        </div>

        {/* Текстовый блок */}
        <div className="flex flex-col justify-center px-10 min-w-[500px] bg-white">
            <div className="flex items-center gap-4 mb-2">
                <span className={`px-3 py-1 text-[10px] font-bold tracking-widest text-white uppercase ${isGoal ? 'bg-mts-red' : 'bg-mts-black'}`}>
                  {isGoal ? 'ГОЛ' : 'УДАЛЕНИЕ'}
                </span>
                <span className="text-xs font-bold text-mts-grey-dark uppercase tracking-widest">
                  {isHomeEvent ? homeShortName : awayShortName}
                </span>
            </div>

            <div className="flex items-end gap-3 mb-1">
                <span className="text-4xl font-black text-mts-black uppercase leading-none tracking-tight">
                  {overlay.data.primary_last_name}
                </span>
                <span className="text-xl font-bold text-mts-grey-dark uppercase pb-0.5 tracking-tight">
                  {overlay.data.primary_first_name}
                </span>
            </div>

            <div className="mt-1 text-sm font-bold text-mts-black uppercase tracking-widest">
                {isGoal && (
                    (overlay.data.assist1_last_name || overlay.data.assist2_last_name) ? (
                      <span className="text-mts-grey-dark">
                          АСТ: <span className="text-mts-black">{[overlay.data.assist1_last_name, overlay.data.assist2_last_name].filter(Boolean).join(', ')}</span>
                      </span>
                    ) : (
                      <span className="text-mts-grey-dark">БЕЗ АССИСТЕНТОВ</span>
                    )
                )}

                {!isGoal && (
                    <div className="flex items-center gap-2">
                      <span className="text-mts-red font-black text-lg leading-none">
                          {overlay.data.penalty_minutes} МИН
                      </span>
                      <span className="text-mts-grey-dark">—</span>
                      <span>{overlay.data.penalty_violation}</span>
                    </div>
                )}
            </div>
        </div>

        {/* Номер игрока */}
        <div className="flex items-center justify-center px-10 border-l border-mts-grey-light/30 bg-mts-grey-light/10">
            <span className="text-7xl font-black text-mts-grey-dark leading-none">
              {overlay.data.primary_jersey_number || '00'}
            </span>
        </div>

      </div>
    </AnimationWrapper>
  );
}