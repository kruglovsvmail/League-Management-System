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
import { ArenasTab } from '../components/Settings/ArenasTab';
import { ServiceAccountsTab } from '../components/Settings/ServiceAccountsTab';
import { PreferencesTab } from '../components/Settings/PreferencesTab';

export function SettingsPage() {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();

  // Проверяем права на просмотр каждой из вкладок
  const canViewDivisions = checkAccess('SETTINGS_DIVISIONS_VIEW');
  const canViewStaff = checkAccess('SETTINGS_STAFF_VIEW');
  const canViewQuals = checkAccess('SETTINGS_QUAL_VIEW');
  const canViewArenas = checkAccess('SETTINGS_ARENAS_VIEW');
  const canViewServiceAccounts = checkAccess('SETTINGS_SERVICE_ACCOUNTS_VIEW'); 
  const canViewPreferences = checkAccess('SETTINGS_DIVISIONS_VIEW'); // Используем то же право, что и для дивизионов

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabParam = searchParams.get('tab');

  // Формируем массив доступных вкладок в новом порядке
  const availableTabs = [];
  if (canViewDivisions) availableTabs.push({ index: 0, label: 'Дивизионы' });
  if (canViewStaff) availableTabs.push({ index: 1, label: 'Персонал' });
  if (canViewServiceAccounts) availableTabs.push({ index: 2, label: 'Общий доступ' });
  if (canViewArenas) availableTabs.push({ index: 3, label: 'Арены' });
  if (canViewQuals) availableTabs.push({ index: 4, label: 'Квалификации' });
  if (canViewPreferences) availableTabs.push({ index: 5, label: 'Параметры' });

  const defaultTabIndex = availableTabs.length > 0 ? availableTabs[0].index : 0;
  const activeTab = activeTabParam ? parseInt(activeTabParam, 10) : defaultTabIndex;

  const setActiveTab = (index) => {
    setSearchParams(prev => {
      prev.set('tab', index);
      return prev;
    }, { replace: true });
  };

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

  const currentTabIndexInAvailable = availableTabs.findIndex(t => t.index === activeTab);
  const displayTabIndex = currentTabIndexInAvailable !== -1 ? currentTabIndexInAvailable : 0;

  const handleTabChange = (visibleIndex) => {
    const realIndex = availableTabs[visibleIndex].index;
    setActiveTab(realIndex);
  };

  const renderActiveTab = () => {
    const tabToRender = availableTabs.some(t => t.index === activeTab) ? activeTab : availableTabs[0].index;
    
    switch (tabToRender) {
      case 0: return <DivisionsTab setToast={setToast} setHeaderActions={setHeaderActions} />;
      case 1: return <StaffTab setToast={setToast} />;
      case 2: return <ServiceAccountsTab setToast={setToast} />; 
      case 3: return <ArenasTab setToast={setToast} />;
      case 4: return <QualificationsTab setToast={setToast} />; 
      case 5: return <PreferencesTab setToast={setToast} />;
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