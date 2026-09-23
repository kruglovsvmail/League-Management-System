// src/pages/GameLiveDesk.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getToken } from '../utils/helpers';
import dayjs from 'dayjs';
import { io } from 'socket.io-client';
import { ConfirmModal } from '../modals/ConfirmModal';
import { GamePlusMinusModal } from '../modals/GamePlusMinusModal';
import { TechDefeatModal } from '../modals/TechDefeatModal';
import { Toast } from '../modals/Toast';
import { TimerPanel } from '../components/GameLiveDesk/TimerPanel';
import { GameFlowAccordion } from '../components/GameLiveDesk/GameFlowAccordion';
import { ShootoutAccordion } from '../components/GameLiveDesk/ShootoutAccordion';
import { SummaryTablesAccordion } from '../components/GameLiveDesk/SummaryTablesAccordion';
import { ProtocolBackAccordion } from '../components/GameLiveDesk/ProtocolBackAccordion';
import {
  getPeriodLimits, formatTime,
  calculatePenaltyTimelines, calculateOnIcePenalties, isMinorRow, isLegacyDoubleMinor,
  calculatePeriodFromTime,
  PS_PENDING, PS_FAILED, isScoredFromPlay, sortRosterByPosition
} from '../components/GameLiveDesk/GameDeskShared';
import { isPauseStage, pauseStageSeconds } from '../components/GameLiveDesk/matchStages';
import { ProtocolViewerModal } from '../components/GameLiveDesk/ProtocolViewerModal';
import { Button } from '../ui/Button';
import { useAccess } from '../hooks/useAccess';
import { AccessFallback } from '../ui/AccessFallback';
import { Icon } from '../ui/Icon';
import { Loader } from '../ui/Loader';

const EditableTimePill = ({ label, field, value, onSave, onClear, isReadOnly }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempVal, setTempVal] = useState(value || '');

    useEffect(() => { setTempVal(value || ''); }, [value, isEditing]);

    const handleSaveAction = () => {
        setIsEditing(false);
        if (tempVal !== value) {
            if (tempVal === '') onClear(field);
            else onSave(field, tempVal);
        }
    };

    const handleAutoSet = () => {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        onSave(field, timeString);
    };

    if (isEditing && !isReadOnly) {
        return (
            <div className="flex items-center justify-between bg-white border border-orange/50 rounded-md px-2 shadow-sm ring-2 ring-orange/10 h-[32px] w-[125px] relative">
                <input
                    type="time"
                    autoFocus
                    value={tempVal}
                    onChange={e => setTempVal(e.target.value)}
                    onBlur={(e) => { if (!e.relatedTarget?.closest('.clear-btn')) handleSaveAction(); }}
                    onKeyDown={e => { if(e.key === 'Enter') handleSaveAction(); }}
                    className="bg-transparent font-mono text-[13px] font-bold text-graphite outline-none w-full text-center pr-5"
                />
                <button
                    type="button"
                    className="clear-btn absolute right-1 w-5 h-5 flex items-center justify-center text-status-rejected hover:bg-status-rejected/10 rounded transition-colors"
                    onClick={(e) => { e.preventDefault(); setIsEditing(false); onClear(field); }}
                    title="Сбросить время"
                >
                    <Icon name="close" className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={() => {
                if (isReadOnly) return;
                value ? setIsEditing(true) : handleAutoSet();
            }}
            className={`relative group flex items-center justify-between px-3 rounded-md transition-all border h-[32px] w-[125px] ${value ? 'bg-white border-graphite/20 shadow-sm' : 'bg-transparent border-dashed border-graphite/30'} ${!isReadOnly && value ? 'hover:border-graphite/40 cursor-pointer' : ''} ${!isReadOnly && !value ? 'hover:border-orange hover:bg-orange/5 cursor-pointer' : ''} ${isReadOnly ? 'cursor-default opacity-80' : ''}`}
            title={isReadOnly ? "" : (value ? "Редактировать время" : "Зафиксировать текущее время")}
        >
            <span className={`text-[10px] font-bold uppercase ${value ? 'text-graphite-light' : 'text-graphite/50 group-hover:text-orange'}`}>{label}</span>
            <span className={`font-mono text-[13px] font-bold ${value ? 'text-graphite' : 'text-graphite/40 group-hover:text-orange'}`}>
                {value || '--:--'}
            </span>
        </button>
    );
};

const EditableNumberPill = ({ label, field, value, onSave, isReadOnly }) => {
    const [tempVal, setTempVal] = useState(value || '');
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => { setTempVal(value || ''); }, [value, isEditing]);

    const handleSaveAction = () => {
        setIsEditing(false);
        const num = parseInt(tempVal, 10);
        const finalVal = isNaN(num) ? null : num;
        if (finalVal !== value) {
            onSave(field, finalVal === null ? '' : finalVal); 
        }
    };

    if (isEditing && !isReadOnly) {
        return (
            <div className="flex items-center justify-between bg-white border border-orange/50 rounded-md px-2 shadow-sm ring-2 ring-orange/10 h-[32px] w-[110px] relative">
                <span className="text-[10px] font-bold text-graphite-light uppercase absolute left-2.5">{label}</span>
                <input
                    type="number"
                    autoFocus
                    min="0"
                    value={tempVal}
                    onChange={e => setTempVal(e.target.value)}
                    onBlur={handleSaveAction}
                    onKeyDown={e => { if(e.key === 'Enter') handleSaveAction(); }}
                    className="bg-transparent font-mono text-[13px] font-bold text-graphite outline-none w-full text-right"
                />
            </div>
        );
    }

    const hasValue = value !== null && value !== undefined && value !== '';

    return (
        <button
            onClick={() => { if (!isReadOnly) setIsEditing(true); }}
            className={`relative group flex items-center justify-between px-3 rounded-md transition-all border h-[32px] w-[110px] ${hasValue ? 'bg-white border-graphite/20 shadow-sm' : 'bg-transparent border-dashed border-graphite/30'} ${!isReadOnly && hasValue ? 'hover:border-graphite/40 cursor-pointer' : ''} ${!isReadOnly && !hasValue ? 'hover:border-orange hover:bg-orange/5 cursor-pointer' : ''} ${isReadOnly ? 'cursor-default opacity-80' : ''}`}
            title={isReadOnly ? "" : "Указать количество зрителей"}
        >
            <span className={`text-[10px] font-bold uppercase ${hasValue ? 'text-graphite-light' : 'text-graphite/50 group-hover:text-orange'}`}>{label}</span>
            <span className={`font-mono text-[13px] font-bold ${hasValue ? 'text-graphite' : 'text-graphite/40 group-hover:text-orange'}`}>
                {hasValue ? value : '---'}
            </span>
        </button>
    );
};

