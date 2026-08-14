import React from 'react';
import { Input } from '../../ui/Input';
import { getImageUrl } from '../../utils/helpers';

const POSITION_LABELS = { goalie: 'Вратарь', defense: 'Защитник', forward: 'Нападающий' };
// Роли турнирной заявки. head_coach оставлен для исторических записей: в новых заявках
// главного тренера нет — он подаётся как «Тренер команды».
const STAFF_ROLE_LABELS = { team_manager: 'Руководитель команды', coach: 'Тренер команды', team_admin: 'Администратор команды', head_coach: 'Тренер команды' };

// Общая панель поиска и выбора игрока/представителя из состава команды — используется и шторкой
// решения СДК, и лайт-модалкой назначения дисквалификации.
export function RosterPickerPanel({
  targetType, teamMessage,
  divisionId, tournamentTeamId, isLoadingPlayers,
  searchQuery, setSearchQuery,
  filteredPlayers, filteredStaff,
  selectedRosterId, setSelectedRosterId,
  selectedTeamRoleId, setSelectedTeamRoleId,
  // Резервные вратари выбранного матча: в заявке команды их нет, поэтому идут
  // отдельным блоком под составом и выбираются парой «игрок + матч»
  reserveGoalies = [], selectedReservePlayerId = null, onPickReserve,
  // Режим командного штрафа с делением: множественный выбор по всему составу
  isMultiSelect = false, filteredMembers = [], selectedUserIds = [], onToggleUser, onToggleAll, shareHint,
  // Контролы вокруг строки поиска (в шторке СДК — селект "На кого" сверху и вердикт снизу).
  // Когда они переданы, панель раскладывается в две колонки: слева управление, справа состав.
  leadingControl = null, trailingControl = null
}) {
  const isSplit = !!leadingControl;

  // controls — то, что идёт над списком (поиск и всё сопутствующее). В обычном режиме
  // остаётся сверху, в режиме leadingControl уезжает в левую колонку.
  const layout = (controls, list) => (
    isSplit
      ? <div className="flex gap-5 flex-1 min-h-0">
          <div className="w-[42%] shrink-0 flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1">
            {leadingControl}
            {controls}
            {trailingControl}
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Невидимый дубль подписи селекта — выравнивает верх списка по верху поля "На кого",
                а не по его лейблу. Разметка повторяет лейбл Select, чтобы высота совпала точно. */}
            <span className="text-[11px] font-bold mb-1.5 uppercase tracking-wide invisible select-none" aria-hidden="true">.</span>
            {list}
          </div>
        </div>
      : <>{controls}{list}</>
  );

  if (targetType === 'team' && !isMultiSelect) {
    return layout(null, (
      <div className="flex-1 flex items-center justify-center text-center text-graphite-light text-sm px-10">
        {teamMessage}
      </div>
    ));
  }

  if (isMultiSelect) {
    const allChecked = filteredMembers.length > 0 && filteredMembers.every(m => selectedUserIds.includes(m.player_id));
    return layout(
      <>
        <Input placeholder="Поиск участника по ФИО..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onToggleAll?.(!allChecked)}
            disabled={filteredMembers.length === 0}
            className="text-[11px] font-bold text-orange hover:underline disabled:opacity-40 disabled:no-underline"
          >
            {allChecked ? 'Снять всех' : 'Выбрать всех'}
          </button>
          <span className="text-[11px] font-bold text-graphite-light">{shareHint}</span>
        </div>
      </>,
      (
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-2">
          {isLoadingPlayers ? (
            <div className="text-center text-graphite-light py-10 mt-10">Загрузка состава...</div>
          ) : !divisionId || !tournamentTeamId ? (
            <div className="text-center text-graphite-light py-10 mt-10 text-sm">Выберите дивизион и команду, чтобы увидеть состав</div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center text-graphite-light py-10 mt-10 text-sm">Участники не найдены</div>
          ) : (
            filteredMembers.map(m => {
              const isChecked = selectedUserIds.includes(m.player_id);
              return (
                <div
                  key={`${m.member_kind}-${m.player_id}`}
                  onClick={() => onToggleUser?.(m.player_id)}
                  className={`flex items-center gap-4 p-3 rounded-md border cursor-pointer transition-all duration-300 ${isChecked ? 'border-status-rejected bg-status-rejected/5 shadow-sm' : 'border-graphite/10 hover:border-graphite/30 bg-white'}`}
                >
                  <div className={`w-5 h-5 rounded-[5px] border-2 shrink-0 flex items-center justify-center transition-colors ${isChecked ? 'bg-status-rejected border-status-rejected' : 'border-graphite/30'}`}>
                    {isChecked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  <div className="w-[42px] h-[42px] rounded-lg bg-graphite/10 overflow-hidden shrink-0 flex items-center justify-center">
                    <img src={getImageUrl(m.team_member_photo_url || m.user_avatar_url || '/default/user_default.webp')} alt="avatar" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-graphite leading-tight">{m.last_name} {m.first_name} {m.middle_name}</span>
                    <span className="text-[12px] text-graphite-light mt-0.5">
                      {m.member_kind === 'staff'
                        ? m.roles?.split(', ').map(r => STAFF_ROLE_LABELS[r] || r).join(', ')
                        : `${POSITION_LABELS[m.position] || 'Игрок'} • №${m.jersey_number || '-'}`}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )
    );
  }

  return layout(
    <Input placeholder={targetType === 'staff' ? 'Поиск представителя по ФИО...' : 'Поиск игрока по ФИО...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />,
    (
      <div className={`flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-2 ${isSplit ? '' : 'mt-4'}`}>
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
        ) : filteredPlayers.length === 0 && reserveGoalies.length === 0 ? (
          <div className="text-center text-graphite-light py-10 mt-10 text-sm">Подходящих игроков не найдено</div>
        ) : (
          <>
            {filteredPlayers.map(p => (
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
            ))}

            {/* Резервные вратари выбранного матча — через разделитель под составом.
                Появляются только когда матч указан: без него связать наказание
                с человеком, у которого нет заявки, не с чем. */}
            {reserveGoalies.length > 0 && (
              <>
                <div className="flex items-center gap-3 pt-3 pb-1">
                  <div className="h-px flex-1 bg-graphite/15" />
                  <span className="text-[11px] font-black uppercase tracking-wide text-graphite-light shrink-0">
                    Резервные вратари матча
                  </span>
                  <div className="h-px flex-1 bg-graphite/15" />
                </div>

                {reserveGoalies.map(g => (
                  <div
                    key={`reserve-${g.player_id}`}
                    onClick={() => onPickReserve?.(g.player_id)}
                    className={`flex items-center gap-4 p-3 rounded-md border cursor-pointer transition-all duration-300 ${String(selectedReservePlayerId) === String(g.player_id) ? 'border-status-rejected bg-status-rejected/5 shadow-sm' : 'border-graphite/10 hover:border-graphite/30 bg-white'}`}
                  >
                    <div className="w-[42px] h-[42px] rounded-lg bg-graphite/10 overflow-hidden shrink-0 flex items-center justify-center">
                      <img src={getImageUrl(g.avatar_url || '/default/user_default.webp')} alt="avatar" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[14px] font-bold text-graphite leading-tight truncate">{g.last_name} {g.first_name} {g.middle_name}</span>
                      <span className="text-[12px] text-graphite-light mt-0.5 truncate">
                        Вратарь • №{g.jersey_number || '-'}
                        <span className="text-blue-600"> • резервный за {g.team_name}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    )
  );
}
