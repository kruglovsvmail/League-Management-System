// src/components/WebGraphics/defaultGraphics/BumperOverlay.jsx
//
// Заставка: переход с прозрачным фоном закрывает кадр, под ним открывается
// рекламный ролик, по концу ролика переход открывает картинку обратно.
//
// Логика один в один с Graphics_3/BumperOverlay.jsx — там же и подробности:
// переход рисуется не здесь, а собирается один раз в панели трансляции
// (canvas → WebM с альфой → S3) и приходит готовой ссылкой в
// game.transition_url. Вход в ролик всегда переходом, выход — по кнопке в
// панели.
import React, { useState, useEffect, useRef } from 'react';
import { SWEEP_MS, COVER_MS } from './bumperFrame';

// Длину ролика берём у самого элемента: в БД лежит цифра, посчитанная при
// загрузке файла, и после замены ролика она может отстать от правды.
const durationMs = (el, meta) => {
  const fromEl = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
  return (fromEl || Number(meta?.duration) || 15) * 1000;
};

export default function BumperOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'bumper';

  // slot === null — режиссёр ничего не выбрал: играет только переход.
  const rawSlot = Number(overlay.data?.slot);
  const slot = Number.isFinite(rawSlot) && rawSlot > 0 ? rawSlot : null;

  // Хвост: закрывать ли ролик переходом. Вход переходом не отключается — без
  // него склейка на рекламу видна в эфире. Состояния, записанные до появления
  // кнопки, поля не знают, поэтому по умолчанию включено.
  const outroWanted = overlay.data?.outro !== false;

  const bumpers = Array.isArray(game?.league_bumpers) ? game.league_bumpers : [];
  const active = slot ? bumpers.find(b => b.slot === slot) : null;
  const hasVideo = !!active?.url;

  const transitionUrl = game?.transition_url || null;

  // Закрывать есть смысл, только если есть чем и есть что закрывать.
  const withOutro = outroWanted && !!transitionUrl && hasVideo;

  // idle → in (переход) → video (ролик) → out (переход) → idle
  const [phase, setPhase] = useState('idle');
  const [videoOn, setVideoOn] = useState(false);
  const transitionRef = useRef(null);
  const videoRefs = useRef({});
  const timersRef = useRef([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };
  const later = (fn, ms) => { timersRef.current.push(setTimeout(fn, Math.max(0, ms))); };

  const finish = () => {
    clearTimers();
    setVideoOn(false);
    setPhase('idle');
    const t = transitionRef.current;
    if (t) { t.pause(); t.currentTime = 0; }
  };

  // Момент запуска приходит из панели. Нужен для ПОДХВАТА: если оверлей
  // перезагрузили в OBS посреди рекламы, восстановление overlay_state включит
  // заставку заново, и без этой отметки она проиграла бы переход с нуля поверх
  // уже идущего ролика.
  const startedAt = Number(overlay.data?.startedAt) || 0;

  useEffect(() => {
    if (!isVisible) {
      if (phase !== 'idle') {
        const el = videoRefs.current[slot];
        if (el) el.pause();
        finish();
      }
      return clearTimers;
    }

    clearTimers();

    const elapsed = startedAt ? Date.now() - startedAt : 0;
    const el = videoRefs.current[slot];

    const runTransition = (fromMs = 0) => {
      const t = transitionRef.current;
      if (t) { t.currentTime = Math.max(0, fromMs) / 1000; t.play().catch(() => {}); }
    };
    const runVideo = (fromMs = 0) => {
      setVideoOn(true);
      if (el) { el.currentTime = Math.max(0, fromMs) / 1000; el.play().catch(() => {}); }
    };

    // --- ТОЛЬКО ПЕРЕХОД: ролик не выбран или файла в слоте нет ---------------
    if (!hasVideo) {
      if (!transitionUrl || elapsed >= SWEEP_MS) { setPhase('idle'); return clearTimers; }
      setPhase('in');
      runTransition(elapsed);
      later(() => setPhase('idle'), SWEEP_MS - elapsed);
      return clearTimers;
    }

    // --- РОЛИК ---------------------------------------------------------------
    //
    // Вход всегда переходом: он перекрывает кадр на середине прохода (COVER_MS),
    // там же под ним и стартует ролик. Переход не собран — играем ролик сразу.
    const openCover = transitionUrl ? COVER_MS : 0;
    const openEnd = transitionUrl ? SWEEP_MS : 0;

    const D = durationMs(el, active);
    const videoEnd = openCover + D;

    // Закрывающий заходит так, чтобы накрыть кадр ровно к концу ролика, —
    // значит стартует за COVER_MS до него.
    const closeAt = withOutro ? Math.max(D, openEnd) : null;
    const hideVideoAt = withOutro ? Math.max(videoEnd, closeAt + COVER_MS) : videoEnd;
    const endAt = withOutro ? closeAt + SWEEP_MS : videoEnd;

    if (elapsed >= endAt) { setPhase('idle'); return clearTimers; }

    // Подхват уже в закрывающем проходе
    if (withOutro && elapsed >= closeAt) {
      setPhase('out');
      runTransition(elapsed - closeAt);
      if (elapsed < hideVideoAt) {
        runVideo(elapsed - openCover);
        later(() => setVideoOn(false), hideVideoAt - elapsed);
      } else {
        setVideoOn(false);
      }
      later(() => setPhase('idle'), endAt - elapsed);
      return clearTimers;
    }

    if (elapsed >= openEnd) {
      // Открывающий уже отыграл — в кадре чистый ролик
      setPhase('video');
      runVideo(elapsed - openCover);
    } else {
      setPhase('in');
      runTransition(elapsed);
      if (elapsed >= openCover) runVideo(elapsed - openCover);
      else later(() => runVideo(0), openCover - elapsed);
      later(() => setPhase('video'), openEnd - elapsed);
    }

    if (withOutro) {
      later(() => { setPhase('out'); runTransition(0); }, closeAt - elapsed);
      later(() => setVideoOn(false), hideVideoAt - elapsed);
      later(() => setPhase('idle'), endAt - elapsed);
    }

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, slot, hasVideo, withOutro, transitionUrl, startedAt]);

  if (!game) return null;

  const transitionOn = phase === 'in' || phase === 'out';

  return (
    <div
      className={`absolute inset-0 z-[60] overflow-hidden ${phase === 'idle' ? 'pointer-events-none' : ''}`}
      style={{ visibility: phase === 'idle' ? 'hidden' : 'visible' }}
    >
      {/* ---------- РОЛИКИ ----------
          Смонтированы все три: preload держит файлы в кэше с запуска оверлея.
          Видимым становится только активный, остальные лежат нулевого размера. */}
      {bumpers.map(b => {
        const isActiveSlot = b.slot === slot && videoOn;
        return (
          <video
            key={b.slot}
            ref={el => { videoRefs.current[b.slot] = el; }}
            src={b.url}
            preload="auto"
            playsInline
            // С хвостом конец ролика — штатный момент, его закрывает проход, и
            // снимать титр здесь нельзя. Без хвоста возвращать картинку больше
            // нечем, поэтому уходим сразу.
            onEnded={() => { if (b.slot === slot && !withOutro) finish(); }}
            onError={() => { if (b.slot === slot && videoOn) finish(); }}
            className="absolute inset-0 w-full h-full object-cover bg-black"
            style={{
              zIndex: 10,
              opacity: isActiveSlot ? 1 : 0,
              width: isActiveSlot ? '100%' : 1,
              height: isActiveSlot ? '100%' : 1,
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {/* ---------- ПЕРЕХОД ----------
          Прозрачный WebM поверх всего. Всегда смонтирован ради preload, но
          показывается только пока идёт сам проход: иначе последний кадр висел
          бы поверх ролика. muted обязателен — звук у перехода не предусмотрен,
          а без него браузер может отказать в автовоспроизведении. */}
      {transitionUrl && (
        <video
          ref={transitionRef}
          src={transitionUrl}
          preload="auto"
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 20, opacity: transitionOn ? 1 : 0, pointerEvents: 'none' }}
        />
      )}
    </div>
  );
}
