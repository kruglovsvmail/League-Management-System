// src/components/WebGraphics/Graphics_3/TeamLeadersOverlay.jsx
//
// Лидеры команд на ВЕСЬ кадр в виде очной дуэли: кадр разрезан по диагонали на две
// зоны — хозяева сверху, гости снизу, — а между ними проходит ледяная полоса с
// названием категории и двумя значениями лицом друг к другу.
//
// Дефолт: три вертикальные колонки внутри коробки 1500px и карусель фотографий.
// Здесь ещё и полная строка статистики игрока (И / Ш / П / О / +−) — дефолтная
// графика показывает только значение активной категории.
import React, { useState, useEffect } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { getImageUrl } from '../../../utils/helpers';
import { Reveal } from './Reveal';
import { FullFrame } from './Frame';
import { Hatch, Snowflake } from './IcePattern';
import { C, cut, shadow } from './theme';

const CATEGORIES = [
  { key: 'points', label: 'ОЧКИ' },
  { key: 'goals', label: 'ЗАБРОШЕННЫЕ ШАЙБЫ' },
  { key: 'assists', label: 'РЕЗУЛЬТАТИВНЫЕ ПЕРЕДАЧИ' },
  { key: 'plus_minus', label: 'ПОКАЗАТЕЛЬ ПОЛЕЗНОСТИ' },
];

const STAT_CELLS = [
  { key: 'games_played', label: 'И' },
  { key: 'goals', label: 'Ш' },
  { key: 'assists', label: 'П' },
  { key: 'points', label: 'О' },
  { key: 'plus_minus', label: '+/−' },
];

// Раскладка диагонального раскола. Поле плашки — 872px (1080 минус две рейки).
// Кромки зон и полосы обязаны совпадать точка в точку, иначе между ними просвечивает фон:
//   зона хозяев   0 … ZONE_TOP_H,           нижняя кромка (0,366) → (100%,280)
//   полоса        ZONE_TOP_H-SLANT … +BAND_H, повторяет обе кромки
//   зона гостей   ZONE_TOP_H-SLANT+BAND_H … низ, верхняя кромка (0,518) → (100%,432)
const ZONE_TOP_H = 366;
const BAND_H = 152;
const SLANT = 86;

