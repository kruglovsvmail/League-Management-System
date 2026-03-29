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

  const themeClass = isHomeEvent ? 'bg-verba-green-main text-white' : 'bg-gray-100 text-gray-800';
  const tagClass = isGoal ? 'bg-verba-yellow text-gray-900' : 'bg-verba-orange text-white';

  // ==========================================
  // ЖЕЛЕЗОБЕТОННАЯ ЛОГИКА ПОИСКА НОМЕРА
  // ==========================================
  // 1. Берем актуальный состав нужной команды
  const currentRoster = isHomeEvent ? game.home_roster : game.away_roster;
  
  // 2. Ищем этого игрока в составе по имени и фамилии
  const matchedPlayer = currentRoster?.find(p => 
      p.last_name === overlay.data?.primary_last_name && 
      p.first_name === overlay.data?.primary_first_name
  );

  // 3. Берем номер из заявки на матч. Если не нашли - ищем в данных от пульта. Если и там нет - ставим '00'
  const playerNumber = 
      matchedPlayer?.jersey_number || 
      overlay.data?.player_number || 
      overlay.data?.jersey_number || 
      overlay.data?.primary_jersey_number || 
      '00';

  return (
    <AnimationWrapper
      type="event"
      isVisible={isVisible}
      className="absolute bottom-16 left-16 z-50 flex flex-col items-start drop-shadow-xl"
    >
      <div className={`flex items-center rounded-full p-2 pr-10 shadow-lg ${themeClass} min-w-[600px] border border-white/20`}>
        
        {/* Круглое фото игрока */}
        <div className="w-[100px] h-[100px] rounded-full bg-white shrink-0 relative overflow-hidden border-4 border-white shadow-inner">
            <img 
              key={overlay.data.id || overlay.data.primary_player_id}
              src={playerPhoto} 
              alt="Player"
              className="w-full h-full object-cover object-top"
              onError={(e) => { 
                e.target.onerror = null; 
                e.target.src = defaultPhoto; 
              }}
            />
        </div>

        {/* Логотип команды (маленький значок) */}
        {overlayTeamLogo && (
          <div className="w-12 h-12 bg-white rounded-full p-1.5 flex items-center justify-center shrink-0 -ml-6 z-10 shadow-md">
            <img src={overlayTeamLogo} className="w-full h-full object-contain" alt="TeamLogo" />
          </div>
        )}

        {/* Текстовая информация */}
        <div className="flex flex-col justify-center pl-6 flex-1 py-2">
            <div className="flex items-center gap-3 mb-1">
                <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-sm ${tagClass}`}>
                  {isGoal ? 'ГОЛ' : 'УДАЛЕНИЕ'}
                </span>
                <span className="text-xs font-bold uppercase tracking-widest opacity-70">
                  {isHomeEvent ? homeShortName : awayShortName}
                </span>
            </div>

            <div className="flex items-baseline gap-2 mb-1">
                <span className="font-verba-lato text-3xl font-black uppercase tracking-tight">
                  {overlay.data.primary_last_name}
                </span>
                <span className="text-lg font-bold uppercase opacity-80">
                  {overlay.data.primary_first_name}
                </span>
            </div>

            <div className="text-sm font-bold uppercase tracking-widest opacity-90 mt-0.5">
                {isGoal && (
                    (overlay.data.assist1_last_name || overlay.data.assist2_last_name) ? (
                      <span>АСТ: {[overlay.data.assist1_last_name, overlay.data.assist2_last_name].filter(Boolean).join(', ')}</span>
                    ) : (
                      <span className="opacity-60">БЕЗ АССИСТЕНТОВ</span>
                    )
                )}

                {!isGoal && (
                    <div className="flex items-center gap-2">
                      <span className="font-verba-lato font-black text-verba-orange text-lg">{overlay.data.penalty_minutes} МИН</span>
                      <span className="opacity-50">—</span>
                      <span>{overlay.data.penalty_violation}</span>
                    </div>
                )}
            </div>
        </div>

        {/* Актуальный номер игрока в матче */}
        <div className="flex items-center justify-center pl-6 border-l border-white/20">
            <span className="font-verba-lato text-5xl font-black opacity-30 italic">
              {playerNumber}
            </span>
        </div>

      </div>
    </AnimationWrapper>
  );
}