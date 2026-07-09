import React, { useState } from 'react';
import { Stepper } from '../../ui/Stepper';
import { Icon } from '../../ui/Icon';
import { getImageUrl } from '../../utils/helpers';

function EventRow({ event, isFaded, isActive, isHome, homeShortName, awayShortName, displayTime, onClick, type, duration = 10, teamLogo }) {
  const isGoal = type === 'goal';
  const teamShortName = isHome ? homeShortName : awayShortName;
  const hasPlayer = !!event?.primary_player_id;
  // Готовность к показу/озвучке: гол ждёт автора, штраф — причину нарушения (тот же критерий,
  // что у диктора арены в timerHandler.js). Командный/скамеечный штраф игрока не имеет вообще —
  // раньше он тут навсегда оставался "неполным", хотя причина уже выбрана и озвучивать есть что.
  const isEligible = isGoal ? hasPlayer : !!event?.penalty_violation;

  const activeColor = isGoal ? 'text-blue-600' : 'text-[#FF3B30]';
  const activeBorder = isGoal ? 'border-blue-600' : 'border-[#FF3B30]';

  const colorClass = !isEligible ? 'text-graphite/40' : activeColor;
  const borderClass = !isEligible ? 'border-graphite/30' : activeBorder;

  const logoUrl = teamLogo ? getImageUrl(teamLogo) : null;

  return (
    <>
      <button
        onClick={isEligible ? onClick : undefined}
        disabled={!event || !isEligible}
        className={`w-full flex items-center gap-3 px-3.5 py-5 mb-2 text-left transition-all duration-200 relative rounded-xl border overflow-hidden ${
          !isEligible ? 'cursor-default bg-white border-graphite/10' :
          isActive ? 'bg-status-accepted/5 border-status-accepted/40 cursor-pointer' :
          'bg-white border-graphite/10 hover:border-graphite/25 hover:shadow-sm cursor-pointer'
        } ${isFaded ? 'opacity-40' : ''}`}
      >
        {isActive && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-status-accepted/20">
            <div
              className="h-full bg-status-accepted w-full origin-left"
              style={{ animation: `shrinkEventBar ${duration}s linear forwards` }}
            ></div>
          </div>
        )}

        <span className={`shrink-0 px-2 py-[2px] rounded-full border-2 ${borderClass} ${colorClass} text-[9px] font-black uppercase tracking-wider`}>
          {isGoal ? 'ГОЛ' : 'ШТР'}
        </span>

        <div className="flex flex-col flex-1 min-w-0">
          <div className={`text-[14px] font-bold  leading-tight truncate ${!isEligible ? 'text-graphite/40' : 'text-graphite'}`}>
            {hasPlayer ? (
              <>
                {event.primary_jersey_number != null && <span className="text-graphite/40 mr-1">#{event.primary_jersey_number}</span>}
                {event.primary_last_name || ''} {event.primary_first_name || ''}
              </>
            ) : isEligible ? (
              <span className="text-graphite/30 italic font-bold normal-case">Без игрока (команда)</span>
            ) : (
              <span className="text-graphite/30 italic font-bold normal-case">Не указано</span>
            )}
          </div>

          <div className={`text-[12px] font-medium mt-0.5 truncate text-graphite/70`}>
            {!isEligible ? (
              ' '
            ) : isGoal ? (
              event.assist1_last_name || event.assist2_last_name ? (
                <span>
                  {event.assist1_last_name && <>{event.assist1_jersey_number != null && `#${event.assist1_jersey_number} `}{event.assist1_last_name} {event.assist1_first_name?.[0]}.</>}
                  {event.assist1_last_name && event.assist2_last_name && ', '}
                  {event.assist2_last_name && <>{event.assist2_jersey_number != null && `#${event.assist2_jersey_number} `}{event.assist2_last_name} {event.assist2_first_name?.[0]}.</>}
                </span>
              ) : 'Без ассистентов'
            ) : (
              <span>{event.penalty_minutes} мин — {event.penalty_violation || 'Нарушение'}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <div className="flex flex-col items-end">
            <span className="text-[14px] font-bold uppercase leading-none text-graphite/70">
              {teamShortName}
            </span>
            <span className="text-[11px] font-semibold leading-none mt-1 text-graphite/70">
              {displayTime}
            </span>
          </div>
          {logoUrl && (
            <img src={logoUrl} alt="" className="w-7 h-7 object-contain shrink-0" />
          )}
        </div>
      </button>

      {isActive && (
        <style>{`
          @keyframes shrinkEventBar {
            from { transform: scaleX(1); }
            to { transform: scaleX(0); }
          }
        `}</style>
      )}
    </>
  );
}

export function GameEventsWidget({
  events, game, periodLength,
  broadcastedEvents, activeEventOverlay,
  triggerOverlay, getEventSignature,
  autoShowSettings, updateAutoShowSettings,
  ttsEvents, updateTtsEvents
}) {
  const formatTime = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  const getEventDisplayTime = (secs, period) => {
    if (period === 'SO') return 'Буллиты';
    if (secs == null) return '';
    const pLen = periodLength * 60;
    let p = '1';
    let relSecs = secs;
    if (secs > pLen * 3) { p = 'ОТ'; relSecs = secs - pLen * 3; }
    else if (secs > pLen * 2) { p = '3'; relSecs = secs - pLen * 2; }
    else if (secs > pLen) { p = '2'; relSecs = secs - pLen; }
    return `${p} пер - ${formatTime(relSecs)}`;
  };

  const sortEvents = (a, b) => {
    const periods = { 'SO': 5, 'OT': 4, '3': 3, '2': 2, '1': 1 };
    if (periods[b.period] !== periods[a.period]) return periods[b.period] - periods[a.period];
    return b.time_seconds - a.time_seconds;
  };

  const hotEvents = events
    .filter(e => ['goal', 'penalty'].includes(e.event_type))
    .sort(sortEvents);

  const homeShortName = game?.home_short_name || game?.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game?.away_short_name || game?.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const [settingsOpen, setSettingsOpen] = useState(true);

  return (
    <div className="flex flex-col h-full bg-white border-l border-graphite/5">
      {/* Шапка — заголовок + переключатель настроек (клик по всей шапке) */}
      <div
        onClick={() => setSettingsOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2.5 border-b border-graphite/10 shrink-0 cursor-pointer select-none hover:bg-graphite/5 transition-colors"
        title={settingsOpen ? 'Скрыть настройки' : 'Показать настройки'}
      >
        <svg className="w-4 h-4 text-graphite/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        <h3 className="text-[11px] font-black uppercase tracking-widest text-graphite/80 leading-none mt-0.5">События матча</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`w-6 h-6 flex items-center justify-center rounded ${autoShowSettings.enabled ? 'text-status-accepted bg-status-accepted/10' : 'text-graphite/25'}`} title={autoShowSettings.enabled ? 'Автопоказ включён' : 'Автопоказ выключен'}>
            <Icon name="view" className="w-3.5 h-3.5" />
          </span>
          <span className={`w-6 h-6 flex items-center justify-center rounded ${ttsEvents ? 'text-status-accepted bg-status-accepted/10' : 'text-graphite/25'}`} title={ttsEvents ? 'Озвучка включена' : 'Озвучка выключена'}>
            <Icon name="mic" className="w-3.5 h-3.5" />
          </span>
          <span className="w-6 h-6 flex items-center justify-center rounded text-graphite/40">
            <Icon name="chevron" className={`w-3.5 h-3.5 transition-transform duration-300 ${settingsOpen ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </div>

      {/* Настройки — плавный аккордеон */}
      <div className={`grid shrink-0 transition-[grid-template-rows] duration-300 ease-in-out ${settingsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-4 py-3 border-b border-graphite/10 bg-white">
            <div className="flex items-center gap-12">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={autoShowSettings.enabled} onChange={(e) => updateAutoShowSettings('enabled', e.target.checked)} className="w-4 h-4 rounded border-graphite/30 text-status-accepted focus:ring-status-accepted/30 cursor-pointer" />
                <span className="text-[10px] font-bold text-graphite/70 uppercase tracking-wider">Автопоказ событий</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={ttsEvents} onChange={(e) => updateTtsEvents(e.target.checked)} className="w-4 h-4 rounded border-graphite/30 text-status-accepted focus:ring-status-accepted/30 cursor-pointer" />
                <span className="text-[10px] font-bold text-graphite/70 uppercase tracking-wider">Озвучка событий</span>
              </label>
            </div>

            {autoShowSettings.enabled && (
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-graphite/10">
                <div className="flex flex-col items-center gap-1.5" title="Игровой таймер: отсчёт идёт, только пока таймер запущен — плашка/озвучка ждут возобновления игры">
                  <span className="text-[9px] text-graphite/40 font-bold uppercase tracking-wider">Задержка (Т)</span>
                  <Stepper initialValue={autoShowSettings.delay} min={1} max={30} onChange={(v) => updateAutoShowSettings('delay', v)} />
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[9px] text-graphite/40 font-bold uppercase tracking-wider">Показ</span>
                  <Stepper initialValue={autoShowSettings.duration} min={3} max={30} onChange={(v) => updateAutoShowSettings('duration', v)} />
                </div>
                <div className="flex flex-col items-center gap-1.5" title="Игровой таймер: если автора/причину назначили спустя это время ХОДА МАТЧА — не показываем и не озвучиваем">
                  <span className="text-[9px] text-graphite/40 font-bold uppercase tracking-wider">Актуальность (Т)</span>
                  <Stepper initialValue={autoShowSettings.expiry} min={10} max={120} onChange={(v) => updateAutoShowSettings('expiry', v)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#e8e8e8ff] [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(131,131,131,0.2)_transparent]">
        <div className="flex flex-col gap-2.5 p-3">
          {hotEvents.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-graphite/20 text-[10px] font-bold uppercase tracking-widest">Нет событий</div>
          ) : (
            hotEvents.map(ev => {
              const sig = getEventSignature(ev);
              return (
                <EventRow
                  key={ev.id}
                  type={ev.event_type}
                  event={ev}
                  isActive={activeEventOverlay === sig}
                  isFaded={broadcastedEvents.includes(sig)}
                  isHome={ev.team_id === game.home_team_id}
                  homeShortName={homeShortName}
                  awayShortName={awayShortName}
                  displayTime={getEventDisplayTime(ev.time_seconds, ev.period)}
                  onClick={() => triggerOverlay(ev.event_type, ev, sig, autoShowSettings.duration)}
                  duration={autoShowSettings.duration}
                  teamLogo={ev.team_logo}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
