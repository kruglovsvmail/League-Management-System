import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom'; // useParams больше не нужен
import { getToken } from '../../utils/helpers';
import { Loader } from '../../ui/Loader';
import { Stepper } from '../../ui/Stepper';
import { Switch } from '../../ui/Switch';
import { Checkbox } from '../../ui/Checkbox';
import { SegmentButton } from '../../ui/SegmentButton';
import { useAccess } from '../../hooks/useAccess';
import { BroadcastAssetsSection } from './BroadcastAssetsSection';
import { SettingsCard } from './SettingsCard';

// Вид панели секретаря. Значения в базе исторические, названия для людей — другие:
// paper — «Классический»: ввод прямо в строки таблиц с клавиатуры, как в бумажном
// протоколе (см. ProtocolSheet); classic — «Модерн»: формы ввода над таблицами.
const PANEL_VIEWS = [
  { value: 'paper', label: 'Классический' },
  { value: 'classic', label: 'Модерн' },
];

// Время с таймера панели — по событиям, галочками в одну строку
const AUTO_TIME_FIELDS = [
  { field: 'sec_auto_time_goals', label: 'Голы' },
  { field: 'sec_auto_time_penalties', label: 'Удаления' },
  { field: 'sec_auto_time_goalie_log', label: 'Журнал вратарей' },
];

// Группа карточек по смыслу: подпись группы и под ней карточки парами
function SettingsGroup({ title, description, children }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[12px] font-black uppercase tracking-widest text-graphite/50">{title}</h3>
        {description && <p className="text-[12px] text-graphite-light mt-0.5">{description}</p>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">{children}</div>
    </section>
  );
}

