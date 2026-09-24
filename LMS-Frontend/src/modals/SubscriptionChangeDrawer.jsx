import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Calendar } from '../ui/Calendar';
import { Checkbox } from '../ui/Checkbox';
import { SegmentButton } from '../ui/SegmentButton';
import { ConfirmModal } from './ConfirmModal';
import { getImageUrl, getAuthHeaders } from '../utils/helpers';
import {
  describeExpiry, describeTarget, EXPIRY_TONE, endOfDayIso, peopleLabel,
} from '../utils/subscriptionStatus';

const API = import.meta.env.VITE_API_URL;

const MODES = ['selected', 'filter', 'teams'];
const MODE_LABELS = ['Отмеченные', 'По фильтру', 'По командам'];
const ACTIONS = ['extend', 'set', 'disable'];
const ACTION_LABELS = ['Продлить', 'Дата окончания', 'Отключить'];
const UNITS = ['months', 'days'];
const UNIT_LABELS = ['Месяцев', 'Дней'];
// Потолки те же, что на сервере (subscriptionsController, MAX_EXTEND)
const MAX_AMOUNT = { months: 120, days: 3660 };

const QUICK_EXTENDS = [
  { label: '1 мес.', amount: 1, unit: 'months' },
  { label: '3 мес.', amount: 3, unit: 'months' },
  { label: '6 мес.', amount: 6, unit: 'months' },
  { label: '1 год', amount: 12, unit: 'months' },
];

const sectionTitle = 'text-[12px] font-bold text-graphite-light uppercase tracking-wide';

/**
 * Шторка «Изменить подписку»: кому (отмеченным, всем по фильтру, составу команд), что
 * сделать (продлить, поставить дату окончания, отключить) и комментарий в журнал.
 *
 * Пока настройки меняются, сервер считает предпросмотр — сколько людей затронет и у
 * скольких дата станет раньше. Применяется только после подтверждения; каждая операция
 * пишется в журнал и оттуда отменяется.
 */
