import React from 'react';
import { Input } from '../../ui/Input';
import { getImageUrl } from '../../utils/helpers';

const POSITION_LABELS = { goalie: 'Вратарь', defense: 'Защитник', forward: 'Нападающий' };
const STAFF_ROLE_LABELS = { head_coach: 'Главный тренер', coach: 'Тренер', team_manager: 'Менеджер команды', team_admin: 'Администратор' };

// Общая панель поиска и выбора игрока/представителя из состава команды — используется и шторкой
// решения СДК, и лайт-модалкой назначения дисквалификации.
export function RosterPickerPanel({
  targetType, teamMessage,
  divisionId, tournamentTeamId, isLoadingPlayers,
  searchQuery, setSearchQuery,
  filteredPlayers, filteredStaff,
  selectedRosterId, setSelectedRosterId,
  selectedTeamRoleId, setSelectedTeamRoleId
}) {
  if (targetType === 'team') {
    return (
      <div className="flex-1 flex items-center justify-center text-center text-graphite-light text-sm px-10">
        {teamMessage}
      </div>
    );
  }

  return (
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
  );
}
