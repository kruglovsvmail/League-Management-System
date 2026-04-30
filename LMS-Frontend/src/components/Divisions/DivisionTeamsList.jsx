import { useState } from 'react';
import { PaperApplicationModal } from '../../modals/PaperApplicationModal';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { Table } from '../../ui/Table2';
import { Tabs } from '../../ui/Tabs';
import { Tooltip } from '../../ui/Tooltip';
import { formatAge, getImageUrl, getToken } from '../../utils/helpers';

// Импортируем новую систему прав
import { useAccess } from '../../hooks/useAccess';

const STATUS_KEYS = ['approved', 'pending', 'revision', 'rejected'];

export function DivisionTeamsList({ teams, division, onOpenModal, selectedTeamId, onTeamSelect, activeTab, onTabChange, isAppWindowOpen, onRefresh }) {
  const { checkAccess } = useAccess();
  const isCompact = !!selectedTeamId;
  
  // Локальное состояние для моментального визуального обновления без перезагрузки страницы
  const [localUpdates, setLocalUpdates] = useState({});
  
  // Применяем локальные обновления к пропам
  const displayTeams = teams.map(t => ({ ...t, ...(localUpdates[t.id] || {}) }));
  const filteredTeams = displayTeams.filter(t => t.status === STATUS_KEYS[activeTab]);

  // СОСТОЯНИЯ ДЛЯ МОДАЛКИ БУМАЖНОЙ ЗАЯВКИ
  const [paperModalApp, setPaperModalApp] = useState(null);
  const [isSavingLeagueFile, setIsSavingLeagueFile] = useState(false);

  const handleUploadLeaguePaper = async (file, isCleared) => {
    if (!paperModalApp) return;
    setIsSavingLeagueFile(true);
    try {
      if (file) {
        // Если загружен новый файл
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-teams/${paperModalApp.id}/upload/paper_league`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}` },
          body: formData
        });
        
        const data = await res.json();
        if (data.success) {
          setLocalUpdates(prev => ({
            ...prev,
            [paperModalApp.id]: {
              ...prev[paperModalApp.id],
              paper_roster_league_url: data.url
            }
          }));
          setPaperModalApp(null);
          if (onRefresh) onRefresh(); 
        }
      } else if (isCleared && paperModalApp.paper_roster_league_url) {
        // Если пользователь нажал "Сбросить"
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-teams/${paperModalApp.id}/paper_league`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        
        const data = await res.json();
        if (data.success) {
          setLocalUpdates(prev => ({
            ...prev,
            [paperModalApp.id]: {
              ...prev[paperModalApp.id],
              paper_roster_league_url: null
            }
          }));
          setPaperModalApp(null);
          if (onRefresh) onRefresh();
        }
      } else {
        setPaperModalApp(null);
      }
    } catch (e) {
      console.error(e);
    } finally { 
      setIsSavingLeagueFile(false); 
    }
  };

  const tabsCounts = [
    `Допущенные (${teams.filter(t => t.status === 'approved').length})`,
    `На проверке (${teams.filter(t => t.status === 'pending').length})`,
    `К доработке (${teams.filter(t => t.status === 'revision').length})`,
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
    { label: 'Название', sortKey: 'name', width: 'w-[300px]', render: (row) => (
      <span onClick={() => onTeamSelect && onTeamSelect(row)} className="font-bold text-graphite text-[15px] cursor-pointer hover:transition-colors block truncate w-full" title={row.name}>
        {row.name}
      </span> 
    )},
    { label: 'ID', sortKey: 'id', width: 'w-[60px]', render: (row) => <span className="text-[12px] text-graphite/50 font-mono" title="ID заявки в БД">{row.id}</span> },
    
    { label: 'Абр.', sortKey: 'short_name', width: 'w-[100px]', align: 'center', render: (row) => <span className="text-graphite-light font-medium">{row.short_name || '-'}</span> },
    { label: 'Город', sortKey: 'city', width: 'w-[120px]', align: 'center', render: (row) => <span className="text-graphite">{row.city || '-'}</span> },
    
    // КОЛОНКА "ЗАЯВКА" - Выводится ТОЛЬКО если дивизион не является "Только цифровым"
    ...(!division || !division.digital_applications_only ? [{
      label: 'Заявка', width: 'w-[80px]', align: 'center', render: (row) => {
        let type = 'empty'; 
        
        // Корректная проверка на 1/2 (любой из документов делает бейдж заполненным наполовину)
        if (row.paper_roster_team_url && row.paper_roster_league_url) type = 'filled';
        else if (row.paper_roster_team_url || row.paper_roster_league_url) type = 'half';

        return (
          <div 
            onClick={(e) => { 
              e.stopPropagation(); 
              setPaperModalApp(row); 
            }} 
            className="inline-block cursor-pointer hover:scale-105 transition-transform"
          >
            <Badge label="Заявка" type={type} />
          </div>
        );
      }
    }] : []),

    { label: 'Форма', width: 'w-[80px]', align: 'center', render: (row) => {
      const hasLight = !!(row.custom_jersey_light_url || row.jersey_light_url); const hasDark = !!(row.custom_jersey_dark_url || row.jersey_dark_url);
      let badgeType = 'empty'; if (hasLight && hasDark) badgeType = 'filled'; else if (hasLight || hasDark) badgeType = 'half';
      
      return (
        <div 
          onClick={() => onOpenModal(row, 'uniform')} 
          className="inline-block cursor-pointer hover:scale-105 transition-transform"
        >
          <Badge label="Форма" type={badgeType} />
        </div>
      );
    }},
    { label: 'Описание', width: 'w-[80px]', align: 'center', render: (row) => {
      const hasDesc = !!(row.custom_description || row.description);
      
      return (
        <div 
          onClick={() => onOpenModal(row, 'desc')} 
          className="inline-block cursor-pointer hover:scale-105 transition-transform"
        >
          <Badge label="Инфо" type={hasDesc ? 'filled' : 'empty'} />
        </div>
      );
    }},
    { label: 'Фото', width: 'w-[80px]', align: 'center', render: (row) => {
      const hasPhoto = !!(row.custom_team_photo_url || row.team_photo_url);
      
      return (
        <div 
          onClick={() => onOpenModal(row, 'photo')} 
          className="inline-block cursor-pointer hover:scale-105 transition-transform"
        >
          <Badge label="Фото" type={hasPhoto ? 'filled' : 'empty'} />
        </div>
      );
    }},
    { label: 'Игроки', sortKey: 'players_count', width: 'w-[80px]', align: 'center', render: (row) => <span className="font-bold text-orange text-[15px]">{row.players_count}</span> },
    { label: 'Ср. возр.', sortKey: 'avg_age', width: 'w-[100px]', align: 'center', render: (row) => <span className="font-semibold text-graphite text-[14px]">{row.avg_age ? formatAge(row.avg_age) : '-'}</span> },
    
    { label: '', width: 'w-[50px]', align: 'right', render: (row) => {
      // Иконка статуса появляется только если есть права
      const canChangeStatus = checkAccess('DIVISIONS_TEAM_STATUS') && row.status !== 'revision';

      if (!canChangeStatus) return null;

      return (
        <button onClick={() => onOpenModal(row, 'status')} className="p-2 text-graphite/40 hover:text-orange hover:bg-orange/10 rounded-md transition-all duration-200" title="Изменить статус">
          <Icon name="swap" className="w-5 h-5" />
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
        <div className="mb-6 overflow-x-auto pb-2 custom-scrollbar animate-zoom-in flex items-center min-h-[38px]">
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

      <PaperApplicationModal 
        isOpen={!!paperModalApp}
        onClose={() => setPaperModalApp(null)}
        app={paperModalApp}
        onSave={handleUploadLeaguePaper}
        isSaving={isSavingLeagueFile}
        readOnly={!checkAccess('DIVISIONS_TEAM_ROSTERS_MODAL')}
      />
    </>
  );
}