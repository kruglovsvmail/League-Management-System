import React, { useState, useEffect, useRef } from 'react';
import { getToken } from '../utils/helpers';
import { Icon } from '../ui/Icon';
import { ConfirmModal } from '../modals/ConfirmModal';

/**
 * Блок «Анонс матчей» на вкладке «Лиги» раздела «Команды» (только глобальный админ).
 *
 * Материалы картинки анонса, которую делают из «Расписания матчей»: фон, логотип,
 * шрифт. Какие строки здесь есть, решает шаблон лиги (meta.files / meta.fonts в
 * LMS-Backend/src/announces/) — свой у лиги или общий. Файлы уходят в S3 под
 * именами строк (см. announceAssetsController.js).
 *
 * scope — id лиги или 'default'. Общие файлы (scope='default') показываются на экране
 * выбора лиги: ими пользуются все лиги, у которых своего файла нет.
 */

const API = import.meta.env.VITE_API_URL;
const MAX_MB = 10;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const FONT_EXTS = ['.ttf', '.otf', '.woff', '.woff2'];

const ACCEPT = { image: 'image/jpeg,image/png,image/webp', font: FONT_EXTS.join(',') };
const FORMATS = { image: 'JPG, PNG или WebP', font: 'TTF, OTF, WOFF или WOFF2' };

const iconButton = 'shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors';

function AssetRow({ slot, isDefault, busy, onUpload, onDelete }) {
  const inputRef = useRef(null);
  // Что сейчас попадёт в анонс: свой файл, иначе общий
  const effectiveUrl = slot.url || slot.shared?.url || null;

  return (
    <div className="flex items-center gap-3 py-2.5 border-t border-graphite/10 first:border-t-0">
      {/* Миниатюра: картинка — как есть, шрифт — плашка «Аа» (превью шрифта с бакета
          браузер не применит: CORS на бакете выключен) */}
      <div className={`w-10 h-10 shrink-0 rounded-md border border-graphite/10 bg-graphite/5 overflow-hidden flex items-center justify-center ${slot.uploaded ? '' : 'opacity-50'}`}>
        {slot.kind === 'image' && effectiveUrl
          ? <img src={effectiveUrl} alt="" className="w-full h-full object-cover" />
          : <span className="text-[13px] font-black text-graphite/40">{slot.kind === 'font' ? 'Аа' : ''}</span>}
      </div>

      <div className="flex-1 min-w-0">
        <span className="block text-[12px] font-bold text-graphite truncate">{slot.title}</span>
        <span className="block text-[10px] font-semibold text-graphite/40 truncate">
          {slot.hint ? `${slot.hint} · ` : ''}{FORMATS[slot.kind]}
        </span>
      </div>

      <span className="shrink-0 text-[11px] font-bold whitespace-nowrap">
        {busy
          ? <span className="text-orange">загрузка…</span>
          : slot.uploaded
            ? <span className="text-status-accepted">{isDefault ? 'загружено' : 'свой файл'}</span>
            : slot.shared
              ? <span className="text-graphite/50">общий файл</span>
              : <span className="text-graphite/30">нет файла</span>}
      </span>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[slot.kind]}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(slot, f); e.target.value = ''; }}
      />

      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={slot.uploaded ? 'Заменить файл' : 'Загрузить файл'}
        className={`${iconButton} text-graphite/50 hover:text-orange hover:bg-orange/10 disabled:opacity-30`}
      >
        <Icon name="upload" className="w-4 h-4" />
      </button>

      <button
        onClick={() => onDelete(slot)}
        disabled={!slot.uploaded || busy}
        title="Удалить файл"
        className={`${iconButton} text-graphite/40 hover:text-status-rejected hover:bg-status-rejected/10 disabled:opacity-20`}
      >
        <Icon name="delete" className="w-4 h-4" />
      </button>
    </div>
  );
}

