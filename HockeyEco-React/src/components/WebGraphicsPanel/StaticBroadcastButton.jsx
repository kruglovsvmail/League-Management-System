import React from 'react';
import { Stepper } from '../../ui/Stepper';

export function StaticBroadcastButton({ 
  title, description, isActive, onClick, 
  dragType, // Идентификатор для Drag & Drop
  hasTimer = false, timerValue = 2, onTimerChange, timerDisplay, isTimerCritical,
  isTimerRunning, onTimerStart, onTimerPause,
  hasStepper = false, stepperLabel = "", stepperValue = 0, onStepperChange, stepperMin = 0, stepperMax = 99,
  progressType = null, progressDuration = 0
}) {
  return (
    <>
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        className={`relative cursor-pointer flex flex-col items-center justify-center text-center transition-colors duration-200 border-r border-b border-graphite/20 outline-none select-none overflow-hidden group
          ${hasTimer ? 'p-2' : hasStepper ? 'p-3' : 'p-5'} 
          ${isActive 
            ? 'bg-status-accepted/10 shadow-[inset_0_0_20px_rgba(34,197,94,0.1)]' 
            : 'bg-white hover:bg-graphite/5'
          }
        `}
        title={isActive ? "Нажмите, чтобы убрать из эфира" : "Нажмите, чтобы вывести графику в эфир"}
      >
        
        {/* Хваталка для перетаскивания (Drag & Drop) */}
        {dragType && (
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('playlist-item', dragType);
              e.dataTransfer.setData('playlist-label', title);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={(e) => e.stopPropagation()}
            className={`absolute top-2 left-2 p-1.5 rounded cursor-grab active:cursor-grabbing z-10 transition-opacity duration-200 
              ${isActive ? 'text-status-accepted/50 hover:bg-status-accepted/10 hover:text-status-accepted' : 'text-graphite/20 hover:bg-graphite/10 hover:text-graphite/60 opacity-0 group-hover:opacity-100'}
            `}
            title="Потяните, чтобы добавить в плейлист автопилота"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/>
              <circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
            </svg>
          </div>
        )}

        {/* Маркер активного состояния (Статичный или Анимированный для Арены) */}
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
            <div className="flex items-center justify-center gap-4 mb-3" onClick={e => e.stopPropagation()}>
              <span className={`font-mono text-2xl font-black leading-none min-w-[70px] text-right ${isTimerCritical ? 'text-status-rejected animate-pulse' : 'text-graphite/60'}`}>
                {timerDisplay}
              </span>
              
              {isTimerRunning ? (
                <button 
                  onClick={onTimerPause} 
                  className="h-6 px-2 rounded-full bg-status-rejected text-white hover:bg-status-rejected/90 transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95" 
                  title="Поставить таймер на паузу"
                >
                  <span className="text-[10px] font-black uppercase tracking-widest mt-0.5">Пауза</span>
                </button>
              ) : (
                <button 
                  onClick={onTimerStart} 
                  className="h-6 px-2 rounded-full bg-status-accepted text-white hover:bg-status-accepted/90 transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95" 
                  title="Запустить таймер"
                >
                 <span className="text-[10px] font-black uppercase tracking-widest mt-0.5">Старт</span>
                </button>
              )}
            </div>

            <div onClick={e => e.stopPropagation()} className="cursor-default mt-1">
               <Stepper initialValue={timerValue} min={1} max={30} onChange={onTimerChange} />
            </div>
          </>
        ) : hasStepper ? (
          <>
            <div className="flex flex-col items-center justify-center w-full">
               <span className="text-[10px] font-bold uppercase tracking-widest text-graphite/40 mb-2 mt-1">{stepperLabel}</span>
               <div onClick={e => e.stopPropagation()} className="cursor-default">
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