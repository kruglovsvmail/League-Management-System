import React from 'react';

// segments — бейдж из нескольких частей, по одной на документ: true — приложен (часть
// закрашена), false — нет. Раньше бейдж заливался слева на треть/половину/две трети,
// и по нему было видно «сколько», но не «какой именно»; теперь закрашивается место
// конкретного документа, порядок частей задаёт вызывающий код. Все приложены — обычный
// сплошной filled, ни одного — empty. Статусные типы (expiring/expired) важнее: с ними
// сегменты не рисуются — бейдж целиком красится в цвет статуса.
export function Badge({ label, type = 'empty', segments = null }) {
  // Настройки для разных типов бейджей
  const types = {
    empty: { border: 'border-graphite', text: 'text-graphite', bg: 'bg-transparent', fill: '0%' },
    partial: { border: 'border-graphite', text: 'text-graphite', bg: 'bg-graphite/30', fill: '0%' },
    filled: { border: 'border-graphite', text: 'text-white', bg: 'bg-graphite/70', fill: '100%' },
    expiring: { border: 'border-status-pending/70', text: 'text-white', bg: 'bg-status-pending', fill: '100%' },
    expired: { border: 'border-status-rejected', text: 'text-white', bg: 'bg-status-rejected', fill: '100%' },
  };

  const isStatus = type === 'expiring' || type === 'expired';
  const useSegments = Array.isArray(segments) && !isStatus;

  let resolvedType = type;
  if (useSegments) {
    if (segments.every(Boolean)) resolvedType = 'filled';
    else if (!segments.some(Boolean)) resolvedType = 'empty';
    else resolvedType = 'partial';
  }

  const current = types[resolvedType] || types.empty;

  return (
    <div className={`relative inline-flex items-center justify-center gap-1.5 w-[58px] h-[24px] rounded-md text-[0.7rem] font-semibold border ${current.border} ${current.text} overflow-hidden`}>
      {/* Фон: сплошная заливка либо, у частично собранных документов, закрашенные
          сегменты. Зазор в 1px виден только между двумя соседними закрашенными частями —
          так «две из трёх» читаются как две части, а не как заливка на две трети. */}
      {resolvedType === 'partial' ? (
        <div className="absolute inset-0 z-0 flex gap-px">
          {segments.map((isFilled, i) => (
            <div key={i} className={`flex-1 ${isFilled ? current.bg : 'bg-transparent'}`} />
          ))}
        </div>
      ) : (
        <div
          className={`absolute top-0 left-0 bottom-0 z-0 ${current.bg}`}
          style={{ width: current.fill }}
        />
      )}
      {/* Текст поверх фона */}
      <span className="relative z-10">{label}</span>
    </div>
  );
}
