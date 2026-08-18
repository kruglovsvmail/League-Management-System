// src/components/WebGraphics/Graphics_3/TeamRosterOverlay.jsx
//
// Состав: панель поверх картинки, разделённая ПО ВЕРТИКАЛИ. Слева колонка
// клуба — эмблема, название и игровой свитер на матч (jersey_*_url), справа
// заявка. Раскладка вертикальная, а не «шапка сверху / список снизу»: список
// получает всю высоту панели, и в нём умещается любая заявка без прокрутки.
// Команды сменяют друг друга по таймеру из панели трансляции.
import React, { useState, useEffect } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { Reveal } from './Reveal';
import { Stage, DataPanel, PAD_X } from './Rink';
import { Crest, Rule } from './Frost';
import { RippleField } from './RippleField';
import { Display, Head, Num, Label, Pill, Kicker } from './Type';
import { T } from './theme';

const SIDE_W = 404;
const ROW_H = 44;
const FWD_ROWS = 8;

// Компоненты — на уровне модуля: внутри плашки они пересоздавались бы при каждой
// смене команды и при любом обновлении данных матча, и React перемонтировал бы
// поддерево вместе с эмблемой и canvas'ом волн.
function AudioBar() {
  // «Дышит» по уровню баса интро (--audio-level из audioReactive.js),
  // при выключенном интро полностью невидима.
  return (
    <div
      className="h-[2px] w-full mt-2 pointer-events-none"
      style={{ background: `linear-gradient(90deg, ${T.acc}, transparent)`, opacity: 'var(--audio-level, 0)' }}
    />
  );
}

function PlayerRow({ player }) {
  const isCaptain = player.is_captain === true || player.is_captain === 'true';
  const isAssistant = player.is_assistant === true || player.is_assistant === 'true';

  return (
    <div className="flex items-center gap-3.5" style={{ height: ROW_H, borderBottom: `1px solid ${T.divider}` }}>
      {/* Номер в круге — тот же мотив шайбы, что и во всей системе */}
      <div
        className="shrink-0 rounded-full flex items-center justify-center"
        style={{ width: 34, height: 34, backgroundColor: T.accChip, border: `1px solid rgba(18,49,74,0.14)` }}
      >
        <Num size={17} color={T.accNum}>{player.jersey_number || '00'}</Num>
      </div>

      <div className="flex items-baseline gap-2 min-w-0 flex-1">
        <Head size={18} className="truncate">{player.last_name}</Head>
        <Label size={11} color={T.label} tracking="0.1em" className="truncate">{player.first_name}</Label>
      </div>

      {(isCaptain || isAssistant) && (
        <div
          className="shrink-0 rounded-full flex items-center justify-center"
          style={
            isCaptain
              ? { width: 23, height: 23, backgroundColor: T.acc }
              : { width: 23, height: 23, border: `2px solid ${T.acc}` }
          }
        >
          <Label size={11} color={isCaptain ? T.white : T.acc} tracking="0" weight={800}>
            {isCaptain ? 'К' : 'А'}
          </Label>
        </div>
      )}
    </div>
  );
}

