import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getImageUrl, getToken } from '../utils/helpers';

const POSITION_LABELS = { goalie: 'Вратарь', defense: 'Защитник', forward: 'Нападающий' };
const STAFF_ROLE_LABELS = { head_coach: 'Главный тренер', coach: 'Тренер', team_manager: 'Менеджер команды', team_admin: 'Администратор' };
const TARGET_TYPES = ['player', 'staff', 'team'];

const PENALTY_MODES = [
  { key: 'games', title: 'Только матчи', desc: 'Снимается после пропуска нужного числа матчей' },
  { key: 'money', title: 'Только штраф', desc: 'Снимается после оплаты штрафа' },
  { key: 'or', title: 'Штраф ИЛИ матчи', desc: 'Снимается, как только выполнено любое одно из условий' },
  { key: 'and', title: 'Штраф И матчи', desc: 'Снимается только когда выполнены оба условия' }
];

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
  const [manualViolationCode, setManualViolationCode] = useState('');
  const [manualViolationTitle, setManualViolationTitle] = useState('');
  const [penaltyGames, setPenaltyGames] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [penaltyMinutes, setPenaltyMinutes] = useState('');
  const [penaltyModeKey, setPenaltyModeKey] = useState('games'); // ключ из PENALTY_MODES

  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;
  const divisionId = divisions.find(d => d.name === selectedDivName)?.id;
  const tournamentTeamId = teams.find(t => t.name === selectedTeamName)?.id;

  useEffect(() => {
    if (!isOpen) {
      setDecisionIndex(0); setTargetTypeIndex(0); setSelectedDivName(''); setSelectedTeamName('');
      setTeams([]); setPlayers([]); setStaff([]); setSearchQuery(''); setSelectedRosterId(null); setSelectedTeamRoleId(null);
      setGames([]); setGameId(''); setViolationTypeId(''); setPenaltyGames(''); setPenaltyAmount(''); setPenaltyMinutes(''); setPenaltyModeKey('games');
      setIsManualViolation(false); setManualViolationCode(''); setManualViolationTitle('');
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
      // 0 матчей — по сути "без матчей", подставлять как значение не нужно
      const hasGames = Number(vt.penalty_games_min) > 0;
      const hasMoney = Number(vt.penalty_amount_min) > 0;
      setPenaltyGames(hasGames ? vt.penalty_games_min : '');
      setPenaltyAmount(hasMoney ? vt.penalty_amount_min : '');
      setPenaltyMinutes(vt.penalty_minutes_note || '');
      // Подсказываем режим по справочнику, но не навязываем — пользователь может сменить вручную.
      // Для цели "команда" разрешён только денежный штраф — режим не переопределяем.
      if (targetType !== 'team') {
        if (hasGames && hasMoney) setPenaltyModeKey('or'); // нейтральный выбор по умолчанию
        else if (hasGames) setPenaltyModeKey('games');
        else if (hasMoney) setPenaltyModeKey('money');
      }
    }
  };

  const selectedViolation = violationTypes.find(v => String(v.id) === String(violationTypeId));

  const formatRangeHint = (min, max, suffix = '') => {
    if (min == null && max == null) return null;
    if (max == null || Number(min) === Number(max)) return `Рекомендация: ${min}${suffix}`;
    return `Рекомендация: ${min}–${max}${suffix}`;
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

  // Для цели "команда" разрешён только денежный штраф — нет смысла "пропускать матчи" командой целиком,
  // а игровое наказание в минутах относится к конкретному игроку, а не к команде
  useEffect(() => {
    if (targetType === 'team') { setPenaltyModeKey('money'); setPenaltyMinutes(''); }
  }, [targetType]);

  const penaltyMode = penaltyModeKey;
  const gamesFilled = Number(penaltyGames) > 0;
  const moneyFilled = Number(penaltyAmount) > 0;
  const isPenaltyValid = decisions[decisionIndex] !== 'punish' || (
    penaltyMode === 'games' ? gamesFilled :
    penaltyMode === 'money' ? moneyFilled :
    gamesFilled && moneyFilled // 'or' и 'and' требуют оба значения, чтобы было из чего выбирать условие снятия
  );
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
      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({
          violation_type_id: isManualViolation ? null : violationTypeId,
          violation_code_manual: isManualViolation ? (manualViolationCode.trim() || null) : null,
          violation_title_manual: isManualViolation ? manualViolationTitle.trim() : null,
          game_id: gameId || null,
          tournament_team_id: tournamentTeamId,
          target_type: targetType,
          tournament_roster_id: targetType === 'player' ? selectedRosterId : null,
          tournament_team_role_id: targetType === 'staff' ? selectedTeamRoleId : null,
          decision: decisions[decisionIndex],
          penalty_games: (penaltyMode === 'games' || penaltyMode === 'or' || penaltyMode === 'and') ? (penaltyGames === '' ? null : Number(penaltyGames)) : null,
          penalty_amount: (penaltyMode === 'money' || penaltyMode === 'or' || penaltyMode === 'and') ? (penaltyAmount === '' ? null : Number(penaltyAmount)) : null,
          penalty_minutes: targetType !== 'team' ? (penaltyMinutes || null) : null,
          penalty_logic: (penaltyMode === 'or' || penaltyMode === 'and') ? penaltyMode : null
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

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Решение</span>
              <SegmentButton options={['Наказать', 'Оправдать']} defaultIndex={decisionIndex} onChange={setDecisionIndex} />
            </div>
          </div>

          <div className="w-full md:w-[480px] shrink-0 flex flex-col gap-4 border-r border-graphite/10 p-6 overflow-y-auto custom-scrollbar bg-white">
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
                <div className="flex flex-col gap-3 animate-zoom-in">
                  <Input label="Номер пункта (опционально)" placeholder="Например: 3.13" value={manualViolationCode} onChange={e => setManualViolationCode(e.target.value)} />
                  <Input label="Описание нарушения" placeholder="Например: Неспортивное поведение" value={manualViolationTitle} onChange={e => setManualViolationTitle(e.target.value)} />
                </div>
              ) : (
                <Select options={violationTypes.map(v => ({ value: v.id, label: `${v.code}. ${v.title}` }))} value={violationTypeId} onChange={handleSelectViolation} isSearchable />
              )}
            </div>

            {decisionIndex === 0 && (
              <div className="flex flex-col gap-4 p-4 bg-status-rejected/5 border border-status-rejected/20 rounded-md animate-zoom-in">
                {targetType === 'team' ? (
                  <p className="text-[11px] text-graphite-light leading-relaxed">Для цели «Команда» доступен только денежный штраф — без счётчика пропущенных матчей.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Каким наказанием снимается</span>
                    <div className="grid grid-cols-2 gap-2">
                      {PENALTY_MODES.map((mode) => (
                        <button
                          key={mode.key}
                          type="button"
                          onClick={() => setPenaltyModeKey(mode.key)}
                          className={`text-left p-3 rounded-md border transition-all duration-200 ${penaltyModeKey === mode.key ? 'border-status-rejected bg-status-rejected/10 shadow-sm' : 'border-graphite/10 bg-white hover:border-graphite/30'}`}
                        >
                          <span className={`block text-[12px] font-bold leading-tight ${penaltyModeKey === mode.key ? 'text-status-rejected' : 'text-graphite'}`}>{mode.title}</span>
                          <span className="block text-[10px] text-graphite-light mt-1 leading-snug">{mode.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  {(penaltyMode === 'games' || penaltyMode === 'or' || penaltyMode === 'and') && (
                    <div className="flex flex-col gap-1 w-full">
                      <Input label="Матчи" type="number" value={penaltyGames} onChange={e => setPenaltyGames(e.target.value)} />
                      {selectedViolation && formatRangeHint(selectedViolation.penalty_games_min, selectedViolation.penalty_games_max) && (
                        <span className="text-[10px] text-graphite-light px-0.5">{formatRangeHint(selectedViolation.penalty_games_min, selectedViolation.penalty_games_max)}</span>
                      )}
                    </div>
                  )}
                  {(penaltyMode === 'money' || penaltyMode === 'or' || penaltyMode === 'and') && (
                    <div className="flex flex-col gap-1 w-full">
                      <Input label="Штраф, ₽" type="number" value={penaltyAmount} onChange={e => setPenaltyAmount(e.target.value)} />
                      {selectedViolation && formatRangeHint(selectedViolation.penalty_amount_min, selectedViolation.penalty_amount_max) && (
                        <span className="text-[10px] text-graphite-light px-0.5">{formatRangeHint(selectedViolation.penalty_amount_min, selectedViolation.penalty_amount_max)}</span>
                      )}
                    </div>
                  )}
                </div>

                {targetType !== 'team' && (
                  <>
                    <Input label="Штраф в матче (минуты)" placeholder="Например: 2+20" value={penaltyMinutes} onChange={e => setPenaltyMinutes(e.target.value)} />
                    <p className="text-[10px] text-graphite/50 leading-relaxed px-0.5">Это справочное игровое наказание (сколько минут получил игрок в матче), а не решение комиссии.</p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col p-6 overflow-hidden">
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
