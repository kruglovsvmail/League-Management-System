import React, { useId, useMemo, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Icon } from '../../ui/Icon';

// Лицевая сторона сохраняет отдельные эфирные полосы. Их шестерёнки
// открывают общий оборот плитки на вкладке соответствующего режима.
function TileBand({ mode, single, settingsOpen, onOpenSettings }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: mode.dragType ? `static-${mode.dragType}` : `tile-${mode.key}`,
    data: { type: mode.dragType, label: mode.title, isSource: true },
    disabled: !mode.dragType || settingsOpen,
  });

  const live = !!mode.isLive;
  const progress = mode.progress || null;
  const runKey = progress?.duration ? (progress.runId || progress.duration) : null;

  // Не пересчитываем полосу на каждом обновлении таймера: при перевороте
  // и переключении вкладок уже запущенный показ продолжает идти.
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
      style={{ flexGrow: mode.grow ?? 1, opacity: isDragging ? 0.5 : 1 }}
      className="relative basis-0 min-h-0 border-b border-graphite/10 last:border-b-0 outline-none"
    >
      <div
        onClick={mode.airDisabled || settingsOpen ? undefined : mode.onAir}
        role="button"
        tabIndex={settingsOpen ? -1 : 0}
        className={`absolute inset-0 flex flex-col items-center justify-center text-center px-4 py-3 overflow-hidden transition-colors duration-200
          ${live ? 'bg-status-accepted/10 shadow-[inset_0_0_24px_rgba(34,197,94,0.12)]' : 'bg-white hover:bg-graphite/5'}
          ${mode.airDisabled ? 'cursor-default' : 'cursor-pointer'}`}
        title={mode.airTitle || (live ? 'Нажмите, чтобы убрать из эфира' : 'Нажмите, чтобы вывести в эфир')}
      >
        {live && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-status-accepted/20">
            {progressStyle ? (
              <div key={`bt-progress-${mode.key}-${runKey}`} className="h-full bg-status-accepted w-full origin-left" style={progressStyle}/>
            ) : (
              <div className="h-full bg-status-accepted w-full"/>
            )}
          </div>
        )}
        <span className={`max-w-full truncate text-[18px] font-black uppercase tracking-widest leading-tight ${live ? 'text-status-accepted' : 'text-graphite/70'}`}>
          {mode.title}
        </span>
        {mode.front && <div className={`w-full min-w-0 ${single ? 'mt-3' : 'mt-2'}`}>{mode.front}</div>}
        {live && (
          <span className="absolute bottom-2 right-3 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-status-accepted animate-pulse"/>
            <span className="text-[9px] font-black uppercase tracking-widest text-status-accepted">Эфир</span>
          </span>
        )}
      </div>

      <button
        type="button"
        ref={setActivatorNodeRef}
        {...listeners}
        onContextMenu={e => { if (mode.dragType) e.preventDefault(); }}
        disabled={!mode.dragType || settingsOpen}
        title={mode.dragType ? `Перетащите «${mode.title}» в плейлист автопилота` : 'Эту плашку автопилот не показывает'}
        className={`absolute bottom-2 left-2 z-20 w-9 h-9 rounded-lg flex items-center justify-center transition-colors touch-none
          ${mode.dragType ? 'text-graphite/25 hover:text-orange hover:bg-orange/10 cursor-grab active:cursor-grabbing' : 'text-graphite/10 cursor-not-allowed'}`}
      >
        <Icon name="grip" className="w-5 h-5"/>
      </button>

      {mode.back && (
        <button
          type="button"
          onClick={() => onOpenSettings(mode.key)}
          disabled={settingsOpen}
          title={`Настройки: ${mode.title}`}
          className="absolute top-2 right-2 z-20 w-9 h-9 rounded-lg flex items-center justify-center text-graphite/25 hover:text-orange hover:bg-orange/10 transition-colors"
        >
          <Icon name="gear" className="w-5 h-5"/>
        </button>
      )}
    </div>
  );
}

// Два слова размещаются на разных строках. В более длинных названиях
// выбираем близкую к середине границу, сохраняя предлог со следующим словом.
// Мягкий дефис виден только при переносе слова на следующую строку.
const TAB_HYPHENS = {
  'лидеры': 'ли\u00adде\u00adры',
  'сравнение': 'срав\u00adне\u00adние',
  'команд': 'ко\u00adманд',
  'сетка': 'сет\u00adка',
  'турнирная': 'тур\u00adнир\u00adная',
  'таблица': 'таб\u00adли\u00adца',
  'табло': 'таб\u00adло',
  'центру': 'цен\u00adтру',
  'матча': 'мат\u00adча',
  'перерыв': 'пе\u00adре\u00adрыв',
  'арена': 'аре\u00adна',
  'комментаторы': 'ком\u00adмен\u00adта\u00adто\u00adры',
  'судьи': 'су\u00adдьи',
  'составы': 'со\u00adста\u00adвы',
  'номинации': 'но\u00adми\u00adна\u00adции',
};
const hyphenateTabLine = line => line.split(/(\s+)/).map(word => TAB_HYPHENS[word.toLowerCase()] || word).join('');

