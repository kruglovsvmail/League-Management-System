import React from 'react';

export function Badge({ label, type = 'empty' }) {
  // Настройки для разных типов бейджей
  const types = {
    empty: { border: 'border-graphite', text: 'text-graphite', bg: 'bg-transparent', fill: '0%' },
    oneThird: { border: 'border-graphite', text: 'text-graphite', bg: 'bg-graphite/30', fill: '33.33%' },
    half: { border: 'border-graphite', text: 'text-graphite', bg: 'bg-graphite/30', fill: '50%' },
    twoThirds: { border: 'border-graphite', text: 'text-graphite', bg: 'bg-graphite/30', fill: '66.66%' },
    filled: { border: 'border-graphite', text: 'text-white', bg: 'bg-graphite', fill: '100%' },
    expiring: { border: 'border-status-pending', text: 'text-white', bg: 'bg-status-pending', fill: '100%' },
    expired: { border: 'border-status-rejected', text: 'text-white', bg: 'bg-status-rejected', fill: '100%' },
  };

  const current = types[type] || types.empty;

  return (
    <div className={`relative inline-flex items-center justify-center gap-1.5 w-[58px] h-[24px] rounded-xl text-[0.7rem] font-semibold border ${current.border} ${current.text} overflow-hidden`}>
      {/* Фон (прогресс) */}
      <div 
        className={`absolute top-0 left-0 bottom-0 z-0 ${current.bg}`} 
        style={{ width: current.fill }}
      />
      {/* Текст поверх фона */}
      <span className="relative z-10">{label}</span>
    </div>
  );
}