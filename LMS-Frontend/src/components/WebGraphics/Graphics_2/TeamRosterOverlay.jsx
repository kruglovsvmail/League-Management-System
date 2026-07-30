// src/components/WebGraphics/Graphics_3/TeamRosterOverlay.jsx
//
// Состав на ВЕСЬ кадр: шапка команды с игровым свитером (jersey_*_url — поле, которое
// дефолтная графика не использует) и три горизонтальных пояса-амплуа с вертикальными
// ледяными подписями сбоку. Игроки — плитками в сетке на всю ширину, а не двумя
// узкими прокручиваемыми списками, как в дефолте.
import React, { useState, useEffect } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { Reveal } from './Reveal';
import { FullFrame } from './Frame';
import { RippleField } from './RippleField';
import { Hatch, Snowflake } from './IcePattern';
import { C, cut, blade, shadow } from './theme';

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
  const color = (isHome ? game.home_color_1 : game.away_color_1) || C.blueDk;

  // Свитер: тип комплекта на матч выбирает, тёмный или светлый показывать.
  const jerseyType = isHome ? game.home_jersey_type : game.away_jersey_type;
  const jerseyDark = getSafeUrl(isHome ? game.home_jersey_dark_url : game.away_jersey_dark_url);
  const jerseyLight = getSafeUrl(isHome ? game.home_jersey_light_url : game.away_jersey_light_url);
  const jersey = (jerseyType === 'light' ? jerseyLight : jerseyDark) || jerseyDark || jerseyLight;

  const goalies = roster.filter(p => p.position_in_line === 'G');
  const defense = roster.filter(p => p.position_in_line === 'LD' || p.position_in_line === 'RD');
  const forwards = roster.filter(p => ['LW', 'C', 'RW'].includes(p.position_in_line));

  // Аудио-реактивная линия: «дышит» по уровню баса интро (--audio-level из audioReactive.js),
  // при выключенном интро полностью невидима.
  const AudioLine = () => (
    <div
      className="h-[3px] w-full pointer-events-none"
      style={{ background: `linear-gradient(90deg, ${C.blue}, transparent)`, opacity: 'var(--audio-level, 0)' }}
    />
  );

  const TILE_H = 84;
  const TILE_GAP = 8;

  const PlayerTile = ({ player, big }) => {
    const isCaptain = player.is_captain === true || player.is_captain === 'true';
    const isAssistant = player.is_assistant === true || player.is_assistant === 'true';

    return (
      <div
        className="flex items-center relative overflow-hidden"
        style={{ height: big ? 96 : TILE_H, backgroundColor: C.navy2, clipPath: cut(16, 0, 16, 0) }}
      >
        <Hatch color="rgba(255,255,255,0.035)" step={18} />

        {/* Номер на цветном поле команды */}
        <div
          className="h-full flex items-center justify-center shrink-0 relative"
          style={{ width: big ? 94 : 82, backgroundColor: color, clipPath: 'polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%)' }}
        >
          <span
            className="font-mono font-black tabular-nums leading-none pr-2.5"
            style={{ color: C.white, fontSize: big ? 40 : 34, textShadow: '0 2px 8px rgba(4,18,43,0.5)' }}
          >
            {player.jersey_number || '00'}
          </span>
        </div>

        <div className="flex flex-col min-w-0 flex-1 px-4 relative z-10">
          <span
            className="font-black uppercase leading-none truncate"
            style={{ color: C.white, fontSize: big ? 24 : 21, letterSpacing: '0.01em' }}
          >
            {player.last_name}
          </span>
          <span
            className="font-bold uppercase tracking-[0.12em] leading-none mt-1.5 truncate"
            style={{ color: C.steel, fontSize: big ? 13 : 12 }}
          >
            {player.first_name}
          </span>
        </div>

        {/* Капитан / ассистент — ромбы */}
        {(isCaptain || isAssistant) && (
          <div className="mr-4 shrink-0 w-[26px] h-[26px] flex items-center justify-center relative z-10">
            <div
              className={`absolute inset-0 rotate-45 ${isCaptain ? '' : 'border-2'}`}
              style={isCaptain ? { backgroundColor: C.gold } : { borderColor: C.blue }}
            />
            <span className="relative font-black text-[13px] leading-none" style={{ color: isCaptain ? C.deep : C.blue }}>
              {isCaptain ? 'К' : 'А'}
            </span>
          </div>
        )}
      </div>
    );
  };

  // Пояс амплуа: вертикальная ледяная подпись слева + сетка игроков.
  // height рассчитан ровно на rows рядов плиток — иначе четвёртый ряд нападающих
  // молча срезался бы нижней рейкой.
  const Band = ({ label, players, cols, rows, big }) => {
    const rowH = big ? 96 : TILE_H;
    const height = 3 + 10 + rows * rowH + (rows - 1) * TILE_GAP;
    return (
      <div className="flex gap-5" style={{ height }}>
        <div className="w-[70px] shrink-0" style={{ filter: shadow('sm') }}>
          <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden"
               style={{ backgroundColor: C.ice, clipPath: blade(18) }}>
            <Hatch color="rgba(11,42,91,0.06)" step={16} />
            <span
              className="font-black uppercase tracking-[0.28em] text-[15px] relative z-10"
              style={{ color: C.deep, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              {label}
            </span>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45" style={{ backgroundColor: C.blueDk }} />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <AudioLine />
          <div
            className="grid content-start mt-2.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: TILE_GAP }}
          >
            {players.map(p => (
              <PlayerTile key={p.id || `${p.jersey_number}_${p.last_name}`} player={p} big={big} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Reveal isVisible={isVisible} variant="takeover" className="absolute inset-0 z-50">
      <FullFrame game={game} title="СОСТАВ КОМАНДЫ" bars={false}>
        {/* Поле плашки — 872px (1080 минус две рейки). Раскладка: шапка 150 + отступ 16 +
            пояса 110/190/282 с зазорами 16 = 780 из 824 доступных после вертикальных полей. */}
        <div className="flex-1 flex flex-col px-14 pt-7 pb-5 min-h-0 relative">

          {/* ---------- ШАПКА КОМАНДЫ ---------- */}
          <div
            className={`h-[150px] shrink-0 flex items-center relative overflow-hidden transition-all duration-500 ${isAnimating ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'}`}
            style={{ backgroundColor: C.navy2, clipPath: cut(34, 0, 34, 0), filter: shadow('lg') }}
          >
            <Hatch color="rgba(255,255,255,0.05)" step={26} drift />
            <div className="g3-gleam z-30" style={{ left: '-60%' }} />
            <div className="absolute left-0 top-0 bottom-0 w-[10px] z-20" style={{ backgroundColor: color }} />

            {teamLogo && (
              <div className="relative ml-12 mr-9 shrink-0">
                <RippleField size={188} />
                <img
                  src={teamLogo} alt=""
                  className="relative z-10 w-[118px] h-[118px] object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.7)]"
                  style={{ transform: 'scale(calc(1 + var(--audio-beat, 0) * 0.08 + var(--audio-pulse, 0) * 0.04))', willChange: 'transform' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}

            <div className="flex flex-col min-w-0 relative z-10">
              <div className="flex items-center gap-4 mb-3">
                <div className="px-4 py-1.5" style={{ backgroundColor: color, clipPath: blade(10) }}>
                  <span className="font-black uppercase tracking-[0.3em] text-[13px] leading-none" style={{ color: C.white }}>
                    {shortName}
                  </span>
                </div>
                <span className="font-black uppercase tracking-[0.26em] text-[12px]" style={{ color: C.blue }}>
                  ЗАЯВКА НА МАТЧ • {roster.length} ИГРОКОВ
                </span>
              </div>
              <span className="font-black uppercase text-[52px] leading-none tracking-tight truncate max-w-[960px]" style={{ color: C.white }}>
                {teamName}
              </span>
            </div>

            <div className="flex-1" />

            {/* Игровой свитер команды на этот матч */}
            {jersey && (
              <img
                src={jersey} alt=""
                className="h-[128px] object-contain mr-12 relative z-10 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <Snowflake
              size={210} color={C.blue} strokeWidth={0.9}
              className="absolute right-[300px] -top-10 pointer-events-none"
              style={{ opacity: 0.12, animation: 'g3Spin 60s linear infinite' }}
            />
          </div>

          {/* ---------- ПОЯСА АМПЛУА ---------- */}
          {/* 3 вратаря + 10 защитников + 15 нападающих — с запасом на любую заявку */}
          <div className={`flex-1 flex flex-col gap-4 mt-4 min-h-0 transition-all duration-500 ${isAnimating ? 'opacity-0 translate-x-10' : 'opacity-100 translate-x-0'}`}>
            <Band label="ВРАТАРИ" players={goalies} cols={3} rows={1} big />
            <Band label="ЗАЩИТНИКИ" players={defense} cols={5} rows={2} />
            <Band label="НАПАДАЮЩИЕ" players={forwards} cols={5} rows={3} />
          </div>

          {roster.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-40" style={{ backgroundColor: 'rgba(4,18,43,0.9)' }}>
              <span className="font-black uppercase tracking-[0.24em] text-[30px]" style={{ color: C.steel }}>
                Состав не заполнен
              </span>
            </div>
          )}

        </div>
      </FullFrame>
    </Reveal>
  );
}