export function GameLiveDesk() {
  const { gameId } = useParams();
  const navigate = useNavigate(); 

  useEffect(() => {
    document.title = 'Панель секретаря | LMS';
  }, []);

  const [game, setGame] = useState(null);
  const [events, setEvents] = useState([]);
  const [homeRoster, setHomeRoster] = useState([]);
  const [awayRoster, setAwayRoster] = useState([]);
  
  const [goalieLog, setGoalieLog] = useState([]);
  const [goaliesShotsSummary, setGoaliesShotsSummary] = useState([]);

  const [authUser, setAuthUser] = useState(null);
  
  const activeLeague = authUser?.leagues?.find(l => l.id === game?.league_id) || null;
  const { checkAccess, checkMatchEditAccess } = useAccess(authUser, activeLeague);

  const gameStaffArray = useMemo(() => {
    if (!game?.officials) return [];
    return Object.entries(game.officials)
      .filter(([role, off]) => off && off.id)
      .map(([role, off]) => ({ user_id: off.id, role }));
  }, [game]);

  const matchEditAccess = checkMatchEditAccess(game, gameStaffArray);
  const hasProtocolAccess = checkAccess('MATCH_SECRETARY_PANEL_ENTER', { gameStaff: gameStaffArray });
  
  const canAccessPanel = hasProtocolAccess;
  const isReadOnly = !matchEditAccess.hasAccess;

  // ======================================================================
  // ФОНОВЫЙ ТАЙМЕР ЗАЩИТЫ ОТ ЗАВИСАНИЯ СЕКРЕТАРЕЙ
  // ======================================================================
  
  // 1. Принудительно рендерим компонент каждые 10 секунд, 
  // чтобы хук useAccess.js пересчитал текущее время без действий пользователя.
  const [, setTick] = useState(0);
  useEffect(() => {
      const interval = setInterval(() => setTick(t => t + 1), 10000);
      return () => clearInterval(interval);
  }, []);

  // 2. Если в результате автоматического пересчета мы видим,
  // что прав на редактирование больше нет (isReadOnly === true), сразу выкидываем.
  // Кроме подписанного секретарём протокола: панель остаётся открытой для просмотра —
  // в её окне протокола ставят свои подписи судьи и представители команд.
  useEffect(() => {
      if (!game || !activeLeague) return;

      if (isReadOnly && !game.is_protocol_signed) {
          navigate(`/games/${gameId}`, {
              replace: true,
              state: {
                  toastNotification: {
                      title: 'Доступ закрыт',
                      message: matchEditAccess.reason || 'Время управления матчем истекло. Панель закрыта.',
                      type: 'error'
                  }
              }
          });
      }
  }, [isReadOnly, game, activeLeague, gameId, navigate, matchEditAccess.reason]);
  // ======================================================================

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/me`, { 
          headers: { 'Authorization': `Bearer ${getToken()}` } 
        });
        const data = await res.json();
        if (data.success) setAuthUser(data.user);
      } catch (err) {
        console.error('Ошибка загрузки профиля', err);
      }
    };
    fetchUser();
  }, []);

  const [socket, setSocket] = useState(null);

  const [timerData, setTimerData] = useState({
      accumulatedSeconds: 0,
      startedAt: null,
      isRunning: false,
      serverTimeOffset: 0
  });
  const [timerSeconds, setTimerSeconds] = useState(0); 
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('1'); 

  const [periodsCount, setPeriodsCount] = useState(3);
  const [periodLength, setPeriodLength] = useState(20);
  const [otLength, setOtLength] = useState(5);
  const [soLength, setSoLength] = useState(3);

  // Карусель этапов (см. matchStages.js). stage — 'WU' (разминка) или 'B1'… (перерыв):
  // пока он есть, идут его собственные часы, а игровое время стоит. null — идёт период
  // currentPeriod. Длительности разминки и перерыва — в минутах, 0 — этапа нет.
  const [warmupLength, setWarmupLength] = useState(0);
  const [breakLength, setBreakLength] = useState(0);
  const [stage, setStage] = useState(null);
  const [stageClock, setStageClock] = useState({ accumulated: 0, startedAt: null, isRunning: false });
  const [stageSeconds, setStageSeconds] = useState(0);

  const [trackPlusMinus, setTrackPlusMinus] = useState(false);
  const [autoStopOnEvent, setAutoStopOnEvent] = useState(false);

  const DEFAULT_ARENA_ANNOUNCER = { voice: false, endSiren: false, goalDelay: 5, goalExpiry: 40 };
  const [arenaAnnouncer, setArenaAnnouncerState] = useState(DEFAULT_ARENA_ANNOUNCER);

  const [plusMinusModalState, setPlusMinusModalState] = useState({ isOpen: false, event: null, scoringTeam: null, concedingTeam: null });

  const [deleteModalState, setDeleteModalState] = useState({ isOpen: false, id: null, type: null });
  
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false); 
  const [isFinishingGame, setIsFinishingGame] = useState(false); 
  const [isRecalculatingStats, setIsRecalculatingStats] = useState(false);

  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  // Ошибка ввода в бумажном виде протокола: каждое уведомление — новый показ (stamp)
  const showInputError = (t) => setToast({ ...t, stamp: Date.now() });

  const ignoreSocketRef = useRef(false);
  const ignoreTimeoutRef = useRef(null);
  // Последнее отправленное этим устройством значение по каждой настройке + время отправки —
  // нужно, чтобы отличить эхо своего же изменения от реального конфликта с другим устройством.
  const lastSettingRef = useRef({});

  const headers = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    const originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = originalOverflow; };
  }, []);

  const loadInitialData = async () => {
    try {
      const resGame = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}`, { headers });
      const dataGame = await resGame.json();
      
      const resEvents = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`, { headers });
      const dataEvents = await resEvents.json();

      if (dataGame.success) {
        setGame(dataGame.data);
        setPeriodsCount(dataGame.data.periods_count ?? 3);
        setPeriodLength(dataGame.data.period_length ?? 20);
        setOtLength(dataGame.data.ot_length ?? 5);
        setSoLength(dataGame.data.so_length ?? 3);
        setWarmupLength(dataGame.data.warmup_length ?? 0);
        setBreakLength(dataGame.data.break_length ?? 0);
        setTrackPlusMinus(dataGame.data.track_plus_minus ?? false);
        setAutoStopOnEvent(dataGame.data.auto_stop_on_event ?? false);
        setArenaAnnouncerState(
          dataGame.data.arena_announcer && Object.keys(dataGame.data.arena_announcer).length
            ? dataGame.data.arena_announcer
            : DEFAULT_ARENA_ANNOUNCER
        );
        setGoalieLog(dataGame.data.goalie_log || []);

        // Загружаем броски по вратарям отдельным запросом
        try {
          const resGoalieShots = await fetch(
            `${import.meta.env.VITE_API_URL}/api/games/${gameId}/goalie-shots-summary`,
            { headers }
          );
          const dataGoalieShots = await resGoalieShots.json();
          if (dataGoalieShots.success) setGoaliesShotsSummary(dataGoalieShots.data);
        } catch (e) { console.error('Ошибка загрузки бросков по вратарям:', e); }

        if (dataEvents.success) setEvents(dataEvents.data);

        const [resHome, resAway] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.home_team_id}`, { headers }),
          fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${dataGame.data.away_team_id}`, { headers })
        ]);
        const [dataHome, dataAway] = await Promise.all([resHome.json(), resAway.json()]);
        
        setHomeRoster(sortRosterByPosition(dataHome.gameRoster || []));
        setAwayRoster(sortRosterByPosition(dataAway.gameRoster || []));
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadInitialData(); }, [gameId]);

  // Стартовая запись журнала вратарей: если в заявке на матч у команды один вратарь,
  // он попадает в журнал сам — правило и запись живут на бэке (autofillGoalieLog),
  // здесь то же условие проверяется заранее, чтобы не дёргать сервер при каждой
  // перезагрузке данных. Ключ последней попытки помнит ref: иначе при отказе
  // (окно управления закрыто, нет прав) запрос уходил бы по кругу после каждого
  // loadInitialData. Работает в обоих видах панели.
  const goalieAutofillKeyRef = useRef(null);
  useEffect(() => {
    // Завершённый матч панель не трогает — то же ограничение стоит и на бэке
    if (!game || isReadOnly || !['scheduled', 'live'].includes(game.status)) return;

    const lineupGoalieIds = (roster) => roster
      .filter(r => r.position === 'goalie' || r.position_in_line === 'G')
      .map(r => String(r.player_id));
    const homeGoalies = lineupGoalieIds(homeRoster);
    const awayGoalies = lineupGoalieIds(awayRoster);
    const first = goalieLog[0];
    // Сторона ждёт автозаполнения: в заявке ровно один вратарь, а в журнале либо
    // ничего нет, либо сторона первой записи «не указан» / игрок не из заявки
    const sideNeedsFill = (goalies, unspecified, goalieId) =>
      goalies.length === 1 && (!first || unspecified || (goalieId != null && !goalies.includes(String(goalieId))));
    const needed = sideNeedsFill(homeGoalies, first?.home_goalie_unspecified, first?.home_goalie_id)
      || sideNeedsFill(awayGoalies, first?.away_goalie_unspecified, first?.away_goalie_id);
    if (!needed) return;

    const key = [first?.id ?? 'none', homeGoalies.join(','), awayGoalies.join(',')].join('|');
    if (goalieAutofillKeyRef.current === key) return;
    goalieAutofillKeyRef.current = key;

    (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/goalie-log/autofill`, { method: 'POST', headers });
        const data = await res.json();
        if (data.success && data.changed) {
          await loadInitialData();
          socket?.emit('game_updated', { gameId });
        }
      } catch (err) { console.error('Ошибка автозаполнения журнала вратарей:', err); }
    })();
  }, [game, homeRoster, awayRoster, goalieLog, isReadOnly]);

  const lockSocketUpdates = () => {
    ignoreSocketRef.current = true;
    if (ignoreTimeoutRef.current) clearTimeout(ignoreTimeoutRef.current);
    ignoreTimeoutRef.current = setTimeout(() => ignoreSocketRef.current = false, 1000);
  };

  const SETTINGS_LABELS = {
    periodLength: 'Длительность периода',
    otLength: 'Длительность овертайма',
    soLength: 'Мин. бросков в буллитах',
    periodsCount: 'Количество периодов',
    warmupLength: 'Длительность разминки',
    breakLength: 'Длительность перерыва',
    autoStopOnEvent: 'Автостоп таймера',
    arenaAnnouncer: 'Диктор арены',
  };
  // Насколько "свежей" считается собственная отправка, чтобы отличающееся входящее значение
  // трактовать как конфликт с другим устройством, а не просто более позднее рутинное изменение.
  const CONFLICT_WINDOW_MS = 3000;
  const normalizeSettingValue = (field, val) => (field === 'arenaAnnouncer' ? JSON.stringify(val) : val);

  // Мгновенное сохранение настроек матча: применяем локально, транслируем по сокету другим
  // открытым панелям и пишем в БД (частичный upsert на бэкенде не затирает остальные поля).
  // Заменяет прежнюю батч-кнопку "Утвердить настройки" — каждое изменение сохраняется сразу.
  const persistTimerSettings = (patch) => {
    lockSocketUpdates();
    const sentAt = Date.now();
    Object.entries(patch).forEach(([field, val]) => {
      lastSettingRef.current[field] = { value: normalizeSettingValue(field, val), ts: sentAt };
    });
    socket?.emit('timer_action', { gameId, action: 'update_settings', timerData: patch });
    const restBody = {};
    if (patch.periodsCount !== undefined) restBody.periods_count = patch.periodsCount;
    if (patch.periodLength !== undefined) restBody.period_length = patch.periodLength;
    if (patch.otLength !== undefined) restBody.ot_length = patch.otLength;
    if (patch.soLength !== undefined) restBody.so_length = patch.soLength;
    if (patch.warmupLength !== undefined) restBody.warmup_length = patch.warmupLength;
    if (patch.breakLength !== undefined) restBody.break_length = patch.breakLength;
    if (patch.autoStopOnEvent !== undefined) restBody.auto_stop_on_event = patch.autoStopOnEvent;
    if (patch.arenaAnnouncer !== undefined) restBody.arena_announcer = patch.arenaAnnouncer;
    fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/timer-settings`, {
      method: 'PUT', headers, body: JSON.stringify(restBody)
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }).catch(e => {
      console.error(e);
      setToast({ title: 'Настройка не сохранена', message: 'Не удалось записать изменение в базу — проверьте соединение и повторите.', type: 'error' });
    });
  };

  const setPeriodsCountPersist = (val) => { setPeriodsCount(val); persistTimerSettings({ periodsCount: val }); };
  const setPeriodLengthPersist = (val) => { setPeriodLength(val); persistTimerSettings({ periodLength: val }); };
  const setOtLengthPersist = (val) => { setOtLength(val); persistTimerSettings({ otLength: val }); };
  const setSoLengthPersist = (val) => { setSoLength(val); persistTimerSettings({ soLength: val }); };
  const setWarmupLengthPersist = (val) => { setWarmupLength(val); persistTimerSettings({ warmupLength: val }); };
  const setBreakLengthPersist = (val) => { setBreakLength(val); persistTimerSettings({ breakLength: val }); };
  const setAutoStopOnEventPersist = (val) => { setAutoStopOnEvent(val); persistTimerSettings({ autoStopOnEvent: val }); };
  const setArenaAnnouncer = (val) => { setArenaAnnouncerState(val); persistTimerSettings({ arenaAnnouncer: val }); };

  // Применяет пришедшую по сокету настройку. Если это устройство само недавно (в пределах
  // CONFLICT_WINDOW_MS) отправляло другое значение этого же поля — значит кто-то ещё успел
  // изменить то же самое почти одновременно: применяем значение с сервера (оно уже в БД) и
  // предупреждаем секретаря тостом, а не молча принимаем чужую перезапись.
  const applySetting = (field, incomingVal, setter) => {
    if (incomingVal === undefined) return;
    const normalized = normalizeSettingValue(field, incomingVal);
    const prevSent = lastSettingRef.current[field];
    if (prevSent && prevSent.value !== normalized && Date.now() - prevSent.ts < CONFLICT_WINDOW_MS) {
      setToast({
        title: 'Настройки изменили одновременно',
        message: `«${SETTINGS_LABELS[field] || field}» только что поменяли с другого устройства — применено более позднее значение.`,
        type: 'error'
      });
    }
    lastSettingRef.current[field] = { value: normalized, ts: Date.now() };
    setter(incomingVal);
  };

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_API_URL);
    setSocket(newSocket);
    // join_game шлём и на первом connect, и на КАЖДОМ реконнекте (сон ноутбука, моргнувшая сеть) —
    // socket.io переподключается сам, но с новым socket.id, и без повторного join_game сокет
    // навсегда выпадает из комнаты game_${gameId}, оставаясь при этом внешне "подключённым".
    newSocket.on('connect', () => newSocket.emit('join_game', gameId));

    newSocket.on('timer_state', (state) => {
      // Ход времени/периода по-прежнему гасим на время своего же оптимистичного изменения
      // (иначе будет дёрганье таймера) — это не связано с конфликтами настроек ниже.
      if (!ignoreSocketRef.current) {
        const offset = state.serverTime ? (state.serverTime - Date.now()) : 0;

        setTimerData({
          accumulatedSeconds: state.accumulatedSeconds !== undefined ? state.accumulatedSeconds : (state.seconds || 0),
          startedAt: state.startedAt || null,
          isRunning: state.isRunning || false,
          serverTimeOffset: offset
        });
        setIsTimerRunning(state.isRunning || false);

        if (state.period) setCurrentPeriod(state.period);
        setStage(state.stage ?? null);
        setStageClock({
          accumulated: state.stageAccumulated || 0,
          startedAt: state.stageStartedAt || null,
          isRunning: !!state.stageRunning,
        });
      }

      // Настройки матча применяются ВСЕГДА (не гасятся ignoreSocketRef) — сервер уже
      // авторитетно знает актуальное значение, а applySetting сам отличит эхо своего
      // изменения от реального конфликта с другим устройством и предупредит тостом.
      applySetting('periodLength', state.periodLength, setPeriodLength);
      applySetting('otLength', state.otLength, setOtLength);
      applySetting('soLength', state.soLength, setSoLength);
      applySetting('periodsCount', state.periodsCount, setPeriodsCount);
      applySetting('warmupLength', state.warmupLength, setWarmupLength);
      applySetting('breakLength', state.breakLength, setBreakLength);
      applySetting('trackPlusMinus', state.trackPlusMinus, setTrackPlusMinus);
      applySetting('autoStopOnEvent', state.autoStopOnEvent, setAutoStopOnEvent);
      // Сырой сеттер, а не персистящий setArenaAnnouncer — иначе входящий broadcast
      // от одной вкладки уйдет обратно в сокет+REST и получится бесконечный пинг-понг.
      applySetting('arenaAnnouncer', state.arenaAnnouncer, setArenaAnnouncerState);
    });

    newSocket.on('score_updated', () => loadInitialData());
    newSocket.on('game_updated', () => loadInitialData()); 
    
    return () => newSocket.disconnect();
  }, [gameId]);

  // Конец периода, разминки и перерыва ловит сервер (advanceMatchStage в timerHandler.js):
  // останавливает часы и листает карусель. Он делает это не позже чем через секунду, а до
  // его ответа панель держит время на конце этапа — чтобы табло не показало 20:01.
  useEffect(() => {
    const interval = setInterval(() => {
      const nowWithOffset = Date.now() + timerData.serverTimeOffset;
      if (timerData.isRunning && timerData.startedAt) {
        const elapsedSinceStart = Math.floor((nowWithOffset - timerData.startedAt) / 1000);
        const limits = getPeriodLimits(currentPeriod, periodLength, otLength, periodsCount);
        const secs = timerData.accumulatedSeconds + elapsedSinceStart;
        setTimerSeconds(limits.end > 0 ? Math.min(secs, limits.end) : secs);
      } else {
        setTimerSeconds(timerData.accumulatedSeconds);
      }

      if (stageClock.isRunning && stageClock.startedAt) {
        const length = stage ? pauseStageSeconds(stage, { warmupLength, breakLength }) : 0;
        const secs = stageClock.accumulated + Math.floor((nowWithOffset - stageClock.startedAt) / 1000);
        setStageSeconds(Math.min(secs, length));
      } else {
        setStageSeconds(stageClock.accumulated);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [timerData, stageClock, stage, currentPeriod, periodLength, otLength, periodsCount, warmupLength, breakLength]);

  // ── ДИКТОР АРЕНЫ: сервер сам решает когда/что озвучить (announcerTimers в timerHandler.js),
  // клиент — тонкий приёмник события 'arena_play'.
  const arenaAudioRef = useRef(null);

  const playArenaAudio = (url) => {
    if (arenaAudioRef.current) { arenaAudioRef.current.pause(); }
    const bust = url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`;
    const audio = new Audio(url + bust);
    audio.volume = 0.8;
    audio.play().catch(() => {});
    arenaAudioRef.current = audio;
  };

  // Бип — сигнал времени, сервер шлёт его с overlay: играем отдельно, поверх, не трогая
  // фразу диктора, которая звучит сейчас (обрывать её вправе только сирена).
  const playArenaSignal = (url) => {
    const bust = url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`;
    const audio = new Audio(url + bust);
    audio.volume = 0.8;
    audio.play().catch(() => {});
  };

  useEffect(() => {
    if (!socket) return;
    const handler = ({ url, overlay }) => (overlay ? playArenaSignal(url) : playArenaAudio(url));
    socket.on('arena_play', handler);
    return () => socket.off('arena_play', handler);
  }, [socket]);

  // Журнал работы с таймером. Пишется, только если у дивизиона включён контроль
  // (divisions.track_timer_log). Время не отправляем: его ставит сервер — часы на машине
  // секретаря могут быть сбиты, а журнал существует ровно для проверки секретаря.
  // Ошибки глотаем: журнал не должен мешать вести матч.
  const logTimerAction = (action, timerSecs, extra = {}) => {
    if (!game?.track_timer_log) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/timer-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({
        action,
        timer_seconds: Math.max(0, Math.round(timerSecs || 0)),
        period: currentPeriod,
        ...extra,
      })
    }).catch(() => {});
  };

  const handleTimerAction = (action) => {
    if (isReadOnly) return;
    lockSocketUpdates();

    // Разминка и перерыв — свои часы, игровое время не трогаем. В журнал идут теми же
    // «Старт» и «Стоп», а отличает их этап в графе периода.
    if (stage) {
      logTimerAction(action, stageSeconds, { period: stage });
      setStageClock(prev => {
        if (action === 'start') return { ...prev, isRunning: true, startedAt: Date.now() + timerData.serverTimeOffset };
        if (action === 'stop') return { ...prev, isRunning: false, startedAt: null, accumulated: stageSeconds };
        return prev;
      });
      socket?.emit('timer_action', { gameId, action: action === 'start' ? 'stage_start' : 'stage_stop' });
      return;
    }

    logTimerAction(action, timerSeconds);

    setTimerData(prev => {
        if (action === 'start') return { ...prev, isRunning: true, startedAt: Date.now() + prev.serverTimeOffset };
        if (action === 'stop') return { ...prev, isRunning: false, startedAt: null, accumulatedSeconds: timerSeconds };
        return prev;
    });
    setIsTimerRunning(action === 'start');

    socket?.emit('timer_action', { gameId, action });
  };

  // Удаления для бейджей под таймером — тот же расчёт, что у табло трансляции
  // (useWebGraphics): одна позиция на группу штрафа (у 2+2 — 4 минуты одним отсчётом).
  // Отложенные — третий штраф, который ждёт свободный слот, — тоже показываем, с момента
  // нарушения: waiting, а в remaining полная длительность, пока отсчёт не начался.
  //
  // На бейдже — номер того, кто СИДИТ на скамейке штрафников: по нему секретарь понимает,
  // кого выпускать. Если за нарушителя сидит партнёр (2+10, 5+20, командный штраф, штраф
  // вратаря или представителя), это penalty_served_by_id — его номер берём из состава на
  // матч, как лист протокола; иначе сидит сам нарушитель.
  const activePenalties = useMemo(() => {
    const penalties = events.filter(e => e.event_type === 'penalty');
    if (penalties.length === 0) return [];
    const rosterJersey = (teamId, playerId) => {
      const roster = teamId === game?.home_team_id ? homeRoster : awayRoster;
      return roster.find(r => r.player_id == playerId)?.jersey_number;
    };
    return calculateOnIcePenalties(penalties)
      .filter(p => p.effEnd !== null && timerSeconds < p.effEnd && timerSeconds >= (parseInt(p.time_seconds, 10) || 0))
      .map(p => {
        const waiting = timerSeconds < p.effStart;
        const servingJersey = p.penalty_served_by_id
          ? (rosterJersey(p.team_id, p.penalty_served_by_id) ?? p.primary_jersey_number)
          : p.primary_jersey_number;
        return { ...p, waiting, servingJersey, remaining: waiting ? p.effEnd - p.effStart : p.effEnd - timerSeconds };
      });
  }, [events, timerSeconds, game?.home_team_id, homeRoster, awayRoster]);

  // Стрелки карусели этапов. Этап встаёт на стартовые значения, часы стоят (автостарт только
  // у перерыва сразу после сирены) — так же, как при автопереходе (enterPeriod / enterPause
  // в timerHandler.js). Период — на своём начале; разминка и перерыв — их часы с 0:00, а
  // игровое время на начале матча или на конце периода, после которого перерыв.
  const goToStage = (key) => {
    if (isReadOnly || !key) return;
    lockSocketUpdates();
    setIsTimerRunning(false);
    setStageClock({ accumulated: 0, startedAt: null, isRunning: false });

    const period = key === 'WU' ? '1' : isPauseStage(key) ? key.slice(1) : key;
    const limits = getPeriodLimits(period, periodLength, otLength, periodsCount);
    const seconds = key === 'WU' ? 0 : isPauseStage(key) ? limits.end : limits.start;

    setStage(isPauseStage(key) ? key : null);
    setCurrentPeriod(period);
    setTimerData(prev => ({ ...prev, isRunning: false, startedAt: null, accumulatedSeconds: seconds }));
    // В журнал — куда переключились и с какого времени начнётся этап
    logTimerAction('change_period', isPauseStage(key) ? 0 : seconds, { period: key });

    socket?.emit('timer_action', { gameId, action: 'set_stage', value: key });
    socket?.emit('game_updated', { gameId });
  };

  // Ручной ввод времени (карандаш). В разминке и перерыве меняем только их время и не
  // больше длительности из настроек. В игре карусель встаёт на период, которому
  // принадлежит введённое время (перерывы тут не участвуют); время за пределами
  // регламента не принимаем.
  const handleSetTime = (secs) => {
    if (isReadOnly) return;

    if (stage) {
      lockSocketUpdates();
      const value = Math.min(pauseStageSeconds(stage, { warmupLength, breakLength }), Math.max(0, secs));
      logTimerAction('set_time', value, { period: stage });
      setStageClock(prev => ({ ...prev, accumulated: value, startedAt: prev.isRunning ? (Date.now() + timerData.serverTimeOffset) : null }));
      socket?.emit('timer_action', { gameId, action: 'set_stage_time', value });
      return;
    }
    if (currentPeriod === 'SO') return;

    const lastPeriod = parseInt(otLength, 10) > 0 ? 'OT' : String(periodsCount);
    const matchEnd = getPeriodLimits(lastPeriod, periodLength, otLength, periodsCount).end;
    if (secs > matchEnd) {
      setToast({ title: 'Время за пределами матча', message: `По регламенту матч идёт до ${formatTime(matchEnd)}.`, type: 'error' });
      return;
    }

    // На границе периодов (20:00) остаёмся в текущем периоде, если время из него
    const current = getPeriodLimits(currentPeriod, periodLength, otLength, periodsCount);
    const period = current.end > 0 && secs >= current.start && secs <= current.end
      ? currentPeriod
      : calculatePeriodFromTime(secs, periodLength, otLength, periodsCount);

    lockSocketUpdates();
    // В журнал пишем значение ПОСЛЕ правки — оно и окажется на табло
    logTimerAction('set_time', secs, { period });
    setCurrentPeriod(period);
    setTimerData(prev => ({ ...prev, accumulatedSeconds: secs, startedAt: prev.isRunning ? (Date.now() + prev.serverTimeOffset) : null }));
    socket?.emit('timer_action', { gameId, action: 'set_time', timerData: { seconds: secs, period } });
    if (period !== currentPeriod) socket?.emit('game_updated', { gameId });
  };

  // Корректировка кнопками ±1/±10 — только в пределах текущего пункта карусели
  // (сервер ограничивает так же).
  const handleAdjustTime = (delta) => {
    if (isReadOnly) return;
    lockSocketUpdates();

    if (stage) {
      const value = Math.min(pauseStageSeconds(stage, { warmupLength, breakLength }), Math.max(0, stageSeconds + delta));
      logTimerAction('adjust', value, { delta_seconds: delta, period: stage });
      setStageClock(prev => ({ ...prev, accumulated: value, startedAt: prev.isRunning ? (Date.now() + timerData.serverTimeOffset) : null }));
      socket?.emit('timer_action', { gameId, action: 'adjust_stage_time', timerData: { delta } });
      return;
    }
    if (currentPeriod === 'SO') return;

    const limits = getPeriodLimits(currentPeriod, periodLength, otLength, periodsCount);
    const clamp = (v) => (limits.end > 0 ? Math.min(limits.end, Math.max(limits.start, v)) : Math.max(0, v));
    logTimerAction('adjust', clamp(timerSeconds + delta), { delta_seconds: delta });
    setTimerData(prev => {
      let current = prev.accumulatedSeconds || 0;
      if (prev.isRunning && prev.startedAt) {
        current += Math.floor((Date.now() + prev.serverTimeOffset - prev.startedAt) / 1000);
      }
      return { ...prev, accumulatedSeconds: clamp(current + delta), startedAt: prev.isRunning ? (Date.now() + prev.serverTimeOffset) : null };
    });
    socket?.emit('timer_action', { gameId, action: 'adjust_time', timerData: { delta } });
  };

  const toggleLineup = async (rosterId, teamId, currentState) => {
    const updateState = (prev) => prev.map(p => p.id === rosterId ? { ...p, is_in_lineup: !currentState } : p);
    if (teamId === game.home_team_id) setHomeRoster(updateState);
    else setAwayRoster(updateState);
  };

  // Досрочное прекращение малого штрафа заброшенной шайбой. Вызывается только для
  // голов из игры: шайба с назначенного штрафного броска удаление не прекращает
  // (см. isScoredFromPlay в GameDeskShared) — буллит разыгрывается один на один,
  // и к численному преимуществу соперника отношения не имеет.
  // Тело PUT для строки штрафа из записи списка событий. Запись отдаёт нарушителя
  // как primary_player_id, а обработчик ждёт player_id — без этой подстановки
  // нарушитель стирался при каждом сдвиге окончания.
  const penaltyRowPayload = (p, patch = {}) => ({
    period: p.period, event_type: 'penalty', team_id: p.team_id,
    time_seconds: p.time_seconds, penalty_end_time: p.penalty_end_time,
    player_id: p.primary_player_id || null,
    penalty_offender_type: p.penalty_offender_type || (p.primary_player_id ? 'player' : 'team'),
    penalty_served_by_id: p.penalty_served_by_id || null,
    penalty_minutes: p.penalty_minutes, penalty_class: p.penalty_class,
    penalty_violation: p.penalty_violation, penalty_violation_code: p.penalty_violation_code,
    penalty_reason_id: p.penalty_reason_id,
    ...patch,
  });

  const processGoalPenaltyLogic = async (scoringTeamId, goalTimeRaw) => {
    const concedingTeamId = scoringTeamId === game.home_team_id ? game.away_team_id : game.home_team_id;
    const goalTime = parseInt(goalTimeRaw, 10);
    const concedingTimeline = calculatePenaltyTimelines(events.filter(e => e.team_id === concedingTeamId && e.event_type === 'penalty'));
    const scoringTimeline = calculatePenaltyTimelines(events.filter(e => e.team_id === scoringTeamId && e.event_type === 'penalty'));
    // Строка в слоте меньшинства прямо сейчас: у группы 2+2 в один момент активна
    // ровно одна из двух двоек, так что счёт строк — это счёт удалённых на льду
    const isActiveOnIce = (p, time) => p.onIce && p.effEnd !== null && time >= p.effStart && time < p.effEnd;

    const activeConceding = concedingTimeline.filter(p => isActiveOnIce(p, goalTime));
    const activeScoring = scoringTimeline.filter(p => isActiveOnIce(p, goalTime));
    if (activeConceding.length <= activeScoring.length) return;

    // Закрывается тот малый, что закончился бы раньше; большой (5) голом не закрывается
    const expirable = activeConceding.filter(isMinorRow).sort((a, b) => a.effEnd - b.effEnd)[0];
    if (!expirable) return;

    let reduction = 0;
    if (isLegacyDoubleMinor(expirable)) {
      // Старая запись 2+2 одной строкой на 4 минуты: пока ни один из двух отрезков не был
      // отменён (остаток = полные 240с), гол в первых 2 минутах отменяет только первый
      // отрезок — второй всё равно доигрывается 2 минуты с этого момента. Если остаток уже
      // меньше 240с, первый отрезок уже был отменён предыдущим голом — этот гол закрывает
      // оставшийся отрезок целиком.
      const totalDuration = expirable.effEnd - expirable.effStart;
      const elapsed = goalTime - expirable.effStart;
      reduction = (totalDuration >= 240 && elapsed < 120) ? expirable.effEnd - (goalTime + 120) : expirable.effEnd - goalTime;
    } else {
      reduction = expirable.effEnd - goalTime;
    }
    if (reduction <= 0) return;

    const updates = [{ row: expirable, patch: { penalty_end_time: parseInt(expirable.penalty_end_time, 10) - reduction } }];

    // Продолжение группы (вторая двойка, десятка) начинается раньше — сдвигаем на столько
    // же, сохраняя длительность. Двадцатка стоит на времени нарушения и не двигается.
    if (expirable.penalty_group_id) {
      events
        .filter(e => e.event_type === 'penalty' && e.penalty_group_id === expirable.penalty_group_id
          && Number(e.penalty_group_seq) > Number(expirable.penalty_group_seq)
          && e.penalty_class !== 'game_misconduct' && e.penalty_end_time !== null)
        .forEach(e => {
          const newStart = parseInt(e.time_seconds, 10) - reduction;
          updates.push({ row: e, patch: {
            time_seconds: newStart,
            penalty_end_time: parseInt(e.penalty_end_time, 10) - reduction,
            period: calculatePeriodFromTime(newStart, periodLength, otLength, periodsCount),
          } });
        });
    }

    for (const u of updates) {
      await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${u.row.id}`, {
        method: 'PUT', headers, body: JSON.stringify(penaltyRowPayload(u.row, u.patch))
      });
    }
  };

  // Штраф целиком: вид + строки (см. buildGroupRows в ProtocolSheet). Период у каждой
  // строки свой — десятка, начатая в конце периода, заканчивается уже в следующем.
  // groupId — правка существующей группы (или старой одиночной записи по её id).
  const savePenaltyGroup = async (teamId, groupData, groupId = null) => {
    setIsSaving(true);
    // Автостоп — про игровое время. В разминке и перерыве оно и так стоит, а «Стоп»
    // остановил бы часы перерыва.
    if (autoStopOnEvent && !groupId && !stage) handleTimerAction('stop');

    const rows = (groupData.rows || []).map(r => ({
      ...r,
      period: calculatePeriodFromTime(r.time_seconds, periodLength, otLength, periodsCount),
    }));
    const payload = { ...groupData, team_id: teamId, period: rows[0]?.period || currentPeriod, rows };

    try {
      const url = groupId
        ? `${import.meta.env.VITE_API_URL}/api/games/${gameId}/penalties/${groupId}`
        : `${import.meta.env.VITE_API_URL}/api/games/${gameId}/penalties`;
      const res = await fetch(url, { method: groupId ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
        await loadInitialData();
        socket?.emit('game_updated', { gameId });
        return true;
      }
      alert(data.error || 'Не удалось сохранить штраф');
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
    return false;
  };

  // Типы, у которых период вычисляется по времени на табло. Послематчевая серия
  // сюда не входит — у неё период всегда 'SO'.
  //
  // Парную строку во «Взятии ворот» для штрафа вида «ШБ» заводит бэкенд в той же
  // транзакции (GameLiveDeskController), а не этот файл: событий должно быть либо
  // два, либо ни одного, и оба приложения обязаны вести себя одинаково.
  const TIMED_EVENT_TYPES = ['goal', 'penalty', 'timeout', PS_PENDING, PS_FAILED];

  const saveEventRow = async (teamId, eventType, rowData, existingId = null) => {
    setIsSaving(true);
    let finalPeriod = currentPeriod;
    if (TIMED_EVENT_TYPES.includes(eventType) && rowData.time_seconds !== undefined) {
      finalPeriod = calculatePeriodFromTime(rowData.time_seconds, periodLength, otLength, periodsCount);
    } else if (['shootout_goal', 'shootout_miss'].includes(eventType)) {
      finalPeriod = 'SO';
    }

    if (autoStopOnEvent && !existingId && !stage && ['goal', 'penalty', 'timeout'].includes(eventType)) {
      handleTimerAction('stop');
    }

    const payload = { period: finalPeriod, team_id: teamId, event_type: eventType, ...rowData };
    try {
      const url = existingId ? `${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${existingId}` : `${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`;
      const res = await fetch(url, { method: existingId ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
        // goal_strength='ps' — это исход штрафного броска, а не шайба из игры:
        // чужое удаление он не прекращает.
        if (isScoredFromPlay(payload) && !existingId) await processGoalPenaltyLogic(teamId, rowData.time_seconds);
        await loadInitialData();
        socket?.emit('score_updated', { gameId });
        socket?.emit('game_updated', { gameId });
        return true;
      }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
    return false;
  };

  const confirmDeleteAction = async () => {
    const { id, type } = deleteModalState;
    if (!id) return;
    setIsSaving(true);
    try {
      if (type === 'event') {
          await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${id}`, { method: 'DELETE', headers });
      } else if (type === 'goalie') {
          await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/goalie-log/${id}`, { method: 'DELETE', headers });
      }
      await loadInitialData();
      socket?.emit('score_updated', { gameId });
      socket?.emit('game_updated', { gameId });
    } catch (err) { console.error(err); } 
    finally {
      setIsSaving(false);
      setDeleteModalState({ isOpen: false, id: null, type: null });
    }
  };

  const handleRequestPlusMinus = (event) => {
    const isHome = event.team_id === game.home_team_id;
    setPlusMinusModalState({
      isOpen: true, event,
      scoringTeam: isHome ? { id: game.home_team_id, name: game.home_team_name } : { id: game.away_team_id, name: game.away_team_name },
      concedingTeam: isHome ? { id: game.away_team_id, name: game.away_team_name } : { id: game.home_team_id, name: game.home_team_name }
    });
  };

  const saveGoalieLog = async (logData) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/goalie-log`, { method: 'POST', headers, body: JSON.stringify(logData) });
      if (res.ok) { await loadInitialData(); socket?.emit('game_updated', { gameId }); return true; }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
    return false;
  };

  const saveGoalieShotsSummary = async ({ goalie_id, team_id, period, shots_count }) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/goalie-shots-summary`, {
        method: 'POST', headers, body: JSON.stringify({ goalie_id, team_id, period, shots_count })
      });
      // loadInitialData нужен чтобы game.needs_recalc обновился и кнопка загорелась
      if (res.ok) { await loadInitialData(); socket?.emit('game_updated', { gameId }); }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleFinishShootout = async () => {
    setIsSaving(true);
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/finish-shootout`, { method: 'POST', headers });
        const data = await res.json();
        if (data.success) {
            await loadInitialData();
            socket?.emit('score_updated', { gameId });
            socket?.emit('game_updated', { gameId });
        } else {
            alert(data.error);
        }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleReopenShootout = async () => {
    setIsSaving(true);
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/reopen-shootout`, { method: 'POST', headers });
        const data = await res.json();
        if (data.success) {
            await loadInitialData();
            socket?.emit('score_updated', { gameId });
            socket?.emit('game_updated', { gameId });
        } else {
            alert(data.error);
        }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleUpdateShootoutStatus = async (status) => {
      setIsSaving(true);
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/shootout-status`, {
              method: 'PUT', headers, body: JSON.stringify({ status })
          });
          if (res.ok) {
              await loadInitialData();
              socket?.emit('game_updated', { gameId });
          } else {
              const errData = await res.json();
              alert(errData.error || 'Ошибка при обновлении статуса');
          }
      } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleSaveActualData = async (field, value) => {
    setIsSaving(true);
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/info`, {
            method: 'PUT', headers, body: JSON.stringify({ [field]: value })
        });
        if (res.ok) {
            await loadInitialData();
            socket?.emit('game_updated', { gameId });
        }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleClearActualData = async (field) => {
    handleSaveActualData(field, '');
  };

  // Отказ обязан быть виден. Раньше здесь стоял голый `if (res.ok)` без else:
  // при ошибке сервера кнопка просто гасла, ничего не менялось и никакого следа
  // не оставалось — со стороны секретаря это выглядит как «кнопка не работает».
  const handleRecalculateStats = async () => {
      setIsRecalculatingStats(true);
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/recalculate`, {
              method: 'POST', headers
          });
          const data = await res.json().catch(() => ({}));

          if (!res.ok || !data.success) {
              setToast({
                  title: 'Пересчёт не выполнен',
                  message: data.error || `Сервер ответил ошибкой (${res.status}). Повторите или обратитесь к администратору.`,
                  type: 'error'
              });
              return;
          }

          await loadInitialData();
          socket?.emit('game_updated', { gameId });

          setToast(data.warning
              ? { title: 'Пересчёт выполнен частично', message: data.warning, type: 'error' }
              : { title: 'Статистика пересчитана', message: 'Боксскор матча и сводные таблицы обновлены.', type: 'success' });
      } catch (err) {
          console.error(err);
          setToast({ title: 'Пересчёт не выполнен', message: 'Сервер недоступен — проверьте соединение и повторите.', type: 'error' });
      }
      finally { setIsRecalculatingStats(false); }
  };

  const handleFinishGameFromDesk = async () => {
      setIsFinishingGame(true);
      try {
          let finalEndType = 'reg';
          if (currentPeriod === 'OT') finalEndType = 'ot';
          if (currentPeriod === 'SO') finalEndType = 'so';

          const payload = {
              status: 'finished',
              endType: finalEndType,
              finalHomeScore: game.home_score,
              finalAwayScore: game.away_score,
              isTechnical: game.is_technical
          };
          
          const resStatus = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/status`, {
              method: 'PUT', headers, body: JSON.stringify(payload)
          });
          
          if (resStatus.ok) {
              await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/recalculate`, {
                  method: 'POST', headers
              });
              await loadInitialData();
              socket?.emit('game_updated', { gameId });
          }
      } catch (err) {
          console.error(err);
      } finally {
          setIsFinishingGame(false);
      }
  };

  if (!game || !authUser) {
      return (
          <div className="min-h-screen bg-gray-light text-graphite-light flex items-center justify-center font-bold text-xl uppercase tracking-widest">
              <Loader text="" />
          </div>
      );
  }

  if (!canAccessPanel) {
      return (
          <div className="h-screen w-full flex items-center justify-center bg-gray-bg-light px-10">
              <AccessFallback variant="full" message="У вас нет прав для доступа к панели секретаря матча." />
          </div>
      );
  }

  return (
    <div className={`flex w-full h-screen bg-gray-bg-light font-sans overflow-hidden text-graphite ${isSaving || isFinishingGame || isRecalculatingStats ? 'cursor-wait' : ''}`}>
      
      <div className="w-[80%] h-full overflow-y-scroll p-6 pl-8 pr-4 bg-gray-light [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-graphite/20 hover:[&::-webkit-scrollbar-thumb]:bg-graphite/30 [&::-webkit-scrollbar-thumb]:rounded-full transition-colors relative">
        
        <div className="mb-5 flex items-center justify-between mr-2">
            <div className="flex flex-col gap-1.5 items-start">
              <div className="flex items-center">
                  <button onClick={() => navigate(`/games/${gameId}`)} className="flex items-center gap-1 text-[14px] font-bold text-graphite-light hover:text-orange transition-colors uppercase tracking-wider">
                    <Icon name="chevron_left" className="w-3.5 h-3.5" />
                    Страница матча
                  </button>
              </div>
              {game.is_protocol_signed && (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-status-accepted" title={isReadOnly ? matchEditAccess.reason : 'Протокол подписан — вам правка доступна как владельцу лиги или глобальному администратору'}>
                    <Icon name="lock" className="w-3.5 h-3.5" />
                    {isReadOnly ? 'Протокол подписан · только просмотр' : 'Протокол подписан'}
                  </div>
              )}
            </div>

            <div className="bg-white/60 backdrop-blur-md border border-graphite/10 shadow-sm rounded-lg p-1.5 flex items-center gap-2">
                <div className="flex items-center gap-2 px-2">
                    <EditableTimePill 
                        label="Начало" 
                        field="actual_start_time" 
                        value={game.actual_start_time} 
                        onSave={handleSaveActualData} 
                        onClear={handleClearActualData} 
                        isReadOnly={isReadOnly}
                    />
                    <EditableTimePill 
                        label="Конец" 
                        field="actual_end_time" 
                        value={game.actual_end_time} 
                        onSave={handleSaveActualData} 
                        onClear={handleClearActualData} 
                        isReadOnly={isReadOnly}
                    />
                    
                    <div className="w-px h-6 bg-graphite/10 mx-1"></div>
                    
                    <EditableNumberPill 
                        label="Зрители" 
                        field="spectators" 
                        value={game.spectators} 
                        onSave={handleSaveActualData} 
                        isReadOnly={isReadOnly}
                    />
                </div>

                <Button 
                    onClick={() => setIsViewerOpen(true)} 
                    className="ml-2 !px-3 !py-1.5 !text-[11px] uppercase tracking-wider shrink-0" 
                    title="Открыть протокол"
                >
                    ПРОТОКОЛ
                </Button>
            </div>
        </div>

        <div className="mr-2 flex flex-col gap-6">

          <GameFlowAccordion
            league={activeLeague}
            game={game}
            events={events}
            homeRoster={homeRoster}
            awayRoster={awayRoster}
            timerSeconds={timerSeconds}
            onSaveEvent={saveEventRow}
            onSavePenaltyGroup={savePenaltyGroup}
            onDeleteEvent={(id) => setDeleteModalState({ isOpen: true, id, type: 'event' })}
            onToggleLineup={toggleLineup}
            trackPlusMinus={trackPlusMinus}
            onRequestPlusMinus={handleRequestPlusMinus}
            isSaving={isSaving}
            goalieLog={goalieLog}
            onGoalieChange={saveGoalieLog}
            isReadOnly={isReadOnly}
            onToast={showInputError}
          />

          <SummaryTablesAccordion
            game={game}
            goalieLog={goalieLog}
            goaliesShotsSummary={goaliesShotsSummary}
            onSaveGoalieShotsSummary={saveGoalieShotsSummary}
            homeRoster={homeRoster}
            awayRoster={awayRoster}
            timerSeconds={timerSeconds}
            onSaveGoalieLog={saveGoalieLog}
            onRequestDeleteGoalieLog={(id) => setDeleteModalState({ isOpen: true, id, type: 'goalie' })}
            shotsTrackingEnabled={game?.track_shots ?? true}
            isReadOnly={isReadOnly}
            onToast={showInputError}
          />

          <ShootoutAccordion 
            game={game} events={events} homeRoster={homeRoster} awayRoster={awayRoster}
            currentPeriod={currentPeriod} soLength={soLength} periodLength={periodLength} otLength={otLength} periodsCount={periodsCount}
            onSaveEvent={saveEventRow} onDeleteEvent={(id) => setDeleteModalState({ isOpen: true, id, type: 'event' })}
            onFinishShootout={handleFinishShootout} 
            onReopenShootout={handleReopenShootout} 
            onUpdateStatus={handleUpdateShootoutStatus} 
            isSaving={isSaving}
            isReadOnly={isReadOnly}
          />

          <ProtocolBackAccordion
            game={game}
            homeRoster={homeRoster}
            awayRoster={awayRoster}
            isReadOnly={isReadOnly}
            setToast={setToast}
          />

          {!isReadOnly && (
              <div className="mt-4 mb-12 flex justify-end">
                 <button onClick={() => setIsTechModalOpen(true)} className="px-6 py-3 bg-white text-status-rejected hover:bg-status-rejected hover:text-white border border-status-rejected/20 rounded-md text-[13px] font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
                    <Icon name="whistle" className="w-4 h-4" />
                    Назначить технический результат
                 </button>
              </div>
          )}
        </div>
      </div>

      <TimerPanel
        game={game} currentPeriod={currentPeriod} onGoToStage={goToStage}
        stage={stage} stageSeconds={stageSeconds}
        timerSeconds={timerSeconds} handleTimerAction={handleTimerAction}
        activePenalties={activePenalties}
        isTimerRunning={stage ? stageClock.isRunning : isTimerRunning}
        periodsCount={periodsCount} setPeriodsCount={setPeriodsCountPersist}
        periodLength={periodLength} setPeriodLength={setPeriodLengthPersist}
        otLength={otLength} setOtLength={setOtLengthPersist}
        soLength={soLength} setSoLength={setSoLengthPersist}
        warmupLength={warmupLength} setWarmupLength={setWarmupLengthPersist}
        breakLength={breakLength} setBreakLength={setBreakLengthPersist}
        autoStopOnEvent={autoStopOnEvent} setAutoStopOnEvent={setAutoStopOnEventPersist}
        arenaAnnouncer={arenaAnnouncer} setArenaAnnouncer={setArenaAnnouncer}
        onResetAnnouncer={() => socket?.emit('timer_action', { gameId, action: 'reset_announcer' })}
        setToast={setToast}
        socketConnected={socket?.connected}
        onRecalculate={handleRecalculateStats} 
        onFinishGame={handleFinishGameFromDesk} 
        isFinishing={isFinishingGame}
        isRecalculating={isRecalculatingStats}
        onSetTime={handleSetTime}
        onAdjustTime={handleAdjustTime}
        isReadOnly={isReadOnly}
      />

      <ConfirmModal 
        isOpen={deleteModalState.isOpen} onClose={() => setDeleteModalState({ isOpen: false, id: null, type: null })}
        onConfirm={confirmDeleteAction} isLoading={isSaving}
      />
      <GamePlusMinusModal 
        isOpen={plusMinusModalState.isOpen} onClose={() => setPlusMinusModalState(p => ({ ...p, isOpen: false }))}
        gameId={gameId} event={plusMinusModalState.event} scoringTeam={plusMinusModalState.scoringTeam} concedingTeam={plusMinusModalState.concedingTeam}
        scoringRoster={plusMinusModalState.scoringTeam?.id === game.home_team_id ? homeRoster : awayRoster}
        concedingRoster={plusMinusModalState.concedingTeam?.id === game.home_team_id ? homeRoster : awayRoster}
        onSuccess={loadInitialData}
      />
      <TechDefeatModal 
        isOpen={isTechModalOpen} onClose={() => setIsTechModalOpen(false)} game={game}
        onSuccess={() => { loadInitialData(); socket?.emit('score_updated', { gameId }); socket?.emit('game_updated', { gameId }); }}
      />
      <ProtocolViewerModal
        isOpen={isViewerOpen} onClose={() => setIsViewerOpen(false)} gameId={gameId} initialLeagueId={game.league_id}
        // Подпись секретаря закрывает правки — панель должна узнать об этом сразу, а не
        // после перезагрузки; другие открытые панели — через game_updated
        onSigned={async () => { await loadInitialData(); socket?.emit('game_updated', { gameId }); }}
      />

      {/* key — метка показа: новое уведомление подряд за прошлым (ошибки ввода бумажного
          вида) заново отсчитывает свои 5 секунд, а не закрывается по таймеру прошлого */}
      {toast && <Toast key={toast.stamp} title={toast.title} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

    </div>
  );
}