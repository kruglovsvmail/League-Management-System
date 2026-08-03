import React, { useState, useEffect } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getImageUrl, getToken } from '../utils/helpers';

/**
 * Назначение владельца команды (teams.owner_id) глобальным админом.
 * Поиск — глобальный по всем пользователям, а не по базе команды: владелец
 * не обязан в ней состоять. Владелец у команды один, поэтому выбор нового
 * молча заменяет прежнего — это отражено в тексте подтверждения.
 */
export function TeamOwnerDrawer({ isOpen, onClose, teamId, teamName, owner, onSaved }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setQuery(''); setUsers([]); setSelectedUser(null);
      setIsConfirmingRemove(false); setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || query.length < 3) { setUsers([]); return; }
    const fetchUsers = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/users/search?q=${encodeURIComponent(query)}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (data.success) setUsers(data.data);
      } catch (err) { console.error(err); }
    };
    const timer = setTimeout(fetchUsers, 400);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  const save = async (userId) => {
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${teamId}/owner`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        onSaved(data.owner);
        onClose();
      } else {
        setError(data.error || 'Не удалось сохранить владельца');
      }
    } catch (err) {
      console.error(err);
      setError('Сбой сети. Попробуйте ещё раз.');
    }
    setIsSaving(false);
  };

  const isSameAsCurrent = selectedUser && owner && (selectedUser.id === owner.user_id);

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-[450px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-6 py-5 border-b border-graphite/10 bg-white shrink-0">
          <div className="min-w-0">
            <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Владелец команды</h2>
            <span className="block text-[12px] text-graphite-light font-bold truncate mt-0.5">{teamName}</span>
          </div>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Текущий владелец — виден всегда, чтобы админ понимал, что именно заменяет */}
        <div className="p-6 bg-white border-b border-graphite/10 shrink-0">
          <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide mb-3 block">Сейчас назначен</label>
          {owner ? (
            <div className="flex items-center gap-4">
              <img
                src={getImageUrl(owner.avatar_url || '/default/user_default.webp')}
                className="w-12 h-12 object-cover rounded-lg bg-graphite/5 shrink-0"
                alt="avatar"
                onError={(e) => { e.target.src = getImageUrl('/default/user_default.webp') }}
              />
              <div className="min-w-0 flex-1">
                <span className="block font-bold text-graphite text-[14px] truncate">{owner.last_name} {owner.first_name} {owner.middle_name || ''}</span>
                <span className="block text-[11px] text-graphite-light mt-0.5">{owner.phone || 'Нет телефона'}</span>
              </div>
              {isConfirmingRemove ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => save(null)}
                    disabled={isSaving}
                    className="text-[11px] font-black uppercase px-3 py-2 rounded bg-status-rejected text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Снять
                  </button>
                  <button
                    onClick={() => setIsConfirmingRemove(false)}
                    className="text-[11px] font-bold text-graphite-light hover:text-graphite"
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsConfirmingRemove(true)}
                  className="text-[11px] font-black uppercase px-3 py-2 rounded bg-graphite/5 text-graphite-light hover:text-status-rejected shrink-0"
                >
                  Снять
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 text-graphite-light">
              <div className="w-12 h-12 rounded-lg bg-graphite/5 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
              </div>
              <span className="font-bold text-[14px]">Владелец не назначен</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-status-rejected/10 border border-status-rejected/30 rounded-md shrink-0">
            <p className="text-[13px] font-bold text-status-rejected leading-tight">{error}</p>
          </div>
        )}

        {!selectedUser ? (
          <>
            <div className="p-6 bg-white border-b border-graphite/5 shrink-0 mt-4">
              <Input placeholder="Поиск по ФИО или телефону..." value={query} onChange={(e) => setQuery(e.target.value)} />
              <p className="text-[11px] text-graphite-light mt-2 px-1">Глобальный поиск (минимум 3 символа). Владелец не обязан состоять в базе команды.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-2">
              {users.map(u => (
                <div key={u.id} onClick={() => setSelectedUser(u)} className="flex items-center gap-4 p-4 bg-white rounded-md border border-graphite/10 cursor-pointer hover:border-orange hover:shadow-sm transition-all">
                  <img
                    src={getImageUrl(u.avatar_url || '/default/user_default.webp')}
                    className="w-10 h-10 object-cover rounded-lg bg-graphite/5"
                    alt="avatar"
                    onError={(e) => { e.target.src = getImageUrl('/default/user_default.webp') }}
                  />
                  <div className="min-w-0">
                    <span className="block font-bold text-graphite text-[14px] truncate">{u.last_name} {u.first_name}</span>
                    <span className="block text-[11px] text-graphite-light mt-0.5">{u.phone || 'Нет телефона'}</span>
                  </div>
                  {owner && owner.user_id === u.id && (
                    <span className="ml-auto text-[10px] font-black uppercase text-orange shrink-0">Текущий</span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col animate-zoom-in overflow-hidden">
            <div className="p-6 bg-white border-b border-graphite/10 flex items-center gap-4 shrink-0 mt-4">
              <img
                src={getImageUrl(selectedUser.avatar_url || '/default/user_default.webp')}
                className="w-16 h-16 object-cover rounded-md bg-graphite/5 shadow-sm"
                alt="avatar"
                onError={(e) => { e.target.src = getImageUrl('/default/user_default.webp') }}
              />
              <div className="min-w-0">
                <span className="block font-black text-graphite text-lg leading-tight truncate">{selectedUser.last_name} {selectedUser.first_name}</span>
                <span className="block text-[12px] text-graphite-light mt-0.5">{selectedUser.phone || 'Нет телефона'}</span>
                <span className="block text-sm mt-1" onClick={() => setSelectedUser(null)}>
                  <span className="text-orange hover:underline cursor-pointer">Выбрать другого</span>
                </span>
              </div>
            </div>

            <div className="p-6 flex-1 bg-gray-50/50 overflow-y-auto custom-scrollbar">
              {isSameAsCurrent ? (
                <div className="p-4 bg-status-rejected/10 border border-status-rejected/30 rounded-md">
                  <p className="text-[13px] font-bold text-status-rejected leading-tight">Этот пользователь уже является владельцем команды.</p>
                </div>
              ) : (
                <div className="p-4 bg-orange/10 border border-orange/30 rounded-md">
                  <p className="text-[13px] font-bold text-orange leading-tight">
                    Пользователь получит в Team-Room полные права владельца этой команды —
                    даже если он не состоит в её базе.
                    {owner && ' Прежний владелец эти права потеряет: владелец у команды может быть только один.'}
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 bg-white border-t border-graphite/10 shrink-0">
              <Button
                onClick={() => save(selectedUser.id)}
                isLoading={isSaving}
                disabled={isSaving || isSameAsCurrent}
                className={`w-full py-3 transition-all duration-300 ${isSameAsCurrent ? 'opacity-50 grayscale' : ''}`}
              >
                {isSameAsCurrent ? 'Уже владелец' : (owner ? 'Заменить владельца' : 'Назначить владельцем')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