export default function TeamLeadersOverlay({ game, overlay, onScreenChange }) {
  const isVisible = overlay.visible && overlay.type === 'team_leaders';

  const [catIndex, setCatIndex] = useState(0);
  const switchDuration = overlay.data?.switchDuration || 7;

  useEffect(() => {
    if (!isVisible) { setCatIndex(0); return; }
    const interval = setInterval(() => {
      setCatIndex(prev => (prev + 1) % CATEGORIES.length);
      onScreenChange?.();
    }, switchDuration * 1000);
    return () => clearInterval(interval);
  }, [isVisible, switchDuration]);

  if (!game) return null;

  const homeLogo = getSafeUrl(game.home_team_logo);
  const awayLogo = getSafeUrl(game.away_team_logo);
  const defaultAvatar = getImageUrl('default/user_default.webp');

  const homeColor = game.home_color_1 || C.blueDk;
  const awayColor = game.away_color_1 || C.ice2;

  // Лучший игрок команды по категории
  const getBestPlayer = (roster, statKey, fallbackLeader) => {
    if (!roster || !Array.isArray(roster) || roster.length === 0) return fallbackLeader;

    const sorted = [...roster].sort((a, b) => (parseFloat(b[statKey]) || 0) - (parseFloat(a[statKey]) || 0));
    const best = sorted[0];
    if (best && (parseFloat(best[statKey]) !== 0 || statKey === 'plus_minus')) return best;
    return fallbackLeader || best;
  };

  const cat = CATEGORIES[catIndex];
  const homeLeader = getBestPlayer(game.home_tournament_roster || game.home_roster, cat.key, game.home_leader);
  const awayLeader = getBestPlayer(game.away_tournament_roster || game.away_roster, cat.key, game.away_leader);

  const statValue = (leader) => {
    if (!leader) return '–';
    let v = leader[cat.key];
    if (v === null || v === undefined) return '–';
    if (cat.key === 'plus_minus' && Number(v) > 0) return `+${v}`;
    return v;
  };

  // --- Зона команды ---------------------------------------------------------
  const Zone = ({ leader, logo, color, teamName, side, style }) => {
    const photo = leader ? (getSafeUrl(leader.avatar_url) || defaultAvatar) : defaultAvatar;
    const isHome = side === 'home';

    return (
      <div className="absolute left-0 right-0 overflow-hidden" style={style}>
        {/* Подложка зоны: цвет команды + огромный логотип-водяной знак */}
        <div className="absolute inset-0" style={{ backgroundColor: C.navy }} />
        <div className="absolute inset-0" style={{ backgroundColor: color, opacity: 0.16 }} />
        <Hatch color="rgba(255,255,255,0.045)" step={28} drift />
        {logo && (
          <img
            src={logo} alt=""
            className="absolute w-[520px] h-[520px] object-contain pointer-events-none"
            style={{
              opacity: 0.09,
              [isHome ? 'right' : 'left']: 120,
              [isHome ? 'top' : 'bottom']: -110,
              filter: 'blur(1px)',
            }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}

        <div
          key={`${side}-${catIndex}`}
          className={`relative z-10 h-full flex items-center gap-11 px-[90px] g3-stagger ${isHome ? '' : 'flex-row-reverse'}`}
        >
          {/* Фото */}
          <div className="relative shrink-0" style={{ filter: shadow('lg') }}>
            <div className="absolute -inset-[4px]" style={{ backgroundColor: color, clipPath: cut(34, 0, 34, 0) }} />
            <img
              src={photo} alt=""
              className="relative w-[226px] h-[226px] object-cover object-top"
              style={{
                clipPath: cut(32, 0, 32, 0),
                transform: 'scale(calc(1 + var(--audio-beat, 0) * 0.05 + var(--audio-pulse, 0) * 0.025))',
                willChange: 'transform',
              }}
              onError={(e) => { e.target.onerror = null; e.target.src = defaultAvatar; }}
            />
          </div>

          {/* Имя и команда */}
          <div className={`flex flex-col min-w-0 ${isHome ? '' : 'items-end text-right'}`}>
            <span className="font-black uppercase tracking-[0.26em] text-[13px] mb-3" style={{ color: C.blue }}>
              {teamName}
            </span>
            <span className="font-black uppercase text-[62px] leading-[0.9] truncate max-w-[560px]" style={{ color: C.white }}>
              {leader?.last_name || 'НЕТ ДАННЫХ'}
            </span>
            <span className="font-bold uppercase text-[24px] tracking-[0.16em] leading-none mt-3" style={{ color: C.ice2 }}>
              {leader?.first_name || ''}
            </span>
          </div>

          {/* Номер игрока */}
          <div
            className="shrink-0 w-[124px] h-[124px] flex items-center justify-center relative"
            style={{ backgroundColor: color, clipPath: cut(26, 0, 26, 0) }}
          >
            <Hatch color="rgba(4,18,43,0.14)" step={16} />
            <span className="font-mono font-black text-[58px] tabular-nums leading-none relative z-10" style={{ color: C.white }}>
              {leader?.jersey_number || '00'}
            </span>
          </div>

          <div className="flex-1" />

          {/* Полная строка статистики */}
          <div className="shrink-0 flex" style={{ filter: shadow('md') }}>
            {STAT_CELLS.map((s, i) => {
              const active = s.key === cat.key;
              let v = leader ? leader[s.key] : null;
              if (s.key === 'plus_minus' && Number(v) > 0) v = `+${v}`;
              return (
                <div
                  key={s.key}
                  className="w-[92px] h-[118px] flex flex-col items-center justify-center relative"
                  style={{
                    backgroundColor: active ? C.ice : C.navy2,
                    marginLeft: i ? 4 : 0,
                    clipPath: cut(i === 0 ? 18 : 0, 0, i === STAT_CELLS.length - 1 ? 18 : 0, 0),
                  }}
                >
                  <span className="font-black uppercase tracking-[0.16em] text-[11px]" style={{ color: active ? C.blueDk : C.steel }}>
                    {s.label}
                  </span>
                  <span className="font-mono font-black text-[34px] tabular-nums leading-none mt-2" style={{ color: active ? C.deep : C.white }}>
                    {v === null || v === undefined ? '–' : v}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Reveal isVisible={isVisible} variant="takeover" className="absolute inset-0 z-50">
      {/* Зоны и полоса перекрывают поле целиком — снег и диагонали под ними не видны */}
      <FullFrame game={game} title="ЛИДЕРЫ КОМАНД" bars={false} snow={false} marquee={false}>
        <div className="flex-1 relative overflow-hidden">

          {/* Зона хозяев — нижняя кромка уходит по диагонали вверх */}
          <Zone
            leader={homeLeader} logo={homeLogo} color={homeColor}
            teamName={game.home_team_name} side="home"
            style={{
              top: 0,
              height: ZONE_TOP_H,
              clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${SLANT}px), 0 100%)`,
            }}
          />

          {/* Зона гостей — верхняя кромка продолжает ту же диагональ */}
          <Zone
            leader={awayLeader} logo={awayLogo} color={awayColor}
            teamName={game.away_team_name} side="away"
            style={{
              top: ZONE_TOP_H - SLANT + BAND_H,
              bottom: 0,
              clipPath: `polygon(0 ${SLANT}px, 100% 0, 100% 100%, 0 100%)`,
            }}
          />

          {/* Ледяная полоса категории между зонами */}
          <div
            className="absolute left-0 right-0 z-20"
            style={{ top: ZONE_TOP_H - SLANT, height: BAND_H + SLANT, filter: shadow('xl') }}
          >
            <div
              className="w-full h-full flex items-center justify-between px-[110px] relative overflow-hidden"
              style={{
                backgroundColor: C.ice,
                clipPath: `polygon(0 ${SLANT}px, 100% 0, 100% calc(100% - ${SLANT}px), 0 100%)`,
              }}
            >
              <Hatch color="rgba(11,42,91,0.055)" step={24} />
              <div className="g3-gleam g3-gleam-dark" style={{ left: '-60%' }} />
              <Snowflake
                size={150} color={C.blueDk} strokeWidth={1}
                className="absolute left-[38%] -top-6 pointer-events-none"
                style={{ opacity: 0.1, animation: 'g3Spin 45s linear infinite' }}
              />

              <span key={`h-${catIndex}`} className="font-mono font-black text-[80px] tabular-nums leading-none relative z-10 w-[190px]"
                    style={{ color: C.deep, animation: 'g3Pop 0.5s cubic-bezier(0.2,0.9,0.25,1)' }}>
                {statValue(homeLeader)}
              </span>

              <div className="flex flex-col items-center relative z-10">
                <span key={`c-${catIndex}`} className="font-black uppercase tracking-[0.24em] text-[26px] leading-none text-center"
                      style={{ color: C.blueDk, animation: 'g3Pop 0.5s cubic-bezier(0.2,0.9,0.25,1)' }}>
                  {cat.label}
                </span>
                <div className="flex gap-2.5 mt-4">
                  {CATEGORIES.map((c, i) => (
                    <div key={c.key} className="w-2.5 h-2.5 rotate-45 transition-colors duration-500"
                         style={{ backgroundColor: i === catIndex ? C.blueDk : 'rgba(11,42,91,0.2)' }} />
                  ))}
                </div>
              </div>

              <span key={`a-${catIndex}`} className="font-mono font-black text-[80px] tabular-nums leading-none relative z-10 w-[190px] text-right"
                    style={{ color: C.deep, animation: 'g3Pop 0.5s cubic-bezier(0.2,0.9,0.25,1)' }}>
                {statValue(awayLeader)}
              </span>
            </div>
          </div>

        </div>
      </FullFrame>
    </Reveal>
  );
}
