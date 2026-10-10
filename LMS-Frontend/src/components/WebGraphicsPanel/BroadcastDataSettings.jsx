import React from 'react';
import { TileStepperSetting } from './TileParts';
import { COMPARISON_METRICS, DEFAULT_COMPARISON_METRICS, comparisonMetrics, sameId, selectedBracket, tournamentMode } from '../WebGraphics/broadcastConfig';
function Chip({
  children,
  active,
  disabled,
  onClick,
  title,
  large = false
}) {
  return <button type="button" aria-pressed={active} disabled={disabled} title={title} onClick={onClick} className={`rounded-full border font-bold leading-tight transition-colors disabled:opacity-30 ${large ? 'px-4 py-2 text-[12px]' : 'px-2.5 py-1.5 text-[11px]'} ${active ? 'bg-status-accepted/15 border-status-accepted/30 text-status-accepted' : 'bg-white border-graphite/15 text-graphite/60 hover:bg-graphite/5'}`}>
    {children}
  </button>;
}
export function BroadcastDataStatus({
  broadcast
}) {
  return broadcast.error ? <div className="text-[9px] text-graphite/45">{broadcast.error}
    <button type="button" onClick={broadcast.refresh} className="ml-2 text-orange underline">Обновить</button>
  </div> : null;
}
export function RosterSettings({
  view,
  onViewChange,
  interval,
  onIntervalChange
}) {
  return <div className="flex flex-col gap-2">
    <div className="flex flex-col gap-1.5">
      {[['list', 'Списком'], ['lines', 'По звеньям']].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => onViewChange(key)} className={`flex items-center gap-3 min-h-[36px] px-3 py-1.5 rounded-lg text-left transition-colors ${view === key ? 'bg-status-accepted/15 text-status-accepted' : 'bg-graphite/5 text-graphite/60 hover:bg-graphite/10'}`}>
        <svg viewBox="0 0 32 28" aria-hidden="true" className="w-7 h-6 shrink-0 fill-current opacity-50">
          {key === 'list' ? [4, 12, 20].map(y => <rect key={y} x="2" y={y} width="28" height="4" rx="2" />) : [[10.5, 7], [21.5, 7], [5, 20], [16, 20], [27, 20]].map(([cx, cy]) => <circle key={`${cx}:${cy}`} cx={cx} cy={cy} r="3.5" />)}
        </svg>
        <span className="text-[11px] font-bold uppercase">{label}</span>
      </button>)}
    </div>
    <TileStepperSetting label="Смена команды (сек)" value={interval} min={3} max={30} onChange={onIntervalChange} />
  </div>;
}
export function TournamentSettings({
  settings,
  broadcast,
  game,
  onChange
}) {
  const mode = tournamentMode(game, settings);
  const brackets = broadcast.data?.brackets || [];
  const bracket = selectedBracket(game, broadcast.data, settings.tournamentBracket);
  return <div className="flex flex-col gap-2">
    <BroadcastDataStatus broadcast={broadcast} />
    <div className="flex flex-wrap gap-1.5">
      <Chip large active={mode === 'standings'} onClick={() => onChange('tournamentMode', 'standings')}>Турнирная таблица</Chip>
      <Chip large active={mode === 'playoff'} onClick={() => onChange('tournamentMode', 'playoff')}>Сетка плей-офф</Chip>
    </div>
    {mode === 'playoff' && <div className="flex flex-col gap-1.5 pt-1.5 border-t border-graphite/10" role="group" aria-label="Тип сетки">
      <div className="flex flex-wrap gap-1.5">
        {brackets.map(b => <Chip key={b.id} active={sameId(bracket?.id, b.id)} onClick={() => onChange('tournamentBracket', b.id)}>
          {b.name || (b.is_main ? 'Основная сетка' : 'Дополнительная сетка')}
        </Chip>)}
      </div>
      {!brackets.length && <div className="text-[10px] text-graphite/40">{broadcast.loading ? 'Загрузка сеток' : 'Сетки не заданы'}</div>}
    </div>}
  </div>;
}
export function ComparisonSettings({
  settings,
  broadcast,
  onChange
}) {
  const available = comparisonMetrics(broadcast.data, COMPARISON_METRICS.map(m => m.key));
  const selected = settings.comparisonMetrics ?? DEFAULT_COMPARISON_METRICS;
  return <div className="flex flex-col gap-2">
    <BroadcastDataStatus broadcast={broadcast} />
    <div className="flex flex-wrap gap-1">
      {available.map(m => <Chip key={m.key} active={selected.includes(m.key)} onClick={() => onChange('comparisonMetrics', selected.includes(m.key) ? selected.filter(key => key !== m.key) : [...selected, m.key])}>{m.label}</Chip>)}
    </div>
    <TileStepperSetting label="Смена страницы (сек)" value={settings.comparisonSwitch} min={3} max={30} onChange={value => onChange('comparisonSwitch', value)} />
  </div>;
}
export function NominationSettings({
  settings,
  broadcast,
  onChange
}) {
  const list = broadcast.data?.nominations || [];
  const selected = settings.nominationIds ?? list.filter(n => n.available).map(n => n.id);
  return <div className="flex flex-col gap-1.5">
    <BroadcastDataStatus broadcast={broadcast} />
    <div className="flex flex-wrap gap-1">
      {list.map(n => <Chip key={n.id} active={selected.some(id => sameId(id, n.id))} disabled={!n.available} title={n.available ? n.name : 'Учёт показателя отключён'} onClick={() => onChange('nominationIds', selected.some(id => sameId(id, n.id)) ? selected.filter(id => !sameId(id, n.id)) : [...selected, n.id])}>{n.name}</Chip>)}
    </div>
    {!list.length && !broadcast.loading && <div className="text-[9px] text-graphite/40">В дивизионе нет номинаций</div>}
  </div>;
}
