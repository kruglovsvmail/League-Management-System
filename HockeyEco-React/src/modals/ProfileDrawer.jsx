// src/modals/ProfileDrawer.jsx
import React, { useState, useEffect } from 'react';
import { Uploader } from '../ui/Uploader';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getImageUrl, setExpiringStorage, getExpiringStorage, getToken, formatAge } from '../utils/helpers';

export function ProfileDrawer({ isOpen, onClose, user }) {
  const [email, setEmail] = useState('');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [password, setPassword] = useState('');
  const [signPin, setSignPin] = useState(''); // Новое состояние для PIN-кода
  
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [isEditingPin, setIsEditingPin] = useState(false);
  
  const [avatarFile, setAvatarFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      if (user.phone) {
        setPhoneRaw(user.phone.replace('+7', ''));
      }
    }
  }, [user]);

  const handlePhoneChange = (e) => {
    const val = e.target.value.replace(/\D/g, ''); 
    setPhoneRaw(val.slice(0, 10));
  };

  const handlePinChange = (e) => {
    const val = e.target.value.replace(/\D/g, ''); 
    setSignPin(val.slice(0, 4)); // Только 4 цифры
  };

  const formatPhone = (raw) => {
    if (!raw) return '';
    let res = '';
    if (raw.length > 0) res += '(' + raw.substring(0, 3);
    if (raw.length >= 4) res += ') ' + raw.substring(3, 6);
    if (raw.length >= 7) res += '-' + raw.substring(6, 8);
    if (raw.length >= 9) res += '-' + raw.substring(8, 10);
    return res;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Дата рождения не указана';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = getToken();
      let finalAvatarUrl = user?.avatarUrl || null;

      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop();
        const customFileName = `user_${user.id}_avatar.${ext}`;
        
        const formData = new FormData();
        formData.append('fileName', customFileName);
        formData.append('file', avatarFile);

        const uploadRes = await fetch(`${SERVER_URL}/api/upload`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success) finalAvatarUrl = `uploads/${customFileName}`;
      }

      const fullPhone = `+7${phoneRaw}`;

      const updateRes = await fetch(`${SERVER_URL}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          email,
          phone: fullPhone,
          password: password || undefined, 
          signPin: signPin || undefined, // Передаем PIN
          avatarUrl: finalAvatarUrl
        })
      });

      const updateData = await updateRes.json();
      if (updateData.success) {
        window.location.reload(); 
      } else {
        alert('Ошибка при сохранении: ' + updateData.error);
      }
    } catch (err) {
      alert('Ошибка соединения с сервером');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-[35] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className={`absolute top-0 left-[230px] h-full w-[400px] max-w-[calc(100vw-230px)] bg-white/85 transform transition-transform duration-300 flex flex-col shadow-[24px_0_24px_rgba(0,0,0,0.1)] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        <div onClick={onClose} className="flex items-center p-5 border-b border-graphite/10 cursor-pointer hover:bg-gray-50 transition-colors group">
          <div className="p-2 -ml-2 text-graphite group-hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </div>
          <h2 className="ml-2 font-bold text-lg text-graphite uppercase tracking-wide group-hover:text-orange transition-colors">Настройки профиля</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-7">
          <div className="flex flex-col items-center gap-4">
            <div className="w-[140px] [&_.gap-4]:!hidden [&_.rounded-xl]:!rounded-xxl [&_.rounded-xl]:!bg-graphite/5">
              <Uploader heightClass="h-[140px]" initialUrl={user?.avatarUrl ? getImageUrl(user.avatarUrl) : null} onFileSelect={(file) => setAvatarFile(file)} />
            </div>
            <div className="text-center">
              <h3 className="text-[1.2rem] font-bold text-graphite leading-tight">
                {user?.lastName} {user?.firstName} {user?.middleName}
              </h3>
              <span className="text-[12px] font-medium text-graphite-light mt-1 inline-block">
                {formatDate(user?.birthDate)}
              </span>
            </div>
          </div>

          <div className="h-px w-full bg-graphite/10"></div>

          <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-graphite-light uppercase tracking-wider mb-3">Контактная информация</h4>
            {/* Скрыл код телефона и email для экономии места, он остался как у тебя */}
            <div>
              <div className="text-[11px] font-bold text-graphite/60 mb-1.5 uppercase tracking-wide">Телефон</div>
              {!isEditingPhone ? (
                <div className="relative flex items-center w-full border border-graphite/30 rounded-md bg-gray-50 group hover:border-graphite/50">
                  <div className="pl-4 pr-2 text-graphite/60 font-semibold border-r border-graphite/20 py-2.5">+7</div>
                  <input type="tel" value={formatPhone(phoneRaw)} disabled className="w-full px-3 py-2.5 bg-transparent text-graphite/70 text-[13px] font-medium outline-none cursor-not-allowed" />
                  <button onClick={() => setIsEditingPhone(true)} className="absolute right-3 text-graphite-light hover:text-orange opacity-0 group-hover:opacity-100"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                </div>
              ) : (
                <div className="relative flex items-center w-full border border-graphite/40 rounded-md bg-white focus-within:border-orange focus-within:shadow-[0_0_0_3px_rgba(255,122,0,0.2)]">
                  <div className="pl-4 pr-2 text-graphite font-semibold border-r border-graphite/20 py-2.5">+7</div>
                  <input type="tel" value={formatPhone(phoneRaw)} onChange={handlePhoneChange} className="w-full px-3 py-2.5 bg-transparent text-[13px] font-medium outline-none" autoFocus />
                </div>
              )}
            </div>
            <div>
              <div className="text-[11px] font-bold text-graphite/60 mb-1.5 uppercase tracking-wide">Email</div>
              {!isEditingEmail ? (
                <div className="relative flex items-center w-full border border-graphite/30 rounded-md bg-gray-50 group hover:border-graphite/50">
                  <input type="email" value={email || ''} placeholder="Не указан" disabled className="w-full px-3 py-2.5 bg-transparent text-graphite/70 text-[13px] outline-none cursor-not-allowed" />
                  <button onClick={() => setIsEditingEmail(true)} className="absolute right-3 text-graphite-light hover:text-orange opacity-0 group-hover:opacity-100"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                </div>
              ) : (<Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Введите email" />)}
            </div>
          </div>

          <div className="h-px w-full bg-graphite/10"></div>

          <div className="space-y-4 pb-4">
            <h4 className="text-[11px] font-bold text-graphite-light uppercase tracking-wider mb-3">Безопасность и ЭЦП</h4>
            
            {/* Пароль */}
            {!isEditingPassword ? (
              <button onClick={() => setIsEditingPassword(true)} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-graphite/20 rounded-md hover:border-graphite/40 transition-colors group">
                <span className="text-[13px] font-medium text-graphite">Сменить пароль входа</span>
                <svg className="text-graphite-light group-hover:text-orange" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            ) : (<div className="animate-zoom-in"><Input value={password} onChange={e => setPassword(e.target.value)} placeholder="Введите новый пароль" /></div>)}

            {/* PIN-код для ЭЦП */}
            {!isEditingPin ? (
              <button onClick={() => setIsEditingPin(true)} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-graphite/20 rounded-md hover:border-graphite/40 transition-colors group">
                <span className="text-[13px] font-medium text-graphite">
                  {user?.hasSignPin ? 'Изменить PIN-код (ЭЦП)' : 'Задать PIN-код (ЭЦП)'}
                </span>
                <div className="flex items-center gap-2">
                  {user?.hasSignPin && <span className="w-2 h-2 rounded-full bg-status-accepted"></span>}
                  <svg className="text-graphite-light group-hover:text-orange" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </button>
            ) : (
              <div className="animate-zoom-in relative">
                <input 
                  type="password" 
                  maxLength={4}
                  value={signPin} 
                  onChange={handlePinChange} 
                  placeholder="4 цифры (Например: 1234)" 
                  className="w-full border border-graphite/40 rounded-md px-3 py-2.5 text-[13px] outline-none focus:border-orange tracking-[5px] font-bold"
                />
                <span className="text-[10px] text-graphite-light mt-1 block">PIN нужен для электронной подписи протоколов матча</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-graphite/10 bg-gray-50 shrink-0">
          <Button onClick={handleSave} isLoading={isSaving} className="w-full">Сохранить изменения</Button>
        </div>
      </div>
    </div>
  );
}