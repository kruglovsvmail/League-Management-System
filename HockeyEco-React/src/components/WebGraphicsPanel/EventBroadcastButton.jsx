import React from 'react';

export function EventBroadcastButton({ event, isFaded, isActive, isHome, homeShortName, awayShortName, displayTime, onClick, type }) {
  const isGoal = type === 'goal';
  const teamShortName = isHome ? homeShortName : awayShortName;

  if (!event) {
    return (
      <div className={`flex flex-col h-full items-center justify-center p-4 text-center text-graphite/20 text-[10px] font-bold uppercase tracking-widest ${isGoal ? 'border-r border-graphite/10' : ''}`}>
          {isGoal ? 'Нет голов' : 'Нет удалений'}
      </div>
    );
  }

  const activeColor = isGoal ? 'text-blue-600' : 'text-[#FF3B30]'; 
  const activeBorder = isGoal ? 'border-blue-600' : 'border-[#FF3B30]';

  const colorClass = isFaded ? 'text-graphite/70' : activeColor;
  const borderClass = isFaded ? 'border-graphite/70' : activeBorder;
  const playerNameColor = isFaded ? 'text-graphite/70' : activeColor;

  let wrapperClasses = "w-full h-[130px] transition-all duration-300 flex flex-col text-left outline-none select-none relative p-4 bg-white ";
  
  if (isGoal) {
      wrapperClasses += "border-r border-graphite/10 ";
  }

  if (isActive) {
    wrapperClasses += "bg-status-accepted/5 shadow-[inset_0_0_20px_rgba(34,197,94,0.05)] ";
  } else {
    wrapperClasses += "hover:bg-graphite/5 cursor-pointer ";
  }

  return (
    <>
      <button onClick={onClick} className={wrapperClasses}>
        {isActive && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-status-accepted/20">
             <div
               className="h-full bg-status-accepted w-full origin-left"
               style={{ animation: `shrinkButtonBar 10s linear forwards` }}
             ></div>
          </div>
        )}

        <div className="flex items-center w-full mb-4">
          <span className={`px-3 py-[1px] rounded-full border border-solid ${borderClass} ${colorClass} text-[10px] font-black uppercase tracking-wider`}>
            {isGoal ? 'ГОЛ' : 'ШТРАФ'}
          </span>
          <span className="text-[17px] font-black uppercase ml-3 text-graphite leading-none">
            {teamShortName}
          </span>
          <span className="text-[12px] font-bold text-graphite/40 ml-auto">
            {displayTime}
          </span>
        </div>

        <div className={`text-[15px] font-black uppercase leading-tight mb-2 ${playerNameColor}`}>
          {event.primary_last_name} {event.primary_first_name}
        </div>

        <div className={`text-[13px] font-medium flex-1 ${isFaded ? 'text-graphite/60' : 'text-graphite/60'}`}>
          {isGoal ? (
            <div className="flex flex-col">
              {event.assist1_last_name && <div>{event.assist1_last_name} {event.assist1_first_name}</div>}
              {event.assist2_last_name && <div>{event.assist2_last_name} {event.assist2_first_name}</div>}
              {!event.assist1_last_name && !event.assist2_last_name && <div>Без ассистентов</div>}
            </div>
          ) : (
            <div>
              <span className={`font-bold ${isFaded ? 'text-graphite/40' : 'text-graphite/80'}`}>
                {event.penalty_minutes} мин
              </span> - {event.penalty_violation}
            </div>
          )}
        </div>
      </button>

      {isActive && (
          <style>{`
            @keyframes shrinkButtonBar {
              from { transform: scaleX(1); }
              to { transform: scaleX(0); }
            }
          `}</style>
      )}
    </>
  );
}