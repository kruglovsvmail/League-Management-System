import React, { useState, useEffect } from 'react';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getToken } from '../utils/helpers';
import { useDisqualificationTargetPicker } from '../hooks/useDisqualificationTargetPicker';
import { RosterPickerPanel } from './shared/RosterPickerPanel';
import { PenaltyConditionsCard, computePenaltyFromInputs, arePenaltyFieldsValid } from './shared/PenaltyConditionsCard';
import { DisqualificationHistoryPanel } from './shared/DisqualificationHistoryPanel';

export function CreateDisqualificationModal({ isOpen, onClose, seasonId, onSuccess }) {
  const [reason, setReason] = useState('');
  const [mandatoryGamesInput, setMandatoryGamesInput] = useState(0);
  const [additionalGamesInput, setAdditionalGamesInput] = useState(0);
  const [additionalAmountInput, setAdditionalAmountInput] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Матч нужен, чтобы наказать резервного вратаря: своей заявки у него нет, и
  // связать наказание с человеком можно только через протокол игры, где он вышел.
  // Для остальных целей поле необязательное и ни на что не влияет.
  const [games, setGames] = useState([]);
  const [gameId, setGameId] = useState('');

  const {
    targetTypeIndex, setTargetTypeIndex, targetType,
    divisions, selectedDivName, setSelectedDivName, divisionId,
    teams, selectedTeamName, setSelectedTeamName, tournamentTeamId,
    filteredPlayers, filteredStaff,
    searchQuery, setSearchQuery,
    selectedRosterId, setSelectedRosterId,
    selectedTeamRoleId, setSelectedTeamRoleId,
    reserveGoalies, selectedReservePlayerId, pickReserveGoalie, pickRosterPlayer,
    isLoadingPlayers,
    personHistory, isLoadingHistory, showHistory
  } = useDisqualificationTargetPicker({ isOpen, seasonId, gameId });

  useEffect(() => {
    if (!isOpen) {
      setReason(''); setMandatoryGamesInput(0); setAdditionalGamesInput(0); setAdditionalAmountInput('');
      setGames([]); setGameId('');
      return;
    }
    if (!seasonId) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${seasonId}/games`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      .then(res => res.json())
      .then(data => { if (data.success) setGames(data.data || data.games || []); })
      .catch(() => setGames([]));
  }, [isOpen, seasonId]);

  // Смена команды обнуляет матч: он принадлежал прежней
  useEffect(() => { setGameId(''); }, [selectedTeamName]);

  const selectedTeamId = teams.find(t => t.name === selectedTeamName)?.team_id;
  const teamGames = games.filter(g => g.home_team_id === selectedTeamId || g.away_team_id === selectedTeamId);

  const penaltyInputs = { targetType, mandatoryGamesInput, additionalGamesInput, additionalAmountInput };
  const isFormValid = reason.trim() && arePenaltyFieldsValid(penaltyInputs) && (
    targetType === 'team' ? !!tournamentTeamId :
    targetType === 'staff' ? !!selectedTeamRoleId :
    // Игрок — либо из состава команды, либо резервный вратарь выбранного матча
    (!!selectedRosterId || !!selectedReservePlayerId)
  );

  const handleSubmit = async () => {
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      const computed = computePenaltyFromInputs(penaltyInputs);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/disqualifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({
          target_type: targetType,
          tournament_roster_id: targetType === 'player' ? selectedRosterId : null,
          reserve_player_id: targetType === 'player' ? selectedReservePlayerId : null,
          reserve_game_id: targetType === 'player' && selectedReservePlayerId ? gameId : null,
          tournament_team_role_id: targetType === 'staff' ? selectedTeamRoleId : null,
          tournament_team_id: targetType === 'team' ? tournamentTeamId : null,
          reason: reason.trim(),
          penalty_games: computed.games,
          mandatory_games: computed.mandatoryGames,
          additional_games: computed.additionalGames,
          penalty_amount: computed.amount,
          penalty_logic: computed.logic,
          start_date: new Date().toISOString().split('T')[0]
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else alert(data.error || 'Ошибка при создании дисквалификации');
    } catch (e) { alert('Сетевая ошибка сервера'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-full max-w-[1400px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Назначение дисквалификации</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="w-full md:w-[380px] shrink-0 flex flex-col gap-4 border-r border-graphite/10 p-6 overflow-y-auto custom-scrollbar bg-white">
            <Select label="Дивизион" options={divisions.map(d => d.name)} value={selectedDivName} onChange={setSelectedDivName} />
            <Select label="Команда" options={teams.map(t => t.name)} value={selectedTeamName} onChange={setSelectedTeamName} />

            {/* Матч нужен только чтобы добраться до резервного вратаря: он не заявлен
                за команду и в её составе не значится */}
            <Select
              label="Матч (для резервного вратаря)"
              options={[
                { value: '', label: 'Не выбран' },
                ...teamGames.map(g => ({
                  value: g.id,
                  label: `№${g.game_number ?? g.id} от ${g.game_date ? new Date(g.game_date).toLocaleDateString('ru-RU') : '-'}`,
                })),
              ]}
              value={gameId}
              onChange={setGameId}
              disabled={!selectedTeamName}
            />

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">На кого</span>
              <SegmentButton options={['Игрок', 'Представитель', 'Команда']} defaultIndex={targetTypeIndex} onChange={setTargetTypeIndex} />
            </div>

            <DisqualificationHistoryPanel showHistory={showHistory} isLoadingHistory={isLoadingHistory} personHistory={personHistory} />
          </div>

          <div className="w-full flex-1 flex flex-col p-6 overflow-hidden border-r border-graphite/10 bg-white">
            <RosterPickerPanel
              targetType={targetType}
              teamMessage="Дисквалификация будет назначена всей команде — выбирать конкретного человека не нужно."
              divisionId={divisionId}
              tournamentTeamId={tournamentTeamId}
              isLoadingPlayers={isLoadingPlayers}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filteredPlayers={filteredPlayers}
              filteredStaff={filteredStaff}
              selectedRosterId={selectedRosterId}
              setSelectedRosterId={pickRosterPlayer}
              selectedTeamRoleId={selectedTeamRoleId}
              setSelectedTeamRoleId={setSelectedTeamRoleId}
              reserveGoalies={reserveGoalies}
              selectedReservePlayerId={selectedReservePlayerId}
              onPickReserve={pickReserveGoalie}
            />
          </div>

          <div className="w-full md:w-[480px] shrink-0 flex flex-col p-6 overflow-hidden">
            <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-1">
              <Input label="Причина / Пункт регламента" placeholder="Например: Подножка, п. 3.2" value={reason} onChange={e => setReason(e.target.value)} />

              <div className="flex flex-col gap-4 p-4 bg-status-rejected/5 border border-status-rejected/20 rounded-md animate-zoom-in">
                <PenaltyConditionsCard
                  targetType={targetType}
                  mandatoryGamesInput={mandatoryGamesInput}
                  setMandatoryGamesInput={setMandatoryGamesInput}
                  additionalGamesInput={additionalGamesInput}
                  setAdditionalGamesInput={setAdditionalGamesInput}
                  additionalAmountInput={additionalAmountInput}
                  setAdditionalAmountInput={setAdditionalAmountInput}
                />
              </div>
            </div>

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
          </div>
        </div>
      </div>
    </div>
  );
}
