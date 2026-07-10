// src/components/GameLiveDesk/SummaryTablesAccordion.jsx
import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../utils/helpers';
import { 
  formatTime, parseTime, formatTimeMask, 
  StylishInput, CustomSelect
} from './GameDeskShared';
import { Icon } from '../../ui/Icon';

// Псевдо-id вратаря «не указан» — отличается от пустых ворот (goalie_id=null,
// unspecified=false). Используется и в журнале смен, и в бросках (там team_id
// вратаря сохраняется, а goalie_id тоже null — различаем по team_id+period).
const UNSPECIFIED_GOALIE = '__unspecified__';

export const SummaryTablesAccordion = ({
  game, goalieLog,
  goaliesShotsSummary = [],
  onSaveGoalieShotsSummary,
  homeRoster, awayRoster, timerSeconds,
  onSaveGoalieLog, onRequestDeleteGoalieLog, isReadOnly
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // ── Журнал вратарей ──────────────────────────────────────────────────────
  const [editLogId, setEditLogId] = useState(null);
  const [editLogData, setEditLogData] = useState({});
  const [newLogData, setNewLogData] = useState({ time: '', home_goalie: '', away_goalie: '' });

  useEffect(() => {
    const lastLog = goalieLog.length > 0 ? goalieLog[goalieLog.length - 1] : null;
    setNewLogData(prev => ({
      ...prev,
      home_goalie: lastLog ? (lastLog.home_goalie_unspecified ? UNSPECIFIED_GOALIE : (lastLog.home_goalie_id || '')) : '',
      away_goalie: lastLog ? (lastLog.away_goalie_unspecified ? UNSPECIFIED_GOALIE : (lastLog.away_goalie_id || '')) : ''
    }));
  }, [goalieLog]);

  // ── Броски в створ вратарю ────────────────────────────────────────────────
  // shots_count хранит ВСЕ броски в створ (отражённые вычисляются на лету
  // в агрегаторах статистики). Командные броски в створ — производная величина,
  // секретарь её не вводит.
  const [editGoalieShotKey, setEditGoalieShotKey] = useState(null);
  const [editGoalieShotData, setEditGoalieShotData] = useState({});

  // ── Вспомогательные ─────────────────────────────────────────────────────
  const getGoalieOptions = (roster) => {
    return roster
      .filter(r => r.position === 'goalie' || r.position_in_line === 'G')
      .sort((a, b) => a.jersey_number - b.jersey_number)
      .map(g => ({ value: g.player_id, label: `#${g.jersey_number} ${g.last_name || ''}` }));
  };

  const homeGoalieOptions = getGoalieOptions(homeRoster);
  const awayGoalieOptions = getGoalieOptions(awayRoster);

  // «Не указан» доступна всегда, вне зависимости от того, подана ли заявка и
  // сколько в ней вратарей: заявка может отсутствовать, может быть заявлен
  // только один из двух вратарей, а может — оба, но кто именно на льду прямо
  // сейчас, секретарь просто не успел зафиксировать.
  const withUnspecifiedOption = (opts) => [...opts, { value: UNSPECIFIED_GOALIE, label: 'Не указан' }];
  const homeGoalieSelectOptions = withUnspecifiedOption(homeGoalieOptions);
  const awayGoalieSelectOptions = withUnspecifiedOption(awayGoalieOptions);

  const renderGoalieLabel = (goalieId, options, isUnspecified) => {
    if (isUnspecified) return <span className="text-graphite/40 italic text-[11px] font-bold">НЕ УКАЗАН</span>;
    const g = options.find(o => String(o.value) === String(goalieId || ''));
    if (g && g.value !== '') return g.label;
    return <span className="text-graphite/40 italic text-[11px] font-bold">ПУСТЫЕ ВОРОТА</span>;
  };

  // Уникальные вратари команды из журнала (в порядке появления). Если в
  // журнале встречалась запись «не указан» — добавляем псевдо-вратаря в конец,
  // чтобы по нему тоже можно было ввести броски.
  const getGoaliesFromLog = (teamId) => {
    const isHome = teamId === game?.home_team_id;
    const seen = new Set();
    const result = [];
    let hasUnspecified = false;
    goalieLog.forEach(log => {
      const id = isHome ? log.home_goalie_id : log.away_goalie_id;
      const unspecified = isHome ? log.home_goalie_unspecified : log.away_goalie_unspecified;
      if (unspecified) hasUnspecified = true;
      else if (id && !seen.has(id)) { seen.add(id); result.push(id); }
    });
    if (hasUnspecified) result.push(UNSPECIFIED_GOALIE);
    return result;
  };

  const periodsCount = game?.periods_count || 3;
  const periods = Array.from({ length: periodsCount }, (_, i) => String(i + 1));
  if (parseInt(game?.ot_length, 10) > 0) periods.push('OT');

  // ── Броски по вратарю ────────────────────────────────────────────────────
  // Для «не указан» goalie_id в БД тоже NULL — отличаем строки друг от друга
  // по team_id (реальные вратари уникальны по user id, team_id не нужен).
  const getGoalieShotsForPeriod = (goalieId, period, teamId) => {
    const record = goaliesShotsSummary.find(s => (
      goalieId === UNSPECIFIED_GOALIE
        ? (s.goalie_id == null && String(s.team_id) === String(teamId) && s.period === period)
        : (String(s.goalie_id) === String(goalieId) && s.period === period)
    ));
    return record ? parseInt(record.shots_count, 10) : 0;
  };

  const getGoalieShotsTotal = (goalieId, teamId) =>
    periods.reduce((sum, p) => sum + getGoalieShotsForPeriod(goalieId, p, teamId), 0);

  const startEditGoalieShots = (goalieId, teamId) => {
    const key = `${goalieId}_${teamId}`;
    setEditGoalieShotKey(key);
    const data = {};
    periods.forEach(p => { data[p] = getGoalieShotsForPeriod(goalieId, p, teamId) || ''; });
    setEditGoalieShotData(data);
  };

  const saveEditGoalieShots = (goalieId, teamId) => {
    periods.forEach(p => {
      onSaveGoalieShotsSummary({
        goalie_id: goalieId === UNSPECIFIED_GOALIE ? null : goalieId,
        team_id: teamId,
        period: p,
        shots_count: parseInt(editGoalieShotData[p], 10) || 0
      });
    });
    setEditGoalieShotKey(null);
  };

  const handleGoalieShotInputChange = (p, val) => {
    setEditGoalieShotData(prev => ({ ...prev, [p]: val.replace(/\D/g, '') }));
  };

  // ── Журнал вратарей ──────────────────────────────────────────────────────
  const startEditLog = (log) => {
    setEditLogId(log.id);
    setEditLogData({
      time: formatTime(log.time_seconds),
      home_goalie: log.home_goalie_unspecified ? UNSPECIFIED_GOALIE : (log.home_goalie_id || ''),
      away_goalie: log.away_goalie_unspecified ? UNSPECIFIED_GOALIE : (log.away_goalie_id || '')
    });
  };

  const saveEditLog = () => {
    onSaveGoalieLog({
      id: editLogId,
      time_seconds: parseTime(editLogData.time) || 0,
      home_goalie_id: editLogData.home_goalie === UNSPECIFIED_GOALIE ? null : (editLogData.home_goalie || null),
      away_goalie_id: editLogData.away_goalie === UNSPECIFIED_GOALIE ? null : (editLogData.away_goalie || null),
      home_goalie_unspecified: editLogData.home_goalie === UNSPECIFIED_GOALIE,
      away_goalie_unspecified: editLogData.away_goalie === UNSPECIFIED_GOALIE
    });
    setEditLogId(null);
  };

  const handleAddLog = () => {
    const timeSecs = newLogData.time ? parseTime(newLogData.time) : (timerSeconds || 0);
    onSaveGoalieLog({
      time_seconds: timeSecs,
      home_goalie_id: newLogData.home_goalie === UNSPECIFIED_GOALIE ? null : (newLogData.home_goalie || null),
      away_goalie_id: newLogData.away_goalie === UNSPECIFIED_GOALIE ? null : (newLogData.away_goalie || null),
      home_goalie_unspecified: newLogData.home_goalie === UNSPECIFIED_GOALIE,
      away_goalie_unspecified: newLogData.away_goalie === UNSPECIFIED_GOALIE
    });
    setNewLogData(prev => ({ ...prev, time: '' }));
  };

  const lastGoalieLog = goalieLog.length > 0 ? goalieLog[goalieLog.length - 1] : null;
  const lastHomeValue = lastGoalieLog ? (lastGoalieLog.home_goalie_unspecified ? UNSPECIFIED_GOALIE : (lastGoalieLog.home_goalie_id || '')) : '';
  const lastAwayValue = lastGoalieLog ? (lastGoalieLog.away_goalie_unspecified ? UNSPECIFIED_GOALIE : (lastGoalieLog.away_goalie_id || '')) : '';
  const isGoaliesMatch = lastGoalieLog &&
    String(lastHomeValue) === String(newLogData.home_goalie) &&
    String(lastAwayValue) === String(newLogData.away_goalie);

  const goalieRowsCount = isReadOnly ? Math.max(1, goalieLog.length) : Math.max(1, goalieLog.length + 1);
  const goalieRows = Array.from({ length: goalieRowsCount });

  const teams = [
    {
      id: game?.home_team_id,
      name: game?.home_team_name,
      letter: 'А',
      logo: game ? getImageUrl(game.home_team_logo || game.home_logo_url || game.home_logo) : null,
      goalieOptions: homeGoalieOptions
    },
    {
      id: game?.away_team_id,
      name: game?.away_team_name,
      letter: 'Б',
      logo: game ? getImageUrl(game.away_team_logo || game.away_logo_url || game.away_logo) : null,
      goalieOptions: awayGoalieOptions
    }
  ];

  return (
    <div className="bg-white shadow-lg flex flex-col font-sans rounded-md transition-all duration-500 ease-in-out">
      <div
        className="bg-gray-bg-light px-5 py-3 flex justify-between items-center rounded-md select-none cursor-pointer hover:bg-graphite/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="font-bold py-1 text-graphite text-base uppercase tracking-wide flex items-center gap-3">
          <Icon name="chevron" className={`w-6 h-6 text-graphite-light transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          Вратари и броски
        </div>
      </div>

      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className={isExpanded ? 'overflow-visible' : 'overflow-hidden'}>
          <div className="flex w-full gap-5 p-5 bg-graphite/[0.02] rounded-b-md border-t border-graphite/20">

            {/* ── ЛЕВАЯ КОЛОНКА: ЖУРНАЛ ВРАТАРЕЙ ── */}
            <div className="flex-1 min-w-0 bg-white border shadow-sm rounded-md relative flex flex-col">
              <div className="font-bold text-graphite text-base uppercase tracking-wide flex items-center justify-start gap-3 px-5 py-3 bg-white rounded-t-md">
                <span className="border-2 border-graphite w-8 h-8 flex items-center justify-center rounded-sm shrink-0">
                  <Icon name="divisions" className="w-5 h-5" />
                </span>
                <span className="truncate">Время игры вратарей</span>
              </div>

              <div className="overflow-visible pb-12 pt-0.5">
                <table className="w-full text-sm text-center border-collapse table-fixed select-none">
                  <thead>
                    <tr className="bg-graphite/15 text-xs text-graphite-light uppercase tracking-wider relative z-0">
                      <th className="border-r border-graphite/30 py-2 font-bold w-[70px]">Время</th>
                      <th className="border-r border-graphite/30 py-2 px-1">
                        <div className="flex items-center justify-center gap-2 text-graphite">
                          <span className="border-[1.5px] border-graphite w-4 h-4 flex items-center justify-center font-black rounded-[5px] text-[11px] shrink-0">{teams[0].letter}</span>
                          <span className="font-bold text-[11px] uppercase truncate" title={teams[0].name}>{teams[0].name || 'ХОЗ'}</span>
                        </div>
                      </th>
                      <th className="border-r border-graphite/30 py-2 px-1">
                        <div className="flex items-center justify-center gap-2 text-graphite">
                          <span className="border-[1.5px] border-graphite w-4 h-4 flex items-center justify-center font-black rounded-[5px] text-[11px] shrink-0">{teams[1].letter}</span>
                          <span className="font-bold text-[11px] uppercase truncate" title={teams[1].name}>{teams[1].name || 'ГОС'}</span>
                        </div>
                      </th>
                      <th className="py-2 w-[80px]"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white text-graphite relative z-10">
                    {goalieRows.map((_, i) => {
                      const log = goalieLog[i];
                      const isInput = i === goalieLog.length;

                      if (log && log.id === editLogId && !isReadOnly) {
                        return (
                          <tr key={`edit-${log.id}`} className="h-[36px] border-b border-graphite/30 bg-orange/5 transition-colors">
                            <td className="p-1 border-r border-graphite/30 text-center">
                              <StylishInput isEditing isTimeField title="Время смены вратаря" value={editLogData.time} onChange={e => setEditLogData({ ...editLogData, time: formatTimeMask(e.target.value) })} className="text-center font-bold px-1" />
                            </td>
                            <td className="p-1 border-r border-graphite/30 text-center">
                              <CustomSelect isEditing title="Вратарь хозяев" options={homeGoalieSelectOptions} value={editLogData.home_goalie} onChange={e => setEditLogData({ ...editLogData, home_goalie: e.target.value })} className="font-bold text-[12px] h-[28px]" placeholder="Пустые ворота" />
                            </td>
                            <td className="p-1 border-r border-graphite/30 text-center">
                              <CustomSelect isEditing title="Вратарь гостей" options={awayGoalieSelectOptions} value={editLogData.away_goalie} onChange={e => setEditLogData({ ...editLogData, away_goalie: e.target.value })} className="font-bold text-[12px] h-[28px]" placeholder="Пустые ворота" />
                            </td>
                            <td className="p-0 text-center">
                              <button onClick={saveEditLog} className="bg-status-accepted text-white w-full h-full min-h-[36px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner">
                                <Icon name="save" className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      if (log) {
                        return (
                          <tr key={log.id} className="even:bg-graphite/[0.02] hover:bg-graphite/5 transition-colors group h-[36px] border-b border-graphite/30">
                            <td className="font-mono font-semibold text-[13px] text-graphite border-r border-graphite/30">{formatTime(log.time_seconds)}</td>
                            <td className="text-center font-bold border-r border-graphite/30 text-[13px] text-graphite">{renderGoalieLabel(log.home_goalie_id, homeGoalieOptions, log.home_goalie_unspecified)}</td>
                            <td className="text-center font-bold border-r border-graphite/30 text-[13px] text-graphite">{renderGoalieLabel(log.away_goalie_id, awayGoalieOptions, log.away_goalie_unspecified)}</td>
                            <td className="p-0 text-center">
                              {!isReadOnly && (
                                <div className="flex justify-center items-center w-full h-full gap-1.5 px-0.5 opacity-50 hover:opacity-100 transition-opacity">
                                  <button onClick={() => startEditLog(log)} className="text-graphite/40 hover:text-orange transition-colors" title="Редактировать"><Icon name="edit" className="w-[18px] h-[18px]" /></button>
                                  {goalieLog.length > 1 && (
                                    <button onClick={() => onRequestDeleteGoalieLog(log.id)} className="text-graphite/40 hover:text-status-rejected transition-colors" title="Удалить"><Icon name="delete" className="w-[18px] h-[18px]" /></button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      }

                      if (isInput && !isReadOnly) {
                        return (
                          <tr key="new-log" className="even:bg-graphite/[0.02] hover:bg-graphite/5 transition-colors group h-[36px] border-b border-graphite/30">
                            <td className="p-1 border-r border-graphite/30 text-center">
                              <StylishInput
                                isTimeField
                                title="Время смены вратаря"
                                value={newLogData.time}
                                placeholder={formatTime(timerSeconds)}
                                onChange={e => setNewLogData({ ...newLogData, time: formatTimeMask(e.target.value) })}
                                className="text-center font-bold px-1"
                              />
                            </td>
                            <td className="p-1 border-r border-graphite/30 text-center">
                              <CustomSelect title="Вратарь хозяев" options={homeGoalieSelectOptions} value={newLogData.home_goalie} onChange={e => setNewLogData({ ...newLogData, home_goalie: e.target.value })} className="font-bold text-[12px] h-[28px]" placeholder="Пустые ворота" />
                            </td>
                            <td className="p-1 border-r border-graphite/30 text-center">
                              <CustomSelect title="Вратарь гостей" options={awayGoalieSelectOptions} value={newLogData.away_goalie} onChange={e => setNewLogData({ ...newLogData, away_goalie: e.target.value })} className="font-bold text-[12px] h-[28px]" placeholder="Пустые ворота" />
                            </td>
                            <td className="p-0 text-center">
                              <button
                                onClick={handleAddLog}
                                disabled={isGoaliesMatch}
                                className={`w-full h-full min-h-[36px] transition-colors flex items-center justify-center ${isGoaliesMatch ? 'text-graphite/20 cursor-not-allowed' : 'hover:bg-status-accepted/10 text-status-accepted'}`}
                                title={isGoaliesMatch ? 'Вратари не изменились' : 'Добавить запись'}
                              >
                                <Icon name="plus" className="w-6 h-6" />
                              </button>
                            </td>
                          </tr>
                        );
                      }
                      return null;
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── ПРАВАЯ КОЛОНКА ── */}
            <div className="flex-1 min-w-0 flex flex-col gap-5">

            {/* Карточка: БРОСКИ В СТВОР ВРАТАРЮ
                Секретарь вводит ВСЕ броски в створ на конкретного вратаря за период.
                Отражённые броски (saves) и командные SOG считаются на лету. */}
            <div className="bg-white border border-graphite/20 shadow-sm rounded-md relative flex flex-col">
              <div className="font-bold text-graphite text-base uppercase tracking-wide flex items-center justify-start gap-3 px-5 py-3 bg-white rounded-t-md">
                <span className="border-2 border-graphite w-8 h-8 flex items-center justify-center rounded-sm shrink-0">
                  <Icon name="shootout_goal" className="w-5 h-5" />
                </span>
                <span className="truncate">Броски в створ вратарю</span>
              </div>

              <div className="overflow-visible pb-12 pt-0.5">
                <table className="w-full text-sm text-center border-collapse table-fixed select-none">
                  <thead>
                    <tr className="bg-graphite/15 text-xs text-graphite-light uppercase tracking-wider relative z-0">
                      <th className="border-r border-graphite/30 py-2 font-bold px-3 text-left">Вратарь</th>
                      {periods.map(p => (
                        <th key={p} className="border-r border-graphite/30 py-2 font-bold w-[45px]">{p}</th>
                      ))}
                      <th className="border-r border-graphite/30 py-2 font-bold text-status-accepted w-[55px]">Всего</th>
                      <th className="py-2 w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white text-graphite relative z-10">
                    {teams.map((team, teamIndex) => {
                      const teamGoalieIds = getGoaliesFromLog(team.id);

                      return (
                        <React.Fragment key={team.id ?? `team-${teamIndex}`}>

                          {/* Заголовок команды — только чтение, без редактирования */}
                          <tr className="h-[30px] bg-graphite/[0.06] border-b border-graphite/20">
                            <td
                              colSpan={periods.length + 2}
                              className="text-left px-4 py-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className="border-[1.5px] border-graphite w-4 h-4 flex items-center justify-center font-black rounded-[5px] text-[10px] shrink-0 text-graphite">{team.letter}</span>
                                {team.logo && <img src={team.logo} alt={team.name} className="w-4 h-4 object-contain shrink-0" />}
                                <span className="font-bold text-[11px] text-graphite uppercase tracking-wide truncate">{team.name}</span>
                              </div>
                            </td>
                            <td className="border-l border-graphite/20"></td>
                          </tr>

                          {/* Строки вратарей */}
                          {teamGoalieIds.map(goalieId => {
                            const goalieKey = `${goalieId}_${team.id}`;
                            const isEditingGoalie = editGoalieShotKey === goalieKey;
                            const goalieLabel = team.goalieOptions.find(o => String(o.value) === String(goalieId));
                            const goalieName = goalieId === UNSPECIFIED_GOALIE
                              ? 'Не указан'
                              : (goalieLabel ? goalieLabel.label : `#${goalieId}`);
                            const editSum = isEditingGoalie
                              ? periods.reduce((s, p) => s + (parseInt(editGoalieShotData[p], 10) || 0), 0)
                              : 0;

                            return (
                              <tr
                                key={goalieKey}
                                className={`h-[36px] border-b border-graphite/20 transition-colors ${isEditingGoalie ? 'bg-orange/5' : 'hover:bg-graphite/5'}`}
                              >
                                <td className="border-r border-graphite/30 text-left pl-4 pr-2">
                                  <span className="font-semibold text-[13px] text-graphite truncate">{goalieName}</span>
                                </td>

                                {isEditingGoalie && !isReadOnly ? (
                                  <>
                                    {periods.map(p => (
                                      <td key={p} className="p-0.5 border-r border-graphite/30 text-center">
                                        <StylishInput
                                          value={editGoalieShotData[p]}
                                          onChange={e => handleGoalieShotInputChange(p, e.target.value)}
                                          className="text-center font-bold px-1"
                                        />
                                      </td>
                                    ))}
                                    <td className="border-r border-graphite/30 text-center">
                                      <span className="font-mono font-black text-[13px] text-status-accepted">
                                        {editSum || '-'}
                                      </span>
                                    </td>
                                    <td className="p-0 text-center">
                                      <button
                                        onClick={() => saveEditGoalieShots(goalieId, team.id)}
                                        className="bg-status-accepted text-white w-full h-full min-h-[36px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"
                                      >
                                        <Icon name="save" className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    {periods.map(p => (
                                      <td key={p} className="font-mono font-semibold text-[13px] text-graphite border-r border-graphite/30">
                                        {getGoalieShotsForPeriod(goalieId, p, team.id) || '-'}
                                      </td>
                                    ))}
                                    <td className="font-mono font-black text-[13px] text-status-accepted border-r border-graphite/30">
                                      {getGoalieShotsTotal(goalieId, team.id) || '-'}
                                    </td>
                                    <td className="p-0 text-center">
                                      {!isReadOnly && (
                                        <div className="flex justify-center items-center w-full h-full px-0.5 opacity-40 hover:opacity-100 transition-opacity">
                                          <button
                                            onClick={() => startEditGoalieShots(goalieId, team.id)}
                                            className="text-graphite/40 hover:text-orange transition-colors"
                                            title="Редактировать"
                                          >
                                            <Icon name="edit" className="w-[16px] h-[16px]" />
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}

                          {/* Подсказка если вратарей нет */}
                          {teamGoalieIds.length === 0 && (
                            <tr className="h-[32px] border-b border-graphite/10">
                              <td colSpan={periods.length + 2} className="text-left pl-4 text-[11px] text-graphite/30 italic">
                                — заполните журнал вратарей слева
                              </td>
                            </tr>
                          )}

                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            </div>
            {/* ── конец правой колонки ── */}

          </div>
        </div>
      </div>
    </div>
  );
};
