// src/components/WebGraphics/Graphics_3/TeamLeadersOverlay.jsx
//
// Лидеры команд: панель поверх картинки, разложенная В ТРИ КОЛОНКИ — карточка
// лидера хозяев, сравнение по центру, карточка лидера гостей. Раскладка
// «портреты сверху / таблица снизу» повторяла перерыв и составы; здесь
// вертикальная симметрия сама читается как противостояние.
// Активная категория подсвечивается акцентом и переключается сама.
import React, { useState, useEffect } from 'react';
import { Reveal } from './Reveal';
import { Stage, DataPanel, PAD_X } from './Rink';
import { Dark, Portrait } from './Frost';
import { Display, Num, Label, Pill, Kicker } from './Type';
import { T, R } from './theme';

const SIDE_W = 412;

const CATEGORIES = [
  { key: 'points', label: 'ОЧКИ' },
  { key: 'goals', label: 'ШАЙБЫ' },
  { key: 'assists', label: 'ПЕРЕДАЧИ' },
  { key: 'plus_minus', label: 'ПОЛЕЗНОСТЬ' },
];

const fmt = (leader, key) => {
  if (!leader) return '—';
  const v = leader[key];
  if (v === null || v === undefined) return '—';
  if (key === 'plus_minus' && Number(v) > 0) return `+${v}`;
  return v;
};

// Компоненты — на уровне модуля: внутри плашки они пересоздавались бы при каждом
// переключении категории, и React перемонтировал бы поддерево вместе с фото.
function LeaderCard({ leader, color, teamShort }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 g3-seq shrink-0" style={{ width: SIDE_W }}>
      <div className="relative">
        <Portrait person={leader} size={224} ring={6} accent={color} />

        {/* Номер в тёмной «шайбе», наезжает на кольцо снизу справа */}
        <div className="absolute z-20" style={{ bottom: -8, right: -10, width: 78, height: 78 }}>
          <Dark radius={R.pill} style={{ width: '100%', height: '100%' }}>
            <div className="w-full h-full flex items-center justify-center">
              <Num size={32} color={T.white}>{leader?.jersey_number || '00'}</Num>
            </div>
          </Dark>
        </div>
      </div>

      <Pill size={11} bg={color} color={T.white} border={color}>{teamShort}</Pill>

      <div className="w-full text-center px-2">
        <Display size={42}>{leader?.last_name || 'НЕТ ДАННЫХ'}</Display>
        <div className="mt-3.5">
          <Label size={18} color={T.accNum} tracking="0.16em" weight={800}>{leader?.first_name || ''}</Label>
        </div>
      </div>
    </div>
  );
}

function CompareRow({ label, home, away, active }) {
  return (
    <div
      className="flex items-center h-[86px] px-6 relative transition-all duration-500"
      style={{
        // Радиус инлайном, а не rounded-xl: в tailwind.config.js этой сборки
        // borderRadius.xl переопределён на var(--radius-xl) из темы LMS,
        // а графика лиги не должна зависеть от токенов админки.
        borderRadius: R.tile,
        backgroundColor: active ? T.accChipStrong : 'transparent',
        boxShadow: active ? `inset 3px 0 0 ${T.acc}` : 'none',
      }}
    >
      <div className="w-[108px] text-center shrink-0">
        <Num size={active ? 44 : 30} color={active ? T.accNum : T.muted}>{home}</Num>
      </div>

      <div className="flex-1 text-center">
        <Label size={active ? 16 : 13} color={active ? T.head : T.label} tracking="0.24em" weight={800}>{label}</Label>
      </div>

      <div className="w-[108px] text-center shrink-0">
        <Num size={active ? 44 : 30} color={active ? T.accNum : T.muted}>{away}</Num>
      </div>
    </div>
  );
}

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

  const homeColor = game.home_color_1 || T.acc;
  const awayColor = game.away_color_1 || T.head;

  const getBestPlayer = (roster, statKey, fallbackLeader) => {
    if (!roster || !Array.isArray(roster) || roster.length === 0) return fallbackLeader;
    const sorted = [...roster].sort((a, b) => (parseFloat(b[statKey]) || 0) - (parseFloat(a[statKey]) || 0));
    const best = sorted[0];
    if (best && (parseFloat(best[statKey]) !== 0 || statKey === 'plus_minus')) return best;
    return fallbackLeader || best;
  };

  // Турнирная заявка есть только у официального матча; у товарищеского падаем
  // на заявку самого матча (см. getPublicGameById).
  const homeRoster = game.home_tournament_roster || game.home_roster;
  const awayRoster = game.away_tournament_roster || game.away_roster;
  const cat = CATEGORIES[catIndex];
  const homeLeader = getBestPlayer(homeRoster, cat.key, game.home_leader);
  const awayLeader = getBestPlayer(awayRoster, cat.key, game.away_leader);

  return (
    <Reveal isVisible={isVisible} variant="full" className="absolute inset-0 z-50">
      <Stage game={game} kicker="ЛУЧШИЕ ПО СТАТИСТИКЕ" title="ЛИДЕРЫ КОМАНД">
        <div className="w-full h-full flex items-stretch gap-6 pt-2 pb-4" style={{ paddingLeft: PAD_X, paddingRight: PAD_X }}>

          <LeaderCard leader={homeLeader} color={homeColor} teamShort={game.home_short_name || 'ХОЗЯЕВА'} />

          {/* ---- СРАВНЕНИЕ ---- */}
          <DataPanel className="flex-1 min-w-0">
            <div className="h-full flex flex-col px-8 py-6">
              <div className="flex items-center gap-4 shrink-0">
                <Kicker size={11}>СРАВНЕНИЕ ЛИДЕРОВ</Kicker>
                <div className="flex-1" />
                <div className="flex gap-2 shrink-0">
                  {CATEGORIES.map((c, i) => (
                    <div
                      key={c.key}
                      className="h-[8px] rounded-full transition-all duration-500"
                      style={{ width: i === catIndex ? 26 : 8, backgroundColor: i === catIndex ? T.acc : T.brdSoft }}
                    />
                  ))}
                </div>
              </div>

              {/* Значения берём у лидеров КАЖДОЙ категории — строка самодостаточна
                  и читается как отдельное сравнение, а не как подпись к портрету. */}
              <div className="flex-1 flex flex-col justify-center">
                {CATEGORIES.map((c, i) => (
                  <CompareRow
                    key={c.key}
                    label={c.label}
                    home={fmt(getBestPlayer(homeRoster, c.key, game.home_leader), c.key)}
                    away={fmt(getBestPlayer(awayRoster, c.key, game.away_leader), c.key)}
                    active={i === catIndex}
                  />
                ))}
              </div>
            </div>
          </DataPanel>

          <LeaderCard leader={awayLeader} color={awayColor} teamShort={game.away_short_name || 'ГОСТИ'} />

        </div>
      </Stage>
    </Reveal>
  );
}
