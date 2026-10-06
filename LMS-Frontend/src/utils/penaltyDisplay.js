// Нулевые условия нейтральны; положительные — исполнены или ещё обязательны.
export function getPenaltyPillClass(required, completed) {
  if (Number(required) <= 0) {
    return 'bg-graphite/5 text-graphite/70 border border-graphite/10';
  }
  return completed
    ? 'bg-status-accepted/10 text-status-accepted border border-status-accepted/20'
    : 'bg-status-rejected/5 text-status-rejected border border-status-rejected/10';
}

export function getPenaltyGameProgress(d) {
  const gamesServed = Math.max(Number(d.games_served) || 0, 0);
  const mandatoryGames = Number(d.mandatory_games) || 0;
  return {
    gamesServed,
    mandatoryServed: d.mandatory_games == null ? null : Math.min(gamesServed, mandatoryGames),
    additionalServed: d.additional_games == null ? null : Math.min(
      Math.max(gamesServed - mandatoryGames, 0), Number(d.additional_games)
    )
  };
}
