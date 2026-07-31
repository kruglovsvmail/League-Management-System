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
import { 
  getPeriodLimits, 
  calculatePenaltyTimelines, 
  calculatePeriodFromTime
} from '../components/GameLiveDesk/GameDeskShared';
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
  useEffect(() => {
      if (!game || !activeLeague) return;

      if (isReadOnly) {
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

  const [trackPlusMinus, setTrackPlusMinus] = useState(false);
  const [autoStopOnEvent, setAutoStopOnEvent] = useState(false);

  const DEFAULT_ARENA_ANNOUNCER = { warn1min: false, warn2min: false, endSiren: false, goalAnnounce: false, goalDelay: 5, goalExpiry: 40 };
  const [arenaAnnouncer, setArenaAnnouncerState] = useState(DEFAULT_ARENA_ANNOUNCER);

  const [plusMinusModalState, setPlusMinusModalState] = useState({ isOpen: false, event: null, scoringTeam: null, concedingTeam: null });

  const [deleteModalState, setDeleteModalState] = useState({ isOpen: false, id: null, type: null });
  
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false); 
  const [isFinishingGame, setIsFinishingGame] = useState(false); 
  const [isRecalculatingStats, setIsRecalculatingStats] = useState(false);

  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [toast, setToast] = useState(null);

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
        
        setHomeRoster((dataHome.gameRoster || []).sort((a,b)=>a.jersey_number - b.jersey_number));
        setAwayRoster((dataAway.gameRoster || []).sort((a,b)=>a.jersey_number - b.jersey_number));
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadInitialData(); }, [gameId]);

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
      }

      // Настройки матча применяются ВСЕГДА (не гасятся ignoreSocketRef) — сервер уже
      // авторитетно знает актуальное значение, а applySetting сам отличит эхо своего
      // изменения от реального конфликта с другим устройством и предупредит тостом.
      applySetting('periodLength', state.periodLength, setPeriodLength);
      applySetting('otLength', state.otLength, setOtLength);
      applySetting('soLength', state.soLength, setSoLength);
      applySetting('periodsCount', state.periodsCount, setPeriodsCount);
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

  useEffect(() => {
    const interval = setInterval(() => {
      if (timerData.isRunning && timerData.startedAt) {
        const nowWithOffset = Date.now() + timerData.serverTimeOffset;
        const elapsedSinceStart = Math.floor((nowWithOffset - timerData.startedAt) / 1000);
        setTimerSeconds(timerData.accumulatedSeconds + elapsedSinceStart);
      } else {
        setTimerSeconds(timerData.accumulatedSeconds);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [timerData]);

  useEffect(() => {
    const limits = getPeriodLimits(currentPeriod, periodLength, otLength, periodsCount);
    if (timerData.isRunning && limits.end > 0 && timerSeconds >= limits.end) {
      if (isReadOnly) return;
      lockSocketUpdates();
      
      setTimerData(prev => ({ ...prev, isRunning: false, accumulatedSeconds: limits.end, startedAt: null }));
      setIsTimerRunning(false);
      setTimerSeconds(limits.end);

      socket?.emit('timer_action', { gameId, action: 'stop' });
      socket?.emit('timer_action', { gameId, action: 'set_time', timerData: { seconds: limits.end } });
    }
  }, [timerSeconds, timerData.isRunning, currentPeriod, periodLength, otLength, periodsCount, isReadOnly, gameId, socket]);

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

  useEffect(() => {
    if (!socket) return;
    const handler = ({ url }) => playArenaAudio(url);
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
    logTimerAction(action, timerSeconds);
    
    setTimerData(prev => {
        if (action === 'start') return { ...prev, isRunning: true, startedAt: Date.now() + prev.serverTimeOffset };
        if (action === 'stop') return { ...prev, isRunning: false, startedAt: null, accumulatedSeconds: timerSeconds };
        return prev;
    });
    setIsTimerRunning(action === 'start');

    socket?.emit('timer_action', { gameId, action });
  };

  const changePeriod = (period) => {
    if (isReadOnly) return;
    lockSocketUpdates();
    setCurrentPeriod(period);
    const limits = getPeriodLimits(period, periodLength, otLength, periodsCount);
    
    setTimerData(prev => ({ ...prev, accumulatedSeconds: limits.start, isRunning: false, startedAt: null }));
    setIsTimerRunning(false);
    // Период пишем в журнал новый — важно, куда переключились
    logTimerAction('change_period', limits.start, { period });

    socket?.emit('timer_action', {
        gameId,
        action: 'change_period',
        timerData: { seconds: limits.start, period, isRunning: false } 
    });
    socket?.emit('game_updated', { gameId });
  };

  const toggleLineup = async (rosterId, teamId, currentState) => {
    const updateState = (prev) => prev.map(p => p.id === rosterId ? { ...p, is_in_lineup: !currentState } : p);
    if (teamId === game.home_team_id) setHomeRoster(updateState);
    else setAwayRoster(updateState);
  };

  const processGoalPenaltyLogic = async (scoringTeamId, goalTimeRaw) => {
    const concedingTeamId = scoringTeamId === game.home_team_id ? game.away_team_id : game.home_team_id;
    const goalTime = parseInt(goalTimeRaw, 10);
    const concedingTimeline = calculatePenaltyTimelines(events.filter(e => e.team_id === concedingTeamId && e.event_type === 'penalty'));
    const scoringTimeline = calculatePenaltyTimelines(events.filter(e => e.team_id === scoringTeamId && e.event_type === 'penalty'));
    const isPenaltyActiveOnIce = (p, time) => [2, 4, 5, 25].includes(parseInt(p.penalty_minutes, 10)) && time >= p.effStart && time < p.effEnd;

    const activeConceding = concedingTimeline.filter(p => isPenaltyActiveOnIce(p, goalTime));
    const activeScoring = scoringTimeline.filter(p => isPenaltyActiveOnIce(p, goalTime));

    if (activeConceding.length > activeScoring.length) {
      const expirablePenalty = activeConceding.filter(p => [2, 4].includes(parseInt(p.penalty_minutes, 10))).sort((a, b) => a.effStart - b.effStart)[0];
      if (expirablePenalty) {
        const mins = parseInt(expirablePenalty.penalty_minutes, 10);
        let reduction = 0;
        if (mins === 2) reduction = expirablePenalty.effEnd - goalTime;
        else if (mins === 4) {
          // 2+2: пока ни один из двух отрезков не был отменён (остаток = полные 240с), гол в первых
          // 2 минутах отменяет только первый отрезок — второй всё равно доигрывается 2 минуты с этого
          // момента. Если остаток уже меньше 240с, значит первый отрезок уже был отменён предыдущим
          // голом — этот (второй) гол отменяет оставшийся отрезок целиком, штраф заканчивается сразу.
          const totalDuration = expirablePenalty.effEnd - expirablePenalty.effStart;
          const elapsed = goalTime - expirablePenalty.effStart;
          if (totalDuration >= 240 && elapsed < 120) reduction = expirablePenalty.effEnd - (goalTime + 120);
          else reduction = expirablePenalty.effEnd - goalTime;
        }
        if (reduction > 0) {
          const newDbEndTime = parseInt(expirablePenalty.penalty_end_time, 10) - reduction;
          await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${expirablePenalty.id}`, {
            method: 'PUT', headers, body: JSON.stringify({ ...expirablePenalty, penalty_end_time: newDbEndTime })
          });
        }
      }
    }
  };

  const saveEventRow = async (teamId, eventType, rowData, existingId = null) => {
    setIsSaving(true);
    let finalPeriod = currentPeriod;
    if (['goal', 'penalty', 'timeout'].includes(eventType) && rowData.time_seconds !== undefined) {
      finalPeriod = calculatePeriodFromTime(rowData.time_seconds, periodLength, otLength, periodsCount);
    } else if (['shootout_goal', 'shootout_miss'].includes(eventType)) {
      finalPeriod = 'SO';
    }

    if (autoStopOnEvent && !existingId && ['goal', 'penalty', 'timeout'].includes(eventType)) {
      handleTimerAction('stop');
    }

    const payload = { period: finalPeriod, team_id: teamId, event_type: eventType, ...rowData };
    try {
      const url = existingId ? `${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${existingId}` : `${import.meta.env.VITE_API_URL}/api/games/${gameId}/events`;
      const res = await fetch(url, { method: existingId ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
        if (eventType === 'goal' && !existingId) await processGoalPenaltyLogic(teamId, rowData.time_seconds);
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
      if (res.ok) { await loadInitialData(); socket?.emit('game_updated', { gameId }); }
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
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

  const handleRecalculateStats = async () => {
      setIsRecalculatingStats(true);
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/recalculate`, {
              method: 'POST', headers
          });
          if (res.ok) {
              await loadInitialData();
              socket?.emit('game_updated', { gameId });
          }
      } catch (err) { console.error(err); } 
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
            game={game}
            events={events}
            homeRoster={homeRoster}
            awayRoster={awayRoster}
            timerSeconds={timerSeconds}
            onSaveEvent={saveEventRow}
            onDeleteEvent={(id) => setDeleteModalState({ isOpen: true, id, type: 'event' })}
            onToggleLineup={toggleLineup}
            trackPlusMinus={trackPlusMinus}
            onRequestPlusMinus={handleRequestPlusMinus}
            isSaving={isSaving}
            goalieLog={goalieLog}
            onGoalieChange={saveGoalieLog}
            isReadOnly={isReadOnly}
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
        game={game} currentPeriod={currentPeriod} changePeriod={changePeriod}
        timerSeconds={timerSeconds} isTimerRunning={isTimerRunning} handleTimerAction={handleTimerAction}
        periodsCount={periodsCount} setPeriodsCount={setPeriodsCountPersist}
        periodLength={periodLength} setPeriodLength={setPeriodLengthPersist}
        otLength={otLength} setOtLength={setOtLengthPersist}
        soLength={soLength} setSoLength={setSoLengthPersist}
        autoStopOnEvent={autoStopOnEvent} setAutoStopOnEvent={setAutoStopOnEventPersist}
        arenaAnnouncer={arenaAnnouncer} setArenaAnnouncer={setArenaAnnouncer}
        onResetAnnouncer={() => socket?.emit('timer_action', { gameId, action: 'reset_announcer' })}
        setToast={setToast}
        socketConnected={socket?.connected}
        onRecalculate={handleRecalculateStats} 
        onFinishGame={handleFinishGameFromDesk} 
        isFinishing={isFinishingGame}
        isRecalculating={isRecalculatingStats}
        onSetTime={(secs) => {
          if (isReadOnly) return;
          lockSocketUpdates();
          // В журнал пишем значение ПОСЛЕ правки — оно и окажется на табло
          logTimerAction('set_time', secs);
          setTimerData(prev => ({ ...prev, accumulatedSeconds: secs, startedAt: prev.isRunning ? (Date.now() + prev.serverTimeOffset) : null }));
          socket?.emit('timer_action', { gameId, action: 'set_time', timerData: { seconds: secs } });
        }}
        onAdjustTime={(delta) => {
          if (isReadOnly) return;
          lockSocketUpdates();
          logTimerAction('adjust', Math.max(0, timerSeconds + delta), { delta_seconds: delta });
          setTimerData(prev => {
            let current = prev.accumulatedSeconds || 0;
            if (prev.isRunning && prev.startedAt) {
              current += Math.floor((Date.now() - prev.startedAt) / 1000);
            }
            const newSecs = Math.max(0, current + delta);
            return { ...prev, accumulatedSeconds: newSecs, startedAt: prev.isRunning ? (Date.now() + prev.serverTimeOffset) : null };
          });
          socket?.emit('timer_action', { gameId, action: 'adjust_time', timerData: { delta } });
        }}
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
      <ProtocolViewerModal isOpen={isViewerOpen} onClose={() => setIsViewerOpen(false)} gameId={gameId} initialLeagueId={game.league_id} />

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

    </div>
  );
}