import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccess } from '../hooks/useAccess';
import { Header } from '../components/Header';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { Icon } from '../ui/Icon';
import { Toast } from '../modals/Toast';
import { Modal } from '../modals/Modal';
import { AccessFallback } from '../ui/AccessFallback';
import { SdkMeetingDocumentsTab } from '../components/Sdk/SdkMeetingDocumentsTab';
import { SdkMeetingDecisionsTab } from '../components/Sdk/SdkMeetingDecisionsTab';
import { getToken } from '../utils/helpers';

const MEETING_TYPES = [
  { value: 'sdk', label: 'СДК' },
  { value: 'kpdu', label: 'КПДУ' },
  { value: 'ak', label: 'АК (не действует)' },
  { value: 'ek', label: 'ЭК' }
];

export function SdkMeetingPage() {
  const { meetingId } = useParams();
  const { checkAccess } = useAccess();

  const canView = checkAccess('SDK_MEETINGS_VIEW');
  const canManage = checkAccess('SDK_MEETINGS_MANAGE');

  const [meeting, setMeeting] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState(null);
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

      <div className="px-10 pt-8 relative z-10">
        <SdkMeetingDecisionsTab
          meetingId={meetingId}
          seasonId={meeting.season_id}
          canManage={canManage}
          setToast={setToast}
          isDrawerOpen={isDecisionDrawerOpen}
          setIsDrawerOpen={setIsDecisionDrawerOpen}
        />
      </div>

      <Modal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} title="Сканы и документы" size="wide">
        <SdkMeetingDocumentsTab meetingId={meetingId} canManage={canManage} setToast={setToast} />
      </Modal>
    </div>
  );
}
