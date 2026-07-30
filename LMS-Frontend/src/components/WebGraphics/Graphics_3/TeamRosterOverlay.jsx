import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';
import { BigPlate } from './BigPlate';
import { DiagonalTicker, DiagonalStripes, Snowfall } from './IceDecor';
import { RippleField } from './RippleField';
import { TFH, cut } from './theme';

const BODY_H = 690;
const CAPTAIN_COLOR = '#F0B429';

export default function TeamRosterOverlay({ game, overlay, onScreenChange }) {
  const isVisible = overlay.visible && overlay.type === 'team_roster';

  const [activeTeam, setActiveTeam] = useState('home');
  const [isAnimating, setIsAnimating] = useState(false);

  // Время показа одной команды приходит из панели управления
  const switchDuration = overlay.data?.switchDuration || 10;

  useEffect(() => {
    if (!isVisible) {
      setActiveTeam('home');
      setIsAnimating(false);
      return;
    }

    const interval = setInterval(() => {
      setIsAnimating(true);

      // Через 500мс (когда кончится CSS-анимация ухода) меняем команду и возвращаем видимость
      setTimeout(() => {
        setActiveTeam(prev => prev === 'home' ? 'away' : 'home');
        setIsAnimating(false);
        onScreenChange?.();
      }, 500);

    }, switchDuration * 1000);

    return () => clearInterval(interval);
  }, [isVisible, switchDuration]);

  if (!game) return null;

  // Аудио-реактивная линия под заголовком секции: «дышит» по уровню баса интро
  // (--audio-level из audioReactive.js), при выключенном интро полностью невидима.
  const AudioPulseLine = () => (
    <div
      className="h-[2px] -mt-3 mb-3 pointer-events-none shrink-0"
      style={{
        background: `linear-gradient(90deg, transparent, ${TFH.blue}, transparent)`,
        opacity: 'var(--audio-level, 0)',
      }}
    />
  );

  const isHome = activeTeam === 'home';
  const currentTeamName = isHome ? game.home_team_name : game.away_team_name;
  const currentTeamLogo = isHome ? getImageUrl(game.home_team_logo) : getImageUrl(game.away_team_logo);
  const currentRoster = isHome ? (game.home_roster || []) : (game.away_roster || []);
  const currentCoach = isHome ? game.home_coach : game.away_coach;
  const currentColor = (isHome ? game.home_color_1 : game.away_color_1) || TFH.blue;

  // Точная фильтрация из БД
  const goalies = currentRoster.filter(p => p.position_in_line === 'G');
  const defense = currentRoster.filter(p => p.position_in_line === 'LD' || p.position_in_line === 'RD');
  const forwards = currentRoster.filter(p => p.position_in_line === 'LW' || p.position_in_line === 'C' || p.position_in_line === 'RW');

  const SectionTitle = ({ children }) => (
    <div className="flex items-center gap-3 mb-4 pb-2 shrink-0" style={{ borderBottom: `1px solid ${TFH.navyLine}` }}>
      <div className="w-2.5 h-2.5 rotate-45 shrink-0" style={{ backgroundColor: TFH.blue }} />
      <span className="font-black uppercase tracking-[0.3em] text-[11px]" style={{ color: TFH.blue }}>
        {children}
      </span>
    </div>
  );

  const PlayerRow = ({ player }) => {
    const isCaptain = player.is_captain === true || player.is_captain === 'true';
    const isAssistant = player.is_assistant === true || player.is_assistant === 'true';

    return (
      <div className="flex items-center gap-4 py-[7px]" style={{ borderBottom: `1px solid rgba(27,58,114,0.45)` }}>
         {/* Номер — срезанный под 45° чип */}
         <div
           className="w-[42px] h-[28px] shrink-0 flex items-center justify-center"
           style={{ backgroundColor: TFH.navyMid, clipPath: cut(8, 0, 8, 0) }}
         >
           <span className="font-mono font-black text-[17px] tabular-nums leading-none" style={{ color: TFH.blueSoft }}>
             {player.jersey_number || '00'}
           </span>
         </div>

         <div className="flex items-baseline gap-2 truncate flex-1">
            <span className="font-black text-[20px] uppercase tracking-[0.03em] truncate" style={{ color: TFH.white }}>
              {player.last_name}
            </span>
            <span className="font-bold text-[13px] uppercase tracking-[0.14em] truncate" style={{ color: TFH.iceDim }}>
              {player.first_name}
            </span>
         </div>

         {/* Капитан / ассистент — ромбы в стиле паттерна */}
         {isCaptain && (
           <div className="w-[26px] h-[26px] shrink-0 flex items-center justify-center relative">
             <div className="absolute inset-0 rotate-45" style={{ backgroundColor: CAPTAIN_COLOR }} />
             <span className="relative font-black text-[14px] leading-none" style={{ color: TFH.navyDeep }}>К</span>
           </div>
         )}
         {isAssistant && (
           <div className="w-[26px] h-[26px] shrink-0 flex items-center justify-center relative">
             <div className="absolute inset-0 rotate-45 border-2" style={{ borderColor: TFH.blue }} />
             <span className="relative font-black text-[14px] leading-none" style={{ color: TFH.blue }}>А</span>
           </div>
         )}
      </div>
    );
  };

  return (
    <AnimationWrapper type="team_roster" isVisible={isVisible} className="absolute inset-0 flex items-center justify-center z-50 p-20">
      <BigPlate title="СОСТАВ КОМАНДЫ" game={game} showFooter={false}>
        <div className="flex w-full relative z-0 overflow-hidden" style={{ height: BODY_H, backgroundColor: TFH.navy }}>
          <DiagonalTicker texts={[game.league_name, game.home_short_name, game.away_short_name, game.division_name, game.home_team_name, game.away_team_name]} />
          <Snowfall count={14} fallHeight={BODY_H} />

          {/* ЛЕВАЯ КОЛОНКА: логотип, название, тренер */}
          <div className="w-[35%] flex flex-col items-center justify-center relative px-10 py-12 z-10">
             <div className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
               {currentTeamLogo && (
                 <img src={currentTeamLogo} alt="" className="w-full h-full object-cover opacity-[0.18] blur-2xl scale-150 z-0 pointer-events-none" />
               )}
             </div>
             <DiagonalStripes color="rgba(255,255,255,0.035)" step={30} />

             <div className={`flex flex-col items-center w-full z-10 transition-all duration-500 transform ${isAnimating ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}>
                {currentTeamLogo && (
                  <div className="relative mb-8">
                    {/* Гранёные кольца под интро — см. RippleField.jsx */}
                    <RippleField size={440} />
                    <img
                      src={currentTeamLogo}
                      alt="Team Logo"
                      className="relative z-10 w-60 h-60 object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.85)]"
                      style={{ transform: 'scale(calc(1 + var(--audio-beat, 0) * 0.10 + var(--audio-pulse, 0) * 0.05))', willChange: 'transform' }}
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  </div>
                )}

                <span className="text-[44px] font-black text-center uppercase tracking-tight leading-[0.95] w-full" style={{ color: TFH.white }}>
                  {currentTeamName}
                </span>

                <div className="h-[7px] w-[170px] mt-5" style={{ backgroundColor: currentColor, clipPath: cut(0, 7, 0, 7) }} />

                {currentCoach && (
                  <div
                    className="mt-11 p-5 w-full text-left relative overflow-hidden"
                    style={{ backgroundColor: TFH.navyMid, clipPath: cut(20, 0, 20, 0) }}
                  >
                     <DiagonalStripes color="rgba(255,255,255,0.04)" step={20} />
                     <div className="absolute left-0 top-0 bottom-0 w-[5px]" style={{ backgroundColor: TFH.blue }} />
                     <div className="relative z-10 pl-3">
                       <span className="font-black uppercase tracking-[0.24em] text-[10px] block mb-2" style={{ color: TFH.blue }}>
                         ГЛАВНЫЙ ТРЕНЕР
                       </span>
                       <span className="font-black text-[23px] uppercase tracking-[0.03em] block truncate" style={{ color: TFH.white }}>
                         {currentCoach.last_name}
                       </span>
                       <span className="font-bold text-[15px] uppercase tracking-[0.14em] block truncate" style={{ color: TFH.iceDim }}>
                         {currentCoach.first_name}
                       </span>
                     </div>
                  </div>
                )}
             </div>
          </div>

          {/* ПРАВАЯ КОЛОНКА: списки игроков */}
          <div className="w-[65%] flex relative z-10 overflow-hidden" style={{ backgroundColor: TFH.navyDeep }}>
             <DiagonalStripes color="rgba(255,255,255,0.025)" step={34} />

             <div className={`flex w-full h-full relative z-10 transition-all duration-500 transform ${isAnimating ? 'translate-x-12 opacity-0' : 'translate-x-0 opacity-100'}`}>

                {/* Вратари и защитники */}
                <div className="w-1/2 flex flex-col px-10 py-8" style={{ borderRight: `2px solid ${TFH.navyLine}` }}>
                   <div className="flex flex-col shrink-0 mb-8">
                      <SectionTitle>ВРАТАРИ</SectionTitle>
                      <AudioPulseLine />
                      <div className="flex flex-col">
                         {goalies.map(p => <PlayerRow key={p.id || `${p.jersey_number}_${p.last_name}`} player={p} />)}
                      </div>
                   </div>

                   <div className="flex flex-col flex-1 overflow-hidden">
                      <SectionTitle>ЗАЩИТНИКИ</SectionTitle>
                      <AudioPulseLine />
                      <div className="flex flex-col overflow-y-auto custom-scrollbar pr-2 h-full">
                         {defense.map(p => <PlayerRow key={p.id || `${p.jersey_number}_${p.last_name}`} player={p} />)}
                      </div>
                   </div>
                </div>

                {/* Нападающие */}
                <div className="w-1/2 flex flex-col px-10 py-8">
                   <div className="flex flex-col flex-1 overflow-hidden">
                      <SectionTitle>НАПАДАЮЩИЕ</SectionTitle>
                      <AudioPulseLine />
                      <div className="flex flex-col overflow-y-auto custom-scrollbar pr-2 h-full">
                         {forwards.map(p => <PlayerRow key={p.id || `${p.jersey_number}_${p.last_name}`} player={p} />)}
                      </div>
                   </div>
                </div>

             </div>

             {/* Заглушка, если ростер пуст */}
             {currentRoster.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20" style={{ backgroundColor: 'rgba(6,21,48,0.92)' }}>
                   <span className="font-black uppercase tracking-[0.2em] text-[24px]" style={{ color: TFH.iceDim }}>Состав не заполнен</span>
                </div>
             )}
          </div>

        </div>
      </BigPlate>
    </AnimationWrapper>
  );
}
