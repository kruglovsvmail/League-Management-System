export const COMPARISON_METRICS = [['games_played', 'Игры'], ['wins', 'Победы'], ['wins_reg', 'Победы в основное время'], ['wins_ot', 'Победы ОТ/Б'], ['draws', 'Ничьи'], ['losses', 'Поражения'], ['losses_reg', 'Поражения в основное время'], ['losses_ot', 'Поражения ОТ/Б'], ['points', 'Очки в регулярке'], ['rank', 'Место в регулярке'], ['goals_for', 'Забитые шайбы'], ['goals_against', 'Пропущенные шайбы'], ['goals_diff', 'Разница шайб'], ['goals_for_avg', 'Забито за матч'], ['goals_against_avg', 'Пропущено за матч'], ['shots', 'Броски'], ['penalty_minutes', 'Штрафные минуты'], ['power_play_pct', 'Реализация большинства'], ['goals_pp', 'Голы в большинстве'], ['goals_sh', 'Голы в меньшинстве']].map(([key, label]) => ({
  key,
  label
}));
export const DEFAULT_COMPARISON_METRICS = ['wins', 'draws', 'losses', 'points', 'rank', 'goals_diff', 'shots', 'penalty_minutes', 'power_play_pct'];
export const COMPARISON_PAGE_SIZE = 10;
export const EXTRA_DEFAULTS = {
  rosterView: 'list',
  comparisonMetrics: DEFAULT_COMPARISON_METRICS,
  comparisonSwitch: 8,
  tournamentMode: 'auto',
  tournamentBracket: null,
  nominationIds: null
};
export const seconds = value => Math.min(30, Math.max(3, Number(value) || 8));
export const sameId = (a, b) => a != null && b != null && String(a) === String(b);
export const chunks = (items, size) => Array.from({
  length: Math.ceil(items.length / size)
}, (_, i) => items.slice(i * size, (i + 1) * size));
export const tournamentMode = (game, settings) => !settings?.tournamentMode || settings.tournamentMode === 'auto' ? game?.stage_type === 'playoff' ? 'playoff' : 'standings' : settings.tournamentMode;
export function selectedNominations(data, ids) {
  return (data?.nominations || []).filter(n => n.available && n.players?.length && (ids == null || ids.some(id => sameId(id, n.id))));
}
export function comparisonMetrics(data, selected) {
  const keys = selected ?? DEFAULT_COMPARISON_METRICS;
  return COMPARISON_METRICS.filter(m => data?.available_metrics?.includes(m.key) && keys.includes(m.key));
}
export function selectedBracket(game, data, id) {
  const list = data?.brackets || [];
  const matches = m => sameId(m.team1_id, game?.home_team_id) && sameId(m.team2_id, game?.away_team_id) || sameId(m.team2_id, game?.home_team_id) && sameId(m.team1_id, game?.away_team_id);
  return list.find(b => sameId(b.id, id)) || list.find(b => b.rounds?.some(r => r.name === game?.stage_label && r.matchups?.some(matches))) || list.find(b => b.rounds?.some(r => r.matchups?.some(matches))) || list.find(b => b.is_main) || list[0];
}
export function playoffRounds(bracket) {
  const rounds = [...(bracket?.rounds || [])].sort((a, b) => Number(a.order_index) - Number(b.order_index));
  return rounds.map((round, index) => {
    const matches = [...(round.matchups || [])].sort((a, b) => Number(a.matchup_number) - Number(b.matchup_number));
    const type = m => m.ui_metadata?.match_type || m.match_type || 'regular';
    const placed = matches.map(m => ({
      m,
      place: Number(type(m).match(/^place_(\d+)$/)?.[1])
    })).filter(p => p.place > 0).sort((a, b) => a.place - b.place);
    let main;
    if (index === rounds.length - 1) main = placed.length ? [placed[0].m] : matches.slice(0, 1);else {
      main = matches.filter(m => type(m) === 'regular');
      if (!main.length && placed.length) main = [placed[0].m];
    }
    return {
      ...round,
      matchups: main
    };
  }).filter(r => r.matchups.length);
}
export function tournamentPages(game, data, settings) {
  if (tournamentMode(game, settings) === 'standings') return data?.standings?.length ? [{
    rows: data.standings
  }] : [];
  const bracket = selectedBracket(game, data, settings?.tournamentBracket),
    rounds = playoffRounds(bracket);
  return rounds.length ? [{
    bracket,
    rounds
  }] : [];
}
export const LINE_SLOTS = [{
  key: 'LW',
  label: 'ЛН'
}, {
  key: 'C',
  label: 'ЦН'
}, {
  key: 'RW',
  label: 'ПН'
}, {
  key: 'LD',
  label: 'ЛЗ'
}, {
  key: 'RD',
  label: 'ПЗ'
}];
// Расстановка — team_formation_game. Позиция в протоколе не подменяет слот команды.
export function rosterPages(game, data) {
  if (!data) return [];
  return ['home', 'away'].flatMap(side => {
    const roster = data[`${side}_formation`] || [];
    const isGoalie = p => p.position_in_line ? p.position_in_line === 'G' : p.protocol_position === 'G' || p.position === 'goalie';
    const goalies = roster.filter(isGoalie),
      used = new Set();
    const lines = [1, 2, 3, 4].map(number => {
      const slots = LINE_SLOTS.map(slot => {
        const player = roster.find(p => !isGoalie(p) && Number(p.line_number) === number && p.position_in_line === slot.key && !used.has(String(p.player_id)));
        if (player) used.add(String(player.player_id));
        return {
          ...slot,
          player: player || null
        };
      });
      return {
        number,
        slots
      };
    }).filter(line => line.slots.some(slot => slot.player));
    const extra = roster.filter(p => !isGoalie(p) && !used.has(String(p.player_id)));
    const extraPages = chunks(extra, lines.length ? 5 : 20),
      goaliePages = chunks(goalies, 2);
    return Array.from({
      length: Math.max(1, extraPages.length, goaliePages.length)
    }, (_, i) => ({
      side,
      lines,
      extras: extraPages.length ? extraPages[i % extraPages.length] : [],
      goalies: goaliePages.length ? goaliePages[i % goaliePages.length] : []
    }));
  });
}
export function broadcastCycleDuration(type, game, data, payload) {
  if (type === 'team_comparison') return Math.ceil(comparisonMetrics(data, payload?.comparisonMetrics).length / COMPARISON_PAGE_SIZE) * seconds(payload?.comparisonSwitch);
  if (type === 'team_roster' && payload?.rosterView === 'lines') return rosterPages(game, data).length * seconds(payload?.switchDuration);
  return 0;
}
