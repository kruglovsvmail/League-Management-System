import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { UserMatchCard } from '../components/Registry/UserMatchCard';

// Ревью перед подтверждением Excel-импорта. Строки делятся на четыре группы:
//  - с ошибками разбора (телефон, id команды, повторы в файле) — импорт заблокирован
//    целиком, пока файл не исправят: половинный импорт только запутает;
//  - с уже занятым телефоном — телефон это логин, второго такого не бывает, строка
//    пропускается сама, админу показываем, кто это в базе;
//  - тёзки по Фамилии+Имени — требуют ЯВНОГО решения Добавить/Пропустить по каждой;
//  - остальные улетают в базу автоматически.
// «Подтвердить импорт» заблокирована, пока не решены все тёзки и есть хоть одна ошибка.

const fioOf = (row) => [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' ');
// Номер строки в файле: заголовок — первая, данные начинаются со второй
const fileLine = (idx) => idx + 2;

const RowMeta = ({ row }) => (
  <span className="text-[11px] text-graphite-light ml-2">
    {row.birth_date ? `г.р. ${new Date(row.birth_date).getFullYear()}` : ''}
    {row.phone ? ` · тел. ${row.phone}` : ''}
    {row.team_name ? ` · команда: ${row.team_name}` : ''}
  </span>
);

export function UserImportReviewModal({ isOpen, onClose, rows, onConfirm, isSaving }) {
  const [decisions, setDecisions] = useState({});

  // Новый предпросмотр (новый файл) — сбрасываем прошлые решения.
  useEffect(() => { setDecisions({}); }, [rows]);

  if (!isOpen) return null;

  const indexed = (rows || []).map((r, idx) => ({ ...r, idx }));
  const broken = indexed.filter(r => r.errors && r.errors.length > 0);
  const taken = indexed.filter(r => !(r.errors && r.errors.length > 0) && r.phone_match);
  const needsReview = indexed.filter(r => !(r.errors && r.errors.length > 0) && !r.phone_match && r.matches && r.matches.length > 0);
  const autoAdd = indexed.filter(r => !(r.errors && r.errors.length > 0) && !r.phone_match && (!r.matches || r.matches.length === 0));

  const resolvedCount = needsReview.filter(r => decisions[r.idx]).length;
  const allResolved = resolvedCount === needsReview.length;
  const toAddRows = [...autoAdd, ...needsReview.filter(r => decisions[r.idx] === 'add')];
  const toAddCount = toAddRows.length;
  const toBindCount = toAddRows.filter(r => r.team_id).length;
  const canConfirm = broken.length === 0 && allResolved && toAddCount > 0 && !isSaving;

  const handleConfirm = () => {
    // Служебные поля ревью серверу не нужны — он разбирает строки заново
    const finalRows = toAddRows.map(({ idx, matches, phone_match, errors, team_name, ...rest }) => rest);
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
              {taken.length > 0 && <> &middot; Уже в базе (телефон): <b className="text-graphite">{taken.length}</b></>}
              {broken.length > 0 && <> &middot; С ошибками: <b className="text-status-rejected">{broken.length}</b></>}
              {toBindCount > 0 && <> &middot; С привязкой к команде: <b className="text-graphite">{toBindCount}</b></>}
            </p>
          </div>
          <button onClick={!isSaving ? onClose : undefined} className="p-2 text-graphite-light hover:text-orange hover:bg-orange/10 rounded-circle transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 flex flex-col gap-4">

          {/* Ошибки разбора — импорт закрыт, пока файл не исправят */}
          {broken.length > 0 && (
            <div className="border border-status-rejected/30 rounded-md p-4 bg-status-rejected/5">
              <div className="text-[13px] font-black text-status-rejected uppercase tracking-wide mb-1">
                Исправьте файл — импорт заблокирован
              </div>
              <div className="text-[11px] text-graphite-light mb-3">
                Номера строк — как в Excel, с учётом строки заголовков.
              </div>
              <div className="flex flex-col gap-2">
                {broken.map(row => (
                  <div key={row.idx} className="bg-white/70 border border-status-rejected/20 rounded-md px-3 py-2">
                    <div className="text-[13px] font-bold text-graphite">
                      <span className="text-graphite/50 font-semibold mr-2">Строка {fileLine(row.idx)}</span>
                      {fioOf(row)}
                      <RowMeta row={row} />
                    </div>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {row.errors.map((e, i) => (
                        <li key={i} className="text-[12px] font-semibold text-status-rejected">{e}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Телефон уже в базе — это тот же человек, строка пропускается */}
          {taken.length > 0 && (
            <div className="border border-graphite/15 rounded-md p-4 bg-graphite/[0.02]">
              <div className="text-[13px] font-black text-graphite uppercase tracking-wide mb-1">
                Уже зарегистрированы — будут пропущены
              </div>
              <div className="text-[11px] text-graphite-light mb-3">
                Телефон — это логин, второго аккаунта с тем же номером быть не может.
              </div>
              <div className="flex flex-col gap-3">
                {taken.map(row => (
                  <div key={row.idx} className="flex flex-col gap-2">
                    <div className="text-[13px] font-bold text-graphite">
                      <span className="text-graphite/50 font-semibold mr-2">Строка {fileLine(row.idx)}</span>
                      {fioOf(row)}
                      <RowMeta row={row} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <UserMatchCard user={row.phone_match} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Тёзки по ФИ — решение по каждой */}
          {needsReview.length === 0 && broken.length === 0 && taken.length === 0 ? (
            <div className="text-center text-graphite-light text-[13px] py-10">
              Совпадений по Фамилии+Имени и по телефону не найдено — можно смело импортировать все {autoAdd.length} записей.
            </div>
          ) : needsReview.map(row => {
            const decision = decisions[row.idx];
            return (
              <div key={row.idx} className="border border-graphite/15 rounded-md p-4 bg-graphite/[0.02]">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="min-w-0">
                    <span className="text-graphite/50 text-[12px] font-semibold mr-2">Строка {fileLine(row.idx)}</span>
                    <span className="text-[13px] font-bold text-graphite">{fioOf(row)}</span>
                    <RowMeta row={row} />
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
            disabled={!canConfirm}
            className={`bg-status-accepted text-white ${!canConfirm ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {broken.length > 0 ? 'Исправьте ошибки в файле' : `Подтвердить импорт (${toAddCount})`}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
