import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom'; // useParams больше не нужен
import { getToken } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';
import { Loader } from '../../ui/Loader';
import { Stepper } from '../../ui/Stepper';
import { useAccess } from '../../hooks/useAccess';

export function PreferencesTab({ setToast }) {
  const { selectedLeague } = useOutletContext(); // Берем ID лиги отсюда
  const { checkAccess } = useAccess();
  
  const canEdit = checkAccess('SETTINGS_DIVISIONS_EDIT');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    sec_access_before_hours: 12,
    sec_access_after_hours: 3
  });

  useEffect(() => {
    // Защита: если лиги еще нет, не делаем запрос
    if (!selectedLeague?.id) return; 

    const fetchPreferences = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/preferences`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (data.success && data.data) {
          setFormData({
            sec_access_before_hours: data.data.sec_access_before_hours ?? 12,
            sec_access_after_hours: data.data.sec_access_after_hours ?? 3
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPreferences();
  }, [selectedLeague?.id]); // Зависимость от ID лиги

  // ФУНКЦИЯ АВТОСОХРАНЕНИЯ
  const autoSave = async (updatedData) => {
    if (!selectedLeague?.id) return;

    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/preferences`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedData)
      });
      const data = await res.json();
      if (data.success) {
        if (selectedLeague) {
            selectedLeague.sec_access_before_hours = updatedData.sec_access_before_hours;
            selectedLeague.sec_access_after_hours = updatedData.sec_access_after_hours;
        }
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Автосохранение не удалось', type: 'error' });
    } finally {
      setTimeout(() => setIsSaving(false), 500); 
    }
  };

  const handleStepChange = (field, newVal) => {
    const newData = { ...formData, [field]: newVal };
    setFormData(newData);
    autoSave(newData);
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="flex flex-col gap-6 animate-zoom-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* БЛОК: ОГРАНИЧЕНИЯ ВРЕМЕНИ */}
        <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[160px] relative">
          
          {/* Индикатор сохранения */}
          {isSaving && (
            <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] font-bold text-orange uppercase tracking-widest animate-pulse">
              <div className="w-1.5 h-1.5 bg-orange rounded-full"></div>
              Синхронизация
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-1">
              <Icon name="time" className="w-4 h-4 text-graphite/40" />
              <h4 className="text-[13px] font-black uppercase text-graphite tracking-tight">Доступ секретариата</h4>
            </div>
            <p className="text-[11px] text-graphite-light leading-relaxed pr-8">
              Временные окна для редактирования протокола и назначения бригады
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-graphite/70">До начала (ч)</span>
              <Stepper 
                initialValue={formData.sec_access_before_hours} 
                min={0} 
                max={72} 
                onChange={(val) => handleStepChange('sec_access_before_hours', val)}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-graphite/70">После начала (ч)</span>
              <Stepper 
                initialValue={formData.sec_access_after_hours} 
                min={1} 
                max={24} 
                onChange={(val) => handleStepChange('sec_access_after_hours', val)}
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}