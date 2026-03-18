import React from 'react';
import { getImageUrl, formatAge } from '../utils/helpers';
import { Table } from '../ui/Table2';
import { Tabs } from '../ui/Tabs';
import { Badge } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';

const STATUS_KEYS = ['approved', 'pending', 'revision', 'rejected'];

export function DivisionTeamsList({ teams, onOpenModal, selectedTeamId, onTeamSelect, userRole, activeTab, onTabChange, isAppWindowOpen, canManageDivisions }) {
  const isCompact = !!selectedTeamId;
  const filteredTeams = teams.filter(t => t.status === STATUS_KEYS[activeTab]);

  const tabsCounts = [
    `Допущенные (${teams.filter(t => t.status === 'approved').length})`,
    `На проверке (${teams.filter(t => t.status === 'pending').length})`,
    `На исправлении (${teams.filter(t => t.status === 'revision').length})`,
    `Отклоненные (${teams.filter(t => t.status === 'rejected').length})`
  ];

  const fullColumns = [
    { label: '№', width: 'w-[40px]', render: (_, idx) => <span className="font-bold text-graphite/40">{idx + 1}</span> },
    { label: 'Логотип', width: 'w-[60px]', align: 'center', render: (row) => (
      <div 
        onClick={() => onTeamSelect && onTeamSelect(row)}
        className="w-[40px] h-[40px] flex items-center justify-center p-[2px] rounded-lg cursor-pointer hover:scale-105 transition-transform"
      >
        <img src={getImageUrl(row.logo_url || '/default/Logo_division_default.webp')} className="w-full h-full object-contain drop-shadow-sm" alt="logo" />
      </div>
    )},
    { label: 'Название', sortKey: 'name', width: 'w-[380px]', render: (row) => (
      <span onClick={() => onTeamSelect && onTeamSelect(row)} className="font-bold text-graphite text-[15px] cursor-pointer hover:transition-colors block truncate w-full" title={row.name}>
        {row.name}
      </span> 
    )},
    { label: 'ID', sortKey: 'id', width: 'w-[60px]', render: (row) => <span className="text-[12px] text-graphite/50 font-mono" title="ID заявки в БД">{row.id}</span> },
    
    { label: 'Абр.', sortKey: 'short_name', width: 'w-[150px]', align: 'center', render: (row) => <span className="text-graphite-light font-medium">{row.short_name || '-'}</span> },
    { label: 'Город', sortKey: 'city', width: 'w-[150px]', align: 'center', render: (row) => <span className="text-graphite">{row.city || '-'}</span> },
    { label: 'Форма', width: 'w-[80px]', align: 'center', render: (row) => {
      const hasLight = !!(row.custom_jersey_light_url || row.jersey_light_url); const hasDark = !!(row.custom_jersey_dark_url || row.jersey_dark_url);
      let badgeType = 'empty'; if (hasLight && hasDark) badgeType = 'filled'; else if (hasLight || hasDark) badgeType = 'half';
      
      const isClickable = canManageDivisions && (userRole === 'admin' || row.status !== 'revision');
      
      return (
        <div 
          onClick={() => isClickable && onOpenModal(row, 'uniform')} 
          className={`inline-block ${isClickable ? 'cursor-pointer hover:scale-105 transition-transform' : 'opacity-70 cursor-not-allowed'}`}
        >
          <Badge label="Форма" type={badgeType} />
        </div>
      );
    }},
    { label: 'Описание', width: 'w-[80px]', align: 'center', render: (row) => {
      const hasDesc = !!(row.custom_description || row.description);
      const isClickable = canManageDivisions && (userRole === 'admin' || row.status !== 'revision');
      
      return (
        <div 
          onClick={() => isClickable && onOpenModal(row, 'desc')} 
          className={`inline-block ${isClickable ? 'cursor-pointer hover:scale-105 transition-transform' : 'opacity-70 cursor-not-allowed'}`}
        >
          <Badge label="Инфо" type={hasDesc ? 'filled' : 'empty'} />
        </div>
      );
    }},
    { label: 'Фото', width: 'w-[80px]', align: 'center', render: (row) => {
      const hasPhoto = !!(row.custom_team_photo_url || row.team_photo_url);
      const isClickable = canManageDivisions && (userRole === 'admin' || row.status !== 'revision');
      
      return (
        <div 
          onClick={() => isClickable && onOpenModal(row, 'photo')} 
          className={`inline-block ${isClickable ? 'cursor-pointer hover:scale-105 transition-transform' : 'opacity-70 cursor-not-allowed'}`}
        >
          <Badge label="Фото" type={hasPhoto ? 'filled' : 'empty'} />
        </div>
      );
    }},
    { label: 'Игроки', sortKey: 'players_count', width: 'w-[80px]', align: 'center', render: (row) => <span className="font-bold text-orange text-[15px]">{row.players_count}</span> },
    { label: 'Ср. возр.', sortKey: 'avg_age', width: 'w-[120px]', align: 'center', render: (row) => <span className="font-semibold text-graphite text-[14px]">{row.avg_age ? formatAge(row.avg_age) : '-'}</span> },
    
    { label: '', width: 'w-[50px]', align: 'right', render: (row) => {
      const isAdmin = userRole === 'admin';
      // Проверяем наличие прав MANAGE_DIVISIONS + логику статуса/окна
      const canChangeStatus = canManageDivisions && (isAdmin || (isAppWindowOpen && row.status !== 'revision'));

      if (!canChangeStatus) return null;

      return (
        <button onClick={() => onOpenModal(row, 'status')} className="p-2 text-graphite/40 hover:text-orange hover:bg-orange/10 rounded-xl transition-all duration-200" title="Изменить статус">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
        </button>
      );
    }}
  ];

  const compactColumns = [
    { 
      label: 'Команды', 
      width: 'w-[100px]', align: 'center',  
      render: (row) => {
        const logoSrc = getImageUrl(row.logo_url || '/default/Logo_division_default.webp');
        const isSelected = selectedTeamId === row.id;
        
        return (
          <div className="relative flex items-center justify-center w-full">
            <Tooltip 
              title={row.name} 
              subtitle={row.city ? `г. ${row.city}` : 'Город не указан'} 
              position="left"
              noUnderline={true}
            >
              <div 
                onClick={() => onTeamSelect && onTeamSelect(row)}
                className={`w-[66px] h-[40px] flex items-center justify-center p-[2px] rounded-lg cursor-pointer duration-100 ${
                  isSelected 
                    ? 'border-[1.5px] border-orange' 
                    : 'hover:opacity-60 hover:opacity-100'
                }`}
              >
                <img src={logoSrc} className="w-full h-full object-contain drop-shadow-lg" alt="logo" />
              </div>
            </Tooltip>

          </div>
        );
      }
    }
  ];

  const currentColumns = isCompact ? compactColumns : fullColumns;

  return (
    <>
      {!isCompact && (
        <div className="mb-6 overflow-x-auto pb-2 custom-scrollbar animate-fade-in-down flex items-center min-h-[38px]">
          <Tabs tabs={tabsCounts} activeTab={activeTab} onChange={onTabChange} />
        </div>
      )}
      <div className="overflow-hidden">
        {filteredTeams.length > 0 ? (
          <Table columns={currentColumns} data={filteredTeams} />
        ) : (
          <div className={`text-center py-12 bg-graphite/[0.02] text-graphite-light/70 font-medium ${isCompact ? 'text-[11px] px-2' : 'text-[15px]'}`}>
            {isCompact ? 'Пусто' : 'В данной категории нет команд'}
          </div>
        )}
      </div>
    </>
  );
}