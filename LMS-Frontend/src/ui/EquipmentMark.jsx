import React from 'react';
import { Tooltip } from './Tooltip';
import { getEquipmentMark } from '../utils/equipmentMarks';

/**
 * Значок обязательной экипировки рядом с фамилией игрока: «ушк» или «к».
 * Маленькие строчные буквы, по нажатию — подсказка с пояснением.
 *
 * Правило и его пороги задаёт лига («Настройки → Параметры»), поэтому компоненту нужны
 * дата рождения и настройки текущей лиги. Никаких значков, если правила выключены или
 * игрок под них не подпадает — см. getEquipmentMark.
 */
export function EquipmentMark({ birthDate, league, className = '' }) {
  const mark = getEquipmentMark(birthDate, league);
  if (!mark) return null;

  // Клик глушим на обёртке: значок часто стоит внутри строки, которая сама куда-то ведёт
  // (в составе дивизиона — в профиль игрока). Нажатие на букву должно открывать только
  // подсказку, а не утаскивать в модалку.
  return (
    <span
      className={`inline-flex shrink-0 ${className}`}
      onClick={(e) => { e.stopPropagation(); }}
    >
      <Tooltip trigger="click" title={mark.title} subtitle={mark.text} noUnderline>
        <span className="inline-flex items-center px-1 py-[1px] rounded bg-orange/10 text-orange text-[10px] font-bold leading-none align-middle">
          {mark.code}
        </span>
      </Tooltip>
    </span>
  );
}
