import React, { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useAccess } from '../hooks/useAccess';
import { Header } from '../components/Header';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { Badge } from '../ui/Badge';
import { AccessFallback } from '../ui/AccessFallback';
import { getImageUrl, setExpiringStorage, getExpiringStorage, getToken } from '../utils/helpers';
import { CreateDisqualificationModal } from '../modals/CreateDisqualificationModal';
import { PlayerProfileModal } from '../modals/PlayerProfileModal';

export function DisqualificationsPage() {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();

  // Проверка прав пользователя по новой матрице
  const canView = checkAccess('DISQUALIFICATIONS_VIEW');
  const canCreate = checkAccess('DISQUALIFICATIONS_CREATE');
  const canAction = checkAccess('DISQUALIFICATIONS_STATUS_CHANGE');
  
  const isReadOnly = !canCreate && !canAction;

  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [disqualifications, setDisqualifications] = useState([]);
  const [divisionsList, setDivisionsList] = useState([]); 
  const [isLoading, setIsLoading] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  // Читаем текущую вкладку из URL (если пусто, ставим 0)
  const statusFilterIndex = parseInt(searchParams.get('status') || '0', 10);
  const typeFilterIndex = parseInt(searchParams.get('type') || '0', 10);

  // Функции для обновления URL при клике на вкладки
  const setStatusFilterIndex = (index) => {
    setSearchParams(prev => {
      prev.set('status', index);
      return prev;
    }, { replace: true });
  };

  const setTypeFilterIndex = (index) => {
    setSearchParams(prev => {
      prev.set('type', index);
      return prev;
    }, { replace: true });
  };

  const [divisionFilter, setDivisionFilter] = useState('Все дивизионы');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Чтение с таймером
  const [expandedId, setExpandedId] = useState(() => {
    const saved = getExpiringStorage('dsq_expandedId');
    return saved ? parseInt(saved, 10) : null;
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;
  
  useEffect(() => {
    if (selectedLeague?.id && canView) {
      fetch(`${SERVER_URL}/api/leagues/${selectedLeague.id}/seasons`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data.length > 0) {
            setSeasons(data.data);
            setSelectedSeasonId(data.data.find(s => s.is_active)?.id || data.data[0].id);
          } else {
            setSeasons([]); setSelectedSeasonId(null);
          }
        });
    }
  }, [selectedLeague, canView]);

  useEffect(() => {
    if (selectedSeasonId && canView) {
      fetchDisqualifications();
      fetchDivisions();
    }
  }, [selectedSeasonId, canView]);

  const fetchDisqualifications = async (isQuiet = false) => {
    if (!isQuiet) setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/seasons/${selectedSeasonId}/disqualifications`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setDisqualifications(data.data);
    } catch (err) { console.error(err); } 
    finally { if (!isQuiet) setIsLoading(false); }
  };

  const fetchDivisions = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/seasons/${selectedSeasonId}/divisions`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setDivisionsList(data.data);
    } catch (err) { console.error(err); }
  };

  const handleAction = async (e, id, action) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${SERVER_URL}/api/disqualifications/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ status: action })
      });
      const data = await res.json();
      if (data.success) fetchDisqualifications(true);
      else alert(data.error);
    } catch (err) { alert('Ошибка соединения'); }
  };

  const handlePlayerClick = (e, playerId) => {
    e.stopPropagation(); 
    setSelectedPlayerId(playerId);
    setProfileModalOpen(true);
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => {
      const next = prev === id ? null : id;
      if (next) setExpiringStorage('dsq_expandedId', next);
      else sessionStorage.removeItem('dsq_expandedId');
      return next;
    });
  };

  const statuses = ['active', 'completed', 'cancelled'];
  const types = ['all', 'games', 'time', 'manual'];
  const uniqueDivisions = ['Все дивизионы', ...new Set(disqualifications.map(d => d.division_name))];

  const filteredData = disqualifications.filter(d => {
    if (d.status !== statuses[statusFilterIndex]) return false;
    const currentType = types[typeFilterIndex];
    if (currentType !== 'all' && d.penalty_type !== currentType) return false;
    if (divisionFilter !== 'Все дивизионы' && d.division_name !== divisionFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const fullName = `${d.last_name || ''} ${d.first_name || ''}`.toLowerCase();
      if (!fullName.includes(q) && !d.team_name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (!canView) {
    return (
      <div className="flex flex-col flex-1 animate-zoom-in">
        <Header title="Дисквалификации" />
        <main className="p-10 flex flex-1 items-center justify-center">
           <AccessFallback variant="full" message="У вас нет прав для просмотра раздела дисквалификаций." />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header 
        title="Дисквалификации" 
        actions={
          <>
            {seasons.length > 0 && (
              <div className="w-32">
                <Select options={seasons.map(s => s.name)} value={seasons.find(s => s.id === selectedSeasonId)?.name || ''} onChange={(val) => {
                  const found = seasons.find(s => s.name === val);
                  if (found) setSelectedSeasonId(found.id);
                }} />
              </div>
            )}
            {canCreate && (
              <Button className="bg-status-rejected hover:brightness-90 text-white border-none transition-all" onClick={() => setIsCreateModalOpen(true)}>+ Назначить дисквал</Button>
            )}
          </>
        }
      />

      {isReadOnly && (
        <div className="px-10 pt-6">
          <AccessFallback variant="readonly" message="У вас нет прав для управления дисквалификациями. Вы находитесь в режиме просмотра." />
        </div>
      )}

      <div className="flex items-start px-10 pt-8 gap-8 relative z-10">
        
        {/* ЛЕВАЯ ПАНЕЛЬ ФИЛЬТРОВ */}
        <div className="w-[340px] shrink-0 sticky top-[128px] max-h-[calc(100vh-140px)] overflow-y-auto bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6 flex flex-col gap-6 custom-scrollbar z-20">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Статус</label>
            <SegmentButton options={['Активные', 'Отбытые', 'Отмененные']} defaultIndex={statusFilterIndex} onChange={setStatusFilterIndex} />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Тип наказания</label>
            <SegmentButton options={['Все', 'Матчи', 'Время', 'Ручной']} defaultIndex={typeFilterIndex} onChange={setTypeFilterIndex} />
          </div>
          <div className="space-y-2">
            <Select label="Дивизион" options={uniqueDivisions} value={divisionFilter} onChange={setDivisionFilter} />
          </div>
          <div className="space-y-2">
            <Input label="Поиск игрока или команды" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Введите текст..." />
          </div>
        </div>

        {/* ПРАВАЯ ЧАСТЬ СО СПИСКОМ */}
        <div className="flex-1 relative z-10 min-h-[500px]">
          {isLoading && (
            <div className="absolute inset-0 z-20 flex items-start pt-20 justify-center"><Loader /></div>
          )}
          
          <div className={`max-w-[1000px] mx-auto pb-10 transition-opacity duration-300 ${isLoading ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            {filteredData.length === 0 && !isLoading ? (
              <div className="text-center py-20 text-graphite-light font-medium">Записей не найдено</div>
            ) : (
              filteredData.map((d) => {
                const isExpanded = expandedId === d.id;
                const playerPhoto = getImageUrl(d.member_photo || '/default/user_default.webp');
                const teamLogo = getImageUrl(d.team_logo || '/default/Logo_team_default.webp');

                let penaltyText = '';
                if (d.penalty_type === 'games') penaltyText = `Осталось матчей: ${d.games_assigned - d.games_served}`;
                if (d.penalty_type === 'time') penaltyText = `До ${formatDate(d.end_date)}`;
                if (d.penalty_type === 'manual') penaltyText = 'До решения СДК';

                return (
                  <div key={d.id} className="mb-3">
                    <div className={`bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg overflow-hidden transition-all duration-100 ${isExpanded ? 'border-status-rejected/30 shadow-mg' : 'hover:border-status-rejected/50 shadow-mg'}`}>
                      
                      <div onClick={() => toggleExpand(d.id)} className="p-4 grid grid-cols-[100px_48px_1fr_48px_1fr_150px_10px] gap-4 items-center cursor-pointer select-none">
                        <div className="text-center">
                          <Badge label={d.status === 'active' ? 'Дискв.' : d.status === 'completed' ? 'Отбыл' : 'Отменен'} type={d.status === 'active' ? 'expired' : d.status === 'completed' ? 'filled' : 'empty'} />
                        </div>
                        
                        <div 
                          className="w-12 h-12 rounded-lg overflow-hidden bg-graphite/5 border shrink-0 hover:opacity-80 transition-opacity"
                          onClick={(e) => handlePlayerClick(e, d.player_id)}
                        >
                          <img src={playerPhoto} alt="Player" className="w-full h-full object-cover" onError={(e) => e.target.src = getImageUrl('/default/user_default.webp')}/>
                        </div>
                        
                        <div>
                          <span 
                            className="text-[14px] font-bold text-graphite leading-tight hover:text-orange hover:cursor-pointer transition-colors inline-block"
                            onClick={(e) => handlePlayerClick(e, d.player_id)}
                          >
                            {d.last_name} {d.first_name}
                          </span>
                          <div className="text-[12px] font-medium text-status-rejected mt-0.5">{penaltyText}</div>
                        </div>

                        <div className="w-14 h-12 rounded-lg overflow-hidden flex items-center justify-center p-1 shrink-0">
                          <img src={teamLogo} alt="Team" className="w-full h-full object-contain" onError={(e) => e.target.src = getImageUrl('/default/Logo_team_default.webp')}/>
                        </div>
                        <div>
                          <div className="text-[14px] font-bold text-graphite leading-tight">{d.team_name}</div>
                          <div className="text-[12px] font-medium text-graphite-light mt-0.5 truncate">{d.division_name}</div>
                        </div>
                        <div className="text-right text-[12px] font-bold text-graphite/50">Начало: {formatDate(d.start_date)}</div>
                        <div className={`text-graphite-light transition-transform duration-300 justify-self-end ${isExpanded ? 'rotate-180 text-orange' : ''}`}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                      </div>

                      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="overflow-hidden">
                          <div className="px-6 py-4 bg-status-rejected/5 border-t border-status-rejected/10 flex flex-col gap-4">
                            <div>
                              <div className="text-[10px] uppercase font-bold text-status-rejected/60 mb-1">Причина / Пункт регламента</div>
                              <div className="text-[13px] font-medium text-graphite leading-relaxed">{d.reason}</div>
                            </div>
                            
                            {/* Блок кнопок управления показывается только если есть права */}
                            {canAction && d.status === 'active' && (
                              <div className="flex gap-2 justify-end">
                                <Button onClick={(e) => handleAction(e, d.id, 'cancelled')} className="bg-white border-graphite/20 text-graphite hover:border-graphite">Списать</Button>
                                <Button onClick={(e) => handleAction(e, d.id, 'completed')} className="bg-status-accepted hover:bg-status-accepted/90 text-white border-none">Отбыл</Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <CreateDisqualificationModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} divisions={divisionsList} onSuccess={() => fetchDisqualifications(true)} />
      <PlayerProfileModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} playerId={selectedPlayerId} />
    </div>
  );
}