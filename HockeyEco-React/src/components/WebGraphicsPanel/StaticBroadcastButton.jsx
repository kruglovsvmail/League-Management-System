import React from 'react';
import { Stepper } from '../../ui/Stepper';
import { useDraggable } from '@dnd-kit/core';

export function StaticBroadcastButton({ 
  title, description, isActive, onClick, 
  dragType, // Идентификатор для Drag & Drop
  hasTimer = false, timerValue = 2, onTimerChange, timerDisplay, isTimerCritical,
  isTimerRunning, onTimerStart, onTimerPause,
  hasStepper = false, stepperLabel = "", stepperValue = 0, onStepperChange, stepperMin = 0, stepperMax = 99,
  progressType = null, progressDuration = 0
}) {

  // --- Инициализация dnd-kit ---
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragType ? `static-${dragType}` : `static-unknown-${title}`,
    data: { 
      type: dragType, 
      label: title,
      isSource: true // Флаг для отличия плашек доноров от элементов плейлиста
    },
    disabled: !dragType, // Отключаем drag, если идентификатор не задан
  });

  // Стили для предотвращения системных конфликтов при удержании
  const style = {
    opacity: isDragging ? 0.5 : 1,
    WebkitTouchCallout: 'none', // Запрет системного меню/лупы на iOS
    WebkitUserSelect: 'none',   // Запрет выделения текста
    userSelect: 'none',
    touchAction: 'none'         // Предотвращение скролла страницы при захвате плашки
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}   
        {...attributes}  
        onClick={onClick}
        onContextMenu={(e) => {
          // Блокируем контекстное меню браузера при долгом нажатии.
          // Это предотвращает прерывание (touchcancel) сессии перетаскивания.
          if (dragType) e.preventDefault();
        }}
        role="button"
        tabIndex={0}
        className={`relative flex flex-col items-center justify-center text-center transition-colors duration-200 border-r border-b border-graphite/20 outline-none select-none overflow-hidden group touch-none
          ${hasTimer ? 'p-2' : hasStepper ? 'p-3' : 'p-5'} 
          ${isActive 
            ? 'bg-status-accepted/10 shadow-[inset_0_0_20px_rgba(34,197,94,0.1)]' 
            : 'bg-white hover:bg-graphite/5'
          }
          ${dragType && !isDragging ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
        `}
        title={isActive ? "Нажмите, чтобы убрать из эфира" : "Удерживайте для автопилота или нажмите для эфира"}
      >
        
        {/* Индикатор прогресса для активных плашек (например, Арена или Комментатор) */}
        {isActive && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-status-accepted/20">
             {progressType === 'once' ? (
                <div 
                  key={`once-${progressDuration}`} 
                  className="h-full bg-status-accepted w-full origin-left" 
                  style={{ animation: `shrinkButtonBar ${progressDuration}s linear forwards` }}
                ></div>
             ) : (
                <div className="h-full bg-status-accepted w-full"></div>
             )}
          </div>
        )}

        <span className={`text-[16px] font-black uppercase tracking-widest leading-tight ${hasTimer || hasStepper ? 'mb-5' : 'mb-2'} ${isActive ? 'text-status-accepted' : 'text-graphite/70'}`}>
          {title}
        </span>
        
        {hasTimer ? (
          <>
            <div 
              onPointerDown={e => e.stopPropagation()} // Защита: нажатие на кнопки не запускает Drag
              onClick={e => e.stopPropagation()}       // Защита: клик по кнопкам не триггерит onClick всей плашки
              className="flex items-center justify-center gap-4 mb-3" 
            >
              <span className={`font-mono text-2xl font-black leading-none min-w-[70px] text-right ${isTimerCritical ? 'text-status-rejected animate-pulse' : 'text-graphite/60'}`}>
                {timerDisplay}
              </span>
              
              {isTimerRunning ? (
                <button 
                  onClick={onTimerPause} 
                  className="h-6 px-2 rounded-full bg-status-rejected text-white hover:bg-status-rejected/90 transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 z-10 relative"
                >
                  <span className="text-[10px] font-black uppercase tracking-widest mt-0.5">Пауза</span>
                </button>
              ) : (
                <button 
                  onClick={onTimerStart} 
                  className="h-6 px-2 rounded-full bg-status-accepted text-white hover:bg-status-accepted/90 transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 z-10 relative"
                >
                 <span className="text-[10px] font-black uppercase tracking-widest mt-0.5">Старт</span>
                </button>
              )}
            </div>

            <div 
              onPointerDown={e => e.stopPropagation()} 
              onClick={e => e.stopPropagation()} 
              className="cursor-default mt-1 z-10 relative"
            >
               <Stepper initialValue={timerValue} min={1} max={30} onChange={onTimerChange} />
            </div>
          </>
        ) : hasStepper ? (
          <>
            <div className="flex flex-col items-center justify-center w-full z-10 relative">
               <span className="text-[10px] font-bold uppercase tracking-widest text-graphite/40 mb-2 mt-1">{stepperLabel}</span>
               <div 
                 onPointerDown={e => e.stopPropagation()} 
                 onClick={e => e.stopPropagation()} 
                 className="cursor-default"
               >
                 <Stepper initialValue={stepperValue} min={stepperMin} max={stepperMax} onChange={onStepperChange} />
               </div>
            </div>
          </>
        ) : (
          <span className="text-[10px] font-bold text-graphite/40 leading-tight px-4 max-w-full truncate">
            {description}
          </span>
        )}

        {isActive && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-status-accepted animate-pulse"></span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shrinkButtonBar {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </>
  );
}