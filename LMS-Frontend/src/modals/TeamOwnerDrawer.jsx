import React, { useState, useEffect } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getImageUrl, getToken } from '../utils/helpers';

/**
 * Назначение владельцев команды (team_owners) глобальным админом.
 *
 * Владельцев может быть двое, и оба равны в правах: назначить, снять и поменять их
 * можно только отсюда — в Team-Room управления владельцами нет вовсе.
 *
 * Поиск глобальный по всем пользователям, а не по базе команды: владелец не обязан
 * в ней состоять. Список правится на экране и уходит на сервер целиком одной кнопкой —
 * так видно итог до записи, а не после каждого клика.
 */

const MAX_OWNERS = 2;

const fullName = (p) => `${p.last_name || ''} ${p.first_name || ''}`.trim();
const avatarOf = (p) => getImageUrl(p.avatar_url || '/default/user_default.webp');

// Пользователь из поиска приходит с полем id, владелец из заявки — с user_id.
// Внутри шторки держим одну форму.
const toOwner = (u) => ({
  user_id: u.user_id ?? u.id,
  first_name: u.first_name,
  last_name: u.last_name,
  middle_name: u.middle_name,
  phone: u.phone,
  avatar_url: u.avatar_url,
});

export function TeamOwnerDrawer({ isOpen, onClose, teamId, teamName, owners = [], onSaved }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [list, setList] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setUsers([]);
    setError('');
    setList((owners || []).map(toOwner));
    // Зависимость только от isOpen: owners прилетает новым массивом на каждую перерисовку
    // страницы, и с ним правки сбрасывались бы прямо под руками.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const listIds = new Set(list.map(o => String(o.user_id)));
  const savedIds = (owners || []).map(o => String(o.user_id)).sort().join(',');
  const isDirty = savedIds !== [...listIds].sort().join(',');
  const isFull = list.length >= MAX_OWNERS;

  const add = (user) => {
    if (isFull || listIds.has(String(user.id ?? user.user_id))) return;
    setError('');
    setList(prev => [...prev, toOwner(user)]);
  };

  const remove = (userId) => {
    setError('');
    setList(prev => prev.filter(o => String(o.user_id) !== String(userId)));
  };

  const save = async () => {
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${teamId}/owners`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ userIds: list.map(o => o.user_id) })
      });
      const data = await res.json();
      if (data.success) {
        onSaved(data.owners || []);
        onClose();
      } else {
        setError(data.error || 'Не удалось сохранить владельцев');
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
            <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Владельцы команды</h2>
            <span className="block text-[12px] text-graphite-light font-bold truncate mt-0.5">{teamName}</span>
          </div>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Итоговый список — виден всегда, чтобы админ понимал, что именно запишется */}
        <div className="p-6 bg-white border-b border-graphite/10 shrink-0">
          <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide mb-3 block">
            Владельцы ({list.length} из {MAX_OWNERS})
          </label>

          {list.length === 0 ? (
            <div className="flex items-center gap-3 text-graphite-light">
              <div className="w-12 h-12 rounded-lg bg-graphite/5 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
              </div>
              <span className="font-bold text-[14px]">Владелец не назначен</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map(o => (
                <div key={o.user_id} className="flex items-center gap-4">
                  <img
                    src={avatarOf(o)}
                    className="w-12 h-12 object-cover rounded-lg bg-graphite/5 shrink-0"
                    alt="avatar"
                    onError={(e) => { e.target.src = getImageUrl('/default/user_default.webp') }}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block font-bold text-graphite text-[14px] truncate">{fullName(o)} {o.middle_name || ''}</span>
                    <span className="block text-[11px] text-graphite-light mt-0.5">{o.phone || 'Нет телефона'}</span>
                  </div>
                  <button
                    onClick={() => remove(o.user_id)}
                    className="text-[11px] font-black uppercase px-3 py-2 rounded bg-graphite/5 text-graphite-light hover:text-status-rejected shrink-0"
                  >
                    Снять
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-status-rejected/10 border border-status-rejected/30 rounded-md shrink-0">
            <p className="text-[13px] font-bold text-status-rejected leading-tight">{error}</p>
          </div>
        )}

        <div className="p-6 bg-white border-b border-graphite/5 shrink-0 mt-4">
          <Input
            placeholder="Поиск по ФИО или телефону..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isFull}
          />
          <p className="text-[11px] text-graphite-light mt-2 px-1">
            {isFull
              ? `Владельцев уже ${MAX_OWNERS} — больше не добавить. Снимите одного, чтобы освободить место.`
              : 'Глобальный поиск (минимум 3 символа). Владелец не обязан состоять в базе команды.'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-2">
          {!isFull && users.map(u => {
            const already = listIds.has(String(u.id));
            return (
              <div
                key={u.id}
                onClick={() => !already && add(u)}
                className={`flex items-center gap-4 p-4 bg-white rounded-md border transition-all ${
                  already
                    ? 'border-graphite/10 opacity-60'
                    : 'border-graphite/10 cursor-pointer hover:border-orange hover:shadow-sm'
                }`}
              >
                <img
                  src={avatarOf(u)}
                  className="w-10 h-10 object-cover rounded-lg bg-graphite/5"
                  alt="avatar"
                  onError={(e) => { e.target.src = getImageUrl('/default/user_default.webp') }}
                />
                <div className="min-w-0">
                  <span className="block font-bold text-graphite text-[14px] truncate">{fullName(u)}</span>
                  <span className="block text-[11px] text-graphite-light mt-0.5">{u.phone || 'Нет телефона'}</span>
                </div>
                {already && <span className="ml-auto text-[10px] font-black uppercase text-orange shrink-0">Уже владелец</span>}
              </div>
            );
          })}
        </div>

        <div className="p-6 bg-white border-t border-graphite/10 shrink-0 flex flex-col gap-3">
          {isDirty && (
            <div className="p-4 bg-orange/10 border border-orange/30 rounded-md">
              <p className="text-[13px] font-bold text-orange leading-tight">
                {list.length === 0
                  ? 'У команды не останется владельца: прежние потеряют права в Team-Room.'
                  : 'Владельцы получат в Team-Room полные права на эту команду — даже если не состоят в её базе. Снятые эти права потеряют.'}
              </p>
            </div>
          )}

          <Button
            onClick={save}
            isLoading={isSaving}
            disabled={isSaving || !isDirty}
            className={`w-full py-3 transition-all duration-300 ${!isDirty ? 'opacity-50 grayscale' : ''}`}
          >
            {isDirty ? 'Сохранить владельцев' : 'Изменений нет'}
          </Button>
        </div>
      </div>
    </div>
  );
}
