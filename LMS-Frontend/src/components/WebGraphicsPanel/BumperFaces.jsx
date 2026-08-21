import React from 'react';
import { Icon } from '../../ui/Icon';
import { TileHint } from './TileParts';

// Лицо и изнанка плитки «Заставка».
//
// Раньше три слота роликов занимали всю плитку и стояли внутри эфирной кнопки —
// выбор ролика и выход в эфир смешивались в одной зоне. Теперь слоты, сборка
// перехода, скачивание и обрамление живут на изнанке, а лицо показывает ровно
// то, что уйдёт в эфир по нажатию: название выбранного ролика и его длину.
//
// Ролик выбирать не обязательно: с пустым выбором титр отыграет один переход —
// им режиссёр прикрывает переключение сцены в OBS.
//
// Разделение обязанностей прежнее: СЛОТ выбирает, что играть, ПЛИТКА гонит это в
// эфир и снимает. Поэтому вне эфира повторный клик по выбранному слоту снимает
// выбор, а в эфире тот же клик не делает ничего — снять заставку можно только
// эфирной кнопкой на лице.

export function BumperFront({ ready, slots = [], activeSlot, outro, warmup }) {
  if (!ready) {
    return <TileHint muted>Переход не собран — соберите его в настройках</TileHint>;
  }

  const current = slots.find(s => s.slot === activeSlot);
  const hasVideo = !!current?.uploaded;

  // Пока файлы едут в оверлей, вместо длины показываем прогрев: эфирная кнопка в
  // этот момент всё равно придержана, и режиссёр должен видеть, чего он ждёт.
  // Ждём и ролик, и переход — процент по тому, что отстаёт.
  const warmParts = [activeSlot ? warmup?.[activeSlot] : null, warmup?.transition].filter(Boolean);
  const warming = warmParts.some(w => !w.ready);
  const warm = warmParts.length
    ? warmParts.reduce((a, b) => ((a.progress ?? 1) <= (b.progress ?? 1) ? a : b))
    : null;

  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <span className="max-w-full truncate text-[13px] font-black uppercase tracking-wider text-graphite/60">
        {hasVideo ? (current.title || `Ролик ${current.slot}`) : 'Только переход'}
      </span>
      <TileHint muted={!hasVideo || warming}>
        {warming
          ? `Грузится в оверлей — ${Math.round((warm.progress || 0) * 100)} %`
          : hasVideo
            ? `${current.duration || 15} с · ${outro ? 'закрывается переходом' : 'прямая склейка'}`
            : 'Одна шторка без ролика'}
      </TileHint>
    </div>
  );
}

