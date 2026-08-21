import { useEffect, useRef, useState } from 'react';

// ПРОГРЕВ РОЛИКОВ ЗАСТАВКИ
//
// Ролик уходил в эфир недогруженным: оверлей открыли, режиссёр сразу нажал
// заставку — файл ещё качается, у <video> есть только первый кадр, и в кадре
// висел стоп-кадр, пока панель не снимала плашку по своему таймеру.
// preload="auto" тут не спасал: для браузера это лишь пожелание, а три ролика на
// странице ещё и делят канал.
//
// Поэтому качаем файлы сами и сразу целиком — в память, ссылкой blob:. К моменту
// эфира сеть уже не нужна, ролик стартует мгновенно. Ждать всё равно приходится,
// но ожидание переезжает на время, когда на графику никто не смотрит.
//
// Скачиваем ПО ОЧЕРЕДИ: параллельно файлы отняли бы друг у друга канал, и тот,
// что нужен раньше всех, приехал бы последним. Порядок списка тут и есть
// приоритет — первым в него кладётся переход, он открывает заставку.
//
// Если fetch не проходит (у бакета нет CORS, сеть отказала), слот остаётся на
// прямой ссылке и помечается готовым: блокировать из-за прогрева эфир нельзя,
// поведение просто откатывается к прежнему. От стоп-кадра в этом случае страхует
// сам оверлей — он не запускает ролик, пока не дождался canplay.

// Тип у blob обязан быть настоящим. По прямой ссылке браузер догадывается о
// формате сам, а вот blob: он играет ТОЛЬКО по типу самого объекта: придёт от
// хранилища application/octet-stream — и <video> молча откажется играть.
const mimeFor = (url, headerType) => {
  const clean = String(url).split('?')[0].toLowerCase();
  if (clean.endsWith('.webm')) return 'video/webm';
  if (clean.endsWith('.mov')) return 'video/quicktime';
  if (clean.endsWith('.mp4')) return 'video/mp4';
  return headerType && headerType.startsWith('video/') ? headerType : 'video/mp4';
};

const withProgress = async (res, url, onProgress) => {
  const type = mimeFor(url, res.headers.get('content-type'));
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return new Blob([await res.arrayBuffer()], { type });

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  let reported = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    // Шлём не каждый чанк, а шагами по 5%: отчёт уходит в панель через сокет.
    const p = Math.min(0.99, received / total);
    if (p - reported >= 0.05) { reported = p; onProgress(p); }
  }

  return new Blob(chunks, { type });
};

export function useBumperWarmup(bumpers, { hold = false, onReport } = {}) {
  const [sources, setSources] = useState({});   // slot -> адрес для <video>
  const [state, setState] = useState({});       // slot -> { progress, ready, streamed }

  // Готовые адреса придерживаем, пока заставка в эфире: подмена src посреди
  // рекламы перезапустила бы ролик с нуля.
  const pendingRef = useRef({});
  const [pendingTick, setPendingTick] = useState(0);

  const stateRef = useRef({});
  const onReportRef = useRef(onReport);
  useEffect(() => { onReportRef.current = onReport; }, [onReport]);

  // Пересобираем прогрев, только когда реально сменился состав ссылок: game
  // приходит заново на каждый гол, и на объект-массив завязываться нельзя.
  const key = (bumpers || []).map(b => `${b.slot}:${b.url || ''}`).join('|');

  useEffect(() => {
    const list = (bumpers || []).filter(b => b.url);
    stateRef.current = {};
    setState({});
    if (!list.length) return undefined;

    const ac = new AbortController();
    const created = [];
    let cancelled = false;

    const update = (slot, patch) => {
      stateRef.current = { ...stateRef.current, [slot]: { ...stateRef.current[slot], ...patch } };
      setState(stateRef.current);
      onReportRef.current?.(stateRef.current);
    };

    (async () => {
      for (const b of list) {
        if (cancelled) return;
        update(b.slot, { progress: 0, ready: false, streamed: false });
        try {
          const res = await fetch(b.url, { signal: ac.signal, credentials: 'omit' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await withProgress(res, b.url, p => { if (!cancelled) update(b.slot, { progress: p }); });
          if (cancelled) return;

          const objectUrl = URL.createObjectURL(blob);
          created.push(objectUrl);
          pendingRef.current = { ...pendingRef.current, [b.slot]: objectUrl };
          setPendingTick(t => t + 1);
          update(b.slot, { progress: 1, ready: true });
        } catch (e) {
          if (cancelled) return;
          console.warn(`Прогрев заставки: слот ${b.slot} остаётся на прямой ссылке —`, e?.message || e);
          update(b.slot, { progress: 1, ready: true, streamed: true });
        }
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      pendingRef.current = {};
      setSources({});
      created.forEach(URL.revokeObjectURL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (hold) return;
    setSources(prev => {
      const next = pendingRef.current;
      const same = Object.keys(next).length === Object.keys(prev).length
        && Object.keys(next).every(k => next[k] === prev[k]);
      return same ? prev : next;
    });
  }, [hold, pendingTick]);

  return { sources, state };
}
