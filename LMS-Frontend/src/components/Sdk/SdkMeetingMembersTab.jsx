import React, { useState, useEffect } from 'react';
import { Select } from '../../ui/Select';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { getImageUrl, getToken } from '../../utils/helpers';

export function SdkMeetingMembersTab({ meetingId, seasonId, canManage, setToast }) {
  const [attendees, setAttendees] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  const fetchAttendees = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}/members`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setAttendees(data.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendees();
    if (seasonId) {
      fetch(`${SERVER_URL}/api/seasons/${seasonId}/sdk/commission-members`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => { if (data.success) setAllMembers(data.data); });
    }
  }, [meetingId, seasonId]);

  const availableMembers = allMembers.filter(m => !attendees.some(a => a.commission_member_id === m.id));

  const handleAdd = async () => {
    if (!selectedMemberId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ commission_member_id: selectedMemberId })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedMemberId('');
        fetchAttendees();
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой сохранения', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (id) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meeting-members/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) fetchAttendees();
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
    }
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg p-6 shadow-sm w-full min-h-[300px]">
      {canManage && (
        <div className="flex gap-3 mb-6 pb-6 border-b border-graphite/10">
          <Select options={availableMembers.map(m => ({ value: m.id, label: m.full_name }))} value={selectedMemberId} onChange={setSelectedMemberId} placeholder="Выберите члена комиссии" />
          <Button onClick={handleAdd} isLoading={isSubmitting} className="shrink-0">Добавить</Button>
        </div>
      )}

      {attendees.length === 0 ? (
        <div className="text-center py-12 text-graphite-light font-medium">Явка ещё не отмечена</div>
      ) : (
        <div className="flex flex-col gap-2">
          {attendees.map(a => (
            <div key={a.id} className="flex items-center justify-between p-3 bg-white/40 border border-graphite/10 rounded-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/10 border border-graphite/10 shrink-0">
                  <img src={getImageUrl(a.avatar_url || '/default/user_default.webp')} alt="avatar" className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-[14px] text-graphite">{a.full_name}</span>
                  {a.position && <span className="text-[12px] text-graphite-light">{a.position}</span>}
                </div>
              </div>
              {canManage && (
                <button onClick={() => handleRemove(a.id)} className="p-2 text-graphite-light hover:text-status-rejected hover:bg-status-rejected/10 rounded-lg transition-colors">
                  <Icon name="delete" className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
