// src/components/GameLiveDesk/SummaryTablesAccordion.jsx
import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../utils/helpers';
import { 
  formatTime, parseTime, formatTimeMask, 
  StylishInput, CustomSelect
} from './GameDeskShared';
import { Icon } from '../../ui/Icon';
import { PaperInput, PaperSelect, PaperAddButton, PaperSaveButton, isClockValid, usePaperDraftSaving, PAPER_SAVING_CELL } from './PaperCells';

// Псевдо-id вратаря «не указан» — отличается от пустых ворот (goalie_id=null,
// unspecified=false). Используется и в журнале смен, и в бросках (там team_id
// вратаря сохраняется, а goalie_id тоже null — различаем по team_id+period).
const UNSPECIFIED_GOALIE = '__unspecified__';

export const SummaryTablesAccordion = ({
  game, goalieLog,
  goaliesShotsSummary = [],
  onSaveGoalieShotsSummary,
  homeRoster, awayRoster, timerSeconds,
  onSaveGoalieLog, onRequestDeleteGoalieLog, isReadOnly,
  shotsTrackingEnabled = true,
  // Уведомление об ошибке ввода — снизу справа (бумажный вид)
  onToast
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Вид «Бумажный протокол» (настройка лиги): формы над журналом нет, запись вписывается
  // в первую свободную строку. Вратарь не выбран (undefined) — «без изменений».
  const paperMode = game?.sec_panel_view === 'paper';
  const [paperLog, setPaperLog] = useState({ time: '', home: undefined, away: undefined });
  const [paperLogErrors, setPaperLogErrors] = useState({});
  
  // ── Журнал вратарей ──────────────────────────────────────────────────────
  const [editLogId, setEditLogId] = useState(null);
  const [editLogData, setEditLogData] = useState({});
  // Дефолт новой записи — «не указан», а не пустые ворота (''): пока секретарь
  // сторону не выбрал, про вратаря просто ничего не известно. Пустые ворота —
  // осознанное действие и выбираются явно. Разница уходит в статистику: гол в
  // пустые ворота добавляется к броскам соперника, гол «неизвестному» вратарю — нет.
  const [newLogData, setNewLogData] = useState({ time: '', home_goalie: UNSPECIFIED_GOALIE, away_goalie: UNSPECIFIED_GOALIE });

  useEffect(() => {
    const lastLog = goalieLog.length > 0 ? goalieLog[goalieLog.length - 1] : null;
    setNewLogData(prev => ({
      ...prev,
      home_goalie: lastLog ? (lastLog.home_goalie_unspecified ? UNSPECIFIED_GOALIE : (lastLog.home_goalie_id || '')) : UNSPECIFIED_GOALIE,
      away_goalie: lastLog ? (lastLog.away_goalie_unspecified ? UNSPECIFIED_GOALIE : (lastLog.away_goalie_id || '')) : UNSPECIFIED_GOALIE
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
  // null = ячейку не заполняли (строки в БД нет) → «-». Ноль — полноценный
  // результат («по вратарю не бросали») и показывается как 0.
  const getGoalieShotsForPeriod = (goalieId, period, teamId) => {
    const record = goaliesShotsSummary.find(s => (
      goalieId === UNSPECIFIED_GOALIE
        ? (s.goalie_id == null && String(s.team_id) === String(teamId) && s.period === period)
        : (String(s.goalie_id) === String(goalieId) && s.period === period)
    ));
    return record ? parseInt(record.shots_count, 10) : null;
  };

  // Итог: null, пока не заполнен ни один период; иначе сумма заполненных.
  const getGoalieShotsTotal = (goalieId, teamId) => {
    const vals = periods
      .map(p => getGoalieShotsForPeriod(goalieId, p, teamId))
      .filter(v => v != null);
    return vals.length ? vals.reduce((sum, v) => sum + v, 0) : null;
  };

  const startEditGoalieShots = (goalieId, teamId) => {
    if (!shotsTrackingEnabled) return;
    const key = `${goalieId}_${teamId}`;
    setEditGoalieShotKey(key);
    const data = {};
    periods.forEach(p => {
      const v = getGoalieShotsForPeriod(goalieId, p, teamId);
      data[p] = v == null ? '' : String(v);   // не через `|| ''`: иначе введённый 0 стёрся бы
    });
    setEditGoalieShotData(data);
  };

  const saveEditGoalieShots = (goalieId, teamId) => {
    periods.forEach(p => {
      const raw = editGoalieShotData[p];
      const isCleared = raw === '' || raw == null;
      onSaveGoalieShotsSummary({
        goalie_id: goalieId === UNSPECIFIED_GOALIE ? null : goalieId,
        team_id: teamId,
        period: p,
        // null → бэкенд удалит строку (ячейка снова «не заполнена»)
        shots_count: isCleared ? null : (parseInt(raw, 10) || 0)
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
    if (logTimeMissing) return;
    onSaveGoalieLog({
      time_seconds: newLogTime,
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

  // Время новой записи: введённое, иначе с таймера — если лига это разрешила
  // (sec_auto_time_goalie_log, приезжает вместе с матчем). null — времени нет,
  // «+» не нажать.
  const autoTimeGoalieLog = game?.sec_auto_time_goalie_log ?? true;
  const newLogTime = parseTime(newLogData.time) ?? (autoTimeGoalieLog ? (timerSeconds || 0) : null);
  const logTimeMissing = newLogTime === null;
  const addDisabled = isGoaliesMatch || logTimeMissing;
  const addTitle = logTimeMissing ? 'Укажите время смены' : isGoaliesMatch ? 'Вратари не изменились' : 'Добавить запись';

  // ── Бумажный вид ──
  // «+» активен, как только известно время; остальное проверяется по нажатию. Пустая
  // ячейка вратаря — вратарь из последней записи (в самой первой — «не указан»);
  // пустые ворота выбираются в окне явно.
  const paperLogTime = parseTime(paperLog.time) ?? (autoTimeGoalieLog ? (timerSeconds || 0) : null);

  // Строка ввода очищается в тот момент, когда запись встала в журнал, — не раньше и не позже
  const [paperLogSaving, savePaperLog] = usePaperDraftSaving(goalieLog.length, () => setPaperLog({ time: '', home: undefined, away: undefined }));

  const handleAddPaperLog = () => {
    if (paperLogTime === null || paperLogSaving) return;
    const home = paperLog.home ?? (lastGoalieLog ? lastHomeValue : UNSPECIFIED_GOALIE);
    const away = paperLog.away ?? (lastGoalieLog ? lastAwayValue : UNSPECIFIED_GOALIE);
    const errors = {};
    if (!isClockValid(paperLog.time)) errors.time = 'Время: секунд не больше 59';
    if (lastGoalieLog && String(home) === String(lastHomeValue) && String(away) === String(lastAwayValue)) {
      errors.goalies = 'Вратари не изменились — выберите нового вратаря хотя бы одной команды';
    }
    setPaperLogErrors(errors);
    if (Object.keys(errors).length) {
      onToast?.({ title: 'Запись не добавлена', message: Object.values(errors).join('. '), type: 'error' });
      return;
    }
    savePaperLog(() => onSaveGoalieLog({
      time_seconds: paperLogTime,
      home_goalie_id: home === UNSPECIFIED_GOALIE ? null : (home || null),
      away_goalie_id: away === UNSPECIFIED_GOALIE ? null : (away || null),
      home_goalie_unspecified: home === UNSPECIFIED_GOALIE,
      away_goalie_unspecified: away === UNSPECIFIED_GOALIE
    }));
  };

  const saveEditPaperLog = () => {
    if (!editLogData.time || !isClockValid(editLogData.time)) {
      setPaperLogErrors({ editTime: true });
      onToast?.({ title: 'Запись не сохранена', message: editLogData.time ? 'Время: секунд не больше 59' : 'Время: укажите время смены', type: 'error' });
      return;
    }
    setPaperLogErrors({});
    saveEditLog();
  };

  // Карточка ввода — как у голов и удалений в ProtocolSheet, только в своём цвете:
  // синяя, чтобы не путаться ни с зелёной/красной формами событий, ни с оранжевым
  // режимом правки. Поля белые с тонкой рамкой (ghost), без рамок между ячейками.
  const logInputCell = 'px-1 py-2.5 bg-status-pending/[0.08]';

  // Классический вид: строка ввода в отдельной карточке над списком, +1 не нужен.
  // Бумажный: ввод — в первой свободной строке журнала, под неё нужна строка.
  const paperDraft = paperMode && !isReadOnly;
  const goalieRows = Array.from({ length: paperDraft ? goalieLog.length + 1 : Math.max(1, goalieLog.length) });

  // Общая разметка колонок для карточки ввода и списка журнала
  const journalColGroup = (
    <colgroup>
      <col className="w-[92px]" />
      <col className="w-auto" />
      <col className="w-auto" />
      <col className="w-[80px]" />
    </colgroup>
  );

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

              {/* Карточка новой записи — над списком, на серой подложке. Та же разметка
                  колонок, что и у списка (colgroup), поэтому поля стоят ровно над графами.
                  border-separate — ради скруглений ячеек; зазор от краёв карточки —
                  прозрачная рамка крайних ячеек с bg-clip-padding.
                  В бумажном виде карточки нет: ввод — в первой свободной строке. */}
              {!isReadOnly && !paperMode && (
                <div className="bg-gray-bg-light py-3 border-b border-graphite/20">
                  <table className="w-full text-sm text-center border-separate border-spacing-0 table-fixed select-none">
                    {journalColGroup}
                    <tbody className="text-graphite">
                      <tr>
                        <td className={`${logInputCell} border-l-[12px] border-transparent bg-clip-padding rounded-l-[18px]`}>
                          <StylishInput
                            ghost
                            isTimeField
                            title="Время смены вратаря"
                            value={newLogData.time}
                            hint={autoTimeGoalieLog ? '' : 'Время'}
                            placeholder={autoTimeGoalieLog ? formatTime(timerSeconds) : ''}
                            onChange={e => setNewLogData({ ...newLogData, time: formatTimeMask(e.target.value) })}
                            className="text-center font-bold px-1"
                          />
                        </td>
                        <td className={logInputCell}>
                          <CustomSelect ghost title="Вратарь хозяев" options={homeGoalieSelectOptions} value={newLogData.home_goalie} onChange={e => setNewLogData({ ...newLogData, home_goalie: e.target.value })} className="font-bold text-[12px] h-[28px]" placeholder="Пустые ворота" />
                        </td>
                        <td className={logInputCell}>
                          <CustomSelect ghost title="Вратарь гостей" options={awayGoalieSelectOptions} value={newLogData.away_goalie} onChange={e => setNewLogData({ ...newLogData, away_goalie: e.target.value })} className="font-bold text-[12px] h-[28px]" placeholder="Пустые ворота" />
                        </td>
                        <td className={`${logInputCell} text-center border-r-[12px] border-transparent bg-clip-padding rounded-r-[18px]`}>
                          <button
                            onClick={handleAddLog}
                            disabled={addDisabled}
                            className={`mx-auto w-full max-w-[52px] h-[30px] rounded-md transition-colors flex items-center justify-center ${addDisabled ? 'bg-transparent ring-1 ring-inset ring-graphite/20 text-graphite/25 cursor-not-allowed' : 'bg-status-pending text-white hover:bg-status-pending/90 shadow-sm'}`}
                            title={addTitle}
                          >
                            <Icon name="plus" className="w-6 h-6" />
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div className="overflow-visible pb-4 pt-0.5">
                <table className="w-full text-sm text-center border-collapse table-fixed select-none">
                  {journalColGroup}
                  <thead>
                    <tr className="bg-graphite/15 text-xs text-graphite-light uppercase tracking-wider relative z-0">
                      <th className="border-r border-graphite/[0.12] py-2 font-bold">Время</th>
                      <th className="border-r border-graphite/[0.12] py-2 px-1">
                        <div className="flex items-center justify-center gap-2 text-graphite">
                          <span className="border-[1.5px] border-graphite w-4 h-4 flex items-center justify-center font-black rounded-[5px] text-[11px] shrink-0">{teams[0].letter}</span>
                          <span className="font-bold text-[11px] uppercase truncate" title={teams[0].name}>{teams[0].name || 'ХОЗ'}</span>
                        </div>
                      </th>
                      <th className="border-r border-graphite/[0.12] py-2 px-1">
                        <div className="flex items-center justify-center gap-2 text-graphite">
                          <span className="border-[1.5px] border-graphite w-4 h-4 flex items-center justify-center font-black rounded-[5px] text-[11px] shrink-0">{teams[1].letter}</span>
                          <span className="font-bold text-[11px] uppercase truncate" title={teams[1].name}>{teams[1].name || 'ГОС'}</span>
                        </div>
                      </th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white text-graphite relative z-10">
                    {goalieRows.map((_, i) => {
                      const log = goalieLog[i];

                      // Бумажный вид: правка — с клавиатуры и через окно выбора вратаря
                      if (paperMode && log && log.id === editLogId && !isReadOnly) {
                        return (
                          <tr key={`edit-${log.id}`} className="h-[36px] border-b border-graphite/30 bg-orange/10 transition-colors">
                            <td className="p-0 border-r border-graphite/[0.12]">
                              <PaperInput type="time" title="Время смены вратаря" value={editLogData.time} error={!!paperLogErrors.editTime} onChange={(v) => { setPaperLogErrors({}); setEditLogData(d => ({ ...d, time: v })); }} onEnter={saveEditPaperLog} className="font-bold" />
                            </td>
                            <td className="p-0 border-r border-graphite/[0.12]">
                              <PaperSelect title="Вратарь хозяев" options={homeGoalieSelectOptions} emptyLabel="Пустые ворота" emptyDisplay="Пустые ворота" value={editLogData.home_goalie} onChange={(v) => setEditLogData(d => ({ ...d, home_goalie: v }))} className="!text-[13px] font-bold" />
                            </td>
                            <td className="p-0 border-r border-graphite/[0.12]">
                              <PaperSelect title="Вратарь гостей" options={awayGoalieSelectOptions} emptyLabel="Пустые ворота" emptyDisplay="Пустые ворота" value={editLogData.away_goalie} onChange={(v) => setEditLogData(d => ({ ...d, away_goalie: v }))} className="!text-[13px] font-bold" />
                            </td>
                            <td className="p-0 text-center"><PaperSaveButton tone="log" onClick={saveEditPaperLog} /></td>
                          </tr>
                        );
                      }

                      // Бумажный вид: первая свободная строка — строка ввода новой записи
                      if (paperDraft && i === goalieLog.length) {
                        return (
                          <tr key="paper-draft" className={`h-[36px] border-b border-graphite/30 ${paperLogSaving ? PAPER_SAVING_CELL : ''}`}>
                            <td className="p-0 border-r border-graphite/[0.12]">
                              <PaperInput type="time" title="Время смены вратаря" value={paperLog.time} placeholder={autoTimeGoalieLog ? formatTime(timerSeconds) : ''} error={!!paperLogErrors.time} onChange={(v) => { setPaperLogErrors(e => ({ ...e, time: undefined })); setPaperLog(d => ({ ...d, time: v })); }} onEnter={handleAddPaperLog} className="font-bold" />
                            </td>
                            <td className="p-0 border-r border-graphite/[0.12]">
                              <PaperSelect title="Вратарь хозяев (пусто — без изменений)" options={homeGoalieSelectOptions} emptyLabel="Пустые ворота" emptyDisplay="Пустые ворота" value={paperLog.home} error={!!paperLogErrors.goalies} onChange={(v) => { setPaperLogErrors(e => ({ ...e, goalies: undefined })); setPaperLog(d => ({ ...d, home: v })); }} className="!text-[13px] font-bold" />
                            </td>
                            <td className="p-0 border-r border-graphite/[0.12]">
                              <PaperSelect title="Вратарь гостей (пусто — без изменений)" options={awayGoalieSelectOptions} emptyLabel="Пустые ворота" emptyDisplay="Пустые ворота" value={paperLog.away} error={!!paperLogErrors.goalies} onChange={(v) => { setPaperLogErrors(e => ({ ...e, goalies: undefined })); setPaperLog(d => ({ ...d, away: v })); }} className="!text-[13px] font-bold" />
                            </td>
                            <td className="p-0 text-center">
                              <PaperAddButton active={paperLogTime !== null && !paperLogSaving} tone="log" onClick={handleAddPaperLog} title={paperLogTime === null ? 'Укажите время смены' : 'Добавить запись'} />
                            </td>
                          </tr>
                        );
                      }

                      if (log && log.id === editLogId && !isReadOnly) {
                        return (
                          <tr key={`edit-${log.id}`} className="h-[36px] border-b border-graphite/30 bg-orange/10 transition-colors">
                            <td className="p-1 border-r border-graphite/[0.12] text-center">
                              <StylishInput isEditing isTimeField title="Время смены вратаря" value={editLogData.time} onChange={e => setEditLogData({ ...editLogData, time: formatTimeMask(e.target.value) })} className="text-center font-bold px-1" />
                            </td>
                            <td className="p-1 border-r border-graphite/[0.12] text-center">
                              <CustomSelect isEditing title="Вратарь хозяев" options={homeGoalieSelectOptions} value={editLogData.home_goalie} onChange={e => setEditLogData({ ...editLogData, home_goalie: e.target.value })} className="font-bold text-[12px] h-[28px]" placeholder="Пустые ворота" />
                            </td>
                            <td className="p-1 border-r border-graphite/[0.12] text-center">
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
                          <tr key={log.id} className="hover:bg-graphite/5 transition-colors group h-[36px] border-b border-graphite/30">
                            <td className="font-mono font-semibold text-[13px] text-graphite border-r border-graphite/[0.12]">{formatTime(log.time_seconds)}</td>
                            <td className="text-center font-bold border-r border-graphite/[0.12] text-[13px] text-graphite">{renderGoalieLabel(log.home_goalie_id, homeGoalieOptions, log.home_goalie_unspecified)}</td>
                            <td className="text-center font-bold border-r border-graphite/[0.12] text-[13px] text-graphite">{renderGoalieLabel(log.away_goalie_id, awayGoalieOptions, log.away_goalie_unspecified)}</td>
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

                      // Записей нет — одна пустая строка, чтобы список не схлопывался в шапку
                      return (
                        <tr key="empty" className="h-[36px] border-b border-graphite/30">
                          <td className="border-r border-graphite/[0.12]"></td>
                          <td className="border-r border-graphite/[0.12]"></td>
                          <td className="border-r border-graphite/[0.12]"></td>
                          <td></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── ПРАВАЯ КОЛОНКА ──
                Дивизион без учёта бросков: таблицы нет вовсе, но колонка остаётся
                (пустая), чтобы журнал вратарей не растягивался на всю ширину. */}
            <div className="flex-1 min-w-0 flex flex-col gap-5">

            {shotsTrackingEnabled && (
            <>
            {/* Карточка: БРОСКИ В СТВОР ВРАТАРЮ
                Секретарь вводит ВСЕ броски в створ на конкретного вратаря за период.
                Отражённые броски (saves) и командные SOG считаются на лету.
                Штрафные броски по ходу матча сюда ВХОДЯТ — и отражённые, и
                реализованные: реализованный пишется вратарю в пропущенные, поэтому
                без него броски окажутся меньше пропущенных, и сейвы занизятся.
                Послематчевая серия — нет, она учитывается отдельными событиями. */}
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
                            // null, пока в правке не заполнено ни одно поле — чтобы итог
                            // показывал «-», а не 0 (0 = заполненный ноль, это результат).
                            const editSum = (() => {
                              if (!isEditingGoalie) return null;
                              const vals = periods
                                .map(p => editGoalieShotData[p])
                                .filter(v => v !== '' && v != null);
                              return vals.length
                                ? vals.reduce((s, v) => s + (parseInt(v, 10) || 0), 0)
                                : null;
                            })();

                            return (
                              <tr
                                key={goalieKey}
                                className={`h-[36px] border-b border-graphite/20 transition-colors ${isEditingGoalie ? 'bg-orange/5' : 'hover:bg-graphite/5'}`}
                              >
                                <td className="border-r border-graphite/30 text-left pl-4 pr-2">
                                  <span className="font-semibold text-[13px] text-graphite truncate">{goalieName}</span>
                                </td>

                                {isEditingGoalie && !isReadOnly && shotsTrackingEnabled ? (
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
                                        {editSum ?? '-'}
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
                                        {getGoalieShotsForPeriod(goalieId, p, team.id) ?? '-'}
                                      </td>
                                    ))}
                                    <td className="font-mono font-black text-[13px] text-status-accepted border-r border-graphite/30">
                                      {getGoalieShotsTotal(goalieId, team.id) ?? '-'}
                                    </td>
                                    <td className="p-0 text-center">
                                      {!isReadOnly && shotsTrackingEnabled && (
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
            </>
            )}

            </div>
            {/* ── конец правой колонки ── */}

          </div>
        </div>
      </div>
    </div>
  );
};
