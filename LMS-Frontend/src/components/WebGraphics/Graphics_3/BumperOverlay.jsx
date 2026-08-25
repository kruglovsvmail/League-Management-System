// src/components/WebGraphics/Graphics_3/BumperOverlay.jsx
//
// Заставка: переход с прозрачным фоном закрывает кадр, под ним открывается
// рекламный ролик, по концу ролика переход открывает картинку обратно.
//
// ПЕРЕХОД БОЛЬШЕ НЕ РИСУЕТСЯ ЗДЕСЬ. Он собирается один раз в панели трансляции
// (canvas → WebM с альфой → S3) и приходит сюда готовой ссылкой в
// game.transition_url. Раньше переход существовал дважды — анимацией в DOM для
// эфира и отрисовкой на canvas для выгрузки в файл, и эти две версии неизбежно
// разъезжались. Теперь источник один: то, что играет в эфире, и то, что лежит
// файлом для Stinger-перехода в OBS, — буквально один и тот же файл.
//
// Рисунок перехода живёт в bumperFrame.js этой же папки.
//
// Вход в ролик всегда переходом — без него склейка на рекламу видна в эфире.
// Выход переходом отключается кнопкой в панели: иногда возврат в игру нужен
// мгновенный, а иногда переключение сцены в OBS уже сделано тем же
// Stinger-переходом и второй такой же проход в кадре лишний.
//
// Все ролики и сам переход смонтированы скрытыми с preload="auto" с запуска
// оверлея: файлы должны быть в кэше ДО нажатия кнопки.
import React, { useState, useEffect, useRef } from 'react';
import { SWEEP_MS, COVER_MS } from './bumperFrame';

// Длину ролика берём у самого элемента: в БД лежит цифра, посчитанная при
// загрузке файла, и после замены ролика она может отстать от правды.
const durationMs = (el, meta) => {
  const fromEl = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
  return (fromEl || Number(meta?.duration) || 15) * 1000;
};

