import React from 'react';
import { Stepper } from '../../ui/Stepper';

export function StaticBroadcastButton({ 
  title, description, isActive, onClick, 
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
        className={`relative cursor-pointer flex flex-col items-center justify-center text-center transition-colors duration-200 border-r border-b border-graphite/20 outline-none select-none overflow-hidden
          ${hasTimer ? 'p-2' : hasStepper ? 'p-3' : 'p-5'} 
          ${isActive 
            ? 'bg-status-accepted/10 shadow-[inset_0_0_20px_rgba(34,197,94,0.1)]' 
            : 'bg-white hover:bg-graphite/5'
          }
        `}
        title={isActive ? "Нажмите, чтобы убрать из эфира" : "Нажмите, чтобы вывести графику в эфир"}
      >
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
            <div className="flex items-center justify-center gap-3 mb-2" onClick={e => e.stopPropagation()}>
              <span className={`font-mono text-3xl font-black leading-none ${isTimerCritical ? 'text-status-rejected animate-pulse' : 'text-graphite/50'}`}>
                {timerDisplay}
              </span>
              
              {isTimerRunning ? (
                <button onClick={onTimerPause} className="w-8 h-8 rounded bg-status-rejected/10 text-status-rejected hover:bg-status-rejected hover:text-white transition-colors flex items-center justify-center shadow-sm" title="Пауза">
                   <svg className="w-1 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                </button>
              ) : (
                <button onClick={onTimerStart} className="w-8 h-8 rounded bg-status-accepted/10 text-status-accepted hover:bg-status-accepted hover:text-white transition-colors flex items-center justify-center shadow-sm" title="Старт">
                   <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                </button>
              )}
            </div>

            <div onClick={e => e.stopPropagation()} className="cursor-default">
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