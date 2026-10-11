// src/components/WebGraphics/Graphics_2/TournamentOverlay.jsx
//
// Турнир: турнирная таблица дивизиона или сетка плей-офф (режим — из панели,
// по умолчанию по стадии матча). Команды этого матча подсвечены своими
// цветами, пара этого матча в сетке — синей рамкой TR.
import React from 'react';
import { Img, Kicker, Page } from './kit';
import { Stage, StageEmpty, BODY_H, STAGE } from './Stage';
import { tournamentMode, tournamentPages, sameId } from '../broadcastConfig';
import { C, ACCENT_FILL, teamColor, rgba } from './theme';

const COLS = [
  { key: 'games_played', label: 'И' }, { key: 'wins_reg', label: 'В' }, { key: 'wins_ot', label: 'ВО' },
  { key: 'draws', label: 'Н' }, { key: 'losses_ot', label: 'ПО' }, { key: 'losses_reg', label: 'П' },
];

function Standings({ rows, game }) {
  const rowH = Math.min(64, Math.floor((BODY_H - 110) / Math.max(1, rows.length)));
  const font = Math.min(24, Math.round(rowH * 0.4));
  const grid = '70px minmax(0, 1fr) repeat(6, 74px) 130px 84px 96px';
  return (
    <div style={{ padding: '26px 46px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: grid, alignItems: 'center', height: 40, padding: '0 14px',
                    fontSize: 15, fontWeight: 800, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase' }}>
        <span style={{ textAlign: 'center' }}>М</span><span style={{ paddingLeft: 12 }}>Команда</span>
        {COLS.map(c => <span key={c.key} style={{ textAlign: 'center' }}>{c.label}</span>)}
        <span style={{ textAlign: 'center' }}>Шайбы</span><span style={{ textAlign: 'center' }}>±</span><span style={{ textAlign: 'center', color: C.accentSoft }}>Очки</span>
      </div>
      {rows.map((r, i) => {
        const home = sameId(r.team_id, game.home_team_id);
        const away = sameId(r.team_id, game.away_team_id);
        const color = home ? teamColor(game, 'home') : away ? teamColor(game, 'away') : null;
        return (
          <div key={r.team_id} className="g2-slide" style={{
            '--d': `${260 + i * 40}ms`, display: 'grid', gridTemplateColumns: grid, alignItems: 'center', height: rowH, padding: '0 14px', marginTop: 4,
            borderRadius: 14, fontSize: font, fontWeight: 700, color: color ? C.text : C.main,
            background: color ? rgba(color, 0.16) : i % 2 ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.14)',
            boxShadow: color ? `inset 4px 0 0 ${color}, inset 0 0 0 1px ${rgba(color, 0.35)}` : 'none',
          }}>
            <span className="g2-num" style={{ textAlign: 'center', fontWeight: 800 }}>{r.rank}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 12, minWidth: 0 }}>
              <span style={{ width: rowH * 0.62, height: rowH * 0.62, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Img url={r.logo_url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </span>
              <span style={{ fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.team_name}</span>
            </span>
            {COLS.map(c => <span key={c.key} className="g2-num" style={{ textAlign: 'center', color: color ? C.text : C.muted }}>{r[c.key] ?? '—'}</span>)}
            <span className="g2-num" style={{ textAlign: 'center', color: color ? C.text : C.muted, whiteSpace: 'nowrap' }}>{r.goals_for}–{r.goals_against}</span>
            <span className="g2-num" style={{ textAlign: 'center', color: C.muted }}>{Number(r.goals_diff) > 0 ? '+' : ''}{r.goals_diff}</span>
            <span className="g2-num" style={{ textAlign: 'center', fontSize: font * 1.2, fontWeight: 800, color: C.text }}>{r.points}</span>
          </div>
        );
      })}
    </div>
  );
}

function Playoff({ rounds, game, bracket, brackets }) {
  const width = STAGE.width - 92;
  const height = BODY_H - 150;
  const colW = width / Math.max(1, rounds.length);
  const all = (brackets || [bracket]).flatMap(b => (b.rounds || []).flatMap(r => r.matchups || []));
  const pos = new Map();
  rounds.forEach((round, column) => {
    round.matchups.forEach((m, row) => {
      const parents = ['team1', 'team2'].map(s => pos.get(String(m[`${s}_source_id`]))).filter(Boolean);
      const y = parents.length ? parents.reduce((a, p) => a + p.y, 0) / parents.length : (row + 0.5) * height / round.matchups.length;
      const cardH = Math.min(112, height / Math.max(1, round.matchups.length) - 12);
      pos.set(String(m.id), { column, y, cardH });
    });
  });

  const lines = [];
  for (const round of rounds) for (const m of round.matchups) {
    const to = pos.get(String(m.id));
    ['team1', 'team2'].forEach((s, slot) => {
      if (!['winner_of', 'loser_of'].includes(m[`${s}_source_type`])) return;
      const from = pos.get(String(m[`${s}_source_id`]));
      if (!from || from.column >= to.column) return;
      const x1 = (from.column + 1) * colW - 18; const x2 = to.column * colW + 18;
      const ty = to.y + (slot ? 1 : -1) * to.cardH / 4;
      lines.push(<path key={`${m.id}:${s}`} d={`M ${x1} ${from.y} H ${(x1 + x2) / 2} V ${ty} H ${x2}`} fill="none"
                       stroke="rgba(255,255,255,.2)" strokeWidth="2" strokeDasharray={m[`${s}_source_type`] === 'loser_of' ? '6 5' : undefined} />);
    });
  }

  const sourceName = (m, s) => {
    const type = m[`${s}_source_type`]; const id = m[`${s}_source_id`];
    const parent = all.find(x => sameId(x.id, id));
    if (type === 'seed') return `Посев № ${id || '?'}`;
    if (type === 'winner_of' || type === 'loser_of') return `${type === 'winner_of' ? 'Победитель' : 'Проигравший'} пары ${parent?.matchup_number || '?'}`;
    return 'Определится позже';
  };

  return (
    <div style={{ padding: '20px 46px 0' }}>
      <div style={{ display: 'flex', height: 64 }}>
        {rounds.map(r => (
          <div key={r.id} style={{ width: colW, textAlign: 'center', padding: '0 12px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text }}>{r.name || `Раунд ${r.order_index}`}</div>
            {!!r.wins_needed && <Kicker size={15} color={C.muted} spacing="0.14em" style={{ marginTop: 6 }}>До {r.wins_needed} побед</Kicker>}
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', width, height }}>
        <svg style={{ position: 'absolute', inset: 0 }} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>{lines}</svg>
        {rounds.flatMap(r => r.matchups.map((m, mi) => {
          const p = pos.get(String(m.id));
          const active = (sameId(m.team1_id, game.home_team_id) && sameId(m.team2_id, game.away_team_id))
            || (sameId(m.team2_id, game.home_team_id) && sameId(m.team1_id, game.away_team_id));
          const fs = Math.min(19, Math.max(10, p.cardH / 4.4));
          return (
            <div key={m.id} className="g2-pop" style={{
              '--d': `${260 + p.column * 120 + mi * 40}ms`, position: 'absolute', left: p.column * colW + 18, width: colW - 36, top: p.y - p.cardH / 2, height: p.cardH,
              borderRadius: 16, overflow: 'hidden', background: active ? 'rgba(23,148,221,.14)' : 'rgba(0,0,0,.32)',
              boxShadow: active ? `inset 0 0 0 2px ${C.accent}, 0 12px 34px -10px ${rgba(C.accent, 0.8)}` : `inset 0 0 0 1px ${C.rim}`,
            }}>
              {['team1', 'team2'].map((s, k) => {
                const known = m[`${s}_id`] != null;
                const won = m.winner_id != null && sameId(m.winner_id, m[`${s}_id`]);
                const lost = m.winner_id != null && known && !won;
                return (
                  <div key={s} style={{ height: '50%', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderTop: k ? `1px solid ${C.divider}` : 'none' }}>
                    <span style={{ width: Math.min(30, p.cardH / 3), height: Math.min(30, p.cardH / 3), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Img url={m[`${s}_logo`]} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: fs, fontWeight: 800, textTransform: known ? 'uppercase' : 'none', lineHeight: 1.1,
                                   color: !known ? C.subtle : lost ? C.muted : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m[`${s}_name`] || sourceName(m, s)}
                    </span>
                    <span className="g2-num" style={{ minWidth: 30, height: Math.min(30, p.cardH / 2.6), borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                       fontSize: Math.min(22, p.cardH / 4), fontWeight: 800, color: won ? '#fff' : C.muted, background: won ? ACCENT_FILL : 'transparent' }}>
                      {known ? (m[`${s}_wins`] ?? 0) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        }))}
      </div>
    </div>
  );
}

export default function TournamentOverlay({ game, overlay, broadcast }) {
  const visible = overlay.visible && overlay.type === 'tournament';
  const mode = tournamentMode(game, overlay.data);
  const cur = tournamentPages(game, broadcast?.data, overlay.data)[0];
  const title = mode === 'playoff' ? 'Сетка плей-офф' : 'Турнирная таблица';
  const kicker = mode === 'playoff' ? cur?.bracket?.name : (game.division_name || game.division_short_name);

  return (
    <Stage game={game} visible={visible} title={title} kicker={kicker}>
      {!cur ? <StageEmpty loading={broadcast?.loading} error={broadcast?.error} /> : (
        <Page pageKey={`${mode}:${cur.bracket?.id || ''}`} style={{ height: BODY_H }}>
          {mode === 'playoff'
            ? <Playoff rounds={cur.rounds} bracket={cur.bracket} brackets={broadcast?.data?.brackets} game={game} />
            : <Standings rows={cur.rows} game={game} />}
        </Page>
      )}
    </Stage>
  );
}
