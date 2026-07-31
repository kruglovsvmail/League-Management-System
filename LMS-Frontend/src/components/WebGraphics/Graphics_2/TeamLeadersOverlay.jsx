// src/components/WebGraphics/Graphics_2/TeamLeadersOverlay.jsx
//
// Лидеры команд во весь кадр: сверху на графите два портрета со срезанным углом,
// снизу на светлой панели таблица сравнения по всем четырём категориям сразу.
// Активная строка заливается жёлтым и переключается сама.
import React, { useState, useEffect } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { getImageUrl } from '../../../utils/helpers';
import { Cut } from './Cut';
import { Stage, PaperPanel } from './Stage';

import { Big, Num, Cap, Tag, Kicker } from './Type';
import { S } from './theme';

const PANEL_H = 452;

const CATEGORIES = [
  { key: 'points', label: 'ОЧКИ' },
  { key: 'goals', label: 'ШАЙБЫ' },
  { key: 'assists', label: 'ПЕРЕДАЧИ' },
  { key: 'plus_minus', label: 'ПОЛЕЗНОСТЬ' },
];

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

  const defaultAvatar = getImageUrl('default/user_default.webp');
  const homeColor = game.home_color_1 || S.yellow;
  const awayColor = game.away_color_1 || S.white;

  const getBestPlayer = (roster, statKey, fallbackLeader) => {
    if (!roster || !Array.isArray(roster) || roster.length === 0) return fallbackLeader;
    const sorted = [...roster].sort((a, b) => (parseFloat(b[statKey]) || 0) - (parseFloat(a[statKey]) || 0));
    const best = sorted[0];
    if (best && (parseFloat(best[statKey]) !== 0 || statKey === 'plus_minus')) return best;
    return fallbackLeader || best;
  };

  const homeRoster = game.home_tournament_roster || game.home_roster;
  const awayRoster = game.away_tournament_roster || game.away_roster;
  const cat = CATEGORIES[catIndex];
  const homeLeader = getBestPlayer(homeRoster, cat.key, game.home_leader);
  const awayLeader = getBestPlayer(awayRoster, cat.key, game.away_leader);

  const fmt = (leader, key) => {
    if (!leader) return '—';
    const v = leader[key];
    if (v === null || v === undefined) return '—';
    if (key === 'plus_minus' && Number(v) > 0) return `+${v}`;
    return v;
  };

  const LeaderCard = ({ leader, color, teamShort, side }) => {
    const photo = leader ? (getSafeUrl(leader.avatar_url) || defaultAvatar) : defaultAvatar;
    const home = side === 'home';
    const size = 210;
    const cut = 50;

    return (
      <div className={`flex items-center gap-8 min-w-0 g2-seq ${home ? '' : 'flex-row-reverse'}`}>
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <div
            className="absolute inset-0"
            style={{ backgroundColor: color, clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%)` }}
          />
          <img
            src={photo} alt=""
            className="absolute object-cover object-top"
            style={{
              inset: 4, width: size - 8, height: size - 8,
              backgroundColor: S.coalSoft,
              clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%)`,
              transform: 'scale(calc(1 + var(--audio-beat, 0) * 0.05 + var(--audio-pulse, 0) * 0.025))',
              willChange: 'transform',
            }}
            onError={(e) => { e.target.onerror = null; e.target.src = defaultAvatar; }}
          />

          {/* Номер жёлтым, наезжает на срезанный угол */}
          <div className="absolute -bottom-6" style={{ [home ? 'right' : 'left']: -26 }}>
            <Num size={76} color={S.yellow} style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))' }}>
              {leader?.jersey_number || '00'}
            </Num>
          </div>
        </div>

        <div className={`flex flex-col min-w-0 ${home ? '' : 'items-end'}`}>
          <Tag bg={S.coalSoft} color={color} size={11} className="mb-4">{teamShort}</Tag>
          <div className={`truncate max-w-[400px] ${home ? '' : 'text-right'}`}>
            <Big size={46} color={S.white}>{leader?.last_name || 'НЕТ ДАННЫХ'}</Big>
          </div>
          <Cap size={19} color={S.ash} tracking="0.18em" className="mt-4">{leader?.first_name || ''}</Cap>
        </div>
      </div>
    );
  };

  const CompareRow = ({ c, idx }) => {
    const active = idx === catIndex;
    // Значения берём у лидеров ЭТОЙ категории — строка самодостаточна
    const h = getBestPlayer(homeRoster, c.key, game.home_leader);
    const a = getBestPlayer(awayRoster, c.key, game.away_leader);

    return (
      <div
        className="flex items-center h-[84px] px-8 relative transition-colors duration-500"
        style={{ borderTop: `2px solid ${S.paperLine}`, backgroundColor: active ? S.yellow : 'transparent' }}
      >
        <div className="w-[150px] text-center shrink-0">
          <Num size={active ? 46 : 32} color={active ? S.coalDeep : S.paperMute}>{fmt(h, c.key)}</Num>
        </div>

        <div className="flex-1 text-center">
          <Cap size={active ? 19 : 15} color={active ? S.coalDeep : S.paperMute} tracking="0.3em">{c.label}</Cap>
        </div>

        <div className="w-[150px] text-center shrink-0">
          <Num size={active ? 46 : 32} color={active ? S.coalDeep : S.paperMute}>{fmt(a, c.key)}</Num>
        </div>
      </div>
    );
  };

  return (
    <Cut isVisible={isVisible} variant="split" className="absolute inset-0 z-50">
      <Stage game={game} kicker="ЛУЧШИЕ ПО СТАТИСТИКЕ" title="ЛИДЕРЫ КОМАНД">
        <div className="relative w-full h-full">

          {/* ---- ПОРТРЕТЫ НА ГРАФИТЕ ---- */}
          <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-20" style={{ height: 770 - PANEL_H - 16 }}>
            <LeaderCard leader={homeLeader} color={homeColor} teamShort={game.home_short_name || 'ХОЗЯЕВА'} side="home" />

            <div className="shrink-0 flex flex-col items-center gap-4 mx-6 relative z-10">
              <Big size={62} color={S.yellow}>VS</Big>
              <Tag bg={S.coalSoft} color={S.white} size={12}>{cat.label}</Tag>
            </div>

            <LeaderCard leader={awayLeader} color={awayColor} teamShort={game.away_short_name || 'ГОСТИ'} side="away" />
          </div>

          {/* ---- СВЕТЛАЯ ПАНЕЛЬ СО СРАВНЕНИЕМ ---- */}
          <PaperPanel className="absolute left-0 right-0 bottom-0" style={{ height: PANEL_H }} seed={57}>
            <div className="h-full flex flex-col px-24 py-6 justify-center">
              <Kicker size={12} textColor={S.coal} className="mb-2">СРАВНЕНИЕ ЛИДЕРОВ</Kicker>

              <div style={{ borderBottom: `4px solid ${S.coal}` }}>
                {CATEGORIES.map((c, i) => <CompareRow key={c.key} c={c} idx={i} />)}
              </div>

              <div className="flex items-center justify-center gap-3 mt-6">
                {CATEGORIES.map((c, i) => (
                  <div
                    key={c.key}
                    className="h-[8px] transition-all duration-500"
                    style={{
                      width: i === catIndex ? 52 : 18,
                      backgroundColor: i === catIndex ? S.yellow : S.paperLine,
                      clipPath: 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
                    }}
                  />
                ))}
              </div>
            </div>
          </PaperPanel>
        </div>
      </Stage>
    </Cut>
  );
}
