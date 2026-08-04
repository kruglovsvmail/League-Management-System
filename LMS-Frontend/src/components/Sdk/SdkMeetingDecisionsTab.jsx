import React, { useState, useEffect } from 'react';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { CreateSdkDecisionDrawer } from '../../modals/CreateSdkDecisionDrawer';
import { getImageUrl, getToken } from '../../utils/helpers';

const STATUS_PILL = {
  active: 'bg-status-rejected/10 text-status-rejected border border-status-rejected/20',
  completed: 'bg-status-accepted/10 text-status-accepted border border-status-accepted/20',
  cancelled: 'bg-graphite/10 text-graphite/50 border border-graphite/10'
};
const STATUS_LABEL = { active: 'Действует', completed: 'Отбыто', cancelled: 'Отменено' };

// Роли турнирной заявки. head_coach оставлен для исторических записей: в новых заявках
// главного тренера нет — он подаётся как «Тренер команды».
const STAFF_ROLE_LABELS = { team_manager: 'Руководитель команды', coach: 'Тренер команды', team_admin: 'Администратор команды', head_coach: 'Тренер команды' };

const Pill = ({ children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap ${className}`}>{children}</span>
);

// Основание рассмотрения человекочитаемо: у рапорта и протеста уточнение лежит
// в отдельных полях, у "иного" — свободным текстом
const basisText = (d) => {
  if (d.hearing_basis_type === 'referee_report') {
    return `Рапорт главного судьи${d.hearing_basis_referee_name ? ` — ${d.hearing_basis_referee_name}` : ''}`;
  }
  if (d.hearing_basis_type === 'team_protest') {
    return `Протест команды${d.hearing_basis_team_name ? ` — ${d.hearing_basis_team_name}` : ''}`;
  }
  return d.hearing_basis || null;
};

// Склонение "матч" по числу: 1 матч, 2-4 матча, 5+/11-14 матчей
const pluralizeMatches = (n) => {
  const num = Math.abs(n);
  const mod10 = num % 10;
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'матчей';
  if (mod10 === 1) return 'матч';
  if (mod10 >= 2 && mod10 <= 4) return 'матча';
  return 'матчей';
};

// Кнопка "+ Новое решение" живёт в шапке страницы, поэтому состоянием шторки владеет она
export function SdkMeetingDecisionsTab({ meetingId, seasonId, canManage, setToast, isDrawerOpen, setIsDrawerOpen }) {
  const [decisions, setDecisions] = useState([]);
  const [violationTypes, setViolationTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [decisionToDelete, setDecisionToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  const fetchDecisions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}/decisions`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setDecisions(data.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDecisions();
    if (seasonId) {
      fetch(`${SERVER_URL}/api/seasons/${seasonId}/sdk/violation-types`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => { if (data.success) setViolationTypes(data.data); });
    }
  }, [meetingId, seasonId]);

  const handleTogglePaid = async (decision) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meeting-decisions/${decision.id}/toggle-paid`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) fetchDecisions();
      else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой сохранения', type: 'error' });
    }
  };

  // В режиме "штраф делится" оплата отмечается по каждому участнику отдельно —
  // ограничение снимается персонально, как только человек закрыл свою долю
  const handleToggleMemberPaid = async (member) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/decision-members/${member.id}/toggle-paid`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) fetchDecisions();
      else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой сохранения', type: 'error' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!decisionToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meeting-decisions/${decisionToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setDecisionToDelete(null);
        fetchDecisions();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg p-6 shadow-sm w-full min-h-[300px]">
      {decisions.length === 0 ? (
        <div className="text-center py-12 text-graphite-light font-medium">Решений пока нет</div>
      ) : (
        <div className="flex flex-col gap-3">
          {decisions.map(d => {
            const isTeamTarget = d.target_type === 'team';
            const staffRoleLabel = d.target_type === 'staff' && d.staff_role ? (STAFF_ROLE_LABELS[d.staff_role] || d.staff_role) : null;
            const isPunish = d.decision === 'punish';

            const avatarSrc = getImageUrl(isTeamTarget
              ? (d.team_logo || '/default/Logo_team_default.webp')
              : (d.team_member_photo_url || d.user_avatar_url || '/default/user_default.webp'));
            const teamLogoSrc = getImageUrl(d.team_logo || '/default/Logo_team_default.webp');

            // Обязательные/доп.матчи хранятся раздельно (mandatory_games/additional_games) только начиная с
            // введения этого разбиения — у решений, созданных раньше, будет только общий penalty_games.
            const hasSplit = d.mandatory_games != null || d.additional_games != null;
            const dqServed = d.dq_games_served || 0;
            const mandatoryServed = hasSplit && d.mandatory_games != null ? Math.min(dqServed, d.mandatory_games) : null;
            const additionalServed = hasSplit && d.additional_games != null
              ? Math.min(Math.max(dqServed - (d.mandatory_games || 0), 0), d.additional_games)
              : null;

            const gamesText = !hasSplit && d.penalty_games ? `${d.penalty_games} ${pluralizeMatches(d.penalty_games)}` : null;
            const amountText = d.penalty_amount ? `${Math.round(Number(d.penalty_amount)).toLocaleString('ru-RU')} ₽` : null;
            // Командный штраф складывается из обязательной и дополнительной частей — показываем состав суммы
            const hasAmountSplit = Number(d.mandatory_amount) > 0 && Number(d.additional_amount) > 0;
            const amountSplitText = hasAmountSplit
              ? `${Math.round(Number(d.mandatory_amount)).toLocaleString('ru-RU')} + ${Math.round(Number(d.additional_amount)).toLocaleString('ru-RU')}`
              : null;
            const hasSanction = isPunish && (gamesText || amountText || hasSplit);

            const gamesRemaining = !hasSplit && d.penalty_games && d.dq_games_assigned != null
              ? Math.max(d.dq_games_assigned - (d.dq_games_served || 0), 0)
              : null;

            // Командный штраф с делением: общей записи нет, оплата идёт по долям участников
            const isSplitPenalty = d.team_penalty_mode === 'split';
            const members = isSplitPenalty ? (d.members || []) : [];
            const paidMembersCount = members.filter(m => m.paid).length;

            return (
              <div key={d.id} className="p-4 bg-white/40 border border-graphite/10 rounded-md flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[12px] font-bold text-graphite/50 truncate">
                    {/* У решения по "иному лицу" команды может не быть вовсе */}
                    {[d.division_name, d.team_name].filter(Boolean).join(' • ') || 'Без привязки к команде'}
                    {d.game_id && d.game_date && (
                      <span className="text-graphite/35 font-medium"> · Матч от {new Date(d.game_date).toLocaleDateString('ru-RU')}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Pill className={isPunish ? 'bg-orange/10 text-orange border border-orange/20' : 'bg-graphite/10 text-graphite/60 border border-graphite/10'}>
                      {isPunish ? 'Наказан' : 'Не наказан'}
                    </Pill>
                    <Pill className={STATUS_PILL[d.status] || STATUS_PILL.active}>{STATUS_LABEL[d.status] || d.status}</Pill>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="relative w-12 h-12 shrink-0">
                    <img src={avatarSrc} alt="" className={`w-12 h-12 rounded-lg border border-graphite/10 bg-graphite/5 ${isTeamTarget ? 'object-contain p-1' : 'object-cover'}`} />
                    {!isTeamTarget && d.team_name && (
                      <img src={teamLogoSrc} alt="" className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full object-contain bg-white border border-white shadow" />
                    )}
                  </div>

                  <div className="flex flex-col shrink-0 w-[190px] gap-1.5">
                    {d.target_type === 'other' ? (
                      <div className="flex flex-col leading-tight">
                        <span className="text-[16px] font-black text-graphite">{d.other_person_name || 'Иное лицо'}</span>
                        <span className="text-[10px] text-graphite-light/70 mt-1">Иное лицо</span>
                      </div>
                    ) : isTeamTarget ? (
                      <span className="text-[16px] font-black text-graphite leading-tight">Вся команда</span>
                    ) : (
                      <div className="flex flex-col leading-tight">
                        <span className="text-[16px] font-black text-graphite truncate">{d.last_name || '—'}</span>
                        <span className="text-[14px] font-bold text-graphite-light truncate">{[d.first_name, d.middle_name].filter(Boolean).join(' ')}</span>
                        {staffRoleLabel && <span className="text-[10px] text-graphite-light/70 mt-1">{staffRoleLabel}</span>}
                      </div>
                    )}
                  </div>

                  <div className="text-[13px] text-graphite-light leading-relaxed flex-1 min-w-0">
                    <span className="font-black text-orange">{d.violation_code}.</span> {d.violation_title}
                  </div>
                </div>

                {basisText(d) && (
                  <div className="text-[11px] text-graphite/40 font-medium">
                    Основание: {basisText(d)}
                  </div>
                )}

                {d.verdict_description && (
                  <div className="text-[11px] text-graphite-light font-medium leading-relaxed px-3 py-2 bg-graphite/5 border border-graphite/10 rounded-md">
                    <span className="font-black uppercase text-[10px] text-graphite/40 block mb-0.5">
                      {isPunish ? 'Решение' : 'Почему не наказан'}
                    </span>
                    {d.verdict_description}
                  </div>
                )}

                {d.penalty_minutes && (
                  <div className="text-[11px] text-graphite/40 font-medium">
                    Штраф в матче: {d.penalty_minutes} мин.
                  </div>
                )}

                {(hasSanction || canManage) && (
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-graphite/10">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isPunish && hasSplit && d.mandatory_games != null && (
                        <Pill className="bg-status-rejected/5 text-status-rejected border border-status-rejected/10">
                          Обяз. матчи: {mandatoryServed}/{d.mandatory_games}
                        </Pill>
                      )}
                      {isPunish && hasSplit && d.additional_games != null && (
                        <Pill className="bg-status-rejected/5 text-status-rejected border border-status-rejected/10">
                          Доп. матчи: {additionalServed}/{d.additional_games}
                        </Pill>
                      )}
                      {isPunish && !hasSplit && gamesText && (
                        <Pill className="bg-status-rejected/5 text-status-rejected border border-status-rejected/10">{gamesText}</Pill>
                      )}
                      {isPunish && !hasSplit && gamesRemaining != null && d.status === 'active' && (
                        <Pill className="bg-graphite/5 text-graphite/70 border border-graphite/10">Осталось {gamesRemaining}</Pill>
                      )}
                      {isPunish && (hasSplit || gamesText) && amountText && (
                        <span className="text-[10px] font-bold text-graphite-light/60 uppercase">{d.penalty_logic === 'or' ? 'или' : 'и'}</span>
                      )}
                      {isPunish && amountText && isSplitPenalty && (
                        <Pill className="bg-status-pending/10 text-status-pending border border-status-pending/20">
                          {amountText} на {members.length} чел. · оплатили {paidMembersCount} из {members.length}
                        </Pill>
                      )}
                      {isPunish && amountText && !isSplitPenalty && (
                        <button
                          onClick={() => canManage && handleTogglePaid(d)}
                          disabled={!canManage}
                          className={canManage ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'}
                        >
                          <Pill className={d.penalty_amount_paid ? 'bg-status-accepted/10 text-status-accepted border border-status-accepted/20' : 'bg-status-pending/10 text-status-pending border border-status-pending/20'}>
                            {amountText} · {d.penalty_amount_paid ? 'оплачен' : 'не оплачен'}
                          </Pill>
                        </button>
                      )}
                      {isPunish && amountSplitText && (
                        <span className="text-[10px] font-bold text-graphite-light/60">обяз. + доп.: {amountSplitText} ₽</span>
                      )}
                      {isPunish && d.team_penalty_mode === 'whole' && (
                        <span className="text-[10px] font-bold text-graphite-light/60 uppercase">на всю команду</span>
                      )}
                    </div>

                    {canManage && (
                      <button onClick={() => setDecisionToDelete(d)} className="p-2 text-graphite-light hover:text-status-rejected hover:bg-status-rejected/10 rounded-lg transition-colors shrink-0">
                        <Icon name="delete" className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                {isPunish && members.length > 0 && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-graphite/10">
                    <span className="text-[10px] font-black text-graphite-light uppercase tracking-wide">Доли участников</span>
                    <div className="flex flex-wrap gap-2">
                      {members.map(m => (
                        <button
                          key={m.id}
                          onClick={() => canManage && handleToggleMemberPaid(m)}
                          disabled={!canManage}
                          className={canManage ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'}
                        >
                          <Pill className={m.paid ? 'bg-status-accepted/10 text-status-accepted border border-status-accepted/20' : 'bg-status-pending/10 text-status-pending border border-status-pending/20'}>
                            {m.full_name || `ID ${m.user_id}`} · {Math.round(Number(m.share_amount))} ₽
                          </Pill>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateSdkDecisionDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        meetingId={meetingId}
        seasonId={seasonId}
        violationTypes={violationTypes}
        onSuccess={fetchDecisions}
      />

      <ConfirmModal
        isOpen={!!decisionToDelete}
        onClose={() => setDecisionToDelete(null)}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
