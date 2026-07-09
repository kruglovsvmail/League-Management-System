import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { Table } from '../../ui/Table2';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Modal } from '../../modals/Modal';
import { AccessFallback } from '../../ui/AccessFallback';
import { getToken, getImageUrl } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';
import { Switch } from '../../ui/Switch';
import { Input } from '../../ui/Input';
import { Uploader } from '../../ui/Uploader';
import { SegmentButton } from '../../ui/SegmentButton';
import { ConfirmModal } from '../../modals/ConfirmModal';

const ACCOUNT_TYPES = [
  { value: 'secretary', label: 'Секретарь' },
  { value: 'broadcaster', label: 'Бродкастер' }
];

export function ServiceAccountsTab({ setToast }) {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  
  const canViewAccounts = checkAccess('SETTINGS_SERVICE_ACCOUNTS_VIEW');
  const canManageAccounts = checkAccess('SETTINGS_SERVICE_ACCOUNTS_MANAGE');

  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '', login: '', password: '', account_type: 'secretary', description: '', photoFile: null
  });

  const [editModalAccount, setEditModalAccount] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isUpdating, setIsUpdating] = useState(false);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (selectedLeague?.id && canViewAccounts) {
      fetchAccounts();
    }
  }, [selectedLeague, canViewAccounts]);

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/service-accounts`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) setAccounts(data.accounts);
      else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой загрузки аккаунтов', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.login || !formData.password) {
      setToast({ title: 'Внимание', message: 'Заполните обязательные поля', type: 'error' });
      return;
    }
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('name', formData.name);
      fd.append('login', formData.login);
      fd.append('password', formData.password);
      fd.append('account_type', formData.account_type);
      fd.append('description', formData.description || '');
      if (formData.photoFile) fd.append('photo', formData.photoFile);

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/service-accounts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: fd
      });
      const data = await res.json();
      if (data.success) {
        setToast({ title: 'Успешно', message: 'Аккаунт создан', type: 'success' });
        setFormData({ name: '', login: '', password: '', account_type: 'secretary', description: '', photoFile: null });
        fetchAccounts();
      } else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой создания', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (acc) => {
    setEditModalAccount(acc);
    setEditFormData({
      id: acc.id,
      name: acc.name,
      login: acc.login,
      password: '', // Всегда пустой при открытии
      account_type: acc.account_type,
      description: acc.description || '',
      is_active: acc.is_active,
      photo_url: acc.photo_url,
      photoFile: null,
      clearPhoto: false
    });
  };

  const handleCloseEdit = () => {
    setEditModalAccount(null);
    setEditFormData({});
  };

  const handleSaveEdit = async () => {
    if (!editFormData.name || !editFormData.login) {
      setToast({ title: 'Внимание', message: 'Имя и Логин обязательны', type: 'error' });
      return;
    }
    setIsUpdating(true);
    try {
      const fd = new FormData();
      fd.append('name', editFormData.name);
      fd.append('login', editFormData.login);
      if (editFormData.password) fd.append('password', editFormData.password);
      fd.append('account_type', editFormData.account_type);
      fd.append('description', editFormData.description || '');
      fd.append('is_active', editFormData.is_active);
      
      if (editFormData.photoFile) fd.append('photo', editFormData.photoFile);
      if (editFormData.clearPhoto) fd.append('clear_photo', 'true');

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/service-accounts/${editFormData.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: fd
      });
      const data = await res.json();
      if (data.success) {
        setToast({ title: 'Успешно', message: 'Обновлено', type: 'success' });
        handleCloseEdit();
        fetchAccounts();
      } else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой обновления', type: 'error' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    setIsUpdating(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/service-accounts/${editFormData.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setToast({ title: 'Успешно', message: 'Аккаунт удален', type: 'success' });
        setIsDeleteConfirmOpen(false);
        handleCloseEdit();
        fetchAccounts();
      } else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    if (!canManageAccounts) return;
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;
    
    try {
      const fd = new FormData();
      fd.append('name', acc.name);
      fd.append('login', acc.login);
      fd.append('account_type', acc.account_type);
      fd.append('is_active', !currentStatus);

      await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/service-accounts/${id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: fd
      });
      fetchAccounts();
    } catch(e) { console.error(e); }
  };

  if (!canViewAccounts) return <AccessFallback variant="full" message="Нет доступа к сервисным аккаунтам." />;

  const columns = [
    { 
      label: '', 
      width: 'w-[100px]', 
      render: (row) => (
        <img 
          src={getImageUrl(row.photo_url || '/default/user_default.webp')} 
          className="w-10 h-10 rounded-lg object-cover bg-graphite/5 border border-graphite/10" 
          alt="avatar" 
        />
      )
    },
    { label: 'Название / Логин', sortKey: 'name', render: (row) => (
      <div className="flex flex-col text-left">
        <span 
           className={`font-bold text-[14px] leading-tight block ${canManageAccounts ? 'cursor-pointer hover:text-orange transition-colors' : 'text-graphite'}`} 
           onClick={() => canManageAccounts && handleOpenEdit(row)}
        >
           {row.name}
        </span>
        <span className="text-[12px] font-medium text-graphite/50 flex items-center gap-1 mt-0.5">
           <Icon name="lock" className="w-3 h-3" /> {row.login}
        </span>
      </div>
    )},
    { label: 'Тип доступа', sortKey: 'account_type', render: (row) => (
      <span className="text-[11px] font-black uppercase text-graphite/60 tracking-wider bg-graphite/5 px-2 py-1 rounded-md">
        {ACCOUNT_TYPES.find(t => t.value === row.account_type)?.label || row.account_type}
      </span>
    )},
    { label: 'Активный', width: 'w-24', align: 'center', render: (row) => (
      <Switch 
         checked={row.is_active} 
         onChange={() => toggleStatus(row.id, row.is_active)} 
         disabled={!canManageAccounts} 
      />
    )}
  ];

  return (
    <div className="flex flex-col gap-6 animate-zoom-in">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        
        {/* ТАБЛИЦА (СЛЕВА) */}
        <div className="flex-1 w-full bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 min-h-[400px] relative order-2 lg:order-1">
          {isLoading && <div className="absolute inset-0 z-30 flex pt-20 justify-center"><Loader /></div>}
          <div className={`${isLoading ? 'opacity-20 pointer-events-none' : 'opacity-100'} transition-opacity`}>
            <span className="text-[16px] font-black text-graphite uppercase tracking-wide block mb-6">Список аккаунтов</span>
            {accounts.length > 0 ? <Table columns={columns} data={accounts} /> : <div className="text-center py-20 text-graphite-light font-medium">Аккаунты не найдены</div>}
          </div>
        </div>

        {/* ФОРМА СОЗДАНИЯ (СПРАВА) */}
        {canManageAccounts && (
          <div className="w-full lg:w-[380px] shrink-0 bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 flex flex-col gap-5 sticky top-[100px] order-1 lg:order-2">
            <span className="text-[14px] font-black text-graphite uppercase tracking-wide border-b border-graphite/10 pb-4">Новый аккаунт</span>
            
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                 <SegmentButton 
                   options={ACCOUNT_TYPES.map(t => t.label)}
                   defaultIndex={ACCOUNT_TYPES.findIndex(t => t.value === formData.account_type)}
                   onChange={(idx) => setFormData({...formData, account_type: ACCOUNT_TYPES[idx].value})}
                 />
              </div>

              <Uploader 
                heightClass="h-[110px]"
                onFileSelect={(file) => setFormData({...formData, photoFile: file})}
              />
              <Input 
                placeholder="Название (Имя)" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
              />
              <Input 
                placeholder="Логин" 
                value={formData.login} 
                onChange={e => setFormData({...formData, login: e.target.value})} 
              />
              
              <Input 
                type="text"
                placeholder="Пароль" 
                value={formData.password} 
                onChange={e => setFormData({...formData, password: e.target.value})} 
              />

              <div className="flex flex-col">
                <textarea 
                  placeholder="Цель использования (описание)" 
                  rows={2}
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})} 
                  className="w-full px-3 py-2.5 bg-white/30 border border-graphite/40 rounded-md font-medium text-graphite outline-none focus:border-orange focus:shadow-[0_0_0_3px_rgba(255,122,0,0.2)] transition-all resize-none text-[14px]" 
                />
              </div>

              <Button onClick={handleCreate} isLoading={isSubmitting} className="w-full">Создать аккаунт</Button>
            </div>
          </div>
        )}

        {/* МОДАЛКА РЕДАКТИРОВАНИЯ (ГОРИЗОНТАЛЬНАЯ) */}
        <Modal isOpen={!!editModalAccount} onClose={handleCloseEdit} title="Настройки аккаунта" size="wide">
          <div className="flex flex-col gap-6 font-sans p-1">
            
            {/* Верхний сегмент выбора роли */}
            <div className="flex flex-col gap-2 pb-4 border-b border-graphite/10">
               <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Тип и полномочия доступа</span>
               <SegmentButton 
                 options={ACCOUNT_TYPES.map(t => t.label)}
                 defaultIndex={ACCOUNT_TYPES.findIndex(t => t.value === editFormData.account_type)}
                 onChange={(idx) => setEditFormData({...editFormData, account_type: ACCOUNT_TYPES[idx].value})}
               />
            </div>

            <div className="flex flex-col md:flex-row gap-8">
               {/* Левая колонка: Фото и Статус */}
               <div className="w-full md:w-[200px] flex flex-col gap-5">
                  <Uploader 
                    label="Фото профиля"
                    heightClass="h-[180px]"
                    initialUrl={getImageUrl(editFormData?.photo_url)}
                    onFileSelect={(file, isCleared) => setEditFormData({...editFormData, photoFile: file, clearPhoto: isCleared})}
                  />
                  <div className="flex items-center justify-between bg-white/40 p-3 rounded-md border border-graphite/10">
                    <span className="font-bold text-graphite text-[12px] uppercase">Активен</span>
                    <Switch checked={editFormData?.is_active || false} onChange={(e) => setEditFormData({...editFormData, is_active: e.target.checked})} />
                  </div>
               </div>

               {/* Правая колонка: Поля ввода */}
               <div className="flex-1 flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input 
                      label="Название (Имя)" 
                      value={editFormData?.name || ''} 
                      onChange={e => setEditFormData({...editFormData, name: e.target.value})} 
                    />
                    <Input 
                      label="Логин" 
                      value={editFormData?.login || ''} 
                      onChange={e => setEditFormData({...editFormData, login: e.target.value})} 
                    />
                  </div>

                  <Input 
                    label="Новый пароль" 
                    type="text"
                    placeholder="Введите для изменения" 
                    value={editFormData?.password || ''} 
                    onChange={e => setEditFormData({...editFormData, password: e.target.value})} 
                  />

                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Внутреннее описание / Заметки</span>
                    <textarea 
                      rows={4}
                      value={editFormData?.description || ''} 
                      onChange={e => setEditFormData({...editFormData, description: e.target.value})} 
                      className="w-full px-3 py-2.5 bg-white/30 border border-graphite/40 rounded-md font-medium text-graphite outline-none focus:border-orange focus:shadow-[0_0_0_3px_rgba(255,122,0,0.2)] transition-all resize-none text-[14px]" 
                    />
                  </div>
               </div>
            </div>

            <div className="flex justify-between items-center pt-6 mt-4 border-t border-graphite/10">
               <button onClick={() => setIsDeleteConfirmOpen(true)} className="text-status-rejected text-[13px] font-bold hover:bg-status-rejected/10 px-4 py-2 rounded-md transition-colors">
                 Удалить аккаунт
               </button>
               <Button onClick={handleSaveEdit} isLoading={isUpdating}>Сохранить изменения</Button>
            </div>
          </div>
        </Modal>

        {/* ПЕРСОНАЛЬНОЕ ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ */}
        <ConfirmModal 
           isOpen={isDeleteConfirmOpen} 
           onClose={() => setIsDeleteConfirmOpen(false)} 
           onConfirm={handleDelete} 
           isLoading={isUpdating} 
        />

      </div>
    </div>
  );
}