import React, { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Icon } from '../../ui/Icon';

// Одна полоса плитки — одна плашка: своя кнопка эфира, свой заголовок, своя
// справочная строка, своя хваталка для автопилота и своя шестерёнка настроек.
//
// Переворачивается КАЖДАЯ ПОЛОСА ОТДЕЛЬНО, а не плитка целиком: правя минуты
// перерыва, режиссёр не теряет из виду предматчевую и может вывести её в эфир
// тем же движением.
//
// Полоса кликается целиком, кроме хваталки и шестерёнки: обе лежат рядом с
// эфирной зоной, а не внутри неё, поэтому ни захват плашки в плейлист, ни заход
// в настройки ничем не грозят.
function TileBand({ mode, single }) {
  const [flipped, setFlipped] = useState(false);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: mode.dragType ? `static-${mode.dragType}` : `tile-${mode.key}`,
    data: { type: mode.dragType, label: mode.title, isSource: true },
    disabled: !mode.dragType,
  });

  const live = !!mode.isLive;
  const progress = mode.progress || null;

  // Один запуск — одна анимация. Ключ: у заставки это момент старта ролика, у
  // остальных — само значение показа (поменяли степпер в эфире — полоса поехала
  // заново с новой длиной).
  const runKey = progress?.duration ? (progress.runId || progress.duration) : null;

  // Стиль считаем РОВНО РАЗ на запуск и дальше не трогаем. Пересчёт на каждый
  // рендер ломал полосу: браузер применяет новую длительность к уже идущей
  // анимации и заново раскладывает её прогресс — полоса дёргалась и добегала до
  // конца раньше, чем заканчивался ролик.
  //
  // Уже прошедшее время не вычитаем из длительности, а отдаём отрицательной
  // задержкой: при перезагрузке панели посреди заставки полоса подхватится с
  // нужного места, а её скорость останется прежней.
  const progressStyle = useMemo(() => {
    if (!progress?.duration) return null;
    const elapsed = progress.startedAt
      ? Math.max(0, (Date.now() - Number(progress.startedAt)) / 1000)
      : 0;
    return {
      animation: `shrinkButtonBar ${progress.duration}s linear forwards`,
      animationDelay: elapsed ? `-${elapsed}s` : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={{ flexGrow: mode.grow ?? 1, opacity: isDragging ? 0.5 : 1, perspective: '1000px' }}
      className="relative basis-0 min-h-0 border-b border-graphite/10 last:border-b-0 outline-none"
    >
      <div
        className={`bt-inner ${flipped ? 'bt-flipped' : ''}`}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      >

        {/* ---------- ЛИЦО ПОЛОСЫ ---------- */}
        <div className={`bt-face ${flipped ? 'pointer-events-none' : ''}`}>
          <div
            onClick={mode.airDisabled ? undefined : mode.onAir}
            role="button"
            tabIndex={0}
            className={`absolute inset-0 flex flex-col items-center justify-center text-center px-4 py-3 overflow-hidden transition-colors duration-200
              ${live ? 'bg-status-accepted/10 shadow-[inset_0_0_24px_rgba(34,197,94,0.12)]' : 'bg-white hover:bg-graphite/5'}
              ${mode.airDisabled ? 'cursor-default' : 'cursor-pointer'}`}
            title={mode.airTitle || (live ? 'Нажмите, чтобы убрать из эфира' : 'Нажмите, чтобы вывести в эфир')}
          >
            {live && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-status-accepted/20">
                {progressStyle ? (
                  <div
                    key={`bt-progress-${mode.key}-${runKey}`}
                    className="h-full bg-status-accepted w-full origin-left"
                    style={progressStyle}
                  />
                ) : (
                  <div className="h-full bg-status-accepted w-full" />
                )}
              </div>
            )}

            <span className={`max-w-full truncate text-[18px] font-black uppercase tracking-widest leading-tight ${live ? 'text-status-accepted' : 'text-graphite/70'}`}>
              {mode.title}
            </span>

            {mode.front && <div className={`w-full min-w-0 ${single ? 'mt-3' : 'mt-2'}`}>{mode.front}</div>}

            {live && (
              <span className="absolute bottom-2 right-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-accepted animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-widest text-status-accepted">Эфир</span>
              </span>
            )}
          </div>

          <button
            ref={setActivatorNodeRef}
            {...listeners}
            onContextMenu={e => { if (mode.dragType) e.preventDefault(); }}
            disabled={!mode.dragType}
            title={mode.dragType
              ? `Перетащите «${mode.title}» в плейлист автопилота`
              : 'Эту плашку автопилот не показывает'}
            className={`absolute bottom-2 left-2 z-20 w-9 h-9 rounded-lg flex items-center justify-center transition-colors touch-none
              ${mode.dragType
                ? 'text-graphite/25 hover:text-orange hover:bg-orange/10 cursor-grab active:cursor-grabbing'
                : 'text-graphite/10 cursor-not-allowed'}`}
          >
            <Icon name="grip" className="w-5 h-5" />
          </button>

          {/* Шестерёнка — только у полос, которым есть что настраивать. У табло её
              нет вовсе: счёт, период и штрафы берутся из матча. */}
          {mode.back && (
            <button
              onClick={() => setFlipped(true)}
              title={`Настройки: ${mode.title}`}
              className="absolute top-2 right-2 z-20 w-9 h-9 rounded-lg flex items-center justify-center text-graphite/25 hover:text-orange hover:bg-orange/10 transition-colors"
            >
              <Icon name="gear" className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ---------- ИЗНАНКА ПОЛОСЫ ---------- */}
        <div className={`bt-face bt-back flex flex-col bg-[#f2f3f5] ${flipped ? '' : 'pointer-events-none'}`}>
          <div className="flex items-center justify-between pl-3 pr-2 pt-2 shrink-0">
            <span className="flex-1 min-w-0 truncate text-[10px] font-black uppercase tracking-widest text-graphite/45">
              {mode.title}
            </span>
            {/* Крестик — там же и такого же размера, что и шестерёнка на лице:
                закрывается ровно там, где открывалось. */}
            <button
              onClick={() => setFlipped(false)}
              title="Вернуться к эфирной кнопке"
              className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-graphite/40 hover:text-orange hover:bg-orange/10 transition-colors"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>

          {/* m-auto, а не justify-center: длинный блок (слоты заставки) при
              прокрутке не обрежется сверху. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col">
            <div className="m-auto w-full">{mode.back}</div>
          </div>
        </div>

      </div>
    </div>
  );
}

// Универсальная плитка эфира.
//
// Родственные плашки живут в ОДНОЙ плитке (табло/табло по центру, предматчевая/
// перерыв, арена/комментатор/судьи): девять отдельных плиток на экране заставляли
// искать их глазами. Плитка делится на полосы — каждая полоса сама себе кнопка
// эфира, так что ничего выбирать заранее не нужно: нажал полосу — эта плашка в
// кадре, нажал её же — сняли. Соседняя полоса просто заменяет титр.
//
// Настройки у каждой полосы свои и открываются прямо в ней: у предматчевой и
// перерыва разные минуты, у арены и судей разный показ, и мешать их в один
// список незачем.
//
// Степперы и отсчёты с лица убраны намеренно: они стояли вплотную к зоне, клик
// по которой уходит в эфир, и промах стоил дорого.
export function BroadcastTile({ modes = [] }) {
  if (!modes.length) return null;
  const single = modes.length === 1;

  return (
    <>
      {/* Плитка — отдельная карточка, а не ячейка сплошной сетки: шесть блоков
          включения читаются как шесть самостоятельных пультов, а не как один
          разлинованный лист. */}
      <div className="relative flex flex-col rounded-xl border border-graphite/10 shadow-[0_2px_8px_rgba(0,0,0,0.05)] overflow-hidden select-none bg-white">
        {modes.map(m => <TileBand key={m.key} mode={m} single={single} />)}
      </div>

      <style>{`
        @keyframes shrinkButtonBar {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        .bt-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .bt-inner.bt-flipped { transform: rotateY(180deg); }
        .bt-face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          overflow: hidden;
        }
        .bt-back { transform: rotateY(180deg); }
      `}</style>
    </>
  );
}
