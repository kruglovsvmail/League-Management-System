import { getToken } from '../utils/helpers';
import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Header } from '../components/Header';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { Toast } from '../modals/Toast';
import { DivisionCard } from '../components/Divisions/DivisionCard';
import { DivisionSettingsModal } from '../modals/DivisionSettingsModal';
import { ConfirmModal } from '../modals/ConfirmModal';

export function DivisionsPage() {
  const { user, selectedLeague } = useOutletContext();
  
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  
  const [divisions, setDivisions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Состояния для модальных окон
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState(null); // null = создание нового
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Шаг 1: Загрузка сезонов при смене лиги
  useEffect(() => {
    if (selectedLeague?.id) {
      fetchSeasons(selectedLeague.id);
    }
  }, [selectedLeague]);

  const fetchSeasons = async (leagueId) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${leagueId}/seasons`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setSeasons(data.data);
        // Выбираем активный сезон по умолчанию (или первый в списке)
        const active = data.data.find(s => s.is_active) || data.data[0];
        setSelectedSeasonId(active ? active.id : null);
      }
    } catch (err) {
      console.error(err);
      setToast({ title: 'Ошибка', message: 'Не удалось загрузить сезоны', type: 'error' });
    }
  };

  // Шаг 2: Загрузка дивизионов при смене сезона
  useEffect(() => {
    if (selectedSeasonId) {
      fetchDivisions(); // Обычная загрузка с лоадером
    } else {
      setDivisions([]);
    }
  }, [selectedSeasonId]);

  // Измененная функция: добавили параметр isQuiet для "тихого" фонового обновления
  const fetchDivisions = async (isQuiet = false) => {
    // Включаем лоадер только если это НЕ тихое обновление
    if (!isQuiet) setIsLoading(true);
    
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/divisions`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) setDivisions(data.data);
      else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      console.error(err);
      setToast({ title: 'Ошибка', message: 'Не удалось загрузить дивизионы', type: 'error' });
    } finally {
      // Выключаем лоадер только если это НЕ тихое обновление
      if (!isQuiet) setIsLoading(false);
    }
  };

  // --- УДАЛЕНИЕ ---
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
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Ошибка удаления', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Подготовка опций для селекта сезонов
  const seasonOptions = seasons.map(s => s.name);
  const currentSeasonName = seasons.find(s => s.id === selectedSeasonId)?.name || '';

  if (!selectedLeague) {
    return (
      <div className="flex flex-col flex-1 animate-fade-in-down">
        <Header title="Дивизионы" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <div className="text-center text-graphite-light font-medium text-lg">Выберите лигу для просмотра дивизионов</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 relative pb-20">
      <Header 
        title="Дивизионы" 
        actions={
          <div className="flex items-center gap-4">
            <div className="w-[200px]">
              <Select 
                options={seasonOptions} 
                value={currentSeasonName} 
                onChange={(selectedName) => {
                  const s = seasons.find(s => s.name === selectedName);
                  if (s) setSelectedSeasonId(s.id);
                }} 
              />
            </div>
            {/* Кнопка создания дивизиона */}
            <Button onClick={() => { setEditingDivision(null); setIsSettingsModalOpen(true); }}>
              + Создать
            </Button>
          </div>
        }
      />

      {toast && <div className="fixed top-[110px] right-10 z-[9999]"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <main className="p-6 md:p-10 flex flex-col gap-6 font-sans animate-fade-in-down">
        {isLoading ? (
          <Loader text="Загрузка дивизионов..." />
        ) : !selectedSeasonId ? (
          <div className="bg-white/40 border border-dashed border-graphite/20 rounded-xxl p-10 text-center text-graphite-light">В этой лиге пока нет сезонов</div>
        ) : divisions.length === 0 ? (
          <div className="bg-white/40 border border-dashed border-graphite/20 rounded-xxl p-10 text-center text-graphite-light">
            В этом сезоне еще нет созданных дивизионов
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {divisions.map(div => (
              <DivisionCard 
                key={div.id} 
                division={div} 
                leagueId={selectedLeague?.id}
                userRole={user.globalRole}
                onEdit={() => { setEditingDivision(div); setIsSettingsModalOpen(true); }}
                onDelete={() => setConfirmDeleteId(div.id)}
                onRefresh={fetchDivisions}
                setGlobalToast={setToast}
              />
            ))}
          </div>
        )}
      </main>

      {/* Модалка удаления дивизиона */}
      <ConfirmModal 
        isOpen={!!confirmDeleteId} 
        onClose={() => setConfirmDeleteId(null)} 
        onConfirm={handleDeleteDivision} 
        isLoading={isDeleting} 
      />

      {/* Большая модалка настроек (Stepper/Wizard) */}
      {isSettingsModalOpen && (
        <DivisionSettingsModal 
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          division={editingDivision}
          seasonId={selectedSeasonId}
          onSuccess={() => {
            setIsSettingsModalOpen(false);
            fetchDivisions();
            setToast({ title: 'Успешно', message: 'Настройки дивизиона сохранены', type: 'success' });
          }}
          setGlobalToast={setToast}
        />
      )}
    </div>
  );
}