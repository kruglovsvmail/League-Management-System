import React, { useEffect, useRef, useState } from 'react';
import { AnimationWrapper } from './AnimationWrapper';
import { TickerBackground } from './TickerBackground';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
export function useBroadcastPage(visible, count, interval, resetKey = '') {
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [visible, resetKey]);
  useEffect(() => {
    if (!visible || count < 2) return;
    const timer = setInterval(() => setPage(p => (p + 1) % count), Math.max(3, Number(interval) || 8) * 1000);
    return () => clearInterval(timer);
  }, [visible, count, interval, resetKey]);
  return count ? page % count : 0;
}
export function BroadcastPage({
  pageKey,
  children,
  className = 'h-full'
}) {
  const [shownKey, setShownKey] = useState(pageKey),
    [phase, setPhase] = useState('in');
  const previous = useRef(children);
  if (shownKey === pageKey) previous.current = children;
  useEffect(() => {
    if (shownKey === pageKey) return;
    setPhase('out');
    const timer = setTimeout(() => {
      setShownKey(pageKey);
      setPhase('in');
    }, 170);
    return () => clearTimeout(timer);
  }, [pageKey]);
  return <>
    <style>{`
      @keyframes bcPageIn { from { opacity:0;transform:translateY(18px); } to { opacity:1;transform:translateY(0); } }
      .bc-page-in { animation:bcPageIn .3s ease-out both; }
      .bc-page-out { opacity:0;transform:translateY(-16px);transition:opacity .17s ease-in,transform .17s ease-in; }
    `}</style>
    <div key={shownKey} className={`${className} ${phase === 'out' ? 'bc-page-out' : 'bc-page-in'}`}>{shownKey === pageKey ? children : previous.current}</div>
  </>;
}
export function BroadcastImage({
  url,
  className = '',
  player = false
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const src = failed ? player ? getSafeUrl('default/user_default.webp') : null : getSafeUrl(url || (player ? 'default/user_default.webp' : null));
  return src ? <img key={src} src={src} alt="" className={className} onError={e => {
    if (failed) e.currentTarget.style.visibility = 'hidden';else setFailed(true);
  }} /> : <div className={`${className} flex items-center justify-center text-zinc-600`}>{player ? '—' : ''}</div>;
}
export function BroadcastFrame({
  game,
  title,
  visible,
  type,
  children,
  page = 0,
  pages = 1
}) {
  const date = game.game_date ? new Date(game.game_date).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }) : '';
  return <AnimationWrapper type={type} isVisible={visible} className="absolute inset-0 flex items-center justify-center z-50 p-20">
    <div className="w-full max-w-[1500px] rounded-[70px] shadow-2xl overflow-hidden relative bg-zinc-950">
      <div className="bg-black py-4 px-10 text-center text-white/80 text-[26px] font-black uppercase tracking-[0.15em]">{title}</div>
      <div className="relative h-[740px] overflow-hidden">
        <TickerBackground texts={[game.league_name, game.division_name, game.home_team_name, game.away_team_name]} />
        <div className="relative z-10 h-full">{children}</div>
      </div>
      <div className="bg-black px-12 py-4 flex justify-between text-zinc-400 text-[18px] uppercase font-bold tracking-widest">
        <span>{date}</span><span>{game.arena_city || game.division_name}</span>
        <span>{pages > 1 ? `${page + 1} / ${pages} · ` : ''}{game.arena_name || game.location_text}</span>
      </div>
    </div>
  </AnimationWrapper>;
}
export function BroadcastEmpty({
  loading,
  error
}) {
  return <div className="h-full flex items-center justify-center text-zinc-400 text-3xl uppercase font-bold">
    {loading ? 'Загрузка данных' : error ? 'Данные временно недоступны' : 'Нет данных для показа'}
  </div>;
}
