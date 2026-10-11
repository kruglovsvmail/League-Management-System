// src/components/WebGraphics/Graphics_2/ScoreBarOverlay.jsx
//
// Табло по центру: развёрнутая версия углового — полные названия, эмблемы в
// плитках-иконках, крупный счёт, синий блок времени между цифрами и плитка
// лиги на верхней кромке.
//
// С угловым табло показывается взаимоисключающе: пока этот титр в эфире,
// Scoreboard прячется сам (FULLSCREEN в theme.js) — иначе счёт висел бы дважды.
import React from 'react';
import { Reveal, Blade, Crest, Img, SkateLines, FitText, Kicker, useGoalFlash } from './kit';
import {
  C, GRAPHITE, GRAPHITE_WIDE, ACCENT_FILL, LIFT, LIFT_SM, rgba, teamColor, teamShort, formatClock,
  periodRemaining, periodLong, strengthState, techScore, stageText, teamInk,
} from './theme';

const W = 1400;
const H = 132;
const SCORE_W = 112;
const CLOCK_W = 236;

function Side({ game, side }) {
  const right = side === 'away';
  const color = teamColor(game, side);
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 22, padding: '0 26px',
                  flexDirection: right ? 'row-reverse' : 'row',
                  background: `linear-gradient(${right ? 270 : 90}deg, ${rgba(color, 0.32)} 0%, ${rgba(color, 0.08)} 60%, transparent 100%)` }}>
      <div className="g2-pop" style={{ '--d': '220ms' }}>
        <Crest url={game[`${side}_team_logo`]} size={92} color={color} />
      </div>
      <div className="g2-slide" style={{ flex: 1, minWidth: 0, '--d': '300ms', textAlign: right ? 'right' : 'left' }}>
        <Kicker size={15} color={teamInk(game, side)} style={{ marginBottom: 8 }}>{right ? 'Гости' : 'Хозяева'}</Kicker>
        <FitText align={right ? 'right' : 'left'} style={{ fontSize: 36, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: 1.05, color: C.text }}>
          {game[`${side}_team_name`] || teamShort(game, side)}
        </FitText>
      </div>
    </div>
  );
}

function Score({ value, isTech, flash, flashKey, color }) {
  return (
    <div style={{ width: SCORE_W, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: C.ink, boxShadow: `inset 0 2px 6px rgba(0,0,0,.6), inset 0 0 0 1px ${C.rim}` }}>
      <span key={flash ? flashKey : 'idle'} className={`g2-num ${flash ? 'g2-score-pop' : ''}`}
            style={{ fontSize: 80, fontWeight: 800, lineHeight: 1, color: isTech ? C.dangerSoft : C.text,
                     textShadow: flash ? `0 0 26px ${rgba(color, 0.95)}, 0 0 60px ${rgba(color, 0.6)}` : 'none' }}>
        {value}
      </span>
    </div>
  );
}

