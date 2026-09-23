// src/components/GameLiveDesk/ProtocolSheet.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  formatTime, parseTime, formatTimeMask, localizePosition, calculatePenaltyTimelines,
  CustomSelect, StylishSelect, StylishInput, PenaltyOffenderSelect, TriggerButton,
  goalStrengthOptions, penaltyReasonOptions, getPenaltyReasonCode, GOAL_STRENGTH_DISPLAY,
  PENALTY_KINDS, AUTO_PENALTY_REASONS, penaltyKindOptions, penaltyKindOf, penaltyKindLabel, isContinuationRow, penaltyGroupKey, sortPenaltyRows,
  PS_PENDING, PS_FAILED, isPenaltyShotEvent, isScoredFromPlay
} from './GameDeskShared';
import { formatPenaltyOffender } from '../../ui/PenaltyOffenderModal';
import { PenaltyReasonsModal } from '../../ui/PenaltyReasonsModal';
import { Icon } from '../../ui/Icon';
import { EquipmentMark } from '../../ui/EquipmentMark';

// Обратный отсчёт тайм-аута: 30 секунд с момента нажатия кнопки, потом ещё
// минуту висит на нуле, чтобы секретарь видел, что тайм-аут закончился, и
// убирается сам. Считаем от штампа времени, а не тиками — так отсчёт не
// «плывёт» при перерисовках и в свёрнутой вкладке.
const TIMEOUT_SECS = 30;
const TIMEOUT_LINGER_MS = 60 * 1000;

const TimeoutCountdown = ({ startedAt, onExpire }) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        setNow(Date.now());
        const tick = setInterval(() => setNow(Date.now()), 250);
        const expire = setTimeout(onExpire, TIMEOUT_SECS * 1000 + TIMEOUT_LINGER_MS);
        return () => { clearInterval(tick); clearTimeout(expire); };
    }, [startedAt]);

    const left = Math.max(0, TIMEOUT_SECS - Math.floor((now - startedAt) / 1000));
    const isOver = left === 0;

    return (
        <div
            className={`flex items-center gap-1.5 px-3 rounded-md border shadow-sm h-[32px] transition-colors ${isOver ? 'bg-white border-graphite/20 text-graphite/40' : 'bg-orange/10 border-orange/40 text-orange'}`}
            title={isOver ? 'Тайм-аут закончился' : 'Идёт тайм-аут'}
        >
            <Icon name="stopwatch" className={`w-4 h-4 shrink-0 ${isOver ? '' : 'animate-pulse'}`} />
            <span className="font-mono text-[13px] font-bold tabular-nums">{formatTime(left)}</span>
        </div>
    );
};

const TimeoutPill = ({ timeoutEvent, timerSeconds, onSave, onDelete, isReadOnly }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempVal, setTempVal] = useState('');

    useEffect(() => {
        if (isEditing && timeoutEvent) {
            setTempVal(formatTime(timeoutEvent.time_seconds));
        }
    }, [isEditing, timeoutEvent]);

    const handleSaveAction = () => {
        setIsEditing(false);
        const newSecs = parseTime(tempVal);
        if (newSecs !== null && newSecs !== timeoutEvent.time_seconds) {
            onSave({ time_seconds: newSecs }, timeoutEvent.id);
        }
    };

    if (isEditing && timeoutEvent && !isReadOnly) {
        return (
            <div className="flex items-center justify-between bg-white border border-orange/50 rounded-md px-2 shadow-sm ring-2 ring-orange/10 h-[32px] w-[140px] relative" onClick={e => e.stopPropagation()}>
                <span className="text-[10px] font-bold uppercase text-graphite-light absolute left-2.5">ТАЙМ-АУТ</span>
                <input
                    autoFocus
                    inputMode="numeric"
                    pattern="[0-9:]*"
                    value={tempVal}
                    onChange={e => setTempVal(formatTimeMask(e.target.value))}
                    onBlur={(e) => { if (!e.relatedTarget?.closest('.clear-btn')) handleSaveAction(); }}
                    onKeyDown={e => { if(e.key === 'Enter') handleSaveAction(); }}
                    className="bg-transparent font-mono text-[13px] font-bold text-graphite outline-none w-full text-right pr-6"
                    placeholder="00:00"
                />
                <button
                    type="button"
                    className="clear-btn absolute right-1 w-5 h-5 flex items-center justify-center text-status-rejected hover:bg-status-rejected/10 rounded transition-colors"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(false); onDelete(timeoutEvent.id); }}
                    title="Удалить тайм-аут"
                >
                    <Icon name="close" className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    if (timeoutEvent) {
        return (
            <button
                onClick={(e) => { e.stopPropagation(); if (!isReadOnly) setIsEditing(true); }}
                className={`relative group flex items-center justify-between px-3 rounded-md transition-all border bg-white border-graphite/20 shadow-sm h-[32px] w-[140px] ${isReadOnly ? 'cursor-default opacity-80' : 'hover:border-graphite/25'}`}
                title={isReadOnly ? "Тайм-аут" : "Редактировать время тайм-аута"}
            >
                <span className="text-[10px] font-bold uppercase text-graphite-light">ТАЙМ-АУТ</span>
                <span className="font-mono text-[13px] font-bold text-graphite">
                    {formatTime(timeoutEvent.time_seconds)}
                </span>
            </button>
        );
    }

    return (
        <button 
            onClick={(e) => { e.stopPropagation(); if (!isReadOnly) onSave({ time_seconds: timerSeconds }); }} 
            className={`relative group flex items-center justify-between px-3 rounded-md transition-all border bg-transparent border-dashed h-[32px] w-[140px] ${isReadOnly ? 'border-graphite/10 cursor-default opacity-50' : 'border-graphite/30 hover:border-orange hover:bg-orange/5 hover:text-orange text-graphite-light'}`}
            title={isReadOnly ? "" : "Зафиксировать тайм-аут"}
        >
            <span className={`text-[10px] font-bold uppercase ${isReadOnly ? 'text-graphite/30' : 'text-graphite/50 group-hover:text-orange'}`}>ТАЙМ-АУТ</span>
            <span className={`font-mono text-[13px] font-bold ${isReadOnly ? 'text-graphite/20' : 'text-graphite/25 group-hover:text-orange'}`}>--:--</span>
        </button>
    );
};

