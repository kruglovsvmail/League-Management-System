import React, { useState, useEffect } from 'react';
import { useAccess } from '../../hooks/useAccess';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { SegmentButton } from '../../ui/SegmentButton';
import { Tooltip } from '../../ui/Tooltip';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { getToken } from '../../utils/helpers';

const ROW_TYPES = ['violation', 'section', 'subsection'];
const ROW_TYPE_LABELS = ['Пункт', 'Заголовок', 'Подзаголовок'];

const EMPTY_FORM = {
  row_type: 'violation',
  code: '', title: '',
  mandatory_games_min: '', mandatory_games_max: '',
  additional_games_min: '', additional_games_max: '',
  additional_amount_min: '', additional_amount_max: '',
  penalty_minutes_note: '',
  is_team_penalty: false,
  split_among_members: false
};

// Суммы в справочнике всегда целые рубли — копейки от numeric(10,2) в таблице не показываем
const formatRange = (min, max, suffix = '') => {
  if (min == null && max == null) return '-';
  const minR = min == null ? null : Math.round(Number(min));
  const maxR = max == null ? null : Math.round(Number(max));
  if (minR == null) return `до ${maxR}${suffix}`;
  if (maxR == null || minR === maxR) return `${minR}${suffix}`;
  return `${minR}–${maxR}${suffix}`;
};

const toForm = (row) => ({
  row_type: row.row_type || 'violation',
  code: row.code || '',
  title: row.title || '',
  mandatory_games_min: row.mandatory_games_min ?? '',
  mandatory_games_max: row.mandatory_games_max ?? '',
  additional_games_min: row.additional_games_min ?? '',
  additional_games_max: row.additional_games_max ?? '',
  additional_amount_min: row.additional_amount_min != null ? String(Math.round(Number(row.additional_amount_min))) : '',
  additional_amount_max: row.additional_amount_max != null ? String(Math.round(Number(row.additional_amount_max))) : '',
  penalty_minutes_note: row.penalty_minutes_note || '',
  is_team_penalty: !!row.is_team_penalty,
  split_among_members: !!row.split_among_members
});

// Пояснения к полям вынесены в тултип: в узкой панели текст подсказок занимал
// больше места по высоте, чем сами поля, ради которых он написан.
function HintIcon({ title, text }) {
  return (
    <Tooltip title={title} subtitle={text} position="left" noUnderline>
      <span className="w-[14px] h-[14px] shrink-0 rounded-full bg-graphite/15 text-graphite/60 text-[9px] font-black flex items-center justify-center hover:bg-orange/20 hover:text-orange transition-colors">?</span>
    </Tooltip>
  );
}

// Строка формы: короткая подпись слева, поля справа — вместо заголовка отдельной строкой
function Field({ label, hintTitle, hint, children }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[86px] shrink-0 flex items-center gap-1 text-[11px] font-bold text-graphite-light uppercase tracking-wide leading-tight">
        {label}
        {hint && <HintIcon title={hintTitle || label} text={hint} />}
      </span>
      <div className="flex-1 flex gap-2 min-w-0">{children}</div>
    </div>
  );
}

