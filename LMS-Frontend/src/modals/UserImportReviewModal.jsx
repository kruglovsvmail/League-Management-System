import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { UserMatchCard } from '../components/Registry/UserMatchCard';

// Ревью перед подтверждением Excel-импорта. Строки делятся на четыре группы:
//  - с ошибками разбора (телефон, id команды, амплуа, номер, повторы в файле) — импорт
//    заблокирован целиком, пока файл не исправят: половинный импорт только запутает;
//  - с уже занятым телефоном — телефон это логин, второго такого не бывает, новый
//    аккаунт не создаётся; если в строке есть команда, админ может поставить в неё
//    владельца телефона («В команду»), иначе строка пропускается;
//  - тёзки по Фамилии+Имени — требуют ЯВНОГО решения по каждой: Пропустить, Добавить
//    нового или «В команду» на карточке одного из найденных (если в строке есть команда);
//  - остальные улетают в базу автоматически.
// Половина пары амплуа/номер — жёлтое предупреждение: человек пойдёт только в команду.
// Найденного в базе, кто уже стоит в составе команды, импорт не переписывает.
// «Подтвердить импорт» заблокирована, пока не решены все тёзки, есть хоть одна ошибка
// или выбор отдаёт чужой номер новому человеку.

const fioOf = (row) => [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' ');
// Номер строки в файле: заголовок — первая, данные начинаются со второй
const fileLine = (idx) => idx + 2;
const bindKey = (userId) => `bind:${userId}`;

const RowMeta = ({ row }) => (
  <span className="text-[11px] text-graphite-light ml-2">
    {row.birth_date ? `г.р. ${new Date(row.birth_date).getFullYear()}` : ''}
    {row.phone ? ` · тел. ${row.phone}` : ''}
    {row.team_name ? ` · команда: ${row.team_name}` : ''}
    {row.jersey_number ? ` · №${row.jersey_number} ${row.position_short || ''}` : ''}
  </span>
);