export const ProtocolSheet = ({
  teamId, teamLetter, teamName, teamLogo, roster, teamEvents, oppEvents = [], timerSeconds,
  // onSavePenaltyGroup — штраф целиком (вид + все строки), см. savePenaltyGroup в GameLiveDesk;
  // onSaveEvent для штрафов остаётся только для правки отдельной строки группы
  onSaveEvent, onSavePenaltyGroup, onDeleteEvent, onToggleLineup, isPlusMinusEnabled, onRequestPlusMinus, isSaving,
  goalieLog = [], isReadOnly, league,
  // Справочник причин удаления сезона; если лига его не заполнила, сюда приходит
  // встроенный список (см. usePenaltyReasons)
  penaltyReasons = penaltyReasonOptions,
  // Настройки лиги (sec_auto_time_*): подставлять ли в новое событие время таймера
  // панели. Выключено — время только руками, без него событие не сохранить.
  autoTimeGoals = true,
  autoTimePenalties = true,
  // Дивизион не ведёт броски в створ — графа «Бр» у голов не нужна
  shotsTrackingEnabled = true
}) => {
  // Причина уходит в событие снимком: наименование + сокращение + ссылка на пункт.
  // Пункт справочника потом могут отредактировать или удалить — протокол от этого
  // меняться не должен.
  //
  // Дисциплинарные причины (ДИСЦ, ДИС-КН) — всегда своё сокращение и без ссылки на пункт
  // справочника лиги: иначе диктор взял бы из пункта падеж и сказал «дисциплинарным
  // штрафом… за дисциплинарный штраф». Вид штрафа и так называет его сам.
  const penaltySnapshot = (violation) => {
    const auto = AUTO_PENALTY_REASONS.find(r => r.title === violation);
    if (auto) return { penalty_violation: auto.title, penalty_violation_code: auto.code, penalty_reason_id: null };
    const opt = penaltyReasons.find(o => String(o.value) === String(violation));
    return {
      penalty_violation: violation || null,
      penalty_violation_code: opt?.shortLabel || getPenaltyReasonCode(violation) || null,
      penalty_reason_id: opt?.reasonId || null,
    };
  };
  // Во «Взятии ворот» живут и голы, и штрафные броски: реализованный ШБ — это
  // обычный гол с ИС «ШБ», нереализованный и ещё не исполненный — отдельные типы
  // события, в счёт матча не идущие. Нумерация строк общая, как в бумажном протоколе.
  const goals = teamEvents
    .filter(e => e.event_type === 'goal' || e.event_type === PS_PENDING || e.event_type === PS_FAILED)
    .sort((a, b) => a.time_seconds - b.time_seconds);
  // Строки одной группы штрафа — подряд, по порядку (см. sortPenaltyRows)
  const penalties = sortPenaltyRows(teamEvents.filter(e => e.event_type === 'penalty'));
  const timeouts = teamEvents.filter(e => e.event_type === 'timeout').sort((a, b) => a.time_seconds - b.time_seconds);

  const penaltiesWithTimeline = calculatePenaltyTimelines(penalties);


  const [newGoal, setNewGoal] = useState({ time: '', scorer: '', ast1: '', ast2: '', str: 'equal', from_shot: true });
  // who — нарушитель и отбывающий: { type: ''|'player'|'team'|'official', jersey, server }
  // kind — вид штрафа (PENALTY_KINDS), violation — причина, у штрафа она одна (см. rowViolation).
  const EMPTY_WHO = { type: '', jersey: '', server: '' };
  const EMPTY_PENALTY = { who: EMPTY_WHO, kind: 'minor', violation: '', start: '' };
  const [newPenalty, setNewPenalty] = useState(EMPTY_PENALTY);
  // Какому полю открыта модалка причин: 'new' — форме, 'edit' — редактору группы
  const [reasonsTarget, setReasonsTarget] = useState(null);

  const [editGoalId, setEditGoalId] = useState(null);
  const [editGoalData, setEditGoalData] = useState({});
  // Правка штрафа: первая строка открывает редактор группы (вид, нарушитель, начало,
  // причины всех строк), строка-продолжение — только свои поля (причина, окончание)
  const [editPenaltyId, setEditPenaltyId] = useState(null);
  const [editPenaltyData, setEditPenaltyData] = useState({});

  const [manualStr, setManualStr] = useState(false);

  // Время нового события: введённое, иначе с таймера — если лига это разрешила.
  // null — времени нет: кнопка «+» гаснет, событие в базу не уходит и в счёт не идёт.
  const newGoalTime = parseTime(newGoal.time) ?? (autoTimeGoals ? timerSeconds : null);
  const newPenaltyStart = parseTime(newPenalty.start) ?? (autoTimePenalties ? timerSeconds : null);
  const goalTimeMissing = newGoalTime === null;
  const penaltyTimeMissing = newPenaltyStart === null;

  // Без нарушителя удаление не сохранить: раньше пустой выбор «-» означал командный
  // штраф, теперь для него есть своя плитка «К».
  const penaltyWhoMissing = !newPenalty.who?.type;

  // Форма нового события стоит над списком: без рамок между ячейками, с воздухом
  // вокруг полей. Голы и удаления тонированы в цвет своих заголовков — так две формы
  // не сливаются в одну строку. Поля белые с тонкой рамкой (ghost у виджетов): на
  // тонированном фоне обычные серые поля терялись бы.
  // Записи в списке подкрашены по типу — тот же язык, что у карточек формы, только
  // в разы бледнее: пустые строки остаются белыми, записи читаются «гол» / «удаление».
  const GOAL_TINT = 'bg-status-accepted/[0.035]';
  const goalInputCell = 'px-1 py-2.5 bg-status-accepted/[0.09]';
  const penaltyInputCell = 'px-1 py-2.5 bg-status-rejected/[0.08]';
  const goalGhost = true;
  const penaltyGhost = true;

  // Момент нажатия «Зафиксировать тайм-аут» — от него идёт обратный отсчёт в шапке.
  // Живёт здесь, а не в TimeoutPill: после сохранения пустая кнопка заменяется
  // на кнопку с событием, и состояние внутри неё пропало бы.
  const [timeoutStartedAt, setTimeoutStartedAt] = useState(null);

  // Тайм-аут удалили (нажали по ошибке) — отсчёт тоже убираем.
  const prevTimeoutsCount = useRef(timeouts.length);
  useEffect(() => {
    if (prevTimeoutsCount.current > 0 && timeouts.length === 0) setTimeoutStartedAt(null);
    prevTimeoutsCount.current = timeouts.length;
  }, [timeouts.length]);

  // Автоматом ставится только «ПВ» — по журналу вратарей (у соперника на этот
  // момент пустые ворота). Большинство/меньшинство (+1/+2/-1/-2) секретарь
  // отмечает руками: по таймлайну штрафов оно считалось ненадёжно. «ШБ» приходит
  // исходом строки штрафного броска, сюда не попадает.
  const calculateGoalStrength = (timeSecs) => {
    if (timeSecs === null || timeSecs === undefined) return 'equal';

    const isHome = teamLetter === 'А';
    const relevantLogs = goalieLog.filter(l => l.time_seconds <= timeSecs);
    const currentLog = relevantLogs.length > 0 ? relevantLogs[relevantLogs.length - 1] : null;
    
    const oppGoalieId = isHome ? currentLog?.away_goalie_id : currentLog?.home_goalie_id;
    if (currentLog && !oppGoalieId) {
       return 'en'; 
    }

    return 'equal'; 
  };

  useEffect(() => {
     if (manualStr) return; 
     // Без времени (подстановка с таймера выключена, своё не введено) ситуация
     // остаётся прочерком — считать её не от чего.
     const calcStr = calculateGoalStrength(newGoalTime);
     
     if (newGoal.str !== calcStr) {
         setNewGoal(prev => ({ ...prev, str: calcStr }));
     }
  }, [newGoalTime, goalieLog, manualStr]);

  const getPlayerId = (jersey) => roster.find(r => r.jersey_number == jersey)?.player_id || null;
  const getJersey = (id) => roster.find(r => r.player_id == id)?.jersey_number || '';

  // Нарушитель/отбывающий: из события — в объект модалки и обратно в поля запроса.
  // У старых записей типа нет: пустой игрок значил командный штраф.
  const whoFromEvent = (p) => ({
    type: p.penalty_offender_type || (p.primary_player_id ? 'player' : 'team'),
    jersey: getJersey(p.primary_player_id),
    server: getJersey(p.penalty_served_by_id),
  });
  // В графе «#» списка: нарушитель жирно, отбывающий за ним — бледнее, чтобы «5/3»
  // не читалось как счёт
  const renderOffender = (p) => {
    const who = whoFromEvent(p);
    const head = formatPenaltyOffender({ ...who, server: '' });
    return who.server
      ? <>{head}<span className="text-graphite/40 font-medium"> / {who.server}</span></>
      : head;
  };
  const whoToPayload = (who) => ({
    player_id: who?.type === 'player' ? getPlayerId(who.jersey) : null,
    penalty_offender_type: who?.type || 'team',
    penalty_served_by_id: who?.server ? getPlayerId(who.server) : null,
  });

  // ─── СБОРКА СТРОК ШТРАФА ────────────────────────────────────────────────────
  // Вид даёт набор строк (см. PENALTY_KINDS); здесь у каждой считаются начало и
  // окончание. Строки идут цепочкой: следующая начинается, когда закончилась
  // предыдущая. Малый штраф закрывает гол соперника из игры в его окне — тогда
  // цепочка сдвигается на время гола (для удалений задним числом). Большой (5)
  // голом не закрывается; у двадцатки начало = время нарушения, окончания нет.
  //
  // Гол с назначенного штрафного броска удаление НЕ прекращает: буллит разыгрывается
  // один на один и к численному преимуществу отношения не имеет (isScoredFromPlay).
  const kindSpec = (kind) => PENALTY_KINDS[kind] || PENALTY_KINDS.minor;

  // Причина у штрафа одна: её получают строки меньшинства (у «4» — обе двойки), а
  // десятка в «2+10»/«4+10» и двадцатка в «5+20» — свою дисциплинарную (fixedReason).
  const rowViolation = (row, violation) => (row.fixedReason ? row.fixedReason.title : (violation || ''));

  // Причина при смене вида. У одиночных «10» и «20» — предвыбор их дисциплинарной
  // причины (секретарь может сменить). Уходя с них, подставленную причину убираем —
  // для двойки она не годится, — а выбранную секретарём оставляем.
  const AUTO_REASON_TITLES = AUTO_PENALTY_REASONS.map(r => r.title);
  const reasonForKind = (kind, current) => {
    const preset = kindSpec(kind).defaultReason?.title;
    if (preset) return preset;
    return AUTO_REASON_TITLES.includes(current) ? '' : (current || '');
  };

  // Список для окна причин. У одиночных «10» и «20» их дисциплинарная причина есть
  // всегда — даже если справочник лиги её не содержит, — чтобы к предвыбору можно было
  // вернуться, сменив его.
  const autoReasonOption = (r) => ({ value: r.title, label: r.title, shortLabel: r.code, num: null });
  const reasonOptionsFor = (kind) => {
    const preset = kindSpec(kind).defaultReason;
    if (!preset || penaltyReasons.some(o => String(o.value) === preset.title)) return penaltyReasons;
    return [autoReasonOption(preset), ...penaltyReasons];
  };
  // Правка уже записанной строки — как обычной, с любой причиной. Обе дисциплинарные
  // в списке есть всегда: у десятки и двадцатки текущая причина не должна пропадать.
  const rowReasonOptions = [
    ...AUTO_PENALTY_REASONS.filter(r => !penaltyReasons.some(o => String(o.value) === r.title)).map(autoReasonOption),
    ...penaltyReasons,
  ];

  // Причина в поле формы — сокращением; пусто, если не выбрана
  const reasonCode = (violation) => {
    if (!violation) return '';
    return AUTO_PENALTY_REASONS.find(r => r.title === violation)?.code
      || penaltyReasons.find(o => String(o.value) === String(violation))?.shortLabel
      || getPenaltyReasonCode(violation);
  };

  const buildGroupRows = (kind, startSecs, who, violation) => {
    const spec = kindSpec(kind);
    const serverId = who?.server ? getPlayerId(who.server) : null;
    let cursor = startSecs;

    return spec.rows.map((r, i) => {
      let time_seconds = startSecs;
      let penalty_end_time = null;

      if (r.cls === 'penalty_shot') {
        // ШБ не тикает: «окончание» равно началу, чтобы строка не попадала ни в
        // слоты меньшинства, ни в обратный отсчёт таймера штрафов.
        penalty_end_time = startSecs;
      } else if (r.cls === 'game_misconduct') {
        penalty_end_time = null;
      } else {
        time_seconds = cursor;
        let end = cursor + r.minutes * 60;
        if (r.cls === 'minor') {
          const goal = oppEvents
            .filter(e => isScoredFromPlay(e) && e.time_seconds > cursor && e.time_seconds < end)
            .sort((a, b) => a.time_seconds - b.time_seconds)[0];
          if (goal) end = goal.time_seconds;
        }
        penalty_end_time = end;
        cursor = end;
      }

      return {
        time_seconds, penalty_end_time,
        penalty_minutes: r.minutes, penalty_class: r.cls,
        // Отбывающий пишется в строки, где может сидеть партнёр: двойки (и у 2, 2+2, и при
        // 2+10), пятёрка при 5+20. Десятка и двадцатка — всегда сам нарушитель.
        penalty_served_by_id: r.needsServer ? serverId : null,
        ...penaltySnapshot(rowViolation(r, violation)),
      };
    });
  };

  // Что показать в графе «Окон» формы: конец последней строки меньшинства, у 20 и ШБ — прочерк
  const previewGroupEnd = (kind, startSecs, who, violation) => {
    if (startSecs === null || isNaN(startSecs)) return '';
    const rows = buildGroupRows(kind, startSecs, who, violation);
    const timed = rows.filter(r => r.penalty_end_time !== null && r.penalty_class !== 'penalty_shot');
    if (timed.length === 0) return '—';
    return formatTime(timed[timed.length - 1].penalty_end_time);
  };

  // Тело запроса на создание/правку группы (см. savePenaltyGroup в GameLiveDesk)
  const groupPayload = (data) => {
    const startSecs = data.startSecs;
    return {
      penalty_kind: data.kind,
      time_seconds: startSecs,
      player_id: data.who?.type === 'player' ? getPlayerId(data.who.jersey) : null,
      penalty_offender_type: data.who?.type || 'team',
      rows: buildGroupRows(data.kind, startSecs, data.who, data.violation),
    };
  };

  const handleAddGoal = () => {
    if (goalTimeMissing) return;
    onSaveEvent(teamId, 'goal', {
      time_seconds: newGoalTime,
      player_id: getPlayerId(newGoal.scorer),
      assist1_id: getPlayerId(newGoal.ast1),
      assist2_id: getPlayerId(newGoal.ast2),
      goal_strength: newGoal.str,
      from_shot: newGoal.from_shot
    });
    setNewGoal({ time: '', scorer: '', ast1: '', ast2: '', str: 'equal', from_shot: true });
    setManualStr(false);
  };

  const startEditGoal = (g) => {
    setEditGoalId(g.id);
    setEditGoalData({
      time: formatTime(g.time_seconds), scorer: getJersey(g.primary_player_id),
      ast1: getJersey(g.assist1_id), ast2: getJersey(g.assist2_id), str: g.goal_strength || 'equal',
      from_shot: g.from_shot ?? true,
      psOutcome: g.event_type,
    });
  };

  const saveEditGoal = async () => {
    const success = await onSaveEvent(teamId, 'goal', {
      time_seconds: parseTime(editGoalData.time), player_id: getPlayerId(editGoalData.scorer),
      assist1_id: getPlayerId(editGoalData.ast1), assist2_id: getPlayerId(editGoalData.ast2), goal_strength: editGoalData.str,
      from_shot: editGoalData.from_shot
    }, editGoalId);
    if (success) setEditGoalId(null);
  };

  // ─── ШТРАФНОЙ БРОСОК ──────────────────────────────────────────────────────
  // Строку заводит не секретарь, а система — в момент, когда сопернику записали
  // штраф вида «ШБ». Здесь правятся время, бьющий и исход.
  //
  // Исход — выбор из двух: реализован (тип события становится 'goal' с ИС «ШБ»,
  // шайба идёт в счёт) или не реализован ('failed_ps', счёт не меняется).
  // «Ещё не исполнен» третьим вариантом не предлагается: это состояние по
  // умолчанию, в котором строка рождается, и вернуться в него незачем — при
  // завершении матча оно само переписывается в «не реализован».
  const PS_OUTCOME_OPTIONS = [
    { value: 'goal',     label: 'Реализован' },
    { value: PS_FAILED,  label: 'Не реализован' },
  ];
  const PS_PENDING_LABEL = 'Не испол.';

  // «Ещё не исполнен» остаётся в списке, только пока исход действительно не выбран —
  // иначе поле показывало бы исход, которого никто не выбирал. Как только секретарь
  // отметил результат, вариантов ровно два.
  const psOutcomeOptions = (current) => (current === PS_PENDING
    ? [{ value: PS_PENDING, label: PS_PENDING_LABEL }, ...PS_OUTCOME_OPTIONS]
    : PS_OUTCOME_OPTIONS);

  const PS_OUTCOME_VIEW = {
    [PS_PENDING]: { label: PS_PENDING_LABEL, className: 'text-graphite/40' },
    goal:         { label: 'Реализ.',     className: 'text-status-accepted font-bold' },
    [PS_FAILED]:  { label: 'Не реализ.',  className: 'text-status-rejected font-bold' },
  };

  const saveEditPs = async (ev) => {
    const success = await onSaveEvent(teamId, editGoalData.psOutcome || ev.event_type, {
      time_seconds: parseTime(editGoalData.time),
      player_id: getPlayerId(editGoalData.scorer),
      // ИС у штрафного броска всегда «ШБ», менять её нельзя.
      goal_strength: 'ps',
      // Буллит — всегда бросок в створ: секретарь заносит его и в броски по вратарю.
      from_shot: true,
    }, ev.id);
    if (success) setEditGoalId(null);
  };

  const toggleGoalFromShot = (g) => {
    onSaveEvent(teamId, 'goal', {
      time_seconds: g.time_seconds,
      player_id: g.primary_player_id,
      assist1_id: g.assist1_id,
      assist2_id: g.assist2_id,
      goal_strength: g.goal_strength,
      from_shot: !(g.from_shot ?? true)
    }, g.id);
  };

  const handleAddPenalty = async () => {
    if (penaltyTimeMissing || penaltyWhoMissing) return;
    const ok = await onSavePenaltyGroup(teamId, groupPayload({ ...newPenalty, startSecs: newPenaltyStart }));
    if (ok) setNewPenalty(EMPTY_PENALTY);
  };

  // Первая строка (или старая одиночная запись) — редактор группы целиком.
  // Старые виды, которых больше не заводят (матч-штраф одной строкой, большой без
  // двадцатки), в редакторе становятся «5+20» — единственным большим штрафом.
  const LEGACY_KIND_TO_EDITABLE = { match: 'major', legacy_major: 'major' };
  const startEditGroup = (p) => {
    const rows = penalties
      .filter(r => penaltyGroupKey(r) === penaltyGroupKey(p))
      .sort((a, b) => (Number(a.penalty_group_seq) || 1) - (Number(b.penalty_group_seq) || 1));
    const rawKind = penaltyKindOf(p);
    const kind = LEGACY_KIND_TO_EDITABLE[rawKind] || (PENALTY_KINDS[rawKind] ? rawKind : 'minor');
    // Причина одна — с первой строки (двойка, пятёрка или сама 10/20). Разные причины
    // у старых штрафов при сохранении правки сведутся к ней.
    setEditPenaltyId(p.id);
    setEditPenaltyData({ mode: 'group', who: whoFromEvent(p), kind, violation: rows[0]?.penalty_violation || '', start: formatTime(p.time_seconds) });
  };

  const saveEditGroup = async () => {
    const startSecs = parseTime(editPenaltyData.start);
    if (startSecs === null || isNaN(startSecs)) return;
    const target = penalties.find(r => r.id === editPenaltyId);
    const ok = await onSavePenaltyGroup(teamId, groupPayload({ ...editPenaltyData, startSecs }), penaltyGroupKey(target));
    if (ok) setEditPenaltyId(null);
  };

  // Строка-продолжение (вторая двойка, десятка, двадцатка) — только свои поля: причина
  // и окончание, как у обычной строки. Нарушитель, вид и начало — у группы, правятся с
  // первой строки. Правило «одна причина, десятке и двадцатке — дисциплинарная» действует
  // при вводе штрафа; записанную строку секретарь вправе поправить как угодно.
  const startEditRow = (p) => {
    setEditPenaltyId(p.id);
    setEditPenaltyData({
      mode: 'row',
      violation: p.penalty_violation || '',
      end: p.penalty_end_time === null || p.penalty_end_time === undefined ? '' : formatTime(p.penalty_end_time),
    });
  };

  const saveEditRow = async () => {
    const p = penalties.find(r => r.id === editPenaltyId);
    if (!p) return;
    const endless = p.penalty_class === 'game_misconduct' || p.penalty_class === 'penalty_shot';
    const endSecs = endless ? (p.penalty_class === 'penalty_shot' ? p.time_seconds : null) : parseTime(editPenaltyData.end);
    if (!endless && (endSecs === null || isNaN(endSecs))) return;

    const success = await onSaveEvent(teamId, 'penalty', {
      time_seconds: p.time_seconds, penalty_end_time: endSecs,
      player_id: p.primary_player_id || null,
      penalty_offender_type: p.penalty_offender_type || (p.primary_player_id ? 'player' : 'team'),
      penalty_served_by_id: p.penalty_served_by_id || null,
      penalty_minutes: p.penalty_minutes, penalty_class: p.penalty_class,
      ...penaltySnapshot(editPenaltyData.violation),
    }, p.id);
    if (success) setEditPenaltyId(null);
  };

  const startEditPenalty = (p) => (isContinuationRow(p) ? startEditRow(p) : startEditGroup(p));

  // Окно причин: вид и причина — из формы или редактора группы
  const reasonsModalState = reasonsTarget === 'new'
    ? { kind: newPenalty.kind, value: newPenalty.violation }
    : reasonsTarget === 'edit'
      ? { kind: editPenaltyData.kind, value: editPenaltyData.violation || '' }
      : null;
  const applyReason = (value) => {
    if (reasonsTarget === 'new') setNewPenalty(prev => ({ ...prev, violation: value }));
    if (reasonsTarget === 'edit') setEditPenaltyData(prev => ({ ...prev, violation: value }));
  };

  // Строка ввода вынесена из сетки наверх (см. форму под шапкой), поэтому +1 не нужен
  const MAX_ROWS = Math.max(roster.length, goals.length, penaltiesWithTimeline.length, 1);
  const rows = Array.from({ length: MAX_ROWS });
  // Разметка колонок и шапка общие для двух таблиц: формы ввода (сверху) и списка.
  // Две таблицы с одним colgroup и процентными ширинами дают одинаковые колонки.
  // table-fixed + проценты на всех колонках (сумма 100): раскладка тянется вместе
  // с шириной панели, а пропорции держатся. Ориентир — сетка ~1250px: 1% ≈ 12.5px.
  // Время гола, «Нач» и «Окон» одинаковые; «#» удалений шире обычного номера
  // («ОПК/75», «12/44»); «Причина» — под сокращение.
  // Графе состава добавлены 1.8% — без них фамилия с именем целиком туда не влезала.
  // Взяты они понемногу у самых свободных граф — причины (в ней только сокращение
  // вроде «ТЛ-БР»), нарушителя, минут и номеров авторов гола.
  // Сумма долей осталась прежней (100% с графой бросков).
  const colGroup = (
          <colgroup>
            <col className="w-[2.6%]" />
            <col className="w-[13.0%]" />
            <col className="w-[3.6%]" />

            <col className="w-[2.6%]" />
            <col className="w-[5.8%]" />
            <col className="w-[5.5%]" />
            <col className="w-[5.5%]" />
            <col className="w-[5.5%]" />
            <col className="w-[4.5%]" />
            {shotsTrackingEnabled && <col className="w-[3.8%]" />}
            <col className="w-[5.6%]" />

            <col className="w-[6.4%]" />
            <col className="w-[6.1%]" />
            <col className="w-[12.3%]" />
            <col className="w-[5.8%]" />
            <col className="w-[5.8%]" />
            <col className="w-[5.6%]" />
          </colgroup>
  );
  // Заголовки блоков — над формой ввода, заголовки колонок — под ней, над списком:
  // так подписи колонок читаются и для полей формы, и для записей.
  // withBottom — жирная нижняя граница: нужна над списком (только чтение), над формой —
  // нет, там заголовки просто сидят на серой подложке формы.
  // leftCell — что стоит над составом: над формой это ячейка с логотипом на две строки
  // (rowSpan), над списком — пустая.
  const blockTitlesRow = (withBottom, leftCell = <th colSpan="3" className={`py-2 ${withBottom ? 'border-b-2 border-graphite/25' : ''}`}></th>) => (
            <tr className="bg-gray-bg-light text-graphite">
              {leftCell}
              <th colSpan={shotsTrackingEnabled ? 8 : 7} className={`py-2 font-bold uppercase tracking-widest text-[10px] text-status-accepted ${withBottom ? 'border-b-2 border-graphite/25' : ''}`}>Взятие ворот</th>
              <th colSpan="6" className={`py-2 font-bold uppercase tracking-widest text-[10px] text-status-rejected ${withBottom ? 'border-b-2 border-graphite/25' : ''}`}>Удаления</th>
            </tr>
  );
  const columnTitlesHead = (
          <thead>
            <tr className="bg-graphite/15 text-[11px] text-graphite-light uppercase tracking-wider relative z-0">
              <th className="border-l border-graphite/30 border-r [border-right-color:rgb(var(--graphite)_/_0.12)] py-1.5 font-bold">#</th>
              <th className="border-r border-graphite/[0.12] py-1.5 text-left px-2 font-bold">Фамилия, Имя</th>
              <th className="border-r-2 border-graphite/25 py-1.5 font-bold">Поз</th>

              <th className="border-r border-graphite/[0.12] py-1.5 font-bold text-status-accepted"></th>
              <th className="border-r border-graphite/[0.12] py-1.5 font-bold text-status-accepted">Время</th>
              <th className="border-r border-graphite/[0.12] py-1.5 font-bold text-status-accepted">Г</th>
              <th className="border-r border-graphite/[0.12] py-1.5 font-bold text-status-accepted">П1</th>
              <th className="border-r border-graphite/[0.12] py-1.5 font-bold text-status-accepted">П2</th>
              <th className="border-r border-graphite/[0.12] py-1.5 font-bold text-status-accepted">ИС</th>
              {shotsTrackingEnabled && <th className="border-r border-graphite/[0.12] py-1.5 font-bold text-status-accepted" title="С броска / без броска">Бр</th>}
              <th className="border-r-2 border-graphite/25 py-1.5"></th>
              
              <th className="border-r border-graphite/[0.12] py-1.5 font-bold text-status-rejected">#</th>
              <th className="border-r border-graphite/[0.12] py-1.5 font-bold text-status-rejected">Шт</th>
              <th className="border-r border-graphite/[0.12] py-1.5 px-2 font-bold text-status-rejected">Причина</th> 
              <th className="border-r border-graphite/[0.12] py-1.5 font-bold text-status-rejected">Нач</th>
              <th className="border-r border-graphite/[0.12] py-1.5 font-bold text-status-rejected">Окон</th>
              <th className="border-r border-graphite/30 py-1.5"></th>
            </tr>
          </thead>
  );
  // Ячейки формы нового события — те же виджеты, что были в строке ввода внутри сетки
  const goalInputCells = (
                    <>
                      {/* Левый край карточки выезжает на 12px в колонку номера строки (псевдоэлемент):
                          сама колонка в форме пустая, а поле «Время» без этого упиралось в край */}
                      <td className={`${goalInputCell} relative before:content-[''] before:absolute before:inset-y-0 before:-left-3 before:w-3 before:rounded-l-md before:bg-status-accepted/[0.09]`}><StylishInput ghost={goalGhost} hint={autoTimeGoals ? '' : 'Время'} isTimeField title="Время гола" value={newGoal.time} placeholder={autoTimeGoals ? formatTime(timerSeconds) : ''} onChange={e=>setNewGoal({...newGoal, time: formatTimeMask(e.target.value)})} /></td>
                      <td className={goalInputCell}><StylishSelect ghost={goalGhost} hint="Автор" title="Автор гола" roster={roster} value={newGoal.scorer} onChange={e=>setNewGoal({...newGoal, scorer: e.target.value})} taken={{ [newGoal.ast1]: 'Ассистент 1', [newGoal.ast2]: 'Ассистент 2' }} className="!text-status-accepted font-bold" /></td>
                      <td className={goalInputCell}><StylishSelect ghost={goalGhost} hint="Пас 1" title="Ассистент 1" roster={roster} value={newGoal.ast1} onChange={e=>setNewGoal({...newGoal, ast1: e.target.value})} taken={{ [newGoal.scorer]: 'Автор', [newGoal.ast2]: 'Ассистент 2' }} /></td>
                      <td className={goalInputCell}><StylishSelect ghost={goalGhost} hint="Пас 2" title="Ассистент 2" roster={roster} value={newGoal.ast2} onChange={e=>setNewGoal({...newGoal, ast2: e.target.value})} taken={{ [newGoal.scorer]: 'Автор', [newGoal.ast1]: 'Ассистент 1' }} /></td>
                      <td className={goalInputCell}>
                         <CustomSelect
                            ghost={goalGhost}
                            hint="ИС"
                            title="Игровая ситуация"
                            options={goalStrengthOptions}
                            value={newGoal.str === 'equal' ? '' : newGoal.str}
                            onChange={e => {
                               setManualStr(true);
                               setNewGoal({...newGoal, str: e.target.value});
                            }}
                            hideEmpty
                         />
                      </td>
                      {shotsTrackingEnabled && (
                      <td className={`${goalInputCell} text-center`}>
                        <button
                          type="button"
                          onClick={() => setNewGoal({...newGoal, from_shot: !newGoal.from_shot})}
                          className={`mx-auto flex items-center justify-center w-7 h-7 rounded hover:bg-graphite/10 transition-colors ${newGoal.from_shot ? 'text-status-accepted' : 'text-status-rejected'}`}
                          title={newGoal.from_shot ? 'С броска' : 'Без броска'}
                        >
                          <Icon name={newGoal.from_shot ? 'shootout_goal' : 'shootout_miss'} className="w-5 h-5" />
                        </button>
                      </td>
                      )}
                      <td className={`${goalInputCell} text-center border-r-[6px] border-transparent bg-clip-padding rounded-r-[12px]`}>
                        <button
                          onClick={handleAddGoal}
                          disabled={goalTimeMissing}
                          className={`mx-auto w-full max-w-[52px] h-[30px] rounded-md transition-colors flex items-center justify-center ${goalTimeMissing ? 'bg-transparent ring-1 ring-inset ring-graphite/20 text-graphite/25 cursor-not-allowed' : 'bg-status-accepted text-white hover:bg-status-accepted/90 shadow-sm'}`}
                          title={goalTimeMissing ? 'Укажите время гола' : 'Добавить гол'}
                        >
                          <Icon name="plus" className="w-6 h-6" />
                        </button>
                      </td>
                    </>
  );
  const penaltyInputCells = (
                    <>
                      <td className={`${penaltyInputCell} !pl-2.5 rounded-l-md`}><PenaltyOffenderSelect ghost={penaltyGhost} hint="Игрок" title="Нарушитель" roster={roster} value={newPenalty.who} onChange={who=>setNewPenalty({...newPenalty, who})} className="!text-status-rejected font-bold" /></td>
                      <td className={penaltyInputCell}>
                        {/* Смена вида: у одиночных 10 и 20 — предвыбор причины (см. reasonForKind) */}
                        <CustomSelect
                          ghost={penaltyGhost}
                          title="Вид штрафа" options={penaltyKindOptions} value={newPenalty.kind}
                          onChange={e=>setNewPenalty({...newPenalty, kind: e.target.value, violation: reasonForKind(e.target.value, newPenalty.violation)})}
                          hideEmpty
                        />
                      </td>
                      {/* Причина — одна на штраф, через окно со справочником */}
                      <td className={penaltyInputCell}>
                        <TriggerButton
                          ghost={penaltyGhost} hint="Причина"
                          value={reasonCode(newPenalty.violation)}
                          onClick={() => setReasonsTarget('new')}
                          className="h-[30px] !py-0 !px-1"
                        />
                      </td>
                      <td className={penaltyInputCell}>
                        <StylishInput
                          ghost={penaltyGhost}
                          hint={autoTimePenalties ? '' : 'Начало'}
                          isTimeField title="Начало штрафа" value={newPenalty.start} placeholder={autoTimePenalties ? formatTime(timerSeconds) : ''}
                          onChange={e=>setNewPenalty({...newPenalty, start: formatTimeMask(e.target.value)})}
                          onBlur={()=>{
                            // Введённое время нормализуем к ММ:СС; при подстановке с таймера
                            // пустое поле после ухода фокуса фиксирует текущее время таймера
                            const s = newPenaltyStart;
                            if (s !== null && !isNaN(s)) setNewPenalty(prev => ({ ...prev, start: formatTime(s) }));
                          }}
                        />
                      </td>
                      <td className={`${penaltyInputCell} text-center font-mono text-[13px] text-graphite/40`} title="Окончание штрафа рассчитывается автоматически">
                        {previewGroupEnd(newPenalty.kind, newPenaltyStart, newPenalty.who, newPenalty.violation)}
                      </td>
                      <td className={`${penaltyInputCell} text-center border-r-[6px] border-transparent bg-clip-padding rounded-r-[12px]`}>
                        <button
                          onClick={handleAddPenalty}
                          disabled={penaltyTimeMissing || penaltyWhoMissing}
                          className={`mx-auto w-full max-w-[52px] h-[30px] rounded-md transition-colors flex items-center justify-center ${(penaltyTimeMissing || penaltyWhoMissing) ? 'bg-transparent ring-1 ring-inset ring-graphite/20 text-graphite/25 cursor-not-allowed' : 'bg-status-rejected text-white hover:bg-status-rejected/90 shadow-sm'}`}
                          title={penaltyWhoMissing ? 'Укажите нарушителя' : penaltyTimeMissing ? 'Укажите начало штрафа' : 'Добавить удаление'}
                        >
                          <Icon name="plus" className="w-6 h-6" />
                        </button>
                      </td>
                    </>
  );

  const loadingClass = isSaving ? "opacity-60 pointer-events-none select-none transition-opacity" : "transition-opacity";

  return (
    <div className={`bg-white border border-graphite/20 shadow-sm flex flex-col font-sans rounded-md ${loadingClass}`}>
      
      <div className="bg-gray-bg-light border-b border-graphite/20 px-4 py-3 flex justify-between items-center rounded-t-md select-none gap-4">
        
        <div className="font-bold text-graphite text-base uppercase tracking-wide flex items-center gap-3 shrink-0 min-w-[200px]">
          <span className="border-2 border-graphite w-8 h-8 flex items-center justify-center font-black rounded-sm shrink-0">{teamLetter}</span>
          {/* Логотип живёт слева от формы ввода; в шапке он только когда формы нет */}
          {isReadOnly && teamLogo && <img src={teamLogo} alt={teamName} className="w-8 h-8 object-contain drop-shadow-sm shrink-0" />}
          <span className="truncate max-w-[260px]" title={teamName}>{teamName}</span>
        </div>
        
        <div className="flex items-center justify-end gap-2 shrink-0 min-w-[140px]">
          {timeoutStartedAt && (
              <TimeoutCountdown startedAt={timeoutStartedAt} onExpire={() => setTimeoutStartedAt(null)} />
          )}
          {timeouts.length > 0 ? (
              timeouts.map(t => (
                  <TimeoutPill 
                      key={t.id}
                      timeoutEvent={t} 
                      timerSeconds={timerSeconds} 
                      onSave={(data, id) => onSaveEvent(teamId, 'timeout', data, id)} 
                      onDelete={onDeleteEvent} 
                      isReadOnly={isReadOnly}
                  />
              ))
          ) : (
              <TimeoutPill 
                  timeoutEvent={null} 
                  timerSeconds={timerSeconds} 
                  onSave={async (data) => {
                      setTimeoutStartedAt(Date.now());
                      const ok = await onSaveEvent(teamId, 'timeout', data);
                      if (!ok) setTimeoutStartedAt(null);
                      return ok;
                  }} 
                  onDelete={onDeleteEvent} 
                  isReadOnly={isReadOnly}
              />
          )}
        </div>
      </div>

      <div className="overflow-x-visible pb-4 pt-0.5">
        {/* Сверху вниз: заголовки блоков → форма нового события → заголовки колонок →
            список. Форма всегда на одном месте и не уезжает вниз по мере накопления
            записей; шапка колонок под ней подписывает и поля формы, и записи. Обе
            таблицы на одном colGroup — поля стоят ровно над своими графами. */}
        {!isReadOnly && (
          <div className="bg-gray-bg-light pb-3">
          {/* border-separate (а не collapse): у ячеек работают скругления, и каждая форма
              становится отдельной «карточкой» на подложке. Рамок у формы нет, поэтому
              разница моделей ни на чём другом не сказывается. Зазор между карточками —
              прозрачная 6px-рамка крайних ячеек; фон под неё не красится (bg-clip-padding). */}
          <table className="w-full min-w-[950px] text-sm text-center border-separate border-spacing-0 table-fixed select-none">
            {colGroup}
            <tbody className="text-graphite">
              {/* Логотип на две строки: заголовки зон + форма */}
              {blockTitlesRow(false, (
                <td colSpan="3" rowSpan="2" className="py-0 align-middle">
                  {teamLogo && <img src={teamLogo} alt={teamName} className="h-20 w-20 mx-auto object-contain drop-shadow-sm" />}
                </td>
              ))}
              <tr>
                <td></td>
                {goalInputCells}
                {penaltyInputCells}
              </tr>
            </tbody>
          </table>
          </div>
        )}

        <table className="w-full min-w-[950px] text-sm text-center border-collapse table-fixed select-none">
          {colGroup}
          {isReadOnly && <thead>{blockTitlesRow(true)}</thead>}
          {columnTitlesHead}
          <tbody className="bg-white text-graphite relative z-10">
            {rows.map((_, i) => {
              const player = roster[i]; const goal = goals[i]; const penalty = penaltiesWithTimeline[i];
              const isEditingGoal = goal && goal.id === editGoalId; const isEditingPenalty = penalty && penalty.id === editPenaltyId;

              const isPenaltyShot = penalty?.penalty_class === 'penalty_shot';
              // Строка-продолжение группы (вторая двойка, десятка, двадцатка): нарушитель
              // и вид у неё общие с первой строкой, правится только своё, удаляется
              // группой — с первой строки.
              const isPenaltyContinuation = isContinuationRow(penalty);
              const isPenaltyEndless = penalty?.effEnd === null || penalty?.penalty_class === 'game_misconduct';

              let isFinished = false; let endTimeDisplay = ''; let endTimeClass = 'font-mono font-semibold text-[13px] text-graphite';
              if (isPenaltyShot || (penalty && isPenaltyEndless)) {
                // ШБ не отсиживают, у удалённого до конца матча окончания нет —
                // обратный отсчёт не нужен.
                endTimeDisplay = '—'; endTimeClass = 'font-mono font-medium text-[13px] text-graphite/25';
              } else if (penalty && !isEditingPenalty) {
                const pStart = penalty.effStart; const pEnd = penalty.effEnd;
                if (!isNaN(pStart) && !isNaN(pEnd)) {
                  isFinished = timerSeconds >= pEnd;
                  const isActive = timerSeconds >= pStart && timerSeconds < pEnd;
                  const isDelayed = timerSeconds < pStart;
                  if (isActive) { endTimeDisplay = formatTime(pEnd - timerSeconds); endTimeClass = "font-mono font-black text-[13px] text-status-rejected animate-pulse"; }
                  // Отбытый штраф — такой же факт протокола, как и его начало: время окончания
                  // пишется тем же цветом, что и «Нач», а не гаснет до серого.
                  else if (isFinished) { endTimeDisplay = formatTime(pEnd); endTimeClass = "font-mono font-semibold text-[13px] text-graphite-light"; }
                  else if (isDelayed) { endTimeDisplay = `⏱ ${formatTime(pEnd - pStart)}`; endTimeClass = "font-mono font-bold text-[13px] text-orange"; }
                } else { endTimeDisplay = formatTime(penalty.penalty_end_time); }
              }

              return (
                <tr key={i} className="hover:bg-graphite/5 transition-colors group h-[34px] border-b border-graphite/30">
                  {/* РОСТЕР */}
                  <td className="border-l border-graphite/30 border-r [border-right-color:rgb(var(--graphite)_/_0.12)] font-bold text-graphite text-[13px]">{player?.jersey_number || ''}</td>
                  {/* Фамилия и имя целиком, без сокращения до инициала: в графе два Сидорова
                      должны различаться глазами. Длинное имя обрезается многоточием — целиком оно
                      остаётся в подсказке при наведении. */}
                  <td className="border-r border-graphite/[0.12] text-left px-2 font-semibold text-[13px] text-graphite" title={player ? `${player.last_name} ${player.first_name || ''}`.trim() : undefined}>
                    {/* justify-between — имя слева, значок экипировки прижат к правому краю графы.
                        Так значки всех игроков стоят в одну линию и не прыгают вслед за длиной фамилии:
                        секретарь пробегает глазом по правому краю и сразу видит, кого проверять перед
                        выходом на лёд. Имя обрезается первым, значок не сжимается (shrink-0 внутри него). */}
                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                      <span className="truncate">{player ? `${player.last_name} ${player.first_name || ''}`.trim() : ''}</span>
                      {player && <EquipmentMark birthDate={player.birth_date} league={league} position={player.position_in_line || player.position} />}
                    </div>
                  </td>
                  <td className="border-r-2 border-graphite/25 text-[11px] text-graphite/40 font-medium">{player ? localizePosition(player.position_in_line || player.position) : ''}</td>

                  {/* ВЗЯТИЕ ВОРОТ */}
                  <td className={`border-r border-graphite/[0.12] font-bold text-graphite/25 text-[12px] ${goal && !isEditingGoal ? GOAL_TINT : ''}`}>{goal || isEditingGoal ? i + 1 : ''}</td>
                  {isEditingGoal && !isReadOnly && isPenaltyShotEvent(goal) ? (
                    <>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10"><StylishInput isEditing isTimeField title="Время штрафного броска" value={editGoalData.time} onChange={e=>setEditGoalData({...editGoalData, time: formatTimeMask(e.target.value)})} /></td>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10"><StylishSelect isEditing title="Бьющий" roster={roster} value={editGoalData.scorer} onChange={e=>setEditGoalData({...editGoalData, scorer: e.target.value})} className="!text-status-accepted font-bold" /></td>
                      <td colSpan="2" className="border-r border-graphite/[0.12] p-0.5 bg-orange/10">
                        <CustomSelect
                          isEditing
                          title="Исход штрафного броска"
                          options={psOutcomeOptions(editGoalData.psOutcome)}
                          value={editGoalData.psOutcome}
                          onChange={e => setEditGoalData({...editGoalData, psOutcome: e.target.value})}
                          hideEmpty
                        />
                      </td>
                      {/* ИС и «Бр» у штрафного броска предопределены и не редактируются:
                          ситуация всегда ШБ, бросок всегда в створ. */}
                      <td className="border-r border-graphite/[0.12] bg-orange/10 text-[10px] text-graphite/40 uppercase font-bold">{GOAL_STRENGTH_DISPLAY.ps}</td>
                      {shotsTrackingEnabled && <td className="border-r border-graphite/[0.12] bg-orange/10 text-graphite/25 font-bold">—</td>}
                      <td className="border-r-2 border-graphite/25 p-0 text-center bg-orange/10"><button onClick={() => saveEditPs(goal)} className="bg-status-accepted text-white w-full h-full min-h-[34px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"><Icon name="save" className="w-5 h-5" /></button></td>
                    </>
                  ) : goal && isPenaltyShotEvent(goal) ? (
                    <>
                      <td className="bg-status-accepted/[0.035] border-r border-graphite/[0.12] font-mono text-[13px] font-semibold text-graphite-light">{formatTime(goal.time_seconds)}</td>
                      <td className="bg-status-accepted/[0.035] border-r border-graphite/[0.12] font-bold text-[13px] text-graphite">{getJersey(goal.primary_player_id)}</td>
                      {/* Ассистентов у штрафного броска нет — вместо двух ячеек одна
                          с исходом. ИС и «Бр» на месте, но правке не подлежат. */}
                      <td colSpan="2" className={`bg-status-accepted/[0.035] border-r border-graphite/[0.12] text-[11px] uppercase tracking-wider ${(PS_OUTCOME_VIEW[goal.event_type] || PS_OUTCOME_VIEW[PS_PENDING]).className}`}>
                        {(PS_OUTCOME_VIEW[goal.event_type] || PS_OUTCOME_VIEW[PS_PENDING]).label}
                      </td>
                      <td className="bg-status-accepted/[0.035] border-r border-graphite/[0.12] text-[10px] text-graphite/60 uppercase font-bold">{GOAL_STRENGTH_DISPLAY.ps}</td>
                      {shotsTrackingEnabled && <td className="bg-status-accepted/[0.035] border-r border-graphite/[0.12] text-graphite/25 font-bold" title="Штрафной бросок всегда идёт в створ">—</td>}
                      <td className="bg-status-accepted/[0.035] border-r-2 border-graphite/25 p-0 text-center">
                         {!isReadOnly && (
                            <div className="flex justify-center items-center h-full gap-1.5 px-0.5 opacity-50 hover:opacity-100 transition-opacity">
                               {/* +/- у штрафного броска не бывает: эпизод разыгрывается один на один.
                                   Кнопки удаления тоже нет — строка живёт ровно столько, сколько
                                   штраф вида «ШБ», который её породил; удалять надо его. */}
                               <button onClick={() => startEditGoal(goal)} className="text-graphite/25 hover:text-orange transition-colors" title="Редактировать бьющего, время и исход"><Icon name="edit" className="w-[18px] h-[18px]" /></button>
                            </div>
                         )}
                      </td>
                    </>
                  ) : isEditingGoal && !isReadOnly ? (
                    <>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10"><StylishInput isEditing isTimeField title="Время гола" value={editGoalData.time} onChange={e=>setEditGoalData({...editGoalData, time: formatTimeMask(e.target.value)})} /></td>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10"><StylishSelect isEditing title="Автор гола" roster={roster} value={editGoalData.scorer} onChange={e=>setEditGoalData({...editGoalData, scorer: e.target.value})} taken={{ [editGoalData.ast1]: 'Ассистент 1', [editGoalData.ast2]: 'Ассистент 2' }} className="!text-status-accepted font-bold" /></td>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10"><StylishSelect isEditing title="Ассистент 1" roster={roster} value={editGoalData.ast1} onChange={e=>setEditGoalData({...editGoalData, ast1: e.target.value})} taken={{ [editGoalData.scorer]: 'Автор', [editGoalData.ast2]: 'Ассистент 2' }} /></td>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10"><StylishSelect isEditing title="Ассистент 2" roster={roster} value={editGoalData.ast2} onChange={e=>setEditGoalData({...editGoalData, ast2: e.target.value})} taken={{ [editGoalData.scorer]: 'Автор', [editGoalData.ast1]: 'Ассистент 1' }} /></td>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10">
                        <CustomSelect
                           isEditing
                           title="Игровая ситуация"
                           options={goalStrengthOptions}
                           value={editGoalData.str}
                           onChange={e=>setEditGoalData({...editGoalData, str: e.target.value})}
                           hideEmpty
                        />
                      </td>
                      {shotsTrackingEnabled && (
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10 text-center">
                        <button
                          type="button"
                          onClick={() => setEditGoalData({...editGoalData, from_shot: !editGoalData.from_shot})}
                          className={`mx-auto flex items-center justify-center w-7 h-7 rounded hover:bg-graphite/10 transition-colors ${editGoalData.from_shot ? 'text-status-accepted' : 'text-status-rejected'}`}
                          title={editGoalData.from_shot ? 'С броска' : 'Без броска'}
                        >
                          <Icon name={editGoalData.from_shot ? 'shootout_goal' : 'shootout_miss'} className="w-5 h-5" />
                        </button>
                      </td>
                      )}
                      <td className="border-r-2 border-graphite/25 p-0 text-center bg-orange/10"><button onClick={saveEditGoal} className="bg-status-accepted text-white w-full h-full min-h-[34px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"><Icon name="save" className="w-5 h-5" /></button></td>
                    </>
                  ) : goal ? (
                    <>
                      <td className="bg-status-accepted/[0.035] border-r border-graphite/[0.12] font-mono text-[13px] font-semibold text-graphite-light">{formatTime(goal.time_seconds)}</td>
                      <td className="bg-status-accepted/[0.035] border-r border-graphite/[0.12] font-bold text-[13px] text-graphite">{getJersey(goal.primary_player_id)}</td>
                      <td className="bg-status-accepted/[0.035] border-r border-graphite/[0.12] font-semibold text-[13px] text-graphite-light">{getJersey(goal.assist1_id)}</td>
                      <td className="bg-status-accepted/[0.035] border-r border-graphite/[0.12] font-semibold text-[13px] text-graphite-light">{getJersey(goal.assist2_id)}</td>
                      <td className="bg-status-accepted/[0.035] border-r border-graphite/[0.12] text-[10px] text-graphite/60 uppercase font-bold">{GOAL_STRENGTH_DISPLAY[goal.goal_strength] || ''}</td>
                      {shotsTrackingEnabled && (
                      <td className="bg-status-accepted/[0.035] border-r border-graphite/[0.12] text-center">
                        <button
                          type="button"
                          onClick={() => !isReadOnly && toggleGoalFromShot(goal)}
                          disabled={isReadOnly}
                          className={`mx-auto flex items-center justify-center w-7 h-7 rounded transition-colors ${isReadOnly ? 'cursor-default' : 'hover:bg-graphite/10 cursor-pointer'} ${(goal.from_shot ?? true) ? 'text-status-accepted' : 'text-status-rejected'}`}
                          title={(goal.from_shot ?? true) ? 'Гол с броска (нажмите чтобы переключить)' : 'Гол без броска (нажмите чтобы переключить)'}
                        >
                          <Icon name={(goal.from_shot ?? true) ? 'shootout_goal' : 'shootout_miss'} className="w-5 h-5" />
                        </button>
                      </td>
                      )}
                      <td className="bg-status-accepted/[0.035] border-r-2 border-graphite/25 p-0 text-center">
                         {!isReadOnly && (
                            <div className="flex justify-center items-center h-full gap-1.5 px-0.5 opacity-50 hover:opacity-100 transition-opacity">
                               {isPlusMinusEnabled && <button onClick={() => onRequestPlusMinus(goal)} className={`transition-colors ${goal.has_plus_minus ? 'text-status-accepted hover:text-status-accepted/80' : 'text-graphite/25 hover:text-status-accepted'}`} title="Показатель полезности (+/-)"><Icon name="users" className="w-[18px] h-[18px]" /></button>}
                               <button onClick={() => startEditGoal(goal)} className="text-graphite/25 hover:text-orange transition-colors" title="Редактировать"><Icon name="edit" className="w-[18px] h-[18px]" /></button>
                               <button onClick={() => onDeleteEvent(goal.id)} className="text-graphite/25 hover:text-status-rejected transition-colors" title="Удалить"><Icon name="delete" className="w-[18px] h-[18px]" /></button>
                            </div>
                         )}
                      </td>
                    </>
                  ) : (
                    <><td className="border-r border-graphite/[0.12]"></td><td className="border-r border-graphite/[0.12]"></td><td className="border-r border-graphite/[0.12]"></td><td className="border-r border-graphite/[0.12]"></td><td className="border-r border-graphite/[0.12]"></td>{shotsTrackingEnabled && <td className="border-r border-graphite/[0.12]"></td>}<td className="border-r-2 border-graphite/25"></td></>
                  )}

                  {/* УДАЛЕНИЯ */}
                  {isEditingPenalty && !isReadOnly && editPenaltyData.mode === 'group' ? (
                    <>
                      {/* Редактор группы: вид, нарушитель, причина, начало */}
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10"><PenaltyOffenderSelect isEditing title="Нарушитель" roster={roster} value={editPenaltyData.who} onChange={who=>setEditPenaltyData({...editPenaltyData, who})} className="!text-status-rejected font-bold" /></td>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10">
                        <CustomSelect
                          isEditing title="Вид штрафа" options={penaltyKindOptions} value={editPenaltyData.kind}
                          onChange={e=>setEditPenaltyData({...editPenaltyData, kind: e.target.value, violation: reasonForKind(e.target.value, editPenaltyData.violation)})}
                          hideEmpty
                        />
                      </td>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10">
                        <TriggerButton
                          dim hint="Причина"
                          value={reasonCode(editPenaltyData.violation)}
                          onClick={() => setReasonsTarget('edit')}
                          className="h-[30px] !py-0 !px-1"
                        />
                      </td>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10">
                        <StylishInput
                          isEditing isTimeField title="Начало штрафа" value={editPenaltyData.start}
                          onChange={e=>setEditPenaltyData({...editPenaltyData, start: formatTimeMask(e.target.value)})}
                        />
                      </td>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10 text-center font-mono text-[13px] text-graphite-light" title="Окончание штрафа рассчитывается автоматически">
                        {previewGroupEnd(editPenaltyData.kind, parseTime(editPenaltyData.start), editPenaltyData.who, editPenaltyData.violation)}
                      </td>
                      <td className="border-r border-graphite/30 p-0 text-center bg-orange/10"><button onClick={saveEditGroup} className="bg-status-accepted text-white w-full h-full min-h-[34px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"><Icon name="save" className="w-5 h-5" /></button></td>
                    </>
                  ) : isEditingPenalty && !isReadOnly ? (
                    <>
                      {/* Строка-продолжение: нарушитель, минуты и начало — у группы, здесь
                          правятся только причина и окончание, как у обычной строки */}
                      <td className="border-r border-graphite/[0.12] bg-orange/10 font-bold text-[13px] text-graphite/50 whitespace-nowrap">{renderOffender(penalty)}</td>
                      <td className="border-r border-graphite/[0.12] bg-orange/10 font-semibold text-[13px] text-graphite/50">{penalty.penalty_minutes}</td>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10"><CustomSelect isEditing dense title="Причина удаления" emptyLabel="— не выбрано —" options={rowReasonOptions} value={editPenaltyData.violation} onChange={e=>setEditPenaltyData({...editPenaltyData, violation: e.target.value})} className="px-1" /></td>
                      <td className="border-r border-graphite/[0.12] bg-orange/10 font-mono font-semibold text-[13px] text-graphite/50">{formatTime(penalty.effStart)}</td>
                      <td className="border-r border-graphite/[0.12] p-0.5 bg-orange/10">
                        {isPenaltyEndless ? (
                          <span className="font-mono text-[13px] text-graphite/25">—</span>
                        ) : (
                          <StylishInput
                            isEditing isTimeField title="Окончание штрафа" value={editPenaltyData.end}
                            onChange={e=>setEditPenaltyData({...editPenaltyData, end: formatTimeMask(e.target.value)})}
                          />
                        )}
                      </td>
                      <td className="border-r border-graphite/30 p-0 text-center bg-orange/10"><button onClick={saveEditRow} className="bg-status-accepted text-white w-full h-full min-h-[34px] hover:bg-status-accepted/90 transition-colors flex items-center justify-center shadow-inner"><Icon name="save" className="w-5 h-5" /></button></td>
                    </>
                  ) : penalty ? (
                    <>
                      {/* «↳» — продолжение группы: та же запись, следующая строка протокола */}
                      <td className="relative bg-status-rejected/[0.035] border-r border-graphite/[0.12] font-bold text-[13px] text-graphite whitespace-nowrap" title={isPenaltyContinuation ? `Продолжение: ${kindSpec(penaltyKindOf(penalty)).title}` : penalty.penalty_served_by_id ? 'Нарушитель / отбывающий' : undefined}>
                        {isPenaltyContinuation && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-graphite/30 font-medium">↳</span>}
                        {renderOffender(penalty)}
                      </td>
                      <td className="bg-status-rejected/[0.035] border-r border-graphite/[0.12] font-semibold text-[13px] text-graphite" title={kindSpec(penaltyKindOf(penalty)).title || undefined}>
                        {isPenaltyShot ? 'ШБ' : penalty.penalty_group_id ? penalty.penalty_minutes : penaltyKindLabel(penalty)}
                      </td>
                      {/* В графе — только сокращение (снимок penalty_violation_code, для старых
                          записей — по наименованию), как и в PDF-протоколе; полная формулировка
                          остаётся в подсказке при наведении. */}
                      <td className="bg-status-rejected/[0.035] border-r border-graphite/[0.12] px-2 text-[12px] truncate whitespace-nowrap overflow-hidden text-graphite-light font-semibold" title={penalty.penalty_violation}>{penalty.penalty_violation_code || getPenaltyReasonCode(penalty.penalty_violation)}</td>
                      <td className="bg-status-rejected/[0.035] border-r border-graphite/[0.12] font-mono font-semibold text-[13px] text-graphite-light">{formatTime(penalty.effStart)}</td>
                      <td className={`bg-status-rejected/[0.035] border-r border-graphite/[0.12] ${endTimeClass}`}>{endTimeDisplay}</td>
                      <td className="bg-status-rejected/[0.035] border-r border-graphite/30 p-0 text-center">
                         {!isReadOnly && (
                            <div className="flex justify-center items-center h-full gap-1.5 px-0.5 opacity-50 hover:opacity-100 transition-opacity">
                               <button onClick={() => startEditPenalty(penalty)} className="text-graphite/25 hover:text-orange transition-colors" title={isPenaltyContinuation ? 'Причина и окончание строки' : 'Редактировать'}><Icon name="edit" className="w-[18px] h-[18px]" /></button>
                               {!isPenaltyContinuation && (
                                 <button onClick={() => onDeleteEvent(penalty.id)} className="text-graphite/25 hover:text-status-rejected transition-colors" title={penalty.penalty_group_id ? 'Удалить штраф целиком' : 'Удалить'}><Icon name="delete" className="w-[18px] h-[18px]" /></button>
                               )}
                            </div>
                         )}
                      </td>
                    </>
                  ) : (
                    <><td className="border-r border-graphite/[0.12]"></td><td className="border-r border-graphite/[0.12]"></td><td className="border-r border-graphite/[0.12]"></td><td className="border-r border-graphite/[0.12]"></td><td className="border-r border-graphite/[0.12]"></td><td className="border-r border-graphite/30"></td></>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Причина штрафа — одна, выбор из справочника */}
      {reasonsModalState && (
        <PenaltyReasonsModal
          isOpen
          onClose={() => setReasonsTarget(null)}
          title={`Причина: ${kindSpec(reasonsModalState.kind).title}`}
          options={reasonOptionsFor(reasonsModalState.kind)}
          value={reasonsModalState.value}
          onSave={applyReason}
        />
      )}
    </div>
  );
};