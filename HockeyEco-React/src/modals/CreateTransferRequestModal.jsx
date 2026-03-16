import React, { useState, useEffect, useMemo } from 'react';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getImageUrl, getToken } from '../utils/helpers';

const POSITION_LABELS = { 
  goalie: 'Вратарь', 
  defense: 'Защитник', 
  forward: 'Нападающий' 
};

// ДОБАВЛЕН ПРОП isAdmin
export function CreateTransferRequestModal({ isOpen, onClose, divisions = [], onSuccess, isAdmin }) {
  const [typeIndex, setTypeIndex] = useState(0); 
  const [selectedDivName, setSelectedDivName] = useState('');
  const [teams, setTeams] = useState([]);
  const [selectedTeamName, setSelectedTeamName] = useState('');

  const [players, setPlayers] = useState([]);
  const [takenNumbers, setTakenNumbers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [position, setPosition] = useState('forward');

  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestType = typeIndex === 0 ? 'add' : 'remove';
  
  // НАХОДИМ ВЫБРАННЫЙ ДИВИЗИОН ЦЕЛИКОМ, ЧТОБЫ ВЗЯТЬ ДАТЫ
  const selectedDivision = divisions?.find(d => d.name === selectedDivName);
  const divisionId = selectedDivision?.id;
  const teamId = teams.find(t => t.name === selectedTeamName)?.team_id;

  const isNumberTaken = takenNumbers.includes(Number(jerseyNumber));

  // ПРОВЕРКА: Открыто ли трансферное окно В ВЫБРАННОМ дивизионе?
  const isWindowOpen = useMemo(() => {
    if (!selectedDivision) return true; // Пока ничего не выбрано, не блокируем
    const now = new Date();
    const tS = selectedDivision.transfer_start ? new Date(selectedDivision.transfer_start) : null;
    const tE = selectedDivision.transfer_end ? new Date(selectedDivision.transfer_end) : null;
    return (tS && tE && now >= tS && now <= tE);
  }, [selectedDivision]);

  useEffect(() => {
    if (!isOpen) {
      setTypeIndex(0); setSelectedDivName(''); setSelectedTeamName('');
      setTeams([]); setPlayers([]); setTakenNumbers([]);
      setSearchQuery(''); setSelectedPlayerId(null);
      setJerseyNumber(''); setPosition('forward');
    }
  }, [isOpen]);

  useEffect(() => {
    if (divisionId) {
      fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/teams`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setTeams(data.teams);
            setSelectedTeamName(''); setPlayers([]);
            setTakenNumbers([]); setSelectedPlayerId(null);
          }
        });
    } else {
      setTeams([]); setSelectedTeamName(''); setPlayers([]);
      setTakenNumbers([]); setSelectedPlayerId(null);
    }
  }, [divisionId]);

  useEffect(() => {
    if (divisionId && teamId) {
      setIsLoadingPlayers(true);
      fetch(`${import.meta.env.VITE_API_URL}/api/transfers/available-players?divisionId=${divisionId}&teamId=${teamId}&type=${requestType}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setPlayers(data.players);
            setTakenNumbers(data.takenNumbers || []);
            setSelectedPlayerId(null);
            setJerseyNumber('');
          }
        })
        .finally(() => setIsLoadingPlayers(false));
    } else {
      setPlayers([]); setTakenNumbers([]); setSelectedPlayerId(null);
    }
  }, [divisionId, teamId, requestType]);

  const filteredPlayers = players.filter(p => {
    const fullName = `${p.last_name || ''} ${p.first_name || ''} ${p.middle_name || ''}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const handlePlayerSelect = (p) => {
    setSelectedPlayerId(p.id);
    if (typeIndex === 0 && p.position) setPosition(p.position);
  };

  const handleSubmit = async () => {
    if (!divisionId || !teamId || !selectedPlayerId) return;
    
    if (typeIndex === 0) {
      if (!jerseyNumber) return alert('Пожалуйста, укажите игровой номер');
      if (jerseyNumber < 1 || jerseyNumber > 99) return alert('Игровой номер должен быть от 1 до 99');
      if (isNumberTaken) return alert('Этот номер уже занят!');
    }
    
    setIsSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/transfers`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          divisionId, teamId, playerId: selectedPlayerId, requestType,
          jerseyNumber: typeIndex === 0 ? Number(jerseyNumber) : null,
          position: typeIndex === 0 ? position : null
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        alert(data.error || 'Ошибка при создании заявки');
      }
    } catch(e) {
      alert('Сетевая ошибка при создании заявки');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Дата не указана';
    return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-full max-w-[800px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Создание запроса</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="w-full md:w-[320px] shrink-0 flex flex-col gap-6 border-r border-graphite/10 p-6 overflow-y-auto custom-scrollbar bg-white">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Тип запроса</span>
              <SegmentButton options={['Дозаявка', 'Отзаявка']} defaultIndex={typeIndex} onChange={setTypeIndex} />
            </div>
            
            <Select label="Дивизион" options={divisions.map(d => d.name)} value={selectedDivName} onChange={setSelectedDivName} />
            
            <Select label="Команда" options={teams.map(t => t.name)} value={selectedTeamName} onChange={setSelectedTeamName} />
            
            {/* ИНФОРМАЦИОННОЕ ТАБЛО О СТАТУСЕ ОКНА */}
            {selectedDivision && !isWindowOpen && (
              <div className={`p-3 rounded-xl border text-[12px] leading-tight mt-[-10px] animate-fade-in ${isAdmin ? 'bg-orange/10 border-orange/20 text-orange' : 'bg-status-rejected/5 border-status-rejected/20 text-status-rejected'}`}>
                <span className="font-bold block mb-1">Трансферное окно закрыто</span>
                {isAdmin 
                  ? 'Вы можете создать заявку благодаря правам администратора.' 
                  : 'Создание новых запросов в данный момент недоступно.'}
              </div>
            )}

            {typeIndex === 0 && selectedPlayerId && (
              <div className="flex flex-col gap-4 p-4 bg-orange/5 border border-orange/20 rounded-xl mt-4 animate-fade-in">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-graphite-light uppercase flex justify-between">
                    Номер на джерси
                    {isNumberTaken && <span className="text-status-rejected normal-case">Уже занят!</span>}
                  </label>
                  <Input type="number" min="1" max="99" placeholder="Например: 17" value={jerseyNumber} onChange={e => setJerseyNumber(e.target.value)} className={isNumberTaken ? '!border-status-rejected !bg-status-rejected/5 !text-status-rejected' : ''} />
                  {takenNumbers.length > 0 && (
                    <div className="mt-2 animate-fade-in">
                      <div className="text-[10px] font-semibold text-graphite-light mb-1.5">Занятые номера:</div>
                      <div className="flex flex-wrap gap-1">
                        {takenNumbers.sort((a,b) => a-b).map(n => (
                          <span key={n} className="text-[10px] font-bold px-1.5 py-0.5 rounded text-graphite/60 bg-white border border-graphite/10 shadow-sm">{n}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Select options={['Вратарь', 'Защитник', 'Нападающий']} value={POSITION_LABELS[position]} onChange={(val) => { const key = Object.keys(POSITION_LABELS).find(k => POSITION_LABELS[k] === val); setPosition(key); }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <Input placeholder="Поиск игрока по ФИО..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-2 mt-4">
              {isLoadingPlayers ? (
                <div className="text-center text-graphite-light py-10 mt-10">Загрузка игроков...</div>
              ) : !divisionId || !teamId ? (
                <div className="text-center text-graphite-light py-10 mt-10 text-sm">Выберите дивизион и команду, чтобы увидеть список</div>
              ) : filteredPlayers.length === 0 ? (
                <div className="text-center text-graphite-light py-10 mt-10 text-sm">Подходящих игроков не найдено</div>
              ) : (
                filteredPlayers.map(p => (
                  <div key={p.id} onClick={() => handlePlayerSelect(p)} className={`flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-all duration-300 ${selectedPlayerId === p.id ? 'border-orange bg-orange/5 shadow-sm' : 'border-graphite/10 hover:border-graphite/30 bg-white'}`}>
                    <div className="w-[42px] h-[42px] rounded-lg bg-graphite/10 overflow-hidden shrink-0 flex items-center justify-center">
                      <img src={getImageUrl(p.member_photo || p.avatar_url || '/default/user_default.webp')} alt="avatar" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[14px] font-bold text-graphite leading-tight">{p.last_name} {p.first_name} {p.middle_name}</span>
                      <span className="text-[12px] text-graphite-light mt-0.5">{POSITION_LABELS[p.position] || 'Игрок'} • {formatDate(p.birth_date)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-graphite/10 shrink-0">
              <Button 
                onClick={handleSubmit} 
                disabled={!selectedPlayerId || isSubmitting || (typeIndex === 0 && (!jerseyNumber || !position || isNumberTaken)) || (!isWindowOpen && !isAdmin)} 
                isLoading={isSubmitting} 
                className="w-full py-3"
              >
                Создать заявку
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