export function BumperBack({
  ready, canBuild, isLive, warmup, slots = [], activeSlot, onSelectSlot,
  onGenerate, onDownload, exporting, exportProgress, downloading,
  outro, onOutroChange,
}) {
  // ---------- ПЕРЕХОД НЕ СОБРАН ----------
  // Слоты не показываем вовсе: выбирать ролик бессмысленно, играть его не с чем.
  if (!ready) {
    return (
      <div className="flex flex-col gap-1">


        {canBuild ? (
          <button
            onClick={onGenerate}
            disabled={exporting}
            className="w-full px-3 py-3 rounded-lg bg-orange/10 text-orange border border-orange/40 hover:bg-orange/20 transition-colors disabled:opacity-50"
          >
            <span className="text-[12px] font-black uppercase tracking-wider">
              {exporting ? `Сборка ${Math.round((exportProgress || 0) * 100)}%` : 'Сгенерировать переход'}
            </span>
          </button>
        ) : (
          // Прозрачность в WebM умеет только Chromium. Прятать кнопку молча значило
          // бы оставить режиссёра гадать, почему заставка не работает.
          <div className="w-full px-2.5 py-2 rounded-lg bg-graphite/5">
            <span className="block text-[10px] font-black uppercase tracking-wider text-graphite/50">
              Сборка недоступна
            </span>
            <span className="block text-[10px] font-bold text-graphite/40 leading-snug mt-1">
              Откройте панель в Chrome, Edge, Opera или Yandex
            </span>
          </div>
        )}
      </div>
    );
  }

  // ---------- ПЕРЕХОД СОБРАН ----------
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        {slots.map(s => {
          const selected = s.slot === activeSlot;
          const onAir = selected && isLive;
          const warm = warmup?.[s.slot] || null;
          const warming = !!warm && !warm.ready;
          return (
            <button
              key={s.slot}
              onClick={() => s.uploaded && onSelectSlot(s.slot)}
              disabled={!s.uploaded}
              title={
                !s.uploaded ? 'В слот не загружен ролик — заливается в настройках лиги'
                  : warming ? 'Ролик ещё качается в оверлей — в эфире был бы стоп-кадр'
                  : onAir ? 'Этот ролик сейчас в эфире. Убрать заставку — эфирной кнопкой на лице плитки'
                  : isLive ? 'Переключить эфир на этот ролик — текущий остановится, новый зайдёт переходом'
                  : selected ? 'Выбран для эфира. Нажмите ещё раз, чтобы снять выбор и играть один переход'
                  : 'Выбрать для эфира'
              }
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors
                ${selected && s.uploaded
                  ? 'bg-status-accepted/15 text-status-accepted'
                  : 'bg-graphite/5 text-graphite/60 hover:bg-graphite/10'}
                disabled:opacity-30 disabled:hover:bg-graphite/5`}
            >
              <span className="text-[12px] font-black tabular-nums w-4 shrink-0">{s.slot}</span>
              <span className="flex-1 min-w-0 truncate text-[12px] font-bold uppercase tracking-wider">
                {s.title || `Ролик ${s.slot}`}
              </span>
              {/* Выбранный слот и слот В ЭФИРЕ — разные вещи: без точки их не
                  отличить, и непонятно, играет ли выбранное прямо сейчас. */}
              {onAir ? (
                <span className="w-2 h-2 rounded-full bg-status-accepted animate-pulse shrink-0" />
              ) : warming ? (
                // Прогрев: файл едет в оверлей. Проценты честнее слова «ждите» —
                // видно, идёт ли дело вообще.
                <span className="text-[11px] font-black tabular-nums shrink-0 text-orange">
                  {Math.round((warm.progress || 0) * 100)} %
                </span>
              ) : (
                <span className="text-[11px] font-bold tabular-nums shrink-0 opacity-60">
                  {s.uploaded ? (s.duration ? `${s.duration}с` : '—') : 'пусто'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Пересборка, скачивание и обрамление. Операции редкие, но на обороте
          места достаточно — кнопки крупные, попасть в них можно и не глядя. */}
      <div className="flex items-center gap-2 pt-2 border-t border-graphite/10">
        {canBuild && (
          <>
            <button
              onClick={onGenerate}
              disabled={exporting}
              title="Пересобрать переход — нужно, если поменялись эмблемы, названия команд или дивизион"
              className="w-10 h-10 rounded-lg flex items-center justify-center text-graphite/35 hover:text-orange hover:bg-orange/10 transition-colors disabled:opacity-40"
            >
              {exporting ? (
                <span className="text-[11px] font-black tabular-nums">{Math.round((exportProgress || 0) * 100)}</span>
              ) : (
                <Icon name="refresh" className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={onDownload}
              disabled={exporting || downloading}
              title="Скачать переход — файл с прозрачным фоном для Stinger-перехода в OBS"
              className="w-10 h-10 rounded-lg flex items-center justify-center text-graphite/35 hover:text-orange hover:bg-orange/10 transition-colors disabled:opacity-40"
            >
              <Icon name="download" className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Переход НА ВЫХОДЕ — кнопка-залипалка. Вход переходом не отключается:
            без него склейка на рекламу видна в эфире. А хвост отжимают, когда
            возврат в игру нужен мгновенный или переключение сцены в OBS уже
            сделано тем же Stinger-переходом. Без выбранного ролика состояние ни
            на что не влияет — играет сам переход, поэтому кнопка приглушена. */}
        <button
          onClick={onOutroChange}
          aria-pressed={outro}
          title={outro
            ? 'Ролик закрывается переходом — нажмите, чтобы картинка возвращалась сразу по его концу'
            : 'Ролик обрывается прямой склейкой — нажмите, чтобы закрыть его переходом'}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors
            ${outro
              ? 'bg-orange/15 text-orange shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]'
              : 'text-graphite/35 hover:text-orange hover:bg-orange/10'}
            ${activeSlot ? '' : 'opacity-40'}`}
        >
          <Icon name="transition" className="w-5 h-5" />
        </button>

        <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-graphite/35">
          {outro ? 'С обрамлением' : 'Без обрамления'}
        </span>
      </div>
    </div>
  );
}
