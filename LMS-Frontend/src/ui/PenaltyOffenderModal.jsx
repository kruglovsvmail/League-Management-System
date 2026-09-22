// src/ui/PenaltyOffenderModal.jsx
import React, { useState, useEffect } from 'react';
import { Modal } from '../modals/Modal';
import { Button } from './Button';

// Кто наказан и кто отбывает — графа «#» таблицы «Удаления» в панели секретаря.
//
// Штраф накладывается на игрока, на команду («К») или на официального представителя
// («ОПК»). За нарушителя на скамейке может сидеть другой игрок: за команду и
// представителя — всегда (сами они не сидят), за игрока — когда тот удалён до конца
// матча (5+20). Поэтому выбор двухшаговый и с кнопкой «Сохранить», а не по клику:
//   1-й тап по плитке — нарушитель (бейдж «Н»), 2-й тап по номеру — отбывающий («О»).
// Повторный тап по нарушителю снимает весь выбор, по отбывающему — только его.
// Отбывающий в статистику не идёт, это фиксация в протоколе.
//
// value/onSelect работают с объектом { type: ''|'player'|'team'|'official', jersey, server }:
// jersey — номер нарушителя (для type='player'), server — номер отбывающего или ''.

export const PENALTY_OFFENDER_LABELS = { team: 'К', official: 'ОПК' };

const EMPTY = { type: '', jersey: '', server: '' };

// Подпись для поля/ячейки: «12», «12/44», «К», «К/9», «ОПК/75»
export const formatPenaltyOffender = (who) => {
  if (!who || !who.type) return '';
  const head = who.type === 'player' ? String(who.jersey || '') : (PENALTY_OFFENDER_LABELS[who.type] || '');
  if (!head) return '';
  return who.server ? `${head} / ${who.server}` : head;
};

// Бейдж «Н»/«О» на углу плитки с номером игрока. У «К»/«ОПК» бейджа нет: там и так
// понятно, что это нарушитель — номером они быть не могут.
const Badge = ({ children }) => (
  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-graphite text-white text-[10px] font-black flex items-center justify-center shadow-sm">
    {children}
  </span>
);

export function PenaltyOffenderModal({ isOpen, onClose, title = 'Нарушитель', options = [], value, onSelect }) {
  const [who, setWho] = useState(EMPTY);

  // Каждое открытие — от сохранённого значения, а не от прошлого недосохранённого выбора
  useEffect(() => { if (isOpen) setWho({ ...EMPTY, ...(value || {}) }); }, [isOpen, value]);

  const isOffenderNumber = (n) => who.type === 'player' && String(who.jersey) === String(n);
  const isServerNumber = (n) => String(who.server) === String(n);

  const tapNumber = (n) => {
    if (isOffenderNumber(n)) { setWho(EMPTY); return; }
    if (isServerNumber(n)) { setWho(prev => ({ ...prev, server: '' })); return; }
    if (!who.type) { setWho({ type: 'player', jersey: n, server: '' }); return; }
    // Нарушитель уже выбран (игрок, К или ОПК) — второй номер идёт отбывающим
    setWho(prev => ({ ...prev, server: n }));
  };

  const tapSpecial = (type) => {
    if (who.type === type) { setWho(EMPTY); return; }
    setWho(prev => ({ type, jersey: '', server: prev.server }));
  };

  const commit = () => {
    onSelect(who.type ? who : EMPTY);
    onClose();
  };

  const summary = formatPenaltyOffender(who);
  const tileBase = 'relative h-16 rounded-md border flex items-center justify-center font-bold transition-colors';
  const tileIdle = 'border-graphite/20 text-graphite hover:border-orange hover:bg-orange/5 hover:text-orange';
  const tileOffender = 'border-orange bg-orange text-white shadow-sm';
  const tileServer = 'border-status-pending bg-status-pending text-white shadow-sm';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="medium">
      <div className="grid grid-cols-5 gap-2">
        {options.map((opt) => {
          const offender = isOffenderNumber(opt.value);
          const server = isServerNumber(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => tapNumber(opt.value)}
              className={`${tileBase} text-[18px] ${offender ? tileOffender : server ? tileServer : tileIdle}`}
            >
              {opt.label}
              {offender && <Badge>Н</Badge>}
              {server && <Badge>О</Badge>}
            </button>
          );
        })}
        {/* Командный штраф и штраф представителю — в конце, после всех номеров */}
        {Object.entries(PENALTY_OFFENDER_LABELS).map(([type, label]) => (
          <button
            key={type}
            type="button"
            onClick={() => tapSpecial(type)}
            title={type === 'team' ? 'Командный штраф' : 'Официальный представитель команды'}
            className={`${tileBase} text-[15px] uppercase tracking-wide ${who.type === type ? tileOffender : tileIdle}`}
          >
            {label}
          </button>
        ))}
      </div>
      {options.length === 0 && (
        <div className="text-center text-graphite/40 text-sm font-medium py-6">Нет доступных номеров</div>
      )}

      <div className="mt-5 pt-4 border-t border-graphite/10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-graphite/40">Нарушитель / отбывающий</div>
          <div className={`text-[20px] font-black leading-tight ${summary ? 'text-graphite' : 'text-graphite/30'}`}>{summary || '—'}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setWho(EMPTY)}
            disabled={!who.type}
            className="px-4 py-2.5 rounded-md text-[13px] font-bold text-graphite/60 hover:text-status-rejected hover:bg-status-rejected/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Очистить
          </button>
          <Button onClick={commit}>Сохранить</Button>
        </div>
      </div>
    </Modal>
  );
}
