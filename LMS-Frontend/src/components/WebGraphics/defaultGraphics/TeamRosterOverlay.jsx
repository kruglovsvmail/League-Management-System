// src/components/WebGraphics/defaultGraphics/TeamRosterOverlay.jsx
//
// Состав команды списком: слева эмблема и название, справа два столбца —
// вратари с защитниками и нападающие. Команды сменяются по очереди через
// switchDuration. Высота строки подбирается под самый длинный столбец, чтобы
// и короткий, и длинный состав стояли во всю высоту без обрезки.
import React, { useEffect, useState } from 'react';
import { Crest, TileRipple, Kicker, FitText, beat } from './kit';
import { Stage, BODY_H } from './Stage';
import { C, ACCENT_FILL, teamColor, teamInk, rgba } from './theme';

const isTrue = v => v === true || v === 'true';

const ROW_MAX = 54;
const ROW_MIN = 30;
const GROUP_HEAD = 40;   // надстрочник группы с отступом
const GROUP_GAP = 20;    // между группами

function Row({ p, color, delay, h }) {
  const captain = isTrue(p.is_captain);
  const assistant = isTrue(p.is_assistant);
  const k = h / ROW_MAX;
  const badge = Math.round(30 * Math.max(0.75, k));
  return (
    <div className="g2-slide" style={{ '--d': `${delay}ms`, display: 'flex', alignItems: 'center', gap: 14, height: h }}>
      <span className="g2-num" style={{ width: Math.round(50 * Math.max(0.8, k)), height: Math.round(h * 0.8), borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                         background: 'rgba(0,0,0,.34)', boxShadow: `inset 0 0 0 1px ${C.rim}, inset 3px 0 0 ${rgba(color, 0.9)}`,
                                         fontSize: Math.round(21 * Math.max(0.8, k)), fontWeight: 800, color: C.text }}>
        {p.jersey_number ?? '—'}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 10, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ fontSize: Math.round(24 * Math.max(0.78, k)), fontWeight: 800, textTransform: 'uppercase', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.last_name}</span>
        <span style={{ fontSize: Math.round(19 * Math.max(0.86, k)), fontWeight: 600, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.first_name}</span>
      </div>
      {captain && <span style={{ width: badge, height: badge, borderRadius: 8, background: ACCENT_FILL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0 }}>К</span>}
      {assistant && <span style={{ width: badge, height: badge, borderRadius: 8, boxShadow: `inset 0 0 0 2px ${C.accentSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: C.accentSoft, flexShrink: 0 }}>А</span>}
    </div>
  );
}

function Group({ title, players, color, start, h }) {
  if (!players.length) return null;
  return (
    <div style={{ marginBottom: GROUP_GAP }}>
      <div className="g2-rise" style={{ '--d': `${start}ms`, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <Kicker size={16} color={C.accentSoft} spacing="0.2em">{title}</Kicker>
        <span style={{ flex: 1, height: 1, background: C.divider }} />
        <span className="g2-num" style={{ fontSize: 17, fontWeight: 800, color: C.subtle }}>{players.length}</span>
      </div>
      {players.map((p, i) => <Row key={p.player_id || p.id || `${p.jersey_number}_${p.last_name}`} p={p} color={color} h={h} delay={start + 60 + i * 28} />)}
    </div>
  );
}

export default function TeamRosterOverlay({ game, overlay }) {
  const visible = overlay.visible && overlay.type === 'team_roster' && overlay.data?.rosterView !== 'lines';
  const [side, setSide] = useState('home');
  const [fading, setFading] = useState(false);
  const seconds = overlay.data?.switchDuration || 10;

  useEffect(() => {
    if (!visible) { setSide('home'); setFading(false); return undefined; }
    let t;
    const id = setInterval(() => {
      setFading(true);
      t = setTimeout(() => { setSide(s => (s === 'home' ? 'away' : 'home')); setFading(false); }, 380);
    }, seconds * 1000);
    return () => { clearInterval(id); clearTimeout(t); };
  }, [visible, seconds]);

  if (!game) return null;

  const color = teamColor(game, side);
  const roster = (side === 'home' ? game.home_roster : game.away_roster) || [];
  const coach = side === 'home' ? game.home_coach : game.away_coach;
  const goalies = roster.filter(p => p.position_in_line === 'G');
  const defense = roster.filter(p => p.position_in_line === 'LD' || p.position_in_line === 'RD');
  const forwards = roster.filter(p => ['LW', 'C', 'RW'].includes(p.position_in_line));
  const other = roster.filter(p => !['G', 'LD', 'RD', 'LW', 'C', 'RW'].includes(p.position_in_line));

  // Высота строки — по самому «длинному» столбцу: строки плюс заголовки групп
  const PAD = 34;
  const avail = BODY_H - PAD * 2;
  const need = (groups) => {
    const filled = groups.filter(g => g.length);
    return { rows: filled.reduce((n, g) => n + g.length, 0), heads: filled.length };
  };
  const rowFor = ({ rows, heads }) => (rows ? (avail - heads * (GROUP_HEAD + GROUP_GAP)) / rows : ROW_MAX);
  const h = Math.floor(Math.max(ROW_MIN, Math.min(ROW_MAX,
    rowFor(need([goalies, defense, other])), rowFor(need([forwards])))));

  const fade = { opacity: fading ? 0 : 1, transform: fading ? 'translateX(24px)' : 'none', transition: 'opacity .38s ease, transform .38s ease' };

  return (
    <Stage game={game} visible={visible} title="Состав команды" kicker={side === 'home' ? 'Хозяева' : 'Гости'} glow={[color, color]}
           page={side === 'home' ? 0 : 1} pages={2}>
      <div key={side} style={{ display: 'flex', height: BODY_H }}>
        {/* ---------- Команда ---------- */}
        <aside style={{ width: 520, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 46px',
                        borderRight: `1px solid ${C.divider}`, ...fade }}>
          <div className="g2-pop" style={{ '--d': '240ms', position: 'relative' }}>
            <TileRipple tile={250} area={480} />
            <div style={beat(1)}><Crest url={game[`${side}_team_logo`]} size={250} /></div>
          </div>
          <div className="g2-rise" style={{ '--d': '360ms', width: '100%', marginTop: 40, textAlign: 'center' }}>
            <Kicker size={17} color={teamInk(game, side)} spacing="0.2em">{side === 'home' ? 'Хозяева' : 'Гости'}</Kicker>
            <FitText align="center" min={0.6} style={{ marginTop: 12, fontSize: 46, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.05, color: C.text }}>
              {game[`${side}_team_name`]}
            </FitText>
          </div>
          {coach && (
            <div className="g2-rise" style={{ '--d': '440ms', marginTop: 34, width: '100%', padding: '18px 22px', borderRadius: 20, background: 'rgba(0,0,0,.28)',
                                                boxShadow: `inset 0 0 0 1px ${C.rim}, inset 4px 0 0 ${C.accent}` }}>
              <Kicker size={16} color={C.muted} spacing="0.2em">Главный тренер</Kicker>
              <div style={{ marginTop: 8, fontSize: 26, fontWeight: 800, textTransform: 'uppercase', color: C.text }}>{coach.last_name}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.muted, marginTop: 2 }}>{coach.first_name}</div>
            </div>
          )}
        </aside>

        {/* ---------- Игроки ---------- */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 60, padding: `${PAD}px 46px`, ...fade }}>
          {roster.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, letterSpacing: '0.14em', color: C.subtle, textTransform: 'uppercase' }}>
              Состав не заполнен
            </div>
          ) : (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Group title="Вратари" players={goalies} color={color} start={300} h={h} />
                <Group title="Защитники" players={defense} color={color} start={360} h={h} />
                <Group title="Без позиции" players={other} color={color} start={420} h={h} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Group title="Нападающие" players={forwards} color={color} start={380} h={h} />
              </div>
            </>
          )}
        </div>
      </div>
    </Stage>
  );
}