// Под карточкой найденного человека: где он сейчас в команде из строки и кнопка
// «Пропустить, но добавить в команду».
const TeamBind = ({ row, user, selected, onPick }) => {
  if (!row.team_id || !user.in_team) return null;
  const { is_member, roster } = user.in_team;
  let state;
  if (roster) {
    state = <>Уже в составе «{row.team_name}»: <b className="text-graphite">№{roster.jersey_number ?? '—'} · {roster.position_short || '—'}</b> — состав не меняем</>;
  } else if (is_member) {
    state = <>Уже в команде «{row.team_name}», в составе нет{row.jersey_number ? <> — будет внесён: <b className="text-graphite">№{row.jersey_number} · {row.position_short}</b></> : ''}</>;
  } else {
    state = <>В команде «{row.team_name}» нет{row.jersey_number ? <> — будет внесён в состав: <b className="text-graphite">№{row.jersey_number} · {row.position_short}</b></> : ''}</>;
  }
  return (
    <div className="mt-1 pt-2 border-t border-graphite/10 flex items-center justify-between gap-2 flex-wrap">
      <span className="text-[12px] text-graphite-light min-w-0">{state}</span>
      <button
        type="button"
        onClick={onPick}
        className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wide transition-colors shrink-0 ${selected ? 'bg-orange text-white' : 'bg-graphite/10 text-graphite hover:bg-graphite/20'}`}
      >
        Пропустить, но в команду
      </button>
    </div>
  );
};

export function UserImportReviewModal({ isOpen, onClose, rows, onConfirm, isSaving }) {
  const [decisions, setDecisions] = useState({});

  // Новый предпросмотр (новый файл) — сбрасываем прошлые решения.
  useEffect(() => { setDecisions({}); }, [rows]);

  if (!isOpen) return null;

  const indexed = (rows || []).map((r, idx) => ({ ...r, idx }));
  const hasErrors = (r) => r.errors && r.errors.length > 0;
  const broken = indexed.filter(hasErrors);
  const warned = indexed.filter(r => !hasErrors(r) && r.warnings && r.warnings.length > 0);
  const taken = indexed.filter(r => !hasErrors(r) && r.phone_match);
  const needsReview = indexed.filter(r => !hasErrors(r) && !r.phone_match && r.matches && r.matches.length > 0);
  const autoAdd = indexed.filter(r => !hasErrors(r) && !r.phone_match && (!r.matches || r.matches.length === 0));

  const boundUserId = (row) => {
    const d = decisions[row.idx];
    return d && d.startsWith('bind:') ? Number(d.slice(5)) : null;
  };
  // У тёзок кнопка «В команду» повторное нажатие не снимает (решение обязательно),
  // у совпавших по телефону — снимает: там без выбора строка просто пропускается
  const pick = (row, value, toggle) => setDecisions(d => ({ ...d, [row.idx]: toggle && d[row.idx] === value ? undefined : value }));

  const resolvedCount = needsReview.filter(r => decisions[r.idx]).length;
  const allResolved = resolvedCount === needsReview.length;
  const toAddRows = [...autoAdd, ...needsReview.filter(r => decisions[r.idx] === 'add')];
  const toBindRows = [...taken, ...needsReview].filter(r => boundUserId(r));
  const toAddCount = toAddRows.length;
  const toTeamCount = toAddRows.filter(r => r.team_id).length;

  // Номер из строки уже носит один из найденных людей: отдать его можно только ему
  // самому — новому человеку или другому тёзке сервер его не даст
  const jerseyClash = (row) => {
    if (!row.jersey_holder) return false;
    const d = decisions[row.idx];
    if (d === 'add') return true;
    const bound = boundUserId(row);
    return bound !== null && bound !== row.jersey_holder.user_id;
  };
  const clashes = [...taken, ...needsReview].filter(jerseyClash);

  const total = toAddCount + toBindRows.length;
  const canConfirm = broken.length === 0 && allResolved && clashes.length === 0 && total > 0 && !isSaving;

  const handleConfirm = () => {
    // Служебные поля ревью серверу не нужны — он разбирает строки заново
    const strip = ({ idx, matches, phone_match, errors, warnings, team_name, jersey_holder, position_short, ...rest }) => rest;
    const finalRows = [
      ...toAddRows.map(strip),
      ...toBindRows.map(r => ({ ...strip(r), bind_user_id: boundUserId(r) })),
    ];
    onConfirm(finalRows);
  };

  const ClashNote = ({ row }) => jerseyClash(row) ? (
    <div className="text-[12px] font-semibold text-status-rejected mt-1">
      Номер {row.jersey_number} в «{row.team_name}» уже у {row.jersey_holder.name} (ID {row.jersey_holder.user_id}) — выберите «В команду» на его карточке или пропустите строку
    </div>
  ) : null;

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
              {toTeamCount > 0 && <> &middot; С привязкой к команде: <b className="text-graphite">{toTeamCount}</b></>}
              {toBindRows.length > 0 && <> &middot; Из базы в команду: <b className="text-orange">{toBindRows.length}</b></>}
              {warned.length > 0 && <> &middot; С предупреждениями: <b className="text-status-pending">{warned.length}</b></>}
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

          {/* Половина пары амплуа/номер — импорт не держит, но в состав не попадут */}
          {warned.length > 0 && (
            <div className="border border-status-pending/40 rounded-md p-4 bg-status-pending/5">
              <div className="text-[13px] font-black text-status-pending uppercase tracking-wide mb-1">
                Проверьте — в игровой состав не попадут
              </div>
              <div className="text-[11px] text-graphite-light mb-3">
                Импорт не блокируют: человек будет только в команде. Если это опечатка — поправьте файл и загрузите заново.
              </div>
              <div className="flex flex-col gap-2">
                {warned.map(row => (
                  <div key={row.idx} className="bg-white/70 border border-status-pending/30 rounded-md px-3 py-2">
                    <div className="text-[13px] font-bold text-graphite">
                      <span className="text-graphite/50 font-semibold mr-2">Строка {fileLine(row.idx)}</span>
                      {fioOf(row)}
                      <RowMeta row={row} />
                    </div>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {row.warnings.map((w, i) => (
                        <li key={i} className="text-[12px] font-semibold text-status-pending">{w}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Телефон уже в базе — это тот же человек, новый аккаунт не создаётся */}
          {taken.length > 0 && (
            <div className="border border-graphite/15 rounded-md p-4 bg-graphite/[0.02]">
              <div className="text-[13px] font-black text-graphite uppercase tracking-wide mb-1">
                Уже зарегистрированы — новый аккаунт не создаётся
              </div>
              <div className="text-[11px] text-graphite-light mb-3">
                Телефон — это логин, второго аккаунта с тем же номером быть не может. Строка пропускается; если в ней указана команда, человека можно поставить в неё.
              </div>
              <div className="flex flex-col gap-3">
                {taken.map(row => (
                  <div key={row.idx} className="flex flex-col gap-2">
                    <div className="text-[13px] font-bold text-graphite">
                      <span className="text-graphite/50 font-semibold mr-2">Строка {fileLine(row.idx)}</span>
                      {fioOf(row)}
                      <RowMeta row={row} />
                      <ClashNote row={row} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <UserMatchCard user={row.phone_match}>
                        <TeamBind
                          row={row}
                          user={row.phone_match}
                          selected={boundUserId(row) === row.phone_match.id}
                          onPick={() => pick(row, bindKey(row.phone_match.id), true)}
                        />
                      </UserMatchCard>
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
                    <ClashNote row={row} />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => pick(row, 'skip')}
                      className={`px-3 py-1.5 rounded-md text-[12px] font-bold uppercase tracking-wide transition-colors ${decision === 'skip' ? 'bg-status-rejected text-white' : 'bg-graphite/10 text-graphite hover:bg-graphite/20'}`}
                    >
                      Пропустить
                    </button>
                    <button
                      type="button"
                      onClick={() => pick(row, 'add')}
                      className={`px-3 py-1.5 rounded-md text-[12px] font-bold uppercase tracking-wide transition-colors ${decision === 'add' ? 'bg-status-accepted text-white' : 'bg-graphite/10 text-graphite hover:bg-graphite/20'}`}
                    >
                      Добавить
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {row.matches.map(m => (
                    <UserMatchCard key={m.id} user={m}>
                      <TeamBind
                        row={row}
                        user={m}
                        selected={decision === bindKey(m.id)}
                        onPick={() => pick(row, bindKey(m.id))}
                      />
                    </UserMatchCard>
                  ))}
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
            {broken.length > 0 ? 'Исправьте ошибки в файле' : `Подтвердить импорт (${total})`}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
