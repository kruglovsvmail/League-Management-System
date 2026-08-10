import React, { useState, useEffect, useRef } from 'react';
import { Select } from '../../ui/Select';
import { Input } from '../../ui/Input';
import { Stepper } from '../../ui/Stepper';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { getToken } from '../../utils/helpers';

const SCOPE_OPTIONS = [
  { value: 'division', label: 'Среди всех команд дивизиона' },
  { value: 'team', label: 'Внутри каждой команды' },
];

const PLAYER_TYPE_OPTIONS = [
  { value: 'skater', label: 'Полевые игроки' },
  { value: 'goalie', label: 'Вратари' },
  { value: 'all', label: 'Все игроки' },
];

const POSITION_OPTIONS = [
  { value: 'all', label: 'Все полевые' },
  { value: 'forward', label: 'Нападающие' },
  { value: 'defense', label: 'Защитники' },
];

const STAGE_OPTIONS = [
  { value: 'regular', label: 'Регулярный чемпионат' },
  { value: 'playoff', label: 'Плей-офф' },
  { value: 'all', label: 'Регулярка + плей-офф' },
];

const SORT_OPTIONS = [
  { value: 'desc', label: 'Наибольшее значение' },
  { value: 'asc', label: 'Наименьшее значение' },
];

// Бейдж на плашке критерия — по аналогии с «очные/сезон/доп» у приоритета
// в регулярке. Здесь подпись показывает, к кому применим показатель.
const TAG_BY_APPLIES = {
  skater: { label: 'полевые', className: 'bg-orange/10 text-orange' },
  goalie: { label: 'вратари', className: 'bg-emerald-500/10 text-emerald-600' },
  both:   { label: 'общий',   className: 'bg-purple-500/10 text-purple-600' },
};

const labelOf = (opts, value) => opts.find(o => o.value === value)?.label || '';

const emptyForm = {
  name: '',
  scope: 'division',
  player_type: 'skater',
  position_filter: 'all',
  stage_type: 'regular',
  metric: '',
  sort_order: 'desc',
  tiebreakers: [],
  min_games: 0,
};

