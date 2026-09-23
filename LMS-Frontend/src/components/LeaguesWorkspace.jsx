import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Table } from '../ui/Table2';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { ConfirmModal } from '../modals/ConfirmModal';
import { getImageUrl, getToken } from '../utils/helpers';
import { Icon } from '../ui/Icon';
import { Switch } from '../ui/Switch';
import { SegmentButton } from '../ui/SegmentButton';
import { ArenaAnnouncerSection } from './ArenaAnnouncerSection';
import { SettingsCard } from './Settings/SettingsCard';

/**
 * Вкладка «Лиги» раздела управления командами (только глобальный админ).
 *
 * Здесь три блока. Первый — владельцы лиги. Владелец стоит выше любой штатной роли:
 * внутри своей лиги ему можно всё, включая правку матчей вне окна управления, состава
 * заявки вне заявочной кампании и смену статуса заявки в любом её состоянии. За пределы
 * лиги права не выходят: разделы платформы остаются за глобальным администратором.
 *
 * Владельцев у лиги сколько угодно. В самой лиге факт владения нигде не подписывается —
 * штат про владельцев не знает, они просто всё могут.
 *
 * Второй блок — глобальные параметры лиги: настройки, которые не отдаются руководству
 * лиги на вкладке «Параметры». Сейчас их два: «Состав заявки из общей базы»
 * (leagues.league_roster_global_search) — меняет правила работы с чужими данными (общая
 * база пользователей, составы команд), и режим дисквалификаций (leagues.disqualification_mode),
 * перенесённый сюда с вкладки «Параметры».
 *
 * Третий — диктор арены: звуки лиги и сценарий бипа (см. ArenaAnnouncerSection).
 */

const DISQUALIFICATION_MODES = [
  { value: 'light', label: 'Лайт' },
  { value: 'sdk', label: 'Через СДК' }
];

