import React, { useState, useEffect } from 'react';
import { useAccess } from '../../hooks/useAccess';
import { Table } from '../../ui/Table2';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { ConfirmModal } from '../../modals/ConfirmModal';
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

export function SdkCommissionMembersSection({ seasonId, setToast }) {
  const { checkAccess } = useAccess();
  const canManage = checkAccess('SDK_REFERENCES_MANAGE');

  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [manualMode, setManualMode] = useState(false);
  const [phoneRaw, setPhoneRaw] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [manualName, setManualName] = useState('');
  const [position, setPosition] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [memberToDelete, setMemberToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMembers = async () => {
    if (!seasonId) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${seasonId}/sdk/commission-members`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) setMembers(data.data);
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой загрузки участников СДК', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchMembers(); }, [seasonId]);

  const handlePhoneChange = async (e) => {
    const val = e.target.value.replace(/\D/g, '');
    const truncated = val.slice(0, 10);
    setPhoneRaw(truncated);
    setFoundUser(null);

    if (truncated.length === 10) {
      setIsSearching(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/lookup?phone=${encodeURIComponent('+7' + truncated)}`, {
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
    setPosition('');
  };

  const resetForm = () => {
    resetFields();
    setManualMode(false);
  };

  const handleCreate = async () => {
    const full_name = manualMode
      ? manualName.trim()
      : foundUser ? `${foundUser.last_name} ${foundUser.first_name} ${foundUser.middle_name || ''}`.trim() : '';

    if (!full_name) {
      setToast({ title: 'Внимание', message: manualMode ? 'Укажите ФИО' : 'Найдите пользователя по телефону', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${seasonId}/sdk/commission-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ full_name, position: position.trim() || null, user_id: manualMode ? null : foundUser?.id || null })
      });
      const data = await res.json();
      if (data.success) {
        resetForm();
        fetchMembers();
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
    if (!memberToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/sdk/commission-members/${memberToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setMemberToDelete(null);
        fetchMembers();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
        setMemberToDelete(null);
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = [
    { label: 'ФИО', sortKey: 'full_name', render: (row) => (
      <div className="flex items-center gap-3">
        {row.user_id && (
          <div className="w-[32px] h-[32px] rounded-full overflow-hidden shrink-0 border border-graphite/10 bg-graphite/5">
            <img src={getImageUrl(row.avatar_url || '/default/user_default.webp')} className="w-full h-full object-cover" alt="avatar" />
          </div>
        )}
        <span className="font-bold text-graphite">{row.full_name}</span>
      </div>
    )},
    { label: 'Должность', sortKey: 'position', render: (row) => <span className="text-graphite-light">{row.position || '-'}</span> },
    { label: 'Телефон', width: 'w-[160px]', render: (row) => <span className="font-semibold text-graphite-light">{formatPhoneDisplay(row.phone)}</span> },
    { label: '', width: 'w-12', align: 'center', render: (row) => {
        if (!canManage) return null;
        return (
          <button onClick={() => setMemberToDelete(row)} className="p-2 text-graphite-light hover:text-status-rejected hover:bg-status-rejected/10 rounded-lg transition-colors">
            <Icon name="delete" className="w-5 h-5" />
          </button>
        );
    }}
  ];

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      <div className="flex-1 w-full bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 min-h-[300px] order-2 lg:order-1">
        {members.length > 0 ? (
          <Table columns={columns} data={members} />
        ) : (
          <div className="text-center py-20 text-graphite-light font-medium">Участники комиссии ещё не добавлены</div>
        )}
      </div>

      {canManage && seasonId && (
        <div className="w-full lg:w-[460px] shrink-0 bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 flex flex-col gap-4 sticky top-[100px] order-1 lg:order-2">
          <div className="flex items-center justify-between border-b border-graphite/10 pb-4">
            <span className="text-[14px] font-black text-graphite uppercase tracking-wide">Новый участник</span>
            <button onClick={() => { resetFields(); setManualMode(m => !m); }} className="text-[11px] font-bold text-orange hover:underline">
              {manualMode ? 'Найти по телефону' : 'Без аккаунта'}
            </button>
          </div>

          {!manualMode ? (
            <>
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
            </>
          ) : (
            <Input placeholder="ФИО" value={manualName} onChange={e => setManualName(e.target.value)} />
          )}

          <Input placeholder="Должность (например, Председатель СДК)" value={position} onChange={e => setPosition(e.target.value)} />
          <Button onClick={handleCreate} isLoading={isSubmitting} className="w-full">Добавить</Button>
        </div>
      )}

      <ConfirmModal
        isOpen={!!memberToDelete}
        onClose={() => setMemberToDelete(null)}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
