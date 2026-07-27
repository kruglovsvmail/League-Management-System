import React, { useState, useEffect } from 'react';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { getToken, getImageUrl } from '../../utils/helpers';

const formatPhoneDisplay = (raw) => {
  if (!raw) return '-';
  const cleaned = raw.replace(/\D/g, '');
  const match = cleaned.match(/^(7|8)?(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (match) return `+7 (${match[2]}) ${match[3]}-${match[4]}-${match[5]}`;
  return raw;
};

const formatPhoneDynamic = (raw) => {
  if (!raw) return '';
  let res = '';
  if (raw.length > 0) res += '(' + raw.substring(0, 3);
  if (raw.length >= 4) res += ') ' + raw.substring(3, 6);
  if (raw.length >= 7) res += '-' + raw.substring(6, 8);
  if (raw.length >= 9) res += '-' + raw.substring(8, 10);
  return res;
};

export function SdkMeetingRepresentativesTab({ meetingId, canManage, setToast }) {
  const [invitees, setInvitees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [manualMode, setManualMode] = useState(false);
  const [phoneRaw, setPhoneRaw] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [manualName, setManualName] = useState('');

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  const fetchInvitees = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}/representatives`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setInvitees(data.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchInvitees(); }, [meetingId]);

  const handlePhoneChange = async (e) => {
    const val = e.target.value.replace(/\D/g, '');
    const truncated = val.slice(0, 10);
    setPhoneRaw(truncated);
    setFoundUser(null);

    if (truncated.length === 10) {
      setIsSearching(true);
      try {
        const res = await fetch(`${SERVER_URL}/api/users/lookup?phone=${encodeURIComponent('+7' + truncated)}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (data.success && data.user) {
          setFoundUser(data.user);
        } else {
          setToast({ title: 'Не найдено', message: 'Пользователь не зарегистрирован', type: 'info' });
        }
      } catch (err) {
        setToast({ title: 'Ошибка', message: 'Сбой поиска', type: 'error' });
      } finally {
        setIsSearching(false);
      }
    }
  };

  const resetFields = () => {
    setPhoneRaw('');
    setFoundUser(null);
    setManualName('');
  };

  const handleAdd = async () => {
    const full_name = manualMode
      ? manualName.trim()
      : foundUser ? `${foundUser.last_name} ${foundUser.first_name} ${foundUser.middle_name || ''}`.trim() : '';

    if (!full_name) {
      setToast({ title: 'Внимание', message: manualMode ? 'Укажите ФИО' : 'Найдите пользователя по телефону', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}/representatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ full_name, user_id: manualMode ? null : foundUser?.id || null })
      });
      const data = await res.json();
      if (data.success) {
        resetFields();
        fetchInvitees();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой сохранения', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (id) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meeting-representatives/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) fetchInvitees();
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
    }
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg p-6 shadow-sm w-full min-h-[300px]">
      {canManage && (
        <div className="flex flex-col gap-3 mb-6 pb-6 border-b border-graphite/10">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Новый приглашённый</span>
            <button onClick={() => { resetFields(); setManualMode(m => !m); }} className="text-[11px] font-bold text-orange hover:underline">
              {manualMode ? 'Найти по телефону' : 'Без аккаунта'}
            </button>
          </div>

          <div className="flex gap-3 items-start">
            {!manualMode ? (
              <div className="flex-1 flex flex-col gap-2">
                <div className="relative flex items-center w-full border border-graphite/40 rounded-md bg-white/70 transition-all duration-300 focus-within:border-orange focus-within:shadow-[0_0_0_3px_rgba(255,122,0,0.2)]">
                  <div className="pl-4 pr-2 text-graphite font-semibold border-r border-graphite/10 py-2.5">+7</div>
                  <input
                    type="tel"
                    placeholder="(000) 000-00-00"
                    value={formatPhoneDynamic(phoneRaw)}
                    onChange={handlePhoneChange}
                    className="w-full px-3 py-2.5 bg-transparent text-graphite text-[14px] outline-none placeholder:text-graphite/30 font-medium"
                  />
                  {isSearching && <div className="absolute right-3 w-4 h-4 border-2 border-graphite/10 border-t-orange rounded-full animate-spin"></div>}
                </div>
                {foundUser && (
                  <div className="flex items-center gap-3 bg-white/40 border border-graphite/10 rounded-md p-3 animate-zoom-in">
                    <div className="w-[36px] h-[36px] rounded-full overflow-hidden shrink-0 border border-graphite/10 bg-graphite/5">
                      <img src={getImageUrl(foundUser.avatar_url || '/default/user_default.webp')} className="w-full h-full object-cover" alt="avatar" />
                    </div>
                    <span className="font-bold text-[13px] text-graphite">{`${foundUser.last_name} ${foundUser.first_name}`}</span>
                  </div>
                )}
              </div>
            ) : (
              <Input placeholder="ФИО" value={manualName} onChange={e => setManualName(e.target.value)} />
            )}
            <Button onClick={handleAdd} isLoading={isSubmitting} className="shrink-0">Добавить</Button>
          </div>
        </div>
      )}

      {invitees.length === 0 ? (
        <div className="text-center py-12 text-graphite-light font-medium">Приглашённые не добавлены</div>
      ) : (
        <div className="flex flex-col gap-2">
          {invitees.map(r => (
            <div key={r.id} className="flex items-center justify-between p-3 bg-white/40 border border-graphite/10 rounded-md">
              <div className="flex items-center gap-3">
                {r.user_id && (
                  <div className="w-[32px] h-[32px] rounded-full overflow-hidden shrink-0 border border-graphite/10 bg-graphite/5">
                    <img src={getImageUrl(r.avatar_url || '/default/user_default.webp')} className="w-full h-full object-cover" alt="avatar" />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="font-bold text-[14px] text-graphite">{r.full_name}</span>
                  <span className="text-[12px] text-graphite-light">{[formatPhoneDisplay(r.phone) !== '-' ? formatPhoneDisplay(r.phone) : null, r.team_name].filter(Boolean).join(' • ')}</span>
                </div>
              </div>
              {canManage && (
                <button onClick={() => handleRemove(r.id)} className="p-2 text-graphite-light hover:text-status-rejected hover:bg-status-rejected/10 rounded-lg transition-colors">
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
