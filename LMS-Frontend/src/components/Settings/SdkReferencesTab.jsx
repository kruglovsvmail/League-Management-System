import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { SegmentButton } from '../../ui/SegmentButton';
import { Select } from '../../ui/Select';
import { AccessFallback } from '../../ui/AccessFallback';
import { SdkVenuesSection } from '../Sdk/SdkVenuesSection';
import { SdkCommissionMembersSection } from '../Sdk/SdkCommissionMembersSection';
import { SdkViolationTypesSection } from '../Sdk/SdkViolationTypesSection';
import { getToken } from '../../utils/helpers';

const SECTIONS = ['Места проведения', 'Члены СДК', 'Таблица штрафов'];

export function SdkReferencesTab({ setToast }) {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  const canView = checkAccess('SDK_REFERENCES_VIEW');
  const canManage = checkAccess('SDK_REFERENCES_MANAGE');

  const [activeSection, setActiveSection] = useState(0);
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');

  useEffect(() => {
    if (!selectedLeague?.id) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/seasons`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSeasons(data.data);
          setSeasonId(data.data.find(s => s.is_active)?.id || data.data[0]?.id || '');
        }
      });
  }, [selectedLeague?.id]);

  if (!canView) {
    return <AccessFallback variant="full" message="У вас нет прав для просмотра справочников СДК." />;
  }

  return (
    <div className="flex flex-col gap-6 animate-zoom-in">
      {!canManage && (
        <AccessFallback variant="readonly" message="У вас нет прав для управления справочниками СДК. Вы находитесь в режиме просмотра." />
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <SegmentButton
          options={SECTIONS}
          defaultIndex={activeSection}
          onChange={setActiveSection}
          className="w-[640px] max-w-full shrink-0"
        />
        <div className="w-[180px] shrink-0">
          <Select options={seasons.map(s => ({ value: s.id, label: s.name }))} value={seasonId} onChange={setSeasonId} placeholder="Сезон" />
        </div>
      </div>

      {activeSection === 0 && <SdkVenuesSection seasonId={seasonId} setToast={setToast} />}
      {activeSection === 1 && <SdkCommissionMembersSection seasonId={seasonId} setToast={setToast} />}
      {activeSection === 2 && <SdkViolationTypesSection seasonId={seasonId} setToast={setToast} />}
    </div>
  );
}
