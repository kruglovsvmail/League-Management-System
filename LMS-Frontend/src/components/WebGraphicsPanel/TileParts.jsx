import React from 'react';
import { Stepper } from '../../ui/Stepper';

// Мелкие детали плиток эфира: что показывает лицо и как выглядит настройка на
// изнанке. Вынесены отдельно, потому что повторяются во всех плитках — и лицо
// обязано оставаться сугубо справочным: ни одного органа управления, только
// текущее значение.

// Справочная строка лица: «смена 8 с», «показ 10 с», состояние отсчёта.
export function TileHint({ children, muted = false }) {
  return (
    <span className={`block text-[10px] font-bold uppercase tracking-widest leading-snug ${muted ? 'text-graphite/25' : 'text-graphite/40'}`}>
      {children}
    </span>
  );
}

// Лицо плашки с отсчётом: крупные цифры и словом — идёт он или стоит. Кнопок
// здесь нет намеренно, старт и пауза живут на изнанке.
export function TileTimerFace({ display, isRunning, isCritical }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`font-mono text-3xl font-black leading-none ${isCritical ? 'text-status-rejected animate-pulse' : isRunning ? 'text-graphite/70' : 'text-graphite/40'}`}>
        {display}
      </span>
      <TileHint muted={!isRunning}>{isRunning ? 'Отсчёт идёт' : 'На паузе'}</TileHint>
    </div>
  );
}

// Настройка отсчёта на изнанке: старт/пауза и минуты. Своя у каждого режима —
// у предматчевой и перерыва это разные таймеры с разными значениями.
export function TileTimerSettings({
  display, isRunning, isCritical, onStart, onPause,
  mins, onMinsChange, minsLabel = 'Минут', min = 1, max = 30,
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-xl font-black leading-none ${isCritical ? 'text-status-rejected' : 'text-graphite/60'}`}>
          {display}
        </span>
        {/* inline-flex + leading-none центрируют подпись по вертикали, а -mr
            съедает межбуквенный пробел ПОСЛЕ последней буквы: с tracking-widest
            он есть всегда и сдвигает текст влево от настоящего центра. */}
        {isRunning ? (
          <button
            onClick={onPause}
            className="h-8 px-4 rounded-full bg-status-rejected text-white hover:bg-status-rejected/90 transition-colors shadow-sm active:scale-95 inline-flex items-center justify-center"
          >
            <span className="text-[10px] font-black uppercase tracking-widest leading-none -mr-[0.1em]">Пауза</span>
          </button>
        ) : (
          <button
            onClick={onStart}
            className="h-8 px-4 rounded-full bg-status-accepted text-white hover:bg-status-accepted/90 transition-colors shadow-sm active:scale-95 inline-flex items-center justify-center"
          >
            <span className="text-[10px] font-black uppercase tracking-widest leading-none -mr-[0.1em]">Старт</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-graphite/40">{minsLabel}</span>
        <Stepper initialValue={mins} min={min} max={max} onChange={onMinsChange} />
      </div>
    </div>
  );
}

// Одна числовая настройка на изнанке: смена кадров, длительность показа.
export function TileStepperSetting({ label, value, onChange, min = 0, max = 99 }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] font-bold uppercase tracking-widest text-graphite/40">{label}</span>
      <Stepper initialValue={value} min={min} max={max} onChange={onChange} />
    </div>
  );
}
