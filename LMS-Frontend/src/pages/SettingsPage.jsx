import React, { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useAccess } from '../hooks/useAccess';
import { Header } from '../components/Header';
import { Tabs } from '../ui/Tabs';
import { Toast } from '../modals/Toast';
import { AccessFallback } from '../ui/AccessFallback';

import { DivisionsTab } from '../components/Settings/DivisionsTab';
import { StaffTab } from '../components/Settings/StaffTab';
import { QualificationsTab } from '../components/Settings/QualificationsTab';

export function SettingsPage() {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();

  // Проверяем права на просмотр каждой из вкладок
  const canViewDivisions = checkAccess('SETTINGS_DIVISIONS_VIEW');
  const canViewStaff = checkAccess('SETTINGS_STAFF_VIEW');
  const canViewQuals = checkAccess('SETTINGS_QUAL_VIEW');

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabParam = searchParams.get('tab');

  // Формируем массив доступных вкладок
  const availableTabs = [];
  if (canViewDivisions) availableTabs.push({ index: 0, label: 'Дивизионы' });
  if (canViewStaff) availableTabs.push({ index: 1, label: 'Персонал' });
  if (canViewQuals) availableTabs.push({ index: 2, label: 'Квалификации' });

  // Определяем активную вкладку (по умолчанию - первая из доступных)
  const defaultTabIndex = availableTabs.length > 0 ? availableTabs[0].index : 0;
  const activeTab = activeTabParam ? parseInt(activeTabParam, 10) : defaultTabIndex;

  const setActiveTab = (index) => {
    setSearchParams(prev => {
      prev.set('tab', index);
      return prev;
    }, { replace: true });
  };

  // Если текущая вкладка (из URL) недоступна пользователю, переключаем на первую разрешенную
  useEffect(() => {
    const isCurrentTabAvailable = availableTabs.some(t => t.index === activeTab);
    if (!isCurrentTabAvailable && availableTabs.length > 0) {
      setActiveTab(availableTabs[0].index);
    }
  }, [activeTab, availableTabs]);

  const [toast, setToast] = useState(null);
  const [headerActions, setHeaderActions] = useState(null);

  if (!selectedLeague) {
    return (
      <div className="flex flex-col flex-1 animate-zoom-in">
        <Header title="Настройки лиги" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <div className="text-center text-graphite-light font-medium text-lg">
            Выберите лигу для управления настройками
          </div>
        </main>
      </div>
    );
  }

  // Если у пользователя нет доступа ни к одной из вкладок настроек
  if (availableTabs.length === 0) {
    return (
      <div className="flex flex-col flex-1 animate-zoom-in">
        <Header title="Настройки лиги" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <AccessFallback 
            variant="full" 
            message="У вас нет прав для просмотра раздела настроек лиги." 
          />
        </main>
      </div>
    );
  }

  // Вычисляем индекс для UI-компонента Tabs (ему нужен порядковый номер в массиве, а не наш ID)
  const currentTabIndexInAvailable = availableTabs.findIndex(t => t.index === activeTab);
  const displayTabIndex = currentTabIndexInAvailable !== -1 ? currentTabIndexInAvailable : 0;

  const handleTabChange = (visibleIndex) => {
    const realIndex = availableTabs[visibleIndex].index;
    setActiveTab(realIndex);
  };

  const renderActiveTab = () => {
    // Двойная защита: рендерим только если есть доступ к текущей активной вкладке
    const tabToRender = availableTabs.some(t => t.index === activeTab) ? activeTab : availableTabs[0].index;
    
    switch (tabToRender) {
      case 0: return <DivisionsTab setToast={setToast} setHeaderActions={setHeaderActions} />;
      case 1: return <StaffTab setToast={setToast} />;
      case 2: return <QualificationsTab setToast={setToast} />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header title="Настройки лиги" actions={headerActions} />
      
      {toast && (
        <div className="fixed top-[110px] right-10 z-[9999]">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      )}

      <div className="px-10 pt-8 relative z-10 flex flex-col gap-8">
        <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] px-6 pt-4 pb-2 overflow-hidden">
          <Tabs 
            tabs={availableTabs.map(t => t.label)} 
            activeTab={displayTabIndex} 
            onChange={handleTabChange} 
          />
        </div>

        <div className="w-full">
          {renderActiveTab()}
        </div>
      </div>
    </div>
  );
}