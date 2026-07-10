import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { UserMatchCard } from '../components/Registry/UserMatchCard';

// Ревью перед подтверждением Excel-импорта. Строки без совпадений по ФИ
// улетают в базу автоматически; для строк с совпадением (тёзка может
// встретиться в базе и 5+ раз) требуется ЯВНОЕ решение по каждой —
// «Подтвердить импорт» заблокирована, пока не решены все.
export function UserImportReviewModal({ isOpen, onClose, rows, onConfirm, isSaving }) {
  const [decisions, setDecisions] = useState({});

  // Новый предпросмотр (новый файл) — сбрасываем прошлые решения.
  useEffect(() => { setDecisions({}); }, [rows]);

  if (!isOpen) return null;

  const indexed = (rows || []).map((r, idx) => ({ ...r, idx }));
  const needsReview = indexed.filter(r => r.matches && r.matches.length > 0);
  const autoAdd = indexed.filter(r => !r.matches || r.matches.length === 0);

  const resolvedCount = needsReview.filter(r => decisions[r.idx]).length;
  const allResolved = resolvedCount === needsReview.length;
  const toAddCount = autoAdd.length + needsReview.filter(r => decisions[r.idx] === 'add').length;

  const handleConfirm = () => {
    const finalRows = [
      ...autoAdd.map(({ idx, matches, ...rest }) => rest),
      ...needsReview.filter(r => decisions[r.idx] === 'add').map(({ idx, matches, ...rest }) => rest),
    ];
    onConfirm(finalRows);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-graphite/40 backdrop-blur-[4px]" onClick={!isSaving ? onClose : undefined} />

      <div className="relative w-full max-w-4xl bg-white/90 backdrop-blur-[12px] border border-white/40 rounded-lg flex flex-col max-h-full animate-zoom-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-graphite/10 bg-white/40 rounded-t-xxl shrink-0">
          <div>
            <h2 className="text-xl font-black text-graphite uppercase tracking-wide">Проверка перед импортом</h2>
            <p className="text-[12px] text-graphite-light mt-1 font-medium">
              Новых без совпадений: <b className="text-status-accepted">{autoAdd.length}</b>
              {needsReview.length > 0 && <> &middot; Требуют решения: <b className="text-orange">{resolvedCount}/{needsReview.length}</b></>}
            </p>
          </div>
          <button onClick={!isSaving ? onClose : undefined} className="p-2 text-graphite-light hover:text-orange hover:bg-orange/10 rounded-circle transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 flex flex-col gap-4">
          {needsReview.length === 0 ? (
            <div className="text-center text-graphite-light text-[13px] py-10">
              Совпадений по Фамилии+Имени не найдено — можно смело импортировать все {autoAdd.length} записей.
            </div>
          ) : needsReview.map(row => {
            const fio = [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' ');
            const decision = decisions[row.idx];
            return (
              <div key={row.idx} className="border border-graphite/15 rounded-md p-4 bg-graphite/[0.02]">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="min-w-0">
                    <span className="text-[13px] font-bold text-graphite">{fio}</span>
                    <span className="text-[11px] text-graphite-light ml-2">
                      {row.birth_date ? `г.р. ${new Date(row.birth_date).getFullYear()}` : ''}
                      {row.phone ? ` · тел. ${row.phone}` : ''}
                    </span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDecisions(d => ({ ...d, [row.idx]: 'skip' }))}
                      className={`px-3 py-1.5 rounded-md text-[12px] font-bold uppercase tracking-wide transition-colors ${decision === 'skip' ? 'bg-status-rejected text-white' : 'bg-graphite/10 text-graphite hover:bg-graphite/20'}`}
                    >
                      Пропустить
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecisions(d => ({ ...d, [row.idx]: 'add' }))}
                      className={`px-3 py-1.5 rounded-md text-[12px] font-bold uppercase tracking-wide transition-colors ${decision === 'add' ? 'bg-status-accepted text-white' : 'bg-graphite/10 text-graphite hover:bg-graphite/20'}`}
                    >
                      Добавить
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {row.matches.map(m => <UserMatchCard key={m.id} user={m} />)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-graphite/10 flex justify-end gap-3 shrink-0">
          <Button type="button" onClick={onClose} disabled={isSaving} className="bg-graphite/10 text-graphite hover:bg-graphite/20">
            Отмена
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            isLoading={isSaving}
            disabled={!allResolved || isSaving || toAddCount === 0}
            className={`bg-status-accepted text-white ${(!allResolved || toAddCount === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Подтвердить импорт ({toAddCount})
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
