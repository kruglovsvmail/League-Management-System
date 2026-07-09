import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { getToken, getImageUrl } from '../utils/helpers';
import { AccessFallback } from '../ui/AccessFallback';

export function ManageOfficialsModal({ isOpen, onClose, gameId, initialOfficials, onSuccess, readOnly = false }) {
  const [staffList, setStaffList] = useState([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);

  const [officials, setOfficials] = useState({
    'main-1': '', 'main-2': '',
    'linesman-1': '', 'linesman-2': '',
    'secretary': '', 'timekeeper': '', 'informant': '',
    'broadcaster': '', 'commentator-1': '', 'commentator-2': ''
  });
  
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoadingStaff(true);
      fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/staff`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      })
      .then(res => res.json())
      .then(data => { if (data.success) setStaffList(data.data); })
      .catch(console.error)
      .finally(() => setIsLoadingStaff(false));
    }
  }, [isOpen, gameId]);

  useEffect(() => {
    if (isOpen && initialOfficials) {
      setOfficials({
        'main-1': initialOfficials['main-1']?.id || '',
        'main-2': initialOfficials['main-2']?.id || '',
        'linesman-1': initialOfficials['linesman-1']?.id || '',
        'linesman-2': initialOfficials['linesman-2']?.id || '',
        'secretary': initialOfficials['secretary']?.id || '',
        'timekeeper': initialOfficials['timekeeper']?.id || '',
        'informant': initialOfficials['informant']?.id || '',
        'broadcaster': initialOfficials['broadcaster']?.id || '',
        'commentator-1': initialOfficials['commentator-1']?.id || '',
        'commentator-2': initialOfficials['commentator-2']?.id || ''
      });
    }
  }, [isOpen, initialOfficials]);

  const handleSave = async () => {
    if (readOnly) return;
    
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/officials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ officials })
      });
      if (res.ok) {
        if (onSuccess) onSuccess();
        onClose();
      } else {
        const data = await res.json();
        alert(data.error || 'Ошибка при сохранении персонала');
      }
    } catch (err) { alert('Ошибка сети'); } 
    finally { setIsSaving(false); }
  };

  const formatName = (staff) => {
    const last = staff.last_name || '';
    const first = staff.first_name || '';
    const middle = staff.middle_name || '';
    return `${last} ${first} ${middle}`.trim().replace(/\s+/g, ' ');
  };

  // 1. Фильтр для Судей и Столика (Строго исключаем ВСЕ сервисные аккаунты)
  const isReferee = (roles) => {
    if (!roles) return false;
    const r = roles.toLowerCase();
    if (r.includes('service_')) return false; // Секретарь матча не может быть сервисным аккаунтом
    return r.includes('судья') || r.includes('секретарь') || r.includes('referee') || r.includes('secretary');
  };

  // 2. Фильтр для Комментаторов (Только реальные медиа-сотрудники)
  const isCommentator = (roles) => {
    if (!roles) return false;
    const r = roles.toLowerCase();
    if (r.includes('service_')) return false; // Сервисные аккаунты не комментируют
    return r.includes('медиа') || r.includes('media') || r.includes('фото') || r.includes('видео') || r.includes('комментатор') || r.includes('broadcaster');
  };

  // 3. Фильтр для Режиссера трансляции (Реальные медиа + ТОЛЬКО service_broadcaster)
  const isBroadcaster = (roles) => {
    if (!roles) return false;
    const r = roles.toLowerCase();
    if (r.includes('service_secretary')) return false; // Сервисный секретарь сюда не попадает
    if (r.includes('service_broadcaster')) return true; // Разрешаем сервисного бродкастера
    return r.includes('медиа') || r.includes('media') || r.includes('фото') || r.includes('видео') || r.includes('broadcaster') || r.includes('комментатор');
  };

  const refereeList = staffList.filter(s => isReferee(s.roles));
  const commentatorList = staffList.filter(s => isCommentator(s.roles));
  const broadcasterList = staffList.filter(s => isBroadcaster(s.roles));

  const refereeOptions = ['-- Не назначен --', ...refereeList.map(formatName)];
  const commentatorOptions = ['-- Не назначен --', ...commentatorList.map(formatName)];
  const broadcasterOptions = ['-- Не назначен --', ...broadcasterList.map(formatName)];

  const handleSelectChange = (key, selectedName) => {
    if (readOnly) return;
    
    if (selectedName === '-- Не назначен --') {
      setOfficials({ ...officials, [key]: '' });
    } else {
      const found = staffList.find(s => formatName(s) === selectedName);
      setOfficials({ ...officials, [key]: found ? (found.user_id || found.id) : '' });
    }
  };

  const getValueForSelect = (key) => {
    const id = officials[key];
    if (!id) return '';
    const found = staffList.find(s => (s.user_id === id || s.id === id));
    return found ? formatName(found) : '';
  };

  const renderSelectWithAvatar = (labelText, key, optionsArray) => {
    const selectedId = officials[key];
    const selectedPerson = staffList.find(s => s.user_id === selectedId || s.id === selectedId);
    const avatarUrl = selectedPerson?.avatar_url || '/default/user_default.webp';

    return (
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">{labelText}</label>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10 shadow-sm">
            <img src={getImageUrl(avatarUrl)} alt="avatar" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <Select
              placeholder="-- Не назначен --"
              options={optionsArray}
              value={getValueForSelect(key)}
              onChange={(val) => handleSelectChange(key, val)}
              disabled={readOnly}
            />
          </div>
        </div>
      </div>
    );
  };

  // Предотвращаем скролл body, когда открыта шторка
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  return (
    <>
      {/* Фон-затемнение (Backdrop) */}
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[999] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Сама панель (Drawer) */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-[760px] max-w-full bg-white shadow-2xl z-[1000] transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Заголовок */}
        <div className="p-6 border-b border-graphite/10 flex items-center justify-between bg-graphite/5 shrink-0">
          <h3 className="text-[18px] font-black uppercase text-graphite tracking-tight">Назначение персонала</h3>
          <button onClick={onClose} className="p-2 hover:bg-graphite/10 rounded-full transition-colors">
            <svg className="w-6 h-6 text-graphite/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Содержимое */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {readOnly && (
            <AccessFallback variant="readonly" message="У вас нет прав на редактирование бригады матча." />
          )}

          <div className={`space-y-6 transition-opacity duration-300 ${isLoadingStaff || readOnly ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
            
            {/* Судьи на льду (Сетка 2x2) */}
            <div className="bg-graphite/[0.03] p-4 rounded-2xl border border-graphite/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                {renderSelectWithAvatar("Главный судья", "main-1", refereeOptions)}
                {renderSelectWithAvatar("Главный судья", "main-2", refereeOptions)}
                {renderSelectWithAvatar("Линейный судья", "linesman-1", refereeOptions)}
                {renderSelectWithAvatar("Линейный судья", "linesman-2", refereeOptions)}
              </div>
            </div>

            {/* Две колонки (Столик и Медиа) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Левая колонка: Столик */}
              <div className="bg-graphite/[0.03] p-4 rounded-2xl border border-graphite/10 flex flex-col gap-6">
                <div className="flex flex-col gap-6">
                  {renderSelectWithAvatar("Секретарь матча", "secretary", refereeOptions)}
                  {renderSelectWithAvatar("Хронометрист (Время)", "timekeeper", refereeOptions)}
                  {renderSelectWithAvatar("Диктор-информатор", "informant", refereeOptions)}
                </div>
              </div>

              {/* Правая колонка: Медиа */}
              <div className="bg-graphite/[0.03] p-4 rounded-2xl border border-graphite/10 flex flex-col gap-6">
                <div className="flex flex-col gap-6">
                  {renderSelectWithAvatar("Режиссер трансляции", "broadcaster", broadcasterOptions)}
                  {renderSelectWithAvatar("Комментатор 1", "commentator-1", commentatorOptions)}
                  {renderSelectWithAvatar("Комментатор 2", "commentator-2", commentatorOptions)}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Подвал с кнопкой */}
        {!readOnly && (
          <div className="p-6 bg-white border-t border-graphite/10 shrink-0">
            <Button onClick={handleSave} isLoading={isSaving} className="w-full shadow-lg">
              Сохранить назначения
            </Button>
          </div>
        )}
      </div>
    </>
  );
}