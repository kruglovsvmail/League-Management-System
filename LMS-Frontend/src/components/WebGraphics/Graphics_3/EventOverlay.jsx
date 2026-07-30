import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';
import { DiagonalStripes, Snowflake } from './IceDecor';
import { TFH, cut, dropShadow } from './theme';

const PENALTY_RED = '#C7343B';

export default function EventOverlay({ game, overlay }) {
  if (!overlay.data) return null;

  const isVisible = overlay.visible && (overlay.type === 'goal' || overlay.type === 'penalty');

  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const playerPhoto = getSafeUrl(overlay.data?.primary_photo_url) || getImageUrl('default/user_default.webp');
  const defaultPhoto = getImageUrl('default/user_default.webp');
  const overlayTeamLogo = getSafeUrl(overlay.data?.team_logo);
  const isGoal = overlay.type === 'goal';

  const homeColorHex = game.home_color_1 || TFH.blue;
  const awayColorHex = game.away_color_1 || TFH.ice;
  const isHomeEvent = overlay.data?.team_id === game.home_team_id;
  const accent = isHomeEvent ? homeColorHex : awayColorHex;
  const badgeColor = isGoal ? accent : PENALTY_RED;

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
      <div style={{ filter: dropShadow('lg') }}>
        <div
          className="flex items-stretch h-[168px] min-w-[1080px] relative overflow-hidden"
          style={{ clipPath: cut(44, 0, 44, 0), backgroundColor: TFH.navy }}
        >
          <div className="tfh-sheen tfh-sheen-fast z-40" style={{ left: '-70%' }} />

          {/* Цветовая полоса команды */}
          <div className="w-[14px] shrink-0 z-20" style={{ backgroundColor: accent }} />

          {/* Логотип команды */}
          <div className="flex items-center justify-center w-[172px] shrink-0 relative z-10" style={{ backgroundColor: TFH.navyMid }}>
            <DiagonalStripes color="rgba(255,255,255,0.05)" step={22} drift />
            {overlayTeamLogo && (
              <img
                src={overlayTeamLogo}
                className="relative z-10 w-[104px] h-[104px] object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
                alt="TeamLogo"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
          </div>

          {/* Фото игрока: правая кромка срезана под 45° — стык-«скол» с инфо-блоком */}
          <div
            className="w-[172px] shrink-0 h-full relative z-10 overflow-hidden"
            style={{ backgroundColor: TFH.navyDeep, clipPath: 'polygon(0 0, 100% 0, calc(100% - 34px) 100%, 0 100%)' }}
          >
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
            {/* Затемнение к срезу, чтобы фото не «резалось» жёстко по лицу */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(100deg, transparent 55%, rgba(6,21,48,0.75) 100%)' }} />
          </div>

          {/* Инфо-блок */}
          <div className="flex-1 pl-6 pr-12 py-5 flex flex-col justify-center relative overflow-hidden z-10">
            {/* Глубина: размытый логотип команды на фоне */}
            {overlayTeamLogo && (
               <img src={overlayTeamLogo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.09] blur-2xl scale-150 z-0 pointer-events-none" />
            )}
            <DiagonalStripes color="rgba(255,255,255,0.035)" step={30} />

            {/* Гигантский номер на фоне */}
            <div
              className="absolute right-6 top-1/2 -translate-y-1/2 font-black italic text-[190px] tabular-nums leading-none pointer-events-none select-none z-0"
              style={{ color: 'rgba(255,255,255,0.055)' }}
            >
              {playerNumber}
            </div>

            {/* Декоративная снежинка в углу */}
            <Snowflake
              size={64}
              color={TFH.blue}
              strokeWidth={1}
              className="absolute -top-4 right-[210px] pointer-events-none"
              style={{ opacity: 0.16, animation: 'tfhSpin 26s linear infinite' }}
            />

            <div className="relative z-10 flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="px-4 py-1"
                    style={{ backgroundColor: badgeColor, clipPath: cut(0, 0, 10, 10) }}
                  >
                      <span className="text-[12px] font-black uppercase tracking-[0.28em]" style={{ color: isGoal ? TFH.navyDeep : TFH.white }}>
                        {isGoal ? 'ГОЛ' : 'ШТРАФ'}
                      </span>
                  </div>
                  <div className="text-[12px] font-black uppercase tracking-[0.28em]" style={{ color: TFH.iceDim }}>
                      {isHomeEvent ? homeShortName : awayShortName}
                  </div>
                  <div className="h-px flex-1 mr-2" style={{ backgroundColor: TFH.navyLine }} />
                </div>

                <div className="flex items-end gap-3 mt-1">
                  <span className="text-[42px] font-black uppercase tracking-tight leading-none" style={{ color: TFH.white }}>
                    {overlay.data.primary_last_name}
                  </span>
                  <span className="text-[21px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: TFH.blueSoft }}>
                    {overlay.data.primary_first_name}
                  </span>
                </div>

                <div className="mt-3.5 pt-3.5" style={{ borderTop: `2px solid ${TFH.navyLine}` }}>
                  {isGoal && (
                      (overlay.data.assist1_last_name || overlay.data.assist2_last_name) ? (
                        <div className="text-[13px] font-black uppercase tracking-[0.18em] flex gap-2.5 items-center" style={{ color: TFH.ice }}>
                            <span style={{ color: TFH.blue }}>ПЕРЕДАЧИ:</span>
                            <span>
                                {[overlay.data.assist1_last_name, overlay.data.assist2_last_name].filter(Boolean).join(' • ')}
                            </span>
                        </div>
                      ) : (
                        <span className="text-[13px] font-black uppercase tracking-[0.18em]" style={{ color: TFH.iceDim }}>БЕЗ АССИСТЕНТОВ</span>
                      )
                  )}

                  {!isGoal && (
                      <div className="flex items-center gap-4">
                        <span className="font-mono font-black text-[32px] tabular-nums leading-none" style={{ color: PENALTY_RED }}>
                            {overlay.data.penalty_minutes}
                            <span className="text-[17px] font-bold tracking-[0.18em] ml-1.5">МИН</span>
                        </span>
                        <span className="text-[13px] font-black uppercase tracking-[0.18em]" style={{ color: TFH.ice }}>
                            {overlay.data.penalty_violation}
                        </span>
                      </div>
                  )}
                </div>
            </div>
          </div>
        </div>
      </div>
    </AnimationWrapper>
  );
}
