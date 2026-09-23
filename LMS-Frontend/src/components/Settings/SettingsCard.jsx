import React from 'react';
import { Icon } from '../../ui/Icon';

/**
 * Карточка настройки на вкладках параметров («Параметры» лиги, «Команды → Лиги»).
 *
 * Два размера. sm — компактная: пара переключателей или полей, занимает одну строку
 * сетки. lg — для длинного содержимого (обозначения экипировки, эфирные файлы):
 * занимает две строки, и рядом с ней в соседнем столбце встают две sm одна над другой.
 *
 * Строка сетки подстраивается под самую высокую карточку в ней, поэтому содержимое идёт
 * сразу под описанием, а не прижимается к низу. Раньше короткая карточка рядом с
 * длинной превращалась в пустое поле с тумблером в самом низу.
 *
 * На телефоне столбец один, и lg ничем не отличается от sm.
 */
export function SettingsCard({ size = 'sm', icon, title, description, saving = false, savingLabel = 'Сохранение', children }) {
  return (
    <div className={`bg-white/40 backdrop-blur-md border border-white/50 rounded-xl p-5 shadow-sm relative ${size === 'lg' ? 'md:row-span-2' : ''}`}>
      {saving && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] font-bold text-orange uppercase tracking-widest animate-pulse">
          <div className="w-1.5 h-1.5 bg-orange rounded-full"></div>
          {savingLabel}
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        {icon && <Icon name={icon} className="w-4 h-4 shrink-0 text-graphite/40" />}
        <h4 className="text-[13px] font-black uppercase text-graphite tracking-tight">{title}</h4>
      </div>
      {description && (
        <p className="text-[11px] text-graphite-light leading-relaxed pr-8">{description}</p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {children}
      </div>
    </div>
  );
}
