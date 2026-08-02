import React, { useState, useEffect } from 'react';
import { Loader } from '../../ui/Loader';
import { getImageUrl, getToken } from '../../utils/helpers';

// Информационный блок: кто присутствовал на заседании. Состав формируется при создании
// заседания — штатные члены комиссии сезона попадают в него автоматически, приглашённые
// (судьи и руководители команд) отмечаются в шторке нового заседания.
export function SdkMeetingMembersTab({ meetingId, setToast }) {
  const [attendees, setAttendees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  useEffect(() => {
    setIsLoading(true);
    fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}/members`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      .then(res => res.json())
      .then(data => { if (data.success) setAttendees(data.data); })
      .catch(() => setToast?.({ title: 'Ошибка', message: 'Сбой загрузки состава заседания', type: 'error' }))
      .finally(() => setIsLoading(false));
  }, [meetingId]);

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg p-6 shadow-sm w-full">
      <span className="text-[14px] font-black text-graphite uppercase tracking-wide block mb-4 pb-4 border-b border-graphite/10">Члены СДК</span>

      {attendees.length === 0 ? (
        <div className="text-center py-8 text-graphite-light font-medium text-[13px]">Состав заседания пуст</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
          {attendees.map(a => (
            <div key={a.id} className="flex items-center gap-3 p-2.5 bg-white/40 border border-graphite/10 rounded-md">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/10 border border-graphite/10 shrink-0">
                <img src={getImageUrl(a.avatar_url || '/default/user_default.webp')} alt="avatar" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="font-bold text-[13px] text-graphite truncate">{a.full_name}</span>
                {a.position && <span className="text-[11px] text-graphite-light truncate">{a.position}</span>}
                {a.member_kind === 'invited' && (
                  <span className="text-[10px] font-black uppercase text-status-pending mt-0.5">Приглашён</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
