import React, { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom'; // Добавили useSearchParams
import { useAccess } from '../hooks/useAccess';
import { Header } from '../components/Header';
import { SegmentButton } from '../ui/SegmentButton';
import { Table } from '../ui/Table';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { Toast } from '../modals/Toast';
import { ConfirmModal } from '../modals/ConfirmModal';
import { Modal } from '../modals/Modal';
import { RoleSelect } from '../ui/RoleSelect';
import { Badge } from '../ui/Badge';
import { getImageUrl, getToken } from '../utils/helpers';

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

export function SettingsPage() {
  const { user, selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();

  // Распределяем права текущего юзера по переменным
  const canViewStaff = checkAccess('VIEW_STAFF');
  const canManageStaff = checkAccess('MANAGE_STAFF');
  const canViewQuals = checkAccess('VIEW_QUALIFICATIONS');
  const canAddQuals = checkAccess('ADD_QUALIFICATIONS');
  const canDeleteQuals = checkAccess('DELETE_QUALIFICATIONS');

  // === НАСТРОЙКА URL-ПАРАМЕТРОВ ===
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseInt(searchParams.get('tab') || '0', 10);

  const setActiveTab = (index) => {
    setSearchParams(prev => {
      prev.set('tab', index);
      return prev;
    }, { replace: true });
  };
  // ================================

  const [toast, setToast] = useState(null);

  // Стейты Вкладки 1 (Персонал)
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

  // Стейты Вкладки 2 (Квалификации)
  const [qualifications, setQualifications] = useState([]);
  const [isLoadingQuals, setIsLoadingQuals] = useState(false);
  
  const [newQual, setNewQual] = useState({ name: '', shortName: '', description: '' });
  const [isAddingQual, setIsAddingQual] = useState(false);
  
  const [confirmDeleteQual, setConfirmDeleteQual] = useState(null);
  const [isDeletingQual, setIsDeletingQual] = useState(false);

  useEffect(() => {
    if (selectedLeague?.id) {
      if (activeTab === 0 && canViewStaff) fetchStaff();
      if (activeTab === 1 && canViewQuals) fetchQualifications();
    }
  }, [selectedLeague, activeTab, canViewStaff, canViewQuals]);

  // === ЛОГИКА ВКЛАДКИ 1: ПЕРСОНАЛ ===
  
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
    if (!canManageStaff) return; // Защита на уровне функции
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
        // Защита: прячем кнопку редактирования, если нет прав или это сам текущий юзер
        if (!canManageStaff || row.user_id === user?.id) return null;
        
        return (
          <button onClick={() => handleOpenEdit(row)} className="p-2 text-graphite-light hover:text-orange hover:bg-orange/10 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
        );
    }}
  ];

  // === ЛОГИКА ВКЛАДКИ 2: КВАЛИФИКАЦИИ ===

  const fetchQualifications = async () => {
    setIsLoadingQuals(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-qualifications`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) setQualifications(data.qualifications);
      else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой загрузки', type: 'error' });
    } finally {
      setIsLoadingQuals(false);
    }
  };

  const handleAddQual = async () => {
    if (!newQual.name || !newQual.shortName || !newQual.description) {
      setToast({ title: 'Ошибка', message: 'Заполните все поля', type: 'error' });
      return;
    }
    setIsAddingQual(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-qualifications`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(newQual)
      });
      const data = await res.json();
      if (data.success) {
        setToast({ title: 'Успешно', message: 'Квалификация добавлена', type: 'success' });
        setNewQual({ name: '', shortName: '', description: '' });
        fetchQualifications();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой добавления', type: 'error' });
    } finally {
      setIsAddingQual(false);
    }
  };

  const handleDeleteQual = async () => {
    setIsDeletingQual(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-qualifications/${confirmDeleteQual.id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setToast({ title: 'Успешно', message: 'Квалификация удалена', type: 'success' });
        setConfirmDeleteQual(null);
        fetchQualifications();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
    } finally {
      setIsDeletingQual(false);
    }
  };

  // Если нет выбранной лиги
  if (!selectedLeague) {
    return (
      <div className="flex flex-col flex-1 animate-fade-in-down">
        <Header title="Настройки лиги" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <div className="text-center text-graphite-light font-medium text-lg">Выберите лигу для управления настройками</div>
        </main>
      </div>
    );
  }

  // Если у пользователя вообще нет доступа ни к персоналу, ни к квалификациям (например, роль "media")
  if (!canViewStaff && !canViewQuals) {
    return (
      <div className="flex flex-col flex-1 animate-fade-in-down">
        <Header title="Настройки лиги" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <div className="text-center text-status-rejected font-medium text-lg bg-status-rejected/5 px-8 py-6 rounded-2xl border border-status-rejected/10">
            У вас нет прав для просмотра этого раздела
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header title="Настройки лиги" />
      
      {toast && <div className="fixed top-[110px] right-10 z-[9999]"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <div className="flex items-start px-10 pt-8 gap-8 relative z-10">
        
        {/* ЛЕВАЯ ПАНЕЛЬ ФИЛЬТРОВ И ФОРМ (Зафиксирована) */}
        <div className="w-[420px] shrink-0 sticky top-[128px] max-h-[calc(100vh-140px)] overflow-y-auto bg-white/30 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-6 flex flex-col gap-6 custom-scrollbar z-20">
          
          <div className="shrink-0 mb-2">
            <SegmentButton 
              options={['Персонал', 'Квалификации игроков']} 
              defaultIndex={activeTab} 
              onChange={setActiveTab} 
            />
          </div>

          {/* ФОРМА ПЕРСОНАЛА */}
          {activeTab === 0 && (
            <div className="flex flex-col gap-5 animate-fade-in-down">
              {!canViewStaff ? (
                <div className="text-sm text-graphite-light text-center py-10">Нет прав для просмотра персонала</div>
              ) : (
                <>
                  <div className="flex justify-between items-center pb-2 border-b border-graphite/10"></div>
                  
                  <div className="flex flex-col w-full">
                    <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Номер телефона</span>
                    <div className={`relative flex items-center w-full border border-graphite/20 rounded-md bg-white transition-all duration-300 ${canManageStaff ? 'focus-within:border-orange focus-within:shadow-[0_0_0_3px_rgba(255,122,0,0.2)]' : 'bg-graphite/5'}`}>
                      <div className="pl-4 pr-2 text-graphite font-semibold border-r border-graphite/10 py-2.5">+7</div>
                      <input 
                        type="tel" 
                        placeholder="(000) 000-00-00" 
                        value={formatPhoneDynamic(phoneRaw)} 
                        onChange={handlePhoneChange} 
                        disabled={!canManageStaff}
                        className="w-full px-3 py-2.5 bg-transparent text-graphite text-[14px] outline-none placeholder:text-graphite/30 font-medium disabled:opacity-50 disabled:cursor-not-allowed" 
                      />
                      {isSearchingUser && <div className="absolute right-3 w-4 h-4 border-2 border-graphite/10 border-t-orange rounded-full animate-spin"></div>}
                    </div>
                  </div>

                  {foundUser && canManageStaff && (
                    <div className="bg-white/80 border border-graphite/10 rounded-xl p-5 flex flex-col gap-5 animate-fade-in-down shadow-sm">
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
                        <Button onClick={handleAssignStaff} disabled={!canManageStaff} isLoading={isAssigning} className="w-full mt-1">Назначить</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ФОРМА КВАЛИФИКАЦИЙ */}
          {activeTab === 1 && (
            <div className="flex flex-col gap-5 animate-fade-in-down">
              {!canViewQuals ? (
                <div className="text-sm text-graphite-light text-center py-10">Нет прав для просмотра квалификаций</div>
              ) : (
                <>
                  <div className="flex justify-between items-center pb-2 border-b border-graphite/10"></div>
                  
                  <div className="flex flex-col gap-4">
                    <Input label="Полное Название" placeholder="Любитель" disabled={!canAddQuals} value={newQual.name} onChange={(e) => setNewQual({...newQual, name: e.target.value})} />
                    <Input label="Короткое название (Метка)" placeholder="ЛЮБ" disabled={!canAddQuals} value={newQual.shortName} onChange={(e) => setNewQual({...newQual, shortName: e.target.value.substring(0, 5)})} />
                    
                    <div className="flex flex-col w-full mt-1">
                      <label className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Описание критериев</label>
                      <textarea 
                        placeholder="Опишите, кто подходит под эту квалификацию..." 
                        value={newQual.description} 
                        onChange={(e) => setNewQual({...newQual, description: e.target.value})} 
                        disabled={!canAddQuals}
                        className="w-full h-[120px] px-3 py-2.5 border border-graphite/30 rounded-md bg-white/80 text-graphite text-[13px] font-medium outline-none transition-all duration-300 focus:border-orange focus:bg-white resize-none disabled:bg-graphite/5 disabled:text-graphite/50 disabled:cursor-not-allowed" 
                      />
                    </div>
                    
                    <Button onClick={handleAddQual} disabled={!canAddQuals} isLoading={isAddingQual} className="w-full mt-2">Добавить в справочник</Button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>

        {/* ПРАВАЯ ЧАСТЬ - КОНТЕНТ */}
        <div className="flex-1 relative z-10 min-h-[500px]">
          
          {/* ТАБЛИЦА ПЕРСОНАЛА */}
          {activeTab === 0 && canViewStaff && (
            <>
              {isLoadingStaff && (
                <div className="absolute inset-0 z-30 flex items-start pt-20 justify-center pointer-events-none">
                  <Loader text="Загрузка персонала..." />
                </div>
              )}
              <div className={`transition-opacity duration-300 ease-in-out ${isLoadingStaff ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
                {staff.length > 0 ? (
                  <Table columns={staffColumns} data={staff} />
                ) : (
                  <div className="text-center py-20 text-graphite-light font-medium">Персонал лиги пока не назначен</div>
                )}
              </div>
            </>
          )}

          {/* СЕТКА КВАЛИФИКАЦИЙ */}
          {activeTab === 1 && canViewQuals && (
            <>
              {isLoadingQuals && (
                <div className="absolute inset-0 z-30 flex items-start pt-20 justify-center pointer-events-none">
                  <Loader text="Загрузка квалификаций..." />
                </div>
              )}
              <div className={`transition-opacity duration-300 ease-in-out ${isLoadingQuals ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
                {qualifications.length > 0 ? (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    {qualifications.map(qual => (
                      <div key={qual.id} className="bg-white/60 backdrop-blur-md border border-graphite/15 rounded-xl p-5 flex flex-col gap-3 relative group transition-all hover:shadow-md hover:border-orange/30">
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-1.5 pr-8">
                            <span className="font-bold text-[16px] text-graphite">{qual.name}</span>
                            <Badge label={qual.short_name} type="filled" />
                          </div>
                          {/* Кнопка удаления отображается только при наличии прав */}
                          {canDeleteQuals && (
                            <button onClick={() => setConfirmDeleteQual(qual)} className="absolute top-4 right-4 w-7 h-7 flex justify-center items-center rounded-md bg-status-rejected/10 text-status-rejected opacity-0 group-hover:opacity-100 transition-all hover:bg-status-rejected hover:text-white">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                          )}
                        </div>
                        <p className="text-[13px] text-graphite-light leading-relaxed mt-2 border-t border-graphite/10 pt-3">
                          {qual.description || 'Нет описания.'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 text-graphite-light font-medium">Нет созданных квалификаций</div>
                )}
              </div>
            </>
          )}

        </div>
      </div>

      {/* Модалки (Доступны только если можно редактировать, но на всякий случай оставляем защиту) */}
      <Modal isOpen={!!editModalUser} onClose={() => setEditModalUser(null)} title="Редактирование ролей" size="medium">
        {editModalUser && (
          <div className="flex flex-col gap-6 font-sans">
             <div className="flex items-center gap-4 bg-graphite/5 p-4 rounded-xl border border-graphite/10">
                <div className="w-[50px] h-[50px] rounded-full overflow-hidden shrink-0 border border-white">
                    <img src={getImageUrl(editModalUser.avatar_url || '/default/user_default.webp')} alt="Avatar" className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-[15px] text-graphite">{`${editModalUser.last_name} ${editModalUser.first_name}`}</span>
                  <span className="text-[12px] text-graphite-light mt-0.5">{formatPhoneDisplay(editModalUser.phone)}</span>
                </div>
             </div>
             <div><RoleSelect options={ROLE_OPTIONS} value={editRoles} onChange={setEditRoles} /></div>
             <div className="flex justify-end pt-5 border-t border-graphite/10"><Button onClick={handleSaveEdit} isLoading={isUpdatingStaff}>Сохранить</Button></div>
          </div>
        )}
      </Modal>

      <ConfirmModal isOpen={!!confirmDeleteQual} onClose={() => setConfirmDeleteQual(null)} onConfirm={handleDeleteQual} isLoading={isDeletingQual} />
    </div>
  );
}