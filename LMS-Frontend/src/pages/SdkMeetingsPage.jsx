import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAccess } from '../hooks/useAccess';
import { Header } from '../components/Header';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { DatePicker } from '../ui/DatePicker';
import { AccessFallback } from '../ui/AccessFallback';
import { Modal } from '../modals/Modal';
import { getToken } from '../utils/helpers';

const MEETING_TYPES = [
  { value: 'sdk', label: 'СДК' },
  { value: 'kpdu', label: 'КПДУ' },
  { value: 'ak', label: 'АК (не действует)' },
  { value: 'ek', label: 'ЭК' }
];

const STATUS_PILL = {
  not_specified: { label: 'Не указано', className: 'bg-graphite/10 text-graphite/50 border border-graphite/10' },
  held_with_issues: { label: 'Рассмотрены вопросы', className: 'bg-orange/10 text-orange border border-orange/20' },
  held_no_issues: { label: 'Нет вопросов', className: 'bg-status-accepted/10 text-status-accepted border border-status-accepted/20' }
};

export function SdkMeetingsPage() {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  const navigate = useNavigate();

  const canView = checkAccess('SDK_MEETINGS_VIEW');
  const canManage = checkAccess('SDK_MEETINGS_MANAGE');

  const [seasons, setSeasons] = useState([]);
  const [venues, setVenues] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [seasonFilter, setSeasonFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ season_id: '', meeting_type: 'sdk', venue_id: '', held_at: '', period_start: '', period_end: '' });

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  useEffect(() => {
    if (!selectedLeague?.id || !canView) return;
    fetch(`${SERVER_URL}/api/leagues/${selectedLeague.id}/seasons`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSeasons(data.data);
          const active = data.data.find(s => s.is_active);
          setForm(f => ({ ...f, season_id: active?.id || data.data[0]?.id || '' }));
        }
      });
  }, [selectedLeague?.id, canView]);

  useEffect(() => {
    if (!form.season_id) { setVenues([]); return; }
    fetch(`${SERVER_URL}/api/seasons/${form.season_id}/sdk/venues`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      .then(res => res.json())
      .then(data => { if (data.success) setVenues(data.data); });
  }, [form.season_id]);

  const fetchMeetings = async () => {
    if (!selectedLeague?.id) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (seasonFilter) params.set('seasonId', seasonFilter);
      if (typeFilter) params.set('type', typeFilter);
      const res = await fetch(`${SERVER_URL}/api/leagues/${selectedLeague.id}/sdk/meetings?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) setMeetings(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchMeetings(); }, [selectedLeague?.id, seasonFilter, typeFilter]);

  const isCreateFormValid = form.season_id && form.meeting_type && form.venue_id && form.held_at && form.period_start && form.period_end;

  const handleCreate = async () => {
    if (!isCreateFormValid) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/leagues/${selectedLeague.id}/sdk/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({
          season_id: form.season_id,
          meeting_type: form.meeting_type,
          venue_id: form.venue_id,
          held_at: form.held_at,
          period_start: form.period_start,
          period_end: form.period_end
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsCreateOpen(false);
        navigate(`/sdk-meetings/${data.id}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (!canView) {
    return (
      <div className="flex flex-col flex-1 animate-zoom-in">
        <Header title="Заседания СДК" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <AccessFallback variant="full" message="У вас нет прав для просмотра заседаний СДК." />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header
        title="Заседания СДК"
        actions={canManage && (
          <Button onClick={() => setIsCreateOpen(true)}>+ Новое заседание</Button>
        )}
      />

      <div className="flex items-start px-10 pt-8 gap-8 relative z-10">
        <div className="w-[300px] shrink-0 sticky top-[128px] bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6 flex flex-col gap-5 z-20">
          <Select label="Сезон" options={[{ value: '', label: 'Все сезоны' }, ...seasons.map(s => ({ value: s.id, label: s.name }))]} value={seasonFilter} onChange={setSeasonFilter} />
          <Select label="Тип комиссии" options={[{ value: '', label: 'Все типы' }, ...MEETING_TYPES]} value={typeFilter} onChange={setTypeFilter} />
        </div>

        <div className="flex-1 relative z-10 min-h-[500px]">
          {isLoading && <div className="absolute inset-0 z-20 flex items-start pt-20 justify-center"><Loader /></div>}

          <div className={`pb-10 transition-opacity duration-300 ${isLoading ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            {meetings.length === 0 && !isLoading ? (
              <div className="text-center py-20 text-graphite-light font-medium">Заседания не найдены</div>
            ) : (
              meetings.map(m => {
                const pill = STATUS_PILL[m.status] || STATUS_PILL.not_specified;
                const typeLabel = MEETING_TYPES.find(t => t.value === m.meeting_type)?.label || m.meeting_type;
                return (
                  <div
                    key={m.id}
                    onClick={() => navigate(`/sdk-meetings/${m.id}`)}
                    className="mb-3 p-4 bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-mg hover:border-orange/40 transition-all cursor-pointer grid grid-cols-[140px_1fr_140px_180px_auto_100px] gap-4 items-center"
                  >
                    <span className="text-[14px] font-black text-graphite">{typeLabel} №{m.sequence_number ?? '-'}</span>
                    <span className="text-[13px] font-medium text-graphite-light">{m.venue_name || 'Место не указано'}</span>
                    <span className="text-[13px] font-bold text-graphite/60">{formatDate(m.held_at)}</span>
                    <span className="text-[12px] font-bold text-graphite/60">{formatDate(m.period_start)} – {formatDate(m.period_end)}</span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap ${pill.className}`}>{pill.label}</span>
                    <span className="text-right text-[12px] font-bold text-graphite/50">{m.decisions_count} реш.</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Новое заседание" size="normal">
        <div className="flex flex-col gap-5">
          <Select label="Сезон" options={seasons.map(s => ({ value: s.id, label: s.name }))} value={form.season_id} onChange={val => setForm({ ...form, season_id: val, venue_id: '' })} />
          <Select label="Тип комиссии" options={MEETING_TYPES} value={form.meeting_type} onChange={val => setForm({ ...form, meeting_type: val })} />
          <Select label="Место проведения" options={venues.map(v => ({ value: v.id, label: v.name }))} value={form.venue_id} onChange={val => setForm({ ...form, venue_id: val })} placeholder="Выберите место" />
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Дата проведения</span>
            <DatePicker value={form.held_at} onChange={val => setForm({ ...form, held_at: val })} />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 w-full">
              <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Период рассмотрения — начало</span>
              <DatePicker value={form.period_start} onChange={val => setForm({ ...form, period_start: val })} />
            </div>
            <div className="flex flex-col gap-1.5 w-full">
              <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Период рассмотрения — конец</span>
              <DatePicker value={form.period_end} onChange={val => setForm({ ...form, period_end: val })} />
            </div>
          </div>
          <Button onClick={handleCreate} isLoading={isSubmitting} disabled={!isCreateFormValid} className="w-full">Создать заседание</Button>
        </div>
      </Modal>
    </div>
  );
}