function Chips({ rows, align }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
      {rows.map(p => (
        <div key={p.id} className="g2-drop" style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 14px 0 12px',
                                                   borderRadius: 10, background: C.ink, boxShadow: `inset 0 0 0 1px ${C.rim}, 0 10px 22px -8px rgba(0,0,0,.6)` }}>
          <span style={{ width: 4, height: 18, borderRadius: 2, background: C.danger, boxShadow: '0 0 8px rgba(220,38,38,.7)' }} />
          {p.player_last_name && <span style={{ fontSize: 16, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.player_last_name}</span>}
          <span className="g2-num" style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{formatClock(p.remaining)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ScoreBarOverlay({
  game, timerSeconds, currentPeriod, isTimerRunning, activePenalties, periodLength, otLength, overlay,
}) {
  const flash = useGoalFlash(game);
  if (!game) return null;

  const visible = overlay.visible && overlay.type === 'scorebar';
  const tech = techScore(game);
  const st = strengthState(game, activePenalties);
  const isSO = currentPeriod === 'SO';
  const division = game.division_name || game.division_short_name;
  const homeColor = teamColor(game, 'home');
  const awayColor = teamColor(game, 'away');

  let center = null;
  if (tech.isTech) {
    center = <div className="g2-drop" style={{ padding: '9px 20px', borderRadius: 10, background: C.danger, color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: '0.16em' }}>ТЕХНИЧЕСКИЙ РЕЗУЛЬТАТ</div>;
  } else if (st.label && !isSO) {
    center = (
      <div key={st.label + st.pp} className="g2-drop" style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 20px', borderRadius: 10, whiteSpace: 'nowrap',
        background: st.pp ? ACCENT_FILL : C.ink, boxShadow: st.pp ? '0 10px 22px -8px rgba(23,148,221,.7)' : `inset 0 0 0 1px ${C.rim}`,
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.14em', color: '#fff' }}>
          {st.pp ? `БОЛЬШИНСТВО · ${teamShort(game, st.pp)}` : 'НЕПОЛНЫЕ СОСТАВЫ'}
        </span>
        <span className="g2-num" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.04em', color: '#fff' }}>{st.label}</span>
      </div>
    );
  } else if (division) {
    center = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 20px', borderRadius: 10, background: GRAPHITE_WIDE, boxShadow: LIFT_SM }}>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.14em', color: C.main, textTransform: 'uppercase' }}>{division}</span>
        <span style={{ width: 4, height: 4, borderRadius: 2, background: C.skate }} />
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.14em', color: C.accentSoft, textTransform: 'uppercase' }}>{stageText(game)}</span>
      </div>
    );
  }

  return (
    <Reveal visible={visible} margin={90} inMs={820} blade={false}
            style={{ position: 'absolute', zIndex: 50, bottom: 56, left: (1920 - W) / 2, width: W }}>
      <div style={{ position: 'relative', height: H, marginTop: 50 }}>
        <div style={{ position: 'relative', display: 'flex', height: H, borderRadius: 26, overflow: 'hidden', background: GRAPHITE_WIDE, boxShadow: LIFT }}>
          <div className="g2-sheen" style={{ '--sheen': '8s', '--sheen-d': '2s' }} />
          <Blade offsetY={50} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: homeColor, zIndex: 2 }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 10, background: awayColor, zIndex: 2 }} />
          <SkateLines corner="tl" size={110} color={homeColor} tint={false} opacity={0.6} />
          <SkateLines corner="br" size={110} color={awayColor} tint={false} opacity={0.6} />

          <Side game={game} side="home" />
          <Score value={tech.home} isTech={tech.isTech} flash={flash.side === 'home'} flashKey={flash.stamp} color={homeColor} />

          <div style={{ position: 'relative', width: CLOCK_W, flexShrink: 0, background: ACCENT_FILL, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden', paddingTop: game.league_logo ? 30 : 0 }}>
            <SkateLines corner="br" size={70} color="#FFFFFF" width={2} tint={false} opacity={0.45} />
            <span className={isSO ? 'g2-loud' : 'g2-num'} style={{ fontSize: isSO ? 30 : 60, fontWeight: isSO ? 900 : 800, lineHeight: 1, color: '#fff',
                                               opacity: isTimerRunning || isSO ? 1 : 0.62 }}>
              {isSO ? 'БУЛЛИТЫ' : formatClock(periodRemaining({ currentPeriod, timerSeconds, periodLength, otLength }))}
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(255,255,255,.9)' }}>
              {isSO ? 'СЕРИЯ' : periodLong(currentPeriod)}
            </span>
          </div>

          <Score value={tech.away} isTech={tech.isTech} flash={flash.side === 'away'} flashKey={flash.stamp} color={awayColor} />
          <Side game={game} side="away" />
        </div>

        {/* Плитка лиги на верхней кромке, над временем */}
        {game.league_logo && (
          <div className="g2-pop" style={{ position: 'absolute', top: -46, left: W / 2 - 38, '--d': '160ms' }}>
            <div style={{ width: 76, height: 76, borderRadius: 18, background: GRAPHITE, boxShadow: LIFT,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              <SkateLines corner="br" size={44} width={2} />
              <Img url={game.league_logo} style={{ position: 'relative', width: 58, height: 58, objectFit: 'contain' }} />
            </div>
          </div>
        )}
      </div>

      {/* Под полосой: удаления под своей половиной, по центру одна метка */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16, marginTop: 12, minHeight: 38, padding: '0 18px' }}>
        <Chips rows={tech.isTech ? [] : st.home} align="left" />
        <div style={{ display: 'flex', justifyContent: 'center' }}>{center}</div>
        <Chips rows={tech.isTech ? [] : st.away} align="right" />
      </div>
    </Reveal>
  );
}
