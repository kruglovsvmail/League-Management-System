import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { Header } from '../components/Header';
import { Table } from '../ui/Table';
import { Loader } from '../ui/Loader';
import { Toast } from '../modals/Toast';
import { PlayerProfileModal } from '../modals/PlayerProfileModal';
import { QualSelectModal } from '../modals/QualSelectModal';
import { SegmentButton } from '../ui/SegmentButton';
import { Tooltip } from '../ui/Tooltip';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { useAccess } from '../hooks/useAccess';
import { getImageUrl, getToken } from '../utils/helpers';

export function HandbookPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Справочник общий по системе, а квалификация — лиговая. Поэтому колонка «Квал.» и
  // присвоение работают в ТЕКУЩЕЙ выбранной лиге: человек из чужой лиги показывает прочерк,
  // и ему можно присвоить квалификацию в своей.
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  const leagueId = selectedLeague?.id || null;

  const activeTab = parseInt(searchParams.get('tab') || '0', 10);
  const matchType = parseInt(searchParams.get('match') || '0', 10);
  const searchQuery = searchParams.get('q') || '';
  // Фильтр по команде живёт только на вкладке «Пользователи» и сбрасывается вместе
  // с поиском при смене вкладки
  const teamQuery = searchParams.get('team') || '';

  const setActiveTab = (index) => {
    setSearchParams(prev => {
      prev.set('tab', index);
      prev.delete('q');
      prev.delete('match');
      prev.delete('team');
      return prev;
    }, { replace: true });
  };

  const setMatchType = (index) => {
    setSearchParams(prev => { prev.set('match', index); return prev; }, { replace: true });
  };

  const setSearchQuery = (val) => {
    setSearchParams(prev => {
      if (val) prev.set('q', val);
      else prev.delete('q');
      return prev;
    }, { replace: true });
  };

  const setTeamQuery = (val) => {
    setSearchParams(prev => {
      if (val) prev.set('team', val);
      else prev.delete('team');
      return prev;
    }, { replace: true });
  };

  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // === ПАГИНАЦИЯ (БЕСКОНЕЧНЫЙ СКРОЛЛ) ===
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const observer = useRef();

  // Реф для отслеживания последнего элемента в списке
  const lastElementRef = useCallback(node => {
    if (isLoading || isFetchingMore) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1); // Грузим следующую страницу
      }
    });
    if (node) observer.current.observe(node);
  }, [isLoading, isFetchingMore, hasMore]);

  // При смене вкладки или изменении поиска — сбрасываем список и грузим с 1 страницы
  useEffect(() => {
    setPage(1);
    setData([]);
    setHasMore(true);
    // Делаем задержку для поиска (Debounce), чтобы не спамить бэкенд при каждом вводе буквы
    const timeout = setTimeout(() => {
      fetchData(activeTab, 1, searchQuery, true, teamQuery);
    }, 400);

    return () => clearTimeout(timeout);
  }, [activeTab, searchQuery, teamQuery, leagueId]);

  // Подгрузка при изменении страницы (скролле)
  useEffect(() => {
    if (page > 1) {
      fetchData(activeTab, page, searchQuery, false, teamQuery);
    }
  }, [page]);

  const fetchData = async (tabIndex, pageNum, search, isInitial, teamSearch = '') => {
    if (isInitial) setIsLoading(true);
    else setIsFetchingMore(true);
    
    let endpoint = '';
    if (tabIndex === 0) endpoint = '/api/handbook/users';
    else if (tabIndex === 1) endpoint = '/api/handbook/teams';
    else if (tabIndex === 2) endpoint = '/api/handbook/arenas';

    try {
      const token = getToken();
      const leagueParam = tabIndex === 0 && leagueId ? `&leagueId=${leagueId}` : '';
      const teamParam = tabIndex === 0 && teamSearch ? `&team=${encodeURIComponent(teamSearch)}` : '';
      const res = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}?page=${pageNum}&limit=30&search=${encodeURIComponent(search)}${leagueParam}${teamParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      
      if (result.success) {
        if (isInitial) {
          setData(result.data);
        } else {
          // Добавляем новые данные в конец массива
          setData(prev => [...prev, ...result.data]);
        }
        setHasMore(result.hasMore);
      } else {
        setToast({ title: 'Ошибка', message: result.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Не удалось загрузить данные справочника', type: 'error' });
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
    }
  };

  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  const openPlayerProfile = (id) => {
    setSelectedPlayerId(id);
    setIsPlayerModalOpen(true);
  };

  // Справочник квалификаций лиги нужен окну выбора; тянем один раз на страницу
  const [qualPlayer, setQualPlayer] = useState(null);
  const [leagueQuals, setLeagueQuals] = useState([]);
  const [qualShowDescriptions, setQualShowDescriptions] = useState(true);
  const canViewQuals = checkAccess('SETTINGS_QUAL_VIEW');

  useEffect(() => {
    if (!leagueId || !canViewQuals) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${leagueId}/settings-qualifications`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setLeagueQuals(data.qualifications);
          setQualShowDescriptions(data.showDescriptions !== false);
        }
      })
      .catch(console.error);
  }, [leagueId, canViewQuals]);

  // Квалификация меняется во всей лиге сразу, поэтому строку достаточно обновить локально —
  // перезагружать весь справочник незачем.
  const handleQualSaved = ({ qualification_id, qualification_short_name }) => {
    setData(prev => prev.map(row => (
      row.id === qualPlayer?.id
        ? { ...row, qualification: qualification_id ? { id: qualification_id, short_name: qualification_short_name } : null }
        : row
    )));
    setToast({ title: 'Успешно', message: 'Квалификация обновлена', type: 'success' });
  };

  // Подготовка данных для таблиц
  const displayData = useMemo(() => {
    if (!data) return [];
    if (activeTab === 1) {
      return data.map(team => {
        let g = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0;
        if (matchType === 1) {
          g = team.official_games_played || 0; w = team.official_wins || 0; d = team.official_draws || 0; l = team.official_losses || 0; gf = team.official_goals_for || 0; ga = team.official_goals_against || 0;
        } else if (matchType === 2) {
          g = team.friendly_games_played || 0; w = team.friendly_wins || 0; d = team.friendly_draws || 0; l = team.friendly_losses || 0; gf = team.friendly_goals_for || 0; ga = team.friendly_goals_against || 0;
        } else {
          g = (team.official_games_played || 0) + (team.friendly_games_played || 0); w = (team.official_wins || 0) + (team.friendly_wins || 0); d = (team.official_draws || 0) + (team.friendly_draws || 0); l = (team.official_losses || 0) + (team.friendly_losses || 0); gf = (team.official_goals_for || 0) + (team.friendly_goals_for || 0); ga = (team.official_goals_against || 0) + (team.friendly_goals_against || 0);
        }
        return { ...team, display_games: g, display_wins: w, display_draws: d, display_losses: l, display_goals_for: gf, display_goals_against: ga };
      });
    }
    return data;
  }, [data, activeTab, matchType]);

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
    // Ширины: таблица table-auto делит место пропорционально подсказкам колонок, поэтому
    // раздутая ФИО отбирала его у «Команд» — логотипы не помещались в строку и сворачивались
    // в сетку. ФИО ужата вдвое, освободившееся отдано колонке команд.
    { label: 'ФИО', sortKey: 'last_name', width: 'w-[400px]', render: (row) => (
      <div onClick={() => openPlayerProfile(row.id)} className="cursor-pointer group flex flex-col items-start">
        <span className="font-bold text-[14px] text-graphite/70 group-hover:opacity-60 transition-colors leading-tight block truncate">
          {`${row.last_name || ''} ${row.first_name || ''}`.trim() || 'Без имени'}
        </span>
        {row.middle_name && <span className="text-[12px] text-graphite-light block truncate mt-0.5">{row.middle_name}</span>}
      </div>
    )},
    { label: 'Дата рождения', sortKey: 'birth_date', width: 'w-[200px] text-center', render: (row) => <span className="text-graphite-light">{row.birth_date ? new Date(row.birth_date).toLocaleDateString('ru-RU') : '-'}</span> },
    { label: 'Квал.', width: 'w-[110px] text-center', render: (row) => {
      // Квалификация показана по текущей лиге. Присвоить можно и тому, кто ещё никуда
      // не заявлен, — она привязана к человеку и лиге, а не к заявке в дивизион.
      if (!leagueId || !canViewQuals) return <span className="text-graphite-light">-</span>;

      const badge = <Badge label={row.qualification?.short_name || 'Нет'} type={row.qualification ? 'filled' : 'empty'} />;

      return (
        <div
          onClick={() => setQualPlayer({ id: row.id, name: `${row.last_name || ''} ${row.first_name || ''}`.trim() })}
          className="cursor-pointer hover:scale-105 inline-block transition-transform"
        >
          {row.qualification?.name
            ? <Tooltip title={row.qualification.name} subtitle={row.qualification.description || ''}><span>{badge}</span></Tooltip>
            : badge}
        </div>
      );
    }},
    { label: 'Команды', width: 'w-[420px] text-center', render: (row) => {
      const teams = row.current_teams || [];
      if (teams.length === 0) return <span className="text-graphite-light">-</span>;
      return (
        // flex-nowrap: логотипы всегда идут одной строкой. Обёртка со shrink-0 нужна
        // потому, что Tooltip не принимает className, а без неё flex сжимал бы логотипы.
        <div className="flex flex-nowrap justify-center items-center gap-1.5">
          {teams.map((t) => (
            <div key={t.id} className="shrink-0">
              <Tooltip title={t.name} subtitle={t.city || ''} noUnderline>
                <div className="w-[50px] h-[50px] flex items-center justify-center p-1 rounded-md cursor-help">
                  <img src={getImageUrl(t.logo_url || '/default/Logo_team_default.webp')} className="w-full h-full object-contain" alt="logo" />
                </div>
              </Tooltip>
            </div>
          ))}
        </div>
      );
    }},
  ];

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

  const arenaColumns = [
    { label: '#', width: 'w-[60px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Название', sortKey: 'name', width: 'w-[400px]', render: (row) => <span className="font-semibold text-graphite">{row.name}</span> },
    { label: 'Город', sortKey: 'city', width: 'w-[200px]', render: (row) => <span className="text-graphite">{row.city}</span> },
    { label: 'Адрес', sortKey: 'address', width: 'w-[300px]', render: (row) => <span className="text-graphite-light">{row.address || '-'}</span> },
    { label: 'Карта', width: 'w-[80px] text-center', render: (row) => {
      if (!row.address && !row.city) return <span className="text-graphite-light">-</span>;
      const query = encodeURIComponent([row.city, row.address].filter(Boolean).join(', '));
      return (
        <a
          href={`https://yandex.ru/maps/?text=${query}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-graphite/40 hover:text-orange hover:bg-orange/10 transition-colors"
          title="Открыть на Яндекс.Картах"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </a>
      );
    }},
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
        <div className="w-[340px] shrink-0 sticky top-[128px] h-[320px] overflow-y-auto bg-white/70 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-6 flex flex-col gap-6 custom-scrollbar z-20">
          <div className="shrink-0 mb-2">
            <SegmentButton options={['Пользов.', 'Команды', 'Арены']} defaultIndex={activeTab} onChange={setActiveTab} />
          </div>
          <div className="flex flex-col gap-6">
            {activeTab === 1 && (
              <div className="space-y-2 animate-zoom-in">
                <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Тип матчей</label>
                <SegmentButton options={['Все матчи', 'Официал.', 'Товарищ.']} defaultIndex={matchType} onChange={setMatchType} />
              </div>
            )}
            <div className="space-y-2">
              <Input label="Поиск по справочнику" placeholder={activeTab === 0 ? "Поиск по ФИО..." : "Поиск по названию или городу..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>

            {/* Фильтр по команде: вводим название — получаем её состав. Работает вместе
                с поиском по ФИО, поэтому стоит отдельным полем, а не переключателем. */}
            {activeTab === 0 && (
              <div className="space-y-2 animate-zoom-in">
                <Input label="Фильтр по команде" placeholder="Название или аббревиатура..." value={teamQuery} onChange={(e) => setTeamQuery(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 relative z-10 min-h-[500px]">
          {isLoading && <div className="absolute inset-0 z-30 flex items-start pt-20 justify-center pointer-events-none"><Loader text="" /></div>}
          
          <div className={`transition-opacity duration-300 ease-in-out ${isLoading ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            {!isLoading && displayData.length === 0 ? (
              <div className="flex items-center justify-center py-20 text-graphite-light font-medium">По вашему запросу ничего не найдено</div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* 
                  ВАЖНО: Мы передаем кастомный rowClassName в компонент Table, 
                  чтобы "повесить" реф (lastElementRef) на последнюю строку таблицы
                */}
                <Table 
                  columns={getColumns()} 
                  data={displayData} 
                  rowClassName={(row) => {
                    const isLast = row.id === displayData[displayData.length - 1].id;
                    // Table.jsx не поддерживает прямую передачу ref внутрь <tr> извне без модификации самого Table.
                    // Поэтому мы сделаем хитрый ход: мы положим невидимый элемент-сенсор ПОСЛЕ таблицы
                    return ''; 
                  }}
                />
                
                {/* Невидимый элемент-сенсор, при достижении которого срабатывает скролл */}
                <div ref={lastElementRef} className="h-10 w-full flex items-center justify-center">
                  {isFetchingMore && <span className="text-graphite-light text-sm font-bold animate-pulse">Загрузка данных...</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isPlayerModalOpen && selectedPlayerId && (
        <PlayerProfileModal isOpen={isPlayerModalOpen} onClose={() => { setIsPlayerModalOpen(false); setSelectedPlayerId(null); }} playerId={selectedPlayerId} />
      )}

      {qualPlayer && (
        <QualSelectModal
          isOpen={!!qualPlayer}
          onClose={() => setQualPlayer(null)}
          leagueId={leagueId}
          player={qualPlayer}
          qualifications={leagueQuals}
          showDescriptions={qualShowDescriptions}
          onSaved={handleQualSaved}
          readOnly={!checkAccess('QUAL_ASSIGN')}
        />
      )}
    </div>
  );
}