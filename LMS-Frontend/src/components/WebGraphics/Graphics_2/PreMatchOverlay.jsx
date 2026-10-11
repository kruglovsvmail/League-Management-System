// src/components/WebGraphics/Graphics_2/PreMatchOverlay.jsx
//
// Перед матчем: эмблемы команд в плитках-иконках, между ними обратный отсчёт.
// Под интро плитки дышат в такт, от них расходятся контуры (TileRipple).
// Последняя минута отсчёта подсвечивается синим.
import React from 'react';
import { Crest, TileRipple, Kicker, FitText, useCountdown, beat } from './kit';
import { Stage, BODY_H } from './Stage';
import { C, ACCENT_FILL, teamColor, teamInk, countdown, rgba } from './theme';

function Team({ game, side, delay }) {
  const color = teamColor(game, side);
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 40px' }}>
      <div className="g2-pop" style={{ '--d': `${delay}ms`, position: 'relative' }}>
        <TileRipple tile={300} area={560} />
        <div style={beat(1)}>
          <Crest url={game[`${side}_team_logo`]} size={300} color={color} />
        </div>
      </div>
      <div className="g2-rise" style={{ '--d': `${delay + 160}ms`, marginTop: 44, width: '100%', textAlign: 'center' }}>
        <Kicker size={17} color={teamInk(game, side)} spacing="0.2em">{side === 'home' ? 'Хозяева' : 'Гости'}</Kicker>
        <FitText align="center" min={0.6} style={{ marginTop: 14, fontSize: 54, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.05, color: C.text }}>
          {game[`${side}_team_name`]}
        </FitText>
        <div style={{ width: 96, height: 6, borderRadius: 3, margin: '18px auto 0', background: color, boxShadow: `0 0 18px ${rgba(color, 0.6)}` }} />
        <div style={{ width: 96, height: 6, borderRadius: 3, margin: '18px auto 0', background: color, boxShadow: `0 0 18px ${rgba(color, 0.6)}` }} />
      </div>
    </div>
  );
}

export default function PreMatchOverlay({ game, overlay }) {
  const visible = overlay.visible && overlay.type === 'prematch';
  const left = useCountdown(visible, overlay.data);
  if (!game) return null;

  const paused = !!overlay.data?.isPaused;
  const hot = left <= 60 && !paused && left > 0;

  return (
    <Stage game={game} visible={visible} title="Скоро начало" kicker="Матч дня" glow={[teamColor(game, 'home'), teamColor(game, 'away')]}>
      <div style={{ display: 'flex', alignItems: 'stretch', height: BODY_H }}>
        <Team game={game} side="home" delay={260} />

        <div style={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
          <Kicker size={18} color={C.muted} spacing="0.2em" style={{ textAlign: 'center' }}>
            <span className="g2-rise" style={{ '--d': '380ms', display: 'inline-block' }}>До начала матча</span>
          </Kicker>

          <div className="g2-pop" style={{ '--d': '420ms', position: 'relative', padding: '26px 44px', borderRadius: 32,
                                             background: hot ? ACCENT_FILL : 'rgba(0,0,0,.34)',
                                             boxShadow: hot ? `0 0 0 1px ${rgba(C.skate, 0.5)}, 0 20px 60px -10px ${rgba(C.accent, 0.7)}` : `inset 0 2px 8px rgba(0,0,0,.5), inset 0 0 0 1px ${C.rim}`,
                                             transition: 'background .6s, box-shadow .6s' }}>
            <span className="g2-num" style={{ display: 'block', fontSize: 132, fontWeight: 800, lineHeight: 1, color: '#fff', minWidth: 290, textAlign: 'center',
                                               animation: paused ? 'g2Tick 1.6s ease-in-out infinite' : 'none' }}>
              {countdown(left)}
            </span>
          </div>

          <div className="g2-rise" style={{ '--d': '520ms', height: 24, fontSize: 17, fontWeight: 800, letterSpacing: '0.2em', color: C.muted }}>
            {paused ? 'ОТСЧЁТ НА ПАУЗЕ' : ''}
          </div>
        </div>

        <Team game={game} side="away" delay={340} />
      </div>
    </Stage>
  );
}
