import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Stepper } from '../../ui/Stepper';
import { Select } from '../../ui/Select';



export function AutoPlaylistWidget({ activeStaticOverlay, toggleStaticOverlay, getOverlayPayload }) {
  const optionsMap = {
    'Предматчевая': 'prematch',
    'Перерыв': 'intermission',
    'Лидеры команд': 'team_leaders',
    'Судьи': 'referees',
    'Комментатор': 'commentator',
    'Составы': 'team_roster'
  };
  
  const optionLabels = ['— (Пропустить)', ...Object.keys(optionsMap)];

  const [steps, setSteps] = useState(['Предматчевая', 'Лидеры команд', 'Составы', '— (Пропустить)']);
  const [duration, setDuration] = useState(15);
  const [isLoop, setIsLoop] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const validSequence = useMemo(() => steps.filter(s => s !== '— (Пропустить)').map(s => optionsMap[s]), [steps]);

  const timerRef = useRef(null);
  const expectedOverlayRef = useRef(null); 
  const getPayloadRef = useRef(getOverlayPayload);

  // Всегда сохраняем самую свежую функцию сборки Payload без ре-рендеров
  useEffect(() => {
    getPayloadRef.current = getOverlayPayload;
  }, [getOverlayPayload]);

  // 1. ОСНОВНОЙ ЦИКЛ ПЕРЕКЛЮЧЕНИЯ
  useEffect(() => {
    if (isRunning && validSequence.length > 0) {
      const currentOverlay = validSequence[currentIndex];
      expectedOverlayRef.current = currentOverlay; 
      
      // Динамически запрашиваем актуальные данные (таймеры) прямо перед включением
      const payload = getPayloadRef.current ? getPayloadRef.current(currentOverlay) : null;
      toggleStaticOverlay(currentOverlay, payload, true);

      timerRef.current = setTimeout(() => {
        const nextIndex = currentIndex + 1;
        
        // Если дошли до конца списка
        if (nextIndex >= validSequence.length) {
           if (isLoop) {
               setCurrentIndex(0); // Начинаем заново
           } else {
               setIsRunning(false); // Выключаем автопилот
               setCurrentIndex(0);  // Сбрасываем индекс для следующего запуска
               toggleStaticOverlay(currentOverlay); // СНИМАЕМ С ЭФИРА последнюю плашку
           }
        } else {
           setCurrentIndex(nextIndex); // Идем к следующему
        }
      }, duration * 1000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Игнорируем внешние функции, чтобы цикл не обрывался каждую секунду
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, currentIndex, duration, validSequence, isLoop]); 

  // 2. УМНАЯ ПАУЗА (Сбрасывает автопилот, если режиссер перебил графику руками)
  useEffect(() => {
    if (isRunning) {
      if (expectedOverlayRef.current && activeStaticOverlay !== expectedOverlayRef.current) {
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

  const updateStep = (index, value) => {
    if (isRunning) return;
    const newSteps = [...steps];
    newSteps[index] = value;
    setSteps(newSteps);
  };

  return (
    <div className="bg-white border-b border-graphite/10 p-4 w-full flex flex-col shadow-sm relative z-20">
      
      {/* ШАПКА ВИДЖЕТА */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-graphite/10">
         <div className="flex items-center gap-2">
             <svg className={`w-4 h-4 ${isRunning ? 'text-status-accepted animate-spin-slow' : 'text-graphite/50'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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

      {/* ОСНОВНОЙ БЛОК (Две колонки) */}
      <div className="flex items-stretch gap-6">
          
          {/* Левая колонка (55%): Выбор графики */}
          <div className="w-[55%] flex flex-col gap-3 relative z-30">
             {steps.map((val, idx) => (
                <div key={idx} className={`transition-opacity ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Select 
                        options={optionLabels} 
                        value={val} 
                        onChange={(v) => updateStep(idx, v)} 
                        className="w-full px-3 py-1.5 border-graphite/20"
                    />
                </div>
             ))}
          </div>

          {/* Правая колонка (45%): Настройки времени, Цикл и Кнопка */}
          <div className="w-[45%] flex flex-col justify-between pl-6 border-l border-graphite/10 relative z-10">
             
             <div className={`flex flex-col items-center pt-1 transition-opacity ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-graphite/50 mb-2">
                   Смена через (сек)
                </span>
                <Stepper initialValue={duration} min={5} max={60} onChange={setDuration} />
                
                {/* Чекбокс "Зациклить" */}
                <label className="flex items-center gap-2 mt-3 cursor-pointer group" title="Если выключено, автопилот остановится после последней плашки и уберет ее с экрана">
                   <input 
                      type="checkbox" 
                      checked={isLoop} 
                      onChange={(e) => setIsLoop(e.target.checked)}
                      className="w-3.5 h-3.5 text-status-accepted rounded border-graphite/20 focus:ring-status-accepted focus:ring-offset-0 cursor-pointer"
                   />
                   <span className="text-[9px] font-bold uppercase tracking-widest text-graphite/60 group-hover:text-graphite/80 transition-colors">
                      Зациклить
                   </span>
                </label>
             </div>

             <button
                onClick={handleStartStop}
                disabled={validSequence.length === 0}
                className={`w-full h-[36px] rounded text-[11px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-1.5 mt-auto
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
  );
}