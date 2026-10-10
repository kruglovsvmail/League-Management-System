import React from 'react';
import { BroadcastFrame, BroadcastEmpty, BroadcastImage, BroadcastPage, useBroadcastPage } from './BroadcastFrame';
import { chunks, comparisonMetrics, COMPARISON_PAGE_SIZE } from '../broadcastConfig';
const value = (stat, key) => {
  const n = stat?.[key];
  if (n == null) return '—';
  if (key === 'power_play_pct') return `${Number(n).toLocaleString('ru-RU', {
    maximumFractionDigits: 1
  })}%`;
  if (key.endsWith('_avg')) return Number(n).toLocaleString('ru-RU', {
    maximumFractionDigits: 2
  });
  return key === 'goals_diff' && Number(n) > 0 ? `+${n}` : n;
};
export default function TeamComparisonOverlay({
  game,
  overlay,
  broadcast
}) {
  const visible = overlay.visible && overlay.type === 'team_comparison';
  const metrics = comparisonMetrics(broadcast.data, overlay.data?.comparisonMetrics);
  const pages = chunks(metrics, COMPARISON_PAGE_SIZE);
  const page = useBroadcastPage(visible, pages.length, overlay.data?.comparisonSwitch, metrics.map(m => m.key).join(','));
  return <BroadcastFrame game={game} title="Сравнение команд" visible={visible} type="team_comparison" page={page} pages={pages.length}>
    {!pages.length ? <BroadcastEmpty loading={broadcast.loading} error={broadcast.error} /> : <BroadcastPage pageKey={`${metrics.map(m => m.key).join(',')}:${page}`} className="flex h-full">
        {['home', 'center', 'away'].map(side => side === 'center' ? <div key={side} className="w-[42%] bg-zinc-900 px-6 py-6 flex flex-col">
          <div className="text-center text-zinc-400 uppercase tracking-widest text-[16px] font-bold mb-4">{broadcast.data?.scope_label}</div>
          <div className="flex-1 flex flex-col justify-center">
            {pages[page].map(metric => <div key={metric.key} className="flex items-center min-h-[60px] border-b border-zinc-800 gap-3">
              <span className="w-[96px] shrink-0 text-center text-white font-mono font-black text-[31px]">{value(broadcast.data?.comparison?.[game.home_team_id], metric.key)}</span>
              <span className="flex-1 text-center uppercase font-bold tracking-wider text-zinc-400 text-[17px] leading-tight">{metric.label}</span>
              <span className="w-[96px] shrink-0 text-center text-white font-mono font-black text-[31px]">{value(broadcast.data?.comparison?.[game.away_team_id], metric.key)}</span>
            </div>)}
          </div>
        </div> : <div key={side} className="w-[29%] flex flex-col items-center justify-center px-8 relative overflow-hidden">
          <BroadcastImage url={game[`${side}_team_logo`]} className="absolute inset-0 w-full h-full object-cover opacity-10 blur-xl scale-150" />
          <BroadcastImage url={game[`${side}_team_logo`]} className="relative w-64 h-64 object-contain mb-8" />
          <div className="relative text-white text-[52px] font-black uppercase leading-none text-center break-words">{game[`${side}_team_name`]}</div>
        </div>)}
      </BroadcastPage>}
  </BroadcastFrame>;
}
