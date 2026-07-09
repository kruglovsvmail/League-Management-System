import React from 'react';

const TICKER_ROWS = [
  { speed: 95, direction: 'left', size: 'text-[80px]', opacity: 'opacity-[0.03]', top: '5%' },
  { speed: 90, direction: 'right', size: 'text-[50px]', opacity: 'opacity-[0.04]', top: '20%' },
  { speed: 98, direction: 'left', size: 'text-[100px]', opacity: 'opacity-[0.02]', top: '38%' },
  { speed: 65, direction: 'right', size: 'text-[40px]', opacity: 'opacity-[0.05]', top: '55%' },
  { speed: 60, direction: 'left', size: 'text-[70px]', opacity: 'opacity-[0.02]', top: '70%' },
  { speed: 65, direction: 'right', size: 'text-[60px]', opacity: 'opacity-[0.03]', top: '85%' },
];

export function TickerBackground({ texts = [] }) {
  if (texts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes tickerLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes tickerRight {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
        {TICKER_ROWS.map((row, i) => {
          const text = texts.filter(Boolean).join(' • ');
          const repeated = `${text} • `.repeat(10);
          return (
            <div
              key={i}
              className={`absolute whitespace-nowrap ${row.size} ${row.opacity} font-black uppercase tracking-widest text-white select-none`}
              style={{ top: row.top }}
            >
              <div
                style={{
                  animation: `${row.direction === 'left' ? 'tickerLeft' : 'tickerRight'} ${row.speed}s linear infinite`,
                  willChange: 'transform',
                }}
              >
                {repeated}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
