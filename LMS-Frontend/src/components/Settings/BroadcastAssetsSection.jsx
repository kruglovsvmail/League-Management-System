import React, { useState, useEffect, useRef } from 'react';
import { getToken } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';
import { ConfirmModal } from '../../modals/ConfirmModal';

// Блок «Трансляции» на вкладке параметров лиги: аудио-интро и три видео-заставки.
//
// Файлы уходят в S3 по соглашению путей (см. broadcastAssetsController.js), в БД
// хранятся только подпись слота и длительность ролика. Длительность читает сам
// браузер перед отправкой — сервер видео не разбирает, ffprobe ради одной цифры
// поднимать не за чем, а панели трансляции она нужна, чтобы предложить режиссёру
// корректное время показа.

const API = import.meta.env.VITE_API_URL;
const MAX_MB = 120;

// Длительность ролика без сервера: скармливаем файл скрытому <video> и ждём
// метаданные. Не получилось — не страшно, слот просто останется без цифры.
const readVideoDuration = (file) => new Promise((resolve) => {
  try {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    v.src = url;
  } catch { resolve(null); }
});

function SlotRow({ slot, busy, canEdit, onUpload, onDelete, onTitleChange }) {
  const inputRef = useRef(null);
  const [title, setTitle] = useState(slot.title || '');

  useEffect(() => { setTitle(slot.title || ''); }, [slot.title]);

  // Всё в одну строку: названия слотов короткие («Партнёр А»), и место, которое
  // освободилось под полем, как раз забирают длительность и кнопки.
  return (
    <div className="py-2 border-t border-graphite/10 first:border-t-0">
      <div className="flex items-center gap-2">
        <span className="w-4 shrink-0 text-[11px] font-black text-graphite/30 tabular-nums">{slot.slot}</span>

        <input
          type="text"
          value={title}
          placeholder={`Ролик ${slot.slot}`}
          maxLength={60}
          disabled={!canEdit}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (title !== (slot.title || '')) onTitleChange(slot.slot, title); }}
          className="flex-1 min-w-0 max-w-[160px] bg-gray-bg-light border border-gray-light rounded-md px-2.5 py-1.5 text-[12px] font-bold text-graphite focus:bg-white focus:outline-none focus:border-orange/50 disabled:opacity-50"
        />

        <span className="shrink-0 ml-auto text-[11px] font-bold tabular-nums whitespace-nowrap">
          {slot.uploaded
            ? <span className="text-status-accepted">{slot.duration ? `${slot.duration} сек` : 'загружено'}</span>
            : <span className="text-graphite/30">нет файла</span>}
        </span>

        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mov"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(slot.slot, f); e.target.value = ''; }}
        />

        <button
          onClick={() => inputRef.current?.click()}
          disabled={!canEdit || busy}
          title={slot.uploaded ? 'Заменить ролик' : 'Загрузить ролик'}
          className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-graphite/50 hover:text-orange hover:bg-orange/10 transition-colors disabled:opacity-30"
        >
          <Icon name="upload" className="w-4 h-4" />
        </button>

        <button
          onClick={() => onDelete(slot.slot)}
          disabled={!canEdit || busy || !slot.uploaded}
          title="Удалить ролик"
          className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-graphite/40 hover:text-status-rejected hover:bg-status-rejected/10 transition-colors disabled:opacity-20"
        >
          <Icon name="delete" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function BroadcastAssetsSection({ leagueId, canEdit, setToast }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const introRef = useRef(null);
  // Удаление подтверждаем: файл лежит в S3 и восстановить его нечем — только
  // заливать заново, а исходник у режиссёра может и не сохраниться.
  const [deleteTarget, setDeleteTarget] = useState(null);   // { kind, slot, label }

  const load = async () => {
    if (!leagueId) return;
    try {
      const res = await fetch(`${API}/api/leagues/${leagueId}/broadcast-assets`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); }, [leagueId]);

  const send = async (kind, file, extra = {}) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      setToast?.({ message: `Файл больше ${MAX_MB} МБ`, type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      Object.entries(extra).forEach(([k, v]) => v != null && form.append(k, v));

      const res = await fetch(`${API}/api/leagues/${leagueId}/broadcast-assets/${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const json = await res.json();
      if (json.success) {
        setToast?.({ message: 'Файл загружен', type: 'success' });
        await load();
      } else {
        setToast?.({ message: json.error || 'Не удалось загрузить файл', type: 'error' });
      }
    } catch (e) {
      setToast?.({ message: 'Не удалось загрузить файл', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleBumperUpload = async (slot, file) => {
    const duration = await readVideoDuration(file);
    await send('bumper', file, { slot, duration });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { kind, slot } = deleteTarget;
    setBusy(true);
    try {
      const qs = slot ? `?slot=${slot}` : '';
      const res = await fetch(`${API}/api/leagues/${leagueId}/broadcast-assets/${kind}${qs}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (json.success) { setToast?.({ message: 'Файл удалён', type: 'success' }); await load(); }
    } catch (e) {
      setToast?.({ message: 'Не удалось удалить файл', type: 'error' });
    } finally { setBusy(false); setDeleteTarget(null); }
  };

  const handleTitleChange = async (slot, title) => {
    try {
      const res = await fetch(`${API}/api/leagues/${leagueId}/broadcast-assets/titles`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bumpers: [{ slot, title }] }),
      });
      const json = await res.json();
      if (json.success) setData(prev => prev ? { ...prev, bumpers: prev.bumpers.map(b => ({ ...b, ...json.bumpers.find(n => n.slot === b.slot) })) } : prev);
    } catch (e) { console.error(e); }
  };

  // Карточка занимает одну колонку, как соседние.
  return (
    <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <Icon name="live_stream" className="w-4 h-4 text-graphite/40" />
        <h4 className="text-[13px] font-black uppercase text-graphite tracking-tight">Трансляции</h4>
      </div>

      {!data ? (
        <div className="text-[11px] font-bold text-graphite/30 py-4">Загрузка…</div>
      ) : (
        <div className="flex flex-col gap-6">

          {/* --- ИНТРО --- */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-graphite/50">Аудио-интро</span>
              <span className="text-[10px] font-bold text-graphite/30">MP3, до {MAX_MB} МБ</span>
            </div>

            <div className="py-2.5">
              <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-[11px] font-bold truncate">
                {data.intro.uploaded
                  ? <span className="text-status-accepted">загружено</span>
                  : <span className="text-graphite/30">нет файла</span>}
              </span>

              <input
                ref={introRef}
                type="file"
                accept="audio/mpeg,audio/mp3"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) send('intro', f); e.target.value = ''; }}
              />
              <button
                onClick={() => introRef.current?.click()}
                disabled={!canEdit || busy}
                title={data.intro.uploaded ? 'Заменить интро' : 'Загрузить интро'}
                className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-graphite/50 hover:text-orange hover:bg-orange/10 transition-colors disabled:opacity-30"
              >
                <Icon name="upload" className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeleteTarget({ kind: 'intro', slot: null, label: 'аудио-интро' })}
                disabled={!canEdit || busy || !data.intro.uploaded}
                title="Удалить интро"
                className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-graphite/40 hover:text-status-rejected hover:bg-status-rejected/10 transition-colors disabled:opacity-20"
              >
                <Icon name="delete" className="w-4 h-4" />
              </button>
              </div>
            </div>
          </div>

          {/* --- ЗАСТАВКИ --- */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-graphite/50">Видео-заставки</span>
              <span className="text-[10px] font-bold text-graphite/30">MP4, WebM или MOV, до {MAX_MB} МБ</span>
            </div>

            {data.bumpers.map(slot => (
              <SlotRow
                key={slot.slot}
                slot={slot}
                busy={busy}
                canEdit={canEdit}
                onUpload={handleBumperUpload}
                onDelete={(s) => setDeleteTarget({
                  kind: 'bumper',
                  slot: s,
                  label: `заставку «${data.bumpers.find(b => b.slot === s)?.title || `Ролик ${s}`}»`,
                })}
                onTitleChange={handleTitleChange}
              />
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        isLoading={busy}
        title="Удаление файла"
        message={`Удалить ${deleteTarget?.label || 'файл'}? Это действие нельзя отменить.`}
      />
    </div>
  );
}