export function SubscriptionChangeDrawer({ isOpen, initialMode, onClose, selectedPeople = [], filter, filterCount, teams = [], onApplied, showToast }) {
  const [mode, setMode] = useState(initialMode);
  const [teamIds, setTeamIds] = useState(() => new Set());
  const [includeStaff, setIncludeStaff] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');

  const [action, setAction] = useState('extend');
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState('months');
  const [untilDate, setUntilDate] = useState(null);
  const [noShorten, setNoShorten] = useState(true);
  const [comment, setComment] = useState('');

  const [preview, setPreview] = useState(null); // { total, changed, shortened, shortened_paid }
  const [previewError, setPreviewError] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const previewSeqRef = useRef(0);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Каждое открытие — с чистого листа, «кому» — тем, откуда шторку открыли
  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setTeamIds(new Set());
    setIncludeStaff(false);
    setTeamSearch('');
    setAction('extend');
    setAmount('1');
    setUnit('months');
    setUntilDate(null);
    setNoShorten(true);
    setComment('');
    setPreview(null);
    setPreviewError('');
    setConfirmOpen(false);
  }, [isOpen, initialMode]);

  // Отмеченные и фильтр приходят новыми массивом и объектом на каждую перерисовку страницы —
  // сравниваем их по содержимому, иначе предпросмотр пересчитывался бы без причины
  const selectedKey = selectedPeople.map(p => p.id).join(',');
  const target = useMemo(() => {
    if (mode === 'selected') return selectedKey ? { type: 'users', userIds: selectedKey.split(',').map(Number) } : null;
    if (mode === 'filter') return filterCount ? { type: 'filter', filter } : null;
    return teamIds.size > 0 ? { type: 'teams', teamIds: [...teamIds], includeStaff } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedKey, filterCount, filter?.status, filter?.type, filter?.teamId, filter?.q, teamIds, includeStaff]);

  const actionBody = useMemo(() => {
    if (action === 'extend') {
      const n = Number(amount);
      if (!Number.isInteger(n) || n < 1 || n > MAX_AMOUNT[unit]) return null;
      return { type: 'extend', amount: n, unit };
    }
    if (action === 'set') return untilDate ? { type: 'set', until: endOfDayIso(untilDate), noShorten } : null;
    return { type: 'disable' };
  }, [action, amount, unit, untilDate, noShorten]);

  // Предпросмотр — с задержкой, пока настройки ещё меняются; устаревшие ответы отбрасываем
  useEffect(() => {
    if (!isOpen) return;
    const seq = ++previewSeqRef.current;
    setPreview(null);
    setPreviewError('');
    if (!target || !actionBody) {
      setIsPreviewLoading(false);
      return;
    }
    setIsPreviewLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/api/subscriptions/preview`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ target, action: actionBody }),
        });
        const json = await res.json();
        if (seq !== previewSeqRef.current) return;
        if (json.success) setPreview(json);
        else setPreviewError(json.error || 'Не удалось посчитать');
      } catch (err) {
        if (seq === previewSeqRef.current) setPreviewError('Сбой связи с сервером');
      } finally {
        if (seq === previewSeqRef.current) setIsPreviewLoading(false);
      }
    }, 350);
    return () => clearTimeout(timeout);
  }, [isOpen, target, actionBody]);

  const apply = async () => {
    setIsApplying(true);
    try {
      const res = await fetch(`${API}/api/subscriptions/apply`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ target, action: actionBody, comment }),
      });
      const json = await res.json();
      setConfirmOpen(false);
      if (!json.success) {
        showToast?.('Ошибка', json.error || 'Не удалось изменить подписку');
        return;
      }
      if (json.changed > 0) showToast?.('Готово', `Подписка изменена: ${peopleLabel(json.changed)}. Операцию можно отменить в журнале.`, 'success');
      else showToast?.('Ничего не изменилось', 'Ни у кого из выбранных дата не поменялась бы', 'info');
      onApplied?.();
    } catch (err) {
      console.error('Ошибка изменения подписок:', err);
      setConfirmOpen(false);
      showToast?.('Ошибка', 'Сбой связи с сервером');
    } finally {
      setIsApplying(false);
    }
  };

  const toggleTeam = (id) => setTeamIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const visibleTeams = teams.filter(t => `${t.name} ${t.city || ''}`.toLowerCase().includes(teamSearch.trim().toLowerCase()));
  const filterTeamName = teams.find(t => t.id === filter?.teamId)?.name || null;
  const canApply = !!preview && preview.changed > 0 && !isPreviewLoading && !isApplying;

  const confirmMessage = preview ? [
    `Изменить подписку у ${peopleLabel(preview.changed)}?`,
    preview.shortened > 0
      ? `У ${peopleLabel(preview.shortened)} дата станет раньше${preview.shortened_paid > 0 ? `, из них ${preview.shortened_paid} платили сами` : ''}.`
      : null,
    'Операцию можно будет отменить в журнале.',
  ].filter(Boolean).join(' ') : '';

  const drawerContent = (
    <div className={`fixed inset-0 z-[35] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className={`absolute top-0 right-0 h-full w-full max-w-[1100px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite tracking-wide uppercase">Изменить подписку</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="flex-1 p-6 md:p-8 overflow-hidden flex gap-8">

          {/* Левая колонка: что сделать */}
          <div className="w-[380px] shrink-0 flex flex-col gap-5">
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-5">

              <div className="flex flex-col gap-3 bg-white p-5 rounded-2xl border border-graphite/10 shadow-sm">
                <span className={sectionTitle}>Кому</span>
                <SegmentButton options={MODE_LABELS} defaultIndex={MODES.indexOf(mode)} onChange={(i) => setMode(MODES[i])} />
              </div>

              <div className="flex flex-col gap-3 bg-white p-5 rounded-2xl border border-graphite/10 shadow-sm">
                <span className={sectionTitle}>Что сделать</span>
                <SegmentButton options={ACTION_LABELS} defaultIndex={ACTIONS.indexOf(action)} onChange={(i) => setAction(ACTIONS[i])} />

                {action === 'extend' && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-[90px] shrink-0">
                        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
                      </div>
                      <SegmentButton options={UNIT_LABELS} defaultIndex={UNITS.indexOf(unit)} onChange={(i) => setUnit(UNITS[i])} className="flex-1" />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {QUICK_EXTENDS.map(q => (
                        <button
                          key={q.label}
                          type="button"
                          onClick={() => { setAmount(String(q.amount)); setUnit(q.unit); }}
                          className={`px-3 py-1.5 rounded-md text-[12px] font-bold border transition-colors ${
                            Number(amount) === q.amount && unit === q.unit
                              ? 'border-orange text-orange bg-orange/10'
                              : 'border-graphite/20 text-graphite/60 bg-white hover:text-graphite'
                          }`}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[12px] text-graphite-light leading-relaxed">
                      Как при оплате: от даты окончания, а если подписки нет или она уже прошла — от сегодня.
                    </p>
                  </>
                )}

                {action === 'set' && (
                  <>
                    <Calendar value={untilDate} onChange={setUntilDate} />
                    <Checkbox
                      label={<span className="text-[13px] font-medium">Не сокращать: у кого дата позже, оставить её</span>}
                      checked={noShorten}
                      onChange={(e) => setNoShorten(e.target.checked)}
                      className="mb-0"
                    />
                    <p className="text-[12px] text-graphite-light leading-relaxed">
                      Подписка действует до конца выбранного дня по вашим часам — так её и увидят в Team Room.
                    </p>
                  </>
                )}

                {action === 'disable' && (
                  <p className="text-[13px] text-graphite leading-relaxed">
                    Подписка закончится прямо сейчас. У кого её нет или она уже истекла — ничего не изменится.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 bg-white p-5 rounded-2xl border border-graphite/10 shadow-sm">
                <span className={sectionTitle}>Комментарий в журнал</span>
                <Input placeholder="Например: подарок лиге на сезон" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
              </div>

              {/* Что будет — считает сервер по тем же правилам, по которым применит */}
              <div className="p-4 rounded-md border border-graphite/10 bg-white text-[13px] leading-relaxed">
                {!target ? (
                  <span className="text-graphite-light">
                    {mode === 'teams' ? 'Выберите команды справа' : mode === 'selected' ? 'Никто не отмечен' : 'Под фильтр никто не попадает'}
                  </span>
                ) : !actionBody ? (
                  <span className="text-graphite-light">{action === 'set' ? 'Выберите дату' : `Срок — целое число: до ${MAX_AMOUNT[unit]}`}</span>
                ) : isPreviewLoading ? (
                  <span className="text-graphite-light animate-pulse">Считаем…</span>
                ) : previewError ? (
                  <span className="font-bold text-status-rejected">{previewError}</span>
                ) : preview ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-graphite">
                      Попадает: <b>{peopleLabel(preview.total)}</b>. Дата изменится у <b>{preview.changed}</b>
                      {preview.total - preview.changed > 0 ? `, у ${preview.total - preview.changed} останется прежней` : ''}.
                    </span>
                    {preview.shortened > 0 && (
                      <span className="font-bold text-status-rejected">
                        У {peopleLabel(preview.shortened)} дата станет раньше
                        {preview.shortened_paid > 0 ? `, из них ${preview.shortened_paid} платили сами` : ''}.
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!canApply}
              className={`w-full py-3 shrink-0 transition-all ${!canApply ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
            >
              {preview && preview.changed > 0 ? `Применить к ${peopleLabel(preview.changed)}` : 'Применить'}
            </Button>
          </div>

          {/* Правая колонка: кому именно */}
          <div className="flex-1 min-w-0 flex flex-col bg-white border border-graphite/10 rounded-2xl shadow-sm overflow-hidden">
            {mode === 'selected' && (
              <>
                <div className="p-5 border-b border-graphite/10 bg-graphite/[0.02] shrink-0">
                  <h3 className="text-[14px] font-black uppercase text-graphite">Отмеченные: {selectedPeople.length}</h3>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
                  {selectedPeople.length === 0 ? (
                    <div className="py-10 px-6 text-center text-[13px] font-bold text-graphite/40">
                      Никто не отмечен. Закройте шторку и отметьте людей в списке или выберите «По фильтру» либо «По командам».
                    </div>
                  ) : selectedPeople.map(p => {
                    const exp = describeExpiry(p.subscription_expires_at);
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-3 rounded-md border border-graphite/10">
                        <img src={getImageUrl(p.avatar_url || '/default/user_default.webp')} alt="" className="w-9 h-9 rounded-md object-cover bg-graphite/5 shrink-0" />
                        <span className="flex-1 min-w-0 text-[13px] font-bold text-graphite truncate">{p.last_name} {p.first_name}</span>
                        <span className={`shrink-0 text-[12px] font-bold ${EXPIRY_TONE[exp.status]}`}>{exp.text}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {mode === 'filter' && (
              <div className="p-8 flex flex-col gap-3">
                <h3 className="text-[14px] font-black uppercase text-graphite">Все по фильтру списка</h3>
                <p className="text-[15px] font-bold text-graphite">
                  {describeTarget({ type: 'filter', filter, teamName: filterTeamName })}
                </p>
                <p className="text-[13px] text-graphite-light">
                  Сейчас под фильтр попадает {filterCount !== null && filterCount !== undefined ? peopleLabel(filterCount) : '…'}.
                  Чтобы поменять фильтр, закройте шторку и настройте его над списком.
                </p>
              </div>
            )}

            {mode === 'teams' && (
              <>
                <div className="p-5 border-b border-graphite/10 bg-graphite/[0.02] shrink-0 flex items-center gap-4">
                  <h3 className="text-[14px] font-black uppercase text-graphite shrink-0">Команды: {teamIds.size}</h3>
                  <Input
                    placeholder="Поиск команды..."
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    className="flex-1 px-2 py-2 text-[12px]"
                  />
                  {teamIds.size > 0 && (
                    <button type="button" onClick={() => setTeamIds(new Set())} className="shrink-0 text-[12px] font-bold text-graphite-light hover:text-orange transition-colors">
                      Снять всё
                    </button>
                  )}
                </div>
                <div className="px-5 py-3 border-b border-graphite/10 shrink-0">
                  <Checkbox
                    label={<span className="text-[13px] font-medium">Включая штаб и владельцев — без галочки только игроки состава</span>}
                    checked={includeStaff}
                    onChange={(e) => setIncludeStaff(e.target.checked)}
                    className="mb-0"
                  />
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
                  {visibleTeams.length === 0 ? (
                    <div className="py-10 text-center text-[13px] font-bold text-graphite/40">
                      {teams.length === 0 ? 'Команд с составом нет' : 'По запросу ничего нет'}
                    </div>
                  ) : visibleTeams.map(t => {
                    const checked = teamIds.has(t.id);
                    return (
                      <div
                        key={t.id}
                        onClick={() => toggleTeam(t.id)}
                        className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer select-none transition-colors ${
                          checked ? 'border-orange bg-orange/5' : 'border-graphite/10 bg-white hover:bg-graphite/[0.03]'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded shrink-0 flex items-center justify-center border transition-colors ${
                          checked ? 'bg-orange border-orange text-white' : 'border-graphite/25 text-transparent'
                        }`}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <img src={getImageUrl(t.logo_url || '/default/Logo_team_default.webp')} alt="" className="w-8 h-8 object-contain shrink-0" />
                        <span className="flex-1 min-w-0 text-[13px] font-bold text-graphite truncate">{t.name}</span>
                        {t.city && <span className="shrink-0 text-[12px] text-graphite-light">{t.city}</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={apply}
        isLoading={isApplying}
        title="Изменить подписку?"
        message={confirmMessage}
        confirmLabel="Применить"
        confirmingLabel="Применяем..."
        tone={preview?.shortened > 0 ? 'danger' : 'default'}
      />
    </div>
  );

  return createPortal(drawerContent, document.body);
}
