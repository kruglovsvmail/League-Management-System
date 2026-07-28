import React, { useState, useEffect } from 'react';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { Input } from '../ui/Input';
import { Stepper } from '../ui/Stepper';
import { Button } from '../ui/Button';
import { getImageUrl, getToken } from '../utils/helpers';

const POSITION_LABELS = { goalie: 'Вратарь', defense: 'Защитник', forward: 'Нападающий' };
const STAFF_ROLE_LABELS = { head_coach: 'Главный тренер', coach: 'Тренер', team_manager: 'Менеджер команды', team_admin: 'Администратор' };
const TARGET_TYPES = ['player', 'staff', 'team'];

export function CreateDisqualificationModal({ isOpen, onClose, divisions = [], onSuccess }) {
  const [targetTypeIndex, setTargetTypeIndex] = useState(0);

  const [selectedDivName, setSelectedDivName] = useState('');
  const [teams, setTeams] = useState([]);
  const [selectedTeamName, setSelectedTeamName] = useState('');

  const [players, setPlayers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRosterId, setSelectedRosterId] = useState(null);
  const [selectedTeamRoleId, setSelectedTeamRoleId] = useState(null);

  const [reason, setReason] = useState('');
  const [mandatoryGamesInput, setMandatoryGamesInput] = useState(0);
  const [additionalGamesInput, setAdditionalGamesInput] = useState(0);
  const [additionalAmountInput, setAdditionalAmountInput] = useState('');

  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const divisionId = divisions?.find(d => d.name === selectedDivName)?.id;
  const tournamentTeamId = teams.find(t => t.name === selectedTeamName)?.id;
  const targetType = TARGET_TYPES[targetTypeIndex];

  useEffect(() => {
    if (!isOpen) {
      setTargetTypeIndex(0); setSelectedDivName(''); setSelectedTeamName('');
      setTeams([]); setPlayers([]); setStaff([]); setSearchQuery(''); setSelectedRosterId(null); setSelectedTeamRoleId(null);
      setReason(''); setMandatoryGamesInput(0); setAdditionalGamesInput(0); setAdditionalAmountInput('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (divisionId) {
      fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/teams`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setTeams(data.teams);
            setSelectedTeamName(''); setPlayers([]); setStaff([]); setSelectedRosterId(null); setSelectedTeamRoleId(null);
          }
        });
    } else {
      setTeams([]); setSelectedTeamName(''); setPlayers([]); setStaff([]); setSelectedRosterId(null); setSelectedTeamRoleId(null);
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

  const filteredPlayers = players.filter(p => {
    const fullName = `${p.last_name || ''} ${p.first_name || ''} ${p.middle_name || ''}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const filteredStaff = staff.filter(s => {
    const fullName = `${s.last_name || ''} ${s.first_name || ''} ${s.middle_name || ''}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  // Живые значения из полей формы.
  const liveAdditionalAmount = additionalAmountInput === '' ? 0 : Number(additionalAmountInput);
  const liveNeedsChoice = Number(additionalGamesInput) > 0 && liveAdditionalAmount > 0;

  // Итоговые penalty_games/penalty_amount/penalty_logic. Обязательные матчи отбываются всегда.
  // Если заполнены и доп.матчи, и доп.штраф — оба фиксируются одновременно с penalty_logic='or':
  // нарушитель сам гасит дисквал тем, что наступит раньше (отбыл матчи целиком ИЛИ оплатил штраф).
  const computePenalty = () => {
    if (targetType === 'team') {
      return { games: null, amount: additionalAmountInput === '' ? null : Number(additionalAmountInput), logic: null };
    }
    const mandatoryVal = Number(mandatoryGamesInput) || 0;
    const additionalGamesVal = Number(additionalGamesInput) || 0;
    const gamesTotal = mandatoryVal + additionalGamesVal;
    const amountVal = additionalAmountInput === '' ? null : Number(additionalAmountInput);

    if (liveNeedsChoice) {
      return { games: gamesTotal, amount: amountVal, logic: 'or' };
    }
    if (amountVal > 0 && mandatoryVal > 0) {
      return { games: mandatoryVal, amount: amountVal, logic: 'and' };
    }
    if (amountVal > 0) {
      return { games: null, amount: amountVal, logic: null };
    }
    return { games: gamesTotal > 0 ? gamesTotal : null, amount: null, logic: null };
  };

  const arePenaltyFieldsValid = () => {
    if (targetType === 'team') return Number(additionalAmountInput) > 0;
    const mandatoryVal = Number(mandatoryGamesInput) || 0;
    const additionalGamesVal = Number(additionalGamesInput) || 0;
    return (mandatoryVal + additionalGamesVal) > 0 || liveAdditionalAmount > 0;
  };

  const isFormValid = reason.trim() && arePenaltyFieldsValid() && (
    targetType === 'team' ? !!tournamentTeamId :
    targetType === 'staff' ? !!selectedTeamRoleId :
    !!selectedRosterId
  );

  const handleSubmit = async () => {
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      const computed = computePenalty();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/disqualifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({
          target_type: targetType,
          tournament_roster_id: targetType === 'player' ? selectedRosterId : null,
          tournament_team_role_id: targetType === 'staff' ? selectedTeamRoleId : null,
          tournament_team_id: targetType === 'team' ? tournamentTeamId : null,
          reason: reason.trim(),
          penalty_games: computed.games,
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
      <div className={`absolute top-0 right-0 h-full w-full max-w-[900px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Назначение дисквалификации</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="w-full md:w-[420px] shrink-0 flex flex-col gap-4 border-r border-graphite/10 p-6 overflow-y-auto custom-scrollbar bg-white">
            <div className="grid grid-cols-2 gap-3">
              <Select label="Дивизион" options={divisions.map(d => d.name)} value={selectedDivName} onChange={setSelectedDivName} />
              <Select label="Команда" options={teams.map(t => t.name)} value={selectedTeamName} onChange={setSelectedTeamName} />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">На кого</span>
              <SegmentButton options={['Игрок', 'Представитель', 'Команда']} defaultIndex={targetTypeIndex} onChange={setTargetTypeIndex} />
            </div>

            <Input label="Причина / Пункт регламента" placeholder="Например: Подножка, п. 3.2" value={reason} onChange={e => setReason(e.target.value)} />

            <div className="flex flex-col gap-4 p-4 bg-status-rejected/5 border border-status-rejected/20 rounded-md animate-zoom-in">
              {targetType === 'team' ? (
                <div className="flex flex-col gap-1">
                  <Input label="Штраф, ₽" type="number" value={additionalAmountInput} onChange={e => setAdditionalAmountInput(e.target.value.replace(/[^\d]/g, ''))} />
                  <p className="text-[10px] text-graphite/50 leading-relaxed px-0.5 mt-1">Для цели «Команда» доступен только денежный штраф.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Обязательные условия</span>
                    <div className="flex items-center justify-between gap-3 bg-white rounded-md border border-graphite/10 px-4 py-3">
                      <span className="text-[13px] font-bold text-graphite">Матчи</span>
                      <Stepper initialValue={mandatoryGamesInput} min={0} max={30} onChange={setMandatoryGamesInput} />
                    </div>
                    
                  </div>

                  <div className="flex flex-col gap-2 pt-4 border-t border-graphite/10">
                    <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Дополнительные условия</span>

                    <div className="flex items-center justify-between gap-3 bg-white rounded-md border border-graphite/10 px-4 py-3">
                      <span className="text-[13px] font-bold text-graphite">Доп. матчи</span>
                      <Stepper initialValue={additionalGamesInput} min={0} max={30} onChange={setAdditionalGamesInput} />
                    </div>

                    <div className="flex items-center justify-between gap-3 bg-white rounded-md border border-graphite/10 px-4 py-3">
                      <span className="text-[13px] font-bold text-graphite">Доп. штраф</span>
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
            </div>
          </div>

          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            {targetType === 'team' ? (
              <div className="flex-1 flex items-center justify-center text-center text-graphite-light text-sm px-10">
                Дисквалификация будет назначена всей команде — выбирать конкретного человека не нужно.
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
                          <span className="text-[12px] text-graphite-light mt-0.5">{POSITION_LABELS[p.position] || 'Игрок'} • №{p.jersey_number || '-'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
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