function ColumnHead({ label, count }) {
  return (
    <div className="shrink-0 mb-1.5">
      <div className="flex items-center gap-3.5">
        <Kicker size={10}>{label}</Kicker>
        <Label size={12} color={T.muted} tracking="0.08em" weight={800}>{count}</Label>
        <Rule grow />
      </div>
      <AudioBar />
    </div>
  );
}

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
  const teamLogo = isHome ? game.home_team_logo : game.away_team_logo;
  const roster = (isHome ? game.home_roster : game.away_roster) || [];
  const color = (isHome ? game.home_color_1 : game.away_color_1) || T.acc;

  // Свитер: тип комплекта на матч решает, тёмный или светлый показывать.
  const jerseyType = isHome ? game.home_jersey_type : game.away_jersey_type;
  const jerseyDark = getSafeUrl(isHome ? game.home_jersey_dark_url : game.away_jersey_dark_url);
  const jerseyLight = getSafeUrl(isHome ? game.home_jersey_light_url : game.away_jersey_light_url);
  const jersey = (jerseyType === 'light' ? jerseyLight : jerseyDark) || jerseyDark || jerseyLight;

  const goalies = roster.filter(p => p.position_in_line === 'G');
  const defense = roster.filter(p => p.position_in_line === 'LD' || p.position_in_line === 'RD');
  const forwards = roster.filter(p => ['LW', 'C', 'RW'].includes(p.position_in_line));

  const key = (p) => p.id || `${p.jersey_number}_${p.last_name}`;
  const fade = isAnimating ? 'opacity-0' : 'opacity-100';

  return (
    <Reveal isVisible={isVisible} variant="full" className="absolute inset-0 z-50">
      <Stage game={game} kicker="ЗАЯВКА НА МАТЧ" title="СОСТАВ КОМАНДЫ" showFooter={false}>
        <div className="w-full h-full flex gap-7 pt-3 pb-9" style={{ paddingLeft: PAD_X, paddingRight: PAD_X }}>

          {/* ---- КОЛОНКА КЛУБА ---- */}
          <div
            className={`shrink-0 flex flex-col items-center justify-center gap-6 transition-all duration-500 ${fade} ${isAnimating ? '-translate-y-4' : 'translate-y-0'}`}
            style={{ width: SIDE_W }}
          >
            <div className="relative">
              <RippleField size={330} />
              <Crest logo={teamLogo} size={196} accent={color} />
            </div>

            <div className="flex items-center gap-3">
              <Pill size={11} bg={color} color={T.white} border={color}>{shortName}</Pill>
              <Pill size={11}>{roster.length} ИГРОКОВ</Pill>
            </div>

            <div className="w-full text-center px-2">
              <Display size={40}>{teamName}</Display>
            </div>

            {jersey && (
              <img
                src={jersey} alt=""
                className="h-[196px] object-contain"
                style={{ filter: 'drop-shadow(0 18px 30px rgba(25,65,110,0.35))' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
          </div>

          {/* ---- ЗАЯВКА ---- */}
          <DataPanel className="flex-1 min-h-0">
            <div className={`h-full flex gap-8 px-9 py-6 transition-all duration-500 ${fade} ${isAnimating ? 'translate-x-10' : 'translate-x-0'}`}>

              {/* Вратари и защитники одной колонкой: их вместе редко больше
                  двенадцати, а нападающие всегда просят два столбца */}
              <div className="w-[358px] shrink-0 flex flex-col min-h-0">
                <ColumnHead label="ВРАТАРИ" count={goalies.length} />
                <div className="flex flex-col overflow-hidden">
                  {goalies.map(p => <PlayerRow key={key(p)} player={p} />)}
                </div>

                <div className="mt-6">
                  <ColumnHead label="ЗАЩИТНИКИ" count={defense.length} />
                </div>
                <div className="flex flex-col overflow-hidden">
                  {defense.map(p => <PlayerRow key={key(p)} player={p} />)}
                </div>
              </div>

              <Rule vertical tone="silver" />

              <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <ColumnHead label="НАПАДАЮЩИЕ" count={forwards.length} />
                {/* Две подколонки по 8 мест. gridAutoFlow: column — список идёт
                    сверху вниз, а не змейкой слева направо, иначе номера скачут. */}
                <div
                  className="overflow-hidden"
                  style={{
                    display: 'grid',
                    gridTemplateRows: `repeat(${FWD_ROWS}, ${ROW_H}px)`,
                    gridAutoFlow: 'column',
                    columnGap: 36,
                  }}
                >
                  {forwards.map(p => <PlayerRow key={key(p)} player={p} />)}
                </div>
              </div>

              {roster.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center z-40" style={{ backgroundColor: 'rgba(246,251,255,0.94)' }}>
                  <Label size={24} color={T.muted} tracking="0.26em">СОСТАВ НЕ ЗАПОЛНЕН</Label>
                </div>
              )}
            </div>
          </DataPanel>
        </div>
      </Stage>
    </Reveal>
  );
}
