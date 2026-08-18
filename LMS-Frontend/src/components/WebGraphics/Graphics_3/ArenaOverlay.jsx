import React from 'react';
import { Icon } from '../../../ui/Icon';
import { Reveal } from './Reveal';
import { InfoCard, PlateIcon } from './Frost';
import { LeagueMark } from './Emblem';
import { Display, Label } from './Type';
import { T } from './theme';

// Арена: светлая плашка у левой кромки снизу. Иконка — общая из ui/Icon.jsx,
// та же, что у раздела арен в самой LMS.

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
    <Reveal isVisible={isVisible} variant="slide" className="absolute bottom-16 left-12 z-40">
      <InfoCard
        icon={<PlateIcon name="arena" />}
        label="МЕСТО ПРОВЕДЕНИЯ"
        right={<LeagueMark game={game} size={44} />}
        style={{ width: 780 }}
      >
        <div className="truncate">
          <Display size={36}>{arena}</Display>
        </div>

        {(city || dateStr) && (
          <div className="flex items-center gap-3.5 mt-4">
            {city && <Label size={13} color={T.body} tracking="0.2em" weight={800}>{city}</Label>}
            {city && dateStr && <div className="rounded-full" style={{ width: 5, height: 5, backgroundColor: T.brdSoft }} />}
            {dateStr && <Label size={13} color={T.label} tracking="0.2em">{dateStr}</Label>}
          </div>
        )}
      </InfoCard>
    </Reveal>
  );
}
