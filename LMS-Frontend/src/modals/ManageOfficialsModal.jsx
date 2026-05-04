import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { getToken, getImageUrl } from '../utils/helpers';
import { AccessFallback } from '../ui/AccessFallback';

export function ManageOfficialsModal({ isOpen, onClose, gameId, initialOfficials, onSuccess, readOnly = false }) {
  const [staffList, setStaffList] = useState([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);

  // ОБНОВЛЕНО: Используем новые ключи ролей из БД
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
      // ОБНОВЛЕНО: Маппинг пропсов на новые ключи
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

  const formatName = (staff) => `${staff.last_name} ${staff.first_name} ${staff.middle_name || ''}`.trim();

  // Оставляем проверки штатных должностей лиги (они остались referee и media)
  const isReferee = (roles) => {
    if (!roles) return false;
    const r = roles.toLowerCase();
    return r.includes('судья') || r.includes('секретарь') || r.includes('referee');
  };

  const isMedia = (roles) => {
    if (!roles) return false;
    const r = roles.toLowerCase();
    return r.includes('медиа') || r.includes('media') || r.includes('фото') || r.includes('видео') || r.includes('комментатор');
  };

  const refereeList = staffList.filter(s => isReferee(s.roles));
  const mediaList = staffList.filter(s => isMedia(s.roles));

  const refereeOptions = ['-- Не назначен --', ...refereeList.map(formatName)];
  const mediaOptions = ['-- Не назначен --', ...mediaList.map(formatName)];

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
          <div className="flex-1">
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Назначение персонала" size="wide">
      <div className="flex flex-col gap-6 w-[800px] max-w-full">
        
        {readOnly && (
          <AccessFallback variant="readonly" message="У вас нет прав на редактирование бригады матча." />
        )}

        <div className={`space-y-6 transition-opacity duration-300 ${isLoadingStaff || readOnly ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
          
          {/* Главные и Линейные судьи на льду */}
          <div className="bg-graphite/[0.03] p-5 rounded-2xl border border-graphite/10">
            <h4 className="text-sm font-semibold mb-4 text-graphite">Судьи на льду</h4>
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              {renderSelectWithAvatar("Главный судья 1", "main-1", refereeOptions)}
              {renderSelectWithAvatar("Главный судья 2", "main-2", refereeOptions)}
              {renderSelectWithAvatar("Линейный судья 1", "linesman-1", refereeOptions)}
              {renderSelectWithAvatar("Линейный судья 2", "linesman-2", refereeOptions)}
            </div>
          </div>

          {/* Судейский столик */}
          <div className="bg-graphite/[0.03] p-5 rounded-2xl border border-graphite/10">
            <h4 className="text-sm font-semibold mb-4 text-graphite">Судейский столик (Оф. лица)</h4>
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              {renderSelectWithAvatar("Секретарь матча", "secretary", refereeOptions)}
              {renderSelectWithAvatar("Хронометрист (Судья времени)", "timekeeper", refereeOptions)}
              {renderSelectWithAvatar("Диктор-информатор", "informant", refereeOptions)}
            </div>
          </div>

          {/* Медиа и Трансляция */}
          <div className="bg-graphite/[0.03] p-5 rounded-2xl border border-graphite/10">
            <h4 className="text-sm font-semibold mb-4 text-graphite">Медиа и Трансляция</h4>
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              {renderSelectWithAvatar("Режиссер трансляции / Фото", "broadcaster", mediaOptions)}
              <div className="hidden sm:block"></div> {/* Пустой блок для выравнивания */}
              {renderSelectWithAvatar("Комментатор 1", "commentator-1", mediaOptions)}
              {renderSelectWithAvatar("Комментатор 2", "commentator-2", mediaOptions)}
            </div>
          </div>

        </div>

        {!readOnly && (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} isLoading={isSaving} className="w-full sm:w-auto">
              Сохранить назначения
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}