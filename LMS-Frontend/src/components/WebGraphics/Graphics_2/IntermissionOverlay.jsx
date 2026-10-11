// src/components/WebGraphics/Graphics_2/IntermissionOverlay.jsx
//
// Перерыв: слева счёт с разбивкой по периодам, справа отсчёт до следующего
// периода и авторы шайб — карусель, по карточке на гол.
import React, { useEffect, useState } from 'react';
import { Crest, Photo, Img, Kicker, FitText, useCountdown } from './kit';
import { Stage, BODY_H } from './Stage';
import { C, NUM, ACCENT_FILL, teamColor, teamInk, countdown, eventStamp, rgba, techScore } from './theme';

const PERIOD_NAME = { 1: '1-й', 2: '2-й', 3: '3-й', OT: 'ОТ', SO: 'Бул' };

function phaseOf(timerSeconds, periodLength) {
  const len = (periodLength || 20) * 60;
  if (timerSeconds >= len * 3) return { title: 'Матч завершён', kicker: 'Итоговый счёт', next: 'До продолжения' };
  if (timerSeconds >= len * 2) return { title: 'Перерыв', kicker: 'После 2-го периода', next: 'До начала 3-го периода' };
  if (timerSeconds >= len) return { title: 'Перерыв', kicker: 'После 1-го периода', next: 'До начала 2-го периода' };
  return { title: 'Перерыв', kicker: null, next: 'До начала периода' };
}

