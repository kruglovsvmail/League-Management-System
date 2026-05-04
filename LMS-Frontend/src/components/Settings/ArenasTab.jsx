import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { Icon } from '../../ui/Icon';
import { getToken } from '../../utils/helpers';

export function ArenasTab({ setToast }) {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  
  const canManage = checkAccess('SETTINGS_ARENAS_MANAGE');

  const [allArenas, setAllArenas] = useState([]);
  const [leagueArenas, setLeagueArenas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');

  const loadArenas = async () => {
    setIsLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${getToken()}` };
      
      const [allRes, leagueRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-arenas/all`, { headers }),
        fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-arenas`, { headers })
      ]);

      const allData = await allRes.json();
      const leagueData = await leagueRes.json();

      if (allData.success) setAllArenas(allData.arenas || []);
      if (leagueData.success) setLeagueArenas(leagueData.arenas || []);

    } catch (err) {
      console.error(err);
      setToast({ title: 'Ошибка', message: 'Не удалось загрузить списки арен', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedLeague) loadArenas();
  }, [selectedLeague]);

  const toggleArena = async (arenaId, action) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-arenas/toggle`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ arenaId, action })
      });
      
      const data = await res.json();
      
      if (data.success) {
        setToast({ 
          title: 'Успешно', 
          message: action === 'add' ? 'Арена добавлена в лигу' : 'Арена удалена из лиги', 
          type: 'success' 
        });
        loadArenas(); // Перезагружаем списки для синхронизации
      } else {
        setToast({ title: 'Ошибка', message: data.error || 'Действие не выполнено', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ title: 'Ошибка', message: 'Сбой соединения с сервером', type: 'error' });
    }
  };

  const filteredAllArenas = allArenas.filter(arena => {
    const searchLower = searchTerm.toLowerCase();
    const isInLeague = leagueArenas.some(la => la.id === arena.id);
    return !isInLeague && (
      arena.name.toLowerCase().includes(searchLower) || 
      arena.city.toLowerCase().includes(searchLower)
    );
  });

  if (isLoading) {
    return <div className="p-10 text-center text-graphite/40 font-medium">Загрузка арен...</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-8 animate-zoom-in">
      
      {/* Левая колонка: Все доступные арены */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center bg-white/40 backdrop-blur-[12px] border-[1px] border-white/40 p-4 rounded-lg shadow-sm">
          <h3 className="text-lg font-bold text-graphite">Глобальная база арен</h3>
          <div className="relative w-64">
            <input 
              type="text" 
              placeholder="Поиск по городу или названию..." 
              className="w-full bg-graphite/5 border border-graphite/10 rounded-lg px-3 py-2 text-sm text-graphite outline-none focus:border-orange transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Icon name="search" className="absolute right-3 top-[10px] w-4 h-4 text-graphite/30" />
          </div>
        </div>

        <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {filteredAllArenas.length > 0 ? (
            filteredAllArenas.map(arena => (
              <div key={arena.id} className="flex justify-between items-center bg-white/40 backdrop-blur-[12px] border-[1px] border-white/40 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-col">
                  <span className="font-bold text-graphite">{arena.name}</span>
                  <span className="text-xs text-graphite/50 font-medium">{arena.city} {arena.address ? `• ${arena.address}` : ''}</span>
                </div>
                {canManage && (
                  <button 
                    onClick={() => toggleArena(arena.id, 'add')}
                    className="p-2 bg-graphite/5 hover:bg-orange/10 text-graphite/40 hover:text-orange rounded-lg transition-colors"
                    title="Добавить в лигу"
                  >
                    <Icon name="plus" className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="text-center p-6 text-graphite/40 text-sm bg-white/20 rounded-lg border border-dashed border-graphite/20">
              По вашему запросу арен не найдено
            </div>
          )}
        </div>
      </div>

      {/* Правая колонка: Арены лиги */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center bg-white/40 backdrop-blur-[12px] border-[1px] border-white/40 p-4 rounded-lg shadow-sm h-[74px]">
          <h3 className="text-lg font-bold text-graphite">Арены нашей лиги</h3>
          <span className="text-sm font-bold text-orange bg-orange/10 px-3 py-1 rounded-full">
            {leagueArenas.length}
          </span>
        </div>

        <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {leagueArenas.length > 0 ? (
            leagueArenas.map(arena => (
              <div key={arena.id} className="flex justify-between items-center bg-white/60 backdrop-blur-[12px] border-[1px] border-orange/30 p-4 rounded-lg shadow-sm">
                <div className="flex flex-col">
                  <span className="font-bold text-graphite">{arena.name}</span>
                  <span className="text-xs text-graphite/50 font-medium">{arena.city}</span>
                </div>
                {canManage && (
                  <button 
                    onClick={() => toggleArena(arena.id, 'remove')}
                    className="p-2 bg-graphite/5 hover:bg-status-rejected/10 text-graphite/40 hover:text-status-rejected rounded-lg transition-colors"
                    title="Убрать из лиги"
                  >
                    <Icon name="delete" className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="text-center p-6 text-graphite/40 text-sm bg-white/20 rounded-lg border border-dashed border-graphite/20">
              Вы еще не добавили ни одной арены в список лиги
            </div>
          )}
        </div>
      </div>

    </div>
  );
}