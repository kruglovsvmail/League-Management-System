import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';
import { BigPlate } from './BigPlate';
import { DiagonalTicker, DiagonalStripes, Snowfall } from './IceDecor';
import { TFH, cut } from './theme';

const CATEGORIES = [
  { key: 'points', label: 'ОЧКИ' },
  { key: 'goals', label: 'ГОЛЫ' },
  { key: 'assists', label: 'ПЕРЕДАЧИ' },
  { key: 'plus_minus', label: '+ / -' }
];

const BODY_H = 560;
const ROW_H = 74;
const ROW_GAP = 8;

export default function TeamLeadersOverlay({ game, overlay, onScreenChange }) {
  const isVisible = overlay.visible && overlay.type === 'team_leaders';

  const [catIndex, setCatIndex] = useState(0);
  const switchDuration = overlay.data?.switchDuration || 7;

  useEffect(() => {
    if (!isVisible) {
      setCatIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setCatIndex(prev => (prev + 1) % CATEGORIES.length);
      onScreenChange?.();
    }, switchDuration * 1000);

    return () => clearInterval(interval);
  }, [isVisible, switchDuration]);

  if (!game) return null;

  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);
  const defaultAvatar = getImageUrl('default/user_default.webp');

  const homeColor = game.home_color_1 || TFH.blue;
  const awayColor = game.away_color_1 || TFH.ice;

  // Функция поиска лучшего игрока по категории
  const getBestPlayer = (roster, statKey, fallbackLeader) => {
    if (!roster || !Array.isArray(roster) || roster.length === 0) return fallbackLeader;

    const sorted = [...roster].sort((a, b) => {
      const valA = parseFloat(a[statKey]) || 0;
      const valB = parseFloat(b[statKey]) || 0;
      return valB - valA;
    });

    const best = sorted[0];
    if (best && (parseFloat(best[statKey]) !== 0 || statKey === 'plus_minus')) {
      return best;
    }
    return fallbackLeader || best;
  };

  // Вычисляем лидеров для КАЖДОЙ категории заранее
  const homeLeaders = CATEGORIES.map(cat => getBestPlayer(game.home_tournament_roster || game.home_roster, cat.key, game.home_leader));
  const awayLeaders = CATEGORIES.map(cat => getBestPlayer(game.away_tournament_roster || game.away_roster, cat.key, game.away_leader));

  // Карточка игрока в карусели
  const renderPlayerCard = (leader, idx, isHome) => {
    const isActive = idx === catIndex;
    const isPrev = idx === (catIndex - 1 + CATEGORIES.length) % CATEGORIES.length;

    // Ждёт сверху → в центре → уехал вниз
    let positionClass = '-translate-y-full opacity-0 pointer-events-none z-0';
    if (isActive) positionClass = 'translate-y-0 opacity-100 z-10';
    else if (isPrev) positionClass = 'translate-y-full opacity-0 pointer-events-none z-0';

    const photo = leader ? (getSafeUrl(leader.avatar_url) || defaultAvatar) : defaultAvatar;
    const firstName = leader?.first_name || 'НЕТ ДАННЫХ';
    const lastName = leader?.last_name || '';
    const number = leader?.jersey_number || '00';
    const teamLogo = isHome ? homeLogo : awayLogo;
    const color = isHome ? homeColor : awayColor;

    return (
      <div
        key={`player_${isHome ? 'home' : 'away'}_${idx}`}
        className={`absolute inset-0 flex flex-col items-center justify-center p-8 transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] ${positionClass}`}
      >
         {/* Номер на фоне — «дышит» по уровню баса интро (audioReactive.js) */}
         <span
           className={`absolute top-8 ${isHome ? 'left-8' : 'right-8'} text-[112px] font-black italic leading-none select-none z-0`}
           style={{ color: TFH.white, opacity: 'calc(0.12 + var(--audio-level, 0) * 0.28)' }}
         >
           {number}
         </span>

         {/* Фото игрока — срезанная под 45° рамка вместо круглых углов */}
         <div
           className="relative w-56 h-56 mb-7 z-10"
           style={{ transform: 'scale(calc(1 + var(--audio-beat, 0) * 0.06 + var(--audio-pulse, 0) * 0.03))', willChange: 'transform' }}
         >
            <div className="absolute -inset-[3px]" style={{ backgroundColor: color, clipPath: cut(34, 0, 34, 0) }} />
            <img
              src={photo}
              alt="Player"
              className="relative w-full h-full object-cover object-top"
              style={{ clipPath: cut(32, 0, 32, 0) }}
              onError={(e) => { e.target.src = defaultAvatar; }}
            />
            {teamLogo && (
               <div
                 className={`absolute -bottom-5 ${isHome ? '-right-5' : '-left-5'} w-[76px] h-[76px] flex items-center justify-center p-2 drop-shadow-xl`}
                 style={{
                   backgroundColor: TFH.navyDeep,
                   clipPath: cut(14, 0, 14, 0),
                   transform: 'scale(calc(1 + var(--audio-beat, 0) * 0.12 + var(--audio-pulse, 0) * 0.06))',
                   willChange: 'transform',
                 }}
               >
                  <img src={teamLogo} alt="Team" className="w-full h-full object-contain" onError={(e) => e.target.style.display = 'none'} />
               </div>
            )}
         </div>

         {/* Имя и фамилия */}
         <div className="flex flex-col items-center text-center z-10 w-full px-4">
            <span className="text-[38px] font-black uppercase tracking-tight leading-none truncate w-full mb-2" style={{ color: TFH.white }}>
               {lastName}
            </span>
            <span className="text-[19px] font-bold uppercase tracking-[0.16em] leading-none truncate w-full" style={{ color: TFH.blueSoft }}>
               {firstName}
            </span>
         </div>
      </div>
    );
  };

  const TeamColumn = ({ logo, isHome }) => (
    <div className="w-[35%] flex flex-col relative overflow-hidden">
      {logo && (
        <img src={logo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.22] blur-2xl scale-[160%] z-0 pointer-events-none" />
      )}
      <DiagonalStripes color="rgba(255,255,255,0.035)" step={30} />
      <div className="relative w-full h-full">
        {CATEGORIES.map((cat, idx) => renderPlayerCard(isHome ? homeLeaders[idx] : awayLeaders[idx], idx, isHome))}
      </div>
    </div>
  );

  return (
    <AnimationWrapper type="team_leaders" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50 p-20">
      <BigPlate title="ЛИДЕРЫ КОМАНД" game={game}>
        <div className="flex w-full relative z-0 overflow-hidden" style={{ height: BODY_H, backgroundColor: TFH.navy }}>
          <DiagonalTicker texts={[game.league_name, game.home_short_name, game.away_short_name, game.division_name, game.home_team_name, game.away_team_name]} />
          <Snowfall count={14} fallHeight={BODY_H} />

          <TeamColumn logo={homeLogo} isHome />

          {/* ЦЕНТР: сравнение статистики */}
          <div
            className="w-[30%] flex flex-col items-center justify-center relative z-10 px-6"
            style={{ backgroundColor: TFH.navyDeep, boxShadow: '0 0 60px rgba(0,0,0,0.75)' }}
          >
            <DiagonalStripes color="rgba(41,169,225,0.06)" step={26} drift />

            <div className="flex items-center gap-3 mb-8 z-20">
              <div className="w-2 h-2 rotate-45" style={{ backgroundColor: TFH.blue }} />
              <span className="font-black uppercase tracking-[0.3em] text-[11px]" style={{ color: TFH.blue }}>
                СРАВНЕНИЕ СТАТИСТИКИ
              </span>
              <div className="w-2 h-2 rotate-45" style={{ backgroundColor: TFH.blue }} />
            </div>

            <div className="relative flex flex-col w-full z-10" style={{ gap: ROW_GAP }}>

              {/* Скользящий бегунок активной категории */}
              <div
                className="absolute left-0 right-0 transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] z-0"
                style={{
                  height: ROW_H,
                  transform: `translateY(${catIndex * (ROW_H + ROW_GAP)}px)`,
                  backgroundColor: 'rgba(41,169,225,0.16)',
                  clipPath: cut(18, 0, 18, 0),
                  borderLeft: `3px solid ${TFH.blue}`,
                }}
              />

              {CATEGORIES.map((cat, idx) => {
                const isActive = idx === catIndex;

                // Значения берём у АКТИВНЫХ сейчас игроков — строки читаются как одно сравнение
                const currentHLeader = homeLeaders[catIndex];
                const currentALeader = awayLeaders[catIndex];

                let hStat = currentHLeader ? currentHLeader[cat.key] : '-';
                let aStat = currentALeader ? currentALeader[cat.key] : '-';

                if (cat.key === 'plus_minus') {
                  if (hStat > 0) hStat = `+${hStat}`;
                  if (aStat > 0) aStat = `+${aStat}`;
                }

                return (
                  <div
                    key={cat.key}
                    className="flex items-center justify-between w-full px-6 relative z-10"
                    style={{ height: ROW_H }}
                  >
                     <span
                       className="w-16 text-center text-[30px] font-black tabular-nums transition-colors duration-700"
                       style={{ color: isActive ? TFH.white : 'rgba(255,255,255,0.28)' }}
                     >
                       {hStat}
                     </span>
                     <span
                       className="text-[19px] font-black uppercase tracking-[0.16em] transition-colors duration-700"
                       style={{ color: isActive ? TFH.blue : TFH.iceDim }}
                     >
                       {cat.label}
                     </span>
                     <span
                       className="w-16 text-center text-[30px] font-black tabular-nums transition-colors duration-700"
                       style={{ color: isActive ? TFH.white : 'rgba(255,255,255,0.28)' }}
                     >
                       {aStat}
                     </span>
                  </div>
                );
              })}
            </div>
          </div>

          <TeamColumn logo={awayLogo} isHome={false} />

        </div>
      </BigPlate>
    </AnimationWrapper>
  );
}
