import React, { useState, useEffect } from 'react';
import { useAccess } from '../../hooks/useAccess';
import { Table } from '../../ui/Table2';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { getToken } from '../../utils/helpers';

export function SdkVenuesSection({ seasonId, setToast }) {
  const { checkAccess } = useAccess();
  const canManage = checkAccess('SDK_REFERENCES_MANAGE');

  const [venues, setVenues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [venueToDelete, setVenueToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  const fetchVenues = async () => {
    if (!seasonId) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/seasons/${seasonId}/sdk/venues`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setVenues(data.data);
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой загрузки мест проведения', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchVenues(); }, [seasonId]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/seasons/${seasonId}/sdk/venues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setName('');
        fetchVenues();
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
    if (!venueToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/venues/${venueToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setVenueToDelete(null);
        fetchVenues();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
        setVenueToDelete(null);
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = [
    { label: 'Название', sortKey: 'name', render: (row) => <span className="font-bold text-graphite">{row.name}</span> },
    { label: '', width: 'w-12', align: 'center', render: (row) => {
        if (!canManage) return null;
        return (
          <button onClick={() => setVenueToDelete(row)} className="p-2 text-graphite-light hover:text-status-rejected hover:bg-status-rejected/10 rounded-lg transition-colors">
            <Icon name="delete" className="w-5 h-5" />
          </button>
        );
    }}
  ];

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      <div className="flex-1 w-full bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 min-h-[300px] order-2 lg:order-1">
        {venues.length > 0 ? (
          <Table columns={columns} data={venues} />
        ) : (
          <div className="text-center py-20 text-graphite-light font-medium">Места проведения на этот сезон ещё не добавлены</div>
        )}
      </div>

      {canManage && seasonId && (
        <div className="w-full lg:w-[440px] shrink-0 bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 flex flex-col gap-4 sticky top-[100px] order-1 lg:order-2">
          <span className="text-[14px] font-black text-graphite uppercase tracking-wide border-b border-graphite/10 pb-4">Новое место</span>
          <Input placeholder="Название или адрес" value={name} onChange={e => setName(e.target.value)} />
          <Button onClick={handleCreate} isLoading={isSubmitting} className="w-full">Добавить</Button>
        </div>
      )}

      <ConfirmModal
        isOpen={!!venueToDelete}
        onClose={() => setVenueToDelete(null)}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
