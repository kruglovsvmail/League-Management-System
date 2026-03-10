import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/Header';
import { Table } from '../ui/Table'; // Используем твой Table2.jsx
import { Loader } from '../ui/Loader';
import { Toast } from '../modals/Toast';
import { PlayerProfileModal } from '../modals/PlayerProfileModal';
import { SegmentButton } from '../ui/SegmentButton';
import { Tooltip } from '../ui/Tooltip';
import { Input } from '../ui/Input';
import { getImageUrl, setExpiringStorage, getExpiringStorage, getToken } from '../utils/helpers';

export function HandbookPage() {
  const [activeTab, setActiveTab] = useState(0); // 0: Пользователи, 1: Команды, 2: Арены
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  
  // Состояния фильтров
  const [searchQuery, setSearchQuery] = useState('');
  const [matchType, setMatchType] = useState(0); // 0: Все, 1: Официальные, 2: Товарищеские

  // Состояния модального окна профиля игрока
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  useEffect(() => {
    fetchData(activeTab);
    setSearchQuery(''); // Сбрасываем поиск при переключении вкладок
    setMatchType(0);
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
    { label: 'ФИО', width: 'w-[800px]', render: (row) => (
      <button 
        onClick={() => openPlayerProfile(row.id)}
        className="font-bold text-azure hover:text-azure-dark transition-colors text-left"
      >
        {`${row.last_name || ''} ${row.first_name || ''} ${row.middle_name || ''}`.trim() || 'Без имени'}
      </button>
    )},
    { label: 'Дата рождения', width: 'w-[200px] text-center', render: (row) => <span className="text-graphite-light">{row.birth_date ? new Date(row.birth_date).toLocaleDateString('ru-RU') : '-'}</span> },
    { label: 'Последняя команда', width: 'w-[260px] text-center', render: (row) => {
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
    { label: '#', width: 'w-[60px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Логотип', width: 'w-[60px]', render: (row) => (
      <div className="w-[50px] h-[50px] flex items-center justify-center p-1 shrink-0 rounded-md">
        <img src={getImageUrl(row.logo_url || '/default/Logo_team_default.webp')} className="w-full h-full object-contain" alt="logo" />
      </div>
    )},
    { label: 'Название Команды', width: 'w-[360px]', render: (row) => <span className="font-bold text-graphite">{row.name}</span> },
    { label: 'Абр.', width: 'w-[100px] text-center', render: (row) => <span className="text-graphite/70">{row.short_name || '-'}</span> },
    { label: 'Город', width: 'w-[150px]', render: (row) => <span className="text-graphite-light">{row.city || '-'}</span> },
    { label: 'Игр', width: 'w-[60px] text-center', render: (row) => {
      if (matchType === 1) return row.official_games_played;
      if (matchType === 2) return row.friendly_games_played;
      return row.official_games_played + row.friendly_games_played;
    }},
    { label: 'Победы', width: 'w-[60px] text-center', render: (row) => {
      if (matchType === 1) return row.official_wins;
      if (matchType === 2) return row.friendly_wins;
      return row.official_wins + row.friendly_wins;
    }},
    { label: 'Ничьи', width: 'w-[60px] text-center', render: (row) => {
      if (matchType === 1) return row.official_draws;
      if (matchType === 2) return row.friendly_draws;
      return row.official_draws + row.friendly_draws;
    }},
    { label: 'Пораж.', width: 'w-[60px] text-center', render: (row) => {
      if (matchType === 1) return row.official_losses;
      if (matchType === 2) return row.friendly_losses;
      return row.official_losses + row.friendly_losses;
    }},
    { label: 'Забр.', width: 'w-[60px] text-center', render: (row) => {
      if (matchType === 1) return row.official_goals_for;
      if (matchType === 2) return row.friendly_goals_for;
      return row.official_goals_for + row.friendly_goals_for;
    }},
    { label: 'Проп.', width: 'w-[100px] text-center', render: (row) => {
      if (matchType === 1) return row.official_goals_against;
      if (matchType === 2) return row.friendly_goals_against;
      return row.official_goals_against + row.friendly_goals_against;
    }},
  ];

  // --- КОЛОНКИ: АРЕНЫ ---
  const arenaColumns = [
    { label: '#', width: 'w-[60px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Название', width: 'w-[400px]', render: (row) => <span className="font-semibold text-graphite">{row.name}</span> },
    { label: 'Город', width: 'w-[200px]', render: (row) => <span className="text-graphite">{row.city}</span> },
    { label: 'Адрес', width: 'w-[300px]', render: (row) => <span className="text-graphite-light">{row.address || '-'}</span> },
  ];

  // Фильтрация данных по поиску
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const lowerQuery = searchQuery.toLowerCase();

    return data.filter(item => {
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
  }, [data, searchQuery, activeTab]);

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