export function NominationsSection({ divisionId, canManage, setToast }) {
  const [nominations, setNominations] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isCopyConfirmOpen, setIsCopyConfirmOpen] = useState(false);
  // Что не поехало при копировании в сезон — показываем списком под кнопкой
  const [copySkipped, setCopySkipped] = useState(null);
  // Номинация, для которой открыто окно подтверждения удаления
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // null — форма закрыта; 'new' — создание; число — редактирование номинации
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  // Пояснение, почему выбранный показатель недоступен в этом дивизионе
  const [blockedReason, setBlockedReason] = useState('');

  // Перетаскивание критериев приоритета между «активными» и «стеком» (Мышь + Тач).
  // Механика повторяет приоритет при равенстве очков в настройках регулярки.
  const dragCriterionId = useRef(null);
  const dragOverZone = useRef(null); // 'active' | 'stack' | null
  const dragOverCriterionId = useRef(null); // id активной плашки, над которой сейчас курсор
  const [draggingCriterionId, setDraggingCriterionId] = useState(null);

  const metricsByKey = Object.fromEntries(metrics.map(m => [m.key, m]));

  // С сервера критерий приходит как { metric, order }. Голую строку разворачиваем
  // в направление показателя по умолчанию — на случай записей старого формата.
  const normalizeTiebreakers = (raw) => (Array.isArray(raw) ? raw : [])
    .map(item => (typeof item === 'string'
      ? { metric: item, order: metricsByKey[item]?.defaultOrder || 'desc' }
      : item))
    .filter(t => t && t.metric);

  const fetchNominations = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/nominations`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setNominations(data.data);
        setMetrics(data.metrics);
      }
    } catch (e) {
      // Молча: раздел просто останется пустым, тост здесь только мешал бы
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (divisionId) fetchNominations(); }, [divisionId]);

  // «Все игроки» — общий зачёт без разделения, там доступен весь список
  // показателей: и полевые, и вратарские, и общие.
  const fitsPlayerType = (m, playerType) =>
    !!m && (playerType === 'all' || m.appliesTo === 'both' || m.appliesTo === playerType);

  // Показатель подходит номинации, если он и применим к типу игрока,
  // и учитывается дивизионом на выбранной стадии.
  const isMetricPickable = (m, playerType, stageType) =>
    fitsPlayerType(m, playerType) && !!m.availability?.[stageType]?.available;

  const metricOptions = (playerType, stageType) => metrics
    .filter(m => fitsPlayerType(m, playerType))
    .map(m => ({
      value: m.key,
      label: m.label,
      disabled: !m.availability?.[stageType]?.available,
    }));

  const openCreate = () => {
    setForm(emptyForm);
    setBlockedReason('');
    setEditingId('new');
  };

  const openEdit = (n) => {
    setForm({
      name: n.name,
      scope: n.scope,
      player_type: n.player_type,
      position_filter: n.position_filter,
      stage_type: n.stage_type,
      metric: n.metric,
      sort_order: n.sort_order,
      tiebreakers: normalizeTiebreakers(n.tiebreakers),
      min_games: n.min_games,
    });
    setBlockedReason('');
    setEditingId(n.id);
  };

  const closeForm = () => { setEditingId(null); setBlockedReason(''); };

  // Смена типа игрока или стадии может обесценить уже выбранные показатели:
  // «сейвы» у полевых или «+/-» на стадии без учёта полезности. Вычищаем всё,
  // что перестало подходить, чтобы форма не отправила заведомо отказной набор.
  const applyScopeChange = (patch) => {
    setForm(prev => {
      const next = { ...prev, ...patch };
      if (next.player_type !== 'skater') next.position_filter = 'all';

      if (next.metric && !isMetricPickable(metricsByKey[next.metric], next.player_type, next.stage_type)) {
        next.metric = '';
      }
      next.tiebreakers = next.tiebreakers.filter(
        t => isMetricPickable(metricsByKey[t.metric], next.player_type, next.stage_type)
      );
      return next;
    });
    setBlockedReason('');
  };

  // Select не блокирует клик по зачёркнутой опции — отказ обрабатываем здесь,
  // иначе запрет остался бы чисто визуальным.
  const pickMetric = (key) => {
    const m = metricsByKey[key];
    const availability = m?.availability?.[form.stage_type];
    if (!availability?.available) {
      setBlockedReason(availability?.reason || 'Показатель недоступен в этом дивизионе');
      return;
    }
    setBlockedReason('');
    setForm(prev => ({
      ...prev,
      metric: key,
      sort_order: m.defaultOrder,
      tiebreakers: prev.tiebreakers.filter(t => t.metric !== key),
    }));
  };

  // ---- DRAG-AND-DROP МЕЖДУ ДВУМЯ ЗОНАМИ (Mouse + Touch) ----
  // «Активные» — form.tiebreakers (упорядоченный массив { metric, order }).
  // «Стек» — остальные подходящие показатели, отдельно не хранится, а
  // вычисляется при рендере. Та же схема, что у приоритета в регулярке.
  const applyDrag = () => {
    const id = dragCriterionId.current;
    if (id) {
      // Перетаскиваемый критерий мог уже лежать в активных — тогда сохраняем
      // выбранное для него направление, а не сбрасываем на значение по умолчанию.
      const existing = form.tiebreakers.find(t => t.metric === id);
      const withoutDragged = form.tiebreakers.filter(t => t.metric !== id);

      if (dragOverZone.current === 'active') {
        // В отличие от таблицы регулярки, здесь показатель может быть запрещён
        // дивизионом — тогда в активные он не попадает, а причина уходит в форму.
        const availability = metricsByKey[id]?.availability?.[form.stage_type];
        if (!availability?.available) {
          setBlockedReason(availability?.reason || 'Показатель недоступен в этом дивизионе');
        } else {
          setBlockedReason('');
          const overId = dragOverCriterionId.current;
          const insertAt = overId ? withoutDragged.findIndex(t => t.metric === overId) : withoutDragged.length;
          withoutDragged.splice(
            insertAt === -1 ? withoutDragged.length : insertAt,
            0,
            existing || { metric: id, order: metricsByKey[id]?.defaultOrder || 'desc' }
          );
        }
      }
      // Брошено в «стек» (или отпущено в никуда) — ключ просто остаётся исключённым
      setForm(prev => ({ ...prev, tiebreakers: withoutDragged }));
    }
    dragCriterionId.current = null;
    dragOverZone.current = null;
    dragOverCriterionId.current = null;
    setDraggingCriterionId(null);
  };

  // Десктопные события (HTML5)
  const handleDragStart = (e, id) => {
    dragCriterionId.current = id;
    setDraggingCriterionId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragEnterActive = (e, overId) => { dragOverZone.current = 'active'; dragOverCriterionId.current = overId; };
  const handleDragEnterStack = () => { dragOverZone.current = 'stack'; dragOverCriterionId.current = null; };
  const handleDragEnd = () => applyDrag();

  // Мобильные события (Touch API)
  const handleTouchStart = (e, id) => {
    dragCriterionId.current = id;
    setDraggingCriterionId(id);
  };
  const handleTouchMove = (e) => {
    if (dragCriterionId.current === null) return;
    const touch = e.touches[0];
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const zone = elem?.closest('[data-dnd-zone]');
    if (zone) {
      dragOverZone.current = zone.getAttribute('data-dnd-zone');
      const item = elem.closest('[data-dnd-id]');
      dragOverCriterionId.current = (item && zone.getAttribute('data-dnd-zone') === 'active') ? item.getAttribute('data-dnd-id') : null;
    }
  };
  const handleTouchEnd = () => applyDrag();

  const removeFromActive = (key) =>
    setForm(prev => ({ ...prev, tiebreakers: prev.tiebreakers.filter(t => t.metric !== key) }));

  const addToActive = (key) => {
    const m = metricsByKey[key];
    const availability = m?.availability?.[form.stage_type];
    if (!availability?.available) {
      setBlockedReason(availability?.reason || 'Показатель недоступен в этом дивизионе');
      return;
    }
    setBlockedReason('');
    setForm(prev => prev.tiebreakers.some(t => t.metric === key) || prev.metric === key
      ? prev
      : { ...prev, tiebreakers: [...prev.tiebreakers, { metric: key, order: m.defaultOrder }] });
  };

  // Направление у каждого критерия своё: по штрафным минутам одна номинация
  // хочет самого грубого, другая — самого дисциплинированного.
  const toggleTiebreakerOrder = (key) =>
    setForm(prev => ({
      ...prev,
      tiebreakers: prev.tiebreakers.map(t =>
        t.metric === key ? { ...t, order: t.order === 'desc' ? 'asc' : 'desc' } : t
      ),
    }));
  // -----------------------------------------------------------

  const isFormValid = () => form.name.trim() && form.metric;

  const handleSave = async () => {
    if (!isFormValid()) return;
    setIsSaving(true);
    try {
      const isNew = editingId === 'new';
      const url = isNew
        ? `${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/nominations`
        : `${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/nominations/${editingId}`;

      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ ...form, min_games: Number(form.min_games) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setToast({ title: 'Успешно', message: data.message, type: 'success' });
      closeForm();
      fetchNominations();
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyToSeason = async () => {
    setIsCopying(true);
    setCopySkipped(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/nominations/copy-to-season`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` } }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setToast({ title: 'Готово', message: data.message, type: 'success' });
      if (data.skipped?.length) setCopySkipped(data.skipped);
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setIsCopying(false);
      setIsCopyConfirmOpen(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/nominations/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setToast({ title: 'Успешно', message: data.message, type: 'success' });
      if (editingId === deleteTarget.id) closeForm();
      setDeleteTarget(null);
      fetchNominations();
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader text="" /></div>;
  }

  const availableTiebreakers = metrics.filter(m =>
    fitsPlayerType(m, form.player_type)
    && m.key !== form.metric
    && !form.tiebreakers.some(t => t.metric === m.key)
  );

  return (
    <div className="flex flex-col gap-5 animate-zoom-in">
      <div className="flex justify-between items-start gap-4">
        <div>
          <span className="text-[15px] font-bold text-graphite uppercase">Номинации</span>
          <div className="text-[12px] text-graphite-light mt-1 leading-snug max-w-[560px]">
            Наградные номинации этого дивизиона. Победитель считается по актуальной статистике —
            если протокол матча поправят, изменится и он.
          </div>
        </div>
        {canManage && editingId === null && (
          <Button onClick={openCreate} className="shrink-0">+ Номинация</Button>
        )}
      </div>

      {/* СПИСОК СОЗДАННЫХ НОМИНАЦИЙ */}
      {nominations.length === 0 && editingId === null && (
        <div className="text-center bg-white/40 border border-dashed border-graphite/20 rounded-md text-graphite-light py-12 px-6">
          В этом дивизионе ещё нет номинаций.
          {canManage && ' Нажмите «+ Номинация», чтобы создать первую.'}
        </div>
      )}

      {nominations.length > 0 && (
        <div className="flex flex-col gap-2">
          {nominations.map(n => {
            const metricLabel = metricsByKey[n.metric]?.label || n.metric;
            const isEditing = editingId === n.id;
            return (
              <div
                key={n.id}
                className={`bg-white rounded-md border transition-all ${
                  isEditing ? 'border-orange ring-1 ring-orange/30' : 'border-graphite/10'
                }`}
              >
                <div className="flex justify-between items-start gap-4 p-4">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-graphite">{n.name}</div>
                    <div className="text-[12px] text-graphite-light mt-1 leading-snug">
                      {metricLabel} · {labelOf(SORT_OPTIONS, n.sort_order).toLowerCase()} · {labelOf(STAGE_OPTIONS, n.stage_type).toLowerCase()}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-orange/10 text-orange">
                        {n.scope === 'team' ? 'по командам' : 'весь дивизион'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-500/10 text-emerald-600">
                        {n.player_type === 'goalie' ? 'вратари'
                          : n.player_type === 'all' ? 'все игроки'
                          : labelOf(POSITION_OPTIONS, n.position_filter).toLowerCase()}
                      </span>
                      {n.min_games > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-purple-500/10 text-purple-600">
                          от {n.min_games} матчей
                        </span>
                      )}
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2.5 shrink-0">
                      {/* При раскрытом аккордеоне карандаш меняется на крестик:
                          та же кнопка сворачивает карточку обратно */}
                      <button
                        type="button"
                        onClick={() => (isEditing ? closeForm() : openEdit(n))}
                        className={`transition-colors ${isEditing ? 'text-orange hover:text-orange-hover' : 'text-graphite/30 hover:text-orange'}`}
                        title={isEditing ? 'Свернуть' : 'Изменить'}
                      >
                        <Icon name={isEditing ? 'close' : 'edit'} className="w-[18px] h-[18px]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(n)}
                        className="text-graphite/30 hover:text-status-rejected transition-colors"
                        title="Удалить"
                      >
                        <Icon name="delete" className="w-[18px] h-[18px]" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Аккордеон: правка раскрывается в самой карточке, а не
                    отдельным блоком под всем списком — иначе при десятке
                    номинаций непонятно, какую именно сейчас редактируешь */}
                {isEditing && canManage && (
                  <div className="px-4 pb-4 pt-4 border-t border-graphite/10 flex flex-col gap-5 animate-zoom-in">
                    {renderForm()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Копирование в сезон — намеренно неприметное: действие массовое и нужно
          редко, при первичной настройке. Прячем, пока открыта форма, чтобы не
          скопировать старый набор, забыв сохранить правку. */}
      {canManage && nominations.length > 0 && editingId === null && (
        <div className="flex flex-col gap-2 -mt-1">
          <button
            type="button"
            onClick={() => setIsCopyConfirmOpen(true)}
            disabled={isCopying}
            className="self-start text-[11px] font-semibold text-graphite-light/70 hover:text-orange underline decoration-dotted underline-offset-4 transition-colors disabled:opacity-50 disabled:hover:text-graphite-light/70"
          >
            {isCopying ? 'Копирование…' : 'Скопировать номинации во все дивизионы и турниры сезона'}
          </button>

          {copySkipped && (
            <div className="text-[11px] leading-snug text-graphite-light bg-graphite/[0.03] border border-graphite/10 rounded-md px-3 py-2.5 flex flex-col gap-1">
              <span className="font-bold text-graphite">Пропущено: {copySkipped.length}</span>
              {copySkipped.slice(0, 8).map((s, i) => (
                <span key={i}>
                  {s.division} — «{s.nomination}»: {s.reason}
                </span>
              ))}
              {copySkipped.length > 8 && <span>…и ещё {copySkipped.length - 8}</span>}
            </div>
          )}
        </div>
      )}

      {/* ФОРМА СОЗДАНИЯ НОВОЙ НОМИНАЦИИ (редактирование раскрывается в самой карточке) */}
      {canManage && editingId === 'new' && (
        <div className="bg-white/70 p-5 md:p-6 rounded-md border border-graphite/10 flex flex-col gap-5">
          <span className="text-[14px] font-bold text-graphite uppercase tracking-wider">
            Новая номинация
          </span>
          {renderForm()}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        title="Удаление номинации"
        message={`Удалить номинацию «${deleteTarget?.name || ''}»? Это действие нельзя отменить.`}
      />

      <ConfirmModal
        isOpen={isCopyConfirmOpen}
        onClose={() => setIsCopyConfirmOpen(false)}
        onConfirm={handleCopyToSeason}
        isLoading={isCopying}
        tone="default"
        title="Копирование номинаций"
        message={`Скопировать все номинации (${nominations.length}) во все остальные дивизионы и турниры этого сезона? Существующие одноимённые номинации не изменятся.`}
        confirmLabel="Скопировать"
        confirmingLabel="Копирование..."
      />
    </div>
  );

  // Тело формы — функция-декларация, а не вложенный компонент: вложенный
  // React пересоздавал бы при каждом рендере родителя, и поле ввода теряло бы
  // фокус на каждом нажатии клавиши. Объявление поднимается, поэтому его можно
  // держать ниже return и не гнать 200 строк разметки выше по файлу.
  function renderForm() {
    return (
        <>
          <Input
            label="Название"
            value={form.name}
            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Например: Лучший бомбардир"
            maxLength={120}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Область розыгрыша"
              options={SCOPE_OPTIONS}
              value={form.scope}
              onChange={(v) => setForm(prev => ({ ...prev, scope: v }))}
            />
            <Select
              label="Стадия"
              options={STAGE_OPTIONS}
              value={form.stage_type}
              onChange={(v) => applyScopeChange({ stage_type: v })}
            />
            <Select
              label="Кого номинируем"
              options={PLAYER_TYPE_OPTIONS}
              value={form.player_type}
              onChange={(v) => applyScopeChange({ player_type: v })}
            />
            {form.player_type === 'skater' && (
              <Select
                label="Амплуа"
                options={POSITION_OPTIONS}
                value={form.position_filter}
                onChange={(v) => setForm(prev => ({ ...prev, position_filter: v }))}
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Основной показатель"
              options={metricOptions(form.player_type, form.stage_type)}
              value={form.metric}
              onChange={pickMetric}
              placeholder="Выберите показатель"
              wrapText
            />
            <Select
              label="Побеждает"
              options={SORT_OPTIONS}
              value={form.sort_order}
              onChange={(v) => setForm(prev => ({ ...prev, sort_order: v }))}
            />
          </div>

          {blockedReason && (
            <div className="text-[12px] leading-snug text-status-rejected bg-status-rejected/5 border border-status-rejected/20 rounded-md px-3 py-2.5">
              {blockedReason}
            </div>
          )}

          <div className="flex justify-between items-center gap-4 border-t border-graphite/5 pt-4">
            <div>
              <div className="text-[13px] font-semibold text-graphite">Минимум матчей</div>
              <div className="text-[11px] text-graphite-light mt-0.5 leading-tight max-w-[340px]">
                Отсекает случайных лидеров. Вратарю матч засчитывается только за реальный выход на лёд.
              </div>
            </div>
            <Stepper
              initialValue={form.min_games}
              onChange={(v) => setForm(prev => ({ ...prev, min_games: v }))}
              min={0}
              max={200}
            />
          </div>

          {/* Приоритет при равенстве: активные критерии + стек исключённых (Drag-and-Drop, Мышь + Тач) */}
          <div className="flex flex-col gap-4 border-t border-graphite/5 pt-4">
            <div className="bg-white/70 p-6 rounded-md border border-graphite/10 flex flex-col gap-4 relative z-10">
              <div>
                <span className="text-[15px] font-bold text-graphite uppercase">Приоритет при равенстве</span>
                <div className="text-[11px] text-graphite-light mt-1 leading-tight">
                  Применяются по очереди, если основной показатель совпал.
                  Когда исчерпаны и они — игроки идут по алфавиту.
                </div>
              </div>
              <div
                data-dnd-zone="active"
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => handleDragEnterActive(null, null)}
                className="flex flex-col gap-1 min-h-[40px]"
              >
                {form.tiebreakers.map((t, index) => {
                  const def = metricsByKey[t.metric];
                  if (!def) return null;
                  const tag = TAG_BY_APPLIES[def.appliesTo] || TAG_BY_APPLIES.both;
                  return (
                    <div
                      key={t.metric}
                      data-dnd-id={t.metric}
                      data-dnd-zone="active"
                      draggable
                      onDragStart={(e) => handleDragStart(e, t.metric)}
                      onDragEnter={(e) => { e.stopPropagation(); handleDragEnterActive(e, t.metric); }}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      onTouchStart={(e) => handleTouchStart(e, t.metric)}
                      onTouchMove={(e) => handleTouchMove(e)}
                      onTouchEnd={() => handleTouchEnd()}
                      className={`flex items-center gap-3 p-3 rounded-md border transition-all duration-200
                        bg-white border-graphite/10 shadow-sm cursor-grab active:cursor-grabbing hover:border-orange hover:shadow-md touch-none
                        ${draggingCriterionId === t.metric ? 'opacity-40 scale-[0.98] ring-1 ring-orange shadow-lg' : ''}
                      `}
                    >
                      <span className="w-8 h-8 bg-graphite text-white rounded-lg flex justify-center items-center text-[13px] font-bold shrink-0">
                        {index + 1}
                      </span>
                      <span className="text-[13px] font-semibold text-graphite flex-1 min-w-0">
                        {def.label}
                      </span>

                      {/* Направление именно этого критерия. draggable=false, иначе
                          нажатие на кнопку начинает перетаскивание плашки. */}
                      <button
                        type="button"
                        draggable={false}
                        onClick={() => toggleTiebreakerOrder(t.metric)}
                        title="Переключить направление"
                        className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-md uppercase border border-graphite/15 bg-graphite/[0.03] text-graphite-light hover:border-orange hover:text-orange transition-colors"
                      >
                        {t.order === 'asc' ? '↑ меньше' : '↓ больше'}
                      </button>

                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${tag.className}`}>
                        {tag.label}
                      </span>
                      <button
                        type="button"
                        draggable={false}
                        onClick={() => removeFromActive(t.metric)}
                        className="text-graphite-light hover:text-status-rejected transition-colors text-[16px] leading-none px-1 shrink-0"
                        aria-label="Исключить критерий"
                      >
                        &times;
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] text-graphite-light mt-1 text-center">
                Перетащите, чтобы изменить приоритет. Нажмите «больше/меньше», чтобы сменить
                направление критерия, или &times;, чтобы исключить его
              </div>
            </div>

            <div
              data-dnd-zone="stack"
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={handleDragEnterStack}
              className="p-5 rounded-md border border-dashed border-graphite/20 bg-graphite/[0.03] flex flex-col gap-3"
            >
              <div>
                <span className="text-[12px] font-bold text-graphite-light uppercase tracking-wide">Неактивные критерии</span>
                <div className="text-[11px] text-graphite-light/80 mt-0.5">Перетащите плашку наверх, чтобы включить её в сортировку</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableTiebreakers.map(m => {
                  const tag = TAG_BY_APPLIES[m.appliesTo] || TAG_BY_APPLIES.both;
                  const blocked = !m.availability?.[form.stage_type]?.available;
                  return (
                    <div
                      key={m.key}
                      data-dnd-id={m.key}
                      data-dnd-zone="stack"
                      draggable
                      onDragStart={(e) => handleDragStart(e, m.key)}
                      onDragEnter={handleDragEnterStack}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => addToActive(m.key)}
                      onTouchStart={(e) => handleTouchStart(e, m.key)}
                      onTouchMove={(e) => handleTouchMove(e)}
                      onTouchEnd={() => handleTouchEnd()}
                      className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all duration-200 cursor-grab
                        ${blocked
                          ? 'bg-white/40 border-graphite/10 opacity-60 line-through'
                          : 'bg-white border-graphite/15 hover:border-orange'
                        }
                        ${draggingCriterionId === m.key ? 'opacity-40 scale-[0.98] ring-1 ring-orange' : ''}
                      `}
                    >
                      <span className="text-[12px] font-semibold text-graphite-light">{m.label}</span>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${tag.className}`}>
                        {tag.label}
                      </span>
                    </div>
                  );
                })}
                {availableTiebreakers.length === 0 && (
                  <span className="text-[12px] text-graphite-light/60 italic">Все подходящие критерии активны</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 border-t border-graphite/5 pt-4">
            <Button onClick={handleSave} isLoading={isSaving} disabled={!isFormValid()} className="flex-1">
              {editingId === 'new' ? 'Создать номинацию' : 'Сохранить'}
            </Button>
            <Button onClick={closeForm} className="bg-white text-orange border border-orange hover:bg-orange/5">
              Отмена
            </Button>
          </div>
        </>
    );
  }
}
