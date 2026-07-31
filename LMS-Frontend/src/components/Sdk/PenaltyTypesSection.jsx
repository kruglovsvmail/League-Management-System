import React, { useState, useEffect, useRef } from 'react';
import { useAccess } from '../../hooks/useAccess';
import { Table } from '../../ui/Table2';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { CopyFromSeasonPanel } from './CopyFromSeasonPanel';
import { getToken } from '../../utils/helpers';

// Справочник причин удаления («Причины удалений») — свой на каждый сезон.
// Что где используется: сокращение печатается в PDF-протоколе и в поле секретаря,
// полное наименование хранится в событии и показывается на плашках трансляции,
// форма винительного падежа подставляется диктору во фразу «наказан за ...».
const EMPTY_FORM = { number: '', code: '', title: '', tts_accusative: '' };

export function PenaltyTypesSection({ seasonId, seasons = [], setToast }) {
  const { checkAccess } = useAccess();
  const canManage = checkAccess('SDK_REFERENCES_MANAGE');

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;
  const authHeader = () => ({ 'Authorization': `Bearer ${getToken()}` });

  const fetchItems = async () => {
    if (!seasonId) { setItems([]); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/seasons/${seasonId}/penalty-types`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) setItems(data.data);
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой загрузки справочника причин', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    setForm(EMPTY_FORM);
    setEditingId(null);
  }, [seasonId]);

  // Останавливаем воспроизведение при уходе со страницы, иначе диктор продолжит
  // говорить поверх следующего экрана
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({
      number: String(row.number ?? ''),
      code: row.code || '',
      title: row.title || '',
      tts_accusative: row.tts_accusative || '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); };

  const handleSubmit = async () => {
    if (!form.number || !form.code.trim() || !form.title.trim()) {
      setToast({ title: 'Заполните поля', message: 'Номер, сокращение и наименование обязательны', type: 'error' });
      return;
    }
    setIsSubmitting(true);
    try {
      const url = editingId
        ? `${SERVER_URL}/api/penalty-types/${editingId}`
        : `${SERVER_URL}/api/seasons/${seasonId}/penalty-types`;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        cancelEdit();
        fetchItems();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой сохранения', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/penalty-types/${itemToDelete.id}`, { method: 'DELETE', headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        if (editingId === itemToDelete.id) cancelEdit();
        setItemToDelete(null);
        fetchItems();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Выбором сезона и состоянием кнопки заведует CopyFromSeasonPanel — здесь только запрос
  const handleCopy = async (fromSeasonId) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/seasons/${seasonId}/penalty-types/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ fromSeasonId })
      });
      const data = await res.json();
      if (data.success) {
        setToast({ title: 'Готово', message: `Скопировано пунктов: ${data.copied}`, type: 'success' });
        fetchItems();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
      return data;
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой копирования', type: 'error' });
      return { success: false };
    }
  };

  // Проигрывает ровно ту фразу, которую скажет диктор на трансляции, — так слышно,
  // корректно ли звучит падеж. /tts/test закрыт токеном, поэтому тянем через fetch
  // и играем из blob, а не подставляем ссылку в <audio src>.
  const handleListen = async (row) => {
    // Превью повторяет поведение диктора один в один: падеж не заполнен — причину
    // не произносим. Подставлять сюда наименование нельзя, иначе проверка обещает то,
    // чего на трансляции не прозвучит.
    const reason = (row.tts_accusative || '').trim();
    const phrase = reason
      ? `Малым штрафом за ${reason}, наказан игрок команды.`
      : 'Малым штрафом, наказан игрок команды.';

    audioRef.current?.pause();
    setPlayingId(row.id ?? 'form');
    try {
      const res = await fetch(`${SERVER_URL}/api/tts/test?text=${encodeURIComponent(phrase)}`, { headers: authHeader() });
      if (!res.ok) throw new Error('TTS');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPlayingId(null); URL.revokeObjectURL(url); };
      await audio.play();
    } catch (err) {
      setPlayingId(null);
      setToast({ title: 'Ошибка', message: 'Не удалось озвучить фразу', type: 'error' });
    }
  };

  const columns = [
    { label: '№', sortKey: 'number', width: 'w-[70px]', render: (row) => <span className="font-bold text-graphite/50 tabular-nums">{row.number}</span> },
    { label: 'Сокращение', sortKey: 'code', width: 'w-[150px]', render: (row) => <span className="font-black text-graphite uppercase tracking-wider text-[13px]">{row.code}</span> },
    { label: 'Наименование', sortKey: 'title', render: (row) => <span className="font-semibold text-graphite">{row.title}</span> },
    { label: 'Для диктора', sortKey: 'tts_accusative', width: 'w-[260px]', render: (row) => (
      row.tts_accusative
        ? <span className="text-[13px] text-graphite-light">{row.tts_accusative}</span>
        : <span className="text-[12px] text-status-rejected font-semibold" title="Диктор прочитает наименование с маленькой буквы — часто звучит неграмотно">не задано</span>
    )},
    { label: '', width: 'w-[130px]', align: 'right', render: (row) => (
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => handleListen(row)}
          title="Прослушать, как это произнесёт диктор"
          className="p-2 text-graphite-light hover:text-orange hover:bg-orange/10 rounded-lg transition-colors"
        >
          <Icon name={playingId === row.id ? 'stop' : 'play'} className="w-5 h-5" />
        </button>
        {canManage && (
          <>
            <button onClick={() => startEdit(row)} className="p-2 text-graphite-light hover:text-orange hover:bg-orange/10 rounded-lg transition-colors">
              <Icon name="edit" className="w-5 h-5" />
            </button>
            <button onClick={() => setItemToDelete(row)} className="p-2 text-graphite-light hover:text-status-rejected hover:bg-status-rejected/10 rounded-lg transition-colors">
              <Icon name="delete" className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    )}
  ];

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      <div className="flex-1 w-full bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 min-h-[300px] order-2 lg:order-1">
        {items.length > 0 ? (
          <Table columns={columns} data={items} />
        ) : (
          <div className="py-16 flex flex-col gap-6">
            <div className="text-center text-graphite-light font-medium">
              Справочник причин на этот сезон пуст.<br />
              <span className="text-[13px]">Пока он не заполнен, панель секретаря показывает встроенный список причин.</span>
            </div>
            <CopyFromSeasonPanel
              seasons={seasons}
              seasonId={seasonId}
              canManage={canManage}
              onCopy={handleCopy}
              hint="Перенесёт номера, сокращения, наименования и формы для диктора. Дальше их можно править под этот сезон."
            />
          </div>
        )}
      </div>

      {canManage && seasonId && (
        <div className="w-full lg:w-[440px] shrink-0 flex flex-col gap-4 sticky top-[100px] order-1 lg:order-2">
          <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-graphite/10 pb-4">
              <span className="text-[14px] font-black text-graphite uppercase tracking-wide">
                {editingId ? 'Изменение пункта' : 'Новый пункт'}
              </span>
              {editingId && (
                <button onClick={cancelEdit} className="text-[12px] font-bold text-graphite-light hover:text-orange">Отмена</button>
              )}
            </div>

            <div className="flex gap-3">
              <div className="w-[90px] shrink-0">
                <Input placeholder="№" value={form.number} onChange={e => setForm({ ...form, number: e.target.value.replace(/\D/g, '') })} />
              </div>
              <Input placeholder="Сокращение (ПОДЖ)" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
            </div>

            <Input placeholder="Полное наименование" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />

            <div className="flex flex-col gap-1.5">
              <Input
                placeholder="Для диктора: «подножку»"
                value={form.tts_accusative}
                onChange={e => setForm({ ...form, tts_accusative: e.target.value })}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-graphite-light leading-tight">
                  Винительный падеж — подставляется во фразу «наказан за …».
                  Если не заполнить, причину диктор не произнесёт совсем.
                </span>
                {/* Кнопка активна и с пустым падежом: так слышно, как прозвучит фраза без причины */}
                <button
                  type="button"
                  onClick={() => handleListen({ id: 'form', title: form.title, tts_accusative: form.tts_accusative })}
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-orange bg-orange/10 hover:bg-orange/20 transition-colors"
                >
                  <Icon name={playingId === 'form' ? 'stop' : 'play'} className="w-4 h-4" />
                  Прослушать
                </button>
              </div>
            </div>

            <Button onClick={handleSubmit} isLoading={isSubmitting} className="w-full">
              {editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>

          {/* Копирование из другого сезона живёт в пустом состоянии таблицы слева:
              заполненный справочник копировать незачем */}
        </div>
      )}

      <ConfirmModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
