import React from 'react';
import { BroadcastFrame, BroadcastEmpty, BroadcastImage, BroadcastPage } from './BroadcastFrame';
import { tournamentMode, tournamentPages, sameId } from '../broadcastConfig';
function Playoff({
  rounds,
  game,
  bracket,
  brackets
}) {
  const width = 1436,
    height = 590,
    columnWidth = width / Math.max(1, rounds.length);
  const allMatches = (brackets || [bracket]).flatMap(b => (b.rounds || []).flatMap(r => r.matchups || []));
  const positions = new Map();
  rounds.forEach((round, column) => {
    round.matchups.forEach((match, row) => {
      const parents = ['team1', 'team2'].map(side => positions.get(String(match[`${side}_source_id`]))).filter(Boolean);
      const y = parents.length ? parents.reduce((sum, p) => sum + p.y, 0) / parents.length : (row + .5) * height / round.matchups.length;
      const cardHeight = Math.min(104, height / Math.max(1, round.matchups.length) - 8);
      positions.set(String(match.id), {
        column,
        y,
        cardHeight
      });
    });
  });
  const connectors = [];
  for (const round of rounds) for (const match of round.matchups) {
    const to = positions.get(String(match.id));
    for (const [slot, side] of ['team1', 'team2'].entries()) {
      if (!['winner_of', 'loser_of'].includes(match[`${side}_source_type`])) continue;
      const from = positions.get(String(match[`${side}_source_id`]));
      if (!from || from.column >= to.column) continue;
      const x1 = (from.column + 1) * columnWidth - 14,
        x2 = to.column * columnWidth + 14;
      const targetY = to.y + (slot ? 1 : -1) * to.cardHeight / 4;
      connectors.push(<path key={`${match.id}:${side}`} d={`M ${x1} ${from.y} H ${(x1 + x2) / 2} V ${targetY} H ${x2}`} fill="none" stroke="#52525b" strokeWidth="2" strokeDasharray={match[`${side}_source_type`] === 'loser_of' ? '5 4' : undefined} />);
    }
  }
  const sourceName = (match, side) => {
    const type = match[`${side}_source_type`],
      id = match[`${side}_source_id`];
    const parent = allMatches.find(m => sameId(m.id, id));
    if (type === 'seed') return `Посев № ${id || '?'}`;
    if (type === 'winner_of' || type === 'loser_of') return `${type === 'winner_of' ? 'Победитель' : 'Проигравший'} пары ${parent?.matchup_number || '?'}`;
    return 'Участник не определён';
  };
  return <div className="px-8 pt-4 h-full">
    <div className="text-center text-zinc-500 text-[16px] uppercase tracking-widest font-bold mb-4">{bracket.name}</div>
    <div className="flex h-[64px]">
      {rounds.map(round => <div key={round.id} style={{
        width: columnWidth
      }} className="text-center uppercase text-zinc-400 font-black text-[19px] px-2">
        <div className="line-clamp-2">{round.name || `Раунд ${round.order_index}`}</div>
        {!!round.wins_needed && <div className="text-[11px] mt-1 text-zinc-600">До {round.wins_needed} побед</div>}
      </div>)}
    </div>
    <div className="relative" style={{
      width,
      height
    }}>
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${width} ${height}`}>{connectors}</svg>
      {rounds.flatMap(round => round.matchups.map(match => {
        const p = positions.get(String(match.id));
        const active = sameId(match.team1_id, game.home_team_id) && sameId(match.team2_id, game.away_team_id) || sameId(match.team2_id, game.home_team_id) && sameId(match.team1_id, game.away_team_id);
        const fontSize = Math.min(19, Math.max(8, p.cardHeight / 4));
        return <div key={match.id} className={`absolute rounded-xl border bg-zinc-950 overflow-hidden ${active ? 'border-orange' : 'border-zinc-700'}`} style={{
          left: p.column * columnWidth + 14,
          width: columnWidth - 28,
          top: p.y - p.cardHeight / 2,
          height: p.cardHeight
        }}>
          {['team1', 'team2'].map(side => <div key={side} className={`h-1/2 flex items-center gap-2 px-2 first:border-b border-zinc-800 ${sameId(match.winner_id, match[`${side}_id`]) ? 'bg-white/5' : ''}`}>
            <div className="shrink-0" style={{
              width: Math.min(30, p.cardHeight / 3),
              height: Math.min(30, p.cardHeight / 3)
            }}>
              <BroadcastImage url={match[`${side}_logo`]} className="w-full h-full object-contain" />
            </div>
            <span className="min-w-0 flex-1 text-white font-black uppercase leading-tight line-clamp-2" style={{
              fontSize
            }}>{match[`${side}_name`] || sourceName(match, side)}</span>
            <span className="text-white font-mono font-black shrink-0" style={{
              fontSize: Math.min(28, p.cardHeight / 3)
            }}>{match[`${side}_id`] == null ? '—' : match[`${side}_wins`] ?? 0}</span>
          </div>)}
        </div>;
      }))}
    </div>
  </div>;
}
function Standings({
  rows,
  game
}) {
  const rowHeight = Math.min(68, 620 / Math.max(1, rows.length)),
    font = Math.min(26, rowHeight * .42);
  return <div className="px-8 py-5 h-full">
    <div className="text-center text-zinc-500 font-bold uppercase text-[18px] tracking-widest mb-4">{game.division_name}</div>
    <table className="w-full border-collapse text-white table-fixed">
      <colgroup><col style={{
          width: '5%'
        }} /><col style={{
          width: '30%'
        }} />{Array.from({
          length: 6
        }, (_, i) => <col key={i} style={{
          width: '6%'
        }} />)}
        <col style={{
          width: '12%'
        }} /><col style={{
          width: '8%'
        }} /><col style={{
          width: '9%'
        }} /></colgroup>
      <thead><tr className="h-9 border-b border-zinc-700 text-zinc-500 text-[14px] uppercase">
        {['М', 'Команда', 'И', 'В', 'ВО', 'Н', 'ПО', 'П', 'Шайбы', '±', 'О'].map(h => <th key={h} className="text-center">{h}</th>)}
      </tr></thead>
      <tbody>{rows.map(row => {
          const home = sameId(row.team_id, game.home_team_id),
            away = sameId(row.team_id, game.away_team_id);
          return <tr key={row.team_id} className="border-b border-zinc-800 font-mono text-center" style={{
            height: rowHeight,
            fontSize: font,
            lineHeight: 1,
            background: home || away ? 'rgba(255,255,255,.04)' : undefined
          }}>
          <td className="font-black" style={{
              borderLeft: home || away ? `4px solid ${home ? game.home_color_1 || '#ff5722' : game.away_color_1 || '#0ea5e9'}` : undefined
            }}>{row.rank}</td>
          <td className="px-2"><div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0" style={{
                  width: rowHeight * .55,
                  height: rowHeight * .55
                }}><BroadcastImage url={row.logo_url} className="w-full h-full object-contain" /></div>
            <span className="font-sans font-black uppercase truncate">{row.team_name}</span>
          </div></td>
          {['games_played', 'wins_reg', 'wins_ot', 'draws', 'losses_ot', 'losses_reg'].map(key => <td key={key}>{row[key] ?? '—'}</td>)}
          <td className="whitespace-nowrap">{row.goals_for}–{row.goals_against}</td>
          <td className="text-zinc-400">{Number(row.goals_diff) > 0 ? '+' : ''}{row.goals_diff}</td>
          <td className="font-black" style={{
              fontSize: font * 1.2
            }}>{row.points}</td>
        </tr>;
        })}</tbody>
    </table>
  </div>;
}
export default function TournamentOverlay({
  game,
  overlay,
  broadcast
}) {
  const visible = overlay.visible && overlay.type === 'tournament',
    mode = tournamentMode(game, overlay.data);
  const current = tournamentPages(game, broadcast.data, overlay.data)[0];
  return <BroadcastFrame game={game} title={mode === 'playoff' ? 'Сетка плей-офф' : 'Турнирная таблица'} visible={visible} type="tournament">
    {!current ? <BroadcastEmpty loading={broadcast.loading} error={broadcast.error} /> : <BroadcastPage pageKey={`${mode}:${current.bracket?.id || ''}`}>
        {mode === 'playoff' ? <Playoff rounds={current.rounds} bracket={current.bracket} brackets={broadcast.data?.brackets} game={game} /> : <Standings rows={current.rows} game={game} />}
      </BroadcastPage>}
  </BroadcastFrame>;
}
