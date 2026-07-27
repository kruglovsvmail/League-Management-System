import React, { useState, useEffect } from 'react';
import { useAccess } from '../../hooks/useAccess';
import { Table } from '../../ui/Table2';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { getToken } from '../../utils/helpers';

const EMPTY_FORM = {
  code: '', title: '',
  penalty_games_min: '', penalty_games_max: '',
  penalty_amount_min: '', penalty_amount_max: '',
  penalty_minutes_note: ''
};

const formatRange = (min, max, suffix = '') => {
  if (min == null && max == null) return '-';
  if (min == null) return `до ${max}${suffix}`;
  if (max == null || Number(min) === Number(max)) return `${min}${suffix}`;
  return `${min}–${max}${suffix}`;
};

export function SdkViolationTypesSection({ seasonId, setToast }) {
  const { checkAccess } = useAccess();
  const canManage = checkAccess('SDK_REFERENCES_MANAGE');
  const canDelete = checkAccess('SDK_VIOLATION_TYPES_DELETE');

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  const fetchItems = async () => {
    if (!seasonId) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/seasons/${seasonId}/sdk/violation-types`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setItems(data.data);
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой загрузки справочника нарушений', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, [seasonId]);

  const handleCreate = async () => {
    if (!formData.code.trim() || !formData.title.trim()) {
      setToast({ title: 'Внимание', message: 'Заполните пункт и текст нарушения', type: 'error' });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/seasons/${seasonId}/sdk/violation-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({
          code: formData.code.trim(),
          title: formData.title.trim(),
          penalty_games_min: formData.penalty_games_min ? parseInt(formData.penalty_games_min, 10) : null,
          penalty_games_max: formData.penalty_games_max ? parseInt(formData.penalty_games_max, 10) : null,
          penalty_amount_min: formData.penalty_amount_min ? parseFloat(formData.penalty_amount_min) : null,
          penalty_amount_max: formData.penalty_amount_max ? parseFloat(formData.penalty_amount_max) : null,
          penalty_minutes_note: formData.penalty_minutes_note.trim() || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setFormData(EMPTY_FORM);
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
      const res = await fetch(`${SERVER_URL}/api/sdk/violation-types/${itemToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setItemToDelete(null);
        fetchItems();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
        setItemToDelete(null);
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = [
    { label: 'Пункт', sortKey: 'code', width: 'w-20', render: (row) => <span className="font-black text-orange">{row.code}</span> },
    { label: 'Нарушение', sortKey: 'title', render: (row) => <span className="font-medium text-graphite">{row.title}</span> },
    { label: 'Матчи', width: 'w-24', align: 'center', render: (row) => <span className="text-graphite-light">{formatRange(row.penalty_games_min, row.penalty_games_max)}</span> },
    { label: 'Штраф, ₽', width: 'w-32', align: 'center', render: (row) => <span className="text-graphite-light">{formatRange(row.penalty_amount_min, row.penalty_amount_max)}</span> },
    { label: 'Минуты', width: 'w-24', align: 'center', render: (row) => <span className="text-graphite-light">{row.penalty_minutes_note || '-'}</span> },
    { label: '', width: 'w-12', align: 'center', render: (row) => {
        if (!canDelete) return null;
        return (
          <button onClick={() => setItemToDelete(row)} className="p-2 text-graphite-light hover:text-status-rejected hover:bg-status-rejected/10 rounded-lg transition-colors">
            <Icon name="delete" className="w-5 h-5" />
          </button>
        );
    }}
  ];

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      <div className="flex-1 w-full bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 min-h-[300px] order-2 lg:order-1">
        {items.length > 0 ? (
          <Table columns={columns} data={items} />
        ) : (
          <div className="text-center py-20 text-graphite-light font-medium">Справочник нарушений на этот сезон пока пуст</div>
        )}
      </div>

      {canManage && seasonId && (
        <div className="w-full lg:w-[500px] shrink-0 bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 flex flex-col gap-4 sticky top-[100px] order-1 lg:order-2">
          <span className="text-[14px] font-black text-graphite uppercase tracking-wide border-b border-graphite/10 pb-4">Новый пункт</span>
          <Input placeholder="Номер пункта (например, 2.4)" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
          <div className="flex flex-col">
            <textarea
              placeholder="Текст нарушения"
              rows={3}
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2.5 bg-white/70 border border-graphite/40 rounded-md font-medium text-graphite outline-none focus:border-orange focus:shadow-[0_0_0_3px_rgba(255,122,0,0.2)] transition-all resize-none text-[14px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Матчи дисквалификации (необязательно)</span>
            <div className="flex gap-3">
              <Input placeholder="От" type="number" value={formData.penalty_games_min} onChange={e => setFormData({ ...formData, penalty_games_min: e.target.value })} />
              <Input placeholder="До (если диапазон)" type="number" value={formData.penalty_games_max} onChange={e => setFormData({ ...formData, penalty_games_max: e.target.value })} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Штраф, ₽ (необязательно)</span>
            <div className="flex gap-3">
              <Input placeholder="От" type="number" value={formData.penalty_amount_min} onChange={e => setFormData({ ...formData, penalty_amount_min: e.target.value })} />
              <Input placeholder="До (если диапазон)" type="number" value={formData.penalty_amount_max} onChange={e => setFormData({ ...formData, penalty_amount_max: e.target.value })} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Input placeholder="Например: 2+20" value={formData.penalty_minutes_note} onChange={e => setFormData({ ...formData, penalty_minutes_note: e.target.value })} />
            <span className="text-[10px] text-graphite/50 leading-relaxed px-0.5">Штраф (минуты) — хоккейная нотация, необязательно</span>
          </div>

          <p className="text-[10px] text-graphite/50 leading-relaxed px-0.5">
            Эти значения — ориентир для комиссии. Итоговое наказание всё равно вводится вручную при вынесении решения.
          </p>

          <Button onClick={handleCreate} isLoading={isSubmitting} className="w-full">Добавить</Button>
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
