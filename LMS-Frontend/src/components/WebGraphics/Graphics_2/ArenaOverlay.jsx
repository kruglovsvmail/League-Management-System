import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { Cut } from './Cut';
import { Card } from './Stage';
import { Bar, Tri } from './Shards';
import { Split, Cap, Kicker } from './Type';
import { S } from './theme';

// Арена: графитовая плашка у левой кромки снизу. Название арены набрано словами
// разного цвета — тот же приём, что у заголовков полноэкранных плашек.
export default function ArenaOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'arena';
  if (!game) return null;

  const arena = game.arena_name || game.location_text || 'ЛЕДОВАЯ АРЕНА';
  const city = game.arena_city ? game.arena_city.toUpperCase() : null;
  const dateObj = game.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' }).toUpperCase() : null;
  const leagueLogo = getSafeUrl(game.league_logo);

  return (
    <Cut isVisible={isVisible} variant="slide" className="absolute bottom-16 left-0 z-40">
      <Card style={{ width: 940 }} seed={31}>
        <div className="flex items-center gap-10 pl-11 pr-12 py-9">
          <div className="flex-1 min-w-0">
            <Kicker size={12} className="mb-5">МЕСТО ПРОВЕДЕНИЯ</Kicker>

            <div className="truncate">
              <Split text={arena} size={50} colors={[S.white, S.yellow]} />
            </div>

            <div className="flex items-center gap-4 mt-6">
              <Bar w={30} h={7} color={S.yellow} />
              {city && <Cap size={16} color={S.white} tracking="0.2em">{city}</Cap>}
              {city && dateStr && <Tri size={10} color={S.line} rotate={90} />}
              {dateStr && <Cap size={16} color={S.ash} tracking="0.2em">{dateStr}</Cap>}
            </div>
          </div>

          {leagueLogo && (
            <img
              src={leagueLogo} alt=""
              className="w-[110px] h-[110px] object-contain shrink-0 relative z-10"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
        </div>
      </Card>
    </Cut>
  );
}
