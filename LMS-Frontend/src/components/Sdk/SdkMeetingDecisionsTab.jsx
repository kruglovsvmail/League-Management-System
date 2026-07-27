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

const STAFF_ROLE_LABELS = { head_coach: 'Главный тренер', coach: 'Тренер', team_manager: 'Менеджер команды', team_admin: 'Администратор' };

const Pill = ({ children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap ${className}`}>{children}</span>
);

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

export function SdkMeetingDecisionsTab({ meetingId, seasonId, canManage, setToast }) {
  const [decisions, setDecisions] = useState([]);
  const [violationTypes, setViolationTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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
      {canManage && (
        <div className="mb-6 pb-6 border-b border-graphite/10">
          <Button onClick={() => setIsDrawerOpen(true)}>+ Новое решение</Button>
        </div>
      )}

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

            const gamesText = d.penalty_games ? `${d.penalty_games} ${pluralizeMatches(d.penalty_games)}` : null;
            const amountText = d.penalty_amount ? `${d.penalty_amount} ₽` : null;
            const hasSanction = isPunish && (gamesText || amountText);

            const gamesRemaining = d.penalty_games && d.dq_games_assigned != null
              ? Math.max(d.dq_games_assigned - (d.dq_games_served || 0), 0)
              : null;

            return (
              <div key={d.id} className="p-4 bg-white/40 border border-graphite/10 rounded-md flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[12px] font-bold text-graphite/50 truncate">
                    {d.division_name} • {d.team_name}
                    {d.game_id && d.game_date && (
                      <span className="text-graphite/35 font-medium"> · Матч от {new Date(d.game_date).toLocaleDateString('ru-RU')}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Pill className={isPunish ? 'bg-orange/10 text-orange border border-orange/20' : 'bg-graphite/10 text-graphite/60 border border-graphite/10'}>
                      {isPunish ? 'Наказан' : 'Оправдан'}
                    </Pill>
                    <Pill className={STATUS_PILL[d.status] || STATUS_PILL.active}>{STATUS_LABEL[d.status] || d.status}</Pill>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="relative w-12 h-12 shrink-0">
                    <img src={avatarSrc} alt="" className={`w-12 h-12 rounded-lg border border-graphite/10 bg-graphite/5 ${isTeamTarget ? 'object-contain p-1' : 'object-cover'}`} />
                    {!isTeamTarget && (
                      <img src={teamLogoSrc} alt="" className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full object-contain bg-white border border-white shadow" />
                    )}
                  </div>

                  <div className="flex flex-col shrink-0 w-[190px] gap-1.5">
                    {isTeamTarget ? (
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

                {d.penalty_minutes && (
                  <div className="text-[11px] text-graphite/40 font-medium">
                    Штраф в матче: {d.penalty_minutes} мин.
                  </div>
                )}

                {(hasSanction || canManage) && (
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-graphite/10">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isPunish && gamesText && (
                        <Pill className="bg-status-rejected/5 text-status-rejected border border-status-rejected/10">{gamesText}</Pill>
                      )}
                      {isPunish && gamesRemaining != null && d.status === 'active' && (
                        <Pill className="bg-graphite/5 text-graphite/70 border border-graphite/10">Осталось {gamesRemaining}</Pill>
                      )}
                      {isPunish && gamesText && amountText && (
                        <span className="text-[10px] font-bold text-graphite-light/60 uppercase">{d.penalty_logic === 'or' ? 'или' : 'и'}</span>
                      )}
                      {isPunish && amountText && (
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
                    </div>

                    {canManage && (
                      <button onClick={() => setDecisionToDelete(d)} className="p-2 text-graphite-light hover:text-status-rejected hover:bg-status-rejected/10 rounded-lg transition-colors shrink-0">
                        <Icon name="delete" className="w-4 h-4" />
                      </button>
                    )}
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
