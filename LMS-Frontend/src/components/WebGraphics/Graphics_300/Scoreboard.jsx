// src/components/WebGraphics/defaultGraphics/Scoreboard.jsx
//
// Угловое табло. Одна графитовая полоса: эмблема лиги, хозяева,
// гости и синий блок времени — синий как основная кнопка TR. Ячейка команды
// подкрашена её цветом слева направо. Цифры — Tektur, как на настоящем табло.
// Под полосой «висят» удаления своей команды и подпись большинства под временем.
//
// Гол: ячейку заливает цвет команды, по ней проходит лезвие, счёт подпрыгивает,
// а под табло на несколько секунд выпадает плашка «ГОЛ» цветом команды.
//
// В серии буллитов вместо времени — «БУЛЛИТЫ», под командами — попытки.
// При техническом результате под командами — красная плашка.
import React, { useEffect, useState } from 'react';
import { Reveal, Blade, Img, Crest, SkateLines, FitText, useGoalFlash } from './kit';
import {
  C, GRAPHITE_WIDE, ACCENT_FILL, LIFT, rgba, teamColor, teamShort, formatClock, periodRemaining,
  periodShort, strengthState, techScore, shootoutState, FULLSCREEN,
} from './theme';

const H = 70;          // высота полосы
const CELL = 246;      // ячейка команды
const CLOCK = 150;     // блок времени
const LEAGUE = 84;     // эмблема лиги

function ShotMark({ shot }) {
  if (!shot) {
    return <span style={{ width: 16, height: 16, borderRadius: 8, border: `2px solid ${C.subtle}` }} />;
  }
  const goal = shot.event_type === 'shootout_goal';
  return (
    <span style={{
      width: 18, height: 18, borderRadius: 9, background: goal ? C.success : C.danger,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 10px ${goal ? 'rgba(34,168,51,.55)' : 'rgba(220,38,38,.45)'}`,
    }}>
      <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {goal ? <path d="M2 5.2 4.1 7.2 8 3" /> : <path d="M2.6 2.6l4.8 4.8M7.4 2.6 2.6 7.4" />}
      </svg>
    </span>
  );
}

function TeamCell({ side, game, score, isTech, flash, flashKey, divider }) {
  const color = teamColor(game, side);
  const logo = game[`${side}_team_logo`];
  return (
    <div style={{ position: 'relative', width: CELL, height: H, display: 'flex', alignItems: 'center', overflow: 'hidden',
                  borderLeft: divider ? `1px solid ${C.divider}` : 'none' }}>
      {/* Цвет команды: полоса по кромке и подкраска ячейки, к счёту гаснет */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${rgba(color, 0.34)} 0%, ${rgba(color, 0.1)} 55%, transparent 80%)` }} />
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 7, background: color }} />

      {/* Гол: цвет команды заливает ячейку слева, следом проходит лезвие */}
      {flash && (
        <React.Fragment key={flashKey}>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${rgba(color, 0.75)} 0%, ${rgba(color, 0.25)} 70%, transparent 100%)`,
                        animation: 'g2Wash 2.8s cubic-bezier(.2,.8,.2,1) both' }} />
          <div style={{ position: 'absolute', top: -10, bottom: -10, width: 6, background: '#BFE6FF', transform: 'skewX(-45deg)',
                        boxShadow: '0 0 18px 6px rgba(67,181,245,.55)', animation: 'g2Slice 900ms cubic-bezier(.4,0,.2,1) both' }} />
        </React.Fragment>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 20, flex: 1, minWidth: 0 }}>
        <div style={{ width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Img url={logo} style={{ maxWidth: 50, maxHeight: 50, objectFit: 'contain', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.45))' }} />
        </div>
        <FitText style={{ flex: 1, minWidth: 0, fontSize: 27, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: C.text, lineHeight: 1 }}>
          {teamShort(game, side)}
        </FitText>
      </div>

      <div style={{
        position: 'relative', width: 64, height: 56, marginRight: 7, borderRadius: 13, flexShrink: 0, overflow: 'hidden',
        background: C.ink, boxShadow: `inset 0 1px 2px rgba(0,0,0,.6), inset 0 0 0 1px ${C.rim}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: color }} />
        <span
          key={flash ? flashKey : 'idle'}
          className={`g2-num ${flash ? 'g2-score-pop' : ''}`}
          style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: isTech ? C.dangerSoft : C.text,
                   textShadow: flash ? `0 0 18px ${rgba(color, 0.9)}, 0 0 36px ${rgba(color, 0.6)}` : 'none' }}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

function PenaltyChip({ p }) {
  return (
    <div className="g2-drop" style={{
      display: 'flex', alignItems: 'center', gap: 9, height: 34, padding: '0 13px 0 11px', borderRadius: 10,
      background: C.ink, boxShadow: `inset 0 0 0 1px ${C.rim}, 0 8px 18px -6px rgba(0,0,0,.6)`,
    }}>
      <span style={{ width: 4, height: 18, borderRadius: 2, background: C.danger, boxShadow: '0 0 8px rgba(220,38,38,.7)' }} />
      {p.player_number != null && p.player_number !== '' && (
        <span className="g2-num" style={{ fontSize: 15, fontWeight: 800, color: C.muted }}>#{p.player_number}</span>
      )}
      <span className="g2-num" style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1 }}>{formatClock(p.remaining)}</span>
    </div>
  );
}

