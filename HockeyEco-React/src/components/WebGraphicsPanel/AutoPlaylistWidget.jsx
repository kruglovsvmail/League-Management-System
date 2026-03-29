import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Stepper } from '../../ui/Stepper';

export function AutoPlaylistWidget({ activeStaticOverlay, toggleStaticOverlay, getOverlayPayload }) {
  const [steps, setSteps] = useState([
    { id: 'init-1', type: 'prematch', label: 'Предматчевая' },
    { id: 'init-2', type: 'team_leaders', label: 'Лидеры команд' },
    { id: 'init-3', type: 'team_roster', label: 'Составы' }
  ]);

  const [duration, setDuration] = useState(15);
  const [isLoop, setIsLoop] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const validSequence = useMemo(() => steps.map(s => s.type), [steps]);
  const effectiveIsLoop = isLoop && validSequence.length > 1;

  const timerRef = useRef(null);
  const expectedOverlayRef = useRef(null); 
  const getPayloadRef = useRef(getOverlayPayload);
  
  const activeOverlayRef = useRef(activeStaticOverlay);
  useEffect(() => { activeOverlayRef.current = activeStaticOverlay; }, [activeStaticOverlay]);

  useEffect(() => {
    getPayloadRef.current = getOverlayPayload;
  }, [getOverlayPayload]);

  useEffect(() => {
    if (isRunning && validSequence.length > 0) {
      const safeIndex = currentIndex >= validSequence.length ? 0 : currentIndex;
      if (safeIndex !== currentIndex) setCurrentIndex(safeIndex);

      const currentOverlay = validSequence[safeIndex];
      expectedOverlayRef.current = currentOverlay; 
      
      const payload = getPayloadRef.current ? getPayloadRef.current(currentOverlay) : null;
      toggleStaticOverlay(currentOverlay, payload, true);

      timerRef.current = setTimeout(() => {
        const nextIndex = safeIndex + 1;
        
        if (nextIndex >= validSequence.length) {
           if (effectiveIsLoop) {
               setCurrentIndex(0); 
           } else {
               setIsRunning(false); 
               setCurrentIndex(0);
               if (activeOverlayRef.current === currentOverlay) {
                   toggleStaticOverlay(currentOverlay); 
               }
           }
        } else {
           setCurrentIndex(nextIndex);
        }
      }, duration * 1000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, currentIndex, duration, validSequence, effectiveIsLoop]); 

  useEffect(() => {
    if (isRunning) {
      if (expectedOverlayRef.current && activeStaticOverlay !== expectedOverlayRef.current && activeStaticOverlay !== null) {
        setIsRunning(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStaticOverlay]); 

  const handleStartStop = () => {
    if (isRunning) {
      setIsRunning(false);
    } else {
      if (validSequence.length > 0) {
        setCurrentIndex(0);
        expectedOverlayRef.current = null;
        setIsRunning(true);
      }
    }
  };

  const handleDropExternal = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (isRunning) return;

    const type = e.dataTransfer.getData('playlist-item');
    const label = e.dataTransfer.getData('playlist-label');
    
    if (type && label) {
      const uniqueId = `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setSteps(prev => [...prev, { id: uniqueId, type, label }]);
    }
  };

  const handleDragStartInternal = (e, index) => {
    if (isRunning) e.preventDefault();
    e.dataTransfer.setData('internal-index', index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropInternal = (e, dropIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (isRunning) return;

    const dragIndex = e.dataTransfer.getData('internal-index');
    
    if (dragIndex !== '') {
       const newSteps = [...steps];
       const [draggedItem] = newSteps.splice(parseInt(dragIndex), 1);
       newSteps.splice(dropIndex, 0, draggedItem);
       setSteps(newSteps);
    } else {
       const type = e.dataTransfer.getData('playlist-item');
       const label = e.dataTransfer.getData('playlist-label');
       
       if (type && label) {
          const uniqueId = `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const newSteps = [...steps];
          newSteps.splice(dropIndex, 0, { id: uniqueId, type, label });
          setSteps(newSteps);
       }
    }
  };

  const removeStep = (idToRemove) => {
    if (isRunning) return;
    setSteps(prev => prev.filter(step => step.id !== idToRemove));
  };

  return (
    <>
      <style>{`
        @keyframes apProgress {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        
        .ap-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .ap-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .ap-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.15);
          border-radius: 4px;
        }
        .ap-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0, 0, 0, 0.3);
        }
      `}</style>

      <div className="bg-white border-b border-graphite/10 p-4 w-full flex flex-col relative z-20 shrink-0">
        
        {/* СТАНДАРТНАЯ ШАПКА ВИДЖЕТА */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-graphite/10">
           <div className="flex items-center gap-2">
               <svg className={`w-4 h-4 ${isRunning ? 'text-status-accepted animate-spin-slow' : 'text-graphite/50'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
               </svg>
               <h3 className="text-[11px] font-black uppercase tracking-widest text-graphite/80 leading-none mt-0.5">
                  Автопилот графики
               </h3>
           </div>
           <div className="flex items-center">
               {isRunning ? (
                   <span className="text-[10px] font-black text-status-accepted uppercase tracking-widest px-2 py-0.5 bg-status-accepted/10 rounded animate-pulse leading-none">
                       Эфир: {currentIndex + 1} из {validSequence.length}
                   </span>
               ) : (
                   <span className="text-[10px] font-bold text-graphite/40 uppercase tracking-widest px-2 py-0.5 leading-none">
                       Выключен
                   </span>
               )}
           </div>
        </div>

        <div className="flex items-stretch gap-6">
            
            <div 
              className={`w-[55%] flex flex-col gap-2 relative z-30 min-h-[140px] max-h-[250px] overflow-y-auto ap-scrollbar pb-4 rounded-lg p-2 transition-all duration-300 border-2 border-dashed
                ${isRunning ? 'opacity-50 pointer-events-none border-transparent bg-transparent' 
                : isDraggingOver ? 'border-status-accepted bg-status-accepted/5' 
                : 'border-graphite/10 bg-gray-bg-light/30'}`}
              onDragOver={(e) => { e.preventDefault(); if (!isRunning) setIsDraggingOver(true); }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleDropExternal}
            >
               {steps.length === 0 && !isRunning && (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-graphite/30 text-center px-4 pointer-events-none">
                    Перетащите графику сюда
                  </div>
               )}

               {steps.map((step, idx) => {
                  const isActiveStep = isRunning && currentIndex === idx;
                  
                  return (
                    <div 
                      key={step.id} 
                      draggable={!isRunning}
                      onDragStart={(e) => handleDragStartInternal(e, idx)}
                      onDragOver={(e) => { e.preventDefault(); if (!isRunning) setIsDraggingOver(true); }}
                      onDrop={(e) => handleDropInternal(e, idx)}
                      className={`relative overflow-hidden flex items-center justify-between bg-white border border-graphite/10 rounded p-2 shadow-sm transition-all
                        ${isActiveStep ? 'ring-1 ring-status-accepted shadow-[0_0_10px_rgba(34,197,94,0.2)]' : ''}
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
                          onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
                          disabled={isRunning}
                          className={`w-5 h-5 flex items-center justify-center rounded transition-colors relative z-10 
                            ${isRunning ? 'opacity-0 pointer-events-none' : 'text-graphite/30 hover:bg-status-rejected/10 hover:text-status-rejected'}`}
                          title="Удалить из плейлиста"
                        >
                           <svg className="w-3 h-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                  );
               })}
            </div>

            <div className="w-[45%] flex flex-col justify-between pl-6 border-l border-graphite/10 relative z-10">
               
               <div className={`flex flex-col items-center pt-1 transition-opacity ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-graphite/50 mb-2">
                     Смена через (сек)
                  </span>
                  <Stepper initialValue={duration} min={5} max={60} onChange={setDuration} />
                  
                  <label className={`flex items-center gap-2 mt-3 group ${validSequence.length <= 1 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} title="Если выключено, автопилот остановится после последней плашки">
                     <input 
                        type="checkbox" 
                        checked={effectiveIsLoop}
                        disabled={validSequence.length <= 1}
                        onChange={(e) => setIsLoop(e.target.checked)}
                        className={`w-3.5 h-3.5 rounded border-graphite/20 focus:ring-status-accepted focus:ring-offset-0 ${validSequence.length <= 1 ? 'cursor-not-allowed bg-graphite/10 text-graphite/30' : 'text-status-accepted cursor-pointer'}`}
                     />
                     <span className="text-[9px] font-bold uppercase tracking-widest text-graphite/60 group-hover:text-graphite/80 transition-colors">
                        Зациклить
                     </span>
                  </label>
               </div>

               <button
                  onClick={handleStartStop}
                  disabled={validSequence.length === 0}
                  className={`w-full h-[36px] rounded-xxl text-[11px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-1.5 mt-auto
                    ${validSequence.length === 0 ? 'bg-gray-bg-light border border-graphite/10 text-graphite/30 cursor-not-allowed'
                    : isRunning ? 'bg-status-rejected text-white hover:bg-status-rejected/90'
                    : 'bg-status-accepted text-white hover:bg-status-accepted/90'}`}
               >
                  {isRunning ? (
                    <>
                       <svg className="w-4 h-4 mb-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                       Остановить
                    </>
                  ) : (
                    <>
                       <svg className="w-4 h-4 mb-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                       Запустить
                    </>
                  )}
               </button>
               
            </div>

        </div>

      </div>
    </>
  );
}