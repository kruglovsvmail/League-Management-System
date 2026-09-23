import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Switch } from '../ui/Switch';
import { Stepper } from '../ui/Stepper';
import { Icon } from '../ui/Icon';
import { getToken } from '../utils/helpers';

// Тумблер → файлы, наличие хотя бы одного из которых на S3 обязательно для включения.
// Голосу файлы не обязательны: голы и штрафы озвучиваются синтезом, а вместо
// предупреждения без файла прозвучит бип.
const ARENA_TOGGLE_FILES = {
  endSiren: ['end.mp3'],
};

// Прежние отдельные флаги голоса — теперь это один тумблер `voice`.
const LEGACY_VOICE_KEYS = ['warn1min', 'warn2min', 'periodWarnings', 'goalAnnounce'];

export function TimerSettingsDrawer({
  isOpen,
  onClose,
  periodsCount,
  setPeriodsCount,
  periodLength,
  setPeriodLength,
  otLength,
  setOtLength,
  soLength,
  setSoLength,
  warmupLength,
  setWarmupLength,
  breakLength,
  setBreakLength,
  autoStopOnEvent,
  setAutoStopOnEvent,
  arenaAnnouncer,
  setArenaAnnouncer,
  gameId,
  setToast,
  onResetAnnouncer,
  trackTimerLog = false,
}) {
  const filesCacheRef = useRef(null);
  const [isDownloadingLog, setIsDownloadingLog] = useState(false);

  // Эндпоинт закрыт токеном, поэтому тянем через fetch и отдаём blob ссылке,
  // а не подставляем URL в href напрямую.
  const downloadTimerLog = async () => {
    setIsDownloadingLog(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/timer-log/export`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timer-log-game-${gameId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast?.({ title: 'Ошибка', message: 'Не удалось скачать журнал таймера', type: 'error' });
    } finally {
      setIsDownloadingLog(false);
    }
  };

  const fetchArenaFiles = async () => {
    if (filesCacheRef.current) return filesCacheRef.current;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/arena-audio-files`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) filesCacheRef.current = data.files;
      return data.files || {};
    } catch {
      return {};
    }
  };

  // Голос диктора — один тумблер: либо диктор говорит (конец периода, голы, штрафы), либо
  // молчит. Матч, настроенный раньше, хранит прежние флаги по отдельности: голос включён,
  // если был включён любой, а при первом же изменении они сворачиваются в один.
  const voiceOn = arenaAnnouncer.voice ?? LEGACY_VOICE_KEYS.some(k => !!arenaAnnouncer[k]);

  const updateArenaAnnouncer = (patch) => {
    const next = { ...arenaAnnouncer, voice: voiceOn, ...patch };
    LEGACY_VOICE_KEYS.forEach(k => { delete next[k]; });
    setArenaAnnouncer(next);
  };

  const handleArenaToggle = async (key, checked) => {
    if (!checked) {
      updateArenaAnnouncer({ [key]: false });
      return;
    }
    const required = ARENA_TOGGLE_FILES[key];
    if (required && gameId) {
      const files = await fetchArenaFiles();
      const hasAny = required.some(f => files[f]);
      if (!hasAny) {
        setToast?.({ title: 'Нет аудиофайла на сервере', message: 'У лиги не загружен звук для этой озвучки. Звуки загружает глобальный администратор: Команды → Лиги.', type: 'error' });
        return;
      }
    }
    updateArenaAnnouncer({ [key]: true });
  };
  const drawerContent = (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>

      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className={`absolute top-0 right-0 h-full w-[720px] max-w-full bg-[#F8F9FA] transform transition-transform duration-300 ease-out flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-[18px] text-graphite uppercase tracking-wide">Настройки матча</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-5 custom-scrollbar">
          <div className="grid grid-cols-2 gap-5 items-start">

            {/* ── КОЛ 1: СТРУКТУРА МАТЧА + ПОВЕДЕНИЕ ТАЙМЕРА ── */}
            <div className="flex flex-col gap-5">

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="clock" className="w-4 h-4 text-graphite/40" />
                  <span className="text-[11px] font-black text-graphite/40 uppercase tracking-widest">Структура матча</span>
                </div>
                <div className="bg-white border border-graphite/5 shadow-sm rounded-md">
                  <div className="flex justify-between items-center px-5 py-3">
                    <span className="text-[13px] font-bold text-graphite">Кол-во периодов</span>
                    <Stepper initialValue={periodsCount ?? 1} min={1} max={10} onChange={setPeriodsCount} />
                  </div>

                  <div className="flex justify-between items-center px-5 py-3 border-t border-graphite/5">
                    <span className="text-[13px] font-bold text-graphite">Длительность (мин)</span>
                    <Stepper initialValue={periodLength ?? 1} min={1} max={99} onChange={setPeriodLength} />
                  </div>

                  {/* Разминка и перерыв — этапы карусели на панели; 0 — этапа нет */}
                  <div className="flex justify-between items-center px-5 py-3 border-t border-graphite/5" title="0 — без разминки: матч открывается сразу на 1-м периоде">
                    <span className="text-[13px] font-bold text-graphite">Разминка (мин)</span>
                    <Stepper initialValue={warmupLength ?? 0} min={0} max={60} onChange={setWarmupLength} />
                  </div>

                  <div className="flex justify-between items-center px-5 py-3 border-t border-graphite/5" title="Между периодами и перед овертаймом. 0 — без перерывов">
                    <span className="text-[13px] font-bold text-graphite">Перерыв (мин)</span>
                    <Stepper initialValue={breakLength ?? 0} min={0} max={60} onChange={setBreakLength} />
                  </div>

                  <div className="border-t border-graphite/5 px-5 py-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] font-bold text-graphite">Овертайм</span>
                      <Switch checked={otLength > 0} onChange={(e) => setOtLength(e.target.checked ? 5 : 0)} />
                    </div>
                    {otLength > 0 && (
                      <div className="flex justify-between items-center mt-3 pl-4 border-l-2 border-orange/20 animate-zoom-in">
                        <span className="text-[12px] text-graphite-light font-semibold">Длительность ОТ</span>
                        <Stepper initialValue={otLength ?? 1} min={1} max={99} onChange={setOtLength} />
                      </div>
                    )}
                  </div>

                  <div className="border-t border-graphite/5 px-5 py-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] font-bold text-graphite">Серия буллитов</span>
                      <Switch checked={soLength > 0} onChange={(e) => setSoLength(e.target.checked ? 3 : 0)} />
                    </div>
                    {soLength > 0 && (
                      <div className="flex justify-between items-center mt-3 pl-4 border-l-2 border-orange/20 animate-zoom-in">
                        <span className="text-[12px] text-graphite-light font-semibold">Мин. бросков</span>
                        <Stepper initialValue={soLength ?? 1} min={1} max={99} onChange={setSoLength} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="stopwatch" className="w-4 h-4 text-graphite/40" />
                  <span className="text-[11px] font-black text-graphite/40 uppercase tracking-widest">Поведение таймера</span>
                </div>
                <div className="bg-white border border-graphite/5 shadow-sm rounded-md px-5 py-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-graphite">Автостоп таймера</span>
                    <Switch checked={autoStopOnEvent} onChange={(e) => setAutoStopOnEvent(e.target.checked)} />
                  </div>
                  <p className="text-[11px] text-graphite-light mt-2 leading-relaxed">
                    Автоматически останавливать сквозное время при добавлении гола, удаления или тайм-аута.
                  </p>
                </div>
              </div>

            </div>

            {/* ── КОЛ 2: ДИКТОР АРЕНЫ ── */}
            <div className="flex flex-col gap-5">

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="mic" className="w-4 h-4 text-graphite/40" />
                  <span className="text-[11px] font-black text-graphite/40 uppercase tracking-widest">Диктор арены</span>
                </div>
                <div className="bg-white border border-graphite/5 shadow-sm rounded-md">

                  <div
                    className="px-4 py-2.5 flex justify-between items-center gap-3 border-b border-graphite/5"
                    title="Голосом: за минуту до конца каждого периода и за две до конца последнего, голы и штрафы. Если голос выключен или у лиги нет файла предупреждения, за 5 секунд до этого звучит бип — когда он загружен у лиги"
                  >
                    <div className="min-w-0">
                      <span className="block text-[12px] font-bold text-graphite">Голос диктора</span>
                      <span className="block text-[10px] text-graphite-light mt-0.5">Конец периода, голы и штрафы</span>
                    </div>
                    <div className="shrink-0">
                      <Switch checked={voiceOn} onChange={(e) => handleArenaToggle('voice', e.target.checked)} />
                    </div>
                  </div>

                  {voiceOn && (
                    <div className="px-4 py-2.5 flex items-center gap-4 border-b border-graphite/5">
                      <div className="flex flex-col items-center gap-1" title="Реальное время: пауза после гола ждёт фиксированное число секунд независимо от таймера матча">
                        <span className="text-[9px] text-graphite/40 font-bold uppercase">Задержка (Р)</span>
                        <Stepper initialValue={arenaAnnouncer.goalDelay ?? 5} min={1} max={30} onChange={(v) => updateArenaAnnouncer({ goalDelay: v })} />
                      </div>
                      <div className="flex flex-col items-center gap-1" title="Игровой таймер: если автора/причину назначили спустя это время ХОДА МАТЧА — не озвучиваем">
                        <span className="text-[9px] text-graphite/40 font-bold uppercase">Актуальность (Т)</span>
                        <Stepper initialValue={arenaAnnouncer.goalExpiry ?? 40} min={10} max={120} onChange={(v) => updateArenaAnnouncer({ goalExpiry: v })} />
                      </div>
                    </div>
                  )}

                  <div className="px-4 py-2.5 flex justify-between items-center border-b border-graphite/5">
                    <span className="text-[12px] font-bold text-graphite">Сирена окончания периода</span>
                    <Switch checked={arenaAnnouncer.endSiren} onChange={(e) => handleArenaToggle('endSiren', e.target.checked)} />
                  </div>

                  {onResetAnnouncer && (
                    <div className="px-4 py-2.5">
                      <button
                        onClick={() => { onResetAnnouncer(); setToast?.({ title: 'Диктор обновлён', message: 'Очередь и повторы озвучки сброшены.', type: 'success' }); }}
                        className="w-full text-[11px] font-bold text-orange border border-orange/30 rounded-md py-1.5 hover:bg-orange/10 transition-colors"
                      >
                        Обновить диктора
                      </button>
                    </div>
                  )}

                </div>
              </div>

              {/* Журнал таймера — только если лига включила контроль у дивизиона.
                  Скачивается CSV: время устройства секретаря, действие, показание таймера. */}
              {trackTimerLog && (
                <div className="bg-white rounded-md border border-graphite/10 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-graphite/10">
                    <span className="text-[11px] font-black uppercase tracking-wider text-graphite/50">Лог таймера</span>
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-2">
                    <p className="text-[11px] text-graphite-light leading-tight">
                      Все старты, остановки и корректировки времени по этому матчу. Время серверное,
                      показано в часовом поясе арены.
                    </p>
                    <button
                      onClick={downloadTimerLog}
                      disabled={isDownloadingLog}
                      className="w-full flex items-center justify-center gap-2 text-[11px] font-bold text-orange border border-orange/30 rounded-md py-1.5 hover:bg-orange/10 disabled:opacity-50 transition-colors"
                    >
                      <Icon name="download" className="w-3.5 h-3.5" />
                      {isDownloadingLog ? 'Готовим файл...' : 'Скачать журнал'}
                    </button>
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
