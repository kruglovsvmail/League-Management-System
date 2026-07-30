import { useState, useEffect } from 'react';
import { getToken } from '../utils/helpers';

const TARGET_TYPES = ['player', 'staff', 'team'];

// Общая логика выбора "на кого" (дивизион/команда/цель/состав) + история прошлых дисквалификаций
// выбранного человека в этой лиге. Используется и шторкой решения СДК, и лайт-модалкой назначения
// дисквалификации — процедура вынесения разная, но выбор нарушителя и его история одинаковы.
export function useDisqualificationTargetPicker({ isOpen, seasonId }) {
  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  const [targetTypeIndex, setTargetTypeIndex] = useState(0);

  const [divisions, setDivisions] = useState([]);
  const [selectedDivName, setSelectedDivName] = useState('');
  const [teams, setTeams] = useState([]);
  const [selectedTeamName, setSelectedTeamName] = useState('');

  const [players, setPlayers] = useState([]);
  const [staff, setStaff] = useState([]);
  // Список ролей, которыми ограничен выбор представителя (руководитель / администратор / тренер).
  // null — без ограничения: так работает лайт-модалка, где категории представителя нет.
  const [staffRoleFilter, setStaffRoleFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRosterId, setSelectedRosterId] = useState(null);
  const [selectedTeamRoleId, setSelectedTeamRoleId] = useState(null);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);

  const [personHistory, setPersonHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const divisionId = divisions.find(d => d.name === selectedDivName)?.id;
  const tournamentTeamId = teams.find(t => t.name === selectedTeamName)?.id;
  const targetType = TARGET_TYPES[targetTypeIndex];

  useEffect(() => {
    if (!isOpen) {
      setTargetTypeIndex(0); setSelectedDivName(''); setSelectedTeamName('');
      setTeams([]); setPlayers([]); setStaff([]); setSearchQuery(''); setSelectedRosterId(null); setSelectedTeamRoleId(null);
      setPersonHistory([]); setShowHistory(false);
      return;
    }
    if (seasonId) {
      fetch(`${SERVER_URL}/api/seasons/${seasonId}/divisions`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => { if (data.success) setDivisions(data.data); });
    }
  }, [isOpen, seasonId]);

  useEffect(() => {
    if (divisionId) {
      fetch(`${SERVER_URL}/api/divisions/${divisionId}/teams`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
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

  const filteredPlayers = players.filter(p => {
    const fullName = `${p.last_name || ''} ${p.first_name || ''} ${p.middle_name || ''}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const filteredStaff = staff.filter(s => {
    const fullName = `${s.last_name || ''} ${s.first_name || ''} ${s.middle_name || ''}`.toLowerCase();
    if (!fullName.includes(searchQuery.toLowerCase())) return false;
    if (!staffRoleFilter) return true;
    return (s.roles || '').split(', ').some(r => staffRoleFilter.includes(r));
  });

  // Полный состав команды одним списком (игроки + руководство, включая тренеров) — нужен
  // для командного штрафа с делением: сумма делится между отмеченными людьми.
  const allMembers = [
    ...players.map(p => ({ ...p, member_kind: 'player' })),
    ...staff.filter(s => !players.some(p => p.player_id === s.player_id)).map(s => ({ ...s, member_kind: 'staff' }))
  ];

  const filteredMembers = allMembers.filter(m => {
    const fullName = `${m.last_name || ''} ${m.first_name || ''} ${m.middle_name || ''}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  return {
    targetTypeIndex, setTargetTypeIndex, targetType,
    divisions, selectedDivName, setSelectedDivName, divisionId,
    teams, selectedTeamName, setSelectedTeamName, tournamentTeamId,
    players, staff, filteredPlayers, filteredStaff, allMembers, filteredMembers,
    staffRoleFilter, setStaffRoleFilter,
    searchQuery, setSearchQuery,
    selectedRosterId, setSelectedRosterId,
    selectedTeamRoleId, setSelectedTeamRoleId,
    isLoadingPlayers,
    personHistory, isLoadingHistory, showHistory
  };
}
