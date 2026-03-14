import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { getToken, getImageUrl } from '../utils/helpers';

export function ManageOfficialsModal({ isOpen, onClose, gameId, initialOfficials, onSuccess }) {
  const [staffList, setStaffList] = useState([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);

  const [officials, setOfficials] = useState({
    head_1: '', head_2: '',
    linesman_1: '', linesman_2: '',
    scorekeeper: '', media: ''
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
        head_1: initialOfficials.head_1?.id || '',
        head_2: initialOfficials.head_2?.id || '',
        linesman_1: initialOfficials.linesman_1?.id || '',
        linesman_2: initialOfficials.linesman_2?.id || '',
        scorekeeper: initialOfficials.scorekeeper?.id || '',
        media: initialOfficials.media?.id || ''
      });
    }
  }, [isOpen, initialOfficials]);

  const handleSave = async () => {
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
        alert(data.error || 'Ошибка при сохранении судей');
      }
    } catch (err) { alert('Ошибка сети'); } 
    finally { setIsSaving(false); }
  };

  const formatName = (staff) => `${staff.last_name} ${staff.first_name} ${staff.middle_name || ''}`.trim();

  const isReferee = (roles) => {
    if (!roles) return false;
    const r = roles.toLowerCase();
    return r.includes('судья') || r.includes('секретарь') || r.includes('referee') || r.includes('scorekeeper');
  };

  const isMedia = (roles) => {
    if (!roles) return false;
    const r = roles.toLowerCase();
    return r.includes('медиа') || r.includes('media') || r.includes('фото') || r.includes('видео');
  };

  const refereeList = staffList.filter(s => isReferee(s.roles));
  const mediaList = staffList.filter(s => isMedia(s.roles));

  const refereeOptions = ['-- Не назначен --', ...refereeList.map(formatName)];
  const mediaOptions = ['-- Не назначен --', ...mediaList.map(formatName)];

  const handleSelectChange = (key, selectedName) => {
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

  // Красивый блок выбора с аватаркой
  const renderSelectWithAvatar = (labelText, key, optionsArray) => {
    const selectedId = officials[key];
    const selectedPerson = staffList.find(s => s.user_id === selectedId || s.id === selectedId);
    const avatarUrl = selectedPerson?.avatar_url || '/default/user_default.webp';

    return (
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">{labelText}</label>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 shrink-0 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10 shadow-sm">
            <img src={getImageUrl(avatarUrl)} alt="avatar" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1">
            <Select
              placeholder="-- Не назначен --"
              options={optionsArray}
              value={getValueForSelect(key)}
              onChange={(val) => handleSelectChange(key, val)}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Назначение персонала" size="wide">
      {/* Сделали ширину 750px - идеально для 2 колонок с длинными ФИО */}
      <div className="flex flex-col gap-6 w-[750px] max-w-full">
        
        <div className={`space-y-6 transition-opacity duration-300 ${isLoadingStaff ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          
          <div className="bg-graphite/[0.03] p-5 rounded-2xl border border-graphite/10">
            <div className="grid grid-cols-2 gap-8">
              {renderSelectWithAvatar("Главный судья 1", "head_1", refereeOptions)}
              {renderSelectWithAvatar("Главный судья 2", "head_2", refereeOptions)}
            </div>
          </div>

          <div className="bg-graphite/[0.03] p-5 rounded-2xl border border-graphite/10">
            <div className="grid grid-cols-2 gap-8">
              {renderSelectWithAvatar("Линейный судья 1", "linesman_1", refereeOptions)}
              {renderSelectWithAvatar("Линейный судья 2", "linesman_2", refereeOptions)}
            </div>
          </div>

          <div className="bg-graphite/[0.03] p-5 rounded-2xl border border-graphite/10">
            <div className="grid grid-cols-2 gap-8">
              {renderSelectWithAvatar("Секретарь матча", "scorekeeper", refereeOptions)}
              {renderSelectWithAvatar("Медиа (Фото/Видео)", "media", mediaOptions)}
            </div>
          </div>

        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} isLoading={isSaving} className="w-full sm:w-auto">
            Сохранить назначения
          </Button>
        </div>
      </div>
    </Modal>
  );
}