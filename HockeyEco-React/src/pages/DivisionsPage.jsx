import React, { useState, useEffect } from 'react';
import { getToken } from '../utils/helpers';
import { Header } from '../components/Header';
import { Select } from '../ui/Select';
import { Loader } from '../ui/Loader';
import { Toast } from '../modals/Toast';
import { DivisionCard } from '../components/Divisions/DivisionCard';
import { ConfirmModal } from '../modals/ConfirmModal';

// Импортируем новую систему прав
import { useAccess } from '../hooks/useAccess';
import { AccessFallback } from '../ui/AccessFallback';

export function DivisionsPage() {
  // Используем useAccess вместо useOutletContext
  const { user, selectedLeague, checkAccess } = useAccess();
  
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  
  const [divisions, setDivisions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Проверяем наличие базового права на просмотр раздела
  const canViewPage = checkAccess('DIVISIONS_VIEW');

  useEffect(() => {
    // Загружаем данные только если есть права
    if (selectedLeague?.id && canViewPage) fetchSeasons(selectedLeague.id);
  }, [selectedLeague, canViewPage]);

  const fetchSeasons = async (leagueId) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${leagueId}/seasons`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setSeasons(data.data);
        const active = data.data.find(s => s.is_active) || data.data[0];
        setSelectedSeasonId(active ? active.id : null);
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Не удалось загрузить сезоны', type: 'error' });
    }
  };

  useEffect(() => {
    if (selectedSeasonId && canViewPage) fetchDivisions();
    else setDivisions([]);
  }, [selectedSeasonId, canViewPage]);

  const fetchDivisions = async (isQuiet = false) => {
    if (!isQuiet) setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/divisions`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) setDivisions(data.data);
      else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Не удалось загрузить дивизионы', type: 'error' });
    } finally {
      if (!isQuiet) setIsLoading(false);
    }
  };

  const handleDeleteDivision = async () => {
    if (!confirmDeleteId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${confirmDeleteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setToast({ title: 'Успешно', message: 'Дивизион удален', type: 'success' });
        setConfirmDeleteId(null);
        fetchDivisions();
      } else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Ошибка удаления', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const seasonOptions = seasons.map(s => s.name);
  const currentSeasonName = seasons.find(s => s.id === selectedSeasonId)?.name || '';

  // Если лига не выбрана
  if (!selectedLeague) {
    return (
      <div className="flex flex-col flex-1 animate-zoom-in">
        <Header title="Дивизионы" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <div className="text-center text-graphite-light font-medium text-lg">Выберите лигу</div>
        </main>
      </div>
    );
  }

  // БЛОКИРОВКА ДОСТУПА К СТРАНИЦЕ (Заглушка)
  if (!canViewPage) {
    return (
      <div className="flex flex-col flex-1 animate-zoom-in">
        <Header title="Дивизионы" />
        <main className="p-6 md:p-10 flex flex-1 flex-col">
          <AccessFallback variant="full" message="У вас нет доступа к просмотру дивизионов. Обратитесь к администратору лиги." />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 relative pb-20">
      <Header 
        title="Дивизионы" 
        actions={
          <div className="w-32">
            <Select options={seasonOptions} value={currentSeasonName} onChange={(name) => setSelectedSeasonId(seasons.find(s => s.name === name)?.id)} />
          </div>
        }
      />
      {toast && <div className="fixed top-[110px] right-10 z-[9999]"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <main className="p-6 md:p-10 flex flex-col gap-6 font-sans animate-zoom-in">
        {isLoading ? <Loader text="" /> : divisions.length === 0 ? (
          <div className="bg-white/0 rounded-xxl p-10 text-center text-graphite/50">Нет дивизионов</div>
        ) : (
          <div className="flex flex-col gap-6">
            {divisions.map(div => (
              <DivisionCard 
                key={div.id} 
                division={div} 
                leagueId={selectedLeague?.id} 
                // Убрали передачу userRole, DivisionCard будет работать автономно через useAccess
                onDelete={() => setConfirmDeleteId(div.id)} 
                onRefresh={fetchDivisions} 
                setGlobalToast={setToast}
              />
            ))}
          </div>
        )}
      </main>
      <ConfirmModal isOpen={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} onConfirm={handleDeleteDivision} isLoading={isDeleting} />
    </div>
  );
}