function settingsTabLines(title) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words;
  if (words.length === 2) return words;
  const prepositions = new Set(['в', 'во', 'на', 'по', 'и', 'с', 'за', 'до', 'из', 'от', 'к', 'для']);
  let split = 1, difference = Infinity;
  for (let i = 1; i < words.length; i++) {
    if (prepositions.has(words[i - 1].toLowerCase())) continue;
    const delta = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (delta < difference) { difference = delta; split = i; }
  }
  return [words.slice(0, split).join(' '), words.slice(split).join(' ')];
}

export function BroadcastTile({ modes = [] }) {
  const id = useId();
  const [flipped, setFlipped] = useState(false);
  const [settingsKey, setSettingsKey] = useState(() => modes.find(mode => mode.back)?.key ?? null);
  const tabRefs = useRef({});
  const settingsModes = modes.filter(mode => mode.back);
  const selectedMode = settingsModes.find(mode => mode.key === settingsKey) || settingsModes[0];
  const single = modes.length === 1;

  const openSettings = key => {
    setSettingsKey(key);
    setFlipped(true);
  };
  const moveTab = (event, key) => {
    const index = settingsModes.findIndex(mode => mode.key === key);
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % settingsModes.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + settingsModes.length) % settingsModes.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = settingsModes.length - 1;
    else return;
    event.preventDefault();
    const target = settingsModes[next];
    if (!target) return;
    setSettingsKey(target.key);
    tabRefs.current[target.key]?.focus();
  };

  if (!modes.length) return null;

  return (
    <>
      <div
        className="relative flex flex-col min-h-0 rounded-xl border border-graphite/10 shadow-[0_2px_8px_rgba(0,0,0,0.05)] overflow-hidden select-none bg-white"
        style={{ perspective: '1000px' }}
      >
        <div className={`bt-inner flex-1 min-h-0 ${flipped ? 'bt-flipped' : ''}`} style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
          <div className={`bt-face flex flex-col ${flipped ? 'pointer-events-none' : ''}`} aria-hidden={flipped}>
            {modes.map(mode => (
              <TileBand key={mode.key} mode={mode} single={single} settingsOpen={flipped} onOpenSettings={openSettings}/>
            ))}
          </div>

          {!!settingsModes.length && (
            <div className={`bt-face bt-back flex flex-col bg-[#f2f3f5] ${flipped ? '' : 'pointer-events-none'}`} aria-hidden={!flipped}>
              <div className={`flex items-center shrink-0 ${single ? "justify-between pl-3 pr-2 pt-2" : "gap-1 p-2 border-b border-graphite/10"}`}>
                {single ? (
                  <span className="flex-1 min-w-0 truncate text-[10px] font-black uppercase tracking-widest text-graphite/45">{selectedMode?.title}</span>
                ) : (
                  <div role="tablist" aria-label="Настройки плашек" className="flex-1 min-w-0 grid gap-1" style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}>
                    {modes.map(mode => {
                      const selected = mode.key === selectedMode?.key;
                      const lines = settingsTabLines(mode.title);
                      return (
                        <button
                          type="button"
                          role="tab"
                          key={mode.key}
                          ref={node => { tabRefs.current[mode.key] = node; }}
                          id={`${id}-tab-${mode.key}`}
                          aria-controls={`${id}-panel-${mode.key}`}
                          aria-selected={selected}
                          tabIndex={selected && flipped ? 0 : -1}
                          disabled={!mode.back || !flipped}
                          title={mode.back ? mode.title : `${mode.title}: настройки не требуются`}
                          onClick={() => setSettingsKey(mode.key)}
                          onKeyDown={event => moveTab(event, mode.key)}
                          className={`relative min-w-0 min-h-[52px] px-2 py-2 rounded-lg flex flex-col items-center justify-center text-[11px] font-black uppercase tracking-[0.04em] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40
                            ${selected ? 'bg-white text-orange shadow-sm' : 'text-graphite/50 hover:bg-white/60 hover:text-graphite/70'} ${!mode.back ? 'opacity-30' : ''}`}
                        >
                          {lines.map((line, i) => <span key={i} lang="ru" className="block w-full min-w-0 whitespace-normal text-center" style={{ hyphens: "auto" }}>{hyphenateTabLine(line)}</span>)}
                          {mode.isLive && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-status-accepted" title="В эфире"/>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setFlipped(false)}
                  disabled={!flipped}
                  title="Вернуться к эфирным кнопкам"
                  aria-label="Закрыть настройки"
                  className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-graphite/40 hover:text-orange hover:bg-orange/10 transition-colors"
                >
                  <Icon name="close" className="w-5 h-5"/>
                </button>
              </div>

              {/* Все разделы остаются смонтированными: переключение вкладок не перемонтирует их настройки. */}
              {settingsModes.map(mode => {
                const selected = mode.key === selectedMode?.key;
                return (
                  <div
                    key={mode.key}
                    id={`${id}-panel-${mode.key}`}
                    role={single ? undefined : 'tabpanel'}
                    aria-labelledby={single ? undefined : `${id}-tab-${mode.key}`}
                    hidden={!selected}
                    className={`flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col ${single ? "" : "pt-3"}`}
                    style={{ display: selected ? 'flex' : 'none' }}
                  >
                    <fieldset disabled={!flipped || !selected} aria-label={`Настройки: ${mode.title}`} className="m-auto w-full min-w-0 p-0 border-0">
                      {mode.back}
                    </fieldset>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shrinkButtonBar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
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
