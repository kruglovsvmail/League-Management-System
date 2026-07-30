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

// Категории нарушителя. Три "представительских" варианта — это одна и та же цель staff,
// они лишь сужают список состава до нужной роли из заявки. "Иное лицо" в системе не заявлено:
// у него нет user_id, наказание ему не создаётся, решение остаётся записью с денежным штрафом.
const TARGET_OPTIONS = [
  { key: 'player', label: 'Хоккеист', targetType: 'player', targetIndex: 0, roles: null },
  { key: 'staff_manager', label: 'Руководитель команды (подписант)', targetType: 'staff', targetIndex: 1, roles: ['team_manager'] },
  { key: 'staff_admin', label: 'Администратор команды', targetType: 'staff', targetIndex: 1, roles: ['team_admin'] },
  { key: 'staff_coach', label: 'Тренер', targetType: 'staff', targetIndex: 1, roles: ['coach', 'head_coach'] },
  { key: 'other', label: 'Иное лицо', targetType: 'other', targetIndex: 2, roles: null },
  { key: 'team', label: 'Команда', targetType: 'team', targetIndex: 2, roles: null }
];

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

  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  const [hearingBasis, setHearingBasis] = useState('');
  const [targetKey, setTargetKey] = useState('player');
  const [otherPersonName, setOtherPersonName] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  const {
    setTargetTypeIndex, targetType,
    divisions, selectedDivName, setSelectedDivName, divisionId,
    teams, selectedTeamName, setSelectedTeamName, tournamentTeamId,
    filteredPlayers, filteredStaff, filteredMembers, setStaffRoleFilter,
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
      setSelectedMemberIds([]);
      setHearingBasis(''); setTargetKey('player'); setOtherPersonName(''); setStaffRoleFilter(null);
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

  const selectedTarget = TARGET_OPTIONS.find(o => o.key === targetKey) || TARGET_OPTIONS[0];
  // Реальная цель решения: три категории представителя схлопываются в одну цель staff,
  // отличаясь только тем, какие роли показываются в списке состава
  const submitTargetType = selectedTarget.targetType;

  const handleSelectTarget = (key) => {
    const option = TARGET_OPTIONS.find(o => o.key === key) || TARGET_OPTIONS[0];
    setTargetKey(key);
    setTargetTypeIndex(option.targetIndex);
    setStaffRoleFilter(option.roles);
    if (key !== 'other') setOtherPersonName('');
  };

  const handleSelectViolation = (id) => {
    setViolationTypeId(id);
    const vt = violationTypes.find(v => String(v.id) === String(id));
    if (vt) {
      setMandatoryGamesInput(Number(vt.mandatory_games_min) > 0 ? Number(vt.mandatory_games_min) : 0);
      setAdditionalGamesInput(Number(vt.additional_games_min) > 0 ? Number(vt.additional_games_min) : 0);
      setAdditionalAmountInput(vt.additional_amount_min != null ? String(Math.round(Number(vt.additional_amount_min))) : '');
      setPenaltyMinutes(vt.penalty_minutes_note || '');
      // Командный пункт наказывает команду по определению — цель переключаем сами,
      // чтобы нельзя было случайно повесить его на конкретного человека
      if (vt.is_team_penalty) handleSelectTarget('team');
    }
  };

  const selectedViolation = violationTypes.find(v => String(v.id) === String(violationTypeId));

  // Пункты справочника, кроме заголовков — только их можно выбрать как нарушение
  const violationOptions = violationTypes.map(v => (
    v.row_type === 'violation' || !v.row_type
      ? { value: v.id, prefix: v.code, label: v.title }
      : { type: v.row_type, label: v.title }
  ));

  const teamPenaltyMode = submitTargetType === 'team' && selectedViolation?.is_team_penalty
    ? (selectedViolation.split_among_members ? 'split' : 'whole')
    : null;
  const isSplitMode = teamPenaltyMode === 'split' && decisions[decisionIndex] === 'punish';

  // Ни команде, ни иному лицу матчи не назначаются — для расчёта наказания
  // обе цели ведут себя одинаково: только деньги
  const isMoneyOnly = submitTargetType === 'team' || submitTargetType === 'other';
  const penaltyTargetType = isMoneyOnly ? 'team' : submitTargetType;

  const teamGames = games.filter(g => g.home_team_id === teams.find(t => t.name === selectedTeamName)?.team_id || g.away_team_id === teams.find(t => t.name === selectedTeamName)?.team_id);

  // Для цели "команда" игровое наказание в минутах относится к конкретному игроку, а не к команде
  useEffect(() => {
    if (targetType === 'team') { setPenaltyMinutes(''); }
    if (targetType !== 'team') { setSelectedMemberIds([]); }
  }, [targetType]);

  useEffect(() => { setSelectedMemberIds([]); }, [tournamentTeamId]);

  const toggleMember = (userId) => {
    setSelectedMemberIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const toggleAllMembers = (checked) => {
    const visibleIds = filteredMembers.map(m => m.player_id);
    setSelectedMemberIds(prev => checked
      ? [...new Set([...prev, ...visibleIds])]
      : prev.filter(id => !visibleIds.includes(id)));
  };

  const totalAmount = additionalAmountInput === '' ? 0 : Number(additionalAmountInput);
  const shareHint = selectedMemberIds.length > 0 && totalAmount > 0
    ? `${selectedMemberIds.length} чел. × ${Math.round(totalAmount / selectedMemberIds.length).toLocaleString('ru-RU')} ₽`
    : 'Отметьте, между кем делится сумма';

  const penaltyInputs = { targetType: penaltyTargetType, mandatoryGamesInput, additionalGamesInput, additionalAmountInput };
  const isPenaltyValid = decisions[decisionIndex] !== 'punish' || arePenaltyFieldsValid(penaltyInputs);
  const isViolationValid = isManualViolation ? !!manualViolationTitle.trim() : !!violationTypeId;
  const isFormValid = tournamentTeamId && isViolationValid && isPenaltyValid && (
    submitTargetType === 'team' ? (!isSplitMode || selectedMemberIds.length > 0) :
    submitTargetType === 'other' ? !!otherPersonName.trim() :
    submitTargetType === 'staff' ? !!selectedTeamRoleId :
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
          target_type: submitTargetType,
          tournament_roster_id: submitTargetType === 'player' ? selectedRosterId : null,
          tournament_team_role_id: submitTargetType === 'staff' ? selectedTeamRoleId : null,
          hearing_basis: hearingBasis.trim() || null,
          other_person_name: submitTargetType === 'other' ? otherPersonName.trim() : null,
          decision: decisions[decisionIndex],
          penalty_games: computed.games,
          mandatory_games: computed.mandatoryGames,
          additional_games: computed.additionalGames,
          penalty_amount: computed.amount,
          penalty_minutes: isMoneyOnly ? null : (penaltyMinutes || null),
          penalty_logic: computed.logic,
          team_penalty_mode: teamPenaltyMode,
          member_user_ids: isSplitMode ? selectedMemberIds : []
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

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Основание для рассмотрения</span>
              <textarea
                placeholder="Например: рапорт главного судьи матча"
                rows={2}
                value={hearingBasis}
                onChange={e => setHearingBasis(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/70 border border-graphite/40 rounded-md font-medium text-graphite outline-none focus:border-orange focus:shadow-[0_0_0_3px_rgba(255,122,0,0.2)] transition-all resize-none text-[13px]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Select
                label="На кого"
                options={TARGET_OPTIONS.map(o => ({ value: o.key, label: o.label }))}
                value={targetKey}
                onChange={handleSelectTarget}
              />
              {targetKey === 'other' && (
                <div className="animate-zoom-in">
                  <Input
                    placeholder="ФИО или кто это (например: зритель, представитель клуба)"
                    value={otherPersonName}
                    onChange={e => setOtherPersonName(e.target.value)}
                  />
                </div>
              )}
            </div>

            <DisqualificationHistoryPanel showHistory={showHistory} isLoadingHistory={isLoadingHistory} personHistory={personHistory} />
          </div>

          <div className="w-full flex-1 flex flex-col p-6 overflow-hidden border-r border-graphite/10 bg-white">
            <RosterPickerPanel
              targetType={targetType}
              teamMessage={submitTargetType === 'other'
                ? 'Иное лицо не заявлено ни за одну команду: выбирать его из состава не нужно, ФИО вписывается слева. Ограничение на матчи такому решению не создаётся — только денежный штраф.'
                : teamPenaltyMode === 'whole'
                  ? 'Штраф на всю команду: ограничение получат все участники состава, кроме тренера и главного тренера — до полной оплаты суммы.'
                  : 'Решение будет вынесено на всю команду — выбирать конкретного человека не нужно.'}
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
              isMultiSelect={isSplitMode}
              filteredMembers={filteredMembers}
              selectedUserIds={selectedMemberIds}
              onToggleUser={toggleMember}
              onToggleAll={toggleAllMembers}
              shareHint={shareHint}
            />
          </div>

          <div className="w-full md:w-[480px] shrink-0 flex flex-col p-6 overflow-hidden">
            <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-1">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Тип нарушения</span>
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
                  <Select options={violationOptions} value={violationTypeId} onChange={handleSelectViolation} isSearchable wrapText />
                )}

                {teamPenaltyMode && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-status-pending/10 border border-status-pending/20 animate-zoom-in">
                    <span className="text-[11px] font-bold text-status-pending leading-snug">
                      {teamPenaltyMode === 'split'
                        ? 'Штраф команды делится поровну между отмеченными участниками — каждый освобождается, оплатив свою долю.'
                        : 'Штраф на команду целиком — ограничение для всех участников, кроме тренера и главного тренера.'}
                    </span>
                  </div>
                )}
              </div>

              {decisionIndex === 0 && (
                <div className="flex flex-col gap-4 p-4 bg-status-rejected/5 border border-status-rejected/20 rounded-md animate-zoom-in">
                  {!isManualViolation && !selectedViolation ? (
                    <p className="text-[11px] text-graphite-light leading-relaxed">Выберите тип нарушения из справочника, чтобы увидеть меры наказания.</p>
                  ) : (
                    <PenaltyConditionsCard
                      targetType={penaltyTargetType}
                      selectedViolation={selectedViolation}
                      mandatoryGamesInput={mandatoryGamesInput}
                      setMandatoryGamesInput={setMandatoryGamesInput}
                      additionalGamesInput={additionalGamesInput}
                      setAdditionalGamesInput={setAdditionalGamesInput}
                      additionalAmountInput={additionalAmountInput}
                      setAdditionalAmountInput={setAdditionalAmountInput}
                    />
                  )}

                  {!isMoneyOnly && (
                    <>
                      <div className="h-px bg-graphite/10" />
                      <Input label="Штраф (минуты)" placeholder="Например: 2+20" value={penaltyMinutes} onChange={e => setPenaltyMinutes(e.target.value)} />
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
