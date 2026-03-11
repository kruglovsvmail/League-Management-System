import React, { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom'; // Добавили useSearchParams
import { useAccess } from '../hooks/useAccess';
import { Header } from '../components/Header';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { getImageUrl, setExpiringStorage, getExpiringStorage, getToken, formatAge } from '../utils/helpers';
import { CreateTransferRequestModal } from '../modals/CreateTransferRequestModal';
import { PlayerProfileModal } from '../modals/PlayerProfileModal'; 

const POSITIONS = {
  'goalie': 'Вратарь',
  'defense': 'Защитник',
  'forward': 'Нападающий'
};

export function TransfersPage() {
  const { user, selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();

  // Права доступа текущего пользователя
  const canViewTransfers = checkAccess('VIEW_TRANSFERS');
  const canCreateTransfer = checkAccess('CREATE_TRANSFER');
  const canActionTransfer = checkAccess('ACTION_TRANSFER');
  
  // === НАСТРОЙКА URL-ПАРАМЕТРОВ ===
  const [searchParams, setSearchParams] = useSearchParams();

  const statusFilterIndex = parseInt(searchParams.get('status') || '0', 10);
  const typeFilterIndex = parseInt(searchParams.get('type') || '0', 10);
  const divisionFilter = searchParams.get('division') || 'Все дивизионы';
  const searchQuery = searchParams.get('q') || '';

  const setStatusFilterIndex = (index) => {
    setSearchParams(prev => { prev.set('status', index); return prev; }, { replace: true });
  };

  const setTypeFilterIndex = (index) => {
    setSearchParams(prev => { prev.set('type', index); return prev; }, { replace: true });
  };

  const setDivisionFilter = (val) => {
    setSearchParams(prev => {
      if (val && val !== 'Все дивизионы') prev.set('division', val);
      else prev.delete('division'); // удаляем из URL, чтобы не засорять
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

  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [divisionsList, setDivisionsList] = useState([]); 
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [hidingIds, setHidingIds] = useState(new Set());
  
  const [expandedId, setExpandedId] = useState(() => {
    const saved = getExpiringStorage('transfers_expandedId');
    return saved ? parseInt(saved, 10) : null;
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;
  
  useEffect(() => {
    if (selectedLeague?.id && canViewTransfers) fetchSeasons();
  }, [selectedLeague, canViewTransfers]);

  const fetchSeasons = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/leagues/${selectedLeague.id}/seasons`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setSeasons(data.data);
        setSelectedSeasonId(data.data.find(s => s.is_active)?.id || data.data[0].id);
      } else {
        setSeasons([]); setSelectedSeasonId(null);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (selectedSeasonId && canViewTransfers) {
      fetchTransfers();
      fetchDivisions();
    }
  }, [selectedSeasonId, canViewTransfers]);

  const fetchTransfers = async (isQuiet = false) => {
    if (!isQuiet) setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/seasons/${selectedSeasonId}/transfers`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setTransfers(data.data);
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

  const handleAction = async (e, id, actionType) => {
    e.stopPropagation();
    setActionLoadingId(id);
    try {
      const res = await fetch(`${SERVER_URL}/api/transfers/${id}/action`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ action: actionType })
      });
      const data = await res.json();
      
      if (data.success) {
        setHidingIds(prev => new Set(prev).add(id));
        setTimeout(() => {
          fetchTransfers(true);
          setHidingIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          setActionLoadingId(null);
        }, 300);
      } else {
        alert(data.error || 'Ошибка при обработке заявки');
        setActionLoadingId(null);
      }
    } catch (err) { alert('Сетевая ошибка сервера'); setActionLoadingId(null); }
  };

  const handlePlayerClick = (e, playerId) => {
    e.stopPropagation(); 
    setSelectedPlayerId(playerId);
    setProfileModalOpen(true);
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => {
      const next = prev === id ? null : id;
      if (next) setExpiringStorage('transfers_expandedId', next);
      else sessionStorage.removeItem('transfers_expandedId');
      return next;
    });
  };

  const uniqueDivisions = ['Все дивизионы', ...new Set(transfers.map(t => t.division_name))];
  const statuses = ['pending', 'approved', 'rejected'];
  const types = ['all', 'add', 'remove'];

  const filteredTransfers = transfers.filter(tr => {
    if (tr.status !== statuses[statusFilterIndex]) return false;
    const currentType = types[typeFilterIndex];
    if (currentType !== 'all' && tr.request_type !== currentType) return false;
    if (divisionFilter !== 'Все дивизионы' && tr.division_name !== divisionFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const fullName = `${tr.last_name || ''} ${tr.first_name || ''} ${tr.middle_name || ''}`.toLowerCase();
      if (!fullName.includes(q) && !tr.team_name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const formatDateTime = (dateString) => {
    if (!dateString) return { date: '-', time: '' };
    const d = new Date(dateString);
    return {
      date: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const formatBirthDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const seasonOptions = seasons.map(s => s.name);
  const selectedSeasonName = seasons.find(s => s.id === selectedSeasonId)?.name || '';

  // Если нет прав на просмотр - выводим заглушку
  if (!canViewTransfers) {
    return (
      <div className="flex flex-col flex-1 animate-fade-in-down">
        <Header title="Трансферы" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <div className="text-center text-status-rejected font-medium text-lg bg-status-rejected/5 px-8 py-6 rounded-2xl border border-status-rejected/10">
            У вас нет прав для просмотра этого раздела
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header 
        title="Трансферы" 
        actions={
          <>
            {seasons.length > 0 && (
              <div className="w-48">
                <Select options={seasonOptions} value={selectedSeasonName} onChange={(val) => {
                  const found = seasons.find(s => s.name === val);
                  if (found) setSelectedSeasonId(found.id);
                }} />
              </div>
            )}
            {/* Кнопка доступна только для top_manager */}
            {canCreateTransfer && (
              <Button onClick={() => setIsCreateModalOpen(true)}>+ Добавить запрос</Button>
            )}
          </>
        }
      />

      <div className="flex items-start px-10 pt-8 gap-8 relative z-10">
        
        {/* ЛЕВАЯ ПАНЕЛЬ ФИЛЬТРОВ (Зафиксирована) */}
        <div className="w-[340px] shrink-0 sticky top-[128px] max-h-[calc(100vh-140px)] overflow-y-auto bg-white/30 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-6 flex flex-col gap-6 custom-scrollbar z-20">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Статус заявки</label>
            <SegmentButton options={['На проверке', 'Принятые', 'Отклоненные']} defaultIndex={statusFilterIndex} onChange={setStatusFilterIndex} />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Тип операции</label>
            <SegmentButton options={['Все', 'Дозаявки', 'Отзаявки']} defaultIndex={typeFilterIndex} onChange={setTypeFilterIndex} />
          </div>
          <div className="space-y-2">
            <Select label="Дивизион" options={uniqueDivisions} value={divisionFilter} onChange={setDivisionFilter} />
          </div>
          <div className="space-y-2">
            <Input label="Поиск по ФИО или команде" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Введите текст..." />
          </div>
        </div>

        {/* ПРАВАЯ ЧАСТЬ СО СПИСКОМ */}
        <div className="flex-1 relative z-10 min-h-[500px]">
          {isLoading && (
            <div className="absolute inset-0 z-20 flex items-start pt-20 justify-center">
              <Loader />
            </div>
          )}
          
          <div className={`max-w-[1000px] mx-auto pb-10 transition-opacity duration-300 ${isLoading ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            {filteredTransfers.length === 0 && !isLoading ? (
              <div className="text-center py-20 text-graphite-light font-medium">Заявок не найдено</div>
            ) : (
              filteredTransfers.map((tr) => {
                const isExpanded = expandedId === tr.id;
                const isHiding = hidingIds.has(tr.id); 
                const isAdd = tr.request_type === 'add';
                const created = formatDateTime(tr.created_at);
                const resolved = formatDateTime(tr.resolved_at);
                const playerPhoto = getImageUrl(tr.member_photo || tr.avatar_url || '/default/user_default.webp');
                const teamLogo = getImageUrl(tr.team_logo || '/default/Logo_team_default.webp');

                const now = new Date();
                const appStart = tr.application_start ? new Date(tr.application_start) : null;
                const appEnd = tr.application_end ? new Date(tr.application_end) : null;
                const trStart = tr.transfer_start ? new Date(tr.transfer_start) : null;
                const trEnd = tr.transfer_end ? new Date(tr.transfer_end) : null;
                const isWindowOpen = (appStart && appEnd && now >= appStart && now <= appEnd) || (trStart && trEnd && now >= trStart && now <= trEnd);
                
                // Проверяем, есть ли у пользователя техническая возможность менять статусы
                const canManage = isWindowOpen || user?.globalRole === 'admin';
                // И есть ли у него при этом системные права
                const isAllowedToAct = canActionTransfer && canManage;
                const canRevertAdd = isAdd ? (Number(tr.games_played) === 0 && isAllowedToAct) : true;

                return (
                  <div key={tr.id} className={`grid transition-all duration-300 ease-in-out origin-top ${isHiding ? 'grid-rows-[0fr] opacity-0 mb-0 scale-[0.98]' : 'grid-rows-[1fr] opacity-100 mb-3 scale-100'}`}>
                    <div className="overflow-hidden">
                      <div className={`bg-white/80 border rounded-xl overflow-hidden transition-all duration-100 ${isExpanded ? 'border-orange/20 shadow-mg' : 'hover:border-orange/50 shadow-mg'}`}>
                        
                        <div onClick={() => toggleExpand(tr.id)} className="p-4 grid grid-cols-[150px_48px_1fr_100px_48px_1.5fr_10px] gap-4 items-center cursor-pointer select-none">
                          <div className="text-center">
                            <div className="text-[12px] font-bold text-graphite">{created.date}</div>
                            <div className="text-[10px] font-medium text-graphite-light mt-0.5">{created.time}</div>
                          </div>
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-graphite/5 border shrink-0 hover:opacity-100 transition-opacity" onClick={(e) => handlePlayerClick(e, tr.player_id)}>
                            <img src={playerPhoto} alt="Player" className="w-full h-full object-cover" onError={(e) => e.target.src = getImageUrl('/default/user_default.webp')}/>
                          </div>
                          <div>
                            <span className="text-[14px] font-bold text-graphite leading-tight hover:text-orange hover:cursor-pointer transition-colors inline-block" onClick={(e) => handlePlayerClick(e, tr.player_id)}>
                              {tr.last_name} {tr.first_name}
                            </span>
                            <div className="text-[12px] font-medium text-graphite-light mt-0.5">{tr.middle_name || ' '}</div>
                          </div>
                          <div className="flex justify-center">
                            {isAdd ? <svg className="w-8 h-8 text-status-accepted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg> : <svg className="w-8 h-8 text-status-rejected" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>}
                          </div>
                          <div className="w-14 h-12 rounded-lg overflow-hidden flex items-center justify-center p-1 shrink-0">
                            <img src={teamLogo} alt="Team" className="w-full h-full object-contain" onError={(e) => e.target.src = getImageUrl('/default/Logo_team_default.webp')}/>
                          </div>
                          <div>
                            <div className="text-[14px] font-bold text-graphite leading-tight">{tr.team_name}</div>
                            <div className="text-[12px] font-medium text-graphite-light mt-0.5 truncate pr-2">{tr.division_name}</div>
                          </div>
                          <div className={`text-graphite-light transition-transform duration-300 justify-self-end ${isExpanded ? 'rotate-180 text-orange' : ''}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </div>
                        </div>

                        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                          <div className="overflow-hidden">
                            <div className="px-10 py-4 bg-graphite/5 border-t border-graphite/5 flex items-center gap-12">
                              <div className="text-center min-w-[100px]">
                                {tr.resolved_at ? (
                                  <><div className="text-[12px] font-bold text-graphite">{resolved.date}</div><div className="text-[10px] font-medium text-graphite-light mt-0.5">{resolved.time}</div></>
                                ) : <div className="text-[11px] font-semibold text-graphite-light italic leading-tight"><br/></div>}
                              </div>
                              <div><div className="text-[9px] uppercase font-bold text-graphite/30 mb-1">Дата рождения</div><div className="text-[13px] font-medium text-graphite">{formatBirthDate(tr.birth_date)}</div></div>
                              <div><div className="text-[9px] uppercase font-bold text-graphite/30 mb-1">Амплуа</div><div className="text-[13px] font-medium text-graphite">{POSITIONS[tr.position] || tr.position || '-'}</div></div>
                              <div><div className="text-[9px] uppercase font-bold text-graphite/30 mb-1">Номер</div><div className="text-[13px] font-bold text-graphite">{tr.jersey_number ? `#${tr.jersey_number}` : '-'}</div></div>

                              {/* Блок кнопок управления отображается только если есть права */}
                              {isAllowedToAct && (
                                <div className="ml-auto flex gap-2">
                                  {actionLoadingId === tr.id ? (
                                    <div className="h-10 flex items-center justify-center px-4"><svg className="animate-spin h-5 w-5 text-orange" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
                                  ) : tr.status === 'pending' ? (
                                    <>
                                      <button onClick={(e) => handleAction(e, tr.id, 'reject')} className="w-10 h-10 flex items-center justify-center rounded-lg bg-status-rejected/10 text-status-rejected hover:bg-status-rejected hover:text-white transition-colors"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                                      <button onClick={(e) => handleAction(e, tr.id, 'accept')} className="w-10 h-10 flex items-center justify-center rounded-lg bg-status-accepted/10 text-status-accepted hover:bg-status-accepted hover:text-white transition-colors shadow-sm"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
                                    </>
                                  ) : canRevertAdd ? (
                                    <button onClick={(e) => handleAction(e, tr.id, 'revert')} className="w-10 h-10 flex items-center justify-center rounded-lg bg-white border border-graphite/20 text-graphite hover:border-orange hover:transition-colors shadow-sm"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg></button>
                                  ) : (
                                    <div className="text-[11px] font-semibold text-status-rejected max-w-[120px] text-right leading-tight">Возврат невозможен (сыграны матчи)</div>
                                  )}
                                </div>
                              )}
                            </div>
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

      <CreateTransferRequestModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onSuccess={() => fetchTransfers(true)} divisions={divisionsList} />
      <PlayerProfileModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} playerId={selectedPlayerId} />
    </div>
  );
}