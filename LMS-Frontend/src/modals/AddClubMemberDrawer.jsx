import React, { useState, useEffect } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getImageUrl, getToken } from '../utils/helpers';

const CLUB_ROLES = [
  { id: 'top_manager', label: 'Руководитель клуба' },
  { id: 'club_admin', label: 'Администратор клуба' },
  { id: 'coach', label: 'Тренер клуба' }
];

/**
 * Добавление человека в общую базу клуба.
 * Из вкладки «Штаб» (mode = 'staff') сразу предлагаются клубные роли — роль
 * работает только у активного члена клуба, поэтому одно без другого не имеет смысла.
 */
export function AddClubMemberDrawer({ isOpen, onClose, clubId, clubName, mode = 'members', members = [], onSuccess }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const isStaffMode = mode === 'staff';

  useEffect(() => {
    if (!isOpen) {
      setQuery(''); setUsers([]); setSelectedUser(null);
      setSelectedRoles(new Set()); setError('');
    }
  }, [isOpen]);

  // В режиме штаба выбираем из уже существующего состава клуба, в режиме базы —
  // ищем по всем пользователям системы.
  useEffect(() => {
    if (!isOpen) return;

    if (isStaffMode) {
      const lowerQ = query.trim().toLowerCase();
      const filtered = (members || []).filter(m => {
        if (!lowerQ) return true;
        return (m.last_name || '').toLowerCase().includes(lowerQ)
          || (m.first_name || '').toLowerCase().includes(lowerQ)
          || (m.phone || '').includes(query.trim());
      });
      setUsers(filtered.map(m => ({ ...m, id: m.user_id })));
      return;
    }

    if (query.length < 3) { setUsers([]); return; }
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
  }, [query, isOpen, isStaffMode, members]);

  // Подставляем текущие роли выбранного человека, чтобы админ дополнял, а не обнулял набор
  useEffect(() => {
    if (!selectedUser) { setSelectedRoles(new Set()); return; }
    const existing = (members || []).find(m => String(m.user_id) === String(selectedUser.id || selectedUser.user_id));
    setSelectedRoles(new Set(existing?.roles ? existing.roles.split(', ') : []));
  }, [selectedUser, members]);

  const toggleRole = (roleId) => {
    setSelectedRoles(prev => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
      return next;
    });
  };

  const alreadyInClub = selectedUser
    && (members || []).some(m => String(m.user_id) === String(selectedUser.id || selectedUser.user_id));

  const save = async () => {
    if (!selectedUser) return;
    setIsSaving(true);
    setError('');
    try {
      const userId = selectedUser.id || selectedUser.user_id;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/clubs-manage/${clubId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ userId, roles: Array.from(selectedRoles) })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess?.();
        onClose();
      } else {
        setError(data.error || 'Не удалось сохранить');
      }
    } catch (err) {
      console.error(err);
      setError('Сбой сети. Попробуйте ещё раз.');
    }
    setIsSaving(false);
  };

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-[450px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-6 py-5 border-b border-graphite/10 bg-white shrink-0">
          <div className="min-w-0">
            <h2 className="font-black text-xl text-graphite uppercase tracking-wide">
              {isStaffMode ? 'Роли в клубе' : 'Добавить в клуб'}
            </h2>
            <span className="block text-[12px] text-graphite-light font-bold truncate mt-0.5">{clubName}</span>
          </div>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-status-rejected/10 border border-status-rejected/30 rounded-md shrink-0">
            <p className="text-[13px] font-bold text-status-rejected leading-tight">{error}</p>
          </div>
        )}

        {!selectedUser ? (
          <>
            <div className="p-6 bg-white border-b border-graphite/5 shrink-0">
              <Input
                placeholder={isStaffMode ? 'Поиск по составу клуба...' : 'Поиск по ФИО или телефону...'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <p className="text-[11px] text-graphite-light mt-2 px-1">
                {isStaffMode
                  ? 'Роли назначаются только людям из состава клуба.'
                  : 'Глобальный поиск (минимум 3 символа). Человек должен быть уже зарегистрирован в системе.'}
              </p>
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
                  {(members || []).some(m => String(m.user_id) === String(u.id)) && (
                    <span className="ml-auto text-[10px] font-black uppercase text-orange shrink-0">В клубе</span>
                  )}
                </div>
              ))}
              {users.length === 0 && (
                <div className="text-center py-10 text-graphite-light font-medium text-[13px]">
                  {isStaffMode ? 'В составе клуба никого нет' : 'Начните вводить запрос'}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col animate-zoom-in overflow-hidden">
            <div className="p-6 bg-white border-b border-graphite/10 flex items-center gap-4 shrink-0">
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

            <div className="p-6 flex-1 bg-gray-50/50 overflow-y-auto custom-scrollbar flex flex-col gap-4">
              <div>
                <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide mb-3 block">
                  Роли в клубе (необязательно)
                </label>
                <div className="flex flex-wrap gap-2">
                  {CLUB_ROLES.map(role => (
                    <span
                      key={role.id}
                      onClick={() => toggleRole(role.id)}
                      className={`cursor-pointer px-3 py-2 text-[12px] font-bold uppercase rounded border transition-all ${
                        selectedRoles.has(role.id)
                          ? 'bg-orange/10 border-orange text-orange'
                          : 'text-graphite/50 border-graphite/20 hover:border-graphite/40'
                      }`}
                    >
                      {role.label}
                    </span>
                  ))}
                </div>
              </div>

              {alreadyInClub ? (
                <div className="p-4 bg-graphite/5 border border-graphite/10 rounded-md">
                  <p className="text-[13px] font-bold text-graphite-light leading-tight">
                    Человек уже в составе клуба — сохранение обновит только набор ролей.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-orange/10 border border-orange/30 rounded-md">
                  <p className="text-[13px] font-bold text-orange leading-tight">
                    Человек попадёт в общую базу клуба: увидит команды клуба и клубные события
                    в Team-Room. В составы команд это его не добавляет.
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 bg-white border-t border-graphite/10 shrink-0">
              <Button onClick={save} isLoading={isSaving} disabled={isSaving} className="w-full py-3">
                {alreadyInClub ? 'Сохранить роли' : 'Добавить в клуб'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
