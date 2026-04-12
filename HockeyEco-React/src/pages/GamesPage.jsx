import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { getToken } from '../utils/helpers';
import { Header } from '../components/Header';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { Toast } from '../modals/Toast';
import { ConfirmModal } from '../modals/ConfirmModal';
import { Switch } from '../ui/Switch';
import { useAccess } from '../hooks/useAccess';
import { GameCard } from '../components/Games/GameCard';
import dayjs from 'dayjs';
import 'dayjs/locale/ru'; 

dayjs.locale('ru'); 

export function GamesPage() {
    const { selectedLeague } = useOutletContext();
    const { checkAccess } = useAccess();
  
    const [seasons, setSeasons] = useState([]);
    const [selectedSeasonId, setSelectedSeasonId] = useState(null);
    
    const [divisions, setDivisions] = useState([]);
    const [selectedDivisionId, setSelectedDivisionId] = useState(null);
    
    const [games, setGames] = useState([]);
    const [arenas, setArenas] = useState([]);
    
    const [brackets, setBrackets] = useState([]);

    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [toast, setToast] = useState(null);

    const [isEditMode, setIsEditMode] = useState(false);
    const [showFinished, setShowFinished] = useState(true); 
    const [editingRowIds, setEditingRowIds] = useState([]); 

    const [gameToDelete, setGameToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const canCreateGames = checkAccess('CREATE_GAMES');

    useEffect(() => {
        if (selectedLeague?.id) fetchSeasons(selectedLeague.id);
    }, [selectedLeague]);

    useEffect(() => {
        fetchArenas();
    }, []);

    useEffect(() => {
        if (!isEditMode) {
            setEditingRowIds([]);
        }
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
            setBrackets([]);
        }
    }, [selectedSeasonId, selectedDivisionId]);

    const loadGames = async () => {
        if (!selectedSeasonId || !selectedDivisionId) return;
        setIsLoading(true);

        try {
            const activeDiv = divisions.find(d => d.id === selectedDivisionId);
            const queryParams = new URLSearchParams({ division: activeDiv ? activeDiv.name : '' });

            const gamesPromise = fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/games?${queryParams}`, { 
                headers: { 'Authorization': `Bearer ${getToken()}` } 
            }).then(r => r.json());

            const bracketsPromise = fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${selectedDivisionId}/playoff`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            }).then(r => r.json());

            const [data, bracketsData] = await Promise.all([gamesPromise, bracketsPromise]);

            if (data.success) {
                setGames(data.data);
            } else {
                setToast({ title: 'Ошибка', message: data.error, type: 'error' });
            }

            if (bracketsData.success) {
                setBrackets(bracketsData.brackets || []);
            } else {
                setBrackets([]);
            }

        } catch (err) { 
            setToast({ title: 'Ошибка', message: 'Сбой загрузки расписания', type: 'error' }); 
        } finally {
            setIsLoading(false);
        }
    };

    const activeDivision = divisions.find(d => d.id === selectedDivisionId);
    const approvedTeams = activeDivision ? (activeDivision.teams || []).filter(t => t.status === 'approved') : [];

    const handleCreateGame = async () => {
        setIsCreating(true);
        try {
            const payload = { division_id: selectedDivisionId };
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/games`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            if (data.success) {
                setGames(prev => [...prev, data.data]);
                setEditingRowIds(prev => [...prev, data.data.id]);
                setToast({ title: 'Успешно', message: 'Матч добавлен в расписание', type: 'success' });
            } else {
                setToast({ title: 'Ошибка', message: data.error, type: 'error' });
            }
        } catch (err) {
            setToast({ title: 'Ошибка', message: 'Сбой создания матча', type: 'error' });
        } finally {
            setIsCreating(false);
        }
    };

    const handleUpdateGame = async (gameId, updatesObj, onlyLocal = false) => {
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

        // Если это быстрый локальный ввод (например, инпут с датой), не ждем ответа
        if (onlyLocal) {
            setGames(prev => prev.map(g => g.id === gameId ? { ...g, ...updatesObj, ...extraUpdates } : g));
            return;
        }

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/info`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payloads)
            });
            const data = await res.json();
            
            if (data.success) {
                // Если бекэнд разрешил - сохраняем и отображаем у пользователя
                setGames(prev => prev.map(g => g.id === gameId ? { ...g, ...updatesObj, ...extraUpdates } : g));
            } else {
                // Если сервер заблокировал (защита от дурака / превышение лимита матчей)
                setToast({ title: 'Действие отменено', message: data.error || 'Ошибка', type: 'error' });
                // Принудительно запрашиваем список матчей, чтобы вернуть визуальное состояние к данным из базы
                loadGames();
            }
        } catch (err) {
            setToast({ title: 'Ошибка синхронизации', message: 'Сбой сети при сохранении', type: 'error' });
        }
    };

    const handleDeleteRequest = (gameId) => {
        setGameToDelete(gameId);
    };

    const confirmDelete = async () => {
        if (!gameToDelete) return;
        setIsDeleting(true);
        
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            
            if (data.success) {
                setGames(prev => prev.filter(g => g.id !== gameToDelete));
                setEditingRowIds(prev => prev.filter(id => id !== gameToDelete));
                setToast({ title: 'Успешно', message: 'Матч удален', type: 'success' });
            } else {
                setToast({ title: 'Ошибка', message: data.error, type: 'error' });
            }
        } catch (err) {
            setToast({ title: 'Ошибка', message: 'Сбой удаления матча', type: 'error' });
        } finally {
            setIsDeleting(false);
            setGameToDelete(null);
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

            <ConfirmModal 
                isOpen={!!gameToDelete} 
                onClose={() => !isDeleting && setGameToDelete(null)} 
                onConfirm={confirmDelete} 
                isLoading={isDeleting} 
            />

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
                                {games.length > 0 ? "Включите тумблер «Завершенные», чтобы увидеть сыгранные матчи." : "В этом дивизионе пока нет матчей. Включите режим редактирования, чтобы создать матч."}
                            </div>
                        ) : (
                            <>
                                {displayedGames.map((game) => (
                                    <GameCard 
                                        key={game.id}
                                        game={game}
                                        isEditMode={isEditMode}
                                        editingRowIds={editingRowIds}
                                        setEditingRowIds={setEditingRowIds}
                                        approvedTeams={approvedTeams}
                                        arenas={arenas}
                                        gamesList={games}
                                        brackets={brackets}
                                        onUpdate={handleUpdateGame}
                                        onDelete={handleDeleteRequest}
                                        setToast={setToast}
                                        canCreateGames={canCreateGames}
                                    />
                                ))}

                                {isEditMode && (
                                    <div className="mt-4 flex justify-center">
                                        <Button 
                                            onClick={handleCreateGame} 
                                            isLoading={isCreating}
                                            disabled={isCreating}
                                            className="px-8 py-3 shadow-[0_4px_15px_rgba(255,107,0,0.2)]"
                                        >
                                            Создать матч
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