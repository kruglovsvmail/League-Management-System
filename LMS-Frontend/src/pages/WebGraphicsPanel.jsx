import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// DND Kit импорты
import {
  DndContext,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragOverlay,
  pointerWithin,
  MeasuringStrategy
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
// ТОТ САМЫЙ ИМПОРТ, КОТОРЫЙ ВЫЗВАЛ ОШИБКУ:
import { snapCenterToCursor } from '@dnd-kit/modifiers';

import { useWebGraphicsPanel } from '../components/WebGraphicsPanel/useWebGraphicsPanel';
import { BroadcastTile } from '../components/WebGraphicsPanel/BroadcastTile';
import { ScoreboardFace } from '../components/WebGraphicsPanel/ScoreboardFace';
import { BumperFront, BumperBack } from '../components/WebGraphicsPanel/BumperFaces';
import { TileHint, TileTimerFace, TileTimerSettings, TileStepperSetting } from '../components/WebGraphicsPanel/TileParts';
import { GameEventsWidget } from '../components/WebGraphicsPanel/GameEventsWidget';
import { AutoPlaylistWidget } from '../components/WebGraphicsPanel/AutoPlaylistWidget';
import { AudioPlayerWidget } from '../components/WebGraphicsPanel/AudioPlayerWidget';
import { PanelTabs } from '../components/WebGraphicsPanel/PanelTabs';
import { useAccess } from '../hooks/useAccess';
import { AccessFallback } from '../ui/AccessFallback';
import { Icon } from '../ui/Icon';
import { getToken } from '../utils/helpers';
import { exportBumperWebm, checkBumperExportSupport, getBumperTiming } from '../utils/exportBumperWebm';

export function WebGraphicsPanel() {
  const { gameId } = useParams();
  const navigate = useNavigate();

  // Устанавливаем заголовок вкладки
  useEffect(() => {
    document.title = 'Панель управления трансляцией | LMS';
  }, []);
  
  const {
    game, events, timerSeconds, currentPeriod, isTimerRunning, activePenalties,
    periodLength, otLength, socket, broadcastedEvents,
    triggerOverlay, toggleStaticOverlay, activeStaticOverlay, activeStaticOverlayData,
    isScoreboardVisible, toggleScoreboard, activeEventOverlay,
    autoShowSettings, updateAutoShowSettings, getEventSignature,
    ttsEvents, updateTtsEvents,
    audioPlaying, audioSource,
    introPlaying, setIntroPlaying,
    playlistSteps, setPlaylistSteps,
    autopilotDuration, setAutopilotDuration,
    autopilotLoop, setAutopilotLoop,
    autopilotRunning, autopilotIndex,
    startAutopilotServer, stopAutopilotServer,
    forceResyncOverlay,
    overlayParams, persistParams,
    overlayCount,
    overlayMismatch,
    bumperWarmup,
  } = useWebGraphicsPanel(gameId);

  // Вкладка правой колонки. Запоминаем на матч: режиссёр возвращается в панель
  // (перезагрузка, вторая вкладка) к тому же виджету, с которым работал.
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem(`graphics_tab_${gameId}`) || 'events');
  useEffect(() => { localStorage.setItem(`graphics_tab_${gameId}`, activeTab); }, [activeTab, gameId]);

  // Правая колонка убирается: во втором периоде она не нужна, а плиткам достаётся
  // весь экран. Тоже запоминаем — иначе после перезагрузки она возвращалась бы.
  const [asideOpen, setAsideOpen] = useState(() => localStorage.getItem(`graphics_aside_${gameId}`) !== '0');
  useEffect(() => { localStorage.setItem(`graphics_aside_${gameId}`, asideOpen ? '1' : '0'); }, [asideOpen, gameId]);

  // Полноэкранный режим. Состояние держим не своё, а браузерное: из него выходят
  // и клавишей Esc, мимо нашей кнопки.
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  // Что работает за убранной колонкой. Пустая строка — всё тихо, тревожить нечем.
  // Озвучку события сюда не берём: она длится несколько секунд и погаснет раньше,
  // чем на неё посмотрят (тот же критерий, что у подсветки вкладки «Аудио»).
  const asideHiddenActivity = !asideOpen ? [
    autopilotRunning && 'крутится автопилот',
    introPlaying && 'играет интро',
    audioSource === 'roster' && 'идёт озвучка составов',
  ].filter(Boolean).join(', ') : '';

  const [resyncSent, setResyncSent] = useState(false);
  const handleForceResync = () => {
    // Панель — источник истины. Сначала пишем текущее состояние панели в БД
    // (перекрывая возможно устаревшие данные), затем OBS переподключается и
    // читает уже корректное состояние. Без этого дебаунс persist-эффекта (250мс)
    // может не успеть записать null, и OBS восстановит старую плашку из БД.
    socket?.emit('update_overlay_state', {
      gameId,
      staticOverlay: activeStaticOverlay
        ? { type: activeStaticOverlay, data: getOverlayPayload(activeStaticOverlay) }
        : null,
    });
    forceResyncOverlay();
    setResyncSent(true);
    setTimeout(() => setResyncSent(false), 2500);
  };

  // Применяем синхронизированные параметры плашек, прилетевшие от другого режиссёра / из БД.
  useEffect(() => {
    if (!overlayParams) return;
    const p = overlayParams;
    if (typeof p.rosterSwitch === 'number') setRosterSwitchSecs(p.rosterSwitch);
    if (typeof p.leadersSwitch === 'number') setLeadersSwitchSecs(p.leadersSwitch);
    if (typeof p.arenaDuration === 'number') setArenaDurationSecs(p.arenaDuration);
    if (typeof p.commentatorDuration === 'number') setcommentatorDurationSecs(p.commentatorDuration);
    if (typeof p.refereesDuration === 'number') setRefereesDurationSecs(p.refereesDuration);
    if (typeof p.bumperOutro === 'boolean') setBumperOutro(p.bumperOutro);

    // Отсчёты: running → считаем остаток из endTime; пауза → берём замороженный timeLeft.
    if (p.prematch) {
      const pm = p.prematch;
      if (typeof pm.mins === 'number') setPrematchMins(pm.mins);
      if (pm.running && typeof pm.endTime === 'number') {
        prematchEndTimeRef.current = pm.endTime;
        setPrematchTimeLeft(Math.max(0, Math.round((pm.endTime - Date.now()) / 1000)));
        setIsPrematchRunning(true);
      } else {
        prematchEndTimeRef.current = null;
        setIsPrematchRunning(false);
        if (typeof pm.timeLeft === 'number') setPrematchTimeLeft(pm.timeLeft);
      }
    }
    if (p.intermission) {
      const im = p.intermission;
      if (typeof im.mins === 'number') setIntermissionMins(im.mins);
      if (im.running && typeof im.endTime === 'number') {
        intermissionEndTimeRef.current = im.endTime;
        setIntermissionTimeLeft(Math.max(0, Math.round((im.endTime - Date.now()) / 1000)));
        setIsIntermissionRunning(true);
      } else {
        intermissionEndTimeRef.current = null;
        setIsIntermissionRunning(false);
        if (typeof im.timeLeft === 'number') setIntermissionTimeLeft(im.timeLeft);
      }
    }
  }, [overlayParams]);

  // Старт серверного автопилота: разрешаем плейлист (каждый шаг получает свои данные через getOverlayPayload).
  const handleStartAutopilot = () => {
    const resolved = playlistSteps.map(s => ({ id: s.id, type: s.type, label: s.label, data: getOverlayPayload(s.type) }));
    startAutopilotServer(resolved, autopilotDuration, autopilotLoop && playlistSteps.length > 1);
  };

  // Ручное нажатие по плашке — это перехват эфира у автопилота: иначе он через
  // несколько секунд подменил бы то, что режиссёр только что выбрал. Стоп идёт
  // «с перехватом» (keepOverlay): гасит цикл, но не трогает плашку — её прямо
  // сейчас выставляет сама панель.
  const takeAir = (fn) => () => {
    if (autopilotRunning) stopAutopilotServer(true);
    fn();
  };

  // --- ЛОГИКА АВТОРИЗАЦИИ ---
  const [authUser, setAuthUser] = useState(null);
  const activeLeague = authUser?.leagues?.find(l => l.id === game?.league_id) || null;
  const { checkAccess } = useAccess(authUser, activeLeague);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/me`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        const data = await res.json();
        if (data.success) setAuthUser(data.user);
      } catch (err) { console.error('Ошибка загрузки профиля', err); }
    };
    fetchUser();
  }, []);

  // --- СТЕЙТЫ ТАЙМЕРОВ ---
  const [intermissionMins, setIntermissionMins] = useState(2);
  const [intermissionTimeLeft, setIntermissionTimeLeft] = useState(2 * 60);
  const [isIntermissionRunning, setIsIntermissionRunning] = useState(false);

  const [prematchMins, setPrematchMins] = useState(10);
  const [prematchTimeLeft, setPrematchTimeLeft] = useState(10 * 60);
  const [isPrematchRunning, setIsPrematchRunning] = useState(false);

  // Отсчёты идут по endTime (как основной таймер): оба режиссёра считают остаток из одной точки.
  const prematchEndTimeRef = useRef(null);
  const intermissionEndTimeRef = useRef(null);

  useEffect(() => {
    if (!isIntermissionRunning) return;
    const tick = () => {
      const left = intermissionEndTimeRef.current ? Math.max(0, Math.round((intermissionEndTimeRef.current - Date.now()) / 1000)) : 0;
      setIntermissionTimeLeft(left);
      if (left <= 0) setIsIntermissionRunning(false);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [isIntermissionRunning]);

  useEffect(() => {
    if (!isPrematchRunning) return;
    const tick = () => {
      const left = prematchEndTimeRef.current ? Math.max(0, Math.round((prematchEndTimeRef.current - Date.now()) / 1000)) : 0;
      setPrematchTimeLeft(left);
      if (left <= 0) setIsPrematchRunning(false);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [isPrematchRunning]);

  const syncIntermissionToObs = (running, timeLeft) => { if (activeStaticOverlay === 'intermission') toggleStaticOverlay('intermission', { isPaused: !running, timeLeft: timeLeft, endTime: running ? Date.now() + timeLeft * 1000 : null }, true); };
  const syncPrematchToObs = (running, timeLeft) => { if (activeStaticOverlay === 'prematch') toggleStaticOverlay('prematch', { isPaused: !running, timeLeft: timeLeft, endTime: running ? Date.now() + timeLeft * 1000 : null }, true); };

  const handleIntermissionStart = () => { if (intermissionTimeLeft > 0) { const endTime = Date.now() + intermissionTimeLeft * 1000; intermissionEndTimeRef.current = endTime; setIsIntermissionRunning(true); syncIntermissionToObs(true, intermissionTimeLeft); persistParams({ intermission: { running: true, endTime, mins: intermissionMins } }); } };
  const handleIntermissionPause = () => { const left = intermissionEndTimeRef.current ? Math.max(0, Math.round((intermissionEndTimeRef.current - Date.now()) / 1000)) : intermissionTimeLeft; setIsIntermissionRunning(false); setIntermissionTimeLeft(left); intermissionEndTimeRef.current = null; syncIntermissionToObs(false, left); persistParams({ intermission: { running: false, timeLeft: left, mins: intermissionMins } }); };
  const handleIntermissionStepper = (newMins) => { setIntermissionMins(newMins); const newTime = newMins * 60; setIsIntermissionRunning(false); setIntermissionTimeLeft(newTime); intermissionEndTimeRef.current = null; syncIntermissionToObs(false, newTime); persistParams({ intermission: { running: false, timeLeft: newTime, mins: newMins } }); };
  const handleIntermissionToggle = () => { if (activeStaticOverlay !== 'intermission') toggleStaticOverlay('intermission', { isPaused: !isIntermissionRunning, timeLeft: intermissionTimeLeft, endTime: isIntermissionRunning ? Date.now() + intermissionTimeLeft * 1000 : null }); else toggleStaticOverlay('intermission'); };

  const handlePrematchStart = () => { if (prematchTimeLeft > 0) { const endTime = Date.now() + prematchTimeLeft * 1000; prematchEndTimeRef.current = endTime; setIsPrematchRunning(true); syncPrematchToObs(true, prematchTimeLeft); persistParams({ prematch: { running: true, endTime, mins: prematchMins } }); } };
  const handlePrematchPause = () => { const left = prematchEndTimeRef.current ? Math.max(0, Math.round((prematchEndTimeRef.current - Date.now()) / 1000)) : prematchTimeLeft; setIsPrematchRunning(false); setPrematchTimeLeft(left); prematchEndTimeRef.current = null; syncPrematchToObs(false, left); persistParams({ prematch: { running: false, timeLeft: left, mins: prematchMins } }); };
  const handlePrematchStepper = (newMins) => { setPrematchMins(newMins); const newTime = newMins * 60; setIsPrematchRunning(false); setPrematchTimeLeft(newTime); prematchEndTimeRef.current = null; syncPrematchToObs(false, newTime); persistParams({ prematch: { running: false, timeLeft: newTime, mins: newMins } }); };
  const handlePrematchToggle = () => { if (activeStaticOverlay !== 'prematch') toggleStaticOverlay('prematch', { isPaused: !isPrematchRunning, timeLeft: prematchTimeLeft, endTime: isPrematchRunning ? Date.now() + prematchTimeLeft * 1000 : null }); else toggleStaticOverlay('prematch'); };

  // Табло по центру: параметров нет, живёт до повторного нажатия — как предматч
  // и перерыв, а не как арена с автоснятием по таймеру.
  const handleScoreBarToggle = () => { toggleStaticOverlay('scorebar'); };

  // --- ЗАСТАВКИ ---
  // Слоты приходят с сервера: названия, длительности и признак «файл залит».
  const [bumperSlots, setBumperSlots] = useState([]);
  const [bumperSlot, setBumperSlot] = useState(null);

  useEffect(() => {
    if (!gameId) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/broadcast/bumpers`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => {
        if (!d.success) return;
        setBumperSlots(d.bumpers || []);
        // Встаём на первый залитый слот. Не нашлось ни одного — остаёмся на
        // null: кнопка всё равно рабочая и отыграет чистый переход.
        const first = (d.bumpers || []).find(b => b.uploaded);
        setBumperSlot(first ? first.slot : null);
      })
      .catch(() => {});
  }, [gameId]);

  // Титр в эфире восстанавливаем из состояния плашки, а не из локального выбора:
  // после перезагрузки панели слот и момент запуска приходят из БД, и таймер
  // подсветки должен досчитать остаток, а не начать отсчёт заново.
  const liveBumper = activeStaticOverlay === 'bumper' ? activeStaticOverlayData : null;
  const liveSlot = Number(liveBumper?.slot) || null;

  useEffect(() => {
    if (liveSlot) setBumperSlot(liveSlot);
  }, [liveSlot]);

  const currentBumper = bumperSlots.find(b => b.slot === bumperSlot);
  // Ролика может не быть: слот не выбран или файл в него не залит. Тогда титр
  // вырождается в один проход шторки — это обычный переход, которым режиссёр
  // прикрывает переключение сцены в OBS.
  const bumperHasVideo = !!currentBumper?.uploaded;

  // Закрывать ли ролик переходом на выходе. Вход переходом — всегда: без него
  // склейка на рекламу видна в эфире. Выключают именно хвост, когда возврат в
  // игру нужен мгновенный или переключение сцены в OBS уже сделано тем же
  // Stinger-переходом.
  const [bumperOutro, setBumperOutro] = useState(true);

  const handleBumperOutroToggle = () => {
    const next = !bumperOutro;
    setBumperOutro(next);
    persistParams({ bumperOutro: next });
    // Переключение прямо в эфире перезапускает титр — иначе уже запущенный
    // ролик доиграл бы по старому расчёту.
    if (activeStaticOverlay === 'bumper') {
      toggleStaticOverlay('bumper', { slot: bumperHasVideo ? bumperSlot : null, outro: next, startedAt: Date.now() }, true);
    }
  };

  // Длительность перехода берём у самой графики лиги: сценарий там правится, и
  // константа в панели с ним разъезжалась. До загрузки модуля — прежние 2,4 с.
  const [bumperSweep, setBumperSweep] = useState(2.4);
  const [bumperCover, setBumperCover] = useState(1.2);

  useEffect(() => {
    let alive = true;
    getBumperTiming(game?.league_id)
      .then(t => { if (alive) { setBumperSweep(t.sweepMs / 1000); setBumperCover(t.coverMs / 1000); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [game?.league_id]);

  // Сколько держать плитку зажатой.
  //
  // Ролик стартует под открывающим переходом в момент перекрытия кадра. Дальше
  // либо заходит закрывающий (и титр живёт длину ролика плюс весь переход),
  // либо картинка возвращается сразу по концу ролика. Без ролика остаётся один
  // проход — иначе кнопка с пустым выбором не делала бы ничего.
  const bumperFullSecs = !bumperHasVideo
    ? bumperSweep
    : Math.round((currentBumper.duration || 15) + (bumperOutro ? bumperSweep : bumperCover));

  // Остаток от уже идущего титра: при перезагрузке панели плитка должна
  // погаснуть тогда же, когда картинка вернётся в эфир, а не через полный цикл.
  //
  // Он пересчитывается на КАЖДЫЙ рендер (панель перерисовывается вместе с
  // таймером матча, четырежды в секунду), поэтому годится только для таймера
  // автоснятия. Полосе показа нужна неизменная длина и точка старта — иначе
  // браузер каждый раз заново раскладывает уже идущую анимацию.
  const bumperElapsed = liveBumper?.startedAt ? (Date.now() - Number(liveBumper.startedAt)) / 1000 : 0;
  const bumperTotalSecs = Math.max(0.5, bumperFullSecs - bumperElapsed);

  // Прогрев выбранного слота в оверлеях. Пока файл не доехал, эфир придерживаем:
  // в кадре был бы стоп-кадр вместо ролика. Оверлеи молчат (никто не подключён,
  // старая версия оверлея) — не мешаем работать: bumperWarmup остаётся null.
  // Ждём и выбранный ролик, и сам переход: переход играет первым, и холодный он
  // означает видимую склейку. Процент показываем по тому, что отстаёт.
  const bumperWarmParts = [
    bumperSlot ? bumperWarmup?.[bumperSlot] : null,
    bumperWarmup?.transition,
  ].filter(Boolean);
  const bumperWarming = bumperWarmParts.some(w => !w.ready);
  const bumperWarm = bumperWarmParts.length
    ? bumperWarmParts.reduce((a, b) => ((a.progress ?? 1) <= (b.progress ?? 1) ? a : b))
    : null;

  const handleBumperToggle = () => {
    if (activeStaticOverlay === 'bumper') { toggleStaticOverlay('bumper'); return; }
    if (!bumperTransition?.url) return;   // переход ещё не собран — играть нечего
    toggleStaticOverlay('bumper', {
      slot: bumperHasVideo ? bumperSlot : null,
      outro: bumperOutro,
      // Отметка старта: по ней оверлей подхватывает титр с нужной точки, если
      // его перезагрузили в OBS посреди рекламы.
      startedAt: Date.now(),
    });
  };

  // --- ВЫГРУЗКА ПЕРЕХОДА В WEBM ---
  // Файл кладётся в OBS как Stinger-переход, поэтому нужен с прозрачным фоном и
  // с данными этого матча. Эмблемы берём через сервер как data-URI: картинка с
  // чужого домена «портит» холст, и кодировщик отказался бы с ним работать.
  const [bumperExporting, setBumperExporting] = useState(false);
  const [bumperExportProgress, setBumperExportProgress] = useState(0);
  // null — ещё не проверяли; иначе { supported, reason }. Прозрачность в WebM
  // умеет только запись canvas в VP8 через MediaRecorder — см. утилиту.
  const [bumperExportSupport, setBumperExportSupport] = useState(null);

  useEffect(() => { setBumperExportSupport(checkBumperExportSupport()); }, []);

  // Готовый переход матча: собран он или нет. Пока не собран, эфирная кнопка
  // заставки заблокирована — играть было бы нечего.
  const [bumperTransition, setBumperTransition] = useState(null);

  const loadTransition = () => {
    if (!gameId) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/broadcast/transition`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => { if (d.success) setBumperTransition(d.transition); })
      .catch(() => {});
  };

  useEffect(() => { loadTransition(); }, [gameId]);

  // Сборка перехода: кадры рисуются на canvas данными ЭТОГО матча, кодируются
  // в WebM с прозрачностью и уходят в S3. Дальше эфир только проигрывает файл,
  // поэтому операция разовая — повторять её нужно, лишь если поменялись
  // эмблемы, дивизион или название слота.
  const buildTransitionBlob = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/broadcast/logos`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
    const data = await res.json();

    return exportBumperWebm({
      leagueId: game?.league_id,
      logos: data?.logos || {},
      division: game?.division_name || game?.division_short_name,
      homeName: game?.home_team_name,
      awayName: game?.away_team_name,
      title: currentBumper?.title,
      homeColor: game?.home_color_1,
      awayColor: game?.away_color_1,
      onProgress: setBumperExportProgress,
    });
  };

  const handleBumperGenerate = async () => {
    if (bumperExporting || !bumperExportSupport?.supported) return;
    setBumperExporting(true);
    setBumperExportProgress(0);
    try {
      const blob = await buildTransitionBlob();

      const form = new FormData();
      form.append('file', new File([blob], 'transition.webm', { type: 'video/webm' }));

      const up = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/broadcast/transition`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: form,
      });
      const json = await up.json();
      if (!json.success) throw new Error(json.error || 'сервер отклонил файл');

      loadTransition();
      // Оверлеи в OBS перечитывают данные матча и подхватывают новый файл —
      // без этого они продолжали бы играть переход прошлой сборки.
      forceResyncOverlay();
    } catch (e) {
      console.error('Ошибка сборки перехода:', e);
      alert(`Не удалось собрать переход: ${e.message || e}`);
    } finally {
      setBumperExporting(false);
      setBumperExportProgress(0);
    }
  };

  // Скачивание не пересобирает файл — забирает уже собранный, чтобы в OBS лёг
  // ровно тот переход, который идёт в эфире.
  //
  // Идём через свой сервер, а не по ссылке на S3: атрибут download браузер
  // игнорирует для чужого домена, и файл просто открывался бы в новой вкладке.
  // Сервер отдаёт его с Content-Disposition: attachment, а blob здесь нужен
  // потому, что запрос требует заголовка авторизации — простой ссылкой его не
  // передать.
  const [bumperDownloading, setBumperDownloading] = useState(false);

  const handleBumperDownload = async () => {
    if (!bumperTransition?.url || bumperDownloading) return;
    setBumperDownloading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/broadcast/transition/download`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('файл недоступен');
      const blob = await res.blob();

      const teams = [game?.home_short_name, game?.away_short_name].filter(Boolean).join('-') || gameId;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `perehod-${teams}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Отзываем не сразу: если освободить ссылку в том же кадре, файл иногда
      // приходит нулевого размера.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      console.error('Ошибка скачивания перехода:', e);
      alert(`Не удалось скачать переход: ${e.message || e}`);
    } finally {
      setBumperDownloading(false);
    }
  };

  const handleBumperSlotSelect = (slot) => {
    const live = activeStaticOverlay === 'bumper';

    // В эфире клик по уже играющему слоту не делает ничего. Снимать выбор прямо
    // во время рекламы означало бы оборвать ролик и уйти в голый переход — а
    // жест «ткнул в то, что и так идёт» такого не подразумевает. Чтобы убрать
    // заставку из эфира, есть сама плитка.
    if (live && slot === bumperSlot) return;

    // Вне эфира повторный клик по выбранному слоту снимает выбор — остаётся
    // чистый переход, которым режиссёр прикрывает переключение сцены в OBS.
    const next = slot === bumperSlot ? null : slot;
    setBumperSlot(next);

    // Переключение прямо в эфире перезапускает титр с новым содержимым: ролик
    // прошлого слота останавливается, новый заходит своим переходом.
    if (live) {
      toggleStaticOverlay('bumper', { slot: next, outro: bumperOutro, startedAt: Date.now() }, true);
    }
  };

  const [rosterSwitchSecs, setRosterSwitchSecs] = useState(8);
  const handleRosterStepper = (newSecs) => { setRosterSwitchSecs(newSecs); persistParams({ rosterSwitch: newSecs }); if (activeStaticOverlay === 'team_roster') toggleStaticOverlay('team_roster', { switchDuration: newSecs }, true); };
  const handleRosterToggle = () => { activeStaticOverlay !== 'team_roster' ? toggleStaticOverlay('team_roster', { switchDuration: rosterSwitchSecs }) : toggleStaticOverlay('team_roster'); };

  const [leadersSwitchSecs, setLeadersSwitchSecs] = useState(7);
  const handleLeadersStepper = (newSecs) => { setLeadersSwitchSecs(newSecs); persistParams({ leadersSwitch: newSecs }); if (activeStaticOverlay === 'team_leaders') toggleStaticOverlay('team_leaders', { switchDuration: newSecs }, true); };
  const handleLeadersToggle = () => { activeStaticOverlay !== 'team_leaders' ? toggleStaticOverlay('team_leaders', { switchDuration: leadersSwitchSecs }) : toggleStaticOverlay('team_leaders'); };

  const [arenaDurationSecs, setArenaDurationSecs] = useState(10);
  const handleArenaStepper = (newSecs) => { setArenaDurationSecs(newSecs); persistParams({ arenaDuration: newSecs }); if (activeStaticOverlay === 'arena') toggleStaticOverlay('arena', { displayDuration: newSecs }, true); };
  const handleArenaToggle = () => { activeStaticOverlay !== 'arena' ? toggleStaticOverlay('arena', { displayDuration: arenaDurationSecs }) : toggleStaticOverlay('arena'); };

  const [commentatorDurationSecs, setcommentatorDurationSecs] = useState(10);
  const handleCommentatorStepper = (newSecs) => { setcommentatorDurationSecs(newSecs); persistParams({ commentatorDuration: newSecs }); if (activeStaticOverlay === 'commentator') toggleStaticOverlay('commentator', { displayDuration: newSecs }, true); };
  const handleCommentatorToggle = () => { activeStaticOverlay !== 'commentator' ? toggleStaticOverlay('commentator', { displayDuration: commentatorDurationSecs }) : toggleStaticOverlay('commentator'); };

  const [refereesDurationSecs, setRefereesDurationSecs] = useState(10);
  const handleRefereesStepper = (newSecs) => { setRefereesDurationSecs(newSecs); persistParams({ refereesDuration: newSecs }); if (activeStaticOverlay === 'referees') toggleStaticOverlay('referees', { displayDuration: newSecs }, true); };
  const handleRefereesToggle = () => { activeStaticOverlay !== 'referees' ? toggleStaticOverlay('referees', { displayDuration: refereesDurationSecs }) : toggleStaticOverlay('referees'); };

  useEffect(() => {
    let timer;
    if (activeStaticOverlay === 'arena') timer = setTimeout(() => toggleStaticOverlay('arena'), arenaDurationSecs * 1000);
    else if (activeStaticOverlay === 'commentator') timer = setTimeout(() => toggleStaticOverlay('commentator'), commentatorDurationSecs * 1000);
    else if (activeStaticOverlay === 'referees') timer = setTimeout(() => toggleStaticOverlay('referees'), refereesDurationSecs * 1000);
    // Заставка снимается сама: длительность считается от ролика, а не задаётся
    // руками — режиссёр загрузил файл, панель знает его длину.
    else if (activeStaticOverlay === 'bumper') timer = setTimeout(() => toggleStaticOverlay('bumper'), bumperTotalSecs * 1000);
    return () => clearTimeout(timer);
  }, [activeStaticOverlay, arenaDurationSecs, commentatorDurationSecs, refereesDurationSecs, bumperTotalSecs, toggleStaticOverlay]);

  const getOverlayPayload = (type) => {
    // scorebar сюда не попадает намеренно: у табло по центру нет настраиваемых
    // параметров, все данные оно берёт из живого состояния матча.
    if (type === 'prematch') return { isPaused: !isPrematchRunning, timeLeft: prematchTimeLeft, endTime: isPrematchRunning ? Date.now() + prematchTimeLeft * 1000 : null };
    if (type === 'intermission') return { isPaused: !isIntermissionRunning, timeLeft: intermissionTimeLeft, endTime: isIntermissionRunning ? Date.now() + intermissionTimeLeft * 1000 : null };
    if (type === 'team_roster') return { switchDuration: rosterSwitchSecs };
    if (type === 'team_leaders') return { switchDuration: leadersSwitchSecs };
    if (type === 'arena') return { displayDuration: arenaDurationSecs };
    if (type === 'commentator') return { displayDuration: commentatorDurationSecs };
    if (type === 'referees') return { displayDuration: refereesDurationSecs };
    if (type === 'bumper') return { slot: bumperHasVideo ? bumperSlot : null, outro: bumperOutro, startedAt: Date.now() };
    return null;
  };

  // ==========================================
  // ЛОГИКА DRAG & DROP (АВТОПИЛОТ)
  // ==========================================
  
  // playlistSteps теперь живёт в хуке (централизованно, с восстановлением из БД)
  const [activeDragId, setActiveDragId] = useState(null);
  const [activeDragData, setActiveDragData] = useState(null);

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { 
    activationConstraint: { delay: 300, tolerance: 5 } 
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragStart = (e) => {
    if (navigator.vibrate) navigator.vibrate(50);
    setActiveDragId(e.active.id);
    setActiveDragData(e.active.data.current);
    // Плашку тащат в плейлист — сразу открываем вкладку автопилота (и саму колонку,
    // если она убрана), иначе ронять её некуда: зоны дропа на экране нет.
    if (e.active.data.current?.isSource) { setAsideOpen(true); setActiveTab('autopilot'); }
  };

  const handleDragEnd = (e) => {
    setActiveDragId(null);
    setActiveDragData(null);
    const { active, over } = e;
    
    if (!over) return; 

    const isSourceItem = active.data.current?.isSource; 
    const isPlaylistItem = active.data.current?.type === 'playlist-item'; 

    if (isSourceItem) {
        if (over.id === 'playlist-container' || over.data.current?.type === 'playlist-item') {
            const uniqueId = `item-${Date.now()}`;
            const newItem = { id: uniqueId, type: active.data.current.type, label: active.data.current.label };
            
            if (over.id === 'playlist-container') {
                setPlaylistSteps(prev => [...prev, newItem]);
            } else {
                const overIndex = playlistSteps.findIndex(s => s.id === over.id);
                setPlaylistSteps(prev => {
                    const newSteps = [...prev];
                    newSteps.splice(overIndex, 0, newItem);
                    return newSteps;
                });
            }
        }
    } else if (isPlaylistItem) {
        if (active.id !== over.id && over.data.current?.type === 'playlist-item') {
            const oldIndex = playlistSteps.findIndex(s => s.id === active.id);
            const newIndex = playlistSteps.findIndex(s => s.id === over.id);
            setPlaylistSteps(prev => arrayMove(prev, oldIndex, newIndex));
        }
    }
  };

  // ==========================================

  const gameStaffArray = useMemo(() => {
    if (!game?.officials) return [];
    return Object.entries(game.officials).filter(([role, off]) => off && off.id).map(([role, off]) => ({ user_id: off.id, role }));
  }, [game]);

  const canAccessGraphics = checkAccess('MATCH_WEB_GRAPHICS_PANEL', { gameStaff: gameStaffArray });

  if (!game || !authUser) return <div className="min-h-screen bg-gray-bg-light flex items-center justify-center font-bold text-xl uppercase tracking-widest text-graphite-light">Загрузка...</div>;
  if (!canAccessGraphics) return <div className="min-h-screen bg-gray-bg-light flex items-center justify-center px-10"><AccessFallback variant="full" message="У вас нет прав для управления веб-графикой матча." /></div>;

  const formatTime = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  // Живой счёт на лице плитки «Табло». Один и тот же в обоих режимах: счёт нужен
  // режиссёру постоянно и не зависит от того, какое табло выбрано для эфира.
  const scoreFace = (
    <ScoreboardFace
      game={game}
      currentPeriod={currentPeriod}
      isTimerRunning={isTimerRunning}
      activePenalties={activePenalties}
      timerSeconds={timerSeconds}
      periodLength={periodLength}
      otLength={otLength}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      // Плейлист появляется на экране уже ПОСЛЕ начала перетаскивания (вкладка
      // автопилота открывается в onDragStart), поэтому зоны дропа нужно мерить
      // всё время: измеренные один раз, они остались бы нулевыми.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <div className="h-screen w-full bg-gray-bg-light text-graphite font-sans flex flex-col overflow-hidden relative">
        <main className="flex-1 flex w-full h-full min-h-0">

          {/* Рейка панели. Шапки у панели нет — плитки держат весь экран без
              прокрутки, и полоса сверху съела бы их высоту. Рейка забирает 48 px
              ширины, которых у плиток в избытке, и даёт кнопкам постоянное место:
              раньше «назад» висела прямо над углом первой карточки. */}
          <nav className="w-12 shrink-0 h-full flex flex-col items-center py-3 border-r border-graphite/10 bg-[#d3d7dc]">
            <button
              onClick={() => navigate(`/games/${gameId}`)}
              title="Вернуться на страницу матча"
              aria-label="Вернуться на страницу матча"
              className="w-9 h-9 rounded-full bg-white border border-graphite/10 shadow-sm flex items-center justify-center text-graphite-light hover:text-orange hover:border-orange/40 transition-colors"
            >
              <Icon name="chevron_left" className="w-4 h-4" />
            </button>

            {/* Выход из панели и настройки вида разведены пустотой: уходить со
                страницы матча случайно, целясь в полноэкранный режим, незачем. */}
            <div className="h-14 shrink-0" />

            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
              aria-pressed={isFullscreen}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                isFullscreen ? 'bg-white text-orange shadow-sm' : 'text-graphite/45 hover:text-orange hover:bg-white/70'
              }`}
            >
              <Icon name={isFullscreen ? 'fullscreen_exit' : 'fullscreen'} className="w-5 h-5" />
            </button>

            {/* Убранная колонка не должна прятать то, что идёт в эфир: пока за ней
                крутится автопилот или играет звук, вместо иконки панели горит
                восклицательный знак. Иначе режиссёр просто не видит, что музыка
                играет, а плашки сменяют друг друга сами. */}
            <button
              onClick={() => setAsideOpen(o => !o)}
              title={asideHiddenActivity
                ? `Показать правую колонку — там ${asideHiddenActivity}`
                : asideOpen ? 'Скрыть правую колонку' : 'Показать правую колонку'}
              aria-pressed={asideOpen}
              className={`mt-2 w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                asideHiddenActivity ? 'bg-orange/15 text-orange animate-pulse'
                  : asideOpen ? 'text-graphite/45 hover:text-orange hover:bg-white/70'
                  : 'bg-white text-orange shadow-sm'
              }`}
            >
              <Icon name={asideHiddenActivity ? 'alert' : 'panel_right'} className="w-5 h-5" />
            </button>
          </nav>

          <section className="relative flex-1 h-full flex flex-col min-h-0 bg-[#dcdfe3]">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-3 grid-rows-2 gap-4 p-4 h-full min-h-[560px] w-full">

                {/* ТАБЛО: компактное в углу кадра и широкое по центру — две
                    независимые кнопки. Пока широкое в эфире, компактное прячется
                    само, счёт не дублируется. Изнанки у плитки нет: счёт, период и
                    штрафы берутся из матча, настраивать нечего — поэтому и
                    шестерёнка на полосах не появляется. */}
                <BroadcastTile
                  modes={[
                    {
                      key: 'scoreboard',
                      title: 'Табло',
                      dragType: null,               // компактное табло — не плашка, автопилот его не крутит
                      isLive: isScoreboardVisible,
                      grow: 1.6,                    // полосе шире: в ней живой счёт, а не одна строка
                      onAir: toggleScoreboard,
                      airTitle: isScoreboardVisible ? 'Нажмите, чтобы убрать табло из угла кадра' : 'Нажмите, чтобы вернуть табло в угол кадра',
                      front: scoreFace,
                    },
                    {
                      key: 'scorebar',
                      title: 'Табло по центру',
                      dragType: 'scorebar',
                      isLive: activeStaticOverlay === 'scorebar',
                      onAir: takeAir(handleScoreBarToggle),
                      front: <TileHint>Широкий счёт внизу кадра</TileHint>,
                    },
                  ]}
                />

                {/* ОТСЧЁТЫ до матча и до конца перерыва. Минуты и старт — на изнанке,
                    у каждого свои: 10 минут предматчевой и 2 минуты перерыва. */}
                <BroadcastTile
                  modes={[
                    {
                      key: 'prematch',
                      title: 'До матча',
                      dragType: 'prematch',
                      isLive: activeStaticOverlay === 'prematch',
                      onAir: takeAir(handlePrematchToggle),
                      front: <TileTimerFace display={formatTime(prematchTimeLeft)} isRunning={isPrematchRunning} isCritical={isPrematchRunning && prematchTimeLeft <= 60} />,
                      back: (
                        <TileTimerSettings
                          display={formatTime(prematchTimeLeft)}
                          isRunning={isPrematchRunning}
                          isCritical={isPrematchRunning && prematchTimeLeft <= 60}
                          onStart={handlePrematchStart}
                          onPause={handlePrematchPause}
                          mins={prematchMins}
                          onMinsChange={handlePrematchStepper}
                        />
                      ),
                    },
                    {
                      key: 'intermission',
                      title: 'Перерыв',
                      dragType: 'intermission',
                      isLive: activeStaticOverlay === 'intermission',
                      onAir: takeAir(handleIntermissionToggle),
                      front: <TileTimerFace display={formatTime(intermissionTimeLeft)} isRunning={isIntermissionRunning} isCritical={isIntermissionRunning && intermissionTimeLeft <= 60} />,
                      back: (
                        <TileTimerSettings
                          display={formatTime(intermissionTimeLeft)}
                          isRunning={isIntermissionRunning}
                          isCritical={isIntermissionRunning && intermissionTimeLeft <= 60}
                          onStart={handleIntermissionStart}
                          onPause={handleIntermissionPause}
                          mins={intermissionMins}
                          onMinsChange={handleIntermissionStepper}
                        />
                      ),
                    },
                  ]}
                />

                {/* ПРЕДСТАВЛЕНИЯ: арена, комментатор и судьи. Все трое снимаются
                    сами по своему таймеру, поэтому у каждого свой «показ». */}
                <BroadcastTile
                  modes={[
                    {
                      key: 'arena',
                      title: 'Арена',
                      dragType: 'arena',
                      isLive: activeStaticOverlay === 'arena',
                      onAir: takeAir(handleArenaToggle),
                      progress: { duration: arenaDurationSecs },
                      front: <TileHint>Показ: {arenaDurationSecs} с</TileHint>,
                      back: <TileStepperSetting label="Показ (сек)" value={arenaDurationSecs} min={3} max={60} onChange={handleArenaStepper} />,
                    },
                    {
                      key: 'commentator',
                      title: 'Комментаторы',
                      dragType: 'commentator',
                      isLive: activeStaticOverlay === 'commentator',
                      onAir: takeAir(handleCommentatorToggle),
                      progress: { duration: commentatorDurationSecs },
                      front: <TileHint>Показ: {commentatorDurationSecs} с</TileHint>,
                      back: <TileStepperSetting label="Показ (сек)" value={commentatorDurationSecs} min={3} max={60} onChange={handleCommentatorStepper} />,
                    },
                    {
                      key: 'referees',
                      title: 'Судьи',
                      dragType: 'referees',
                      isLive: activeStaticOverlay === 'referees',
                      onAir: takeAir(handleRefereesToggle),
                      progress: { duration: refereesDurationSecs },
                      front: <TileHint>Показ: {refereesDurationSecs} с</TileHint>,
                      back: <TileStepperSetting label="Показ (сек)" value={refereesDurationSecs} min={3} max={60} onChange={handleRefereesStepper} />,
                    },
                  ]}
                />

                <BroadcastTile
                  modes={[
                    {
                      key: 'team_leaders',
                      title: 'Лидеры',
                      dragType: 'team_leaders',
                      isLive: activeStaticOverlay === 'team_leaders',
                      onAir: takeAir(handleLeadersToggle),
                      front: <TileHint>Показатель меняется каждые {leadersSwitchSecs} с</TileHint>,
                      back: <TileStepperSetting label="Смена показателя (сек)" value={leadersSwitchSecs} min={3} max={30} onChange={handleLeadersStepper} />,
                    },
                  ]}
                />

                <BroadcastTile
                  modes={[
                    {
                      key: 'team_roster',
                      title: 'Составы',
                      dragType: 'team_roster',
                      isLive: activeStaticOverlay === 'team_roster',
                      onAir: takeAir(handleRosterToggle),
                      front: <TileHint>Команда меняется каждые {rosterSwitchSecs} с</TileHint>,
                      back: <TileStepperSetting label="Смена команды (сек)" value={rosterSwitchSecs} min={3} max={30} onChange={handleRosterStepper} />,
                    },
                  ]}
                />

                {/* ЗАСТАВКА: ролики, сборка перехода и обрамление — на изнанке,
                    на лице только то, что уйдёт в эфир по нажатию. */}
                <BroadcastTile
                  modes={[
                    {
                      key: 'bumper',
                      title: 'Заставка',
                      dragType: bumperTransition ? 'bumper' : null,
                      isLive: activeStaticOverlay === 'bumper',
                      onAir: takeAir(handleBumperToggle),
                      airDisabled: !bumperTransition || (activeStaticOverlay !== 'bumper' && bumperWarming),
                      airTitle: !bumperTransition
                        ? 'Соберите переход в настройках плитки, чтобы заставка стала доступна'
                        : activeStaticOverlay === 'bumper' ? 'Заставка в эфире — нажмите, чтобы убрать'
                        : bumperWarming ? `Ролик ещё качается в оверлей — ${Math.round((bumperWarm.progress || 0) * 100)} %`
                        : 'Нажмите, чтобы вывести в эфир',
                      progress: { duration: bumperFullSecs, startedAt: liveBumper?.startedAt || 0, runId: liveBumper?.startedAt || 0 },
                      front: <BumperFront ready={!!bumperTransition} slots={bumperSlots} activeSlot={bumperSlot} outro={bumperOutro} warmup={bumperWarmup} />,
                      back: (
                        <BumperBack
                          ready={!!bumperTransition}
                          canBuild={!!bumperExportSupport?.supported}
                          isLive={activeStaticOverlay === 'bumper'}
                          warmup={bumperWarmup}
                          slots={bumperSlots}
                          activeSlot={bumperSlot}
                          onSelectSlot={handleBumperSlotSelect}
                          onGenerate={handleBumperGenerate}
                          onDownload={handleBumperDownload}
                          exporting={bumperExporting}
                          exportProgress={bumperExportProgress}
                          downloading={bumperDownloading}
                          outro={bumperOutro}
                          onOutroChange={handleBumperOutroToggle}
                        />
                      ),
                    },
                  ]}
                />

              </div>
            </div>
          </section>

          {asideOpen && (
          <aside className="w-[28%] h-full flex flex-col min-h-0 overflow-hidden border-l border-graphite/5 bg-[#e8e8e8ff]">
            <button
              onClick={handleForceResync}
              className={`shrink-0 flex items-center justify-center gap-2 px-4 py-4 border-b border-graphite/10 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                overlayMismatch && !resyncSent ? 'bg-amber-400/10 hover:bg-amber-400/20' : 'bg-white hover:bg-graphite/5'
              }`}
              title="Заставить все OBS-оверлеи заново подключиться и перечитать состояние с сервера"
            >
              {resyncSent ? (
                <span className="text-status-accepted">Отправлено ✓</span>
              ) : overlayMismatch ? (
                <>
                  <span className="w-2 h-2 rounded-full shrink-0 bg-amber-400 animate-pulse" />
                  <span className="text-amber-500">Рассинхрон — синхронизировать</span>
                </>
              ) : (
                <>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    overlayCount === null ? 'bg-graphite/20' :
                    overlayCount === 0    ? 'bg-red-400' :
                                           'bg-green-400'
                  }`} />
                  <span className={
                    overlayCount === null ? 'text-graphite/40' :
                    overlayCount === 0    ? 'text-red-400' :
                                           'text-graphite/70'
                  }>
                    {overlayCount === null && 'Нет данных об оверлее'}
                    {overlayCount === 0    && 'Оверлей не подключён'}
                    {overlayCount > 0      && `● ${overlayCount} оверле${overlayCount === 1 ? 'й' : 'я'} онлайн`}
                  </span>
                </>
              )}
            </button>
            <PanelTabs
              active={activeTab}
              onChange={setActiveTab}
              tabs={[
                { key: 'autopilot', label: 'Автопилот', title: 'Автопилот графики', indicator: autopilotRunning },
                // Вкладка горит, пока интро или озвучка составов идут в эфир:
                // свёрнутый виджет раньше прятал включённое интро от режиссёра.
                { key: 'audio', label: 'Аудио', title: 'Интро и озвучка составов', indicator: introPlaying || audioSource === 'roster' },
                { key: 'events', label: 'События', title: 'События матча' },
              ]}
            />

            <div className="flex-1 min-h-0">
              {activeTab === 'autopilot' && (
                <AutoPlaylistWidget
                  steps={playlistSteps}
                  setSteps={setPlaylistSteps}
                  duration={autopilotDuration}
                  setDuration={setAutopilotDuration}
                  isLoop={autopilotLoop}
                  setIsLoop={setAutopilotLoop}
                  isRunning={autopilotRunning}
                  currentIndex={autopilotIndex}
                  onStart={handleStartAutopilot}
                  onStop={stopAutopilotServer}
                />
              )}

              {activeTab === 'audio' && (
                <AudioPlayerWidget gameId={gameId} socket={socket} audioPlaying={audioPlaying} audioSource={audioSource} introPlaying={introPlaying} setIntroPlaying={setIntroPlaying} persistParams={persistParams} />
              )}

              {activeTab === 'events' && (
                <GameEventsWidget
                  events={events}
                  game={game}
                  periodLength={periodLength}
                  broadcastedEvents={broadcastedEvents}
                  activeEventOverlay={activeEventOverlay}
                  triggerOverlay={triggerOverlay}
                  getEventSignature={getEventSignature}
                  autoShowSettings={autoShowSettings}
                  updateAutoShowSettings={updateAutoShowSettings}
                  ttsEvents={ttsEvents}
                  updateTtsEvents={updateTtsEvents}
                />
              )}
            </div>
          </aside>
          )}
        </main>
      </div>

      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeDragData ? (
          activeDragData.isSource ? (
            <div className="w-[160px] p-3 bg-white/90 backdrop-blur-md border-2 border-status-accepted rounded-md shadow-2xl scale-105 flex items-center justify-center opacity-90">
               <span className="text-[12px] font-black uppercase tracking-widest text-status-accepted">{activeDragData.label}</span>
            </div>
          ) : (
            <div className="w-[250px] bg-white border-2 border-status-accepted rounded-md p-2 shadow-2xl scale-105 flex items-center gap-2 opacity-90">
               <span className="text-[11px] font-bold uppercase tracking-wider text-status-accepted truncate">
                 {activeDragData.step.label}
               </span>
            </div>
          )
        ) : null}
      </DragOverlay>

    </DndContext>
  );
}