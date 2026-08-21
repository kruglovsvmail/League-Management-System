import React from 'react';

// Вкладки правой колонки: автопилот, аудио и события матча.
//
// Раньше три виджета стояли друг под другом и делили высоту — список событий,
// самый нужный по ходу матча, оказывался прижат к низу. Теперь на экране всегда
// один виджет во всю высоту.
//
// Вкладка целиком пульсирует оранжевым, когда в ней что-то ИДЁТ В ЭФИР ПРЯМО
// СЕЙЧАС: крутится автопилот, играет интро или озвучка составов. Скромной точки
// не хватало — свернув аудио, режиссёр терял из виду включённое интро, а
// зелёный на этой панели значит «в эфире» и потерялся бы среди плашек.
export function PanelTabs({ tabs = [], active, onChange }) {
  return (
    <>
      <style>{`
        @keyframes ptAlert {
          0%, 100% { background-color: rgb(var(--orange) / 0.10); }
          50%      { background-color: rgb(var(--orange) / 0.35); }
        }
        .pt-alert { animation: ptAlert 1.4s ease-in-out infinite; }
      `}</style>

      <div className="flex shrink-0 border-b border-graphite/10 bg-white">
        {tabs.map(t => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              title={t.title || t.label}
              className={`relative flex-1 min-w-0 flex items-center justify-center px-2 py-5 transition-colors
                ${t.indicator ? 'pt-alert' : isActive ? 'bg-white' : 'hover:bg-graphite/5'}`}
            >
              <span className={`truncate text-[11px] font-black uppercase tracking-widest ${
                t.indicator ? 'text-orange' : isActive ? 'text-graphite/80' : 'text-graphite/40'
              }`}>
                {t.label}
              </span>

              {isActive && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange" />}
            </button>
          );
        })}
      </div>
    </>
  );
}
