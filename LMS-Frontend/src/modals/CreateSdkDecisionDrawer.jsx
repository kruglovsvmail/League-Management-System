import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getToken } from '../utils/helpers';
import { useDisqualificationTargetPicker } from '../hooks/useDisqualificationTargetPicker';
import { RosterPickerPanel } from './shared/RosterPickerPanel';
import { PenaltyConditionsCard, computePenaltyFromInputs, arePenaltyFieldsValid } from './shared/PenaltyConditionsCard';
import { DisqualificationHistoryPanel } from './shared/DisqualificationHistoryPanel';

export function CreateSdkDecisionDrawer({ isOpen, onClose, meetingId, seasonId, violationTypes = [], onSuccess }) {
  const [decisionIndex, setDecisionIndex] = useState(0); // 0 = наказать, 1 = оправдать
  const decisions = ['punish', 'acquit'];

  const [games, setGames] = useState([]);
  const [gameId, setGameId] = useState('');

  const [violationTypeId, setViolationTypeId] = useState('');
  const [isManualViolation, setIsManualViolation] = useState(false);
  const [manualViolationTitle, setManualViolationTitle] = useState('');
  const [penaltyMinutes, setPenaltyMinutes] = useState('');

  // Каталожный режим: обязательные и дополнительные условия показываются всегда (значения из
  // справочника подставляются как стартовые, но все три поля свободно редактируются).
  const [mandatoryGamesInput, setMandatoryGamesInput] = useState(0);
  const [additionalGamesInput, setAdditionalGamesInput] = useState(0);
  const [additionalAmountInput, setAdditionalAmountInput] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  const {
    targetTypeIndex, setTargetTypeIndex, targetType,
    divisions, selectedDivName, setSelectedDivName, divisionId,
    teams, selectedTeamName, setSelectedTeamName, tournamentTeamId,
    filteredPlayers, filteredStaff,
    searchQuery, setSearchQuery,
    selectedRosterId, setSelectedRosterId,
    selectedTeamRoleId, setSelectedTeamRoleId,
    isLoadingPlayers,
    personHistory, isLoadingHistory, showHistory
  } = useDisqualificationTargetPicker({ isOpen, seasonId });

  useEffect(() => {
    if (!isOpen) {
      setDecisionIndex(0);
      setGames([]); setGameId(''); setViolationTypeId(''); setPenaltyMinutes('');
      setIsManualViolation(false); setManualViolationTitle('');
      setMandatoryGamesInput(0); setAdditionalGamesInput(0); setAdditionalAmountInput('');
      return;
    }
    if (seasonId) {
      fetch(`${SERVER_URL}/api/seasons/${seasonId}/games`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => { if (data.success) setGames(data.data); });
    }
  }, [isOpen, seasonId]);

  useEffect(() => {
    setGameId('');
  }, [tournamentTeamId]);

  const handleSelectViolation = (id) => {
    setViolationTypeId(id);
    const vt = violationTypes.find(v => String(v.id) === String(id));
    if (vt) {
      setMandatoryGamesInput(Number(vt.mandatory_games_min) > 0 ? Number(vt.mandatory_games_min) : 0);
      setAdditionalGamesInput(Number(vt.additional_games) > 0 ? Number(vt.additional_games) : 0);
      setAdditionalAmountInput(vt.additional_amount_min != null ? String(Math.round(Number(vt.additional_amount_min))) : '');
      setPenaltyMinutes(vt.penalty_minutes_note || '');
    }
  };

  const selectedViolation = violationTypes.find(v => String(v.id) === String(violationTypeId));

  const teamGames = games.filter(g => g.home_team_id === teams.find(t => t.name === selectedTeamName)?.team_id || g.away_team_id === teams.find(t => t.name === selectedTeamName)?.team_id);

  // Для цели "команда" игровое наказание в минутах относится к конкретному игроку, а не к команде
  useEffect(() => {
    if (targetType === 'team') { setPenaltyMinutes(''); }
  }, [targetType]);

  const penaltyInputs = { targetType, mandatoryGamesInput, additionalGamesInput, additionalAmountInput };
  const isPenaltyValid = decisions[decisionIndex] !== 'punish' || arePenaltyFieldsValid(penaltyInputs);
  const isViolationValid = isManualViolation ? !!manualViolationTitle.trim() : !!violationTypeId;
  const isFormValid = tournamentTeamId && isViolationValid && isPenaltyValid && (
    targetType === 'team' ? true :
    targetType === 'staff' ? !!selectedTeamRoleId :
    !!selectedRosterId
  );

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setIsSubmitting(true);
    try {
      const computed = decisions[decisionIndex] !== 'punish'
        ? { games: null, amount: null, logic: null, mandatoryGames: null, additionalGames: null }
        : computePenaltyFromInputs(penaltyInputs);
      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({
          violation_type_id: isManualViolation ? null : violationTypeId,
          violation_code_manual: null,
          violation_title_manual: isManualViolation ? manualViolationTitle.trim() : null,
          game_id: gameId || null,
          tournament_team_id: tournamentTeamId,
          target_type: targetType,
          tournament_roster_id: targetType === 'player' ? selectedRosterId : null,
          tournament_team_role_id: targetType === 'staff' ? selectedTeamRoleId : null,
          decision: decisions[decisionIndex],
          penalty_games: computed.games,
          mandatory_games: computed.mandatoryGames,
          additional_games: computed.additionalGames,
          penalty_amount: computed.amount,
          penalty_minutes: targetType !== 'team' ? (penaltyMinutes || null) : null,
          penalty_logic: computed.logic
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else alert(data.error || 'Ошибка при сохранении решения');
    } catch (e) {
      alert('Сетевая ошибка сервера');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!document.body) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-full max-w-[1400px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Новое решение СДК</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="w-full md:w-[380px] shrink-0 flex flex-col gap-4 border-r border-graphite/10 p-6 overflow-y-auto custom-scrollbar bg-white">
            <Select label="Дивизион" options={divisions.map(d => d.name)} value={selectedDivName} onChange={setSelectedDivName} />
            <Select label="Команда" options={teams.map(t => t.name)} value={selectedTeamName} onChange={setSelectedTeamName} />
            <Select label="Матч (опционально)" options={[{ value: '', label: 'Не привязан' }, ...teamGames.map(g => ({ value: g.id, label: `№${g.game_number ?? g.id} от ${g.game_date ? new Date(g.game_date).toLocaleDateString('ru-RU') : '-'}` }))]} value={gameId} onChange={setGameId} />

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">На кого</span>
              <SegmentButton options={['Игрок', 'Представитель', 'Команда']} defaultIndex={targetTypeIndex} onChange={setTargetTypeIndex} />
            </div>

            <DisqualificationHistoryPanel showHistory={showHistory} isLoadingHistory={isLoadingHistory} personHistory={personHistory} />
          </div>

          <div className="w-full flex-1 flex flex-col p-6 overflow-hidden border-r border-graphite/10 bg-white">
            <RosterPickerPanel
              targetType={targetType}
              teamMessage="Решение будет вынесено на всю команду — выбирать конкретного человека не нужно."
              divisionId={divisionId}
              tournamentTeamId={tournamentTeamId}
              isLoadingPlayers={isLoadingPlayers}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filteredPlayers={filteredPlayers}
              filteredStaff={filteredStaff}
              selectedRosterId={selectedRosterId}
              setSelectedRosterId={setSelectedRosterId}
              selectedTeamRoleId={selectedTeamRoleId}
              setSelectedTeamRoleId={setSelectedTeamRoleId}
            />
          </div>

          <div className="w-full md:w-[480px] shrink-0 flex flex-col p-6 overflow-hidden">
            <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-1">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Пункт нарушения</span>
                  <button
                    type="button"
                    onClick={() => setIsManualViolation(v => !v)}
                    className="text-[11px] font-bold text-orange hover:underline"
                  >
                    {isManualViolation ? 'Выбрать из справочника' : 'Указать вручную'}
                  </button>
                </div>
                {isManualViolation ? (
                  <div className="animate-zoom-in">
                    <Input placeholder="Например: Неспортивное поведение" value={manualViolationTitle} onChange={e => setManualViolationTitle(e.target.value)} />
                  </div>
                ) : (
                  <Select options={violationTypes.map(v => ({ value: v.id, label: `${v.code}. ${v.title}` }))} value={violationTypeId} onChange={handleSelectViolation} isSearchable wrapText />
                )}
              </div>

              {decisionIndex === 0 && (
                <div className="flex flex-col gap-4 p-4 bg-status-rejected/5 border border-status-rejected/20 rounded-md animate-zoom-in">
                  {!isManualViolation && !selectedViolation ? (
                    <p className="text-[11px] text-graphite-light leading-relaxed">Выберите пункт нарушения из справочника, чтобы увидеть меры наказания.</p>
                  ) : (
                    <PenaltyConditionsCard
                      targetType={targetType}
                      selectedViolation={selectedViolation}
                      mandatoryGamesInput={mandatoryGamesInput}
                      setMandatoryGamesInput={setMandatoryGamesInput}
                      additionalGamesInput={additionalGamesInput}
                      setAdditionalGamesInput={setAdditionalGamesInput}
                      additionalAmountInput={additionalAmountInput}
                      setAdditionalAmountInput={setAdditionalAmountInput}
                    />
                  )}

                  {targetType !== 'team' && (
                    <>
                      <div className="h-px bg-graphite/10" />
                      <Input label="Штраф в матче (минуты)" placeholder="Например: 2+20" value={penaltyMinutes} onChange={e => setPenaltyMinutes(e.target.value)} />
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-4 border-t border-graphite/10 shrink-0">
              <SegmentButton options={['Наказать', 'Оправдать']} defaultIndex={decisionIndex} onChange={setDecisionIndex} />
            </div>

            <div className="mt-4 pt-4 border-t border-graphite/10 shrink-0">
              <Button
                onClick={handleSubmit}
                disabled={!isFormValid || isSubmitting}
                isLoading={isSubmitting}
                className={isFormValid && !isSubmitting ? "w-full bg-status-rejected text-white border-none hover:brightness-90 transition-all py-3" : "w-full py-3"}
              >
                Сохранить решение
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
