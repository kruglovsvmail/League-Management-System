import React from 'react';

export function EventBroadcastButton({ event, isFaded, isHome, homeShortName, awayShortName, displayTime, onClick, type }) {
  const isGoal = type === 'goal';

  if (!event) {
    return (
      <div className="bg-white rounded-xl border border-graphite/20 shadow-sm flex flex-col shrink-0 p-6 text-center text-graphite/30 text-[11px] font-bold uppercase tracking-widest border-dashed">
          {isGoal ? 'Нет забитых голов' : 'Нет удалений'}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl border transition-all duration-300 flex flex-col shrink-0 overflow-hidden p-4 text-left cursor-pointer outline-none select-none
        ${isFaded
          ? 'border-graphite/20 opacity-70 hover:opacity-100 shadow-sm'
          : 'border-blue-500/30 shadow-md ring-1 ring-blue-500/10 hover:ring-blue-500/30 transform hover:-translate-y-1'
        }
      `}
      title="Нажмите, чтобы вывести графику в эфир"
    >
      <div className="flex justify-between items-start w-full">
          <div className="flex flex-col flex-1 pr-3 border-r border-graphite/10 mr-3">
            <span className="text-[14px] font-black text-graphite uppercase leading-tight mb-1 truncate">
                {event.primary_last_name} {event.primary_first_name}
            </span>

            {isGoal ? (
                (event.assist1_last_name || event.assist2_last_name) ? (
                  <span className="text-[10px] font-bold text-graphite-light truncate leading-tight">
                      Аст: {[event.assist1_last_name, event.assist2_last_name].filter(Boolean).join(', ')}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-graphite/30 italic leading-tight">Без ассистентов</span>
                )
            ) : (
                <span className="text-[10px] font-bold text-status-rejected truncate leading-tight">
                  {event.penalty_minutes} мин. — {event.penalty_violation}
                </span>
            )}
          </div>

          <div className="flex flex-col items-end shrink-0">
            <span className="text-[10px] font-bold text-graphite/60 uppercase tracking-wide leading-none mb-1.5">{displayTime}</span>
            <span className="text-[9px] font-bold text-graphite/40 uppercase truncate max-w-[60px]">{isHome ? homeShortName : awayShortName}</span>
          </div>
      </div>

      <div className={`mt-3 pt-3 border-t ${isFaded ? 'border-graphite/10 text-graphite/40' : 'border-blue-500/10 text-blue-500'} text-[10px] font-black uppercase tracking-widest text-center w-full`}>
          {isFaded ? '✓ Выведено в эфир' : 'В эфир 📺'}
      </div>
    </button>
  );
}