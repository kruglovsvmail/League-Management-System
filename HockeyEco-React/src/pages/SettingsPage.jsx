import React, { useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useAccess } from '../hooks/useAccess';
import { Header } from '../components/Header';
import { Tabs } from '../ui/Tabs';
import { Toast } from '../modals/Toast';

import { DivisionsTab } from '../components/Settings/DivisionsTab';
import { StaffTab } from '../components/Settings/StaffTab';
import { QualificationsTab } from '../components/Settings/QualificationsTab';

export function SettingsPage() {
  const { selectedLeague, user } = useOutletContext();
  const { checkAccess } = useAccess();

  const canViewStaff = checkAccess('VIEW_STAFF');
  const canViewQuals = checkAccess('VIEW_QUALIFICATIONS');
  const canManageDivisions = checkAccess('MANAGE_DIVISIONS') || user?.globalRole === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseInt(searchParams.get('tab') || '0', 10);

  const setActiveTab = (index) => {
    setSearchParams(prev => {
      prev.set('tab', index);
      return prev;
    }, { replace: true });
  };

  const [toast, setToast] = useState(null);
  const [headerActions, setHeaderActions] = useState(null);

  if (!selectedLeague) {
    return (
      <div className="flex flex-col flex-1 animate-fade-in-down">
        <Header title="Настройки лиги" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <div className="text-center text-graphite-light font-medium text-lg">Выберите лигу для управления настройками</div>
        </main>
      </div>
    );
  }

  // Если у пользователя нет доступа ни к одной из вкладок
  if (!canViewStaff && !canViewQuals && !canManageDivisions) {
    return (
      <div className="flex flex-col flex-1 animate-fade-in-down">
        <Header title="Настройки лиги" />
        <main className="p-10 flex flex-1 items-center justify-center">
          <div className="text-center text-status-rejected font-medium text-lg bg-status-rejected/5 px-8 py-6 rounded-2xl border border-status-rejected/10">
            У вас нет прав для просмотра этого раздела
          </div>
        </main>
      </div>
    );
  }

  // ОБНОВЛЕННЫЙ ПОРЯДОК ВКЛАДОК
  const TABS = ['Дивизионы', 'Персонал', 'Квалификации'];

  return (
    <div className="flex flex-col min-h-screen pb-12 relative">
      <Header title="Настройки лиги" actions={headerActions} />
      
      {toast && <div className="fixed top-[110px] right-10 z-[9999]"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <div className="px-10 pt-8 relative z-10 flex flex-col gap-8">
        <div className="bg-white/30 backdrop-blur-md rounded-xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 px-6 pt-4 pb-2 overflow-hidden">
          <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        <div className="w-full">
          {/* ИНДЕКСЫ ОБНОВЛЕНЫ СОГЛАСНО НОВОМУ ПОРЯДКУ */}
          {activeTab === 0 && <DivisionsTab setToast={setToast} setHeaderActions={setHeaderActions} />}
          {activeTab === 1 && <StaffTab setToast={setToast} />}
          {activeTab === 2 && <QualificationsTab setToast={setToast} />}
        </div>
      </div>
    </div>
  );
}