export function AnnounceAssetsSection({ scope, showToast }) {
  const isDefault = scope === 'default';
  const [data, setData] = useState(null); // { template: 'own' | 'default', slots: [...] }
  const [busySlot, setBusySlot] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const authHeaders = { 'Authorization': `Bearer ${getToken()}` };
  const baseUrl = isDefault ? `${API}/api/announce-assets/default` : `${API}/api/leagues/${scope}/announce-assets`;

  const load = () => fetch(baseUrl, { headers: authHeaders })
    .then(res => res.json())
    .then(json => {
      if (json.success) setData(json.data);
      else showToast?.('Ошибка', json.error, 'error');
    })
    .catch(() => showToast?.('Ошибка', 'Сбой загрузки материалов анонса', 'error'));

  useEffect(() => {
    if (!scope) return;
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const handleUpload = async (slot, picked) => {
    const name = picked.name.toLowerCase();
    const fits = slot.kind === 'font'
      ? FONT_EXTS.some(ext => name.endsWith(ext))
      : IMAGE_TYPES.includes(picked.type);
    if (!fits) {
      showToast?.('Не тот формат', `Здесь нужен файл ${FORMATS[slot.kind]}`, 'error');
      return;
    }
    if (picked.size > MAX_MB * 1024 * 1024) {
      showToast?.('Файл слишком большой', `Файл должен быть не больше ${MAX_MB} МБ`, 'error');
      return;
    }

    setBusySlot(slot.name);
    try {
      const form = new FormData();
      form.append('file', picked);
      const res = await fetch(`${baseUrl}/${slot.name}`, { method: 'POST', headers: authHeaders, body: form });
      const json = await res.json();
      if (json.success) {
        setData(prev => ({ ...prev, slots: prev.slots.map(s => (s.name === slot.name ? { ...s, uploaded: true, url: json.url } : s)) }));
        showToast?.('Готово', 'Файл загружен', 'success');
      } else {
        showToast?.('Ошибка', json.error || 'Не удалось загрузить файл', 'error');
      }
    } catch (err) {
      showToast?.('Ошибка', 'Не удалось загрузить файл', 'error');
    } finally {
      setBusySlot(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const slot = deleteTarget;
    setIsDeleting(true);
    try {
      const res = await fetch(`${baseUrl}/${slot.name}`, { method: 'DELETE', headers: authHeaders });
      const json = await res.json();
      if (json.success) {
        setData(prev => ({ ...prev, slots: prev.slots.map(s => (s.name === slot.name ? { ...s, uploaded: false, url: null } : s)) }));
        showToast?.('Готово', 'Файл удалён', 'success');
      } else {
        showToast?.('Ошибка', json.error || 'Не удалось удалить файл', 'error');
      }
    } catch (err) {
      showToast?.('Ошибка', 'Не удалось удалить файл', 'error');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Подсказка про общие файлы — только если у шаблона лиги есть ячейки, которые их берут
  const usesShared = !!data?.slots?.some(s => !s.own);
  const description = isDefault
    ? 'Файлы общего шаблона картинки анонса (Расписание матчей → кнопка анонса). Ими пользуются все лиги, у которых нет своих'
    : `Файлы картинки анонса (Расписание матчей → кнопка анонса). ${
        data?.template === 'own' ? 'У лиги свой шаблон' : 'Лига пользуется общим шаблоном'
      }${usesShared ? ': чего нет у лиги, берётся из общих файлов на экране выбора лиги' : '. Фон руководство и медиа лиги могут сменить и в самом окне анонса'}`;

  // Удаление общего файла задевает все лиги — предупреждаем об этом отдельно
  const deleteMessage = !deleteTarget ? '' : isDefault
    ? `Удалить общий файл «${deleteTarget.title}»? Он пропадёт из анонсов всех лиг, у которых нет своего.`
    : deleteTarget.shared
      ? `Удалить файл «${deleteTarget.title}» этой лиги? Вместо него в анонсе будет общий.`
      : `Удалить файл «${deleteTarget.title}» этой лиги? В анонсе его не будет.`;

  return (
    <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6">
      <div className="mb-5 pb-4 border-b border-graphite/10 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[16px] font-black uppercase text-graphite tracking-wide">
            {isDefault ? 'Анонс матчей — общие файлы' : 'Анонс матчей'}
          </h3>
          <p className="text-[12px] font-medium text-graphite-light mt-1">{description}</p>
        </div>
        <span className="shrink-0 text-[10px] font-bold text-graphite/30 pt-1">до {MAX_MB} МБ</span>
      </div>

      {!data ? (
        <div className="text-[11px] font-bold text-graphite/30 py-4">Загрузка…</div>
      ) : data.slots.length === 0 ? (
        <div className="text-[12px] text-graphite-light py-4">
          {isDefault
            ? 'Общему шаблону файлы не нужны: фон и шрифты в нём встроены, а логотип и свой фон загружаются в карточке каждой лиги'
            : 'Шаблону лиги файлы не нужны'}
        </div>
      ) : (
        <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-xl px-5 py-2 shadow-sm">
          {data.slots.map(slot => (
            <AssetRow
              key={slot.name}
              slot={slot}
              isDefault={isDefault}
              busy={busySlot === slot.name}
              onUpload={handleUpload}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        title="Удаление файла"
        message={deleteMessage}
      />
    </div>
  );
}
