import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom'; // useParams больше не нужен
import { getToken } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';
import { Loader } from '../../ui/Loader';
import { Stepper } from '../../ui/Stepper';
import { SegmentButton } from '../../ui/SegmentButton';
import { Switch } from '../../ui/Switch';
import { useAccess } from '../../hooks/useAccess';
import { BroadcastAssetsSection } from './BroadcastAssetsSection';

const DISQUALIFICATION_MODES = [
  { value: 'light', label: 'Лайт' },
  { value: 'sdk', label: 'Через СДК' }
];

export function PreferencesTab({ setToast }) {
  const { selectedLeague, onPatchSelectedLeague } = useOutletContext(); // Берем ID лиги отсюда
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
    reserve_goalie_own_dq_blocks: true,
    equip_mark_ushk_enabled: false,
    equip_mark_ushk_max_age: 20,
    equip_mark_mouthguard_enabled: false,
    equip_mark_mouthguard_born_after: '1998-12-31',
    allow_match_jersey_change: false,
    allow_match_letters_change: false
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
            reserve_goalie_own_dq_blocks: data.data.reserve_goalie_own_dq_blocks ?? true,
            equip_mark_ushk_enabled: data.data.equip_mark_ushk_enabled ?? false,
            equip_mark_ushk_max_age: data.data.equip_mark_ushk_max_age ?? 20,
            equip_mark_mouthguard_enabled: data.data.equip_mark_mouthguard_enabled ?? false,
            equip_mark_mouthguard_born_after: data.data.equip_mark_mouthguard_born_after ?? '1998-12-31',
            allow_match_jersey_change: data.data.allow_match_jersey_change ?? false,
            allow_match_letters_change: data.data.allow_match_letters_change ?? false
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
        // Раньше поля правились прямо в объекте лиги, по одному перечисленному вручную.
        // Новая настройка в этот список не попадала и подхватывалась только после F5 —
        // теперь отдаём весь набор в состояние приложения (см. patchSelectedLeague в App).
        onPatchSelectedLeague?.(updatedData);
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

        {/* БЛОК: ОБОЗНАЧЕНИЯ ЭКИПИРОВКИ — маленькие буквы рядом с фамилией в составах */}
        <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[160px] relative">
          <div>
            <h3 className="text-[13px] font-black uppercase text-graphite tracking-wide">Обозначения экипировки</h3>
            <p className="text-[11px] text-graphite-light mt-1 leading-snug">
              Маленькие буквы рядом с фамилией в составах: в дивизионе, на странице матча и в панели секретаря.
              Возраст считается на сегодня.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3" title="Игроку нужна защита ушей и шеи, а также капа">
              {/* Код показываем тем же бейджем, каким он выглядит в составах, только крупнее —
                  чтобы в настройке было видно ровно то, что увидят в списках игроков. */}
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center shrink-0 px-2 py-1 rounded-md bg-orange/10 text-orange text-[14px] font-black leading-none">
                  ушк
                </span>
                <span className="text-[11px] font-bold text-graphite/70 leading-snug">уши, шея, капа</span>
              </span>
              <div className="shrink-0">
                <Switch
                  checked={formData.equip_mark_ushk_enabled}
                  onChange={(e) => handleStepChange('equip_mark_ushk_enabled', e.target.checked)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {formData.equip_mark_ushk_enabled && (
              <div className="flex items-center justify-between gap-3 animate-zoom-in">
                <span className="text-[11px] font-bold text-graphite/70 leading-snug">Кому: моложе, лет</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={formData.equip_mark_ushk_max_age}
                  onChange={(e) => handleStepChange('equip_mark_ushk_max_age', Number(e.target.value) || 0)}
                  disabled={!canEdit}
                  className="w-[70px] shrink-0 px-2 py-1.5 rounded-md border border-graphite/20 bg-white text-[13px] font-bold text-graphite text-center outline-none focus:border-orange disabled:opacity-50"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-graphite/10" title="Игроку нужна капа">
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center shrink-0 px-2 py-1 rounded-md bg-orange/10 text-orange text-[14px] font-black leading-none">
                  к
                </span>
                <span className="text-[11px] font-bold text-graphite/70 leading-snug">капа</span>
              </span>
              <div className="shrink-0">
                <Switch
                  checked={formData.equip_mark_mouthguard_enabled}
                  onChange={(e) => handleStepChange('equip_mark_mouthguard_enabled', e.target.checked)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {formData.equip_mark_mouthguard_enabled && (
              <div className="flex items-center justify-between gap-3 animate-zoom-in">
                <span className="text-[11px] font-bold text-graphite/70 leading-snug">Кому: рождённым после</span>
                <input
                  type="date"
                  value={formData.equip_mark_mouthguard_born_after}
                  onChange={(e) => handleStepChange('equip_mark_mouthguard_born_after', e.target.value)}
                  disabled={!canEdit}
                  className="shrink-0 px-2 py-1.5 rounded-md border border-graphite/20 bg-white text-[12px] font-bold text-graphite outline-none focus:border-orange disabled:opacity-50"
                />
              </div>
            )}

            <p className="text-[11px] text-graphite-light leading-snug">
              Если игрок подпадает под оба правила, показывается только «ушк» — оно уже включает капу.
            </p>
          </div>
        </div>

        {/* БЛОК: ПРАВА КОМАНДЫ НА МАТЧ — что команда может менять в формации в Team-Room */}
        <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[160px] relative">
          <div>
            <h3 className="text-[13px] font-black uppercase text-graphite tracking-wide">Состав на матч</h3>
            <p className="text-[11px] text-graphite-light mt-1 leading-snug">
              Что команда вправе менять в формации на матч в приложении Team&nbsp;Room. Выключено —
              номер и нашивки берутся из заявки на сезон, а вместо шторки правки команда видит пояснение.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3" title="Команда сможет поставить игроку другой номер именно на этот матч">
              <span className="text-[11px] font-bold text-graphite/70 leading-snug">Разрешить менять игровой номер</span>
              <div className="shrink-0">
                <Switch
                  checked={formData.allow_match_jersey_change}
                  onChange={(e) => handleStepChange('allow_match_jersey_change', e.target.checked)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3" title="Команда сможет назначить на этот матч другого капитана и ассистентов">
              <span className="text-[11px] font-bold text-graphite/70 leading-snug">Разрешить назначать капитана и ассистента</span>
              <div className="shrink-0">
                <Switch
                  checked={formData.allow_match_letters_change}
                  onChange={(e) => handleStepChange('allow_match_letters_change', e.target.checked)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>
        </div>

        {/* БЛОК: ТРАНСЛЯЦИИ — эфирные файлы лиги: аудио-интро и три видео-заставки. */}
        <BroadcastAssetsSection leagueId={selectedLeague?.id} canEdit={canEdit} setToast={setToast} />

      </div>
    </div>
  );
}