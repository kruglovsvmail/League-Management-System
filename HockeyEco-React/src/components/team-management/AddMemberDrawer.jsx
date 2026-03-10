import React, { useState, useEffect } from 'react';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { getImageUrl } from '../../utils/helpers';

const POSITIONS = ['goalie', 'defense', 'forward'];
const POS_LABELS = { 'goalie': 'Вратарь', 'defense': 'Защитник', 'forward': 'Нападающий' };

const ROLES = [
  { id: 'head_coach', label: 'Главный тренер' },
  { id: 'coach', label: 'Тренер' },
  { id: 'team_manager', label: 'Менеджер команды' },
  { id: 'team_admin', label: 'Администратор' }
];

export function AddMemberDrawer({ isOpen, onClose, teamId, type, onSuccess, roster = [], staff = [], base = [] }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  
  const [jersey, setJersey] = useState('');
  const [position, setPosition] = useState(POSITIONS[2]); 
  
  const [selectedRoles, setSelectedRoles] = useState(new Set());
  const [initialRoles, setInitialRoles] = useState(new Set()); 
  
  const [isAlreadyInRoster, setIsAlreadyInRoster] = useState(false);
  const [isAlreadyInBase, setIsAlreadyInBase] = useState(false);
  const [isNumberTaken, setIsNumberTaken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (type === 'base') {
        if (query.length >= 3) {
          const fetchUsers = async () => {
            try {
              const token = getToken();
              const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/users/search?q=${query}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const data = await res.json();
              if (data.success) setUsers(data.data);
            } catch (err) { console.error(err); }
          };
          const timer = setTimeout(fetchUsers, 400);
          return () => clearTimeout(timer);
        } else {
          setUsers([]);
        }
      } else {
        let filtered = base || [];
        if (query) {
           const lowerQ = query.toLowerCase();
           filtered = filtered.filter(u => 
             (u.last_name && u.last_name.toLowerCase().includes(lowerQ)) ||
             (u.first_name && u.first_name.toLowerCase().includes(lowerQ)) ||
             (u.phone && u.phone.includes(query))
           );
        }
        setUsers(filtered);
      }
    } else {
      setUsers([]);
    }
  }, [query, isOpen, type, base]);

  useEffect(() => {
    if (!isOpen) {
      setQuery(''); setSelectedUser(null); setJersey(''); 
      setSelectedRoles(new Set()); setInitialRoles(new Set());
      setIsAlreadyInRoster(false); setIsAlreadyInBase(false); setIsNumberTaken(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedUser) {
      const uId = selectedUser.id || selectedUser.user_id;

      if (type === 'roster') {
        const existingPlayer = roster.find(p => p.user_id === uId);
        setIsAlreadyInRoster(!!existingPlayer);
        if (existingPlayer) {
          setJersey(existingPlayer.jersey_number ? String(existingPlayer.jersey_number) : '');
          if (existingPlayer.position) setPosition(existingPlayer.position);
        } else {
          setJersey(''); setPosition(POSITIONS[2]);
        }
      } else if (type === 'staff') {
        const existingStaff = staff.find(s => s.user_id === uId);
        if (existingStaff && existingStaff.roles) {
          const rolesSet = new Set(existingStaff.roles.split(', '));
          setSelectedRoles(rolesSet); setInitialRoles(rolesSet);
        } else {
          setSelectedRoles(new Set()); setInitialRoles(new Set());
        }
      } else if (type === 'base') {
        const existingBase = base.find(b => b.user_id === uId);
        setIsAlreadyInBase(!!existingBase);
      }
    }
  }, [selectedUser, type, roster, staff, base]);

  useEffect(() => {
    if (type === 'roster' && jersey) {
      const parsedJersey = parseInt(jersey);
      const uId = selectedUser?.id || selectedUser?.user_id;
      const taken = roster.some(p => p.jersey_number === parsedJersey && p.user_id !== uId);
      setIsNumberTaken(taken);
    } else {
      setIsNumberTaken(false);
    }
  }, [jersey, type, roster, selectedUser]);

  const toggleRole = (roleId) => {
    const newRoles = new Set(selectedRoles);
    if (newRoles.has(roleId)) newRoles.delete(roleId); else newRoles.add(roleId);
    setSelectedRoles(newRoles);
  };

  const isRolesChanged = () => {
    if (selectedRoles.size !== initialRoles.size) return true;
    for (let role of selectedRoles) if (!initialRoles.has(role)) return true;
    return false;
  };

  const isButtonDisabled = () => {
    if (!selectedUser) return true;
    if (isSaving) return true;
    if (type === 'roster') return isAlreadyInRoster || isNumberTaken || !jersey;
    if (type === 'staff') return selectedRoles.size === 0 || !isRolesChanged();
    if (type === 'base') return isAlreadyInBase;
    return false;
  };

  const getStaffButtonText = () => {
    if (selectedRoles.size === 0) return 'Выберите роли';
    if (!isRolesChanged()) return 'Роли не изменены';
    if (initialRoles.size > 0) return 'Обновить роли';
    return 'Добавить в штаб';
  };

  const handleSave = async () => {
    if (isButtonDisabled() || !teamId) return;
    setIsSaving(true);
    try {
      const uId = selectedUser.id || selectedUser.user_id;
      const payload = { userId: uId, type: type === 'roster' ? 'player' : type === 'staff' ? 'staff' : 'base' };

      if (type === 'roster') {
        payload.jerseyNumber = parseInt(jersey);
        payload.position = position;
      } else if (type === 'staff') {
        payload.roles = Array.from(selectedRoles);
      }

      const token = getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams-manage/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) { onSuccess(); onClose(); } 
      else alert(data.error || 'Ошибка при сохранении');
    } catch (err) { alert('Сетевая ошибка'); }
    setIsSaving(false);
  };

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-[450px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite uppercase tracking-wide">
            {type === 'roster' ? 'Добавить игрока' : type === 'staff' ? 'Добавить персонал' : 'Добавить в базу'}
          </h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {!selectedUser ? (
          <>
            <div className="p-6 bg-white border-b border-graphite/5 shrink-0">
              <Input placeholder="Поиск по ФИО или телефону..." value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
              {type === 'base' && <p className="text-[11px] text-graphite-light mt-2 px-1">Глобальный поиск (минимум 3 символа)</p>}
              {type !== 'base' && <p className="text-[11px] text-graphite-light mt-2 px-1">Поиск только среди участников Базы команды</p>}
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-2">
              {users.map(u => (
                <div key={u.id || u.user_id} onClick={() => setSelectedUser(u)} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-graphite/10 cursor-pointer hover:border-orange hover:shadow-sm transition-all">
                  <img 
                    src={getImageUrl(u.avatar_url || '/default/user_default.webp')} 
                    className="w-10 h-10 object-cover rounded-lg bg-graphite/5" 
                    alt="avatar"
                    onError={(e) => { e.target.src = getImageUrl('/default/user_default.webp') }}
                  />
                  <div>
                    <span className="block font-bold text-graphite text-[14px]">{u.last_name} {u.first_name}</span>
                    <span className="block text-[11px] text-graphite-light mt-0.5">{u.phone || 'Нет телефона'}</span>
                  </div>
                </div>
              ))}
              {type !== 'base' && users.length === 0 && !query && (
                <div className="text-center text-graphite-light mt-10">
                  Нет пользователей в Базе команды.<br/>Сначала добавьте их в разделе "База команды".
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col animate-fade-in overflow-hidden">
            <div className="p-6 bg-white border-b border-graphite/10 flex items-center gap-4 shrink-0">
              <img 
                src={getImageUrl(selectedUser.avatar_url || '/default/user_default.webp')} 
                className="w-16 h-16 object-cover rounded-xl bg-graphite/5 shadow-sm" 
                alt="avatar"
                onError={(e) => { e.target.src = getImageUrl('/default/user_default.webp') }}
              />
              <div>
                <span className="block font-black text-graphite text-lg leading-tight">{selectedUser.last_name} {selectedUser.first_name}</span>
                <span className="block text-sm text-graphite-light mt-1" onClick={() => setSelectedUser(null)}>
                  <span className="text-orange hover:underline cursor-pointer">Выбрать другого</span>
                </span>
              </div>
            </div>

            <div className="p-6 flex-1 bg-gray-50/50 overflow-y-auto custom-scrollbar">
              {type === 'base' && (
                <div className="space-y-6">
                  {isAlreadyInBase ? (
                    <div className="p-4 bg-status-rejected/10 border border-status-rejected/30 rounded-xl flex gap-3 items-start">
                      <svg className="w-5 h-5 text-status-rejected shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      <p className="text-[13px] font-bold text-status-rejected leading-tight">Этот пользователь уже числится в Базе команды.</p>
                    </div>
                  ) : (
                    <div className="p-4 bg-orange/10 border border-orange/30 rounded-xl">
                      <p className="text-[13px] font-bold text-orange leading-tight">Пользователь будет привязан к команде. После этого его можно будет добавить в состав или штаб.</p>
                    </div>
                  )}
                </div>
              )}
              {type === 'roster' && (
                <div className="space-y-6">
                  {isAlreadyInRoster && (
                    <div className="p-4 bg-status-rejected/10 border border-status-rejected/30 rounded-xl flex gap-3 items-start">
                      <svg className="w-5 h-5 text-status-rejected shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      <p className="text-[13px] font-bold text-status-rejected leading-tight">Этот игрок уже находится в игровом ростере команды.</p>
                    </div>
                  )}
                  <div>
                    <Input label="Игровой номер *" placeholder="1-99" value={jersey} onChange={e => setJersey(e.target.value.replace(/\D/g, '').slice(0, 2))} hasError={isNumberTaken} disabled={isAlreadyInRoster} />
                    {isNumberTaken && <span className="text-[12px] font-bold text-status-rejected mt-1.5 block">Номер {jersey} уже занят!</span>}
                  </div>
                  <Select label="Амплуа *" options={POSITIONS.map(p => POS_LABELS[p])} value={POS_LABELS[position]} onChange={(val) => { if(!isAlreadyInRoster) setPosition(POSITIONS.find(p => POS_LABELS[p] === val)); }} />
                </div>
              )}
              {type === 'staff' && (
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide mb-2 block">Роли в команде (можно выбрать несколько)</label>
                  {ROLES.map(role => (
                    <div key={role.id} onClick={() => toggleRole(role.id)} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${selectedRoles.has(role.id) ? 'bg-orange/10 border-orange shadow-sm' : 'bg-white border-graphite/10 hover:border-graphite/30'}`}>
                      <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${selectedRoles.has(role.id) ? 'bg-orange border-orange text-white' : 'border-graphite/30'}`}>
                        {selectedRoles.has(role.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                      </div>
                      <span className={`font-semibold text-[14px] ${selectedRoles.has(role.id) ? 'text-orange' : 'text-graphite'}`}>{role.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 bg-white border-t border-graphite/10 shrink-0">
              <Button onClick={handleSave} isLoading={isSaving} disabled={isButtonDisabled()} className={`w-full py-3 transition-all duration-300 ${isButtonDisabled() ? 'opacity-50 grayscale' : ''}`}>
                {type === 'roster' ? (isAlreadyInRoster ? 'Уже в ростере' : 'Добавить в ростер') : type === 'staff' ? getStaffButtonText() : (isAlreadyInBase ? 'Уже в команде' : 'Добавить в базу команды')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
