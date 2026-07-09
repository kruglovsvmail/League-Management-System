import React, { useState, useEffect } from 'react';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { DatePicker } from '../ui/DatePicker';
import { getImageUrl, getToken } from '../utils/helpers';

const POSITION_LABELS = { goalie: 'Вратарь', defense: 'Защитник', forward: 'Нападающий' };

export function CreateDisqualificationModal({ isOpen, onClose, divisions = [], onSuccess, readOnly = false }) {
  const [typeIndex, setTypeIndex] = useState(0); // 0 = матчи, 1 = время, 2 = ручной
  const penaltyTypes = ['games', 'time', 'manual'];
  
  const [selectedDivName, setSelectedDivName] = useState('');
  const [teams, setTeams] = useState([]);
  const [selectedTeamName, setSelectedTeamName] = useState('');

  const [players, setPlayers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRosterId, setSelectedRosterId] = useState(null);
  
  const [reason, setReason] = useState('');
  const [gamesAssigned, setGamesAssigned] = useState('');
  const [endDate, setEndDate] = useState(null);

  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const divisionId = divisions?.find(d => d.name === selectedDivName)?.id;
  const tournamentTeamId = teams.find(t => t.name === selectedTeamName)?.id; 

  useEffect(() => {
    if (!isOpen) {
      setTypeIndex(0); setSelectedDivName(''); setSelectedTeamName('');
      setTeams([]); setPlayers([]); setSearchQuery(''); setSelectedRosterId(null);
      setReason(''); setGamesAssigned(''); setEndDate(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (divisionId) {
      fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/teams`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setTeams(data.teams);
            setSelectedTeamName(''); setPlayers([]); setSelectedRosterId(null);
          }
        });
    } else {
      setTeams([]); setSelectedTeamName(''); setPlayers([]); setSelectedRosterId(null);
    }
  }, [divisionId]);

  useEffect(() => {
    if (tournamentTeamId) {
      setIsLoadingPlayers(true);
      fetch(`${import.meta.env.VITE_API_URL}/api/tournament-teams/${tournamentTeamId}/roster`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            const activePlayers = data.data.filter(p => !p.period_end && p.application_status === 'approved');
            setPlayers(activePlayers);
            setSelectedRosterId(null);
          }
        })
        .finally(() => setIsLoadingPlayers(false));
    } else {
      setPlayers([]); setSelectedRosterId(null);
    }
  }, [tournamentTeamId]);

  const filteredPlayers = players.filter(p => {
    const fullName = `${p.last_name || ''} ${p.first_name || ''} ${p.middle_name || ''}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const handleSubmit = async () => {
    if (!selectedRosterId || !reason.trim()) return alert('Выберите игрока и укажите причину');
    
    if (typeIndex === 0 && (!gamesAssigned || gamesAssigned < 1)) return alert('Укажите корректное количество матчей');
    if (typeIndex === 1 && !endDate) return alert('Выберите дату окончания дисквалификации');

    setIsSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/disqualifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({
          tournament_roster_id: selectedRosterId,
          reason: reason,
          penalty_type: penaltyTypes[typeIndex],
          games_assigned: typeIndex === 0 ? Number(gamesAssigned) : null,
          start_date: new Date().toISOString().split('T')[0], 
          end_date: typeIndex === 1 ? endDate : null 
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else alert(data.error || 'Ошибка при создании дисквалификации');
    } catch(e) { alert('Сетевая ошибка сервера'); } 
    finally { setIsSubmitting(false); }
  };

  const isFormValid = selectedRosterId && reason.trim() && 
    (typeIndex === 0 ? gamesAssigned > 0 : typeIndex === 1 ? !!endDate : true);

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-full max-w-[800px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Назначение дисквалификации</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="w-full md:w-[320px] shrink-0 flex flex-col gap-6 border-r border-graphite/10 p-6 overflow-y-auto custom-scrollbar bg-white">
            <Select label="Дивизион" options={divisions.map(d => d.name)} value={selectedDivName} onChange={setSelectedDivName} disabled={readOnly} />
            <Select label="Команда" options={teams.map(t => t.name)} value={selectedTeamName} onChange={setSelectedTeamName} disabled={readOnly} />
            
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Тип наказания</span>
              <SegmentButton options={['Матчи', 'Время', 'Ручной']} defaultIndex={typeIndex} onChange={setTypeIndex} disabled={readOnly} />
            </div>

            <div className="flex flex-col gap-4 p-4 bg-status-rejected/5 border border-status-rejected/20 rounded-md animate-zoom-in">
               <div className="flex flex-col gap-1">
                 <label className="text-[11px] font-bold text-status-rejected uppercase">Причина / Пункт</label>
                 <Input placeholder="Например: Подножка, п. 3.2" value={reason} onChange={e => setReason(e.target.value)} disabled={readOnly} />
               </div>
               
               {typeIndex === 0 && (
                 <div className="flex flex-col gap-1 animate-zoom-in">
                   <label className="text-[11px] font-bold text-graphite-light uppercase">Кол-во матчей</label>
                   <Input type="number" min="1" placeholder="Например: 3" value={gamesAssigned} onChange={e => setGamesAssigned(e.target.value)} disabled={readOnly} />
                 </div>
               )}

               {typeIndex === 1 && (
                 <div className="flex flex-col gap-1 animate-zoom-in mt-2">
                   <label className="text-[11px] font-bold text-graphite-light uppercase">Действует до:</label>
                   <DatePicker 
                     value={endDate} 
                     onChange={setEndDate} 
                     placeholder="Выберите дату окончания" 
                     disabled={readOnly}
                   />
                 </div>
               )}

               {typeIndex === 2 && (
                 <p className="text-[12px] text-graphite-light/70 font-medium italic mt-2">
                   Дисквал будет действовать бессрочно, пока не снять его вручную.
                 </p>
               )}
            </div>
          </div>

          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <Input placeholder="Поиск игрока по ФИО..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} disabled={readOnly} />
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-2 mt-4">
              {isLoadingPlayers ? (
                <div className="text-center text-graphite-light py-10 mt-10">Загрузка состава...</div>
              ) : !divisionId || !tournamentTeamId ? (
                <div className="text-center text-graphite-light py-10 mt-10 text-sm">Выберите дивизион и команду, чтобы увидеть состав</div>
              ) : filteredPlayers.length === 0 ? (
                <div className="text-center text-graphite-light py-10 mt-10 text-sm">Подходящих игроков не найдено</div>
              ) : (
                filteredPlayers.map(p => (
                  <div 
                    key={p.tournament_roster_id} 
                    onClick={() => { if (!readOnly) setSelectedRosterId(p.tournament_roster_id); }} 
                    className={`flex items-center gap-4 p-3 rounded-md border transition-all duration-300 ${readOnly ? 'cursor-default opacity-80' : 'cursor-pointer'} ${selectedRosterId === p.tournament_roster_id ? 'border-status-rejected bg-status-rejected/5 shadow-sm' : 'border-graphite/10 hover:border-graphite/30 bg-white'}`}
                  >
                    <div className="w-[42px] h-[42px] rounded-lg bg-graphite/10 overflow-hidden shrink-0 flex items-center justify-center">
                      <img src={getImageUrl(p.team_member_photo_url || '/default/user_default.webp')} alt="avatar" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[14px] font-bold text-graphite leading-tight">{p.last_name} {p.first_name} {p.middle_name}</span>
                      <span className="text-[12px] text-graphite-light mt-0.5">{POSITION_LABELS[p.position] || 'Игрок'} • №{p.jersey_number || '-'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!readOnly && (
              <div className="mt-4 pt-4 border-t border-graphite/10 shrink-0">
                <Button 
                  onClick={handleSubmit} 
                  disabled={!isFormValid || isSubmitting} 
                  isLoading={isSubmitting} 
                  className={
                    isFormValid && !isSubmitting 
                      ? "w-full bg-status-rejected text-white border-none hover:brightness-90 transition-all py-3" 
                      : "w-full py-3"
                  }
                >
                  Назначить дисквалификацию
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}