// Строка настройки: название и пояснение слева, переключатель или поле справа.
// Пояснение видно сразу — раньше оно пряталось во всплывающую подсказку и его не находили.
// Длинный текст переносится в своей колонке и не сдвигает переключатель.
function SettingRow({ title, hint, divider = false, children }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${divider ? 'pt-3 border-t border-graphite/10' : ''}`}>
      <div className="min-w-0">
        <div className="text-[12px] font-bold text-graphite leading-snug">{title}</div>
        {hint && <div className="text-[11px] text-graphite-light leading-snug mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// Режима дисквалификаций здесь нет: его переключает только глобальный администратор
// (Команды → Лиги → Глобальные параметры).
export function PreferencesTab({ setToast }) {
  const { selectedLeague, onPatchSelectedLeague } = useOutletContext(); // Берем ID лиги отсюда
  const { checkAccess } = useAccess();
  
  const canEdit = checkAccess('SETTINGS_DIVISIONS_EDIT');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    sec_access_before_hours: 12,
    sec_access_after_hours: 3,
    equip_mark_ushk_enabled: false,
    equip_mark_ushk_max_age: 20,
    equip_mark_mouthguard_enabled: false,
    equip_mark_mouthguard_born_after: '1998-12-31',
    allow_match_jersey_change: false,
    allow_match_letters_change: false,
    sec_auto_time_goals: true,
    sec_auto_time_penalties: true,
    sec_auto_time_goalie_log: true,
    sec_panel_view: 'classic',
    sec_goalie_autofill: true,
    sec_penalty_release_on_goal: true,
    sec_penalty_manual_end: false,
    sec_coincident_penalties: true,
    sec_hide_time_adjust: false,
    protocol_esign_label: false
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
            equip_mark_ushk_enabled: data.data.equip_mark_ushk_enabled ?? false,
            equip_mark_ushk_max_age: data.data.equip_mark_ushk_max_age ?? 20,
            equip_mark_mouthguard_enabled: data.data.equip_mark_mouthguard_enabled ?? false,
            equip_mark_mouthguard_born_after: data.data.equip_mark_mouthguard_born_after ?? '1998-12-31',
            allow_match_jersey_change: data.data.allow_match_jersey_change ?? false,
            allow_match_letters_change: data.data.allow_match_letters_change ?? false,
            sec_auto_time_goals: data.data.sec_auto_time_goals ?? true,
            sec_auto_time_penalties: data.data.sec_auto_time_penalties ?? true,
            sec_auto_time_goalie_log: data.data.sec_auto_time_goalie_log ?? true,
            sec_panel_view: data.data.sec_panel_view ?? 'classic',
            sec_goalie_autofill: data.data.sec_goalie_autofill ?? true,
            sec_penalty_release_on_goal: data.data.sec_penalty_release_on_goal ?? true,
            sec_penalty_manual_end: data.data.sec_penalty_manual_end ?? false,
            sec_coincident_penalties: data.data.sec_coincident_penalties ?? true,
            sec_hide_time_adjust: data.data.sec_hide_time_adjust ?? false,
            protocol_esign_label: data.data.protocol_esign_label ?? false
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

  const toggle = (field) => (
    <Switch
      checked={formData[field]}
      onChange={(e) => handleStepChange(field, e.target.checked)}
      disabled={!canEdit}
    />
  );

  // Настройки разложены по смыслу: матч и протокол → панель секретаря → команды и
  // составы → трансляции. В группе карточки идут парами; у каждой настройки пояснение
  // видно сразу, а не во всплывающей подсказке — так страницу можно прочитать сверху вниз.
  return (
    <div className="flex flex-col gap-8 animate-zoom-in">

      {/* Форма сохраняется сама при каждом изменении — индикатор один на всю вкладку */}
      <div className="flex items-center justify-between gap-4 -mb-2">
        <p className="text-[12px] text-graphite-light">
          Изменения сохраняются сразу.
        </p>
        {isSaving && (
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange uppercase tracking-widest animate-pulse shrink-0">
            <div className="w-1.5 h-1.5 bg-orange rounded-full"></div>
            Сохранение
          </div>
        )}
      </div>

      {/* ── МАТЧ И ПРОТОКОЛ ── */}
      <SettingsGroup title="Матч и протокол" description="Когда бригада работает с матчем и как выглядит протокол">
        <SettingsCard
          icon="clock"
          title="Доступ к матчу"
          description="Судейская бригада, секретари и штат лиги работают с матчем только в этом окне. Руководство, админ и владелец лиги — в любое время."
        >
          <SettingRow
            title="Открывается за, часов"
            hint="Раньше этого срока до начала матча панель секретаря и протокол закрыты."
          >
            <Stepper
              initialValue={formData.sec_access_before_hours}
              min={0}
              max={72}
              onChange={(val) => handleStepChange('sec_access_before_hours', val)}
              disabled={!canEdit}
            />
          </SettingRow>
          <SettingRow
            title="Закрывается через, часов"
            hint="Столько часов после начала матча протокол ещё можно править. Подписанный секретарём протокол закрывается сразу — для всех, кроме владельца лиги."
          >
            <Stepper
              initialValue={formData.sec_access_after_hours}
              min={1}
              max={24}
              onChange={(val) => handleStepChange('sec_access_after_hours', val)}
              disabled={!canEdit}
            />
          </SettingRow>
        </SettingsCard>

        {/* Отметка декоративная: ничего не блокирует и в базу не пишется */}
        <SettingsCard
          icon="edit"
          title="Протокол матча"
          description="Для лиг, где судьи и секретарь не подписывают протокол ПИН-кодом."
        >
          <SettingRow
            title="«Подписано электронной подписью»"
            hint="В завершённых матчах эта надпись печатается под фамилиями главных судей и секретаря. Кто подписал ПИН-кодом — печатается со своей подписью. Уже закрытые протоколы от переключения не меняются."
          >
            {toggle('protocol_esign_label')}
          </SettingRow>
        </SettingsCard>
      </SettingsGroup>

      {/* ── ПАНЕЛЬ СЕКРЕТАРЯ ── */}
      <SettingsGroup title="Панель секретаря" description="Как секретарь вводит события во время матча">
        {/* Вид: логика та же, меняется только способ ввода голов, удалений и смен
            вратарей. Время: подставлять ли время таймера панели; без галочки секретарь
            вводит его сам, без времени событие не сохранить, а в журнале вратарей не
            нажать «+» */}
        <SettingsCard icon="stopwatch" title="Ввод событий">
          <div className="flex flex-col gap-2">
            <SegmentButton
              options={PANEL_VIEWS.map(v => v.label)}
              defaultIndex={Math.max(0, PANEL_VIEWS.findIndex(v => v.value === formData.sec_panel_view))}
              onChange={(idx) => handleStepChange('sec_panel_view', PANEL_VIEWS[idx].value)}
              className={!canEdit ? 'pointer-events-none opacity-50' : ''}
            />
            <p className="text-[11px] text-graphite-light leading-snug">
              Классический — ввод прямо в строки таблиц, как в бумажном протоколе. Модерн — формы ввода над таблицами.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-3 border-t border-graphite/10">
            <span className="text-[12px] font-bold text-graphite leading-snug">Время события — с таймера</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {AUTO_TIME_FIELDS.map(({ field, label }) => (
                <Checkbox
                  key={field}
                  className=""
                  label={<span className="text-[11px] font-bold text-graphite/70">{label}</span>}
                  checked={formData[field]}
                  onChange={(e) => handleStepChange(field, e.target.checked)}
                  disabled={!canEdit}
                />
              ))}
            </div>
            <p className="text-[11px] text-graphite-light leading-snug">
              Отмечено — новое событие сразу получает время таймера, секретарь может его поправить.
              Не отмечено — время вводится вручную, и без него событие не сохранится.
            </p>
          </div>

          <SettingRow
            divider
            title="Единственный вратарь — сразу в журнал"
            hint="Если у команды в составе на матч один вратарь, он сам встаёт в журнал вратарей на 0:00."
          >
            {toggle('sec_goalie_autofill')}
          </SettingRow>

          <SettingRow
            title="Скрыть корректировку времени"
            hint="Кнопки ±1 и ±10 секунд и правка времени на табло видны только владельцу лиги."
          >
            {toggle('sec_hide_time_adjust')}
          </SettingRow>
        </SettingsCard>

        <SettingsCard icon="whistle" title="Удаления" description="Как считаются штрафы в панели секретаря.">
          <SettingRow
            title="Досрочный выход после гола"
            hint="Гол в большинстве прекращает малый штраф — игрок выходит со скамейки сам. Выключено — штраф отсиживается полностью."
          >
            {toggle('sec_penalty_release_on_goal')}
          </SettingRow>

          <SettingRow
            title="Окончание удаления вручную"
            hint="Секретарь может вписать время окончания сам — не раньше начала штрафа. Пустое поле — считается автоматически. Выключено — только автоматически."
          >
            {toggle('sec_penalty_manual_end')}
          </SettingRow>

          <SettingRow
            title="Обоюдные удаления"
            hint="В окне штрафа появляется галочка «Обоюдное»: такой же штраф сам заводится второй команде, нарушителя и причину вписывают потом. Такие штрафы не дают большинства и голом не прекращаются."
          >
            {toggle('sec_coincident_penalties')}
          </SettingRow>
        </SettingsCard>
      </SettingsGroup>

      {/* ── КОМАНДЫ И СОСТАВЫ ── */}
      <SettingsGroup title="Команды и составы" description="Что команды могут менять сами и что видно в составах">
        <SettingsCard
          icon="roster"
          title={<>Состав на матч в TR</>}
          description="Выключено — номер и нашивки берутся из заявки на сезон, а команда видит пояснение вместо правки."
        >
          <SettingRow
            title="Менять игровой номер"
            hint="Команда может поставить игроку другой номер только на этот матч."
          >
            {toggle('allow_match_jersey_change')}
          </SettingRow>

          <SettingRow
            title="Назначать капитана и ассистентов"
            hint="Команда может выбрать на этот матч других капитана и ассистентов."
          >
            {toggle('allow_match_letters_change')}
          </SettingRow>
        </SettingsCard>

        {/* Маленькие буквы рядом с фамилией в составах */}
        <SettingsCard
          icon="jersey"
          title="Обозначения экипировки"
          description="Маленькие буквы рядом с фамилией в составах: в дивизионе, на странице матча и в панели секретаря. Возраст считается на сегодня."
        >
          {/* Код показываем тем же бейджем, каким он выглядит в составах, только крупнее —
              чтобы в настройке было видно ровно то, что увидят в списках игроков. */}
          <SettingRow
            title={(
              <span className="flex items-center gap-2.5">
                <span className="inline-flex items-center shrink-0 px-2 py-1 rounded-md bg-orange/10 text-orange text-[14px] font-black leading-none">ушк</span>
                уши, шея, капа
              </span>
            )}
            hint="Игроку нужна защита ушей и шеи, а также капа."
          >
            {toggle('equip_mark_ushk_enabled')}
          </SettingRow>

          {formData.equip_mark_ushk_enabled && (
            <SettingRow title="Кому: моложе, лет">
              <input
                type="number"
                min="1"
                max="99"
                value={formData.equip_mark_ushk_max_age}
                onChange={(e) => handleStepChange('equip_mark_ushk_max_age', Number(e.target.value) || 0)}
                disabled={!canEdit}
                className="w-[70px] shrink-0 px-2 py-1.5 rounded-md border border-graphite/20 bg-white text-[13px] font-bold text-graphite text-center outline-none focus:border-orange disabled:opacity-50"
              />
            </SettingRow>
          )}

          <SettingRow
            divider
            title={(
              <span className="flex items-center gap-2.5">
                <span className="inline-flex items-center shrink-0 px-2 py-1 rounded-md bg-orange/10 text-orange text-[14px] font-black leading-none">к</span>
                капа
              </span>
            )}
            hint="Игроку нужна капа."
          >
            {toggle('equip_mark_mouthguard_enabled')}
          </SettingRow>

          {formData.equip_mark_mouthguard_enabled && (
            <SettingRow title="Кому: рождённым после">
              <input
                type="date"
                value={formData.equip_mark_mouthguard_born_after}
                onChange={(e) => handleStepChange('equip_mark_mouthguard_born_after', e.target.value)}
                disabled={!canEdit}
                className="shrink-0 px-2 py-1.5 rounded-md border border-graphite/20 bg-white text-[12px] font-bold text-graphite outline-none focus:border-orange disabled:opacity-50"
              />
            </SettingRow>
          )}

          <p className="text-[11px] text-graphite-light leading-snug">
            Если игрок подпадает под оба правила, показывается только «ушк» — оно уже включает капу.
          </p>
        </SettingsCard>
      </SettingsGroup>

      {/* ── ТРАНСЛЯЦИИ ── эфирные файлы лиги: аудио-интро и три видео-заставки */}
      <SettingsGroup title="Трансляции" description="Файлы для эфирной графики лиги: интро и заставки">
        <BroadcastAssetsSection leagueId={selectedLeague?.id} canEdit={canEdit} setToast={setToast} />
      </SettingsGroup>
    </div>
  );
}
