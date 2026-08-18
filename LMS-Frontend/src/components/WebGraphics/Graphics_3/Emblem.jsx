import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { T, FONT_TEXT } from './theme';

// Знаки федерации: логотип лиги и блок принадлежности.

// Логотип лиги. Даём ему холодное свечение — тот же приём, что у .hero__logo
// на сайте (filter: drop-shadow(0 0 30px var(--headglow))).
export function LeagueMark({ game, size = 84, className = '', style = {} }) {
  const logo = getSafeUrl(game?.league_logo);
  if (!logo) return null;
  return (
    <img
      src={logo}
      alt=""
      className={`object-contain shrink-0 ${className}`}
      style={{ width: size, height: size, filter: `drop-shadow(0 0 26px ${T.glow})`, ...style }}
      onError={(e) => { e.target.style.display = 'none'; }}
    />
  );
}

// Логотип + название лиги в строку — блок принадлежности в шапках плашек.
export function LeagueBrand({ game, size = 76, align = 'left', maxWidth = 320, className = '' }) {
  const logo = getSafeUrl(game?.league_logo);
  const name = game?.league_name;
  if (!logo && !name) return null;

  return (
    <div className={`flex items-center gap-5 min-w-0 ${align === 'right' ? 'flex-row-reverse' : ''} ${className}`}>
      <LeagueMark game={game} size={size} />
      {/* Название лиги набрано не через <Label>: там жёсткий whitespace-nowrap,
          а официальное имя федерации обязано переноситься в несколько строк */}
      {name && (
        <span
          className={`uppercase ${align === 'right' ? 'text-right' : ''}`}
          style={{
            fontFamily: FONT_TEXT,
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '0.14em',
            lineHeight: 1.35,
            color: T.body,
            maxWidth,
          }}
        >
          {name}
        </span>
      )}
    </div>
  );
}
