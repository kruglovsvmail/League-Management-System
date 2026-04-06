import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { getToken, getImageUrl } from '../utils/helpers';
import { Header } from '../components/Header';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { Toast } from '../modals/Toast';
import { Switch } from '../ui/Switch';
import { DateTimePicker } from '../ui/DateTimePicker';
import { Tooltip } from '../ui/Tooltip';
import { useAccess } from '../hooks/useAccess';
import dayjs from 'dayjs';
import 'dayjs/locale/ru'; 

dayjs.locale('ru'); 

const STAGE_TYPES = ['Регулярка', 'Плей-офф'];
const REGULAR_ROUNDS = ['1-й круг', '2-й круг', '3-й круг', '4-й круг', '5-й круг', '6-й круг'];
const PLAYOFF_ROUNDS = ['1/8 финала', '1/4 финала', '1/2 финала', 'Финал', 'Матч за 3-е место'];

export function GamesPage() {
  const { user, selectedLeague } = useOutletContext();
  const navigate = useNavigate(); 
  const { checkAccess } = useAccess();
  
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  
  const [divisions, setDivisions] = useState([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState(null);
  
  const [games, setGames] = useState([]);
  const [arenas, setArenas] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const [isEditMode, setIsEditMode] = useState(false);
  // ИНВЕРТИРОВАННАЯ ЛОГИКА: По умолчанию показываем завершенные матчи
  const [showFinished, setShowFinished] = useState(true); 
  const [editingRowIds, setEditingRowIds] = useState([]); 

  const canCreateGames = checkAccess('CREATE_GAMES');

  useEffect(() => {
    if (selectedLeague?.id) fetchSeasons(selectedLeague.id);
  }, [selectedLeague]);

  useEffect(() => {
    fetchArenas();
  }, []);

  useEffect(() => {
    if (isEditMode) setEditingRowIds([]);
  }, [isEditMode]);

  const fetchArenas = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/arenas`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setArenas(data.data);
    } catch (err) { console.error('Ошибка загрузки арен', err); }
  };

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
      if (data.success && data.data.length > 0) {
        setDivisions(data.data);
        setSelectedDivisionId(data.data[0].id);
      } else {
        setDivisions([]);
        setSelectedDivisionId(null);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (selectedSeasonId && selectedDivisionId) {
      loadGames();
    } else {
      setGames([]);
    }
  }, [selectedSeasonId, selectedDivisionId]);

  const loadGames = async () => {
    if (!selectedSeasonId || !selectedDivisionId) return;
    setIsLoading(true);

    try {
      const activeDiv = divisions.find(d => d.id === selectedDivisionId);
      const queryParams = new URLSearchParams({
        division: activeDiv ? activeDiv.name : ''
      });

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/games?${queryParams}`, { 
        headers: { 'Authorization': `Bearer ${getToken()}` } 
      });
      
      const data = await res.json();
      if (data.success) {
        setGames(data.data);
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) { 
      setToast({ title: 'Ошибка', message: 'Сбой загрузки расписания', type: 'error' }); 
    } finally {
      setIsLoading(false);
    }
  };

  const activeDivision = divisions.find(d => d.id === selectedDivisionId);
  const approvedTeams = activeDivision ? (activeDivision.teams || []).filter(t => t.status === 'approved') : [];

  const handleCreateGameSlot = () => {
    const nextNum = games.length > 0 ? Math.max(...games.map(g => g.game_number || 0)) + 1 : 1;
    const tempGame = {
        id: `temp_${Date.now()}`,
        isTemp: true,
        division_id: selectedDivisionId,
        game_number: nextNum,
        home_team_id: null,
        away_team_id: null,
        game_date: null,
        arena_id: null,
        status: 'scheduled',
        stage_type: 'regular',
        stage_label: '1-й круг',
        series_number: 1,
        home_team_name: 'Не выбрано',
        away_team_name: 'Не выбрано',
        location_text: 'Не назначена',
        has_protocol: false
    };
    setGames(prev => [...prev, tempGame]);
  };

  const handleUpdateGameFields = async (gameId, updatesObj) => {
    let payloads = { ...updatesObj };
    let extraUpdates = {};

    if ('game_date' in updatesObj && updatesObj.game_date) {
        payloads.game_date = dayjs(updatesObj.game_date).format('YYYY-MM-DDTHH:mm:ss');
    }
    
    if ('home_team_id' in updatesObj) {
        const t = approvedTeams.find(t => t.team_id === updatesObj.home_team_id);
        if (t) { extraUpdates.home_team_name = t.name; extraUpdates.home_team_logo = t.logo_url; }
        else { extraUpdates.home_team_name = 'Не выбрано'; extraUpdates.home_team_logo = ''; }
    }
    if ('away_team_id' in updatesObj) {
        const t = approvedTeams.find(t => t.team_id === updatesObj.away_team_id);
        if (t) { extraUpdates.away_team_name = t.name; extraUpdates.away_team_logo = t.logo_url; }
        else { extraUpdates.away_team_name = 'Не выбрано'; extraUpdates.away_team_logo = ''; }
    }
    if ('arena_id' in updatesObj) {
        const a = arenas.find(a => a.id === updatesObj.arena_id);
        if (a) { extraUpdates.location_text = a.name; }
        else { extraUpdates.location_text = 'Не назначена'; }
    }

    setGames(prev => prev.map(g => g.id === gameId ? { ...g, ...updatesObj, ...extraUpdates } : g));

    const targetGame = games.find(g => g.id === gameId);
    const nextGame = { ...targetGame, ...updatesObj, ...extraUpdates };

    if (targetGame.isTemp) {
        if (nextGame.home_team_id && nextGame.away_team_id) {
            try {
                const payload = {
                    division_id: nextGame.division_id,
                    game_number: nextGame.game_number,
                    home_team_id: nextGame.home_team_id,
                    away_team_id: nextGame.away_team_id,
                    game_date: nextGame.game_date ? dayjs(nextGame.game_date).format('YYYY-MM-DDTHH:mm:ss') : null,
                    arena_id: nextGame.arena_id,
                    stage_type: nextGame.stage_type,
                    stage_label: nextGame.stage_label,
                    series_number: nextGame.series_number
                };

                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/games`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                    body: JSON.stringify(payload)
                });
                
                const data = await res.json();
                if (data.success) {
                    setGames(prev => prev.map(g => g.id === gameId ? { ...g, ...data.data, isTemp: false } : g));
                    setToast({ title: 'Успешно', message: 'Матч добавлен в расписание', type: 'success' });
                } else {
                    setToast({ title: 'Ошибка', message: data.error, type: 'error' });
                }
            } catch (err) {
                setToast({ title: 'Ошибка', message: 'Сбой сохранения слота', type: 'error' });
            }
        }
    } else {
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/info`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payloads)
            });
        } catch (err) {
            setToast({ title: 'Ошибка синхронизации', message: 'Не удалось сохранить изменения', type: 'error' });
        }
    }
  };

  const handleDeleteGame = async (gameId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот матч? Действие необратимо.')) return;
    
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        
        if (data.success) {
            setGames(prev => prev.filter(g => g.id !== gameId));
            setEditingRowIds(prev => prev.filter(id => id !== gameId));
            setToast({ title: 'Успешно', message: 'Матч удален', type: 'success' });
        } else {
            setToast({ title: 'Ошибка', message: data.error, type: 'error' });
        }
    } catch (err) {
        setToast({ title: 'Ошибка', message: 'Сбой удаления матча', type: 'error' });
    }
  };

  if (!selectedLeague) {
    return (
      <div className="flex flex-col flex-1 animate-fade-in-down">
        <Header title="Расписание" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <div className="text-center text-status-rejected font-medium text-lg bg-status-rejected/5 px-8 py-6 rounded-2xl border border-status-rejected/10">
            Выберите лигу для просмотра расписания
          </div>
        </main>
      </div>
    );
  }

  const seasonOptions = seasons.map(s => s.name);
  const currentSeasonName = seasons.find(s => s.id === selectedSeasonId)?.name || '';

  const divisionOptions = divisions.map(d => d.name);
  const currentDivisionName = divisions.find(d => d.id === selectedDivisionId)?.name || '';
  
  const arenaOptions = ['Не назначена', ...arenas.map(a => a.name)];

  // Если тумблер выключен (!showFinished), то скрываем finished и cancelled
  const displayedGames = !showFinished 
    ? games.filter(g => g.status !== 'finished' && g.status !== 'cancelled') 
    : games;

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header 
        title="Расписание матчей" 
        actions={
          <div className="flex items-center gap-6">
            
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-md border border-graphite/10 shadow-sm">
              <span className={`text-[12px] font-bold uppercase tracking-wider ${showFinished ? 'text-orange' : 'text-graphite-light'}`}>
                Завершенные
              </span>
              <Switch checked={showFinished} onChange={() => setShowFinished(!showFinished)} />
            </div>

            {canCreateGames && (
              <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-md border border-graphite/10 shadow-sm">
                <span className={`text-[12px] font-bold uppercase tracking-wider ${isEditMode ? 'text-orange' : 'text-graphite-light'}`}>
                  Редакт.
                </span>
                <Switch checked={isEditMode} onChange={() => setIsEditMode(!isEditMode)} />
              </div>
            )}

            {divisions.length > 0 && (
              <div className="w-56">
                <Select 
                  options={divisionOptions} 
                  value={currentDivisionName} 
                  onChange={(selectedName) => {
                    const d = divisions.find(d => d.name === selectedName);
                    if (d) setSelectedDivisionId(d.id);
                  }} 
                />
              </div>
            )}

            {seasons.length > 0 && (
              <div className="w-48">
                <Select 
                  options={seasonOptions} 
                  value={currentSeasonName} 
                  onChange={(selectedName) => {
                    const s = seasons.find(s => s.name === selectedName);
                    if (s) setSelectedSeasonId(s.id);
                  }} 
                />
              </div>
            )}

          </div>
        }
      />

      {toast && <div className="fixed top-[110px] right-10 z-[9999]"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <main className="flex-1 px-10 pt-8 relative">
        {isLoading ? (
            <div className="absolute inset-0 flex items-start pt-20 justify-center">
              <Loader />
            </div>
        ) : (
          <div className="max-w-[1400px] mx-auto flex flex-col gap-3">
            
            {!selectedDivisionId ? (
              <div className="text-center py-20 text-graphite-light font-medium bg-white/40 border border-dashed border-graphite/20 rounded-2xl">
                Выберите дивизион для просмотра расписания
              </div>
            ) : displayedGames.length === 0 && !isEditMode ? (
              <div className="text-center py-20 text-graphite-light font-medium bg-white/40 border border-dashed border-graphite/20 rounded-2xl">
                {games.length > 0 ? "Включите тумблер «Завершенные», чтобы увидеть сыгранные матчи." : "В этом дивизионе пока нет матчей. Включите режим редактирования, чтобы составить календарь."}
              </div>
            ) : (
              <>
                {displayedGames.map((game) => {
                  
                  const isFinishedOrLive = ['live', 'finished', 'cancelled'].includes(game.status);
                  const isHomeSO = game.status === 'finished' && game.end_type === 'so' && game.home_score > game.away_score;
                  const isAwaySO = game.status === 'finished' && game.end_type === 'so' && game.away_score > game.home_score;
                  
                  const isRowEditing = isEditMode || editingRowIds.includes(game.id) || game.isTemp;
                  
                  if (isRowEditing) {
                    let homeOptions = [];
                    let awayOptions = [];

                    if (game.has_protocol && !game.isTemp) {
                        homeOptions = ['Очистите события и составы'];
                        awayOptions = ['Очистите события и составы'];
                    } else {
                        homeOptions = ['Не выбрано', ...approvedTeams.filter(t => t.team_id !== game.away_team_id).map(t => t.name)];
                        awayOptions = ['Не выбрано', ...approvedTeams.filter(t => t.team_id !== game.home_team_id).map(t => t.name)];
                    }

                    return (
                        <div key={game.id} className={`flex items-center gap-4 px-6 h-[110px] bg-white rounded-xl border transition-all shadow-sm hover:shadow-md ${isFinishedOrLive ? 'opacity-60 border-graphite/5' : 'border-graphite/10'}`}>
                            
                            <div className="w-12 shrink-0">
                                <input 
                                    type="number" 
                                    className="w-full text-center bg-graphite/5 border border-graphite/10 rounded-lg py-[9px] text-[14px] font-bold text-graphite outline-none focus:border-orange transition-colors"
                                    value={game.game_number || ''}
                                    onChange={(e) => setGames(prev => prev.map(g => g.id === game.id ? { ...g, game_number: e.target.value } : g))}
                                    onBlur={(e) => handleUpdateGameFields(game.id, { game_number: e.target.value ? parseInt(e.target.value) : null })}
                                    disabled={isFinishedOrLive}
                                />
                            </div>

                            <div className="w-[180px] shrink-0 flex flex-col gap-2">
                                <div className={isFinishedOrLive ? 'pointer-events-none' : ''}>
                                    <Select 
                                        options={STAGE_TYPES}
                                        value={game.stage_type === 'playoff' ? 'Плей-офф' : 'Регулярка'}
                                        onChange={(val) => {
                                            const isPlayoff = val === 'Плей-офф';
                                            handleUpdateGameFields(game.id, { 
                                                stage_type: isPlayoff ? 'playoff' : 'regular',
                                                stage_label: isPlayoff ? 'Финал' : '1-й круг'
                                            });
                                        }}
                                        disabled={isFinishedOrLive}
                                    />
                                </div>
                                <div className={`flex items-center gap-2 ${isFinishedOrLive ? 'pointer-events-none' : ''}`}>
                                    <div className="flex-1">
                                        <Select 
                                            options={game.stage_type === 'playoff' ? PLAYOFF_ROUNDS : REGULAR_ROUNDS}
                                            value={game.stage_label || (game.stage_type === 'playoff' ? 'Финал' : '1-й круг')}
                                            onChange={(val) => handleUpdateGameFields(game.id, { stage_label: val })}
                                            disabled={isFinishedOrLive}
                                        />
                                    </div>
                                    <div className="w-14 flex items-center justify-center shrink-0">
                                        <input 
                                            type="number" 
                                            className="w-full text-center bg-graphite/5 border border-graphite/10 rounded-lg py-[9px] text-[12px] font-bold text-graphite outline-none focus:border-orange transition-colors"
                                            value={game.series_number || ''}
                                            placeholder="Тур"
                                            onChange={(e) => setGames(prev => prev.map(g => g.id === game.id ? { ...g, series_number: e.target.value } : g))}
                                            onBlur={(e) => handleUpdateGameFields(game.id, { series_number: e.target.value ? parseInt(e.target.value) : 1 })}
                                            disabled={isFinishedOrLive}
                                            title={game.stage_type === 'playoff' ? 'Номер матча' : 'Тур'}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="w-[200px] shrink-0 flex flex-col gap-2 relative">
                                <div className={isFinishedOrLive ? 'pointer-events-none' : ''}>
                                    <DateTimePicker 
                                        value={game.game_date} 
                                        onChange={(val) => handleUpdateGameFields(game.id, { game_date: val })} 
                                        placeholder="Дата не назначена"
                                    />
                                </div>
                                <div className={isFinishedOrLive ? 'pointer-events-none' : ''}>
                                    <Select 
                                        options={arenaOptions}
                                        value={game.location_text || 'Не назначена'}
                                        onChange={(val) => {
                                            if (val === 'Не назначена') handleUpdateGameFields(game.id, { arena_id: null });
                                            else {
                                                const a = arenas.find(ar => ar.name === val);
                                                handleUpdateGameFields(game.id, { arena_id: a ? a.id : null });
                                            }
                                        }}
                                        disabled={isFinishedOrLive}
                                    />
                                </div>
                            </div>

                            <div className="flex-1 flex justify-end items-center">
                                <div className="w-full max-w-[280px]">
                                    <Select 
                                        disabled={isFinishedOrLive}
                                        options={homeOptions}
                                        value={game.home_team_name || 'Не выбрано'}
                                        onChange={(val) => {
                                            if (val.includes('Очистите') || val === 'Не выбрано') {
                                                handleUpdateGameFields(game.id, { home_team_id: null });
                                            } else {
                                                const t = approvedTeams.find(team => team.name === val);
                                                handleUpdateGameFields(game.id, { home_team_id: t ? t.team_id : null });
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="w-16 shrink-0 flex items-center justify-center font-black text-[16px]">
                                {game.status !== 'scheduled' ? (
                                    <div className={`relative inline-flex items-center justify-center ${game.status === 'live' ? 'text-blue-500' : 'text-graphite/60'}`}>
                                        {game.is_technical ? (
                                            <span className="text-status-rejected">{game.home_score > game.away_score ? '+' : '-'}:{game.away_score > game.home_score ? '+' : '-'}</span>
                                        ) : (
                                            <>
                                                {isHomeSO && <span className="absolute right-full mr-1 text-[11px] text-orange top-1/2 -translate-y-1/2">Б</span>}
                                                {game.home_score || 0}:{game.away_score || 0}
                                                {isAwaySO && <span className="absolute left-full ml-1 text-[11px] text-orange top-1/2 -translate-y-1/2">Б</span>}
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-graphite/30">VS</span>
                                )}
                            </div>

                            <div className="flex-1 flex justify-start items-center">
                                <div className="w-full max-w-[280px]">
                                    <Select 
                                        disabled={isFinishedOrLive}
                                        options={awayOptions}
                                        value={game.away_team_name || 'Не выбрано'}
                                        onChange={(val) => {
                                            if (val.includes('Очистите') || val === 'Не выбрано') {
                                                handleUpdateGameFields(game.id, { away_team_id: null });
                                            } else {
                                                const t = approvedTeams.find(team => team.name === val);
                                                handleUpdateGameFields(game.id, { away_team_id: t ? t.team_id : null });
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="w-24 shrink-0 flex justify-center items-center gap-1">
                                {game.isTemp ? (
                                    <Tooltip title="Удалить пустой слот" noUnderline={true}>
                                        <button 
                                            onClick={() => setGames(prev => prev.filter(g => g.id !== game.id))}
                                            className="text-graphite/30 hover:text-status-rejected transition-colors p-2"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        </button>
                                    </Tooltip>
                                ) : (
                                    <>
                                        {editingRowIds.includes(game.id) && !isEditMode && (
                                            <Tooltip title="Готово" noUnderline={true}>
                                                <button 
                                                    onClick={() => setEditingRowIds(prev => prev.filter(id => id !== game.id))}
                                                    className="text-graphite/40 hover:text-green-500 bg-graphite/5 hover:bg-green-50 transition-colors p-2 rounded-lg"
                                                >
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                </button>
                                            </Tooltip>
                                        )}
                                        
                                        <Tooltip 
                                            title={
                                                isFinishedOrLive ? 'Невозможно удалить' :
                                                game.has_protocol ? 'Невозможно удалить' : 
                                                'Удалить матч'
                                            }
                                            subtitle={
                                                isFinishedOrLive ? 'Удалить можно только матч с статусом "В расписании"' :
                                                game.has_protocol ? 'Очистите составы, события и судей перед удалением' : 
                                                null
                                            }
                                            noUnderline={true}
                                        >
                                            <button 
                                                onClick={() => handleDeleteGame(game.id)}
                                                disabled={game.has_protocol || isFinishedOrLive}
                                                className={`p-2 rounded-lg transition-colors ${
                                                    game.has_protocol || isFinishedOrLive 
                                                        ? 'text-graphite/20 cursor-not-allowed' 
                                                        : 'text-graphite/40 hover:text-status-rejected hover:bg-status-rejected/10'
                                                }`}
                                            >
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                                            </button>
                                        </Tooltip>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                  }

                  const gameDate = dayjs(game.game_date);
                  const dateStr = gameDate.isValid() ? `${gameDate.format('D MMMM YYYY')}  |  ${gameDate.format('HH:mm')}` : 'Время не назначено';

                  return (
                    <div 
                        key={game.id} 
                        onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                                window.open(`/games/${game.id}`, '_blank');
                            } else {
                                navigate(`/games/${game.id}`);
                            }
                        }}
                        onMouseDown={(e) => {
                            if (e.button === 1) {
                                e.preventDefault();
                                window.open(`/games/${game.id}`, '_blank');
                            }
                        }}
                        className="flex items-center gap-4 px-6 h-[110px] bg-white/70 rounded-xl border border-graphite/10 cursor-pointer hover:border-orange/40 hover:shadow-md transition-all duration-200 group relative"
                    >
                        <div className="w-12 text-center text-[15px] font-black text-graphite/40 shrink-0">{game.game_number || '-'}</div>
                        
                        <div className="w-[180px] shrink-0 flex flex-col justify-center gap-0.5">
                            <span className="text-[10px] font-black uppercase text-graphite/40 tracking-wider">
                                {game.stage_type === 'playoff' ? 'Плей-офф' : 'Регулярка'}
                            </span>
                            <span className="text-[12px] font-bold text-graphite">
                                {game.stage_label || '1-й круг'}
                            </span>
                            <span className="text-[11px] font-medium text-graphite/50">
                                {game.stage_type === 'playoff' ? 'Матч ' : 'Тур '}{game.series_number || 1}
                            </span>
                        </div>
                        
                        <div className="w-[200px] shrink-0 flex flex-col justify-center gap-1">
                            <span className="text-[12px] font-bold text-graphite">{dateStr}</span>
                            <span className="text-[11px] font-medium text-graphite/50 truncate pr-2" title={game.location_text}>
                                {game.location_text || 'Арена не назначена'}
                            </span>
                        </div>
                        
                        <div className="flex-1 flex items-center justify-end gap-3">
                            <span className="text-[14px] font-bold text-graphite text-right leading-tight line-clamp-1">{game.home_team_name !== 'Не выбрано' ? game.home_team_name : 'Хозяева'}</span>
                            <div className="w-9 h-9 shrink-0 rounded-md overflow-hidden bg-graphite/5">
                                <img src={getImageUrl(game.home_team_logo || '/default/Logo_team_default.webp')} className="w-full h-full object-contain" alt="Home" />
                            </div>
                        </div>
                        
                        <div className="w-16 shrink-0 flex items-center justify-center">
                            {game.status === 'scheduled' ? (
                                <span className="text-[18px] font-black text-graphite/30 tracking-widest">-:-</span>
                            ) : game.is_technical ? (
                                <div className="relative inline-flex items-center justify-center text-[22px] font-black tracking-tighter text-status-rejected">
                                    {game.home_score > game.away_score ? '+' : '-'}:{game.away_score > game.home_score ? '+' : '-'}
                                </div>
                            ) : (
                                <div className={`relative inline-flex items-center justify-center text-[22px] font-black tracking-tighter ${game.status === 'live' ? 'text-blue-500' : 'text-graphite'}`}>
                                    {isHomeSO && <span className="absolute right-full mr-1 text-[12px] text-orange top-1/2 -translate-y-1/2">Б</span>}
                                    {game.home_score || 0}:{game.away_score || 0}
                                    {isAwaySO && <span className="absolute left-full ml-1 text-[12px] text-orange top-1/2 -translate-y-1/2">Б</span>}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 flex items-center justify-start gap-3">
                            <div className="w-9 h-9 shrink-0 rounded-md overflow-hidden bg-graphite/5">
                                <img src={getImageUrl(game.away_team_logo || '/default/Logo_team_default.webp')} className="w-full h-full object-contain" alt="Away" />
                            </div>
                            <span className="text-[14px] font-bold text-graphite text-left leading-tight line-clamp-1">{game.away_team_name !== 'Не выбрано' ? game.away_team_name : 'Гости'}</span>
                        </div>

                        <div className="w-24 shrink-0 flex justify-center items-center relative h-full">
                            
                            <div className={`transition-opacity duration-200 flex items-center justify-center ${canCreateGames && game.status === 'scheduled' ? 'group-hover:opacity-0' : ''}`}>
                                {game.status === 'live' && <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">Live</span>}
                                {game.status === 'finished' && <span className="text-[10px] font-bold text-graphite/50 uppercase tracking-widest">Завершен</span>}
                                {game.status === 'cancelled' && <span className="text-[10px] font-bold text-status-rejected uppercase tracking-widest">Отменен</span>}
                                {game.status === 'scheduled' && <span className="text-[10px] font-bold text-orange uppercase tracking-widest">В расписании</span>}
                            </div>

                            {canCreateGames && game.status === 'scheduled' && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation(); 
                                        setEditingRowIds(prev => [...prev, game.id]);
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="absolute inset-0 m-auto w-10 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/80 backdrop-blur-sm rounded-lg text-graphite/50 hover:text-orange hover:shadow-sm"
                                    title="Быстрое редактирование"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 20h9"></path>
                                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                    </svg>
                                </button>
                            )}

                        </div>
                    </div>
                  );
                })}

                {isEditMode && (
                    <div className="mt-4 flex justify-center">
                        <Button onClick={handleCreateGameSlot} className="px-8 py-3 shadow-[0_4px_15px_rgba(255,107,0,0.2)]">
                            + Добавить слот матча
                        </Button>
                    </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}