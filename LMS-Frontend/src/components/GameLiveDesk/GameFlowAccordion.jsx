// src/components/GameLiveDesk/GameFlowAccordion.jsx
import React, { useState } from 'react';
import { ProtocolSheet } from './ProtocolSheet';
import { getImageUrl } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';
import { usePenaltyReasons } from '../../hooks/usePenaltyReasons';

export const GameFlowAccordion = ({
  game,
  events,
  homeRoster,
  awayRoster,
  timerSeconds,
  onSaveEvent,
  onSavePenaltyGroup,
  onDeleteEvent,
  onToggleLineup,
  trackPlusMinus,
  onRequestPlusMinus,
  isSaving,
  goalieLog,
  isReadOnly,
  // Нужна только значкам экипировки по возрасту в протоколе
  league,
  // Уведомление об ошибке ввода — снизу справа (бумажный вид, см. ProtocolSheet)
  onToast
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Справочник причин удаления тянем один раз на обе команды
  const { penaltyReasons } = usePenaltyReasons(game?.id);

  // Настройки лиги приезжают вместе с матчем (getGameById). Нет значения — как раньше:
  // время подставляется с таймера.
  const autoTimeGoals = game?.sec_auto_time_goals ?? true;
  const autoTimePenalties = game?.sec_auto_time_penalties ?? true;
  // Тот же флаг дивизиона, что и у таблицы бросков в SummaryTablesAccordion
  const shotsTrackingEnabled = game?.track_shots ?? true;
  // Вид панели — настройка лиги: бумажный протокол вместо форм ввода над таблицами
  const paperMode = game?.sec_panel_view === 'paper';
  // Правила удалений — тоже настройки лиги. Нет значения (матч вне лиг) — как было до
  // настроек: гол досрочно закрывает малый штраф, окончание считается само.
  const releaseOnGoal = game?.sec_penalty_release_on_goal ?? true;
  const manualPenaltyEnd = game?.sec_penalty_manual_end ?? false;
  // Галочка «Обоюдное» в окне вида штрафа — тоже настройка лиги, по умолчанию есть
  const coincidentEnabled = game?.sec_coincident_penalties ?? true;

  return (
    <div className="bg-white shadow-lg flex flex-col font-sans rounded-md transition-all duration-500 ease-in-out">
      <div
         className="bg-gray-bg-light px-5 py-3 flex justify-between items-center rounded-md select-none cursor-pointer hover:bg-graphite/5 transition-colors"
         onClick={() => setIsExpanded(!isExpanded)}
      >
          <div className="font-bold py-1 text-graphite text-base uppercase tracking-wide flex items-center gap-3">
             <Icon name="chevron" className={`w-6 h-6 text-graphite-light transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
             Голы и штрафы
          </div>
      </div>

      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
         <div className={isExpanded ? 'overflow-visible' : 'overflow-hidden'}>
             <div className="flex flex-col gap-6 p-6 bg-graphite/[0.02] rounded-b-md border-t border-graphite/20">

                <ProtocolSheet
                  teamId={game.home_team_id}
                  teamLetter="А"
                  teamName={game.home_team_name}
                  oppTeamName={game.away_team_name}
                  teamLogo={getImageUrl(game.home_team_logo || game.home_logo_url || game.home_logo)}
                  roster={homeRoster}
                  league={league}
                  teamEvents={events.filter(e => e.team_id === game.home_team_id)}
                  oppEvents={events.filter(e => e.team_id === game.away_team_id)}
                  timerSeconds={timerSeconds}
                  onSaveEvent={onSaveEvent}
                  onSavePenaltyGroup={onSavePenaltyGroup}
                  onDeleteEvent={onDeleteEvent}
                  onToggleLineup={onToggleLineup}
                  isPlusMinusEnabled={trackPlusMinus}
                  onRequestPlusMinus={onRequestPlusMinus}
                  isSaving={isSaving}
                  goalieLog={goalieLog}
                  isReadOnly={isReadOnly}
                  penaltyReasons={penaltyReasons}
                  autoTimeGoals={autoTimeGoals}
                  autoTimePenalties={autoTimePenalties}
                  shotsTrackingEnabled={shotsTrackingEnabled}
                  paperMode={paperMode}
                  releaseOnGoal={releaseOnGoal}
                  manualPenaltyEnd={manualPenaltyEnd}
                  coincidentEnabled={coincidentEnabled}
                  onToast={onToast}
                />

                <ProtocolSheet
                  teamId={game.away_team_id}
                  teamLetter="Б"
                  teamName={game.away_team_name}
                  oppTeamName={game.home_team_name}
                  teamLogo={getImageUrl(game.away_team_logo || game.away_logo_url || game.away_logo)}
                  roster={awayRoster}
                  league={league}
                  teamEvents={events.filter(e => e.team_id === game.away_team_id)}
                  oppEvents={events.filter(e => e.team_id === game.home_team_id)}
                  timerSeconds={timerSeconds}
                  onSaveEvent={onSaveEvent}
                  onSavePenaltyGroup={onSavePenaltyGroup}
                  onDeleteEvent={onDeleteEvent}
                  onToggleLineup={onToggleLineup}
                  isPlusMinusEnabled={trackPlusMinus}
                  onRequestPlusMinus={onRequestPlusMinus}
                  isSaving={isSaving}
                  goalieLog={goalieLog}
                  isReadOnly={isReadOnly}
                  penaltyReasons={penaltyReasons}
                  autoTimeGoals={autoTimeGoals}
                  autoTimePenalties={autoTimePenalties}
                  shotsTrackingEnabled={shotsTrackingEnabled}
                  paperMode={paperMode}
                  releaseOnGoal={releaseOnGoal}
                  manualPenaltyEnd={manualPenaltyEnd}
                  coincidentEnabled={coincidentEnabled}
                  onToast={onToast}
                />

             </div>
         </div>
      </div>
    </div>
  );
};
