import React from 'react';
import { BroadcastFrame, BroadcastEmpty, BroadcastImage, BroadcastPage, useBroadcastPage } from './BroadcastFrame';
import { rosterPages } from '../broadcastConfig';
const AMPLUA = {
  goalie: 'Вратарь',
  defense: 'Защитник',
  forward: 'Нападающий'
};
function Player({
  player,
  slot,
  goalie = false
}) {
  if (!player) return <div className="h-[90px] min-w-0 flex items-center gap-2 p-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/50">
    <div className="w-[50px] h-[70px] shrink-0 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-700 text-2xl">—</div>
    <div className="min-w-0 text-zinc-600"><div className="text-[17px] font-bold">{slot}</div><div className="text-[11px] uppercase">Свободно</div></div>
  </div>;
  const captain = player.is_captain === true || player.is_captain === 'true';
  const assistant = player.is_assistant === true || player.is_assistant === 'true';
  return <div className={`min-w-0 flex items-center gap-2 p-2 rounded-xl border border-zinc-800 bg-zinc-950 ${goalie ? 'h-[104px]' : 'h-[90px]'}`}>
    <BroadcastImage player url={player.avatar_url} className={`shrink-0 rounded-lg object-cover object-top ${goalie ? 'w-[62px] h-[86px]' : 'w-[50px] h-[70px]'}`} />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="text-white font-mono font-black text-[22px] leading-none">{player.jersey_number ?? '—'}</span>
        {(captain || assistant) && <span className={`text-[11px] font-black px-1 border rounded ${captain ? 'border-orange text-orange' : 'border-status-accepted text-status-accepted'}`}>{captain ? 'К' : 'А'}</span>}
      </div>
      <div className="text-white uppercase font-black text-[15px] truncate leading-tight mt-1">{player.last_name}</div>
      <div className="text-zinc-400 text-[10px] uppercase truncate">{player.first_name}</div>
      <div className="text-zinc-600 text-[9px] uppercase truncate">{slot || AMPLUA[player.position] || (goalie ? 'Вратарь' : '')}</div>
    </div>
  </div>;
}
export default function TeamRosterLinesOverlay({
  game,
  overlay,
  broadcast
}) {
  const visible = overlay.visible && overlay.type === 'team_roster' && overlay.data?.rosterView === 'lines';
  const pages = rosterPages(game, broadcast.data);
  const page = useBroadcastPage(visible, pages.length, overlay.data?.switchDuration, game.id);
  const current = pages[page];
  return <BroadcastFrame game={game} title="Состав команды · по звеньям" visible={visible} type="team_roster" page={page} pages={pages.length}>
    {!current ? <BroadcastEmpty loading={broadcast.loading} error={broadcast.error} /> : <BroadcastPage pageKey={`${game.id}:${page}`} className="h-full flex">
        <aside className="w-[24%] shrink-0 px-6 py-6 flex flex-col items-center border-r border-zinc-800">
          <BroadcastImage url={game[`${current.side}_team_logo`]} className="w-[180px] h-[180px] object-contain mb-4" />
          <div className="text-white text-[36px] text-center font-black uppercase leading-tight break-words">{game[`${current.side}_team_name`]}</div>
          {!!current.goalies.length && <div className="w-full mt-auto">
            <div className="text-zinc-500 font-black text-[14px] uppercase tracking-widest mb-2">Вратари</div>
            <div className="flex flex-col gap-2">{current.goalies.map(p => <Player key={p.player_id} player={p} goalie />)}</div>
          </div>}
        </aside>
        <main className="flex-1 min-w-0 bg-zinc-900 px-5 py-4 flex flex-col justify-center gap-3">
          <div className="grid gap-4" style={{
          gridTemplateColumns: current.lines.length === 1 ? '1fr' : 'repeat(2,minmax(0,1fr))'
        }}>
            {current.lines.map(line => <section key={line.number} className="min-w-0">
              <div className="text-zinc-400 text-[15px] font-black tracking-widest uppercase mb-1.5">{line.number} звено</div>
              <div className="grid grid-cols-3 gap-2">
                {line.slots.slice(0, 3).map(slot => <Player key={slot.key} player={slot.player} slot={slot.label} />)}
              </div>
              <div className="flex justify-center gap-2 mt-2">
                {line.slots.slice(3).map(slot => <div key={slot.key} className="min-w-0" style={{
                width: 'calc((100% - 16px)/3)'
              }}>
                  <Player player={slot.player} slot={slot.label} />
                </div>)}
              </div>
            </section>)}
          </div>
          {!!current.extras.length && <section>
            <div className="text-zinc-500 text-[13px] uppercase font-bold mb-1.5">{current.lines.length ? 'Без распределения' : 'Расстановка не задана'}</div>
            <div className="grid grid-cols-5 gap-2">{current.extras.map(p => <Player key={p.player_id} player={p} />)}</div>
          </section>}
          {!current.lines.length && !current.extras.length && <div className="text-zinc-500 text-center text-2xl uppercase">Полевые игроки не заявлены</div>}
        </main>
      </BroadcastPage>}
  </BroadcastFrame>;
}
