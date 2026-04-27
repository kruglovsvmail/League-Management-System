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

  // Железобетонная логика поиска номера
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
      className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center transform-gpu"
    >
      {/* ГЛАВНЫЙ КОНТЕЙНЕР ПЛАШКИ (Теперь со скосом) */}
      <div className="flex items-stretch h-[150px] bg-zinc-950 skew-x-[-10deg] overflow-hidden rounded-lg shadow-2xl min-w-[1000px] relative">
        
        {/* Пробегающий блик */}
        <div className="absolute top-0 bottom-0 w-[200%] bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-30deg] animate-glare pointer-events-none z-50"></div>

        {/* Цветовой маркер команды */}
        <div className="w-3 shrink-0 z-20" style={{ backgroundColor: overlayAccentColor }}></div>

        {/* Блок Логотипа (компенсация скоса) */}
        <div className="flex items-center justify-center w-[150px] bg-zinc-900 z-10 skew-x-[10deg]">
          {overlayTeamLogo && (
            <img 
              src={overlayTeamLogo} 
              className="w-24 h-24 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]" 
              alt="TeamLogo"
            />
          )}
        </div>

        {/* Блок Фото (компенсация скоса, оverflow-hidden, h-full, relative) */}
        <div className="w-[150px] shrink-0 h-full relative border-r-4 border-zinc-950 bg-[#0a0b0c] z-10 skew-x-[10deg] overflow-hidden">
            <img 
              key={overlay.data.id || overlay.data.primary_player_id}
              src={playerPhoto} 
              alt="Player"
              className="absolute inset-0 w-full h-full object-cover object-top"
              onError={(e) => { 
                e.target.onerror = null; 
                e.target.src = defaultPhoto; 
              }}
            />
        </div>

        {/* Основной инфо-блок (компенсация скоса) */}
        <div className="flex-1 px-10 py-5 flex flex-col justify-center relative overflow-hidden bg-zinc-950 z-10 skew-x-[10deg]">
            
            {/* ГЛУБИНА: Размытый логотип команды на фоне (ЦВЕТНОЙ) */}
            {overlayTeamLogo && (
               <img src={overlayTeamLogo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-10 blur-xl scale-150 z-0 pointer-events-none" />
            )}

            {/* Гигантский номер на фоне */}
            <div className="absolute right-8 top-1/2 -translate-y-1/2 font-black italic text-[180px] text-zinc-800/40 tabular-nums leading-none pointer-events-none select-none z-0">
              #{playerNumber}
            </div>
            
            <div className="relative z-10 flex flex-col">
                <div className="flex items-center gap-3 mb-1.5">
                  <div 
                    className={`px-3 py-0.5 rounded-sm text-[11px] font-black uppercase tracking-widest text-white shadow-md ${!isGoal && 'bg-red-600'}`}
                    style={isGoal ? { backgroundColor: overlayAccentColor } : {}}
                  >
                      {isGoal ? 'ГОЛ' : 'ШТРАФ'}
                  </div>
                  <div className="text-zinc-400 text-xs font-bold uppercase tracking-widest">
                      {isHomeEvent ? homeShortName : awayShortName}
                  </div>
                </div>

                <div className="flex items-end gap-3 drop-shadow-md mt-1">
                  <span className="text-4xl font-black uppercase tracking-tight leading-none text-white">
                    {overlay.data.primary_last_name}
                  </span>
                  <span className="text-xl font-bold uppercase tracking-widest text-zinc-400 mb-0.5">
                    {overlay.data.primary_first_name}
                  </span>
                </div>

                <div className="mt-3 border-t-2 border-zinc-800 pt-3">
                  {isGoal && (
                      (overlay.data.assist1_last_name || overlay.data.assist2_last_name) ? (
                        <div className="text-xs font-bold uppercase tracking-widest text-zinc-300 flex gap-2 items-center">
                            <span className="text-zinc-500">АСТ:</span>
                            <span>
                                {[overlay.data.assist1_last_name, overlay.data.assist2_last_name].filter(Boolean).join(', ')}
                            </span>
                        </div>
                      ) : (
                        <span className="text-xs font-bold uppercase tracking-widest text-zinc-600 italic">БЕЗ АССИСТЕНТОВ</span>
                      )
                  )}

                  {!isGoal && (
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-3xl tabular-nums leading-none drop-shadow-sm text-red-500">
                            {overlay.data.penalty_minutes} <span className="text-lg font-bold tracking-widest ml-1">МИН</span>
                        </span>
                        <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">
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