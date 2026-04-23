import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Badge } from '../../ui/Badge';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { AccessFallback } from '../../ui/AccessFallback';
import { getToken } from '../../utils/helpers';

export function QualificationsTab({ setToast }) {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  
  // Обновленные системные ключи
  const canViewQuals = checkAccess('SETTINGS_QUAL_VIEW');
  const canAddQuals = checkAccess('SETTINGS_QUAL_CREATE');
  const canDeleteQuals = checkAccess('SETTINGS_QUAL_DELETE');

  const [qualifications, setQualifications] = useState([]);
  const [isLoadingQuals, setIsLoadingQuals] = useState(false);
  
  const [newQual, setNewQual] = useState({ name: '', shortName: '', description: '' });
  const [isAddingQual, setIsAddingQual] = useState(false);
  
  const [confirmDeleteQual, setConfirmDeleteQual] = useState(null);
  const [isDeletingQual, setIsDeletingQual] = useState(false);

  useEffect(() => {
    if (selectedLeague?.id && canViewQuals) {
      fetchQualifications();
    }
  }, [selectedLeague, canViewQuals]);

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

  if (!canViewQuals) {
    return <AccessFallback variant="full" message="У вас нет прав для просмотра квалификаций." />;
  }

  const isReadOnly = !canAddQuals && !canDeleteQuals;

  return (
    <div className="flex flex-col gap-6 animate-fade-in-down">
      {isReadOnly && (
        <AccessFallback variant="readonly" message="У вас нет прав на редактирование квалификаций. Вы находитесь в режиме просмотра." />
      )}
      
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Левая колонка (Форма) */}
        {canAddQuals && (
          <div className="w-full lg:w-[420px] shrink-0 bg-white/30 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-6 flex flex-col gap-5">
            <span className="text-[16px] font-black text-graphite uppercase tracking-wide border-b border-graphite/10 pb-3">Новая квалификация</span>
            
            <div className="flex flex-col gap-4">
              <Input label="Полное Название" placeholder="Например: Любитель" value={newQual.name} onChange={(e) => setNewQual({...newQual, name: e.target.value})} />
              <Input label="Короткое название (Метка)" placeholder="Например: ЛЮБ" value={newQual.shortName} onChange={(e) => setNewQual({...newQual, shortName: e.target.value.substring(0, 5)})} />
              
              <div className="flex flex-col w-full mt-1">
                <label className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Описание критериев</label>
                <textarea 
                  placeholder="Опишите, кто подходит под эту квалификацию..." 
                  value={newQual.description} 
                  onChange={(e) => setNewQual({...newQual, description: e.target.value})} 
                  className="w-full h-[120px] px-3 py-2.5 border border-graphite/30 rounded-md bg-white/80 text-graphite text-[13px] font-medium outline-none transition-all duration-300 focus:border-orange focus:bg-white resize-none" 
                />
              </div>
              
              <Button onClick={handleAddQual} isLoading={isAddingQual} className="w-full mt-2">Добавить в справочник</Button>
            </div>
          </div>
        )}

        {/* Правая колонка (Сетка квалификаций) */}
        <div className="flex-1 w-full min-h-[400px] relative">
          {isLoadingQuals && (
            <div className="absolute inset-0 z-30 flex items-start pt-20 justify-center pointer-events-none">
              <Loader text="Загрузка квалификаций..." />
            </div>
          )}
          <div className={`transition-opacity duration-300 ease-in-out ${isLoadingQuals ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            {qualifications.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {qualifications.map(qual => (
                  <div key={qual.id} className="bg-white/60 backdrop-blur-md border border-graphite/15 rounded-2xl p-6 flex flex-col gap-3 relative group transition-all hover:shadow-lg hover:border-orange/30 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-2 pr-8">
                        <span className="font-bold text-[18px] text-graphite leading-tight">{qual.name}</span>
                        <Badge label={qual.short_name} type="filled" />
                      </div>
                      {canDeleteQuals && (
                        <button onClick={() => setConfirmDeleteQual(qual)} className="absolute top-5 right-5 w-8 h-8 flex justify-center items-center rounded-lg bg-status-rejected/10 text-status-rejected opacity-0 group-hover:opacity-100 transition-all hover:bg-status-rejected hover:text-white">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      )}
                    </div>
                    <p className="text-[13px] text-graphite-light leading-relaxed mt-3 border-t border-graphite/10 pt-4">
                      {qual.description || 'Нет описания.'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-white/30 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 text-graphite-light font-medium">Нет созданных квалификаций</div>
            )}
          </div>
        </div>

        <ConfirmModal 
          isOpen={!!confirmDeleteQual} 
          onClose={() => setConfirmDeleteQual(null)} 
          onConfirm={handleDeleteQual} 
          isLoading={isDeletingQual} 
        />
      </div>
    </div>
  );
}