function Checkbox({ checked, onChange, label, hint, disabled }) {
  return (
    <div className={`flex items-center gap-2.5 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span
        onClick={() => { if (!disabled) onChange(!checked); }}
        className={`w-[18px] h-[18px] rounded-[5px] border-2 shrink-0 flex items-center justify-center transition-colors ${checked ? 'bg-orange border-orange' : 'border-graphite/30 bg-white'}`}
      >
        {checked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>}
      </span>
      <span
        onClick={() => { if (!disabled) onChange(!checked); }}
        className="text-[12px] font-bold text-graphite leading-tight flex-1"
      >
        {label}
      </span>
      {hint && <HintIcon title={label} text={hint} />}
    </div>
  );
}

export function SdkViolationTypesSection({ seasonId, setToast }) {
  const { checkAccess } = useAccess();
  const canManage = checkAccess('SDK_REFERENCES_MANAGE');
  const canDelete = checkAccess('SDK_VIOLATION_TYPES_DELETE');

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  const fetchItems = async () => {
    if (!seasonId) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/seasons/${seasonId}/sdk/violation-types`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setItems(data.data);
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой загрузки справочника нарушений', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    setEditingId(null);
    setFormData(EMPTY_FORM);
  }, [seasonId]);

  const isHeaderForm = formData.row_type !== 'violation';

  const buildPayload = () => ({
    row_type: formData.row_type,
    code: formData.code.trim(),
    title: formData.title.trim(),
    mandatory_games_min: formData.mandatory_games_min ? parseInt(formData.mandatory_games_min, 10) : null,
    mandatory_games_max: formData.mandatory_games_max ? parseInt(formData.mandatory_games_max, 10) : null,
    additional_games_min: formData.additional_games_min ? parseInt(formData.additional_games_min, 10) : null,
    additional_games_max: formData.additional_games_max ? parseInt(formData.additional_games_max, 10) : null,
    additional_amount_min: formData.additional_amount_min ? parseFloat(formData.additional_amount_min) : null,
    additional_amount_max: formData.additional_amount_max ? parseFloat(formData.additional_amount_max) : null,
    penalty_minutes_note: formData.penalty_minutes_note.trim() || null,
    is_team_penalty: formData.is_team_penalty,
    split_among_members: formData.split_among_members
  });

  const handleSubmit = async () => {
    if (!formData.title.trim() || (!isHeaderForm && !formData.code.trim())) {
      setToast({ title: 'Внимание', message: isHeaderForm ? 'Заполните текст заголовка' : 'Заполните пункт и текст нарушения', type: 'error' });
      return;
    }
    setIsSubmitting(true);
    try {
      const url = editingId
        ? `${SERVER_URL}/api/sdk/violation-types/${editingId}`
        : `${SERVER_URL}/api/seasons/${seasonId}/sdk/violation-types`;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(buildPayload())
      });
      const data = await res.json();
      if (data.success) {
        setFormData(EMPTY_FORM);
        setEditingId(null);
        fetchItems();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой сохранения', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/violation-types/${itemToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        if (editingId === itemToDelete.id) { setEditingId(null); setFormData(EMPTY_FORM); }
        setItemToDelete(null);
        fetchItems();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
        setItemToDelete(null);
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Порядок строк — единственный источник структуры "Таблицы штрафов": заголовки и пункты
  // чередуются, поэтому сортировать по коду нельзя. Новый порядок отправляем целиком.
  const persistOrder = async (ordered) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/seasons/${seasonId}/sdk/violation-types/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ ids: ordered.map(i => i.id) })
      });
      const data = await res.json();
      if (!data.success) {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
        fetchItems();
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой сохранения порядка', type: 'error' });
      fetchItems();
    }
  };

  const handleDrop = (targetId) => {
    setDragOverId(null);
    if (!dragId || dragId === targetId) { setDragId(null); return; }

    const fromIndex = items.findIndex(i => i.id === dragId);
    const toIndex = items.findIndex(i => i.id === targetId);
    if (fromIndex === -1 || toIndex === -1) { setDragId(null); return; }

    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setItems(reordered);
    setDragId(null);
    persistOrder(reordered);
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      <div className="flex-1 w-full min-w-0 bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-6 min-h-[300px] order-2 lg:order-1">
        {items.length > 0 ? (
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-graphite/10">
                {canManage && <th className="w-8"></th>}
                <th className="w-14 py-3 text-left text-[11px] font-black text-graphite-light uppercase tracking-wide">Пункт</th>
                <th className="py-3 text-left text-[11px] font-black text-graphite-light uppercase tracking-wide">Нарушение</th>
                <th className="w-16 py-3 text-center text-[11px] font-black text-graphite-light uppercase tracking-wide">Обяз.</th>
                <th className="w-16 py-3 text-center text-[11px] font-black text-graphite-light uppercase tracking-wide">Доп. матчи</th>
                <th className="w-28 py-3 px-2 text-center text-[11px] font-black text-graphite-light uppercase tracking-wide">Доп. штраф</th>
                <th className="w-32 py-3 px-2 text-center text-[11px] font-black text-graphite-light uppercase tracking-wide">Минуты</th>
              </tr>
            </thead>
            <tbody>
              {items.map(row => {
                const isHeader = row.row_type === 'section' || row.row_type === 'subsection';
                const isEditing = editingId === row.id;
                return (
                  <tr
                    key={row.id}
                    onDragOver={(e) => { if (dragId) { e.preventDefault(); setDragOverId(row.id); } }}
                    onDragLeave={() => setDragOverId(prev => (prev === row.id ? null : prev))}
                    onDrop={() => handleDrop(row.id)}
                    onClick={() => { if (canManage) { setEditingId(row.id); setFormData(toForm(row)); } }}
                    className={`border-b border-graphite/5 last:border-0 transition-colors ${canManage ? 'cursor-pointer' : ''} ${
                      isEditing ? 'bg-orange/10' : dragOverId === row.id ? 'bg-orange/5' : 'hover:bg-graphite/[0.03]'
                    } ${dragId === row.id ? 'opacity-40' : ''}`}
                  >
                    {canManage && (
                      <td
                        draggable
                        onDragStart={() => setDragId(row.id)}
                        onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="py-2 text-center text-graphite/25 hover:text-orange cursor-grab active:cursor-grabbing select-none text-[13px] leading-none"
                        title="Перетащите, чтобы изменить порядок"
                      >
                        ⣿
                      </td>
                    )}

                    {isHeader ? (
                      <td colSpan={5} className="py-2.5">
                        <span className={row.row_type === 'section'
                          ? 'text-[13px] font-black text-orange uppercase tracking-wide'
                          : 'text-[12px] font-bold italic text-status-pending'}>
                          {row.code ? `${row.code} ` : ''}{row.title}
                        </span>
                      </td>
                    ) : (
                      <>
                        <td className="py-2.5 pr-2 align-top"><span className="font-black text-orange text-[13px]">{row.code}</span></td>
                        <td className="py-2.5 pr-3">
                          <span className="font-medium text-graphite text-[13px] leading-snug">{row.title}</span>
                          {row.is_team_penalty && (
                            <span className="ml-2 inline-block align-middle px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-status-pending/10 text-status-pending">
                              {row.split_among_members ? 'делится' : 'команда'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-center align-top text-[13px] text-graphite-light">{formatRange(row.mandatory_games_min, row.mandatory_games_max)}</td>
                        <td className="py-2.5 text-center align-top text-[13px] text-graphite-light">{formatRange(row.additional_games_min, row.additional_games_max)}</td>
                        <td className="py-2.5 px-2 text-center align-top text-[13px] text-graphite-light whitespace-nowrap">{formatRange(row.additional_amount_min, row.additional_amount_max)}</td>
                        <td className="py-2.5 px-2 text-center align-top text-[13px] text-graphite-light whitespace-nowrap">{row.penalty_minutes_note || '-'}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-20 text-graphite-light font-medium">Справочник нарушений на этот сезон пока пуст</div>
        )}
      </div>

      {canManage && seasonId && (
        <div className="w-full lg:w-[380px] shrink-0 bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-sm p-5 flex flex-col gap-3 sticky top-[100px] order-1 lg:order-2">
          <div className="flex items-center justify-between border-b border-graphite/10 pb-3">
            <span className="text-[14px] font-black text-graphite uppercase tracking-wide">
              {editingId ? 'Редактирование' : 'Новая строка'}
            </span>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setFormData(EMPTY_FORM); }} className="text-[11px] font-bold text-orange hover:underline">
                Отменить
              </button>
            )}
          </div>

          <SegmentButton
            options={ROW_TYPE_LABELS}
            defaultIndex={ROW_TYPES.indexOf(formData.row_type)}
            onChange={(i) => setFormData({ ...formData, row_type: ROW_TYPES[i] })}
          />

          {isHeaderForm ? (
            <div className="relative">
              <textarea
                placeholder="Текст заголовка"
                rows={2}
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 pr-8 bg-white/70 border border-graphite/40 rounded-md font-medium text-graphite outline-none focus:border-orange focus:shadow-[0_0_0_3px_rgba(255,122,0,0.2)] transition-all resize-none text-[13px]"
              />
              <span className="absolute right-2.5 top-2.5">
                <HintIcon
                  title="Заголовок раздела"
                  text="Заголовок и подзаголовок — только разделители: санкций не несут и в решении СДК не выбираются. Место в списке задаётся перетаскиванием строки."
                />
              </span>
            </div>
          ) : (
            <>
              <Field label="Пункт" hintTitle="Номер пункта" hint="Номер по таблице штрафов. Может повторяться — у одного номера бывает несколько строк с разными санкциями.">
                <Input placeholder="Например: 2.4" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} className="w-full px-3 py-2 text-[13px]" />
              </Field>

              <textarea
                placeholder="Текст нарушения"
                rows={3}
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 bg-white/70 border border-graphite/40 rounded-md font-medium text-graphite outline-none focus:border-orange focus:shadow-[0_0_0_3px_rgba(255,122,0,0.2)] transition-all resize-none text-[13px]"
              />

              <div className="flex flex-col gap-2 p-2.5 rounded-md bg-status-pending/5 border border-status-pending/20">
                <Checkbox
                  checked={formData.is_team_penalty}
                  onChange={(v) => setFormData({ ...formData, is_team_penalty: v, split_among_members: v ? formData.split_among_members : false })}
                  label="Штраф на команду"
                  hint="Ограничение получают все участники состава этой команды в лиге, кроме тренера и главного тренера, — до полной оплаты суммы. Матчи такому пункту не назначаются, только деньги."
                />
                <Checkbox
                  checked={formData.split_among_members}
                  disabled={!formData.is_team_penalty}
                  onChange={(v) => setFormData({ ...formData, split_among_members: v })}
                  label="Сумма делится"
                  hint="При вынесении решения выбираются участники (включая тренеров), сумма делится между ними поровну. Каждый освобождается, оплатив свою долю."
                />
              </div>

              {!formData.is_team_penalty && (
                <>
                  <Field label="Обяз. матчи" hintTitle="Обязательные матчи" hint="Матчи, которые нарушитель обязан пропустить в любом случае — без выбора. Второе поле заполняется, только если в таблице указан диапазон.">
                    <Input placeholder="От" type="number" value={formData.mandatory_games_min} onChange={e => setFormData({ ...formData, mandatory_games_min: e.target.value })} className="w-full px-2.5 py-2 text-[13px]" />
                    <Input placeholder="До" type="number" value={formData.mandatory_games_max} onChange={e => setFormData({ ...formData, mandatory_games_max: e.target.value })} className="w-full px-2.5 py-2 text-[13px]" />
                  </Field>

                  <Field label="Доп. матчи" hintTitle="Дополнительные матчи" hint="Если заполнено вместе со штрафом ниже — комиссия при вынесении решения выбирает: доп. матчами ИЛИ доп. деньгами. Второе поле заполняется, только если в таблице указан диапазон.">
                    <Input placeholder="От" type="number" value={formData.additional_games_min} onChange={e => setFormData({ ...formData, additional_games_min: e.target.value })} className="w-full px-2.5 py-2 text-[13px]" />
                    <Input placeholder="До" type="number" value={formData.additional_games_max} onChange={e => setFormData({ ...formData, additional_games_max: e.target.value })} className="w-full px-2.5 py-2 text-[13px]" />
                  </Field>
                </>
              )}

              <Field
                label={formData.is_team_penalty ? 'Сумма ₽' : 'Доп. штраф ₽'}
                hintTitle={formData.is_team_penalty ? 'Сумма штрафа' : 'Дополнительный штраф'}
                hint={formData.is_team_penalty
                  ? 'Сумма штрафа на команду. Второе поле заполняется, только если в таблице указан диапазон.'
                  : 'Денежная альтернатива дополнительным матчам. Второе поле заполняется, только если в таблице указан диапазон.'}
              >
                <Input placeholder="От" type="number" value={formData.additional_amount_min} onChange={e => setFormData({ ...formData, additional_amount_min: e.target.value })} className="w-full px-2.5 py-2 text-[13px]" />
                <Input placeholder="До" type="number" value={formData.additional_amount_max} onChange={e => setFormData({ ...formData, additional_amount_max: e.target.value })} className="w-full px-2.5 py-2 text-[13px]" />
              </Field>

              <Field label="Минуты" hintTitle="Штраф в матче" hint="Штрафные минуты в хоккейной нотации — справочно, на расчёт наказания не влияют.">
                <Input placeholder="Например: 2+20" value={formData.penalty_minutes_note} onChange={e => setFormData({ ...formData, penalty_minutes_note: e.target.value })} className="w-full px-2.5 py-2 text-[13px]" />
              </Field>
            </>
          )}

          <Button onClick={handleSubmit} isLoading={isSubmitting} className="w-full">
            {editingId ? 'Сохранить' : 'Добавить'}
          </Button>

          {/* Удаление живёт здесь, а не в каждой строке таблицы: так таблица остаётся
              максимально узкой по служебным колонкам, а вся ширина уходит под текст нарушения */}
          {editingId && canDelete && (
            <button
              type="button"
              onClick={() => setItemToDelete(items.find(i => i.id === editingId))}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-[13px] font-bold text-status-rejected border border-status-rejected/30 hover:bg-status-rejected/10 transition-colors"
            >
              <Icon name="delete" className="w-4 h-4" />
              Удалить строку
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
