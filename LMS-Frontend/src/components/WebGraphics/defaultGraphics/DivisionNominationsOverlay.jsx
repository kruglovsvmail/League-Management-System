import React from 'react';
import { BroadcastFrame, BroadcastEmpty, BroadcastImage, BroadcastPage } from './BroadcastFrame';
import { selectedNominations } from '../broadcastConfig';
const value = (player, nomination) => player.value == null ? '—' : nomination.metric_format === 'percent' ? `${(Number(player.value) * 100).toLocaleString('ru-RU', {
  maximumFractionDigits: 2
})}%` : player.value;
export default function DivisionNominationsOverlay({
  game,
  overlay,
  broadcast
}) {
  const visible = overlay.visible && overlay.type === 'division_nominations';
  const nominations = selectedNominations(broadcast.data, overlay.data?.nominationIds);
  const count = nominations.length,
    width = (1444 - Math.max(0, count - 1) * 10) / Math.max(1, count);
  const photo = Math.min(180, Math.max(44, width - 30)),
    smallPhoto = Math.min(46, Math.max(24, width * .2));
  const nameSize = count > 7 ? 13 : count > 4 ? 19 : 24;
  const lowerListWidth = Math.min(420, Math.max(0, width - 24) * .9);
  const lowerValueSize = count > 6 ? 14 : count > 4 ? 18 : 22;
  return <BroadcastFrame game={game} title="Номинации дивизиона · Топ 5" visible={visible} type="division_nominations">
    {!count ? <BroadcastEmpty loading={broadcast.loading} error={broadcast.error} /> : <BroadcastPage pageKey={nominations.map(n => n.id).join(',')} className="h-full px-7 py-6 flex gap-2.5">
        {nominations.map(n => {
        const winner = n.players[0];
        return <section key={n.id} className="flex-1 min-w-0 rounded-3xl bg-zinc-900 border border-zinc-800 p-3 flex flex-col">
            <h2 className="h-[58px] shrink-0 text-center text-white font-black uppercase leading-tight line-clamp-3" style={{
            fontSize: count > 6 ? 15 : 21
          }}>{n.name}</h2>
            <div className="flex flex-col items-center text-center pb-4 border-b border-zinc-700">
              <div className="relative mb-3" style={{
              width: photo,
              height: photo
            }}>
                <BroadcastImage player url={winner.avatar_url} className="w-full h-full object-cover object-top rounded-[24%]" />
                <span className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-zinc-950 text-white flex items-center justify-center text-sm font-black">1</span>
                <BroadcastImage url={winner.team_logo_url} className="absolute -bottom-2 -right-2 w-10 h-10 object-contain" />
              </div>
              <div className="text-white uppercase font-black max-w-full truncate" style={{
              fontSize: nameSize
            }}>{winner.last_name}</div>
              <div className="text-zinc-400 uppercase text-[12px] max-w-full truncate">{winner.first_name}</div>
              <div className="text-zinc-500 uppercase text-[11px] max-w-full truncate mt-1">{winner.team_name}</div>
              <div className="text-white font-mono font-black leading-none mt-3" style={{
              fontSize: count > 7 ? 26 : 44
            }}>{value(winner, n)}</div>
              <div className="text-zinc-500 text-[10px] uppercase leading-tight mt-1 line-clamp-2">{n.metric_label}</div>
            </div>
            <div className="w-full mx-auto flex-1 flex flex-col justify-evenly pt-2 min-h-0" style={{
            maxWidth: lowerListWidth
          }}>
              {n.players.slice(1, 5).map((p, i) => <div key={`${p.team_id}:${p.player_id}`} className="w-full flex items-center gap-2 min-w-0 py-1 shrink-0">
                <span className="font-mono text-zinc-500 text-[13px] w-4 shrink-0 text-center">{i + 2}</span>
                <div className="shrink-0" style={{
                width: smallPhoto,
                height: smallPhoto
              }}>
                  <BroadcastImage player url={p.avatar_url} className="w-full h-full object-cover object-top rounded-lg" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-white uppercase font-black truncate" style={{
                  fontSize: count > 6 ? 11 : 15
                }}>
                    {p.last_name}{p.first_name ? ` ${p.first_name[0]}.` : ''}
                  </div>
                  <div className="text-zinc-500 uppercase text-[9px] truncate">{p.team_name}</div>
                </div>
                <span className="shrink-0 text-right text-zinc-200 font-mono font-black leading-none tabular-nums" style={{
                fontSize: lowerValueSize
              }}>{value(p, n)}</span>
              </div>)}
            </div>
          </section>;
      })}
      </BroadcastPage>}
  </BroadcastFrame>;
}
