import React from 'react';
import { Badge } from './Badge';
import { Tooltip } from './Tooltip';

export const Pill = ({ children, className = '' }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${className}`}>{children}</span>
);

// Пилюли одной дисквалификации: "Обяз. матчи: X/Y", "Доп. матчи: X/Y" и сумма штрафа
// (синий = не оплачен, зелёный = оплачен). Для записей без разбивки (созданных до её введения) —
// текстовый фолбэк по penalty_type. Используется и в тултипе (DisqualificationBadge), и напрямую
// в карточке дисквалификации (DisqualificationsPage), чтобы вид был одинаковым везде.
export function DisqualificationPills({ d }) {
  const hasSplit = d.mandatory_games != null || d.additional_games != null;
  const dqServed = d.games_served || 0;
  const mandatoryServed = hasSplit && d.mandatory_games != null ? Math.min(dqServed, d.mandatory_games) : null;
  const additionalServed = hasSplit && d.additional_games != null
    ? Math.min(Math.max(dqServed - (d.mandatory_games || 0), 0), d.additional_games)
    : null;

  if (!hasSplit && d.penalty_amount == null) {
    let oldPenaltyText = '';
    if (d.penalty_type === 'games' && d.games_assigned != null) {
      oldPenaltyText = `Осталось матчей: ${Math.max(d.games_assigned - dqServed, 0)}`;
    } else if (d.penalty_type === 'time') {
      oldPenaltyText = `До: ${new Date(d.end_date).toLocaleDateString('ru-RU')}`;
    } else if (d.penalty_type === 'manual') {
      oldPenaltyText = 'До решения СДК';
    }
    return oldPenaltyText ? <span className="font-bold text-status-rejected block">{oldPenaltyText}</span> : null;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {d.is_team_wide && (
        <Pill className="bg-graphite/10 text-graphite/70 border border-graphite/10">Штраф команды</Pill>
      )}
      {hasSplit && d.mandatory_games != null && (
        <Pill className="bg-status-rejected/5 text-status-rejected border border-status-rejected/10">Обяз. матчи: {mandatoryServed}/{d.mandatory_games}</Pill>
      )}
      {hasSplit && d.additional_games != null && (
        <Pill className="bg-status-rejected/5 text-status-rejected border border-status-rejected/10">Доп. матчи: {additionalServed}/{d.additional_games}</Pill>
      )}
      {d.penalty_amount != null && (
        <Pill className={d.penalty_amount_paid ? 'bg-status-accepted/10 text-status-accepted border border-status-accepted/20' : 'bg-status-pending/10 text-status-pending border border-status-pending/20'}>
          {d.penalty_amount} ₽ · {d.penalty_amount_paid ? 'оплачен' : 'не оплачен'}
        </Pill>
      )}
    </div>
  );
}

// Единый бейдж+тултип "Дискв." — используется везде, где нужно показать активную дисквалификацию
// (дивизионы, состав команды, состав на матч, страница матча).
export function DisqualificationBadge({ activeDisqualifications, label = 'Дискв.', className = '' }) {
  if (!activeDisqualifications || activeDisqualifications.length === 0) return null;

  const tooltipSubtitleNode = (
    <div className="flex flex-col gap-2 mt-1">
      {activeDisqualifications.map((d, index) => (
        <div key={index} className="text-[11px] leading-tight pb-2 border-b border-graphite/10 last:border-0 last:pb-0 flex flex-col gap-1.5">
          <DisqualificationPills d={d} />
          <span className="text-graphite/80 block" title={d.reason}>Причина: {d.reason}</span>
        </div>
      ))}
    </div>
  );

  const tooltipTitle = activeDisqualifications.length > 1
    ? `Дисквалификации (${activeDisqualifications.length})`
    : 'Дисквалификация';

  return (
    <span onClick={(e) => e.stopPropagation()} className={`cursor-help shrink-0 ${className}`}>
      <Tooltip title={tooltipTitle} subtitle={tooltipSubtitleNode} position="top">
        <Badge label={label} type="expired" />
      </Tooltip>
    </span>
  );
}
