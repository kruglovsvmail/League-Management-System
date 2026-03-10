import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton'; // <-- Исправлен путь
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getImageUrl, setExpiringStorage, getExpiringStorage, getToken, formatAge } from '../utils/helpers';

const POSITION_LABELS = { 
  goalie: 'Вратарь', 
  defense: 'Защитник', 
  forward: 'Нападающий' 
};

export function CreateTransferRequestModal({ isOpen, onClose, divisions = [], onSuccess }) {
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
  const divisionId = divisions?.find(d => d.name === selectedDivName)?.id;
  const teamId = teams.find(t => t.name === selectedTeamName)?.team_id;

  const isNumberTaken = takenNumbers.includes(Number(jerseyNumber));

  // Функция для получения токена (ИЗМЕНЕНИЕ)
  

  useEffect(() => {
    if (!isOpen) {
      setTypeIndex(0); setSelectedDivName(''); setSelectedTeamName('');
      setTeams([]); setPlayers([]); setTakenNumbers([]);
      setSearchQuery(''); setSelectedPlayerId(null);
      setJerseyNumber(''); setPosition('forward');
    }
  }, [isOpen]);

  // Загрузка команд (ИЗМЕНЕНИЕ: добавлен токен)
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

  // Загрузка игроков (ИЗМЕНЕНИЕ: добавлен токен и изменен путь)
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
      // ИЗМЕНЕНИЕ: добавлен токен и изменен путь
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
    <Modal isOpen={isOpen} onClose={onClose} title="Создание запроса" size="wide">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-[280px] shrink-0 flex flex-col gap-6 md:border-r border-graphite/10 md:pr-6">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Тип запроса</span>
            <SegmentButton options={['Дозаявка', 'Отзаявка']} defaultIndex={typeIndex} onChange={setTypeIndex} />
          </div>
          <Select label="Дивизион" options={divisions.map(d => d.name)} value={selectedDivName} onChange={setSelectedDivName} />
          <Select label="Команда" options={teams.map(t => t.name)} value={selectedTeamName} onChange={setSelectedTeamName} />
          
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

        <div className="flex-1 flex flex-col gap-4">
          <Input placeholder="Поиск игрока по ФИО..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          <div className="flex-1 min-h-[550px] max-h-[550px] overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-2">
            {isLoadingPlayers ? (
              <div className="text-center text-graphite-light py-10 mt-10">Загрузка игроков...</div>
            ) : !divisionId || !teamId ? (
              <div className="text-center text-graphite-light py-10 mt-10 text-sm">Выберите дивизион и команду, чтобы увидеть список</div>
            ) : filteredPlayers.length === 0 ? (
              <div className="text-center text-graphite-light py-10 mt-10 text-sm">Подходящих игроков не найдено</div>
            ) : (
              filteredPlayers.map(p => (
                <div key={p.id} onClick={() => handlePlayerSelect(p)} className={`flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-all duration-300 ${selectedPlayerId === p.id ? 'border-orange bg-orange/5 shadow-sm' : 'border-graphite/10 hover:border-graphite/30 bg-white'}`}>
                  <div className="w-[42px] h-[42px] rounded-full bg-graphite/10 overflow-hidden shrink-0 flex items-center justify-center">
                    <img src={getImageUrl(p.photo_url || p.avatar_url || '/default/user_default.webp')} alt="avatar" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-graphite leading-tight">{p.last_name} {p.first_name} {p.middle_name}</span>
                    <span className="text-[12px] text-graphite-light mt-0.5">{POSITION_LABELS[p.position] || 'Игрок'} • {formatDate(p.birth_date)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-2 pt-4 border-t border-graphite/10 shrink-0">
            <Button onClick={handleSubmit} disabled={!selectedPlayerId || isSubmitting || (typeIndex === 0 && (!jerseyNumber || !position || isNumberTaken))} isLoading={isSubmitting} className="w-full">Создать заявку</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}