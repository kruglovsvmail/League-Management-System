import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom'; // useParams больше не нужен
import { getToken } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';
import { Loader } from '../../ui/Loader';
import { Stepper } from '../../ui/Stepper';
import { SegmentButton } from '../../ui/SegmentButton';
import { Switch } from '../../ui/Switch';
import { useAccess } from '../../hooks/useAccess';

const DISQUALIFICATION_MODES = [
  { value: 'light', label: 'Лайт' },
  { value: 'sdk', label: 'Через СДК' }
];

export function PreferencesTab({ setToast }) {
  const { selectedLeague } = useOutletContext(); // Берем ID лиги отсюда
  const { checkAccess } = useAccess();
  
  const canEdit = checkAccess('SETTINGS_DIVISIONS_EDIT');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    sec_access_before_hours: 12,
    sec_access_after_hours: 3,
    disqualification_mode: 'light',
    reserve_goalies_enabled: false,
    reserve_goalie_dq_games_enabled: true,
    reserve_goalie_own_dq_blocks: true
  });

  useEffect(() => {
    // Защита: если лиги еще нет, не делаем запрос
    if (!selectedLeague?.id) return; 

    const fetchPreferences = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/preferences`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (data.success && data.data) {
          setFormData({
            sec_access_before_hours: data.data.sec_access_before_hours ?? 12,
            sec_access_after_hours: data.data.sec_access_after_hours ?? 3,
            disqualification_mode: data.data.disqualification_mode ?? 'light',
            reserve_goalies_enabled: data.data.reserve_goalies_enabled ?? false,
            reserve_goalie_dq_games_enabled: data.data.reserve_goalie_dq_games_enabled ?? true,
            reserve_goalie_own_dq_blocks: data.data.reserve_goalie_own_dq_blocks ?? true
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPreferences();
  }, [selectedLeague?.id]); // Зависимость от ID лиги

  // ФУНКЦИЯ АВТОСОХРАНЕНИЯ
  const autoSave = async (updatedData) => {
    if (!selectedLeague?.id) return;

    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/preferences`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedData)
      });
      const data = await res.json();
      if (data.success) {
        if (selectedLeague) {
            selectedLeague.sec_access_before_hours = updatedData.sec_access_before_hours;
            selectedLeague.sec_access_after_hours = updatedData.sec_access_after_hours;
            selectedLeague.disqualification_mode = updatedData.disqualification_mode;
            selectedLeague.reserve_goalies_enabled = updatedData.reserve_goalies_enabled;
            selectedLeague.reserve_goalie_dq_games_enabled = updatedData.reserve_goalie_dq_games_enabled;
            selectedLeague.reserve_goalie_own_dq_blocks = updatedData.reserve_goalie_own_dq_blocks;
        }
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Автосохранение не удалось', type: 'error' });
    } finally {
      setTimeout(() => setIsSaving(false), 500); 
    }
  };

  const handleStepChange = (field, newVal) => {
    const newData = { ...formData, [field]: newVal };
    setFormData(newData);
    autoSave(newData);
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="flex flex-col gap-6 animate-zoom-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* БЛОК: ОГРАНИЧЕНИЯ ВРЕМЕНИ */}
        <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[160px] relative">
          
          {/* Индикатор сохранения */}
          {isSaving && (
            <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] font-bold text-orange uppercase tracking-widest animate-pulse">
              <div className="w-1.5 h-1.5 bg-orange rounded-full"></div>
              Синхронизация
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-1">
              <Icon name="time" className="w-4 h-4 text-graphite/40" />
              <h4 className="text-[13px] font-black uppercase text-graphite tracking-tight">Доступ секретариата</h4>
            </div>
            <p className="text-[11px] text-graphite-light leading-relaxed pr-8">
              Временные окна для редактирования протокола и назначения бригады
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-graphite/70">До начала (ч)</span>
              <Stepper 
                initialValue={formData.sec_access_before_hours} 
                min={0} 
                max={72} 
                onChange={(val) => handleStepChange('sec_access_before_hours', val)}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-graphite/70">После начала (ч)</span>
              <Stepper 
                initialValue={formData.sec_access_after_hours} 
                min={1} 
                max={24} 
                onChange={(val) => handleStepChange('sec_access_after_hours', val)}
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>

        {/* БЛОК: РЕЖИМ ДИСКВАЛИФИКАЦИЙ */}
        <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[160px]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Icon name="disqualifications" className="w-4 h-4 text-graphite/40" />
              <h4 className="text-[13px] font-black uppercase text-graphite tracking-tight">Дисквалификации</h4>
            </div>
            <p className="text-[11px] text-graphite-light leading-relaxed pr-8">
              Лайт — простой реестр банов. Через СДК — заседания комитета с решениями по нарушителям
            </p>
          </div>

          <div className="mt-6">
            <SegmentButton
              options={DISQUALIFICATION_MODES.map(m => m.label)}
              defaultIndex={DISQUALIFICATION_MODES.findIndex(m => m.value === formData.disqualification_mode)}
              onChange={(idx) => handleStepChange('disqualification_mode', DISQUALIFICATION_MODES[idx].value)}
              className={!canEdit ? 'pointer-events-none opacity-50' : ''}
            />
          </div>
        </div>

        {/* БЛОК: РЕЗЕРВНЫЕ ВРАТАРИ.
            Раскладка та же, что у соседних карточек: описание сверху, короткие
            подписи с контролами снизу. Развёрнутые пояснения — в подсказках,
            иначе длинный текст растягивает строку и перекашивает тумблер. */}
        <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[160px]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Icon name="swap" className="w-4 h-4 text-graphite/40" />
              <h4 className="text-[13px] font-black uppercase text-graphite tracking-tight">Резервные вратари</h4>
            </div>
            <p className="text-[11px] text-graphite-light leading-relaxed pr-8">
              Вратари на замену в дивизионе: секретарь вписывает такого в состав, если свой не вышел на матч
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold text-graphite/70">Использовать</span>
              <div className="shrink-0">
                <Switch
                  checked={formData.reserve_goalies_enabled}
                  onChange={(e) => handleStepChange('reserve_goalies_enabled', e.target.checked)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {/* Правила дисквалификаций нужны только при включённой механике */}
            {formData.reserve_goalies_enabled && (
              <>
                <div
                  className="flex items-center justify-between gap-3 animate-zoom-in"
                  title="Резервному вратарю можно назначить пропуск матчей. Отсчёт идёт по календарю той команды, за которую он выходил и получил наказание. Выключено — остаётся только денежный штраф."
                >
                  <span className="text-[11px] font-bold text-graphite/70 leading-snug">Наказывать матчами</span>
                  <div className="shrink-0">
                    <Switch
                      checked={formData.reserve_goalie_dq_games_enabled}
                      onChange={(e) => handleStepChange('reserve_goalie_dq_games_enabled', e.target.checked)}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div
                  className="flex items-center justify-between gap-3 animate-zoom-in"
                  title="Пока вратарь отбывает наказание, полученное в своей команде, его нельзя вписать резервным за другие. Выключено — такие наказания резервным выходам не мешают. Наказание, полученное именно резервным, закрывает его везде в любом случае."
                >
                  <span className="text-[11px] font-bold text-graphite/70 leading-snug">Дисквалификация закрывает резерв</span>
                  <div className="shrink-0">
                    <Switch
                      checked={formData.reserve_goalie_own_dq_blocks}
                      onChange={(e) => handleStepChange('reserve_goalie_own_dq_blocks', e.target.checked)}
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}