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
  // Неоновые кибер-цвета
  const overlayAccentColor = isGoal ? '#00E5FF' : '#FF3366'; 

  return (
    <AnimationWrapper
      type="panel_reveal"
      isVisible={isVisible}
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center"
    >
      <div className="flex items-stretch h-[150px] bg-[#051125]/90 backdrop-blur-[20px] border border-[#1A3A6D]/80 shadow-[0_30px_60px_rgba(0,0,0,0.9)] min-w-[900px] overflow-visible relative">
        
        {/* Неоновый акцент сверху (линия) */}
        <div 
          className="absolute top-0 left-0 right-0 h-[2px] shadow-[0_0_15px_currentColor]"
          style={{ backgroundColor: overlayAccentColor, color: overlayAccentColor }}
        ></div>

        {/* Блок с логотипом команды */}
        <div className="flex items-center relative w-[180px] bg-[#0A1D37] border-r border-[#1A3A6D] overflow-hidden">
          {/* Декоративный сканлайн на фоне */}
          <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(255,255,255,0.02)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
          
          <div 
            className="absolute left-0 top-0 bottom-0 w-2 z-20 shadow-[0_0_20px_currentColor]"
            style={{ backgroundColor: overlayAccentColor, color: overlayAccentColor }}
          ></div>
          <div className="flex-1 flex items-center justify-center pl-4 relative z-10">
            {overlayTeamLogo && (
              <img 
                src={overlayTeamLogo} 
                className="w-24 h-24 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]" 
                alt="TeamLogo"
              />
            )}
          </div>
        </div>

        {/* Блок с фото игрока */}
        <div className="w-[160px] shrink-0 h-full relative border-r border-[#1A3A6D] bg-[#020611] overflow-hidden">
            <img 
              key={overlay.data.id || overlay.data.primary_player_id}
              src={playerPhoto} 
              alt="Player"
              className="absolute inset-0 w-full h-[120%] object-cover object-top z-10 scale-110"
              onError={(e) => { 
                e.target.onerror = null; 
                e.target.src = defaultPhoto; 
              }}
            />
            {/* Градиент снизу для плавного перехода в темный */}
            <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-[#051125] to-transparent z-20"></div>
        </div>

        {/* Информационный блок */}
        <div className="flex-1 px-10 py-6 flex flex-col justify-center relative bg-gradient-to-r from-[#0A1D37] to-[#051125] overflow-hidden">
            
            {/* Огромный полупрозрачный номер на фоне */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-[180px] italic text-[#1A3A6D]/20 tabular-nums leading-none pointer-events-none select-none z-0">
              {overlay.data.primary_jersey_number || '00'}
            </div>
            
            <div className="relative z-10 flex flex-col gap-2">
                
                {/* Бейджи */}
                <div className="flex items-center gap-4 mb-1">
                  <div 
                    className="px-4 py-1 text-[13px] font-black uppercase tracking-[0.2em] text-[#051125] shadow-[0_0_15px_currentColor]"
                    style={{ backgroundColor: overlayAccentColor, color: overlayAccentColor }}
                  >
                      {isGoal ? 'ГОЛ' : 'ШТРАФ'}
                  </div>
                  <div className="text-white/80 text-[14px] font-bold uppercase tracking-widest bg-[#112547] px-4 py-1 border border-[#1A3A6D]">
                      {isHomeEvent ? homeShortName : awayShortName}
                  </div>
                </div>

                {/* Имя игрока */}
                <div className="flex items-end gap-4 text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] mt-1">
                  <span className="text-[42px] font-black uppercase tracking-wider leading-none font-sans">
                    {overlay.data.primary_last_name}
                  </span>
                  <span className="text-[24px] font-bold uppercase tracking-widest text-[#A0BCE0] mb-0.5">
                    {overlay.data.primary_first_name}
                  </span>
                </div>

                {/* Детали (Ассистенты или Причина штрафа) */}
                <div className="mt-2">
                  {isGoal && (
                      (overlay.data.assist1_last_name || overlay.data.assist2_last_name) ? (
                        <div className="text-[15px] font-black uppercase tracking-[0.2em] text-white flex gap-3 items-center">
                            <span style={{ color: overlayAccentColor }}>АСТ:</span>
                            <span className="text-[#A0BCE0]">
                                {[overlay.data.assist1_last_name, overlay.data.assist2_last_name].filter(Boolean).join(', ')}
                            </span>
                        </div>
                      ) : (
                        <span className="text-[14px] font-bold uppercase tracking-[0.2em] text-white/30">БЕЗ АССИСТЕНТОВ</span>
                      )
                  )}

                  {!isGoal && (
                      <div className="flex items-center gap-4">
                        <span 
                          className="font-mono text-4xl font-black tabular-nums leading-none drop-shadow-[0_0_10px_currentColor]" 
                          style={{ color: overlayAccentColor }}
                        >
                            {overlay.data.penalty_minutes} <span className="text-[18px] ml-1 font-sans text-white">МИН</span>
                        </span>
                        <div className="h-6 w-px bg-[#1A3A6D]"></div>
                        <span className="text-[16px] font-bold uppercase tracking-widest text-[#A0BCE0]">
                            {overlay.data.penalty_violation}
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