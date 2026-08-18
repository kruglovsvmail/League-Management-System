import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Icon } from '../../ui/Icon';

// Плитка «Заставка»: кнопка эфира и три слота роликов внутри неё.
//
// Отдельный компонент, а не StaticBroadcastButton со степпером: у степпера
// значение — число, а здесь выбор из именованных вариантов, и режиссёру важно
// видеть названия («Партнёр А»), а не цифры.
//
// У плитки два состояния. Пока переход матча не собран, слоты не показываются
// вовсе — выбирать ролик бессмысленно, играть его не с чем; вместо них крупное
// пояснение и кнопка сборки. После сборки плитка становится рабочей: слоты
// занимают всё место, а пересборка и скачивание уходят в мелкие иконки внизу —
// это редкие операции, и место эфирных кнопок им ни к чему.
//
// Ролик выбирать не обязательно: с пустым выбором титр отыграет один переход —
// им режиссёр прикрывает переключение сцены в OBS. Повторный клик по выбранному
// слоту снимает выбор.
//
// Вход в ролик всегда идёт переходом, отключается только выход — третьей
// иконкой в нижнем ряду.
export function BumperBroadcastButton({
  slots = [], activeSlot, onSelectSlot, isActive, onClick, progressDuration = 0, runId = 0,
  onGenerate, onDownload, transition = null,
  exporting = false, exportProgress = 0, downloading = false, exportSupport = null,
  outro = true, onOutroChange,
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'static-bumper',
    data: { type: 'bumper', label: 'Заставка', isSource: true },
  });

  const style = {
    opacity: isDragging ? 0.5 : 1,
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
    touchAction: 'none',
  };

  const ready = !!transition;
  const canBuild = exportSupport?.supported;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={ready ? onClick : undefined}
      onContextMenu={(e) => e.preventDefault()}
      role="button"
      tabIndex={0}
      className={`relative flex flex-col items-center justify-center text-center transition-colors duration-200 border-r border-b border-graphite/20 outline-none select-none overflow-hidden p-3 touch-none
        ${isActive ? 'bg-status-accepted/10 shadow-[inset_0_0_20px_rgba(34,197,94,0.1)]' : 'bg-white hover:bg-graphite/5'}
        ${ready ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
      `}
      title={ready
        ? (isActive ? 'Нажмите, чтобы убрать из эфира' : 'Удерживайте для автопилота или нажмите для эфира')
        : 'Соберите переход, чтобы заставка стала доступна'}
    >
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-status-accepted/20">
          <div
            key={`bumper-${runId}`}
            className="h-full bg-status-accepted w-full origin-left"
            style={{ animation: `shrinkButtonBar ${progressDuration}s linear forwards` }}
          />
        </div>
      )}

      <span className={`text-[16px] font-black uppercase tracking-widest leading-tight ${ready ? 'mb-4' : 'mb-3'} ${isActive ? 'text-status-accepted' : 'text-graphite/70'}`}>
        Заставка
      </span>

      {/* ---------- ПЕРЕХОД НЕ СОБРАН ---------- */}
      {!ready && (
        <div
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className="flex flex-col items-center gap-3 w-full px-3 z-10 relative"
        >
          <p className="text-[11px] font-bold text-graphite/50 leading-snug">
            Заставка недоступна, пока не собран переход этого матча — с эмблемами команд и дивизионом
          </p>

          {canBuild ? (
            <button
              onClick={onGenerate}
              disabled={exporting}
              className="w-full px-4 py-2.5 rounded-lg bg-orange/10 text-orange border border-orange/40 hover:bg-orange/20 transition-colors disabled:opacity-50"
            >
              <span className="text-[12px] font-black uppercase tracking-wider">
                {exporting ? `Сборка ${Math.round((exportProgress || 0) * 100)}%` : 'Сгенерировать переход'}
              </span>
            </button>
          ) : (
            // Прозрачность в WebM умеет только Chromium. Прятать кнопку молча
            // значило бы оставить режиссёра гадать, почему заставка не работает.
            <div className="w-full px-3 py-2.5 rounded-lg bg-graphite/5">
              <span className="block text-[11px] font-black uppercase tracking-wider text-graphite/50">
                Сборка недоступна
              </span>
              <span className="block text-[10px] font-bold text-graphite/40 leading-snug mt-1">
                Откройте панель в Chrome, Edge, Opera или Yandex
              </span>
            </div>
          )}
        </div>
      )}

      {/* ---------- ПЕРЕХОД СОБРАН ---------- */}
      {ready && (
        <div
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className="flex flex-col gap-1.5 w-full max-w-[260px] z-10 relative"
        >
          {slots.map(s => {
            const selected = s.slot === activeSlot;
            return (
              <button
                key={s.slot}
                onClick={() => s.uploaded && onSelectSlot(s.slot)}
                disabled={!s.uploaded}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors
                  ${selected && s.uploaded
                    ? 'bg-status-accepted/15 text-status-accepted'
                    : 'bg-graphite/5 text-graphite/60 hover:bg-graphite/10'}
                  disabled:opacity-30 disabled:hover:bg-graphite/5`}
              >
                <span className="text-[10px] font-black tabular-nums w-3 shrink-0">{s.slot}</span>
                <span className="flex-1 min-w-0 truncate text-[11px] font-bold uppercase tracking-wider">
                  {s.title || `Ролик ${s.slot}`}
                </span>
                <span className="text-[10px] font-bold tabular-nums shrink-0 opacity-60">
                  {s.uploaded ? (s.duration ? `${s.duration}с` : '—') : 'пусто'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Нижний ряд: пересборка, скачивание и обрамление — редкие операции,
          поэтому мелкими иконками, чтобы не спорить со слотами и кнопкой эфира. */}
      {ready && (
        <div
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className="absolute bottom-2 left-2 flex items-center gap-1 z-20"
        >
          {canBuild && (
            <>
              <button
                onClick={onGenerate}
                disabled={exporting}
                title="Пересобрать переход — нужно, если поменялись эмблемы, названия команд или дивизион"
                className="w-7 h-7 rounded-md flex items-center justify-center text-graphite/35 hover:text-orange hover:bg-orange/10 transition-colors disabled:opacity-40"
              >
                {exporting ? (
                  <span className="text-[9px] font-black tabular-nums">{Math.round((exportProgress || 0) * 100)}</span>
                ) : (
                  <Icon name="refresh" className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                onClick={onDownload}
                disabled={exporting || downloading}
                title="Скачать переход — файл с прозрачным фоном для Stinger-перехода в OBS"
                className="w-7 h-7 rounded-md flex items-center justify-center text-graphite/35 hover:text-orange hover:bg-orange/10 transition-colors disabled:opacity-40"
              >
                <Icon name="download" className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Переход НА ВЫХОДЕ — кнопка-залипалка. Вход переходом не
              отключается: без него склейка на рекламу видна в эфире. А хвост
              отжимают, когда возврат в игру нужен мгновенный или переключение
              сцены в OBS уже сделано тем же Stinger-переходом. Без выбранного
              ролика состояние ни на что не влияет — играет сам переход, поэтому
              кнопка приглушена. */}
          <button
            onClick={onOutroChange}
            aria-pressed={outro}
            title={outro
              ? 'Ролик закрывается переходом — нажмите, чтобы картинка возвращалась сразу по его концу'
              : 'Ролик обрывается прямой склейкой — нажмите, чтобы закрыть его переходом'}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors
              ${outro
                ? 'bg-orange/15 text-orange shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]'
                : 'text-graphite/35 hover:text-orange hover:bg-orange/10'}
              ${activeSlot ? '' : 'opacity-40'}`}
          >
            <Icon name="transition" className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isActive && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-status-accepted animate-pulse" />
        </div>
      )}
    </div>
  );
}
