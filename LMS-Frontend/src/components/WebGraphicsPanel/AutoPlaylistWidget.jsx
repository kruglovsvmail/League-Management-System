import React, { useMemo } from 'react';
import { Stepper } from '../../ui/Stepper';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Вспомогательный компонент для каждого элемента плейлиста
function SortablePlaylistItem({ step, isActiveStep, isRunning, onRemove, duration }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
    data: { type: 'playlist-item', step },
    disabled: isRunning // Отключаем перетаскивание, когда эфир запущен
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative overflow-hidden flex items-center justify-between bg-white border rounded p-2 shadow-sm transition-colors
        ${isActiveStep ? 'border-status-accepted ring-1 ring-status-accepted shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'border-graphite/10'}
        ${!isRunning ? 'hover:border-graphite/30 cursor-grab active:cursor-grabbing' : ''}`}
    >
        {isActiveStep && (
           <div className="absolute bottom-0 left-0 w-full h-1 bg-status-accepted/20">
              <div
                 key={`progress-${step.id}-${duration}`}
                 className="h-full bg-status-accepted origin-left w-full"
                 style={{ animation: `apProgress ${duration}s linear forwards` }}
              ></div>
           </div>
        )}

        <div className="flex items-center gap-2 overflow-hidden relative z-10 pointer-events-none">
           <svg className={`w-3.5 h-3.5 shrink-0 ${isRunning ? 'text-graphite/10' : 'text-graphite/20'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
             <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
           </svg>
           <span className={`text-[11px] font-bold uppercase tracking-wider truncate ${isActiveStep ? 'text-status-accepted' : 'text-graphite/80'}`}>
              {step.label}
           </span>
        </div>

        <button
          onPointerDown={(e) => e.stopPropagation()} // Важно: предотвращаем конфликт DND и клика
          onClick={(e) => { e.stopPropagation(); onRemove(step.id); }}
          disabled={isRunning}
          className={`w-5 h-5 flex items-center justify-center rounded transition-colors relative z-10
            ${isRunning ? 'opacity-0 pointer-events-none' : 'text-graphite/30 hover:bg-status-rejected/10 hover:text-status-rejected'}`}
          title="Удалить из плейлиста"
        >
           <svg className="w-3 h-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
    </div>
  );
}

// Вкладка «Автопилот»: плейлист плашек и параметры его прокрутки.
//
// Плашки прилетают сюда перетаскиванием ЗА ХВАТАЛКУ плитки. Пока идёт
// перетаскивание, панель сама открывает эту вкладку — иначе бросать было бы
// некуда: соседние вкладки в этот момент не смонтированы.
export function AutoPlaylistWidget({
  steps, setSteps,                 // плейлист (конфиг)
  duration, setDuration,           // длительность шага (конфиг)
  isLoop, setIsLoop,               // зациклить (конфиг)
  isRunning, currentIndex,         // рантайм с СЕРВЕРА (только отображаем)
  onStart, onStop                  // старт/стоп серверного автопилота
}) {

  const validSequence = useMemo(() => steps.map(s => s.type), [steps]);
  const effectiveIsLoop = isLoop && validSequence.length > 1;

  // Превращаем панель в зону дропа
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: 'playlist-container',
    data: { isPlaylistContainer: true }
  });

  // Цикл крутится на СЕРВЕРЕ — панель лишь отправляет команду старт/стоп.
  const handleStartStop = () => {
    if (isRunning) onStop?.();
    else if (validSequence.length > 0) onStart?.();
  };

  const removeStep = (idToRemove) => {
    if (isRunning) return;
    setSteps(prev => prev.filter(step => step.id !== idToRemove));
  };

  return (
    <>
      <style>{`
        @keyframes apProgress { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        .ap-scrollbar::-webkit-scrollbar { width: 4px; }
        .ap-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .ap-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(0, 0, 0, 0.15); border-radius: 4px; }
        .ap-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(0, 0, 0, 0.3); }
      `}</style>

      <div className="h-full flex flex-col bg-white min-h-0">

        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-graphite/10 shrink-0">
           <svg className={`w-4 h-4 shrink-0 ${isRunning ? 'text-status-accepted' : 'text-graphite/40'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
           </svg>
           {isRunning ? (
               <span className="text-[10px] font-black text-status-accepted uppercase tracking-widest px-2 py-0.5 bg-status-accepted/10 rounded animate-pulse leading-none">
                   Эфир: {currentIndex + 1} из {validSequence.length}
               </span>
           ) : (
               <span className="text-[10px] font-bold text-graphite/40 uppercase tracking-widest leading-none">
                   Выключен
               </span>
           )}
        </div>

        <div
          ref={setDroppableRef}
          className={`flex-1 min-h-0 m-3 flex flex-col gap-2 overflow-y-auto ap-scrollbar rounded-lg p-2 relative transition-colors duration-300 border-2 border-dashed
            ${isRunning ? 'opacity-50 pointer-events-none border-transparent bg-transparent'
            : isOver ? 'border-status-accepted bg-status-accepted/5'
            : 'border-graphite/10 bg-gray-bg-light/30'}`}
        >
           {steps.length === 0 && !isRunning && (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-graphite/30 text-center px-4 pointer-events-none">
                Перетащите сюда плашку за хваталку
              </div>
           )}

           <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
             {steps.map((step, idx) => (
                <SortablePlaylistItem
                  key={step.id}
                  step={step}
                  isActiveStep={isRunning && currentIndex === idx}
                  isRunning={isRunning}
                  onRemove={removeStep}
                  duration={duration}
                />
             ))}
           </SortableContext>
        </div>

        <div className="shrink-0 px-4 pb-4 pt-3 border-t border-graphite/10 flex flex-col gap-3">
           {/* Настройки цикла и кнопка запуска разведены отступом: кнопка крупная и
               уходит в эфир, тянуться к ней вслепую мимо степпера не должно быть
               возможно. */}
           <div className={`flex items-center justify-between gap-3 transition-opacity ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-graphite/50">
                 Смена через (сек)
              </span>
              <Stepper initialValue={duration} min={5} max={60} onChange={setDuration} />
           </div>

           <label className={`flex items-center gap-2 group ${validSequence.length <= 1 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} title="Если выключено, автопилот остановится после последней плашки">
              <input
                 type="checkbox"
                 checked={effectiveIsLoop}
                 disabled={validSequence.length <= 1 || isRunning}
                 onChange={(e) => setIsLoop(e.target.checked)}
                 className={`w-3.5 h-3.5 rounded border-graphite/20 focus:ring-status-accepted focus:ring-offset-0 ${validSequence.length <= 1 ? 'cursor-not-allowed bg-graphite/10 text-graphite/30' : 'text-status-accepted cursor-pointer'}`}
              />
              <span className="text-[9px] font-bold uppercase tracking-widest text-graphite/60 group-hover:text-graphite/80 transition-colors">
                 Зациклить
              </span>
           </label>

           <button
              onClick={handleStartStop}
              disabled={validSequence.length === 0}
              className={`w-full h-[72px] mt-5 rounded-lg text-[13px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-1.5
                ${validSequence.length === 0 ? 'bg-gray-bg-light border border-graphite/10 text-graphite/30 cursor-not-allowed'
                : isRunning ? 'bg-status-rejected text-white hover:bg-status-rejected/90'
                : 'bg-status-accepted text-white hover:bg-status-accepted/90'}`}
           >
              {isRunning ? 'Остановить' : 'Запустить'}
           </button>
        </div>

      </div>
    </>
  );
}
