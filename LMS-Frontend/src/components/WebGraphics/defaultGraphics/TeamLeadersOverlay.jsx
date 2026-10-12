// src/components/WebGraphics/defaultGraphics/TeamLeadersOverlay.jsx
//
// Лидеры команд: по краям — лучшие игроки хозяев и гостей в текущей категории,
// по центру — их статистика по всем категориям. Синяя плашка (кнопка TR)
// переезжает на текущую категорию, игроки сменяются вместе с ней.
import React, { useEffect, useState } from 'react';
import { Photo, Crest, Kicker, FitText, beat } from './kit';
import { Stage, BODY_H } from './Stage';
import { C, ACCENT_FILL, teamColor, teamInk, rgba } from './theme';

const CATEGORIES = [
  { key: 'points', label: 'Очки' },
  { key: 'goals', label: 'Голы' },
  { key: 'assists', label: 'Передачи' },
  { key: 'plus_minus', label: '+ / −' },
];

const ROW_H = 96;
const ROW_GAP = 10;

function bestBy(roster, key, fallback) {
  if (!Array.isArray(roster) || !roster.length) return fallback;
  const sorted = [...roster].sort((a, b) => (parseFloat(b[key]) || 0) - (parseFloat(a[key]) || 0));
  const best = sorted[0];
  if (best && (parseFloat(best[key]) !== 0 || key === 'plus_minus')) return best;
  return fallback || best;
}

const show = (v, key) => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (key === 'plus_minus' && n > 0) return `+${n}`;
  if (key === 'plus_minus' && n < 0) return `−${Math.abs(n)}`;
  return v;
};

function PlayerCard({ game, side, leader, active, leaving }) {
  const color = teamColor(game, side);
  const ink = teamInk(game, side);
  const right = side === 'away';
  const number = leader?.jersey_number;
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 40px',
      opacity: active ? 1 : 0,
      transform: active ? 'none' : leaving ? 'translateY(30px) scale(.97)' : 'translateY(-30px) scale(.97)',
      transition: 'opacity .55s ease, transform .75s cubic-bezier(.2,.8,.2,1)',
    }}>
      {number != null && number !== '' && (
        <div className="g2-num" style={{ position: 'absolute', top: 30, [right ? 'right' : 'left']: 34, fontSize: 170, fontWeight: 800, lineHeight: 1,
                                           color: 'transparent', WebkitBackgroundClip: 'text', backgroundClip: 'text',
                                           backgroundImage: `linear-gradient(180deg, ${rgba(ink, 0.36)} 0%, ${rgba(ink, 0.08)} 100%)`,
                                           opacity: 'calc(0.8 + var(--audio-level, 0) * 0.2)' }}>
          {number}
        </div>
      )}
      <div style={{ position: 'relative', ...beat(0.6) }}>
        <Photo url={leader?.avatar_url} style={{ width: 290, height: 290, borderRadius: 34, boxShadow: `inset 0 0 0 1px ${C.rimHi}, 0 24px 50px -14px rgba(0,0,0,.7)` }} />
        <div style={{ position: 'absolute', bottom: -30, [right ? 'left' : 'right']: -30 }}>
          <Crest url={game[`${side}_team_logo`]} size={108} />
        </div>
      </div>
      <div style={{ marginTop: 40, width: '100%', textAlign: 'center' }}>
        <FitText align="center" min={0.6} style={{ fontSize: 46, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.05, color: C.text }}>
          {leader?.last_name || 'Нет данных'}
        </FitText>
        <div style={{ marginTop: 10, fontSize: 28, fontWeight: 600, color: C.main }}>{leader?.first_name || ''}</div>
      </div>
    </div>
  );
}

export default function TeamLeadersOverlay({ game, overlay }) {
  const visible = overlay.visible && overlay.type === 'team_leaders';
  const [cat, setCat] = useState(0);
  const seconds = overlay.data?.switchDuration || 7;

  useEffect(() => {
    if (!visible) { setCat(0); return undefined; }
    const id = setInterval(() => setCat(c => (c + 1) % CATEGORIES.length), seconds * 1000);
    return () => clearInterval(id);
  }, [visible, seconds]);

  if (!game) return null;

  const home = CATEGORIES.map(c => bestBy(game.home_tournament_roster?.length ? game.home_tournament_roster : game.home_roster, c.key, game.home_leader));
  const away = CATEGORIES.map(c => bestBy(game.away_tournament_roster?.length ? game.away_tournament_roster : game.away_roster, c.key, game.away_leader));
  const prev = (cat - 1 + CATEGORIES.length) % CATEGORIES.length;
  const listH = CATEGORIES.length * ROW_H + (CATEGORIES.length - 1) * ROW_GAP;

  return (
    <Stage game={game} visible={visible} title="Лидеры команд" kicker={CATEGORIES[cat].label} glow={[teamColor(game, 'home'), teamColor(game, 'away')]}
           page={cat} pages={CATEGORIES.length}>
      <div style={{ display: 'flex', height: BODY_H }}>
        <div className="g2-rise" style={{ '--d': '280ms', position: 'relative', flex: 1, minWidth: 0 }}>
          {CATEGORIES.map((c, i) => <PlayerCard key={c.key} game={game} side="home" leader={home[i]} active={i === cat} leaving={i === prev} />)}
        </div>

        <div style={{ width: 560, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 20px' }}>
          <div className="g2-rise" style={{ '--d': '360ms', position: 'relative', height: listH }}>
            {/* Синяя плашка текущей категории */}
            <div style={{ position: 'absolute', left: 0, right: 0, height: ROW_H, borderRadius: 24, background: ACCENT_FILL,
                          boxShadow: `0 18px 40px -14px ${rgba(C.accent, 0.8)}`, transform: `translateY(${cat * (ROW_H + ROW_GAP)}px)`,
                          transition: 'transform .75s cubic-bezier(.2,.8,.2,1)' }} />
            {CATEGORIES.map((c, i) => {
              const on = i === cat;
              return (
                <div key={c.key} style={{ position: 'absolute', left: 0, right: 0, top: i * (ROW_H + ROW_GAP), height: ROW_H, display: 'flex', alignItems: 'center',
                                          padding: '0 30px', borderRadius: 24, boxShadow: on ? 'none' : `inset 0 0 0 1px ${C.rim}`, background: on ? 'transparent' : 'rgba(0,0,0,.18)' }}>
                  <span className="g2-num" style={{ width: 90, fontSize: 48, fontWeight: 800, color: on ? '#fff' : C.muted, transition: 'color .5s' }}>{show(home[cat]?.[c.key], c.key)}</span>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: on ? '#fff' : C.main, transition: 'color .5s' }}>{c.label}</span>
                  <span className="g2-num" style={{ width: 90, textAlign: 'right', fontSize: 48, fontWeight: 800, color: on ? '#fff' : C.muted, transition: 'color .5s' }}>{show(away[cat]?.[c.key], c.key)}</span>
                </div>
              );
            })}
          </div>
          <Kicker size={16} color={C.subtle} spacing="0.2em" style={{ textAlign: 'center', marginTop: 26 }}>
            {game.division_id ? 'Статистика турнира' : 'Статистика за команду'}
          </Kicker>
        </div>

        <div className="g2-rise" style={{ '--d': '320ms', position: 'relative', flex: 1, minWidth: 0 }}>
          {CATEGORIES.map((c, i) => <PlayerCard key={c.key} game={game} side="away" leader={away[i]} active={i === cat} leaving={i === prev} />)}
        </div>
      </div>
    </Stage>
  );
}
