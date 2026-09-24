import React, { useState, useEffect, useRef } from 'react';
import { getToken } from '../utils/helpers';
import { Icon } from '../ui/Icon';
import { SegmentButton } from '../ui/SegmentButton';
import { ConfirmModal } from '../modals/ConfirmModal';

/**
 * Блок «Диктор арены» на вкладке «Лиги» раздела «Команды» (только глобальный админ).
 *
 * Звуки, которые панель секретаря играет на арене, и когда звучит бип. Файлы уходят в S3
 * под постоянными именами (см. arenaAssetsController.js), сценарий бипа — в
 * leagues.arena_beep_schedule, бип перед концом периода и удаления — в leagues.arena_beep_*.
 * Всё это общее для всех дивизионов лиги. Голос и сирену секретарь включает в настройках
 * матча, бип отдельного тумблера не имеет: есть файл — звучит.
 */

const API = import.meta.env.VITE_API_URL;
const MAX_MB = 10;

// В порядке, в каком их слышно по ходу матча. Имя файла подписываем мелко: под ним
// звук лежит в хранилище, и по нему его ищет сервер диктора.
const SOUNDS = [
  { file: 'left-1min-1.mp3', title: 'Минута до конца 1-го периода' },
  { file: 'left-1min-2.mp3', title: 'Минута до конца 2-го периода' },
  { file: 'left-2min.mp3', title: 'Две минуты до конца последнего периода' },
  { file: 'end.mp3', title: 'Сирена', hint: 'конец периода и овертайма' },
  { file: 'beep.mp3', title: 'Бип', hint: 'перед концом периода и удаления, по сценарию' },
];

// Пока настройки не пришли с сервера — все бипы «перед концом» выключены
const NO_BEEP_LEADS = { beforePeriodEnd: null, beforeLastPeriodEnd: null, beforePenaltyEnd: null, always: false };

const PERIODS = ['1', '2', '3'];

const formatMark = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

// «5:00», «10:30» или просто минуты — «5». Точку и запятую тоже принимаем за двоеточие:
// их чаще набирают на цифровой клавиатуре.
const parseMark = (text) => {
  const m = text.trim().match(/^(\d{1,2})(?:[:.,](\d{2}))?$/);
  if (!m) return null;
  const secs = m[2] === undefined ? 0 : Number(m[2]);
  if (secs > 59) return null;
  return Number(m[1]) * 60 + secs;
};

const iconButton = 'shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors';
const timeInput = 'w-[64px] bg-gray-bg-light border border-gray-light rounded-md px-2 py-1 text-[12px] font-bold text-graphite text-center tabular-nums focus:bg-white focus:outline-none focus:border-orange/50';

// Одно время «за сколько до конца». Сохраняется, когда поле теряет фокус или по Enter;
// пустое поле — этого бипа нет. min — ноль до конца периода не принимаем: это уже сирена.
function BeepLeadRow({ label, hint, value, min, onCommit, showToast }) {
  const shown = value === null || value === undefined ? '' : formatMark(value);
  const [draft, setDraft] = useState(shown);

  // Значение сменилось снаружи — сохранилось или откатилось после ошибки: поле за ним
  useEffect(() => { setDraft(shown); }, [shown]);

  const commit = () => {
    const text = draft.trim();
    const next = text === '' ? null : parseMark(text);
    if (text !== '' && next === null) {
      showToast?.('Не получилось прочитать время', 'Введите время до конца: 1:05, 0:30 или просто 1', 'error');
      setDraft(shown);
      return;
    }
    if (next !== null && next < min) {
      showToast?.('Слишком поздно', 'Ноль до конца периода — это уже сирена. Укажите хотя бы 0:01 или оставьте поле пустым', 'error');
      setDraft(shown);
      return;
    }
    if (next === (value ?? null)) {
      setDraft(shown);
      return;
    }
    onCommit(next);
  };

  return (
    <div className="flex items-center gap-3 py-2 border-t border-graphite/10 first:border-t-0">
      <div className="flex-1 min-w-0">
        <span className="block text-[12px] font-bold text-graphite truncate">{label}</span>
        {hint && <span className="block text-[10px] font-semibold text-graphite/40 truncate">{hint}</span>}
      </div>
      <input
        type="text"
        inputMode="numeric"
        maxLength={5}
        value={draft}
        placeholder="мм:сс"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        className={`${timeInput} shrink-0`}
      />
    </div>
  );
}

