import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAccess } from '../hooks/useAccess';
import { Header } from '../components/Header';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { Icon } from '../ui/Icon';
import { Toast } from '../modals/Toast';
import { Modal } from '../modals/Modal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { AccessFallback } from '../ui/AccessFallback';
import { SdkMeetingMembersTab } from '../components/Sdk/SdkMeetingMembersTab';
import { SdkMeetingDocumentsTab } from '../components/Sdk/SdkMeetingDocumentsTab';
import { SdkMeetingDecisionsTab } from '../components/Sdk/SdkMeetingDecisionsTab';
import { getToken } from '../utils/helpers';

const MEETING_TYPES = [
  { value: 'sdk', label: 'СДК' },
  { value: 'kpdu', label: 'КПДУ' },
  { value: 'ak', label: 'АК (не действует)' },
  { value: 'ek', label: 'ЭК' }
];

const STATUSES = [
  { value: 'not_specified', label: 'Не указано' },
  { value: 'held_with_issues', label: 'Проводилось. Рассмотрены вопросы' },
  { value: 'held_no_issues', label: 'Проводилось. Нет вопросов к рассмотрению' }
];

export function SdkMeetingPage() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { checkAccess } = useAccess();

  const canView = checkAccess('SDK_MEETINGS_VIEW');
  const canManage = checkAccess('SDK_MEETINGS_MANAGE');

  const [meeting, setMeeting] = useState(null);
  const [venues, setVenues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isDecisionDrawerOpen, setIsDecisionDrawerOpen] = useState(false);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  const fetchMeeting = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setMeeting(data.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (canView) fetchMeeting(); }, [meetingId, canView]);

  useEffect(() => {
    if (meeting?.season_id) {
      fetch(`${SERVER_URL}/api/seasons/${meeting.season_id}/sdk/venues`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => { if (data.success) setVenues(data.data); });
    }
  }, [meeting?.season_id]);

  const handleChange = (field, value) => setMeeting(m => ({ ...m, [field]: value }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({
          season_id: meeting.season_id,
          meeting_type: meeting.meeting_type,
          venue_id: meeting.venue_id,
          sequence_number: meeting.sequence_number,
          held_at: meeting.held_at,
          period_start: meeting.period_start,
          period_end: meeting.period_end,
          status: meeting.status
        })
      });
      const data = await res.json();
      if (data.success) {
        setToast({ title: 'Сохранено', message: 'Данные заседания обновлены', type: 'success' });
        fetchMeeting();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой сохранения', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Удаление уносит за собой всё заседание целиком: явку, документы, решения
  // и назначенные ими наказания — поэтому только через подтверждение
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        navigate('/sdk-meetings');
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
        setIsDeleteOpen(false);
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
      setIsDeleteOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!canView) {
    return (
      <div className="flex flex-col flex-1 animate-zoom-in">
        <Header title="Заседание СДК" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <AccessFallback variant="full" message="У вас нет прав для просмотра заседаний СДК." />
        </main>
      </div>
    );
  }

  if (isLoading || !meeting) {
    return (
      <div className="flex flex-col flex-1 animate-zoom-in">
        <Header title="Заседание СДК" />
        <main className="p-10 flex flex-1 items-center justify-center"><Loader /></main>
      </div>
    );
  }

  const typeLabel = MEETING_TYPES.find(t => t.value === meeting.meeting_type)?.label || meeting.meeting_type;

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header
        title={`${typeLabel} №${meeting.sequence_number ?? '-'}`}
        subtitle={
          <Link to="/sdk-meetings" className="flex items-center gap-1.5 text-[14px] font-bold text-graphite-light hover:text-orange transition-colors">
            <Icon name="chevron_left" className="w-4 h-4" /> К списку заседаний
          </Link>
        }
        actions={
          <div className="flex items-center gap-3">
            <Button onClick={() => setIsDocsOpen(true)} className="bg-white border-graphite/20 text-graphite hover:border-graphite">
              Сканы/Документы
            </Button>
            {canManage && <Button onClick={() => setIsDecisionDrawerOpen(true)}>+ Новое решение</Button>}
          </div>
        }
      />

      {toast && (
        <div className="fixed top-[110px] right-10 z-[9999]">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      )}

      <div className="px-10 pt-8 flex flex-col lg:flex-row gap-8 relative z-10 items-start">
        <div className="flex-1 min-w-0 w-full order-2 lg:order-1">
          <SdkMeetingDecisionsTab
            meetingId={meetingId}
            seasonId={meeting.season_id}
            canManage={canManage}
            setToast={setToast}
            isDrawerOpen={isDecisionDrawerOpen}
            setIsDrawerOpen={setIsDecisionDrawerOpen}
          />
        </div>

        <div className="w-full lg:w-[360px] shrink-0 order-1 lg:order-2 sticky top-[110px] flex flex-col gap-6">
          <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg p-6 shadow-sm flex flex-col gap-4">
          <Input label="Сезон" value={meeting.season_name || ''} disabled />
          {/* Тип комиссии определяет нумерацию заседаний внутри сезона — менять его у созданного нельзя */}
          <Select label="Тип комиссии" options={MEETING_TYPES} value={meeting.meeting_type} onChange={() => {}} disabled />
          <Select label="Место проведения" options={[{ value: '', label: 'Не указано' }, ...venues.map(v => ({ value: v.id, label: v.name }))]} value={meeting.venue_id || ''} onChange={val => handleChange('venue_id', val)} disabled={!canManage} />
          <Select label="Статус" options={STATUSES} value={meeting.status} onChange={val => handleChange('status', val)} disabled={!canManage} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Дата проведения</span>
            <DatePicker value={meeting.held_at ? meeting.held_at.split('T')[0] : ''} onChange={val => handleChange('held_at', val)} disabled={!canManage} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Период — начало</span>
              <DatePicker value={meeting.period_start || ''} onChange={val => handleChange('period_start', val)} disabled={!canManage} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Период — конец</span>
              <DatePicker value={meeting.period_end || ''} onChange={val => handleChange('period_end', val)} disabled={!canManage} />
            </div>
          </div>
          {canManage && (
            <div className="flex flex-col gap-3 mt-2 pt-4 border-t border-graphite/10">
              <Button onClick={handleSave} isLoading={isSaving} className="w-full">Сохранить</Button>
              <button
                type="button"
                onClick={() => setIsDeleteOpen(true)}
                className="w-full py-2.5 rounded-md text-[13px] font-bold text-status-rejected border border-status-rejected/30 hover:bg-status-rejected/10 transition-colors"
              >
                Удалить заседание
              </button>
            </div>
          )}
          </div>

          <SdkMeetingMembersTab meetingId={meetingId} setToast={setToast} />
        </div>
      </div>

      <Modal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} title="Сканы и документы" size="wide">
        <SdkMeetingDocumentsTab meetingId={meetingId} canManage={canManage} setToast={setToast} />
      </Modal>

      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        title="Удаление заседания"
        message={`${typeLabel} №${meeting.sequence_number ?? '-'} будет удалено вместе со всеми решениями, явкой членов комиссии, документами и назначенными наказаниями. Это действие нельзя отменить.`}
        confirmLabel="Удалить"
      />
    </div>
  );
}
