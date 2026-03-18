import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { getToken } from '../utils/helpers';
import { Header } from '../components/Header';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { Toast } from '../modals/Toast';
import { WeekCalendar } from '../ui/WeekCalendar';
import { GamesCard } from '../components/GamesCard';
import { CreateGameDrawer } from '../modals/CreateGameDrawer';
import { useAccess } from '../hooks/useAccess'; // <-- ИМПОРТ ХУКА ПРАВ

export function GamesPage() {
  const { user, selectedLeague } = useOutletContext();
  const navigate = useNavigate(); 
  const { checkAccess } = useAccess(); // <-- ИНИЦИАЛИЗАЦИЯ ХУКА ПРАВ
  
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  
  const [divisions, setDivisions] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState('Все дивизионы');
  
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [statusFilterIndex, setStatusFilterIndex] = useState(0); 

  const [slideDirection, setSlideDirection] = useState('none');
  const [animStatus, setAnimStatus] = useState('idle');

  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);

  // --- ПРОВЕРКА ПРАВ НА СОЗДАНИЕ МАТЧЕЙ ---
  const canCreateGames = checkAccess('CREATE_GAMES');

  useEffect(() => {
    if (selectedLeague?.id) fetchSeasons(selectedLeague.id);
  }, [selectedLeague]);

  const fetchSeasons = async (leagueId) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${leagueId}/seasons`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setSeasons(data.data);
        const active = data.data.find(s => s.is_active) || data.data[0];
        setSelectedSeasonId(active ? active.id : null);
      } else {
        setSeasons([]); setSelectedSeasonId(null);
      }
    } catch (err) { setToast({ title: 'Ошибка', message: 'Не удалось загрузить сезоны', type: 'error' }); }
  };

  useEffect(() => {
    if (selectedSeasonId) fetchDivisions();
  }, [selectedSeasonId]);

  const fetchDivisions = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/divisions`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) {
        setDivisions(data.data);
        setSelectedDivision('Все дивизионы');
      }
    } catch (err) { console.error(err); }
  };

  const handleWeekChange = (start, end) => {
    if (dateRange.start) {
      const oldTime = dateRange.start.getTime();
      const newTime = start.getTime();
      if (newTime > oldTime) setSlideDirection('next');
      else if (newTime < oldTime) setSlideDirection('prev');
      else setSlideDirection('none');
    }
    setDateRange({ start, end });
  };

  useEffect(() => {
    if (selectedSeasonId && dateRange.start && dateRange.end) {
      loadGames();
    }
  }, [selectedSeasonId, selectedDivision, statusFilterIndex, dateRange]);

  const loadGames = async () => {
    if (!selectedSeasonId || !dateRange.start || !dateRange.end) return;

    setAnimStatus('exiting');
    setIsLoading(true);

    try {
      const queryParams = new URLSearchParams({
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
        division: selectedDivision,
        status: statusFilterIndex
      });

      const [res] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/games?${queryParams}`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
        new Promise(resolve => setTimeout(resolve, 250))
      ]);
      
      const data = await res.json();
      if (data.success) setGames(data.data);
      else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      
    } catch (err) { 
      setToast({ title: 'Ошибка', message: 'Сбой загрузки матчей', type: 'error' }); 
    } finally {
      setIsLoading(false);
      setAnimStatus('entering');
      setTimeout(() => { setAnimStatus('idle'); }, 30);
    }
  };

  if (!selectedLeague) {
    return (
      <div className="flex flex-col flex-1 animate-fade-in-down">
        <Header title="Матчи" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <div className="text-center text-status-rejected font-medium text-lg bg-status-rejected/5 px-8 py-6 rounded-2xl border border-status-rejected/10">
            Выберите лигу для просмотра матчей
          </div>
        </main>
      </div>
    );
  }

  const seasonOptions = seasons.map(s => s.name);
  const currentSeasonName = seasons.find(s => s.id === selectedSeasonId)?.name || '';
  const divisionOptions = ['Все дивизионы', ...divisions.map(d => d.name)];

  let containerClasses = "grid grid-cols-1 xl:grid-cols-2 gap-4 items-start w-full ";
  if (animStatus === 'exiting') {
    containerClasses += "transition-all duration-200 ease-in opacity-0 ";
    if (slideDirection === 'next') containerClasses += "-translate-x-12"; 
    else if (slideDirection === 'prev') containerClasses += "translate-x-12"; 
    else containerClasses += "scale-[0.97]"; 
  } else if (animStatus === 'entering') {
    containerClasses += "transition-none opacity-0 ";
    if (slideDirection === 'next') containerClasses += "translate-x-12"; 
    else if (slideDirection === 'prev') containerClasses += "-translate-x-12"; 
    else containerClasses += "scale-[0.97]";
  } else {
    containerClasses += "transition-all duration-300 ease-out opacity-100 translate-x-0 scale-100";
  }

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header 
        title="Матчи" 
        actions={
          <div className="flex items-center gap-4">
            {seasons.length > 0 && (
              <div className="w-48">
                <Select 
                  options={seasonOptions} 
                  value={currentSeasonName} 
                  onChange={(selectedName) => {
                    setSlideDirection('none'); 
                    const s = seasons.find(s => s.name === selectedName);
                    if (s) setSelectedSeasonId(s.id);
                  }} 
                />
              </div>
            )}
            {/* СКРЫТИЕ КНОПКИ ДЛЯ ТЕХ, У КОГО НЕТ ПРАВ */}
            {canCreateGames && (
              <Button onClick={() => setIsCreateDrawerOpen(true)}>+ Создать матч</Button>
            )}
          </div>
        }
      />

      {toast && <div className="fixed top-[110px] right-10 z-[9999]"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <div className="flex items-start px-10 pt-8 gap-8 relative z-10">
        
        <div className="w-[340px] shrink-0 sticky top-[128px] bg-white/30 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-6 flex flex-col gap-6 z-20">
          <div className="space-y-2">
            <WeekCalendar onWeekChange={handleWeekChange} />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Статус матча</label>
            <SegmentButton options={['Все', 'Активные', 'Завершенные']} defaultIndex={statusFilterIndex} onChange={(idx) => { setSlideDirection('none'); setStatusFilterIndex(idx); }} />
          </div>
          <div className="space-y-2">
            <Select label="Дивизион" options={divisionOptions} value={selectedDivision} onChange={(val) => { setSlideDirection('none'); setSelectedDivision(val); }} />
          </div>
        </div>

        <div className="flex-1 relative z-10 min-h-[500px]">
          {isLoading && (
            <div className="absolute inset-0 z-20 flex items-start pt-20 justify-center pointer-events-none opacity-0 animate-[fadeIn_0.2s_ease-in_0.3s_forwards]">
              <Loader />
            </div>
          )}
          
          <div className={`max-w-[1200px] mx-auto pb-10 ${isLoading ? 'pointer-events-none' : ''}`}>
            {!selectedSeasonId ? (
              <div className="text-center py-20 text-graphite-light font-medium bg-white/40 border border-dashed border-graphite/20 rounded-2xl">
                В этой лиге пока нет сезонов
              </div>
            ) : games.length === 0 && !isLoading && animStatus === 'idle' ? (
              <div className="text-center py-20 text-graphite-light font-medium bg-white/40 border border-dashed border-graphite/20 rounded-2xl animate-fade-in-down">
                На выбранной неделе нет матчей, удовлетворяющих фильтрам.
              </div>
            ) : (
              <div className={containerClasses}>
                {games.map(game => (
                  <GamesCard 
                    key={game.id} 
                    game={game} 
                    onClick={() => navigate(`/games/${game.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      <CreateGameDrawer 
        isOpen={isCreateDrawerOpen} 
        onClose={() => setIsCreateDrawerOpen(false)} 
        seasonId={selectedSeasonId}
        divisions={divisions}
        onSuccess={() => {
          setToast({ title: 'Успешно', message: 'Матч создан', type: 'success' });
          loadGames(); // Перезагружаем матчи
        }}
      />
    </div>
  );
}