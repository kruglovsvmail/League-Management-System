import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { Table } from '../../ui/Table2';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Modal } from '../../modals/Modal';
import { RoleSelect } from '../../ui/RoleSelect';
import { AccessFallback } from '../../ui/AccessFallback';
import { getImageUrl, getToken } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';

const ROLE_OPTIONS = [
  { value: 'top_manager', label: 'Руководитель' },
  { value: 'league_admin', label: 'Админ' },
  { value: 'referee', label: 'Судья' },
  { value: 'media', label: 'Медиа' }
];

const getRolesDisplay = (rolesStr) => {
  if (!rolesStr) return '-';
  return rolesStr.split(',').map(r => {
    const found = ROLE_OPTIONS.find(opt => opt.value === r.trim());
    return found ? found.label : r.trim();
  }).join(', ');
};

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

export function StaffTab({ setToast }) {
  const { user, selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  
  // Обновленные системные ключи
  const canViewStaff = checkAccess('SETTINGS_STAFF_VIEW');
  const canManageStaff = checkAccess('SETTINGS_STAFF_MANAGE');

  const [staff, setStaff] = useState([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  
  const [phoneRaw, setPhoneRaw] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [isSearchingUser, setIsSearchingUser] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [isAssigning, setIsAssigning] = useState(false);

  const [editModalUser, setEditModalUser] = useState(null);
  const [editRoles, setEditRoles] = useState([]);
  const [isUpdatingStaff, setIsUpdatingStaff] = useState(false);

  useEffect(() => {
    if (selectedLeague?.id && canViewStaff) {
      fetchStaff();
    }
  }, [selectedLeague, canViewStaff]);

  const fetchStaff = async () => {
    setIsLoadingStaff(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-staff`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) setStaff(data.staff);
      else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой загрузки персонала', type: 'error' });
    } finally {
      setIsLoadingStaff(false);
    }
  };

  const handlePhoneChange = async (e) => {
    if (!canManageStaff) return;
    const val = e.target.value.replace(/\D/g, '');
    const truncated = val.slice(0, 10);
    setPhoneRaw(truncated);

    if (truncated.length === 10) {
      setIsSearchingUser(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/lookup?phone=${encodeURIComponent('+7' + truncated)}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        
        if (data.success && data.user) {
          const isAlreadyStaff = staff.some(s => s.user_id === data.user.id);
          if (isAlreadyStaff) {
            setFoundUser(null);
            setToast({ title: 'Внимание', message: 'Этот пользователь уже является сотрудником лиги.', type: 'info' });
          } else {
            setFoundUser(data.user);
            setSelectedRoles([]);
          }
        } else {
          setFoundUser(null);
          setToast({ title: 'Не найдено', message: 'Пользователь не зарегистрирован', type: 'info' });
        }
      } catch (err) {
        setToast({ title: 'Ошибка', message: 'Сбой поиска', type: 'error' });
      } finally {
        setIsSearchingUser(false);
      }
    } else {
      setFoundUser(null);
    }
  };

  const handleAssignStaff = async () => {
    if (!foundUser || selectedRoles.length === 0) {
      setToast({ title: 'Внимание', message: 'Выберите хотя бы одну роль', type: 'error' });
      return;
    }
    setIsAssigning(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-staff`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ userId: foundUser.id, roles: selectedRoles })
      });
      const data = await res.json();
      if (data.success) {
        setToast({ title: 'Успешно', message: 'Сотрудник назначен', type: 'success' });
        setPhoneRaw('');
        setFoundUser(null);
        setSelectedRoles([]);
        fetchStaff();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой назначения', type: 'error' });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleOpenEdit = (userRow) => {
    setEditModalUser(userRow);
    setEditRoles(userRow.roles ? userRow.roles.split(',').map(r => r.trim()) : []);
  };

  const handleSaveEdit = async () => {
    setIsUpdatingStaff(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-staff`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ userId: editModalUser.user_id, roles: editRoles })
      });
      const data = await res.json();
      if (data.success) {
        setToast({ title: 'Успешно', message: 'Роли обновлены', type: 'success' });
        setEditModalUser(null);
        fetchStaff();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой обновления', type: 'error' });
    } finally {
      setIsUpdatingStaff(false);
    }
  };

  if (!canViewStaff) {
    return <AccessFallback variant="full" message="У вас нет прав для просмотра персонала лиги." />;
  }

  const staffColumns = [
    { label: 'Фото', width: 'text-center w-16', render: (row) => (
        <div className="w-[40px] h-[40px] rounded-md overflow-hidden bg-graphite/5 border border-graphite/10 inline-block">
          <img src={getImageUrl(row.avatar_url || '/default/user_default.webp')} className="w-full h-full object-cover" alt="avatar" />
        </div>
    )},
    { label: 'ФИО', sortKey: 'last_name', render: (row) => (
      <div className="flex flex-col text-left">
        <span className="font-bold text-[14px] text-graphite leading-tight block truncate">
          {`${row.last_name || ''} ${row.first_name || ''}`.trim() || 'Без имени'}
        </span>
        {row.middle_name && (
          <span className="text-[12px] text-graphite-light block truncate mt-0.5">
            {row.middle_name}
          </span>
        )}
      </div>
    )},
    { label: 'Телефон', sortKey: 'phone', width: 'w-[160px]',  render: (row) => <span className="font-semibold text-graphite-light">{formatPhoneDisplay(row.phone)}</span> },
    { label: 'Роли', sortKey: 'roles', render: (row) => <span className="font-bold text-orange">{getRolesDisplay(row.roles)}</span> },
    { label: '', width: 'w-12', render: (row) => {
        if (!canManageStaff || row.user_id === user?.id) return null;
        return (
          <button onClick={() => handleOpenEdit(row)} className="p-2 text-graphite-light hover:text-orange hover:bg-orange/10 rounded-lg transition-colors">
            <Icon name="edit" className="w-5 h-5" />
          </button>
        );
    }}
  ];

  return (
    <div className="flex flex-col gap-6 animate-zoom-in">
      {!canManageStaff && (
        <AccessFallback variant="readonly" message="У вас нет прав для управления персоналом. Вы находитесь в режиме просмотра." />
      )}
      
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Левая колонка (Форма) */}
        {canManageStaff && (
          <div className="w-full lg:w-[420px] shrink-0 bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6 flex flex-col gap-5">
            <span className="text-[16px] font-black text-graphite uppercase tracking-wide border-b border-graphite/10 pb-3">Добавить сотрудника</span>
            
            <div className="flex flex-col w-full">
              <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Номер телефона</span>
              <div className="relative flex items-center w-full border border-graphite/40 rounded-md bg-white/30 transition-all duration-300 focus-within:border-orange focus-within:shadow-[0_0_0_3px_rgba(255,122,0,0.2)]">
                <div className="pl-4 pr-2 text-graphite font-semibold border-r border-graphite/10 py-2.5">+7</div>
                <input 
                  type="tel" 
                  placeholder="(000) 000-00-00" 
                  value={formatPhoneDynamic(phoneRaw)} 
                  onChange={handlePhoneChange} 
                  className="w-full px-3 py-2.5 bg-transparent text-graphite text-[14px] outline-none placeholder:text-graphite/30 font-medium" 
                />
                {isSearchingUser && <div className="absolute right-3 w-4 h-4 border-2 border-graphite/10 border-t-orange rounded-full animate-spin"></div>}
              </div>
            </div>

            {foundUser && (
              <div className="bg-white/80 border border-graphite/10 rounded-md p-5 flex flex-col gap-5 animate-zoom-in shadow-sm mt-2">
                <div className="flex items-center gap-4 border-b border-graphite/10 pb-4">
                  <div className="w-[50px] h-[50px] rounded-full overflow-hidden shrink-0 border border-graphite/10 bg-graphite/5">
                    <img src={getImageUrl(foundUser.avatar_url || '/default/user_default.webp')} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-[15px] text-graphite leading-tight">{`${foundUser.last_name} ${foundUser.first_name} ${foundUser.middle_name || ''}`}</span>
                    <span className="text-[12px] text-graphite-light mt-0.5">{foundUser.birth_date ? new Date(foundUser.birth_date).toLocaleDateString('ru-RU') : 'Возраст не указан'}</span>
                  </div>
                </div>
                
                <div className="flex flex-col gap-4">
                  <RoleSelect options={ROLE_OPTIONS} value={selectedRoles} onChange={setSelectedRoles} />
                  <Button onClick={handleAssignStaff} isLoading={isAssigning} className="w-full mt-1">Назначить</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Правая колонка (Таблица) */}
        <div className="flex-1 w-full bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6 min-h-[400px] relative">
          {isLoadingStaff && (
            <div className="absolute inset-0 z-30 flex items-start pt-20 justify-center pointer-events-none">
              <Loader text="" />
            </div>
          )}
          <div className={`transition-opacity duration-300 ease-in-out ${isLoadingStaff ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex justify-between items-center mb-6">
              <span className="text-[16px] font-black text-graphite uppercase tracking-wide">Список персонала</span>
            </div>
            {staff.length > 0 ? (
              <Table columns={staffColumns} data={staff} />
            ) : (
              <div className="text-center py-20 text-graphite-light font-medium">Персонал лиги пока не назначен</div>
            )}
          </div>
        </div>

        {/* Модалка редактирования */}
        <Modal isOpen={!!editModalUser} onClose={() => setEditModalUser(null)} title="Редактирование ролей" size="medium">
          {editModalUser && (
            <div className="flex flex-col gap-6 font-sans">
               <div className="flex items-center gap-4 bg-graphite/5 p-4 rounded-md border border-graphite/10">
                  <div className="w-[50px] h-[50px] rounded-full overflow-hidden shrink-0 border border-white">
                      <img src={getImageUrl(editModalUser.avatar_url || '/default/user_default.webp')} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-[15px] text-graphite">{`${editModalUser.last_name} ${editModalUser.first_name}`}</span>
                    <span className="text-[12px] text-graphite-light mt-0.5">{formatPhoneDisplay(editModalUser.phone)}</span>
                  </div>
               </div>
               <div><RoleSelect options={ROLE_OPTIONS} value={editRoles} onChange={setEditRoles} /></div>
               <div className="flex justify-end pt-5 border-t border-graphite/10">
                 <Button onClick={handleSaveEdit} isLoading={isUpdatingStaff}>Сохранить</Button>
               </div>
            </div>
          )}
        </Modal>

      </div>
    </div>
  );
}