export default function Scoreboard({
  game, events = [], soLength = 3, timerSeconds, currentPeriod, isTimerRunning,
  activePenalties, periodLength, otLength, overlay, isScoreboardVisible,
}) {
  const flash = useGoalFlash(game);

  // Под полноэкранными плашками табло прячется; возвращается с задержкой,
  // чтобы не мигнуть в промежутке между двумя плашками.
  const fullscreen = overlay?.visible && FULLSCREEN.includes(overlay?.type);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (fullscreen) { setHidden(true); return undefined; }
    const t = setTimeout(() => setHidden(false), 600);
    return () => clearTimeout(t);
  }, [fullscreen]);

  const visible = isScoreboardVisible && !hidden;
  const tech = techScore(game);
  const st = strengthState(game, activePenalties);
  const isSO = currentPeriod === 'SO';
  const so = isSO ? shootoutState(game, events, currentPeriod, soLength) : null;
  const ppShort = st.pp ? teamShort(game, st.pp) : null;
  const flashColor = flash.side ? teamColor(game, flash.side) : null;

  const clock = isSO ? null : formatClock(periodRemaining({ currentPeriod, timerSeconds, periodLength, otLength }));

  return (
    <Reveal visible={visible} margin={70} blade={false} style={{ position: 'absolute', zIndex: 50, top: 40, left: 48 }}>
      {/* ---------- ПОЛОСА ---------- */}
      <div style={{ position: 'relative', display: 'flex', height: H, borderRadius: 18, overflow: 'hidden', background: GRAPHITE_WIDE, boxShadow: LIFT }}>
        <div className="g2-sheen" style={{ '--sheen': '9s', '--sheen-d': '3s' }} />
        <Blade />

        {/* Эмблема лиги — без плитки, почти во всю высоту полосы */}
        <div style={{ position: 'relative', width: LEAGUE, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Crest url={game.league_logo} size={62} />
        </div>

        <TeamCell side="home" game={game} score={tech.home} isTech={tech.isTech} divider
                  flash={flash.side === 'home'} flashKey={flash.stamp} />
        <TeamCell side="away" game={game} score={tech.away} isTech={tech.isTech} divider
                  flash={flash.side === 'away'} flashKey={flash.stamp} />

        {/* Время — синий блок, как основная кнопка TR */}
        <div style={{ position: 'relative', width: CLOCK, height: H, background: ACCENT_FILL, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 5, overflow: 'hidden' }}>
          <SkateLines corner="br" size={48} width={2} color="#FFFFFF" tint={false} opacity={0.5} />
          {isSO ? (
            <span className="g2-loud" style={{ fontSize: 20, color: '#fff' }}>БУЛЛИТЫ</span>
          ) : (
            <span className="g2-num" style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, color: '#fff',
                                               opacity: isTimerRunning ? 1 : 0.62, transition: 'opacity .3s' }}>
              {clock}
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(255,255,255,.9)', lineHeight: 1 }}>
            {isSO ? 'СЕРИЯ' : periodShort(currentPeriod)}
          </span>
        </div>
      </div>

      {/* ---------- ПОД ПОЛОСОЙ ---------- */}
      <div style={{ display: 'flex', marginTop: 6, minHeight: 0 }}>
        <div style={{ width: LEAGUE, flexShrink: 0 }} />

        {flash.side ? (
          // Плашка «ГОЛ» под забившей командой, на время вспышки
          <div style={{ width: CELL * 2, display: 'flex', justifyContent: flash.side === 'home' ? 'flex-start' : 'flex-end' }}>
            <div key={flash.stamp} className="g2-drop" style={{
              width: CELL, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              background: `linear-gradient(180deg, #FFFFFF33 0%, #FFFFFF00 100%), linear-gradient(90deg, ${rgba(flashColor, 0.72)} 0%, ${flashColor} 100%), ${C.ink}`,
              boxShadow: `0 10px 24px -8px ${rgba(flashColor, 0.8)}`,
            }}>
              <span className="g2-loud" style={{ fontSize: 22, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.35)' }}>ГОЛ!</span>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.12em', color: 'rgba(255,255,255,.92)' }}>{teamShort(game, flash.side)}</span>
            </div>
          </div>
        ) : tech.isTech ? (
          <div className="g2-drop" style={{ width: CELL * 2, display: 'flex', justifyContent: 'center' }}>
            <div style={{ padding: '8px 18px', borderRadius: 10, background: C.danger, color: '#fff', fontSize: 15, fontWeight: 800,
                          letterSpacing: '0.16em', boxShadow: '0 8px 18px -6px rgba(220,38,38,.6)' }}>
              ТЕХНИЧЕСКИЙ РЕЗУЛЬТАТ
            </div>
          </div>
        ) : (
          ['home', 'away'].map(side => (
            <div key={side} style={{ width: CELL, display: 'flex', gap: 6, paddingLeft: 10 }}>
              {isSO ? (
                <div className="g2-drop" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 10,
                                                   background: C.ink, boxShadow: `inset 0 0 0 1px ${C.rim}` }}>
                  {Array.from({ length: so.slots }).map((_, i) => <ShotMark key={i} shot={so[side][i]} />)}
                </div>
              ) : (
                st[side].map(p => <PenaltyChip key={p.id} p={p} />)
              )}
            </div>
          ))
        )}

        {!tech.isTech && !isSO && st.label && (
          <div style={{ width: CLOCK, display: 'flex', justifyContent: 'center' }}>
            <div key={st.label + (ppShort || '')} className="g2-drop" style={{
              height: 34, padding: '0 12px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              background: st.pp ? ACCENT_FILL : C.ink, boxShadow: st.pp ? '0 8px 18px -6px rgba(23,148,221,.6)' : `inset 0 0 0 1px ${C.rim}`,
            }}>
              {ppShort && <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', color: 'rgba(255,255,255,.9)' }}>{ppShort}</span>}
              <span className="g2-num" style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.04em', color: '#fff' }}>{st.label}</span>
            </div>
          </div>
        )}
      </div>
    </Reveal>
  );
}
