import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { Input } from '../ui/Input';
import { Stepper } from '../ui/Stepper';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { getImageUrl, getToken } from '../utils/helpers';

const POSITION_LABELS = { goalie: 'Вратарь', defense: 'Защитник', forward: 'Нападающий' };
const STAFF_ROLE_LABELS = { head_coach: 'Главный тренер', coach: 'Тренер', team_manager: 'Менеджер команды', team_admin: 'Администратор' };
const TARGET_TYPES = ['player', 'staff', 'team'];

export function CreateSdkDecisionDrawer({ isOpen, onClose, meetingId, seasonId, violationTypes = [], onSuccess }) {
  const [decisionIndex, setDecisionIndex] = useState(0); // 0 = наказать, 1 = оправдать
  const decisions = ['punish', 'acquit'];

  const [targetTypeIndex, setTargetTypeIndex] = useState(0);

  const [divisions, setDivisions] = useState([]);
  const [selectedDivName, setSelectedDivName] = useState('');
  const [teams, setTeams] = useState([]);
  const [selectedTeamName, setSelectedTeamName] = useState('');

  const [players, setPlayers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRosterId, setSelectedRosterId] = useState(null);
  const [selectedTeamRoleId, setSelectedTeamRoleId] = useState(null);

  const [games, setGames] = useState([]);
  const [gameId, setGameId] = useState('');

  const [violationTypeId, setViolationTypeId] = useState('');
  const [isManualViolation, setIsManualViolation] = useState(false);
  const [manualViolationTitle, setManualViolationTitle] = useState('');
  const [penaltyMinutes, setPenaltyMinutes] = useState('');

  // Каталожный режим: обязательные и дополнительные условия показываются всегда (значения из
  // справочника подставляются как стартовые, но все три поля свободно редактируются). Если заполнены
  // и доп.матчи, и доп.штраф — оба фиксируются ОДНОВРЕМЕННО (penalty_logic='or') — нарушитель сам
  // гасит дисквал тем, что наступит раньше: либо отбыл матчи целиком, либо оплатил штраф.
  const [mandatoryGamesInput, setMandatoryGamesInput] = useState(0);
  const [additionalGamesInput, setAdditionalGamesInput] = useState(0);
  const [additionalAmountInput, setAdditionalAmountInput] = useState('');

  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [personHistory, setPersonHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;
  const divisionId = divisions.find(d => d.name === selectedDivName)?.id;
  const tournamentTeamId = teams.find(t => t.name === selectedTeamName)?.id;

  useEffect(() => {
    if (!isOpen) {
      setDecisionIndex(0); setTargetTypeIndex(0); setSelectedDivName(''); setSelectedTeamName('');
      setTeams([]); setPlayers([]); setStaff([]); setSearchQuery(''); setSelectedRosterId(null); setSelectedTeamRoleId(null);
      setGames([]); setGameId(''); setViolationTypeId(''); setPenaltyMinutes('');
      setIsManualViolation(false); setManualViolationTitle('');
      setMandatoryGamesInput(0); setAdditionalGamesInput(0); setAdditionalAmountInput('');
      setPersonHistory([]); setShowHistory(false);
      return;
    }
    if (seasonId) {
      fetch(`${SERVER_URL}/api/seasons/${seasonId}/divisions`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => { if (data.success) setDivisions(data.data); });
      fetch(`${SERVER_URL}/api/seasons/${seasonId}/games`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => { if (data.success) setGames(data.data); });
    }
  }, [isOpen, seasonId]);

  useEffect(() => {
    if (divisionId) {
      fetch(`${SERVER_URL}/api/divisions/${divisionId}/teams`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setTeams(data.teams);
            setSelectedTeamName(''); setPlayers([]); setStaff([]); setSelectedRosterId(null); setSelectedTeamRoleId(null); setGameId('');
          }
        });
    } else {
      setTeams([]); setSelectedTeamName(''); setPlayers([]); setStaff([]); setSelectedRosterId(null); setSelectedTeamRoleId(null);
    }
  }, [divisionId]);

  useEffect(() => {
    if (tournamentTeamId) {
      setIsLoadingPlayers(true);
      fetch(`${SERVER_URL}/api/tournament-teams/${tournamentTeamId}/roster`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setPlayers(data.data);
            setStaff(data.staff || []);
            setSelectedRosterId(null);
            setSelectedTeamRoleId(null);
          }
        })
        .finally(() => setIsLoadingPlayers(false));
    } else {
      setPlayers([]); setStaff([]); setSelectedRosterId(null); setSelectedTeamRoleId(null);
    }
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

  const formatRangeHint = (min, max, suffix = '', separator = '–') => {
    if (min == null && max == null) return null;
    const minR = Math.round(Number(min));
    const maxR = max == null ? null : Math.round(Number(max));
    if (maxR == null || minR === maxR) return `Рекомендация: ${minR}${suffix}`;
    return `Рекомендация: ${minR}${separator}${maxR}${suffix}`;
  };

  // Живые значения из полей формы (не из справочника — поля свободно редактируются комиссией).
  const liveAdditionalAmount = additionalAmountInput === '' ? 0 : Number(additionalAmountInput);
  const liveNeedsChoice = Number(additionalGamesInput) > 0 && liveAdditionalAmount > 0;

  // Итоговые penalty_games/penalty_amount/penalty_logic для решения на основе введённых значений.
  // Работает одинаково для пункта из справочника и для ручного ввода. Обязательные матчи отбываются
  // всегда. Если заполнены и доп.матчи, и доп.штраф — оба фиксируются одновременно с penalty_logic='or':
  // нарушитель сам гасит дисквал тем, что наступит раньше (отбыл матчи целиком ИЛИ оплатил штраф) —
  // комиссия здесь ничего не выбирает.
  const computePenalty = () => {
    if (targetType === 'team') {
      return { games: null, amount: additionalAmountInput === '' ? null : Number(additionalAmountInput), logic: null, mandatoryGames: null, additionalGames: null };
    }
    const mandatoryVal = Number(mandatoryGamesInput) || 0;
    const additionalGamesVal = Number(additionalGamesInput) || 0;
    const gamesTotal = mandatoryVal + additionalGamesVal;
    const amountVal = additionalAmountInput === '' ? null : Number(additionalAmountInput);
    const breakdown = { mandatoryGames: mandatoryVal > 0 ? mandatoryVal : null, additionalGames: additionalGamesVal > 0 ? additionalGamesVal : null };

    if (liveNeedsChoice) {
      return { games: gamesTotal, amount: amountVal, logic: 'or', ...breakdown };
    }
    if (amountVal > 0 && mandatoryVal > 0) {
      // Доп.деньги без альтернативы матчами, но обязательные матчи всё равно есть — оба условия обязательны.
      return { games: mandatoryVal, amount: amountVal, logic: 'and', ...breakdown };
    }
    if (amountVal > 0) {
      return { games: null, amount: amountVal, logic: null, ...breakdown };
    }
    return { games: gamesTotal > 0 ? gamesTotal : null, amount: null, logic: null, ...breakdown };
  };

  const arePenaltyFieldsValid = () => {
    if (targetType === 'team') return Number(additionalAmountInput) > 0;
    const mandatoryVal = Number(mandatoryGamesInput) || 0;
    const additionalGamesVal = Number(additionalGamesInput) || 0;
    return (mandatoryVal + additionalGamesVal) > 0 || liveAdditionalAmount > 0;
  };

  const filteredPlayers = players.filter(p => {
    const fullName = `${p.last_name || ''} ${p.first_name || ''} ${p.middle_name || ''}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const filteredStaff = staff.filter(s => {
    const fullName = `${s.last_name || ''} ${s.first_name || ''} ${s.middle_name || ''}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const teamGames = games.filter(g => g.home_team_id === teams.find(t => t.name === selectedTeamName)?.team_id || g.away_team_id === teams.find(t => t.name === selectedTeamName)?.team_id);

  const targetType = TARGET_TYPES[targetTypeIndex];

  // Для цели "команда" игровое наказание в минутах относится к конкретному игроку, а не к команде
  useEffect(() => {
    if (targetType === 'team') { setPenaltyMinutes(''); }
  }, [targetType]);

  // При выборе конкретного человека из состава подгружаем его историю дисквалификаций в этой лиге
  useEffect(() => {
    if (targetType === 'player' && selectedRosterId) {
      setShowHistory(true);
      setIsLoadingHistory(true);
      fetch(`${SERVER_URL}/api/disqualifications/history?target_type=player&tournament_roster_id=${selectedRosterId}`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => { if (data.success) setPersonHistory(data.data); })
        .finally(() => setIsLoadingHistory(false));
    } else if (targetType === 'staff' && selectedTeamRoleId) {
      setShowHistory(true);
      setIsLoadingHistory(true);
      fetch(`${SERVER_URL}/api/disqualifications/history?target_type=staff&tournament_team_role_id=${selectedTeamRoleId}`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => { if (data.success) setPersonHistory(data.data); })
        .finally(() => setIsLoadingHistory(false));
    } else {
      setShowHistory(false);
      setPersonHistory([]);
    }
  }, [targetType, selectedRosterId, selectedTeamRoleId]);

  const isPenaltyValid = decisions[decisionIndex] !== 'punish' || arePenaltyFieldsValid();
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
      const computed = decisions[decisionIndex] !== 'punish' ? { games: null, amount: null, logic: null, mandatoryGames: null, additionalGames: null } : computePenalty();
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

            {showHistory && (
              <div className="flex flex-col gap-2 animate-zoom-in">
                {isLoadingHistory ? (
                  <div className="text-center text-graphite-light text-[12px] py-3">Загрузка...</div>
                ) : personHistory.length === 0 ? (
                  <div className="text-[12px] text-graphite-light py-1 px-0.5">Ранее не наказывался</div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
                    {personHistory.map(h => (
                      <div key={h.id} className="flex flex-col gap-1 bg-graphite/[0.03] border border-graphite/10 rounded-md px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-graphite-light uppercase truncate">{h.season_name || 'Без сезона'}</span>
                          <Badge label={h.status === 'active' ? 'Дискв.' : 'Отбыл'} type={h.status === 'active' ? 'expired' : 'filled'} />
                        </div>
                        <span className="text-[12px] text-graphite leading-snug">{h.violation_code ? `${h.violation_code}. ` : ''}{h.violation_title || h.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="w-full flex-1 flex flex-col p-6 overflow-hidden border-r border-graphite/10 bg-white">
            {targetType === 'team' ? (
              <div className="flex-1 flex items-center justify-center text-center text-graphite-light text-sm px-10">
                Решение будет вынесено на всю команду — выбирать конкретного человека не нужно.
              </div>
            ) : (
              <>
                <Input placeholder={targetType === 'staff' ? 'Поиск представителя по ФИО...' : 'Поиск игрока по ФИО...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-2 mt-4">
                  {isLoadingPlayers ? (
                    <div className="text-center text-graphite-light py-10 mt-10">Загрузка состава...</div>
                  ) : !divisionId || !tournamentTeamId ? (
                    <div className="text-center text-graphite-light py-10 mt-10 text-sm">Выберите дивизион и команду, чтобы увидеть состав</div>
                  ) : targetType === 'staff' ? (
                    filteredStaff.length === 0 ? (
                      <div className="text-center text-graphite-light py-10 mt-10 text-sm">Представители не найдены</div>
                    ) : (
                      filteredStaff.map(s => (
                        <div
                          key={s.tournament_team_role_id}
                          onClick={() => setSelectedTeamRoleId(s.tournament_team_role_id)}
                          className={`flex items-center gap-4 p-3 rounded-md border cursor-pointer transition-all duration-300 ${selectedTeamRoleId === s.tournament_team_role_id ? 'border-status-rejected bg-status-rejected/5 shadow-sm' : 'border-graphite/10 hover:border-graphite/30 bg-white'}`}
                        >
                          <div className="w-[42px] h-[42px] rounded-lg bg-graphite/10 overflow-hidden shrink-0 flex items-center justify-center">
                            <img src={getImageUrl(s.team_member_photo_url || s.user_avatar_url || '/default/user_default.webp')} alt="avatar" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[14px] font-bold text-graphite leading-tight">{s.last_name} {s.first_name} {s.middle_name}</span>
                            <span className="text-[12px] text-graphite-light mt-0.5">{s.roles?.split(', ').map(r => STAFF_ROLE_LABELS[r] || r).join(', ')}</span>
                          </div>
                        </div>
                      ))
                    )
                  ) : filteredPlayers.length === 0 ? (
                    <div className="text-center text-graphite-light py-10 mt-10 text-sm">Подходящих игроков не найдено</div>
                  ) : (
                    filteredPlayers.map(p => (
                      <div
                        key={p.tournament_roster_id}
                        onClick={() => setSelectedRosterId(p.tournament_roster_id)}
                        className={`flex items-center gap-4 p-3 rounded-md border cursor-pointer transition-all duration-300 ${selectedRosterId === p.tournament_roster_id ? 'border-status-rejected bg-status-rejected/5 shadow-sm' : 'border-graphite/10 hover:border-graphite/30 bg-white'}`}
                      >
                        <div className="w-[42px] h-[42px] rounded-lg bg-graphite/10 overflow-hidden shrink-0 flex items-center justify-center">
                          <img src={getImageUrl(p.team_member_photo_url || '/default/user_default.webp')} alt="avatar" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[14px] font-bold text-graphite leading-tight">{p.last_name} {p.first_name} {p.middle_name}</span>
                          <span className="text-[12px] text-graphite-light mt-0.5">
                            {POSITION_LABELS[p.position] || 'Игрок'} • №{p.jersey_number || '-'}
                            {p.period_end && <span className="text-status-rejected"> • выбыл из состава</span>}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
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
                ) : targetType === 'team' ? (
                  <div className="flex flex-col gap-1">
                    <Input label="Штраф, ₽" type="number" value={additionalAmountInput} onChange={e => setAdditionalAmountInput(e.target.value.replace(/[^\d]/g, ''))} />
                    {formatRangeHint(selectedViolation?.additional_amount_min, selectedViolation?.additional_amount_max, ' ₽') && (
                      <span className="text-[10px] text-graphite-light px-0.5">{formatRangeHint(selectedViolation?.additional_amount_min, selectedViolation?.additional_amount_max, ' ₽')}</span>
                    )}
                    <p className="text-[10px] text-graphite/50 leading-relaxed px-0.5 mt-1">Для цели «Команда» доступен только денежный штраф.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Обязательные условия</span>
                      <div className="flex items-center justify-between gap-3 bg-white rounded-md border border-graphite/10 px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[13px] font-bold text-graphite">Матчи</span>
                          <span className="text-[10px] text-graphite-light">
                            {formatRangeHint(selectedViolation?.mandatory_games_min, selectedViolation?.mandatory_games_max, '', '...') || 'Не указано в справочнике'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Stepper initialValue={mandatoryGamesInput} min={0} max={30} onChange={setMandatoryGamesInput} />
                        </div>
                      </div>
                      
                    </div>

                    <div className="flex flex-col gap-2 pt-4 border-t border-graphite/10">
                      <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Дополнительные условия</span>

                      <div className="flex items-center justify-between gap-3 bg-white rounded-md border border-graphite/10 px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[13px] font-bold text-graphite">Доп. матчи</span>
                          <span className="text-[10px] text-graphite-light">
                            {formatRangeHint(selectedViolation?.additional_games, selectedViolation?.additional_games, '', '...') || 'Не указано в справочнике'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Stepper initialValue={additionalGamesInput} min={0} max={30} onChange={setAdditionalGamesInput} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 bg-white rounded-md border border-graphite/10 px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[13px] font-bold text-graphite">Доп. штраф</span>
                          <span className="text-[10px] text-graphite-light">
                            {formatRangeHint(selectedViolation?.additional_amount_min, selectedViolation?.additional_amount_max, ' ₽') || 'Не указано в справочнике'}
                          </span>
                        </div>
                        <div className="relative shrink-0">
                          <Input type="number" value={additionalAmountInput} onChange={e => setAdditionalAmountInput(e.target.value.replace(/[^\d]/g, ''))} className="w-[114px] pl-2.5 pr-6 py-2 text-right" />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-graphite-light pointer-events-none">₽</span>
                        </div>
                      </div>

                      {!liveNeedsChoice && liveAdditionalAmount > 0 && Number(mandatoryGamesInput) > 0 && (
                        <span className="text-[10px] text-graphite/50 px-0.5">Начисляется вместе с обязательными матчами, без выбора.</span>
                      )}
                    </div>
                  </>
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
