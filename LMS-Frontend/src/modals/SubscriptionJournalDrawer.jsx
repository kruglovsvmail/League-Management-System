import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader } from '../ui/Loader';
import { ConfirmModal } from './ConfirmModal';
import { getAuthHeaders } from '../utils/helpers';
import { describeAction, describeTarget, formatDateTime, peopleLabel } from '../utils/subscriptionStatus';

const API = import.meta.env.VITE_API_URL;
const PAGE_SIZE = 30;

const personName = (last, first) => [last, first].filter(Boolean).join(' ') || 'пользователь удалён';

/**
 * Журнал ручных изменений подписок: свежие сверху. Любую операцию, кроме самой отмены,
 * можно отменить — вернутся прежние даты тем, кого с тех пор никто не трогал (ни оплата,
 * ни другая операция); остальных отмена пропустит, и это видно заранее.
 */
export function SubscriptionJournalDrawer({ isOpen, onClose, onChanged, showToast }) {
  const [ops, setOps] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [previewingId, setPreviewingId] = useState(null);
  const [undoTarget, setUndoTarget] = useState(null); // { op, preview }
  const [isUndoing, setIsUndoing] = useState(false);

  const loadPage = async (pageNum) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/subscriptions/operations?page=${pageNum}&limit=${PAGE_SIZE}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) {
        setOps(prev => (pageNum === 1 ? json.data : [...prev, ...json.data]));
        setHasMore(json.hasMore);
        setPage(pageNum);
      } else {
        setError(json.error || 'Не удалось загрузить журнал');
      }
    } catch (err) {
      setError('Сбой связи с сервером');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Сначала спрашиваем сервер, скольким вернётся дата: если некому — и подтверждать нечего
  const askUndo = async (op) => {
    setPreviewingId(op.id);
    try {
      const res = await fetch(`${API}/api/subscriptions/operations/${op.id}/undo-preview`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (!json.success) {
        showToast?.('Ошибка', json.error || 'Не удалось проверить операцию');
      } else if (json.revertable === 0) {
        showToast?.('Вернуть некому', 'У всех, кого затронула операция, дату с тех пор меняли — оплатой или другой операцией', 'info');
      } else {
        setUndoTarget({ op, preview: json });
      }
    } catch (err) {
      showToast?.('Ошибка', 'Сбой связи с сервером');
    } finally {
      setPreviewingId(null);
    }
  };

  const undo = async () => {
    if (!undoTarget) return;
    setIsUndoing(true);
    try {
      const res = await fetch(`${API}/api/subscriptions/operations/${undoTarget.op.id}/undo`, { method: 'POST', headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) {
        showToast?.(
          'Операция отменена',
          `Прежняя дата вернулась: ${peopleLabel(json.reverted)}${json.skipped > 0 ? `. Пропущено: ${json.skipped}` : ''}`,
          'success'
        );
        setUndoTarget(null);
        loadPage(1);
        onChanged?.();
      } else {
        setUndoTarget(null);
        showToast?.('Ошибка', json.error || 'Не удалось отменить операцию');
      }
    } catch (err) {
      setUndoTarget(null);
      showToast?.('Ошибка', 'Сбой связи с сервером');
    } finally {
      setIsUndoing(false);
    }
  };

  const undoMessage = undoTarget ? [
    `Вернём прежнюю дату: ${peopleLabel(undoTarget.preview.revertable)}.`,
    undoTarget.preview.skipped > 0
      ? `Пропустим ${peopleLabel(undoTarget.preview.skipped)}: их дату с тех пор меняли — оплатой или другой операцией.`
      : null,
  ].filter(Boolean).join(' ') : '';

  const drawerContent = (
    <div className={`fixed inset-0 z-[35] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className={`absolute top-0 right-0 h-full w-full max-w-[760px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite tracking-wide uppercase">Журнал изменений</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 flex flex-col gap-2">
          {error && (
            <div className="p-4 bg-status-rejected/10 border border-status-rejected/20 rounded-md text-[13px] font-bold text-status-rejected">{error}</div>
          )}

          {isLoading && ops.length === 0 ? (
            <div className="py-16 flex justify-center"><Loader text="" /></div>
          ) : !error && ops.length === 0 ? (
            <div className="py-16 text-center text-[13px] font-bold text-graphite/40">Ручных изменений ещё не было</div>
          ) : ops.map(op => {
            const isUndo = op.action === 'undo';
            const canUndo = !isUndo && !op.undone_at;
            return (
              <div key={op.id} className={`bg-white p-4 rounded-md border flex flex-col gap-1 ${op.undone_at ? 'border-graphite/10 opacity-60' : 'border-graphite/10'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-graphite-light">
                    №{op.id} · {formatDateTime(op.created_at)} · {personName(op.admin_last_name, op.admin_first_name)}
                  </span>
                  {canUndo && (
                    <button
                      type="button"
                      onClick={() => askUndo(op)}
                      disabled={previewingId !== null}
                      className="shrink-0 text-[12px] font-bold text-status-rejected hover:text-status-rejected/70 transition-colors bg-status-rejected/10 px-3 py-1.5 rounded-md disabled:opacity-40"
                    >
                      {previewingId === op.id ? 'Проверяем…' : 'Отменить'}
                    </button>
                  )}
                </div>

                <span className="text-[14px] font-black text-graphite">{describeAction(op)}</span>
                {!isUndo && op.params?.target && (
                  <span className="text-[13px] text-graphite">{describeTarget(op.params.target)}</span>
                )}
                <span className="text-[13px] text-graphite">
                  {isUndo
                    ? `Прежняя дата вернулась: ${peopleLabel(op.affected_count)}${op.params?.skipped > 0 ? ` · пропущено: ${op.params.skipped}` : ''}`
                    : `Дата изменилась: ${peopleLabel(op.affected_count)}`}
                </span>
                {op.comment && <span className="text-[12px] text-graphite italic">«{op.comment}»</span>}
                {op.undone_at && (
                  <span className="text-[12px] font-bold text-status-rejected">
                    Отменена {formatDateTime(op.undone_at)} · {personName(op.undone_by_last_name, op.undone_by_first_name)}
                  </span>
                )}
              </div>
            );
          })}

          {hasMore && (
            <button
              type="button"
              onClick={() => loadPage(page + 1)}
              disabled={isLoading}
              className="mt-2 self-center text-[13px] font-bold text-orange hover:text-orange/70 transition-colors disabled:opacity-40"
            >
              {isLoading ? 'Загрузка…' : 'Показать ещё'}
            </button>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={undoTarget !== null}
        onClose={() => setUndoTarget(null)}
        onConfirm={undo}
        isLoading={isUndoing}
        title={undoTarget ? `Отменить операцию №${undoTarget.op.id}?` : ''}
        message={undoMessage}
        confirmLabel="Отменить операцию"
        confirmingLabel="Отменяем..."
      />
    </div>
  );

  return createPortal(drawerContent, document.body);
}
