import { calculatePenaltyTimelines } from './penaltyGroups.js';

// PP% = голы в большинстве / возможности большинства.
// Большой штраф после гола продолжается и даёт следующую возможность.
// NHL statistical glossary: https://www.nhl.com/info/hockey-glossary
export function calculateBroadcastPowerPlays(games, events) {
  const totals = new Map();
  for (const game of games) {
    const rows = events.filter(e => Number(e.game_id) === Number(game.id));
    const periodSeconds = (Number(game.periods_count) || 3) * (Number(game.period_length) || 20) * 60;
    const hasExtra = !['regular', 'reg', null, undefined].includes(game.end_type);
    const end = Number(game.elapsed_seconds) > 0 ? Number(game.elapsed_seconds) : periodSeconds + (hasExtra ? Number(game.ot_length || 0) * 60 : 0);
    const segments = calculatePenaltyTimelines(rows.filter(e => e.event_type === 'penalty')).flatMap(p => {
      if (!p.onIce || p.chainEnd == null) return [];
      const start = Number(p.effStart),
        stop = Math.min(Number(p.effEnd), Number(p.chainEnd), end);
      if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) return [];
      const major = p.penalty_class === 'major' || p.penalty_class === 'match' || [5, 25].includes(Number(p.penalty_minutes));
      const split = p.penalty_class === 'double_minor' || Number(p.penalty_minutes) === 4;
      const bounds = split && stop > start + 120 ? [start, start + 120, stop] : [start, stop];
      return bounds.slice(0, -1).map((s, i) => ({
        id: `${p.id}:${i}`,
        team: p.team_id,
        start: s,
        end: bounds[i + 1],
        major
      }));
    });
    const bounds = [...new Set(segments.flatMap(p => [p.start, p.end]))].sort((a, b) => a - b);
    const qualified = new Set();
    for (let i = 0; i + 1 < bounds.length; i++) {
      const t = (bounds[i] + bounds[i + 1]) / 2;
      const active = segments.filter(p => p.start <= t && t < p.end);
      const home = active.filter(p => Number(p.team) === Number(game.home_team_id));
      const away = active.filter(p => Number(p.team) === Number(game.away_team_id));
      if (home.length === away.length) continue;
      const penalized = home.length > away.length ? home : away;
      const difference = Math.abs(home.length - away.length);
      for (const p of [...penalized].sort((a, b) => b.start - a.start).slice(0, difference)) qualified.add(p.id);
    }
    for (const id of [game.home_team_id, game.away_team_id]) {
      const opponents = segments.filter(p => Number(p.team) !== Number(id) && qualified.has(p.id));
      let opportunities = opponents.length;
      for (const goal of rows.filter(e => e.event_type === 'goal' && Number(e.team_id) === Number(id) && ['pp1', 'pp2'].includes(e.goal_strength))) {
        const t = Number(goal.time_seconds);
        if (t >= end) continue;
        const renewedMajor = opponents.some(p => p.major && p.start <= t && t < p.end);
        const minorEnded = opponents.some(p => !p.major && p.start <= t && Math.abs(p.end - t) < 0.01);
        if (renewedMajor && !minorEnded) opportunities++;
      }
      totals.set(String(id), (totals.get(String(id)) || 0) + opportunities);
    }
  }
  return totals;
}