const formatPhoneDisplay = (raw) => {
  if (!raw) return '-';
  const cleaned = raw.replace(/\D/g, '');
  const match = cleaned.match(/^(7|8)?(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (match) return `+7 (${match[2]}) ${match[3]}-${match[4]}-${match[5]}`;
  return raw;
};

const formatPhoneDynamic = (raw) => {
  if (!raw) return '';
  let res = '';
  if (raw.length > 0) res += '(' + raw.substring(0, 3);
  if (raw.length >= 4) res += ') ' + raw.substring(3, 6);
  if (raw.length >= 7) res += '-' + raw.substring(6, 8);
  if (raw.length >= 9) res += '-' + raw.substring(8, 10);
  return res;
};

const fullName = (p) => `${p.last_name || ''} ${p.first_name || ''}`.trim() || 'Без имени';

export function LeaguesWorkspace({ showToast, selectedLeague, onSelectLeague }) {
  const { user, onPatchLeague } = useOutletContext();

  // Список лиг берём из профиля: глобальному админу он приходит целиком,
  // а в этот раздел никто, кроме него, не попадает.
  const leagues = user?.leagues || [];

  const [owners, setOwners] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [phoneRaw, setPhoneRaw] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Глобальные параметры лиги. null — ещё не загружены: переключатели до ответа не рисуем,
  // иначе они мигнут не тем значением у лиги, где параметр включён.
  const [globalParams, setGlobalParams] = useState(null);
  // Какой параметр сейчас сохраняется: индикатор горит только на его карточке, а
  // переключатели обеих карточек на это время заблокированы.
  const [savingParam, setSavingParam] = useState(null);

  const authHeaders = { 'Authorization': `Bearer ${getToken()}` };
  const baseUrl = `${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague?.id}/owners`;
  const paramsUrl = `${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague?.id}/global-params`;

  // Выбор лиги хранит страница: кнопка возврата у неё в шапке. Здесь только сбрасываем
  // то, что относится к прежней лиге.
  const selectLeague = (league) => {
    setOwners([]);
    setPhoneRaw('');
    setFoundUser(null);
    setGlobalParams(null);
    onSelectLeague?.(league);
  };

  useEffect(() => {
    if (!selectedLeague?.id) return;
    let cancelled = false;

    fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/global-params`, { headers: authHeaders })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success) setGlobalParams(data.data || {});
        else showToast?.('Ошибка', data.error, 'error');
      })
      .catch(() => { if (!cancelled) showToast?.('Ошибка', 'Сбой загрузки параметров лиги', 'error'); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.id]);

  // Параметр сохраняется сразу, без отдельной кнопки — как параметры на вкладке лиги.
  // Шлём только изменённое поле: сервер остальные не трогает.
  const handleParamChange = async (field, value) => {
    const prev = globalParams;
    if (prev?.[field] === value) return;
    setGlobalParams({ ...prev, [field]: value });
    setSavingParam(field);
    try {
      const res = await fetch(paramsUrl, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      const data = await res.json();
      if (data.success) {
        const saved = data.data || { ...prev, [field]: value };
        setGlobalParams(saved);
        // Режим дисквалификаций лежит ещё и в профиле: по нему меню показывает «Заседания
        // СДК», а страница дисквалификаций выбирает свой вид. Правим профиль сразу, без F5.
        if (field === 'disqualification_mode') {
          onPatchLeague?.(selectedLeague.id, { disqualification_mode: saved.disqualification_mode });
        }
      } else {
        setGlobalParams(prev);
        showToast?.('Ошибка', data.error, 'error');
      }
    } catch (err) {
      setGlobalParams(prev);
      showToast?.('Ошибка', 'Не удалось сохранить параметр', 'error');
    } finally {
      setSavingParam(null);
    }
  };

  useEffect(() => {
    if (!selectedLeague?.id) return;
    let cancelled = false;

    setIsLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/owners`, { headers: authHeaders })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success) setOwners(data.owners || []);
        else showToast?.('Ошибка', data.error, 'error');
      })
      .catch(() => { if (!cancelled) showToast?.('Ошибка', 'Сбой загрузки владельцев', 'error'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.id]);

  // Поиск ровно как в «Персонале»: по полному номеру телефона, он же логин в системе
  const handlePhoneChange = async (e) => {
    const val = e.target.value.replace(/\D/g, '');
    const truncated = val.slice(0, 10);
    setPhoneRaw(truncated);

    if (truncated.length !== 10) {
      setFoundUser(null);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/lookup?phone=${encodeURIComponent('+7' + truncated)}`, {
        headers: authHeaders
      });
      const data = await res.json();

      if (data.success && data.user) {
        if (owners.some(o => o.user_id === data.user.id)) {
          setFoundUser(null);
          showToast?.('Внимание', 'Этот пользователь уже владелец лиги', 'info');
        } else {
          setFoundUser(data.user);
        }
      } else {
        setFoundUser(null);
        showToast?.('Не найдено', 'Пользователь не зарегистрирован', 'info');
      }
    } catch (err) {
      showToast?.('Ошибка', 'Сбой поиска', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAssign = async () => {
    if (!foundUser) return;
    setIsAssigning(true);
    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: foundUser.id })
      });
      const data = await res.json();
      if (data.success) {
        setOwners(data.owners || []);
        setPhoneRaw('');
        setFoundUser(null);
        showToast?.('Успешно', 'Владелец лиги назначен', 'success');
      } else {
        showToast?.('Ошибка', data.error, 'error');
      }
    } catch (err) {
      showToast?.('Ошибка', 'Сбой назначения', 'error');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemove = async () => {
    if (!pendingRemove) return;
    setIsRemoving(true);
    try {
      const res = await fetch(`${baseUrl}/${pendingRemove.user_id}`, { method: 'DELETE', headers: authHeaders });
      const data = await res.json();
      if (data.success) {
        setOwners(data.owners || []);
        setPendingRemove(null);
        showToast?.('Успешно', 'Владелец лиги снят', 'success');
      } else {
        showToast?.('Ошибка', data.error, 'error');
      }
    } catch (err) {
      showToast?.('Ошибка', 'Сбой снятия', 'error');
    } finally {
      setIsRemoving(false);
    }
  };

  // ── Выбор лиги ──
  if (!selectedLeague) {
    return (
      <div className="flex flex-col gap-6 animate-zoom-in">
        <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6">
          <div className="mb-6 pb-4 border-b border-graphite/10">
            <h3 className="text-[16px] font-black uppercase text-graphite tracking-wide">Лиги платформы</h3>
            <p className="text-[12px] font-medium text-graphite-light mt-1">Выберите лигу, чтобы управлять её владельцами</p>
          </div>

          {leagues.length === 0 ? (
            <div className="text-center py-16 text-graphite-light font-medium">Лиги не найдены</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {leagues.map(league => (
                <button
                  key={league.id}
                  onClick={() => selectLeague(league)}
                  className="flex items-center gap-4 p-4 bg-white rounded-lg border border-graphite/10 text-left cursor-pointer transition-all duration-300 hover:border-orange/40 hover:shadow-md"
                >
                  <div className="w-14 h-14 rounded-lg bg-graphite/5 flex items-center justify-center shrink-0 p-1.5">
                    <img
                      src={league.logo_url ? getImageUrl(league.logo_url) : '/img/Logo_league_default.webp'}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <span className="block font-bold text-graphite text-[15px] truncate">{league.name}</span>
                    <span className="block text-[12px] text-graphite-light mt-0.5 truncate">{league.city || 'Город не указан'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const columns = [
    { label: 'Фото', width: 'text-center w-16', render: (row) => (
        <div className="w-[40px] h-[40px] rounded-md overflow-hidden bg-graphite/5 border border-graphite/10 inline-block">
          <img src={getImageUrl(row.avatar_url || '/default/user_default.webp')} className="w-full h-full object-cover" alt="avatar" />
        </div>
    )},
    { label: 'ФИО', sortKey: 'last_name', render: (row) => (
      <div className="flex flex-col text-left">
        <span className="font-bold text-[14px] text-graphite leading-tight block truncate">{fullName(row)}</span>
        {row.middle_name && <span className="text-[12px] text-graphite-light block truncate mt-0.5">{row.middle_name}</span>}
      </div>
    )},
    { label: 'Телефон', sortKey: 'phone', width: 'w-[160px]', render: (row) => (
      <span className="font-semibold text-graphite-light">{formatPhoneDisplay(row.phone)}</span>
    )},
    { label: '', width: 'w-12', align: 'center', render: (row) => (
      <button
        onClick={() => setPendingRemove(row)}
        className="p-2 text-graphite-light hover:text-status-rejected hover:bg-status-rejected/10 rounded-lg transition-colors cursor-pointer"
        title="Снять владельца"
      >
        <Icon name="delete" className="w-5 h-5" />
      </button>
    )}
  ];

  // ── Карточка выбранной лиги ──
  return (
    <div className="flex flex-col gap-6 animate-zoom-in">
      <div className="flex items-center gap-4 bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-5">
        <div className="w-16 h-16 rounded-lg bg-graphite/5 flex items-center justify-center shrink-0 p-2">
          <img
            src={selectedLeague.logo_url ? getImageUrl(selectedLeague.logo_url) : '/img/Logo_league_default.webp'}
            alt=""
            className="w-full h-full object-contain"
          />
        </div>
        <div className="min-w-0">
          <span className="block font-black text-graphite text-[18px] truncate">{selectedLeague.name}</span>
          <span className="block text-[12px] text-graphite-light mt-0.5">{selectedLeague.city || 'Город не указан'}</span>
        </div>
      </div>

      {/* ГЛОБАЛЬНЫЕ ПАРАМЕТРЫ ЛИГИ — раскладка карточек та же, что на вкладке «Параметры» лиги */}
      <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6">
        <div className="mb-5 pb-4 border-b border-graphite/10">
          <h3 className="text-[16px] font-black uppercase text-graphite tracking-wide">Глобальные параметры</h3>
          <p className="text-[12px] font-medium text-graphite-light mt-1">Настройки, которые меняет только глобальный администратор. Руководству лиги они не показываются</p>
        </div>

        {/* Карточки те же, что на вкладке «Параметры» лиги (см. SettingsCard) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          <SettingsCard
            icon="user_plus"
            title="Состав заявки из общей базы"
            description="В дивизионах, где состав заявки ведёт лига, шторка «Состав заявки» ищет игроков по всем пользователям платформы, а не по игровому составу команды. Найденного вне команды сервер сам добавляет в команду и её игровой состав (первый свободный номер, нападающий), а владельцы и руководитель команды получают push и окно с подробностями в Team-Room. Представители по-прежнему выбираются из штаба команды."
            saving={savingParam === 'league_roster_global_search'}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold text-graphite/70">Использовать</span>
              <div className="shrink-0">
                {globalParams ? (
                  <Switch
                    checked={!!globalParams.league_roster_global_search}
                    onChange={(e) => handleParamChange('league_roster_global_search', e.target.checked)}
                    disabled={!!savingParam}
                  />
                ) : (
                  <div className="w-[40px] h-[22px] rounded-pill bg-graphite/10 animate-pulse" />
                )}
              </div>
            </div>
          </SettingsCard>

          {/* РЕЖИМ ДИСКВАЛИФИКАЦИЙ — раньше был на вкладке «Параметры» лиги */}
          <SettingsCard
            icon="disqualifications"
            title="Дисквалификации"
            description="Лайт — простой реестр банов. Через СДК — заседания комитета с решениями по нарушителям"
            saving={savingParam === 'disqualification_mode'}
          >
            {globalParams ? (
              <SegmentButton
                options={DISQUALIFICATION_MODES.map(m => m.label)}
                defaultIndex={Math.max(0, DISQUALIFICATION_MODES.findIndex(m => m.value === globalParams.disqualification_mode))}
                onChange={(idx) => handleParamChange('disqualification_mode', DISQUALIFICATION_MODES[idx].value)}
                className={savingParam ? 'pointer-events-none opacity-50' : ''}
              />
            ) : (
              <div className="h-[36px] rounded-md bg-graphite/10 animate-pulse" />
            )}
          </SettingsCard>
        </div>
      </div>

      {/* ДИКТОР АРЕНЫ — key пересоздаёт блок при смене лиги: звуки и сценарий прежней не мелькают */}
      <ArenaAnnouncerSection key={selectedLeague.id} leagueId={selectedLeague.id} showToast={showToast} />

      <div className="flex flex-col lg:flex-row gap-8 items-start">

        {/* ЛЕВАЯ КОЛОНКА (ТАБЛИЦА) */}
        <div className="flex-1 w-full bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 min-h-[400px] relative order-2 lg:order-1">
          <div className="flex justify-between items-center gap-4 mb-6 pb-4 border-b border-graphite/10">
            <div className="min-w-0">
              <h3 className="text-[16px] font-black uppercase text-graphite tracking-wide">Владельцы лиги</h3>
              <p className="text-[12px] font-medium text-graphite-light mt-1">Полный доступ ко всем разделам лиги без ограничений по срокам и статусам</p>
            </div>

            <div className="bg-graphite/5 text-graphite/60 px-3 py-1.5 rounded-md text-[13px] font-black whitespace-nowrap shrink-0">
              {owners.length} чел.
            </div>
          </div>

          {isLoading && (
            <div className="absolute inset-0 z-30 flex items-start pt-28 justify-center pointer-events-none">
              <Loader text="" />
            </div>
          )}

          <div className={`transition-opacity duration-300 ease-in-out ${isLoading ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            {owners.length > 0 ? (
              <Table columns={columns} data={owners} />
            ) : (
              <div className="text-center py-20 text-graphite-light font-medium">У лиги пока нет владельцев</div>
            )}
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА (ФОРМА НАЗНАЧЕНИЯ) */}
        <div className="w-full lg:w-[420px] shrink-0 bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 flex flex-col gap-5 sticky top-[100px] order-1 lg:order-2">
          <span className="text-[14px] font-black text-graphite uppercase tracking-wide border-b border-graphite/10 pb-4">Назначить владельца</span>

          <div className="flex flex-col w-full">
            <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Номер телефона</span>
            <div className="relative flex items-center w-full border border-graphite/40 rounded-md bg-white/70 transition-all duration-300 focus-within:border-orange focus-within:shadow-[0_0_0_3px_rgba(255,122,0,0.2)]">
              <div className="pl-4 pr-2 text-graphite font-semibold border-r border-graphite/10 py-2.5">+7</div>
              <input
                type="tel"
                value={formatPhoneDynamic(phoneRaw)}
                onChange={handlePhoneChange}
                placeholder="(999) 123-45-67"
                className="flex-1 px-3 py-2.5 bg-transparent outline-none text-graphite font-semibold"
              />
              {/* Loader тут не годится: у него собственная min-h-[250px] и он разорвал бы поле */}
              {isSearching && <div className="mr-3 w-4 h-4 shrink-0 rounded-full border-2 border-graphite/20 border-t-orange animate-spin" />}
            </div>
            <p className="text-[11px] text-graphite-light mt-2">Владелец не обязан состоять в штате лиги. Владельцев может быть сколько угодно.</p>
          </div>

          {foundUser && (
            <div className="flex items-center gap-4 p-4 bg-white rounded-md border border-graphite/10 animate-zoom-in">
              <img
                src={getImageUrl(foundUser.avatar_url || '/default/user_default.webp')}
                className="w-12 h-12 object-cover rounded-md bg-graphite/5 shrink-0"
                alt="avatar"
              />
              <div className="min-w-0">
                <span className="block font-bold text-graphite text-[14px] truncate">{fullName(foundUser)}</span>
                <span className="block text-[11px] text-graphite-light mt-0.5">{formatPhoneDisplay(foundUser.phone)}</span>
              </div>
            </div>
          )}

          <div className="p-4 bg-orange/10 border border-orange/30 rounded-md">
            <p className="text-[13px] font-bold text-orange leading-tight">
              Владелец получает полный доступ ко всем разделам этой лиги: сроки, окна управления матчем
              и статусы заявок его не останавливают. Права за пределами лиги ему не выдаются.
            </p>
          </div>

          <Button
            onClick={handleAssign}
            isLoading={isAssigning}
            disabled={!foundUser || isAssigning}
            className={`w-full py-3 transition-all duration-300 ${!foundUser ? 'opacity-50 grayscale' : ''}`}
          >
            Назначить владельцем
          </Button>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!pendingRemove}
        onClose={() => setPendingRemove(null)}
        onConfirm={handleRemove}
        isLoading={isRemoving}
        title="Снять владельца лиги?"
        message={pendingRemove ? `${fullName(pendingRemove)} потеряет полный доступ к лиге. Штатные роли, если они у него есть, останутся.` : ''}
        confirmLabel="Снять"
        confirmingLabel="Снимаем..."
      />
    </div>
  );
}
