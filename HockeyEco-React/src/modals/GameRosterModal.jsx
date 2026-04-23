import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Table } from '../ui/Table2';
import { getImageUrl, getToken } from '../utils/helpers';
import { AccessFallback } from '../ui/AccessFallback';

const POSITION_MAP = { 'goalie': 'Вр', 'defense': 'Защ', 'forward': 'Нап' };

// Обратный маппинг из БД
const mapDbPositionToUI = (dbPos) => {
  if (dbPos === 'G') return 'goalie';
  if (dbPos === 'LD' || dbPos === 'RD') return 'defense';
  return 'forward'; // LW, C, RW
};

export function GameRosterModal({ isOpen, onClose, gameId, teamId, teamName, onSuccess, readOnly = false }) {
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && gameId && teamId) {
      loadData();
    } else {
      setAvailable([]); setSelected([]); setSearch('');
    }
  }, [isOpen, gameId, teamId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${teamId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        const allTourney = data.tournamentRoster.map(p => ({
          ...p,
          id: p.player_id
        }));

        const selectedMap = new Map(data.gameRoster.map(g => [g.player_id, g]));

        const newAvailable = [];
        const newSelected = [];

        allTourney.forEach(p => {
          if (selectedMap.has(p.id)) {
            const gData = selectedMap.get(p.id);
            newSelected.push({
              ...p,
              jersey_number: gData.jersey_number || p.jersey_number || '',
              position: mapDbPositionToUI(gData.position_in_line) || p.position,
              is_captain: gData.is_captain,
              is_assistant: gData.is_assistant,
              photo_url: gData.photo_url || p.photo_url
            });
          } else {
            newAvailable.push(p);
          }
        });

        // Сортируем только при первичной загрузке (Вратарь -> Защитник -> Нападающий)
        const posOrder = { 'goalie': 1, 'defense': 2, 'forward': 3 };
        newSelected.sort((a, b) => {
          const posA = posOrder[a.position] || 99;
          const posB = posOrder[b.position] || 99;
          return posA - posB;
        });

        setAvailable(newAvailable);
        setSelected(newSelected);
      }
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  };

  const handleAdd = (player) => {
    if (readOnly) return;
    setAvailable(prev => prev.filter(p => p.id !== player.id));
    setSelected(prev => [...prev, { ...player, is_captain: false, is_assistant: false }]);
  };

  const handleRemove = (player) => {
    if (readOnly) return;
    setSelected(prev => prev.filter(p => p.id !== player.id));
    setAvailable(prev => [...prev, player]);
  };

  const handleUpdate = (id, field, value) => {
    if (readOnly) return;
    setSelected(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleLetterClick = (id, letter) => {
    if (readOnly) return;
    setSelected(prev => {
      let updated = [...prev];
      const playerIndex = updated.findIndex(p => p.id === id);
      if (playerIndex === -1) return prev;
      
      const p = updated[playerIndex];

      if (letter === 'C') {
        if (!p.is_captain) {
          updated = updated.map(x => ({ ...x, is_captain: false })); 
          updated[playerIndex] = { ...p, is_captain: true, is_assistant: false };
        } else {
          updated[playerIndex] = { ...p, is_captain: false };
        }
      } else if (letter === 'A') {
        if (p.is_assistant) {
          updated[playerIndex] = { ...p, is_assistant: false };
        } else {
          const aCount = updated.filter(x => x.is_assistant).length;
          if (aCount >= 2) return prev; 
          updated[playerIndex] = { ...p, is_assistant: true, is_captain: false };
        }
      }
      return updated;
    });
  };

  const handleSave = async () => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/roster/${teamId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ roster: selected })
      });
      const data = await res.json();
      if (data.success) {
        if (onSuccess) onSuccess();
        onClose();
      } else alert(data.error);
    } catch (err) { alert('Ошибка сети'); }
    finally { setIsSaving(false); }
  };

  const filteredAvailable = available.filter(p => 
    `${p.last_name} ${p.first_name} ${p.middle_name || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const goalies = selected.filter(p => p.position === 'goalie');
  const defense = selected.filter(p => p.position === 'defense');
  const forwards = selected.filter(p => p.position === 'forward');

  // Проверка дубликатов номеров
  const numberCounts = {};
  selected.forEach(p => {
    const num = String(p.jersey_number || '').trim();
    if (num) {
      numberCounts[num] = (numberCounts[num] || 0) + 1;
    }
  });
  const duplicateNumbers = new Set(Object.keys(numberCounts).filter(num => numberCounts[num] > 1));
  const hasDuplicates = duplicateNumbers.size > 0;

  const selectedColumns = [
    { 
      label: 'Фото', 
      width: 'w-[80px]', 
      render: (p) => ( <img src={getImageUrl(p.photo_url || '/default/user_default.webp')} className="w-8 h-8 rounded-md object-cover bg-graphite/5 shrink-0" alt="av" /> )
    },
    { 
      label: 'Игрок', 
      render: (p) => (
        <div className="min-w-0 flex flex-col justify-center">
          <span className="text-[13px] font-bold text-graphite leading-tight block truncate">{p.last_name} {p.first_name}</span>
          {p.middle_name && <span className="text-[11px] text-graphite-light block truncate mt-[2px]">{p.middle_name}</span>}
        </div>
      )
    },
    { 
      label: 'Амплуа', 
      width: 'w-[120px]', 
      render: (p) => ( 
        <Select 
          options={['Вр', 'Защ', 'Нап']} 
          value={POSITION_MAP[p.position] || 'Вр'} 
          disabled={readOnly}
          onChange={(val) => {
            const newPos = Object.keys(POSITION_MAP).find(k => POSITION_MAP[k] === val);
            if (newPos) handleUpdate(p.id, 'position', newPos);
          }} 
          className="w-full h-8 px-2 text-[11px]" 
        /> 
      )
    },
    { 
      label: 'Номер', 
      width: 'w-[50px]', 
      render: (p) => {
        const num = String(p.jersey_number || '').trim();
        const isDuplicate = num && duplicateNumbers.has(num);
        
        return ( 
          <div className="flex justify-center w-full">
            <Input 
              value={p.jersey_number || ''} 
              onChange={(e) => handleUpdate(p.id, 'jersey_number', e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="№"
              disabled={readOnly}
              className={`w-10 h-8 text-center text-[13px] font-bold px-1 transition-colors ${
                isDuplicate && !readOnly
                  ? 'bg-status-rejected/10 border-status-rejected text-status-rejected focus:border-status-rejected' 
                  : readOnly ? 'bg-graphite/5 border-graphite/10 text-graphite/50' : 'bg-white border-graphite/20'
              }`} 
            /> 
          </div>
        );
      }
    },
    { 
      label: 'Нашивки', 
      width: 'w-[75px]', 
      render: (p) => {
        const canAddA = p.is_assistant || selected.filter(player => player.is_assistant).length < 2;
        return (
          <div className="flex gap-1.5 shrink-0 justify-center">
            <button 
              onClick={() => handleLetterClick(p.id, 'C')}
              disabled={readOnly}
              className={`w-7 h-7 rounded flex items-center justify-center text-[12px] font-black border transition-colors ${
                p.is_captain 
                  ? 'bg-orange text-white border-orange' 
                  : 'text-graphite/40 border-graphite/20 hover:bg-graphite/10'
              } ${readOnly && !p.is_captain ? 'opacity-30 cursor-not-allowed' : ''}`}
              title="Капитан"
            >C</button>
            <button 
              onClick={() => handleLetterClick(p.id, 'A')}
              disabled={readOnly || (!canAddA && !p.is_assistant)}
              className={`w-7 h-7 rounded flex items-center justify-center text-[12px] font-black border transition-colors ${
                p.is_assistant 
                  ? 'bg-status-accepted text-white border-status-accepted' 
                  : 'text-graphite/40 border-graphite/20 hover:bg-graphite/10'
              } ${(readOnly || (!canAddA && !p.is_assistant)) && !p.is_assistant ? 'opacity-30 cursor-not-allowed' : ''}`}
              title="Ассистент"
            >A</button>
          </div>
        );
      }
    },
    { 
      label: '', 
      width: 'w-[40px]', 
      align: 'right', 
      render: (p) => ( 
        <button 
          onClick={() => handleRemove(p)} 
          disabled={readOnly}
          className={`w-7 h-7 flex items-center justify-center shrink-0 transition-colors ${
            readOnly ? 'text-graphite/10 cursor-not-allowed' : 'text-graphite/30 hover:text-status-rejected'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button> 
      )
    }
  ];

  const drawerContent = (
    <div className={`fixed inset-0 z-[35] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-full max-w-[1100px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Состав на матч: {teamName || ''}</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 md:p-8 overflow-hidden flex flex-col">
          
          {readOnly && (
            <div className="mb-4">
              <AccessFallback variant="readonly" message="У вас нет прав на редактирование состава." />
            </div>
          )}

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-graphite-light font-bold">Загрузка состава...</span>
            </div>
          ) : (
            <div className={`grid grid-cols-5 gap-8 flex-1 overflow-hidden h-full ${readOnly ? 'opacity-90' : ''}`}>
              
              {/* Левая панель: доступные игроки */}
              <div className="col-span-2 flex flex-col bg-white border border-graphite/10 rounded-2xl shadow-sm overflow-hidden h-full">
                <div className="p-5 border-b border-graphite/10 bg-graphite/[0.02] shrink-0">
                  <h3 className="text-[14px] font-black uppercase text-graphite mb-4">Заявка на турнир ({available.length})</h3>
                  <Input 
                    placeholder="Поиск по ФИО..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-2 py-2 text-[12px]"
                  />
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                  {filteredAvailable.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 hover:bg-orange/5 rounded-xl group transition-colors border border-transparent hover:border-orange/10">
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <img src={getImageUrl(p.photo_url || '/default/user_default.webp')} className="w-10 h-10 rounded-lg object-cover bg-graphite/5 shrink-0" alt="av" />
                        <div className="min-w-0 flex flex-col justify-center">
                          <span className="block text-[13px] font-bold text-graphite leading-tight truncate">{p.last_name} {p.first_name}</span>
                          <span className="block text-[11px] font-medium text-graphite-light mt-[2px] truncate">
                            {[
                              p.middle_name,
                              POSITION_MAP[p.position] || 'Амплуа',
                              p.jersey_number ? `№${p.jersey_number}` : null
                            ].filter(Boolean).join(' | ')}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleAdd(p)}
                        disabled={readOnly}
                        className={`w-8 h-8 flex items-center justify-center rounded-md shrink-0 transition-colors ${
                          readOnly 
                            ? 'bg-graphite/5 text-graphite/20 cursor-not-allowed' 
                            : 'bg-graphite/5 text-graphite hover:bg-orange hover:text-white'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Правая панель: выбранный состав */}
              <div className="col-span-3 flex flex-col bg-white border-2 border-orange/30 rounded-2xl shadow-md overflow-hidden h-full">
                <div className="p-4 border-b border-graphite/10 bg-orange/5 flex justify-between items-center shrink-0">
                  <h3 className="text-[14px] font-black uppercase text-graphite">В составе на матч</h3>
                  <div className="flex gap-3 text-[11px] font-bold">
                    <span className="text-graphite bg-white px-2 py-1 rounded shadow-sm border border-graphite/10">Всего: <span className="text-orange text-[13px]">{selected.length}</span></span>
                    <span className="text-graphite bg-white px-2 py-1 rounded shadow-sm border border-graphite/10">В: {goalies.length}</span>
                    <span className="text-graphite bg-white px-2 py-1 rounded shadow-sm border border-graphite/10">П: {defense.length + forwards.length}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                  {selected.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[13px] font-bold text-graphite/40 text-center px-10">
                      Состав пуст.<br/>Выберите игроков из списка слева.
                    </div>
                  ) : (
                    <Table columns={selectedColumns} data={selected} hideHeader={true} />
                  )}
                </div>

                {!readOnly && (
                  <div className="p-5 border-t border-graphite/10 bg-gray-50 shrink-0">
                    <Button 
                      onClick={handleSave} 
                      isLoading={isSaving} 
                      disabled={hasDuplicates}
                      className={`w-full transition-all ${
                        hasDuplicates 
                          ? 'bg-graphite/20 border-graphite/20 text-graphite/50 cursor-not-allowed hover:bg-graphite/20 hover:border-graphite/20 hover:text-graphite/50' 
                          : ''
                      }`}
                    >
                      {hasDuplicates ? 'Исправьте дублирующиеся номера' : 'Утвердить заявку на матч'}
                    </Button>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}