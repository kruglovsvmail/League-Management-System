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

  const homeColorHex = '#FF5722';
  const awayColorHex = '#0EA5E9';
  const isHomeEvent = overlay.data?.team_id === game.home_team_id;
  const overlayAccentColor = isHomeEvent ? homeColorHex : awayColorHex;
  const overlayShadowGlow = isHomeEvent 
    ? 'shadow-[0_0_40px_rgba(255,87,34,0.35)]' 
    : 'shadow-[0_0_40px_rgba(14,165,233,0.35)]';

  // ==========================================
  // ЖЕЛЕЗОБЕТОННАЯ ЛОГИКА ПОИСКА НОМЕРА
  // ==========================================
  const currentRoster = isHomeEvent ? game.home_roster : game.away_roster;
  
  const matchedPlayer = currentRoster?.find(p => 
      p.last_name === overlay.data?.primary_last_name && 
      p.first_name === overlay.data?.primary_first_name
  );

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
      className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center"
    >
      <div className={`flex items-stretch h-[130px] bg-[#0a0b0c]/95 backdrop-blur-xl border border-white/10 rounded-2xl min-w-[800px] overflow-hidden ${overlayShadowGlow}`}>
        
        <div className="flex items-center relative overflow-hidden w-[140px] bg-gradient-to-br from-white/5 to-transparent border-r border-white/5">
          <div 
            className="absolute left-0 top-0 bottom-0 w-3 shadow-[2px_0_10px_rgba(0,0,0,0.5)] z-20"
            style={{ backgroundColor: overlayAccentColor }}
          ></div>
          <div className="flex-1 flex items-center justify-center pl-3 relative z-10">
            {overlayTeamLogo && (
              <img 
                src={overlayTeamLogo} 
                className="w-20 h-20 object-contain drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)]" 
                alt="TeamLogo"
              />
            )}
          </div>
        </div>

        <div className="w-[140px] shrink-0 h-full relative border-r border-white/5 bg-gradient-to-t from-[#0a0b0c] to-slate-800">
            <img 
              key={overlay.data.id || overlay.data.primary_player_id}
              src={playerPhoto} 
              alt="Player"
              className="absolute inset-0 w-full h-full object-cover object-top z-10"
              onError={(e) => { 
                e.target.onerror = null; 
                e.target.src = defaultPhoto; 
              }}
            />
            <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-[#0a0b0c]/95 to-transparent z-20"></div>
        </div>

        <div className="flex-1 px-8 py-5 flex flex-col justify-center relative overflow-hidden">
            {/* Вот здесь теперь выводится playerNumber вместо жестко заданного primary_jersey_number */}
            <div className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-[140px] italic text-white/[0.03] tabular-nums leading-none pointer-events-none select-none">
              {playerNumber}
            </div>
            
            <div className="relative z-10 flex flex-col gap-1.5">
                <div className="flex items-center gap-3 mb-0.5">
                  <div 
                    className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-widest text-white shadow-md"
                    style={{ backgroundColor: isGoal ? overlayAccentColor : '#ef4444' }}
                  >
                      {isGoal ? 'ГОЛ' : 'ШТРАФ'}
                  </div>
                  <div className="text-white/40 text-[11px] font-bold uppercase tracking-widest">
                      {isHomeEvent ? homeShortName : awayShortName}
                  </div>
                </div>

                <div className="flex items-end gap-3 drop-shadow-md">
                  <span className="text-[38px] font-black uppercase tracking-tight leading-none text-white">
                    {overlay.data.primary_last_name}
                  </span>
                  <span className="text-[22px] font-bold uppercase tracking-tight text-white/70 mb-0.5">
                    {overlay.data.primary_first_name}
                  </span>
                </div>

                <div className="mt-1">
                  {isGoal && (
                      (overlay.data.assist1_last_name || overlay.data.assist2_last_name) ? (
                        <div className="text-[13px] font-semibold uppercase tracking-widest text-white/90 flex gap-2 items-center">
                            <span className="text-white/40">АСТ:</span>
                            <span className="text-white/80 drop-shadow-sm">
                                {[overlay.data.assist1_last_name, overlay.data.assist2_last_name].filter(Boolean).join(', ')}
                            </span>
                        </div>
                      ) : (
                        <span className="text-[13px] font-semibold uppercase tracking-widest text-white/30 italic">БЕЗ АССИСТЕНТОВ</span>
                      )
                  )}

                  {!isGoal && (
                      <div className="flex items-center gap-3">
                        <span className="font-black text-3xl tabular-nums leading-none drop-shadow-sm text-red-500">
                            {overlay.data.penalty_minutes} <span className="text-[16px] ml-0.5">МИН</span>
                        </span>
                        <span className="text-[14px] font-bold uppercase tracking-widest text-white/80 drop-shadow-sm">
                            — {overlay.data.penalty_violation}
                        </span>
                      </div>
                  )}
                </div>
            </div>
        </div>
      </div>
    </AnimationWrapper>
  );
}