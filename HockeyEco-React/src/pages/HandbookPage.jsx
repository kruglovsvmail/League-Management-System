import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom'; // Добавлен импорт
import { Header } from '../components/Header';
import { Table } from '../ui/Table'; 
import { Loader } from '../ui/Loader';
import { Toast } from '../modals/Toast';
import { PlayerProfileModal } from '../modals/PlayerProfileModal';
import { SegmentButton } from '../ui/SegmentButton';
import { Tooltip } from '../ui/Tooltip';
import { Input } from '../ui/Input';
import { getImageUrl, getToken } from '../utils/helpers';

export function HandbookPage() {
  // === НАСТРОЙКА URL-ПАРАМЕТРОВ ===
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = parseInt(searchParams.get('tab') || '0', 10); // 0: Пользователи, 1: Команды, 2: Арены
  const matchType = parseInt(searchParams.get('match') || '0', 10); // 0: Все, 1: Официальные, 2: Товарищеские
  const searchQuery = searchParams.get('q') || '';

  const setActiveTab = (index) => {
    setSearchParams(prev => {
      prev.set('tab', index);
      prev.delete('q');     // Сбрасываем поиск при переключении вкладок
      prev.delete('match'); // Сбрасываем фильтр матчей
      return prev;
    }, { replace: true });
  };

  const setMatchType = (index) => {
    setSearchParams(prev => {
      prev.set('match', index);
      return prev;
    }, { replace: true });
  };

  const setSearchQuery = (val) => {
    setSearchParams(prev => {
      if (val) prev.set('q', val);
      else prev.delete('q');
      return prev;
    }, { replace: true });
  };
  // ================================

  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Состояния модального окна профиля игрока
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab]);

  const fetchData = async (tabIndex) => {
    setIsLoading(true);
    setData([]);
    
    let endpoint = '';
    if (tabIndex === 0) endpoint = '/api/handbook/users';
    else if (tabIndex === 1) endpoint = '/api/handbook/teams';
    else if (tabIndex === 2) endpoint = '/api/handbook/arenas';

    try {
      const token = getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const result = await res.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        setToast({ title: 'Ошибка', message: result.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Не удалось загрузить данные справочника', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const openPlayerProfile = (id) => {
    setSelectedPlayerId(id);
    setIsPlayerModalOpen(true);
  };

  // Фильтрация и подготовка данных для сортировки
  const filteredData = useMemo(() => {
    if (!data) return [];

    let filtered = data;

    // Сначала поиск
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = data.filter(item => {
        if (activeTab === 0) { // Пользователи
          const fullName = `${item.last_name || ''} ${item.first_name || ''} ${item.middle_name || ''}`.toLowerCase();
          return fullName.includes(lowerQuery);
        }
        if (activeTab === 1 || activeTab === 2) { // Команды и Арены
          const name = (item.name || '').toLowerCase();
          const city = (item.city || '').toLowerCase();
          return name.includes(lowerQuery) || city.includes(lowerQuery);
        }
        return true;
      });
    }

    // Если это таблица команд, инжектим (вычисляем) поля статистики, чтобы по ним работала сортировка "на лету"
    if (activeTab === 1) {
      return filtered.map(team => {
        let g = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0;
        
        if (matchType === 1) {
          g = team.official_games_played || 0;
          w = team.official_wins || 0;
          d = team.official_draws || 0;
          l = team.official_losses || 0;
          gf = team.official_goals_for || 0;
          ga = team.official_goals_against || 0;
        } else if (matchType === 2) {
          g = team.friendly_games_played || 0;
          w = team.friendly_wins || 0;
          d = team.friendly_draws || 0;
          l = team.friendly_losses || 0;
          gf = team.friendly_goals_for || 0;
          ga = team.friendly_goals_against || 0;
        } else {
          g = (team.official_games_played || 0) + (team.friendly_games_played || 0);
          w = (team.official_wins || 0) + (team.friendly_wins || 0);
          d = (team.official_draws || 0) + (team.friendly_draws || 0);
          l = (team.official_losses || 0) + (team.friendly_losses || 0);
          gf = (team.official_goals_for || 0) + (team.friendly_goals_for || 0);
          ga = (team.official_goals_against || 0) + (team.friendly_goals_against || 0);
        }
        
        return {
          ...team,
          display_games: g,
          display_wins: w,
          display_draws: d,
          display_losses: l,
          display_goals_for: gf,
          display_goals_against: ga,
        };
      });
    }

    return filtered;
  }, [data, searchQuery, activeTab, matchType]);


  // --- КОЛОНКИ: ПОЛЬЗОВАТЕЛИ ---
  const userColumns = [
    { label: '#', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Фото', width: 'w-[60px] text-center', render: (row) => {
      const avatar = row.tm_photo_url || row.user_avatar;
      return (
        <div className="w-[50px] h-[50px] rounded-md overflow-hidden bg-graphite/5 border border-graphite/10 shrink-0">
          <img src={getImageUrl(avatar || '/default/user_default.webp')} className="w-full h-full object-cover" alt="avatar" />
        </div>
      );
    }},
    { label: 'ФИО', sortKey: 'last_name', width: 'w-[800px]', render: (row) => (
      <div 
        onClick={() => openPlayerProfile(row.id)}
        className="cursor-pointer group flex flex-col items-start"
      >
        <span className="font-bold text-[14px] text-azure group-hover:text-azure-dark transition-colors leading-tight block truncate">
          {`${row.last_name || ''} ${row.first_name || ''}`.trim() || 'Без имени'}
        </span>
        {row.middle_name && (
          <span className="text-[12px] text-graphite-light block truncate mt-0.5">
            {row.middle_name}
          </span>
        )}
      </div>
    )},
    { label: 'Дата рождения', sortKey: 'birth_date', width: 'w-[200px] text-center', render: (row) => <span className="text-graphite-light">{row.birth_date ? new Date(row.birth_date).toLocaleDateString('ru-RU') : '-'}</span> },
    { label: 'Последняя команда', sortKey: 'last_team_name', width: 'w-[260px] text-center', render: (row) => {
      if (!row.last_team_logo && !row.last_team_name) return <span className="text-graphite-light">-</span>;
      return (
        <div className="flex justify-center">
          <Tooltip 
            title={row.last_team_name || 'Неизвестная команда'}
            subtitle={row.last_team_city || ''}
          >
            <div className="w-[50px] h-[50px] flex items-center justify-center p-1 rounded-md cursor-help">
              <img 
                src={getImageUrl(row.last_team_logo || '/default/Logo_team_default.webp')} 
                className="w-full h-full object-contain" 
                alt="logo" 
              />
            </div>
          </Tooltip>
        </div>
      );
    }},
  ];

  // --- КОЛОНКИ: КОМАНДЫ ---
  const teamColumns = [
    { label: '#', width: 'w-[20px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Логотип', width: 'w-[60px]', render: (row) => (
      <div className="w-[50px] h-[50px] flex items-center justify-center p-1 shrink-0 rounded-md">
        <img src={getImageUrl(row.logo_url || '/default/Logo_team_default.webp')} className="w-full h-full object-contain" alt="logo" />
      </div>
    )},
    { label: 'Название Команды', sortKey: 'name', width: 'w-[360px]', render: (row) => <span className="font-bold text-graphite">{row.name}</span> },
    { label: 'Абр.', sortKey: 'short_name', width: 'w-[100px] text-center', render: (row) => <span className="text-graphite/70">{row.short_name || '-'}</span> },
    { label: 'Город', sortKey: 'city', width: 'w-[150px]', align: 'center', render: (row) => <span className="text-graphite-light">{row.city || '-'}</span> },
    { label: 'Игр', sortKey: 'display_games', width: 'w-[50px] text-center', render: (row) => row.display_games },
    { label: 'Побед', sortKey: 'display_wins', width: 'w-[50px] text-center', render: (row) => row.display_wins },
    { label: 'Ничьи', sortKey: 'display_draws', width: 'w-[50px] text-center', render: (row) => row.display_draws },
    { label: 'Пораж.', sortKey: 'display_losses', width: 'w-[50px] text-center', render: (row) => row.display_losses },
    { label: 'Забр.', sortKey: 'display_goals_for', width: 'w-[50px] text-center', render: (row) => row.display_goals_for },
    { label: 'Проп.', sortKey: 'display_goals_against', width: 'w-[100px] text-center', render: (row) => row.display_goals_against },
  ];

  // --- КОЛОНКИ: АРЕНЫ ---
  const arenaColumns = [
    { label: '#', width: 'w-[60px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Название', sortKey: 'name', width: 'w-[400px]', render: (row) => <span className="font-semibold text-graphite">{row.name}</span> },
    { label: 'Город', sortKey: 'city', width: 'w-[200px]', render: (row) => <span className="text-graphite">{row.city}</span> },
    { label: 'Адрес', sortKey: 'address', width: 'w-[300px]', render: (row) => <span className="text-graphite-light">{row.address || '-'}</span> },
  ];


  const getColumns = () => {
    if (activeTab === 0) return userColumns;
    if (activeTab === 1) return teamColumns;
    if (activeTab === 2) return arenaColumns;
    return [];
  };

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header title="Справочник" />
      
      {toast && <div className="fixed top-[110px] right-10 z-[9999]"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <div className="flex items-start px-10 pt-8 gap-8 relative z-10">
        
        {/* ЛЕВАЯ ПАНЕЛЬ ФИЛЬТРОВ (Зафиксирована) */}
        <div className="w-[340px] shrink-0 sticky top-[128px] h-[320px] overflow-y-auto bg-white/30 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-6 flex flex-col gap-6 custom-scrollbar z-20">
          
          {/* Главный переключатель сущностей */}
          <div className="shrink-0 mb-2">
            <SegmentButton 
              options={['Пользов.', 'Команды', 'Арены']} 
              defaultIndex={activeTab} 
              onChange={setActiveTab} 
            />
          </div>

          <div className="flex flex-col gap-6">
            {/* Дополнительный фильтр типа матчей (только для команд) */}
            {activeTab === 1 && (
              <div className="space-y-2 animate-fade-in-down">
                <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Тип матчей</label>
                <SegmentButton 
                  options={['Все матчи', 'Официал.', 'Товарищ.']} 
                  defaultIndex={matchType} 
                  onChange={setMatchType} 
                />
              </div>
            )}

            {/* Поисковая строка */}
            <div className="space-y-2">
              <Input
                label="Поиск по справочнику"
                placeholder={activeTab === 0 ? "Поиск по ФИО..." : "Поиск по названию или городу..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ПРАВАЯ ЧАСТЬ СО СПИСКОМ (Таблица) */}
        <div className="flex-1 relative z-10 min-h-[500px]">
          {isLoading && (
            <div className="absolute inset-0 z-30 flex items-start pt-20 justify-center pointer-events-none">
              <Loader text="Загрузка справочника..." />
            </div>
          )}
          
          <div className={`transition-opacity duration-300 ease-in-out ${isLoading ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            {!isLoading && filteredData.length === 0 ? (
              <div className="flex items-center justify-center py-20 text-graphite-light font-medium">
                По вашему запросу ничего не найдено
              </div>
            ) : (
              <Table columns={getColumns()} data={filteredData} />
            )}
          </div>
        </div>

      </div>

      {/* Модальное окно профиля игрока */}
      {isPlayerModalOpen && selectedPlayerId && (
        <PlayerProfileModal 
          isOpen={isPlayerModalOpen}
          onClose={() => {
            setIsPlayerModalOpen(false);
            setSelectedPlayerId(null);
          }}
          playerId={selectedPlayerId}
        />
      )}
    </div>
  );
}