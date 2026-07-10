import React from 'react';

// Карточка одного существующего пользователя, найденного по совпадению
// Фамилия+Имя — используется и в модалке ручного добавления, и в ревью
// перед импортом. Помогает решить: это тот же человек или тёзка.
export function UserMatchCard({ user }) {
  const fio = [user.last_name, user.first_name, user.middle_name].filter(Boolean).join(' ');
  const year = user.birth_date ? new Date(user.birth_date).getFullYear() : null;

  return (
    <div className="border border-graphite/15 rounded-md p-3 bg-white/60 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-[13px] text-graphite truncate">{fio}</span>
        <span className="text-[11px] text-graphite/50 font-semibold shrink-0">ID {user.id}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-graphite-light">
        <span>Год рожд.: <b className="text-graphite">{year || '—'}</b></span>
        <span>Телефон: <b className="text-graphite">{user.phone || '—'}</b></span>
        {user.virtual_code && <span>Код: <b className="text-orange">{user.virtual_code}</b></span>}
      </div>
      <div className="text-[12px] text-graphite-light">
        Команды: <b className="text-graphite">{(user.teams && user.teams.length) ? user.teams.join(', ') : '—'}</b>
      </div>
    </div>
  );
}