function TeamRow({ game, side, score, isTech, delay }) {
  const color = teamColor(game, side);
  return (
    <div className="g2-slide" style={{ '--d': `${delay}ms`, position: 'relative', flex: 1, display: 'flex', alignItems: 'center', gap: 34, padding: '0 46px', overflow: 'hidden',
                                        background: `linear-gradient(90deg, ${rgba(color, 0.28)} 0%, ${rgba(color, 0.06)} 55%, transparent 85%)` }}>
      <Crest url={game[`${side}_team_logo`]} size={150} color={color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Kicker size={16} color={teamInk(game, side)} spacing="0.2em">{side === 'home' ? 'Хозяева' : 'Гости'}</Kicker>
        <FitText min={0.62} style={{ marginTop: 10, fontSize: 50, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.05, color: C.text }}>
          {game[`${side}_team_name`]}
        </FitText>
      </div>
      <span className="g2-num" style={{ fontSize: 150, fontWeight: 800, lineHeight: 0.9, color: isTech ? C.dangerSoft : C.text, minWidth: 120, textAlign: 'right' }}>{score}</span>
    </div>
  );
}

export default function IntermissionOverlay({ game, overlay, timerSeconds, periodLength }) {
  const visible = overlay.visible && overlay.type === 'intermission';
  const left = useCountdown(visible, overlay.data);
  const goals = [...(game?.goals || [])].sort((a, b) => a.time_seconds - b.time_seconds);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!visible || goals.length <= 1) { setIdx(0); return undefined; }
    const id = setInterval(() => setIdx(i => (i + 1) % goals.length), 3600);
    return () => clearInterval(id);
  }, [visible, goals.length]);

  if (!game) return null;

  const ph = phaseOf(timerSeconds || 0, periodLength);
  const tech = techScore(game);
  const periods = Object.entries(game.period_scores || {})
    .sort(([a], [b]) => (Number(a) || (a === 'OT' ? 4 : 5)) - (Number(b) || (b === 'OT' ? 4 : 5)));
  const paused = !!overlay.data?.isPaused;
  const hot = left <= 60 && left > 0 && !paused;

  const photoOf = (g) => {
    const roster = g.team_id === game.home_team_id ? game.home_roster : game.away_roster;
    return roster?.find(p => p.last_name === g.scorer_last_name && p.first_name === g.scorer_first_name)?.avatar_url;
  };

  return (
    <Stage game={game} visible={visible} title={ph.title} kicker={ph.kicker} glow={[teamColor(game, 'home'), teamColor(game, 'away')]}>
      <div style={{ display: 'flex', height: BODY_H }}>
        {/* ---------- СЧЁТ ---------- */}
        <div style={{ width: '58%', display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.divider}` }}>
          <TeamRow game={game} side="home" score={tech.home} isTech={tech.isTech} delay={260} />
          <div style={{ height: 1, margin: '0 46px', background: C.divider }} />
          <TeamRow game={game} side="away" score={tech.away} isTech={tech.isTech} delay={340} />

          {periods.length > 0 && (
            <div className="g2-rise" style={{ '--d': '480ms', display: 'flex', gap: 12, padding: '0 46px 34px' }}>
              {periods.map(([p, s]) => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderRadius: 14, background: 'rgba(0,0,0,.3)', boxShadow: `inset 0 0 0 1px ${C.rim}` }}>
                  <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.12em', color: C.accentSoft, textTransform: 'uppercase' }}>{PERIOD_NAME[p] || p}</span>
                  <span className="g2-num" style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{s?.home ?? 0} : {s?.away ?? 0}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---------- ОТСЧЁТ И АВТОРЫ ---------- */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '34px 44px 38px' }}>
          <div className="g2-pop" style={{ '--d': '360ms', position: 'relative', borderRadius: 28, padding: '24px 30px', overflow: 'hidden',
                                             background: hot ? ACCENT_FILL : 'rgba(0,0,0,.3)', boxShadow: hot ? `0 18px 50px -12px ${rgba(C.accent, 0.7)}` : `inset 0 0 0 1px ${C.rim}`,
                                             display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background .6s' }}>
            <div>
              <Kicker size={17} color={hot ? 'rgba(255,255,255,.9)' : C.muted} spacing="0.16em">{ph.next}</Kicker>
              {paused && <div style={{ marginTop: 10, fontSize: 16, fontWeight: 800, letterSpacing: '0.2em', color: C.subtle }}>НА ПАУЗЕ</div>}
            </div>
            <span className="g2-num" style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, color: '#fff' }}>{countdown(left)}</span>
          </div>

          <div className="g2-rise" style={{ '--d': '460ms', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '34px 0 16px' }}>
            <Kicker size={17} color={C.muted} spacing="0.2em">Авторы шайб</Kicker>
            {goals.length > 1 && (
              <div style={{ display: 'flex', gap: 6 }}>
                {goals.map((_, i) => (
                  <span key={i} style={{ width: i === idx ? 22 : 7, height: 7, borderRadius: 4, background: i === idx ? C.accent : 'rgba(255,255,255,.18)', transition: 'all .4s' }} />
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            {goals.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 24, border: `1px dashed ${C.divider}`,
                            fontSize: 20, fontWeight: 700, letterSpacing: '0.12em', color: C.subtle, textTransform: 'uppercase' }}>
                Шайб пока нет
              </div>
            ) : goals.map((g, i) => {
              const side = g.team_id === game.away_team_id ? 'away' : 'home';
              const active = i === idx;
              const prev = i === (idx - 1 + goals.length) % goals.length && goals.length > 1;
              const assists = [g.a1_last_name, g.a2_last_name].filter(Boolean);
              return (
                <div key={g.id || i} style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 28, padding: 22, borderRadius: 26,
                  background: 'rgba(0,0,0,.26)', boxShadow: `inset 0 0 0 1px ${C.rim}`,
                  opacity: active ? 1 : 0,
                  transform: active ? 'none' : prev ? 'translateX(-40px)' : 'translateX(40px)',
                  transition: 'opacity .55s ease, transform .7s cubic-bezier(.2,.8,.2,1)',
                }}>
                  <div style={{ position: 'relative', width: 188, height: 220, flexShrink: 0 }}>
                    <Photo url={photoOf(g)} style={{ width: '100%', height: '100%', borderRadius: 22 }} />
                    <div style={{ position: 'absolute', right: -14, bottom: -12, width: 64, height: 64, borderRadius: 16, background: C.g1, boxShadow: `inset 0 0 0 1px ${C.rimHi}, 0 8px 18px rgba(0,0,0,.5)`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Img url={game[`${side}_team_logo`]} style={{ width: 46, height: 46, objectFit: 'contain' }} />
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'inline-block', padding: '7px 12px', borderRadius: 9, background: ACCENT_FILL, fontSize: 18, fontWeight: 800, letterSpacing: '0.04em', color: '#fff', fontFamily: NUM }}>
                      {eventStamp(g.time_seconds, periodLength)}
                    </span>
                    <FitText min={0.6} style={{ marginTop: 16, fontSize: 40, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.05, color: C.text }}>{g.scorer_last_name}</FitText>
                    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 600, color: C.main }}>{g.scorer_first_name}</div>
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.divider}`, fontSize: 18, fontWeight: 700, color: assists.length ? C.main : C.subtle,
                                  letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {assists.length ? assists.join(' · ') : 'Без передач'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Stage>
  );
}
