import React from 'react';
import { Reveal } from './Reveal';
import { LowerBand } from './LowerBand';
import { PinIcon } from './IcePattern';
import { LeagueMark } from './Frame';
import { C } from './theme';

// Арена: лента во всю ширину внизу. Слева — светлая плита с меткой места,
// по центру — название арены и город, справа — бренд лиги (в дефолте его нет).
export default function ArenaOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'arena';
  if (!game) return null;

  const arena = game.arena_name || game.location_text || 'ЛЕДОВАЯ АРЕНА';
  const city = game.arena_city ? game.arena_city.toUpperCase() : null;

  const dateObj = game.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj
    ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' }).toUpperCase()
    : null;

  return (
    <Reveal isVisible={isVisible} variant="band" className="absolute bottom-0 left-0 z-40">
      <LowerBand icon={<PinIcon size={52} />} label={'МЕСТО\nПРОВЕДЕНИЯ'}>
        <div className="flex items-center justify-between w-full min-w-0">
          <div className="flex flex-col min-w-0 pr-10">
            <span className="font-black uppercase text-[42px] leading-none tracking-[0.03em] truncate" style={{ color: C.white }}>
              {arena}
            </span>
            <div className="flex items-center gap-4 mt-3">
              {city && (
                <span className="font-bold uppercase tracking-[0.24em] text-[16px]" style={{ color: C.blue }}>
                  {city}
                </span>
              )}
              {city && dateStr && <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: C.steel }} />}
              {dateStr && (
                <span className="font-bold uppercase tracking-[0.24em] text-[16px]" style={{ color: C.steel }}>
                  {dateStr}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 pl-12" style={{ borderLeft: `1px solid ${C.line}` }}>
            <LeagueMark game={game} tone="dark" compact />
          </div>
        </div>
      </LowerBand>
    </Reveal>
  );
}
