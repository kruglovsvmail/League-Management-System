import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Loader } from '../ui/Loader';
import { getToken } from '../utils/helpers';

// Импортируем компонент заглушки для прав доступа
import { AccessFallback } from '../ui/AccessFallback';

// Квалификация принадлежит паре «человек + лига», а не заявке в дивизион: меняется она
// сразу во всей лиге, включая прошлые сезоны. Поэтому окно работает не с ростером, а с
// человеком, и само ходит за его текущей квалификацией, историей и списком заявок,
// на которые смена повлияет. Точек входа две — состав дивизиона и справочник, — и обе
// получают одинаковое поведение бесплатно.
//
// Слева — выбор, справа — история смен. История здесь же, а не в отдельном окне: решение
// «менять или не менять» принимают, глядя на неё.
//
// Порядок квалификаций задаётся в настройках лиги (вкладка «Квалификации») и приходит
// с сервера уже отсортированным — здесь список не пересортировываем.
// showDescriptions — тумблер оттуда же: при выключении остаются только название и бейдж.
export function QualSelectModal({ isOpen, onClose, leagueId, player, qualifications = [], onSaved, readOnly = false, showDescriptions = true }) {
  const SERVER_URL = import.meta.env.VITE_API_URL;

  const [selectedId, setSelectedId] = useState(null);
  const [reason, setReason] = useState('');
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  // id записи истории, для которой показан вопрос «Удалить?» — подтверждение прямо в строке,
  // без второго модального окна поверх этого
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadQualification = useCallback((resetSelection = false) => {
    if (!leagueId || !player?.id) return;

    setIsLoading(true);
    setError(null);

    fetch(`${SERVER_URL}/api/leagues/${leagueId}/users/${player.id}/qualification`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Не удалось загрузить квалификацию');
        setCurrent(data.current || null);
        setHistory(data.history || []);
        setDivisions(data.divisions || []);
        if (resetSelection) setSelectedId(data.current?.qualification_id ?? null);
      })
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [SERVER_URL, leagueId, player?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setConfirmDeleteId(null);
    loadQualification(true);
  }, [isOpen, loadQualification]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/users/${player.id}/qualification`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ qualification_id: selectedId, reason })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Не удалось сохранить квалификацию');

      if (onSaved) onSaved({ qualification_id: data.qualification_id, qualification_short_name: data.qualification_short_name });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Удаляется одна ошибочная запись, остальная история остаётся. Действующую квалификацию
  // сервер удалить не даст — она меняется выбором слева.
  const handleDeleteEntry = async (entryId) => {
    setDeletingId(entryId);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/users/${player.id}/qualification/${entryId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Не удалось удалить запись');

      setConfirmDeleteId(null);
      loadQualification(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const visibleQualifications = qualifications.filter(
    qual => qual.status === 'active' || qual.id === current?.qualification_id
  );

  // Заявки, которые перестанут соответствовать выбранной квалификации. Игрока из турнира
  // это не выкидывает — правила проверяются в момент заявки, — но лига должна видеть
  // последствия до сохранения, а не узнавать о них из состава дивизиона.
  const conflicts = divisions.filter(d => {
    if (!d.has_restriction) return false;
    return selectedId
      ? !(d.allowed_qualification_ids || []).includes(selectedId)
      : !d.allows_none;
  });

  const isChanged = (current?.qualification_id ?? null) !== selectedId;
  const formatDate = (value) => (value ? new Date(value).toLocaleDateString('ru-RU') : '');

  const renderOption = (id, title, badge, description, isArchived) => (
    <div
      key={id ?? 'none'}
      onClick={() => !readOnly && setSelectedId(id)}
      className={`flex items-center gap-4 p-3 rounded-md transition-all border ${
        selectedId === id ? 'border-orange bg-orange/10' : 'border-graphite/10'
      } ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:border-orange/40 hover:bg-black/5'}`}
    >
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-bold text-[14px] leading-[1.3] ${isArchived ? 'text-graphite-light line-through' : 'text-graphite'}`}>
            {title}
          </span>
          {badge && <Badge label={badge} type={isArchived ? 'empty' : 'filled'} />}
          {isArchived && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-status-rejected bg-status-rejected/10 px-2 py-0.5 rounded-md">
              В архиве
            </span>
          )}
        </div>
        {showDescriptions && description && (
          <span className="text-[12px] text-graphite-light mt-1 whitespace-pre-line">{description}</span>
        )}
      </div>

      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        selectedId === id ? 'border-orange' : 'border-graphite-light'
      }`}>
        <div className={`w-2.5 h-2.5 rounded-full bg-orange transition-transform ${selectedId === id ? 'scale-100' : 'scale-0'}`} />
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Выбор квалификации" size="wide">

      {/* Высота окна фиксированная и от наполнения не зависит: иначе при открытии оно
          прыгает — сперва в пустой рамке крутится лоадер, потом рамка вырастает под
          загруженный список и историю. Скроллятся внутренние блоки, а не окно целиком. */}
      <div className="h-[68vh] flex flex-col">

        {/* Выводим баннер "Только чтение", если права ограничены */}
        {readOnly && (
          <div className="shrink-0">
            <AccessFallback variant="readonly" message="Режим просмотра. Смена квалификации недоступна для вашей роли." />
          </div>
        )}

        {player?.name && (
          <div className="text-[14px] font-bold text-graphite shrink-0">{player.name}</div>
        )}

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center"><Loader text="" /></div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 mt-3">

          {/* ЛЕВАЯ КОЛОНКА — выбор квалификации */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
              {renderOption(null, 'Без квалификации', null, null, false)}
              {visibleQualifications.map(qual =>
                renderOption(qual.id, qual.name, qual.short_name, qual.description, qual.status !== 'active')
              )}
            </div>

            {!readOnly && isChanged && conflicts.length > 0 && (
              <div className="shrink-0 mt-4 p-3 rounded-md bg-status-rejected/10 border border-status-rejected/20">
                <div className="text-[12px] font-bold text-status-rejected uppercase tracking-wide mb-2">
                  Не подходит под действующие заявки
                </div>
                <div className="flex flex-col gap-1">
                  {conflicts.map(d => (
                    <span key={d.division_id} className="text-[12px] text-graphite leading-tight">
                      {d.division_name} · {d.team_name} · {d.season_name}
                    </span>
                  ))}
                </div>
                <div className="text-[11px] text-graphite-light mt-2 leading-tight">
                  Из этих турниров игрока не исключит — допуск проверяется при заявке. В составе появится пометка о расхождении.
                </div>
              </div>
            )}

            {error && (
              <div className="shrink-0 mt-4 p-3 rounded-md bg-status-rejected/10 border border-status-rejected/20 text-[12px] font-bold text-status-rejected">
                {error}
              </div>
            )}

            {!readOnly && (
              <div className="shrink-0 flex justify-end pt-5">
                <Button onClick={handleSave} isLoading={isSaving} disabled={!isChanged} className="w-full md:w-auto">
                  Выбрать
                </Button>
              </div>
            )}
          </div>

          {/* ПРАВАЯ КОЛОНКА — основание смены и история */}
          <div className="w-full lg:w-[320px] shrink-0 lg:border-l lg:border-graphite/10 lg:pl-6 flex flex-col min-h-0">

            {/* Поле появляется только когда выбор реально меняется: основание нужно к смене,
                а не к простому просмотру карточки */}
            {!readOnly && isChanged && (
              <div className="shrink-0 flex flex-col mb-5">
                <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">
                  Основание квалификации
                </span>
                <textarea
                  rows={4}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="На основании чего назначена квалификация игроку"
                  className="w-full px-3 py-2.5 border border-graphite/20 rounded-md bg-white/50 text-graphite text-[13px] outline-none focus:border-orange focus:bg-white resize-none transition-colors"
                />
              </div>
            )}

            <div className="shrink-0 text-[11px] font-bold text-graphite-light uppercase tracking-wide mb-3">История квалификаций</div>

            {history.length === 0 ? (
              <div className="text-[12px] text-graphite-light leading-tight">
                Квалификацию в этой лиге ещё не присваивали.
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
                {history.map(row => {
                  const isCurrent = row.ended_at === null;
                  const isConfirming = confirmDeleteId === row.id;

                  return (
                    <div
                      key={row.id}
                      className={`p-3 rounded-md border ${isCurrent ? 'border-orange/40 bg-orange/5' : 'border-graphite/10'}`}
                    >
                      <div className="flex items-start gap-2">
                        <Badge label={row.qualification_short_name} type={isCurrent ? 'filled' : 'empty'} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[12px] font-bold text-graphite leading-tight">
                            {isCurrent ? 'Действует сейчас' : `${formatDate(row.assigned_at)} — ${formatDate(row.ended_at)}`}
                          </span>
                          {isCurrent && (
                            <span className="text-[11px] text-graphite-light leading-tight mt-0.5">с {formatDate(row.assigned_at)}</span>
                          )}
                          {(row.reason || row.assigned_by_name) && (
                            <span className="text-[11px] text-graphite-light leading-tight mt-1">
                              {[row.reason, row.assigned_by_name].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>

                        {/* Действующую запись удалить нельзя: это не история, а текущее
                            состояние — его меняют выбором слева */}
                        {!readOnly && !isCurrent && !isConfirming && (
                          <button
                            onClick={() => setConfirmDeleteId(row.id)}
                            title="Удалить эту запись истории"
                            className="shrink-0 text-graphite-light hover:text-status-rejected transition-colors p-1"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {isConfirming && (
                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-graphite/10">
                          <span className="text-[11px] font-bold text-status-rejected">Удалить запись?</span>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => handleDeleteEntry(row.id)}
                              disabled={deletingId === row.id}
                              className="text-[11px] font-bold uppercase text-status-rejected hover:underline disabled:opacity-50"
                            >
                              {deletingId === row.id ? 'Удаляем...' : 'Удалить'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[11px] font-bold uppercase text-graphite-light hover:text-graphite"
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
