import { useState, useEffect, useCallback, useRef } from 'react';
import { getSafeUrl } from '../../utils/graphicsHelpers';
const warmedImages = new Map();
async function warmImages(urls) {
  const pending = [...new Set(urls.filter(Boolean).map(getSafeUrl))].filter(url => !warmedImages.has(url));
  let cursor = 0;
  await Promise.all(Array.from({
    length: Math.min(4, pending.length)
  }, async () => {
    while (cursor < pending.length) {
      const url = pending[cursor++];
      if (warmedImages.has(url)) {
        await warmedImages.get(url);
        continue;
      }
      const promise = new Promise(resolve => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = img.onerror = () => resolve();
        img.src = url;
        if (img.complete) resolve();
      });
      warmedImages.set(url, promise);
      await promise;
    }
  }));
  if (warmedImages.size > 500) {
    for (const url of [...warmedImages.keys()].slice(0, warmedImages.size - 500)) warmedImages.delete(url);
  }
}
// Запрос и прогрев работают с открытия источника OBS, независимо от активной плашки.
export function useBroadcastData(gameId, enabled, socket) {
  const [state, setState] = useState({
    gameId: null,
    data: null,
    loading: false,
    error: null
  });
  const controller = useRef(null),
    request = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled || !gameId) return;
    controller.current?.abort();
    const abort = new AbortController(),
      version = ++request.current;
    controller.current = abort;
    setState(prev => ({
      ...prev,
      gameId,
      loading: true,
      error: null,
      data: String(prev.gameId) === String(gameId) ? prev.data : null
    }));
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/games/${gameId}/graphics`, {
        signal: abort.signal
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error('Не удалось загрузить данные графики');
      if (version === request.current) setState({
        gameId,
        data: payload.data,
        loading: false,
        error: null
      });
    } catch (error) {
      if (error.name !== 'AbortError' && version === request.current) setState(prev => ({
        ...prev,
        loading: false,
        error: error.message
      }));
    }
  }, [gameId, enabled]);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    let timer;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 500);
    };
    socket?.on('game_updated', update);
    socket?.on('score_updated', update);
    socket?.on('connect', update);
    return () => {
      clearTimeout(timer);
      controller.current?.abort();
      ++request.current;
      socket?.off('game_updated', update);
      socket?.off('score_updated', update);
      socket?.off('connect', update);
    };
  }, [enabled, refresh, socket]);
  useEffect(() => {
    if (!state.data || String(state.gameId) !== String(gameId)) return;
    const data = state.data;
    const players = [...(data.home_formation || []), ...(data.away_formation || []), ...(data.nominations || []).flatMap(n => (n.players || []).slice(0, 5))];
    warmImages([...(data.standings || []).map(t => t.logo_url), ...(data.brackets || []).flatMap(b => (b.rounds || []).flatMap(r => (r.matchups || []).flatMap(m => [m.team1_logo, m.team2_logo]))), ...players.flatMap(p => [p.avatar_url, p.team_logo_url]), 'default/user_default.webp']).catch(() => {});
  }, [state.data, state.gameId, gameId]);
  return {
    ...state,
    data: String(state.gameId) === String(gameId) ? state.data : null,
    refresh
  };
}