function SoundRow({ sound, state, busy, playing, onListen, onUpload, onDelete }) {
  const inputRef = useRef(null);
  const uploaded = !!state?.uploaded;

  return (
    <div className="flex items-center gap-2 py-2 border-t border-graphite/10 first:border-t-0">
      <div className="flex-1 min-w-0">
        <span className="block text-[12px] font-bold text-graphite truncate">{sound.title}</span>
        <span className="block text-[10px] font-semibold text-graphite/40 truncate">
          {sound.file}{sound.hint ? ` · ${sound.hint}` : ''}
        </span>
      </div>

      <span className="shrink-0 text-[11px] font-bold whitespace-nowrap">
        {busy
          ? <span className="text-orange">загрузка…</span>
          : uploaded
            ? <span className="text-status-accepted">загружено</span>
            : <span className="text-graphite/30">нет файла</span>}
      </span>

      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,.mp3"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(sound.file, f); e.target.value = ''; }}
      />

      <button
        onClick={() => onListen(sound.file)}
        disabled={!uploaded || busy}
        title={playing ? 'Остановить' : 'Прослушать'}
        className={`${iconButton} text-graphite/50 hover:text-orange hover:bg-orange/10 disabled:opacity-30`}
      >
        <Icon name={playing ? 'stop' : 'play'} className="w-4 h-4" />
      </button>

      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={uploaded ? 'Заменить звук' : 'Загрузить звук'}
        className={`${iconButton} text-graphite/50 hover:text-orange hover:bg-orange/10 disabled:opacity-30`}
      >
        <Icon name="upload" className="w-4 h-4" />
      </button>

      <button
        onClick={() => onDelete(sound)}
        disabled={!uploaded || busy}
        title="Удалить звук"
        className={`${iconButton} text-graphite/40 hover:text-status-rejected hover:bg-status-rejected/10 disabled:opacity-20`}
      >
        <Icon name="delete" className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ArenaAnnouncerSection({ leagueId, showToast }) {
  const [data, setData] = useState(null); // { files: { [file]: { uploaded, url } }, beepSchedule: { '1': [сек], ... }, beepLeads: { beforePeriodEnd, ..., always } }
  const [busyFile, setBusyFile] = useState(null);
  const [playingFile, setPlayingFile] = useState(null);
  const [drafts, setDrafts] = useState({ '1': '', '2': '', '3': '' });
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);
  const [isLeadsSaving, setIsLeadsSaving] = useState(false);
  // Удаление подтверждаем: исходника звука у администратора может и не остаться.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const audioRef = useRef(null);

  const authHeaders = { 'Authorization': `Bearer ${getToken()}` };
  const baseUrl = `${API}/api/leagues/${leagueId}/arena-announcer`;

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;

    fetch(baseUrl, { headers: authHeaders })
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (json.success) setData(json.data);
        else showToast?.('Ошибка', json.error, 'error');
      })
      .catch(() => { if (!cancelled) showToast?.('Ошибка', 'Сбой загрузки диктора арены', 'error'); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  // Уходим со страницы — звук не должен доигрывать поверх следующего экрана.
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const stopListening = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingFile(null);
  };

  const handleListen = (file) => {
    if (playingFile === file) { stopListening(); return; }
    const url = data?.files?.[file]?.url;
    if (!url) return;

    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingFile(file);
    // Обработчики сверяются с текущим звуком: остановленный ради другого не должен
    // сбрасывать кнопку того, что играет сейчас.
    audio.onended = () => { if (audioRef.current === audio) setPlayingFile(null); };
    audio.onerror = () => {
      if (audioRef.current !== audio) return;
      setPlayingFile(null);
      showToast?.('Ошибка', 'Не удалось проиграть звук', 'error');
    };
    audio.play().catch(() => { if (audioRef.current === audio) setPlayingFile(null); });
  };

  const setFileState = (file, state) => setData(prev => ({ ...prev, files: { ...prev.files, [file]: state } }));

  const handleUpload = async (file, picked) => {
    const isMp3 = picked.type === 'audio/mpeg' || picked.name.toLowerCase().endsWith('.mp3');
    if (!isMp3) {
      showToast?.('Нужен MP3', 'Диктор играет звуки только в формате MP3', 'error');
      return;
    }
    if (picked.size > MAX_MB * 1024 * 1024) {
      showToast?.('Файл слишком большой', `Звук должен быть не больше ${MAX_MB} МБ`, 'error');
      return;
    }

    if (playingFile === file) stopListening();
    setBusyFile(file);
    try {
      const form = new FormData();
      form.append('file', picked);
      const res = await fetch(`${baseUrl}/files/${file}`, { method: 'POST', headers: authHeaders, body: form });
      const json = await res.json();
      if (json.success) {
        setFileState(file, { uploaded: true, url: json.url });
        showToast?.('Готово', 'Звук загружен', 'success');
      } else {
        showToast?.('Ошибка', json.error || 'Не удалось загрузить звук', 'error');
      }
    } catch (err) {
      showToast?.('Ошибка', 'Не удалось загрузить звук', 'error');
    } finally {
      setBusyFile(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { file } = deleteTarget;
    setIsDeleting(true);
    try {
      const res = await fetch(`${baseUrl}/files/${file}`, { method: 'DELETE', headers: authHeaders });
      const json = await res.json();
      if (json.success) {
        if (playingFile === file) stopListening();
        setFileState(file, { uploaded: false, url: null });
        showToast?.('Готово', 'Звук удалён', 'success');
      } else {
        showToast?.('Ошибка', json.error || 'Не удалось удалить звук', 'error');
      }
    } catch (err) {
      showToast?.('Ошибка', 'Не удалось удалить звук', 'error');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Сценарий сохраняется сразу после каждой отметки — как тумблеры глобальных параметров.
  const saveSchedule = async (next) => {
    const prev = data.beepSchedule;
    setData(d => ({ ...d, beepSchedule: next }));
    setIsScheduleSaving(true);
    try {
      const res = await fetch(`${baseUrl}/beep-schedule`, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ beepSchedule: next })
      });
      const json = await res.json();
      if (json.success) {
        setData(d => ({ ...d, beepSchedule: json.beepSchedule }));
      } else {
        setData(d => ({ ...d, beepSchedule: prev }));
        showToast?.('Ошибка', json.error || 'Не удалось сохранить сценарий', 'error');
      }
    } catch (err) {
      setData(d => ({ ...d, beepSchedule: prev }));
      showToast?.('Ошибка', 'Не удалось сохранить сценарий', 'error');
    } finally {
      setIsScheduleSaving(false);
    }
  };

  const addMark = (period) => {
    const secs = parseMark(drafts[period]);
    if (secs === null) {
      showToast?.('Не получилось прочитать время', 'Введите время от начала периода: 5:00, 10:30 или просто 5', 'error');
      return;
    }
    setDrafts(d => ({ ...d, [period]: '' }));
    const marks = data.beepSchedule[period] || [];
    if (marks.includes(secs)) return;
    saveSchedule({ ...data.beepSchedule, [period]: [...marks, secs].sort((a, b) => a - b) });
  };

  const removeMark = (period, secs) => {
    saveSchedule({ ...data.beepSchedule, [period]: (data.beepSchedule[period] || []).filter(s => s !== secs) });
  };

  // Бип перед концом периода и удаления: три времени и режим уходят разом, сразу после
  // каждой правки — как и сценарий.
  const beepLeads = data?.beepLeads || NO_BEEP_LEADS;

  const saveBeepLeads = async (next) => {
    const prev = data.beepLeads;
    setData(d => ({ ...d, beepLeads: next }));
    setIsLeadsSaving(true);
    try {
      const res = await fetch(`${baseUrl}/beep-leads`, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      });
      const json = await res.json();
      if (json.success) {
        setData(d => ({ ...d, beepLeads: json.beepLeads }));
      } else {
        setData(d => ({ ...d, beepLeads: prev }));
        showToast?.('Ошибка', json.error || 'Не удалось сохранить бип', 'error');
      }
    } catch (err) {
      setData(d => ({ ...d, beepLeads: prev }));
      showToast?.('Ошибка', 'Не удалось сохранить бип', 'error');
    } finally {
      setIsLeadsSaving(false);
    }
  };

  const setLead = (key) => (secs) => saveBeepLeads({ ...beepLeads, [key]: secs });

  return (
    <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6">
      <div className="mb-5 pb-4 border-b border-graphite/10">
        <h3 className="text-[16px] font-black uppercase text-graphite tracking-wide">Диктор арены</h3>
        <p className="text-[12px] font-medium text-graphite-light mt-1">Звуки, которые панель секретаря играет на арене, и когда звучит бип. Общие для всех дивизионов лиги</p>
      </div>

      {!data ? (
        <div className="text-[11px] font-bold text-graphite/30 py-4">Загрузка…</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">

          {/* --- ЗВУКИ --- */}
          <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2">
                <Icon name="speaker" className="w-4 h-4 text-graphite/40" />
                <h4 className="text-[13px] font-black uppercase text-graphite tracking-tight">Звуки</h4>
              </div>
              <span className="text-[10px] font-bold text-graphite/30">MP3, до {MAX_MB} МБ</span>
            </div>
            <p className="text-[11px] text-graphite-light leading-relaxed mb-3">
              Нет файла — этот звук просто не прозвучит. Голос и сирену секретарь включает в настройках матча
            </p>

            <div>
              {SOUNDS.map(sound => (
                <SoundRow
                  key={sound.file}
                  sound={sound}
                  state={data.files?.[sound.file]}
                  busy={busyFile === sound.file}
                  playing={playingFile === sound.file}
                  onListen={handleListen}
                  onUpload={handleUpload}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          </div>

          {/* --- СЦЕНАРИЙ БИПА --- */}
          <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-xl p-5 shadow-sm relative">
            {(isScheduleSaving || isLeadsSaving) && (
              <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] font-bold text-orange uppercase tracking-widest animate-pulse">
                <Icon name="refresh" className="w-3 h-3 animate-spin" /> Сохранение
              </div>
            )}
            <div className="flex items-center gap-2 mb-1">
              <Icon name="clock" className="w-4 h-4 text-graphite/40" />
              <h4 className="text-[13px] font-black uppercase text-graphite tracking-tight">Сценарий бипа</h4>
            </div>
            <p className="text-[11px] text-graphite-light leading-relaxed mb-3 pr-8">
              Время от начала периода. Бип звучит в каждом матче лиги, пока идёт таймер. Отметка позже
              конца периода не наступит, а строка третьего периода не сработает там, где периодов два
            </p>

            <div>
              {PERIODS.map(period => {
                const marks = data.beepSchedule?.[period] || [];
                return (
                  <div key={period} className="flex items-start gap-3 py-2.5 border-t border-graphite/10 first:border-t-0">
                    <span className="w-[84px] shrink-0 pt-1.5 text-[11px] font-black uppercase tracking-widest text-graphite/50">{period} период</span>

                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
                      {marks.map(secs => (
                        <span key={secs} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md bg-orange/10 text-orange text-[12px] font-black tabular-nums">
                          {formatMark(secs)}
                          <button
                            onClick={() => removeMark(period, secs)}
                            disabled={isScheduleSaving}
                            title="Убрать отметку"
                            className="w-4 h-4 rounded flex items-center justify-center hover:bg-orange/20 transition-colors disabled:opacity-40"
                          >
                            <Icon name="close" className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}

                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={5}
                          value={drafts[period]}
                          placeholder="мм:сс"
                          onChange={(e) => setDrafts(d => ({ ...d, [period]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMark(period); } }}
                          className={timeInput}
                        />
                        <button
                          onClick={() => addMark(period)}
                          disabled={!drafts[period].trim() || isScheduleSaving}
                          title="Добавить отметку"
                          className={`${iconButton} text-graphite/50 hover:text-orange hover:bg-orange/10 disabled:opacity-30`}
                        >
                          <Icon name="plus" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* --- БИП ПЕРЕД КОНЦОМ ПЕРИОДА И УДАЛЕНИЯ --- */}
            <div className="mt-3 pt-3 border-t border-graphite/10">
              <span className="block text-[11px] font-black uppercase tracking-widest text-graphite/50">Бип перед концом</span>
              <p className="text-[11px] text-graphite-light leading-relaxed mt-1 mb-1">
                За сколько до конца подать бип. Пустое поле — этого бипа нет
              </p>

              <div>
                <BeepLeadRow
                  label="1-й и 2-й период"
                  hint="все, кроме последнего"
                  value={beepLeads.beforePeriodEnd}
                  min={1}
                  onCommit={setLead('beforePeriodEnd')}
                  showToast={showToast}
                />
                <BeepLeadRow
                  label="Последний период"
                  hint="в дивизионе с двумя периодами — 2-й"
                  value={beepLeads.beforeLastPeriodEnd}
                  min={1}
                  onCommit={setLead('beforeLastPeriodEnd')}
                  showToast={showToast}
                />
                <BeepLeadRow
                  label="Удаление"
                  hint="секретарю пора выпускать игрока"
                  value={beepLeads.beforePenaltyEnd}
                  min={0}
                  onCommit={setLead('beforePenaltyEnd')}
                  showToast={showToast}
                />
              </div>

              <div className="flex items-center gap-3 pt-2.5 mt-0.5 border-t border-graphite/10">
                <span className="flex-1 min-w-0 text-[12px] font-bold text-graphite">Проигрывать</span>
                <SegmentButton
                  options={['Всегда', 'Не при дикторе']}
                  defaultIndex={beepLeads.always ? 0 : 1}
                  onChange={(idx) => saveBeepLeads({ ...beepLeads, always: idx === 0 })}
                  className="w-[210px] shrink-0"
                />
              </div>
              <p className="text-[11px] text-graphite-light leading-relaxed mt-2">
                «Не при дикторе» — бипы перед концом периода и удаления молчат, если в матче включён
                голос диктора. Перед концом периода бип всё же прозвучит, если у лиги нет файла
                голосового предупреждения. Отметки сценария выше звучат всегда
              </p>
            </div>

            {!data.files?.['beep.mp3']?.uploaded && (
              <p className="text-[11px] font-bold text-status-rejected mt-2">Файл бипа не загружен — бипа не будет.</p>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        title="Удаление звука"
        message={deleteTarget ? `Удалить звук «${deleteTarget.title}»? В матчах лиги он перестанет звучать.` : ''}
      />
    </div>
  );
}