export default function BumperOverlay({ game, overlay, sources }) {
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
  const waitersRef = useRef([]);   // подписки «дождаться готовности ролика»
  const watchersRef = useRef([]);  // наблюдатели за playhead, отменяются вместе с таймерами

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    // Ожидание готовности ролика — такой же отложенный запуск, как таймер: снимать
    // его нужно везде, где снимаются таймеры, иначе дозагрузившийся файл вылезет в
    // эфир после того, как заставку уже убрали.
    waitersRef.current.forEach(([el, fn]) => el.removeEventListener('canplay', fn));
    waitersRef.current = [];
    watchersRef.current.forEach(cancel => cancel());
    watchersRef.current = [];
  };

  // Ждём, пока ДОРОЖКА дойдёт до нужной секунды, вместо отсчёта таймером.
  //
  // Таймер считает от момента, когда мы позвали play(), — а картинка появляется
  // позже: декодер VP8 с альфой запускается не мгновенно, да и посреди прохода
  // файл может подвиснуть на буферизации. Таймер этого не видит, playhead видит.
  // Отсюда и лезло «реклама уже в кадре, а шторки ещё не сомкнулись»: кадр
  // перекрыт всего около секунды, и запаса в полсекунды на такие сдвиги не
  // хватает.
  const watchTime = (el, atSec, fn) => {
    if (!el) { fn(); return; }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      // el.ended — страховка: если дорожка кончилась, не дойдя до отметки,
      // цепочку всё равно надо двинуть дальше, иначе титр зависнет в эфире.
      if (el.currentTime >= atSec || el.ended) { fn(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    watchersRef.current.push(() => { cancelled = true; });
  };

  // Останавливаем ВСЕ ролики, а не только текущий слот. Режиссёр может
  // переключить слот прямо в эфире: к этому моменту overlay.data.slot указывает
  // уже на новый ролик, и прежний остался бы играть — невидимым, но слышимым, и
  // снять его было бы нечем до перезагрузки оверлея.
  const stopAllVideos = () => {
    Object.values(videoRefs.current).forEach((el) => {
      if (!el) return;
      el.pause();
      el.currentTime = 0;
      // Мьют мог включиться при отказе автозапуска — снимаем, иначе следующая
      // реклама тоже уйдёт в эфир немой.
      el.muted = false;
    });
  };

  const finish = () => {
    clearTimers();
    stopAllVideos();
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
      finish();
      return clearTimers;
    }

    clearTimers();
    // Любой новый сценарий начинаем с чистого листа: эффект перезапускается и
    // при смене слота, и при повторном пуске, а играть в этот момент может
    // ролик прошлого слота.
    stopAllVideos();

    const elapsed = startedAt ? Date.now() - startedAt : 0;
    const el = videoRefs.current[slot];

    // Переход, как и ролик, нельзя запускать вслепую: у холодного элемента есть
    // только первые кадры, он их покажет и встанет ждать данные — а заметить это
    // некому, таймеры фаз идут по расписанию и через SWEEP_MS просто гасят
    // застывшую картинку.
    const runTransition = (fromMs = 0, onStart) => {
      const t = transitionRef.current;
      // Перехода нет — цепочку не подвешиваем: то, что должно идти после него,
      // должно пойти всё равно.
      if (!t) { onStart?.(); return; }

      const to = Math.max(0, fromMs) / 1000;

      // ПОВТОРНЫЙ ПОКАЗ С НУЛЯ ДЕЛАЕТСЯ ЧЕРЕЗ load(), А НЕ ПЕРЕМОТКОЙ.
      //
      // Файл собран MediaRecorder'ом, а такой WebM пишется без длительности и
      // без индекса — seek на нём может не выполниться вовсе. Закрывающий проход
      // как раз и есть перемотка назад: дорожка стоит в конце после открывающего.
      // Не отмотавшись, элемент оставался в ended, play() не делал ничего, и
      // картинка возвращалась в эфир мгновенно — то самое «ролик кончился, а
      // шторки ещё не сомкнулись». load() возвращает дорожку в начало всегда.
      const needRewind = to < 0.05 && (t.ended || t.currentTime > 0.05);
      if (needRewind) t.load();
      else if (Math.abs(t.currentTime - to) > 0.05) t.currentTime = to;

      const start = () => {
        t.play().catch((err) => {
          console.warn('[Заставка] переход не запустился:', err?.name, err?.message);
        });
      };

      // Сдвиг по времени тут НЕ добавляем, в отличие от ролика: перемотка на этом
      // файле ненадёжна. Вместо этого от фактического старта отсчитывается всё
      // остальное — за это и отвечает onStart.
      const begin = () => { start(); onStart?.(); };

      if (t.readyState >= 3) { begin(); return; }   // HAVE_FUTURE_DATA — данных хватает

      console.info('[Заставка] переход ещё не готов, ждём canplay', { readyState: t.readyState });

      let guard;
      const onReady = () => {
        clearTimeout(guard);
        t.removeEventListener('canplay', onReady);
        begin();
      };
      t.addEventListener('canplay', onReady);
      waitersRef.current.push([t, onReady]);

      // Предохранитель: если готовность так и не наступила, идём дальше без неё.
      // Дёрганый переход неприятен, но заставка, зависшая в эфире навсегда, хуже.
      guard = setTimeout(() => {
        t.removeEventListener('canplay', onReady);
        console.warn('[Заставка] переход так и не догрузился — играем как есть');
        begin();
      }, COVER_MS);
      timersRef.current.push(guard);
    };
    // Ролик может быть ещё не готов: прогрев не успел или не прошёл вовсе, и у
    // элемента есть только первый кадр. Ждём canplay, а не суём в эфир стоп-кадр.
    // Стартуем со сдвигом на время ожидания: закрывающий переход уже стоит в
    // расписании, и растянуть ролик нельзя — иначе шторки сомкнутся, когда
    // реклама ещё идёт.
    const runVideo = (fromMs = 0) => {
      setVideoOn(true);
      if (!el) return;

      const waitStart = Date.now();
      const start = () => {
        el.currentTime = Math.max(0, fromMs + (Date.now() - waitStart)) / 1000;
        console.info('[Заставка] пуск ролика', {
          slot,
          источник: String(el.currentSrc || el.src).startsWith('blob:') ? 'из памяти (прогрет)' : 'из сети',
          readyState: el.readyState,
          длительность: el.duration,
          ждали: Date.now() - waitStart,
        });
        // play() отказывает МОЛЧА — и тогда в кадре висит первый кадр вместо
        // рекламы. Самая частая причина — политика автозапуска: страницу открыли
        // и не трогали, а у ролика есть звук. В OBS её нет (браузерный источник
        // запускается с разрешением), но в обычной вкладке она рубит запуск.
        // Лучше отдать рекламу без звука, чем стоп-кадр, — и обязательно сказать
        // об этом в консоль.
        el.play().catch((err) => {
          console.warn('[Заставка] ролик не запустился:', err?.name, err?.message);
          if (err?.name === 'NotAllowedError') {
            el.muted = true;
            el.play()
              .then(() => console.warn('[Заставка] играем БЕЗ ЗВУКА — браузер запретил автозапуск со звуком'))
              .catch(() => {});
          }
        });
      };

      if (el.readyState >= 3) { start(); return; }   // HAVE_FUTURE_DATA — данных хватает

      const onReady = () => { el.removeEventListener('canplay', onReady); start(); };
      el.addEventListener('canplay', onReady);
      waitersRef.current.push([el, onReady]);
    };

    // Отметки на дорожке перехода, в секундах: когда кадр перекрыт и когда проход
    // закончился. Всё расписание строится по ним, а не по часам.
    const COVER_SEC = COVER_MS / 1000;
    const SWEEP_SEC = SWEEP_MS / 1000;

    // Закрывающий проход заводится от ЧАСОВ РОЛИКА: он должен накрыть кадр ровно
    // к концу рекламы, а сколько она реально идёт, знает только она сама —
    // цифра из БД могла устареть, да и старт ролика мог сдвинуться.
    const armOutro = () => {
      if (!withOutro || !el) return;
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : D / 1000;
      watchTime(el, Math.max(0, dur - COVER_SEC), () => {
        runTransition(0, () => {
          setPhase('out');
          const t = transitionRef.current;
          watchTime(t, COVER_SEC, () => setVideoOn(false));
          watchTime(t, SWEEP_SEC, () => setPhase('idle'));
        });
      });
    };

    // --- ТОЛЬКО ПЕРЕХОД: ролик не выбран или файла в слоте нет ---------------
    if (!hasVideo) {
      if (!transitionUrl || elapsed >= SWEEP_MS) { setPhase('idle'); return clearTimers; }
      runTransition(elapsed, () => {
        setPhase('in');
        watchTime(transitionRef.current, SWEEP_SEC, () => setPhase('idle'));
      });
      return clearTimers;
    }

    // --- РОЛИК ---------------------------------------------------------------
    //
    // Вход всегда переходом: он перекрывает кадр на середине прохода (COVER_MS),
    // там же под ним и стартует ролик. Переход не собран — играем ролик сразу.
    const openCover = transitionUrl ? COVER_MS : 0;
    const openEnd = transitionUrl ? SWEEP_MS : 0;

    // Эти цифры нужны ТОЛЬКО для подхвата — решить, в какой точке титра мы
    // очнулись после перезагрузки оверлея. Ход вперёд ведут сами дорожки.
    const D = durationMs(el, active);
    const videoEnd = openCover + D;
    const closeAt = withOutro ? Math.max(D, openEnd) : null;
    const hideVideoAt = withOutro ? Math.max(videoEnd, closeAt + COVER_MS) : videoEnd;
    const endAt = withOutro ? closeAt + SWEEP_MS : videoEnd;

    if (elapsed >= endAt) { setPhase('idle'); return clearTimers; }

    // Подхват уже в закрывающем проходе
    if (withOutro && elapsed >= closeAt) {
      runTransition(elapsed - closeAt, () => {
        setPhase('out');
        const t = transitionRef.current;
        watchTime(t, COVER_SEC, () => setVideoOn(false));
        watchTime(t, SWEEP_SEC, () => setPhase('idle'));
      });
      if (elapsed < hideVideoAt) runVideo(elapsed - openCover);
      else setVideoOn(false);
      return clearTimers;
    }

    if (elapsed >= openEnd) {
      // Открывающий уже отыграл — в кадре чистый ролик
      setPhase('video');
      runVideo(elapsed - openCover);
      armOutro();
    } else {
      // Часами служит САМ переход. Плашку показываем, только когда он реально
      // пошёл; ролик впускаем ровно на его отметке COVER_MS; проход снимаем на
      // его же конце. Ни задержка декодера, ни рассинхрон часов панели и OBS, ни
      // подвисание на буферизации при таком отсчёте ничего не сдвигают.
      runTransition(elapsed, () => {
        setPhase('in');
        const t = transitionRef.current;
        watchTime(t, COVER_SEC, () => { runVideo(0); armOutro(); });
        watchTime(t, SWEEP_SEC, () => setPhase('video'));
      });
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
            // Прогретый ролик лежит в памяти (blob:), непрогретый играется прямо
            // из сети — так же, как раньше.
            src={sources?.[b.slot] || b.url}
            preload="auto"
            playsInline
            // С хвостом конец ролика — штатный момент, его закрывает проход, и
            // снимать титр здесь нельзя. Без хвоста возвращать картинку больше
            // нечем, поэтому уходим сразу.
            onEnded={() => { if (b.slot === slot && !withOutro) finish(); }}
            onError={(e) => {
              const err = e?.target?.error;
              console.warn('[Заставка] ошибка ролика', b.slot, err?.code, err?.message);
              if (b.slot === slot && videoOn) finish();
            }}
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
          // Переход играет ПЕРВЫМ, поэтому его тоже прогреваем: холодный файл
          // означает, что кадр не перекроется вовремя и склейка будет видна.
          src={sources?.transition || transitionUrl}
          preload="auto"
          muted
          playsInline
          onError={(e) => {
            const err = e?.target?.error;
            console.warn('[Заставка] ошибка перехода', err?.code, err?.message);
          }}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 20, opacity: transitionOn ? 1 : 0, pointerEvents: 'none' }}
        />
      )}
    </div>
  );
}
