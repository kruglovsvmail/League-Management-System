// src/components/WebGraphics/Graphics_2/TeamRosterOverlay.jsx
//
// Состав во весь кадр: сверху на графите эмблема клуба, название и игровой
// свитер на матч (jersey_*_url), снизу на светлой панели заявка тремя колонками.
import React, { useState, useEffect } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { Cut } from './Cut';
import { Stage, PaperPanel } from './Stage';
import { RippleField } from './RippleField';
import { Bar } from './Shards';
import { Big, Num, Cap, Tag, Kicker } from './Type';
import { S } from './theme';

const PANEL_H = 564;
const ROW_H = 54;

export default function TeamRosterOverlay({ game, overlay, onScreenChange }) {
  const isVisible = overlay.visible && overlay.type === 'team_roster';

  const [activeTeam, setActiveTeam] = useState('home');
  const [isAnimating, setIsAnimating] = useState(false);
  const switchDuration = overlay.data?.switchDuration || 10;

  useEffect(() => {
    if (!isVisible) {
      setActiveTeam('home');
      setIsAnimating(false);
      return;
    }
    const interval = setInterval(() => {
      setIsAnimating(true);
      // Через 500мс (когда кончится CSS-анимация ухода) меняем команду
      setTimeout(() => {
        setActiveTeam(prev => (prev === 'home' ? 'away' : 'home'));
        setIsAnimating(false);
        onScreenChange?.();
      }, 500);
    }, switchDuration * 1000);
    return () => clearInterval(interval);
  }, [isVisible, switchDuration]);

  if (!game) return null;

  const isHome = activeTeam === 'home';
  const teamName = isHome ? game.home_team_name : game.away_team_name;
  const shortName = (isHome ? game.home_short_name : game.away_short_name) || (isHome ? 'ХОЗЯЕВА' : 'ГОСТИ');
  const teamLogo = getSafeUrl(isHome ? game.home_team_logo : game.away_team_logo);
  const roster = (isHome ? game.home_roster : game.away_roster) || [];
  const color = (isHome ? game.home_color_1 : game.away_color_1) || S.yellow;

  // Свитер: тип комплекта на матч решает, тёмный или светлый показывать.
  const jerseyType = isHome ? game.home_jersey_type : game.away_jersey_type;
  const jerseyDark = getSafeUrl(isHome ? game.home_jersey_dark_url : game.away_jersey_dark_url);
  const jerseyLight = getSafeUrl(isHome ? game.home_jersey_light_url : game.away_jersey_light_url);
  const jersey = (jerseyType === 'light' ? jerseyLight : jerseyDark) || jerseyDark || jerseyLight;

  const goalies = roster.filter(p => p.position_in_line === 'G');
  const defense = roster.filter(p => p.position_in_line === 'LD' || p.position_in_line === 'RD');
  const forwards = roster.filter(p => ['LW', 'C', 'RW'].includes(p.position_in_line));

  // Аудио-реактивная полоса: «дышит» по уровню баса интро (--audio-level из
  // audioReactive.js), при выключенном интро полностью невидима.
  const AudioBar = () => (
    <div
      className="h-[3px] w-full mt-1.5 pointer-events-none"
      style={{ background: `linear-gradient(90deg, ${S.yellow}, transparent)`, opacity: 'var(--audio-level, 0)' }}
    />
  );

  const PlayerRow = ({ player }) => {
    const isCaptain = player.is_captain === true || player.is_captain === 'true';
    const isAssistant = player.is_assistant === true || player.is_assistant === 'true';

    return (
      <div className="flex items-center gap-4" style={{ height: ROW_H, borderBottom: `2px solid ${S.paperLine}` }}>
        <div className="w-[62px] shrink-0 text-right">
          <Num size={30} color={S.yellowDeep}>{player.jersey_number || '00'}</Num>
        </div>

        <div className="flex items-baseline gap-2.5 min-w-0 flex-1">
          <span className="font-black uppercase leading-none truncate" style={{ color: S.coal, fontSize: 21, letterSpacing: '-0.01em' }}>
            {player.last_name}
          </span>
          <Cap size={12} color={S.paperMute} tracking="0.12em" className="truncate">{player.first_name}</Cap>
        </div>

        {(isCaptain || isAssistant) && (
          <div
            className="shrink-0 w-[26px] h-[26px] flex items-center justify-center"
            style={isCaptain
              ? { backgroundColor: S.yellow, clipPath: 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }
              : { border: `2px solid ${S.coal}` }}
          >
            <span className="font-black leading-none" style={{ color: S.coal, fontSize: 13 }}>
              {isCaptain ? 'К' : 'А'}
            </span>
          </div>
        )}
      </div>
    );
  };

  const ColumnHead = ({ label, count }) => (
    <div className="shrink-0 mb-2">
      <div className="flex items-center gap-4">
        <Kicker size={12} textColor={S.coal}>{label}</Kicker>
        <Cap size={13} color={S.paperMute} tracking="0.1em">{count}</Cap>
        <div className="flex-1 h-[2px]" style={{ backgroundColor: S.paperLine }} />
      </div>
      <AudioBar />
    </div>
  );

  return (
    <Cut isVisible={isVisible} variant="split" className="absolute inset-0 z-50">
      <Stage game={game} kicker="ЗАЯВКА НА МАТЧ" title="СОСТАВ КОМАНДЫ">
        <div className="relative w-full h-full">

          {/* ---- ШАПКА КОМАНДЫ НА ГРАФИТЕ ---- */}
          <div
            className={`absolute left-0 right-0 top-0 flex items-center px-20 transition-all duration-500 ${isAnimating ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'}`}
            style={{ height: 770 - PANEL_H - 16 }}
          >
            <div className="relative shrink-0 mr-9">
              <RippleField size={220} />
              {teamLogo && (
                <img
                  src={teamLogo} alt=""
                  className="relative z-10 w-[124px] h-[124px] object-contain"
                  style={{
                    transform: 'scale(calc(1 + var(--audio-beat, 0) * 0.08 + var(--audio-pulse, 0) * 0.04))',
                    willChange: 'transform',
                    filter: 'drop-shadow(0 12px 22px rgba(0,0,0,0.6))',
                  }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-4 mb-4">
                <Tag bg={color} color={S.coalDeep} size={12}>{shortName}</Tag>
                <Cap size={12} color={S.ash} tracking="0.26em">{roster.length} ИГРОКОВ</Cap>
                <Bar w={28} h={7} color={S.yellow} />
              </div>
              <div className="truncate max-w-[960px]">
                <Big size={54} color={S.white}>{teamName}</Big>
              </div>
            </div>

            <div className="flex-1" />

            {jersey && (
              <img
                src={jersey} alt=""
                className="h-[136px] object-contain shrink-0 relative z-10"
                style={{ filter: 'drop-shadow(0 14px 24px rgba(0,0,0,0.6))' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
          </div>

          {/* ---- СВЕТЛАЯ ПАНЕЛЬ С ЗАЯВКОЙ ---- */}
          <PaperPanel className="absolute left-0 right-0 bottom-0" style={{ height: PANEL_H }} seed={61}>
            <div className={`h-full flex gap-10 px-20 py-6 transition-all duration-500 ${isAnimating ? 'opacity-0 translate-x-10' : 'opacity-100 translate-x-0'}`}>

              <div className="w-[300px] shrink-0 flex flex-col min-h-0">
                <ColumnHead label="ВРАТАРИ" count={goalies.length} />
                <div className="flex flex-col overflow-hidden">
                  {goalies.map(p => <PlayerRow key={p.id || `${p.jersey_number}_${p.last_name}`} player={p} />)}
                </div>
              </div>

              <div className="w-[2px] shrink-0" style={{ backgroundColor: S.paperLine }} />

              <div className="w-[440px] shrink-0 flex flex-col min-h-0">
                <ColumnHead label="ЗАЩИТНИКИ" count={defense.length} />
                <div className="flex flex-col overflow-hidden">
                  {defense.map(p => <PlayerRow key={p.id || `${p.jersey_number}_${p.last_name}`} player={p} />)}
                </div>
              </div>

              <div className="w-[2px] shrink-0" style={{ backgroundColor: S.paperLine }} />

              <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <ColumnHead label="НАПАДАЮЩИЕ" count={forwards.length} />
                {/* Две подколонки по 8 мест. gridAutoFlow: column — список идёт сверху
                    вниз, а не змейкой слева направо, иначе номера скачут. */}
                <div
                  className="overflow-hidden"
                  style={{
                    display: 'grid',
                    gridTemplateRows: `repeat(8, ${ROW_H}px)`,
                    gridAutoFlow: 'column',
                    columnGap: 44,
                  }}
                >
                  {forwards.map(p => <PlayerRow key={p.id || `${p.jersey_number}_${p.last_name}`} player={p} />)}
                </div>
              </div>

              {roster.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center z-40" style={{ backgroundColor: 'rgba(242,242,242,0.94)' }}>
                  <Cap size={26} color={S.paperMute} tracking="0.3em">СОСТАВ НЕ ЗАПОЛНЕН</Cap>
                </div>
              )}
            </div>
          </PaperPanel>
        </div>
      </Stage>
    </Cut>
  );
}
