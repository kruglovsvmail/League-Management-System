import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { getToken } from '../utils/helpers';

export function GamePlusMinusModal({ isOpen, onClose, gameId, event, scoringTeam, concedingTeam, scoringRoster, concedingRoster, onSuccess }) {
  const [plusPlayers, setPlusPlayers] = useState([]);
  const [minusPlayers, setMinusPlayers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && event) {
      loadExistingData();
    } else {
      setPlusPlayers([]);
      setMinusPlayers([]);
    }
  }, [isOpen, event]);

  const loadExistingData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${event.id}/plus-minus`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      
      if (data.success && data.data.length > 0) {
        const plus = data.data.filter(d => d.team_id === scoringTeam.id).map(d => d.player_id);
        const minus = data.data.filter(d => d.team_id === concedingTeam.id).map(d => d.player_id);
        setPlusPlayers(plus);
        setMinusPlayers(minus);
      } else {
        const preSelectedPlus = [];
        if (event.primary_player_id) preSelectedPlus.push(event.primary_player_id);
        if (event.assist1_id) preSelectedPlus.push(event.assist1_id);
        if (event.assist2_id) preSelectedPlus.push(event.assist2_id);
        setPlusPlayers(preSelectedPlus);
        setMinusPlayers([]);
      }
    } catch (err) {
      console.error(err);
    }
    setIsLoading(false);
  };

  const handleTogglePlayer = (playerId, type) => {
    if (type === 'plus') {
      setPlusPlayers(prev => prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]);
    } else {
      setMinusPlayers(prev => prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/events/${event.id}/plus-minus`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          plus_players: plusPlayers,
          minus_players: minusPlayers,
          scoring_team_id: scoringTeam.id,
          conceding_team_id: concedingTeam.id
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      }
    } catch (err) {
      console.error(err);
    }
    setIsLoading(false);
  };

  if (!event) return null;

  // Фильтруем вратарей из списков
  const filteredScoringRoster = scoringRoster.filter(p => p.position !== 'goalie' && p.position_in_line !== 'G');
  const filteredConcedingRoster = concedingRoster.filter(p => p.position !== 'goalie' && p.position_in_line !== 'G');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Показатель полезности (+/-)" size="wide">
      
      {/* Шапка информации о голе */}
      <div className="mb-6 bg-white border border-graphite/10 rounded-xl p-4 text-center shadow-sm">
        <div className="text-sm font-bold text-graphite/50 uppercase tracking-widest mb-1">Гол на {formatTime(event.time_seconds)}</div>
        <div className="text-xl font-black text-graphite">
          {scoringTeam.name} <span className="text-graphite/40 font-medium px-2">забили в ворота</span> {concedingTeam.name}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        
        {/* ПЛЮСЫ */}
        <div className="bg-white border border-graphite/10 shadow-sm rounded-2xl p-5 flex flex-col">
          <div className="flex justify-between items-center mb-5 pb-3 border-b border-graphite/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-black text-lg">+</div>
              <h3 className="font-black text-graphite uppercase tracking-wide">Плюсы</h3>
            </div>
            <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-xs font-bold px-3 py-1 rounded-full">
              Выбрано: {plusPlayers.length}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {filteredScoringRoster.map(player => {
              const isSelected = plusPlayers.includes(player.player_id);
              const isAuthor = player.player_id === event.primary_player_id;
              const isAssist = player.player_id === event.assist1_id || player.player_id === event.assist2_id;
              
              return (
                <button
                  key={`plus-${player.player_id}`}
                  onClick={() => handleTogglePlayer(player.player_id, 'plus')}
                  className={`relative flex flex-col items-center justify-center h-[50px] rounded-lg border-2 transition-all font-bold ${
                    isSelected 
                      ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_4px_15px_rgba(16,185,129,0.4)] scale-[1.02]' 
                      : 'bg-[#F8F9FA] border-graphite/10 text-graphite hover:border-emerald-400 hover:bg-white'
                  }`}
                >
                  <span className="text-base leading-none">{player.jersey_number}</span>
                  {/* Подсказка для авторов гола в фирменном оранжевом цвете */}
                  {(isAuthor || isAssist) && !isSelected && (
                    <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-orange text-white w-4 h-4 rounded-full flex items-center justify-center shadow-md border border-white">
                      {isAuthor ? 'Г' : 'П'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* МИНУСЫ */}
        <div className="bg-white border border-graphite/10 shadow-sm rounded-2xl p-5 flex flex-col">
          <div className="flex justify-between items-center mb-5 pb-3 border-b border-graphite/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black text-lg">−</div>
              <h3 className="font-black text-graphite uppercase tracking-wide">Минусы</h3>
            </div>
            <span className="bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold px-3 py-1 rounded-full">
              Выбрано: {minusPlayers.length}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {filteredConcedingRoster.map(player => {
              const isSelected = minusPlayers.includes(player.player_id);
              return (
                <button
                  key={`minus-${player.player_id}`}
                  onClick={() => handleTogglePlayer(player.player_id, 'minus')}
                  className={`flex items-center justify-center h-[50px] rounded-lg border-2 transition-all font-bold ${
                    isSelected 
                      ? 'bg-rose-500 border-rose-500 text-white shadow-[0_4px_15px_rgba(244,63,94,0.4)] scale-[1.02]' 
                      : 'bg-[#F8F9FA] border-graphite/10 text-graphite hover:border-rose-400 hover:bg-white'
                  }`}
                >
                  <span className="text-base leading-none">{player.jersey_number}</span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Панель кнопок */}
      <div className="flex justify-end pt-5 border-t border-graphite/10">
        <button 
          onClick={handleSave} 
          disabled={isLoading}
          className={`relative flex items-center justify-center gap-2 px-8 py-2.5 rounded-md font-bold transition-all duration-200 border-none text-white ${
            isLoading 
              ? 'bg-orange/70 cursor-not-allowed shadow-none' 
              : 'bg-orange cursor-pointer hover:bg-orange-hover shadow-[0_4px_10px_rgba(255,107,0,0.2)] hover:shadow-[0_6px_15px_rgba(255,107,0,0.4)]'
          }`}
        >
          {isLoading && (
            <svg className="w-4 h-4 animate-spin text-white shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          <span>{isLoading ? 'Сохранение...' : 'Сохранить полезность'}</span>
        </button>
      </div>
    </Modal>
  );
}

const formatTime = (seconds) => {
  if (seconds === null || seconds === undefined) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};