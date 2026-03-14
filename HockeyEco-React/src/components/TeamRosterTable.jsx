import React, { useMemo } from 'react';
import { Table } from '../ui/Table2';
import { Badge } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';
import { Switch } from '../ui/Switch';
import dayjs from 'dayjs';
import { getImageUrl } from '../utils/helpers';

const POSITION_MAP = {
  goalie: 'Вр',
  defense: 'Защ',
  forward: 'Нап'
};

const STAFF_ROLE_MAP = {
  team_manager: 'Менеджер',
  team_admin: 'Администратор',
  coach: 'Тренер',
  head_coach: 'Главный тренер'
};

export function TeamRosterTable({ roster, onOpenModal, onToggleStatus, onOpenProfile, isStaff, canEditRoster = true }) {
  
  const formatPhone = (phone) => {
    if (!phone) return '-';
    const cleaned = ('' + phone).replace(/\D/g, '');
    const match = cleaned.match(/^(7|8)?(\d{3})(\d{3})(\d{2})(\d{2})$/);
    if (match) return `+7 (${match[2]}) ${match[3]}-${match[4]}-${match[5]}`;
    return phone; 
  };

  // Вычисляем дублирующиеся номера (только для игроков)
  const duplicateJerseys = useMemo(() => {
    if (isStaff || !roster) return new Set();
    const counts = {};
    roster.forEach(r => {
      const num = r.jersey_number;
      if (num !== null && num !== undefined && num !== '') {
        counts[num] = (counts[num] || 0) + 1;
      }
    });
    // Возвращаем Set с номерами (в виде строк для надежного сравнения), которые встречаются больше 1 раза
    return new Set(Object.keys(counts).filter(num => counts[num] > 1).map(String));
  }, [roster, isStaff]);

  const playerColumns = [
    { 
      label: 'Фото', 
      width: 'w-[60px] text-center', 
      render: (row) => {
        const photoUrl = row.team_member_photo_url || row.user_avatar_url;
        const src = getImageUrl(photoUrl || '/default/user_default.webp');
        return (
          <div 
            onClick={() => onOpenProfile && onOpenProfile(row.player_id)}
            className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10 mx-auto cursor-pointer hover:scale-105 transition-transform shadow-sm"
          >
            <img src={src} alt="avatar" className="w-full h-full object-cover" />
          </div>
        );
      }
    },
    {
      label: 'ФИО', 
      sortKey: 'last_name',
      width: 'w-[100px]',
      render: (row) => {
        let statusBadge = '';
        if (row.is_captain) statusBadge = ' | Капитан';
        else if (row.is_assistant) statusBadge = ' | Ассистент';

        let dsqBadge = null;
        
        if (row.active_disqualifications && row.active_disqualifications.length > 0) {
          const tooltipSubtitleNode = (
            <div className="flex flex-col gap-2 mt-1">
              {row.active_disqualifications.map((d, index) => {
                let penaltyText = '';
                if (d.penalty_type === 'games') {
                  penaltyText = `Осталось матчей: ${d.games_assigned - d.games_served}`;
                } else if (d.penalty_type === 'time') {
                  penaltyText = `До: ${dayjs(d.end_date).format('DD.MM.YYYY')}`;
                } else if (d.penalty_type === 'manual') {
                  penaltyText = 'До решения СДК';
                }
                
                return (
                  <div key={index} className="text-[11px] leading-tight pb-1 border-b border-graphite/10 last:border-0 last:pb-0">
                    <span className="font-bold text-status-rejected block mb-0.5">{penaltyText}</span>
                    <span className="text-graphite/80 block line-clamp-2" title={d.reason}>Причина: {d.reason}</span>
                  </div>
                );
              })}
            </div>
          );

          const tooltipTitle = row.active_disqualifications.length > 1 
            ? `Дисквалификации (${row.active_disqualifications.length})` 
            : 'Дисквалификация';

          dsqBadge = (
            <div onClick={(e) => e.stopPropagation()} className="cursor-help shrink-0 ml-5">
              <Tooltip title={tooltipTitle} subtitle={tooltipSubtitleNode} position="top">
                <Badge label="Дискв." type="expired" />
              </Tooltip>
            </div>
          );
        }

        return (
          <div 
            onClick={() => onOpenProfile && onOpenProfile(row.player_id)}
            className="flex items-center min-w-0 w-full cursor-pointer group"
          >
            <div className="flex flex-col min-w-0">
              <span 
                className="font-bold text-graphite text-[14px] block truncate group-hover:transition-colors"
                title={`${row.last_name || ''} ${row.first_name || ''}`}
              >
                {`${row.last_name || ''} ${row.first_name || ''}`.trim()}
              </span>
              
              {(row.middle_name || statusBadge) && (
                <span 
                  className="text-[12px] text-graphite/50 font-medium block truncate w-full group-hover:transition-colors"
                  title={`${row.middle_name || ''}${statusBadge}`}
                >
                  {row.middle_name || ''} <span className="text-orange font-normal">{statusBadge}</span>
                </span>
              )}
            </div>

            {dsqBadge}
          </div>
        );
      }
    },
    { 
      label: 'ID', 
      sortKey: 'tournament_roster_id',  align: 'center',
      width: 'w-[70px]', 
      render: (row) => <span className="text-[12px] text-graphite/50 font-mono" title="ID заявки">{row.tournament_roster_id || row.player_id}</span> 
    },
    { 
      label: 'Поз.', 
      sortKey: 'position',
      width: 'w-[80px]', align: 'center',
      render: (row) => (
        <span className="text-graphite">{POSITION_MAP[row.position] || '-'}</span>
      )
    },
    { 
      label: '№', 
      sortKey: 'jersey_number',
      width: 'w-[80px]', align: 'center',
      render: (row) => {
        const numStr = row.jersey_number != null ? String(row.jersey_number) : '';
        const isDuplicate = numStr !== '' && duplicateJerseys.has(numStr);
        
        return (
          <span 
            className={`font-black text-[13px] ${isDuplicate ? 'text-status-rejected bg-status-rejected/10 px-2 py-0.5 rounded' : 'text-graphite'}`}
            title={isDuplicate ? 'Этот номер дублируется в составе!' : ''}
          >
            {row.jersey_number || '-'}
          </span>
        );
      }
    },
    { 
      label: 'Квал.', 
      sortKey: 'qualification_short_name',
      width: 'w-[80px]', align: 'center',
      render: (row) => {
        const hasQual = !!row.qualification_id;
        return (
          <div onClick={() => onOpenModal(row, 'qual')} className={`cursor-pointer hover:scale-105 inline-block transition-transform ${!canEditRoster ? 'opacity-70' : ''}`}>
            <Badge label={row.qualification_short_name || 'Нет'} type={hasQual ? 'filled' : 'empty'} />
          </div>
        );
      }
    },
    { 
      label: 'Докум.', 
      width: 'w-[80px]', align: 'center',
      render: (row) => {
        const hasMed = !!row.medical_url;
        const hasIns = !!row.insurance_url;
        
        let type = 'empty';
        let text = 'Док.';
        
        if (hasMed && hasIns) type = 'filled';
        else if (hasMed || hasIns) type = 'half';

        const today = dayjs().startOf('day');
        let isExpired = false;
        let minDaysLeft = Infinity;

        const checkExp = (expDateStr) => {
          if (!expDateStr) return;
          const expDate = dayjs(expDateStr).startOf('day');
          const daysLeft = expDate.diff(today, 'day');
          
          if (daysLeft < 0) {
            isExpired = true;
          } else if (daysLeft <= 7) {
            if (daysLeft < minDaysLeft) minDaysLeft = daysLeft;
          }
        };

        if (hasMed) checkExp(row.medical_expires_at);
        if (hasIns) checkExp(row.insurance_expires_at);

        if (isExpired) {
          type = 'expired';
          text = 'Истек';
        } else if (minDaysLeft <= 7) {
          type = 'expiring';
          text = `${minDaysLeft} дн.`;
        }
        
        return (
          <div onClick={() => onOpenModal(row, 'docs')} className={`cursor-pointer hover:scale-105 inline-block transition-transform ${!canEditRoster ? 'opacity-70' : ''}`}>
            <Badge label={text} type={type} />
          </div>
        );
      }
    },
    { 
      label: 'Оплата', 
      sortKey: 'is_fee_paid',
      width: 'w-[80px]', align: 'center',
      render: (row) => (
        <div onClick={() => onOpenModal(row, 'fee')} className={`cursor-pointer hover:scale-105 inline-block transition-transform ${!canEditRoster ? 'opacity-70' : ''}`}>
          <Badge label="Взнос" type={row.is_fee_paid ? 'filled' : 'empty'} />
        </div>
      )
    },
    { 
      label: 'Обновлено', 
      sortKey: 'updated_at',
      width: 'w-[150px]', align: 'right', 
      render: (row) => (
        <div className="flex flex-col text-[12px] text-graphite/70">
          <span>{row.updated_at ? dayjs(row.updated_at).format('DD.MM.YYYY') : '-'}</span>
          <span>{row.updated_at ? dayjs(row.updated_at).format('HH:mm') : ''}</span>
        </div>
      )
    },
    { 
      label: 'Допуск', 
      sortKey: 'application_status',
      width: 'w-[120px]', align: 'center',
      render: (row) => (
        <div className="flex justify-center">
          <Switch 
            checked={row.application_status === 'approved'} 
            onChange={() => canEditRoster && onToggleStatus(row.tournament_roster_id, row.application_status)} 
            disabled={!canEditRoster}
          />
        </div>
      )
    }
  ];

  const staffColumns = [
    { 
      label: 'Фото', 
      width: 'w-[60px] text-center', 
      render: (row) => {
        const photoUrl = row.team_member_photo_url || row.user_avatar_url;
        const src = getImageUrl(photoUrl || '/default/user_default.webp');
        return (
          <div 
            onClick={() => onOpenProfile && onOpenProfile(row.player_id)}
            className="w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10 mx-auto cursor-pointer hover:scale-105 transition-transform shadow-sm"
          >
            <img src={src} alt="avatar" className="w-full h-full object-cover" />
          </div>
        );
      }
    },
    {
      label: 'ФИО', 
      sortKey: 'last_name',
      width: 'w-[300px]',
      render: (row) => (
        <div 
          onClick={() => onOpenProfile && onOpenProfile(row.player_id)}
          className="flex flex-col min-w-0 w-full cursor-pointer group"
        >
          <span 
            className="font-bold text-graphite text-[14px] block truncate w-full group-hover:transition-colors"
            title={`${row.last_name || ''} ${row.first_name || ''}`}
          >
            {`${row.last_name || ''} ${row.first_name || ''}`.trim()}
          </span>
          {row.middle_name && (
            <span 
              className="text-[12px] text-graphite/50 font-medium block truncate w-full group-hover:transition-colors"
              title={row.middle_name}
            >
              {row.middle_name}
            </span>
          )}
        </div>
      )
    },
    { 
      label: 'ID', 
      sortKey: 'player_id', 
      width: 'w-[70px]', 
      render: (row) => <span className="text-[12px] text-graphite/50 font-mono" title="ID">{row.player_id}</span> 
    },
    {
      label: 'Телефон', 
      sortKey: 'phone',
      width: 'w-[300px] text-center',
      render: (row) => (
        <span className="text-[14px] font-medium text-graphite whitespace-nowrap">
          {formatPhone(row.phone)}
        </span>
      )
    },
    {
      label: 'Роль', 
      sortKey: 'roles',
      width: 'w-[900px]',
      render: (row) => {
        if (!row.roles) return <span className="text-graphite/50">-</span>;
        
        const translatedRoles = row.roles
          .split(', ')
          .map(role => STAFF_ROLE_MAP[role] || role)
          .join(', ');

        return (
          <span 
            className="text-[14px] font-medium text-graphite block truncate w-full" 
            title={translatedRoles}
          >
            {translatedRoles}
          </span>
        );
      }
    }
  ];

  return <Table columns={isStaff ? staffColumns : playerColumns} data={roster} />;
}