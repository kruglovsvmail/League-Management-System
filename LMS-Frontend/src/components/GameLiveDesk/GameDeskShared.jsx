// src/components/GameLiveDesk/GameDeskShared.jsx
import React, { useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { NumberPickerModal } from '../../ui/NumberPickerModal';
import { OptionListModal } from '../../ui/OptionListModal';
import { PenaltyOffenderModal, formatPenaltyOffender } from '../../ui/PenaltyOffenderModal';
import { TimeInputModal } from '../../ui/TimeInputModal';

// --- Утилиты форматирования ---
export const formatTime = (seconds) => {
  if (seconds === null || seconds === undefined) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const parseTime = (timeStr) => {
  if (!timeStr) return null;
  const cleanStr = timeStr.replace(/[^\d:]/g, '');
  if (!cleanStr) return null;
  const parts = cleanStr.split(':');
  if (parts.length === 2) return parseInt(parts[0] || 0, 10) * 60 + parseInt(parts[1] || 0, 10);
  return parseInt(cleanStr, 10) || 0;
};

export const formatTimeMask = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return digits;
};

export const localizePosition = (pos) => {
  if (!pos) return '';
  const p = pos.toUpperCase();
  if (['C', 'LW', 'RW', 'FORWARD'].includes(p)) return 'Нап.';
  if (['LD', 'RD', 'DEFENSE'].includes(p)) return 'Защ.';
  if (['G', 'GOALIE'].includes(p)) return 'Вр.';
  return pos;
};

// Порядок состава в панели секретаря: вратари → защитники → нападающие, внутри
// амплуа по алфавиту. Амплуа берём то же, что показываем в протоколе, —
// позицию в звене на этот матч, а не из профиля игрока.
const POSITION_GROUP = { 'Вр.': 1, 'Защ.': 2, 'Нап.': 3 };
export const sortRosterByPosition = (roster) => [...roster].sort((a, b) => {
  const byPos = (POSITION_GROUP[localizePosition(a.position_in_line || a.position)] || 99)
              - (POSITION_GROUP[localizePosition(b.position_in_line || b.position)] || 99);
  if (byPos !== 0) return byPos;
  return `${a.last_name || ''} ${a.first_name || ''}`.localeCompare(`${b.last_name || ''} ${b.first_name || ''}`, 'ru');
});

// Порядок плиток с номерами в модалках выбора игрока (автор гола, ассистенты,
// нарушитель, +/-): сначала вратари, дальше остальные по возрастанию номера.
// На плитке только номер, и искать его секретарь будет по номеру, а не по амплуа и фамилии,
// как в графе состава (sortRosterByPosition). Номер не обязан быть числом («00») —
// нечисловые встают в начало своей группы, как нули.
const isGoalie = (p) => localizePosition(p.position_in_line || p.position) === 'Вр.';
export const sortRosterByNumber = (roster) => [...roster].sort((a, b) => {
  const byRole = (isGoalie(a) ? 0 : 1) - (isGoalie(b) ? 0 : 1);
  if (byRole !== 0) return byRole;
  return (parseInt(a.jersey_number, 10) || 0) - (parseInt(b.jersey_number, 10) || 0);
});

// --- Логика таймеров и штрафов ---
export const getPeriodLimits = (period, pLen, otLen, pCount = 3) => {
  const p = parseInt(pLen, 10) || 20;
  const o = isNaN(parseInt(otLen, 10)) ? 5 : parseInt(otLen, 10);
  const c = parseInt(pCount, 10) || 3;
  
  const regTime = p * c * 60;
  const soTime = regTime + (o * 60);
  
  if (period === 'OT') return { start: regTime, end: soTime };
  if (period === 'SO') return { start: soTime, end: soTime };
  
  const periodNum = parseInt(period, 10);
  if (!isNaN(periodNum) && periodNum >= 1 && periodNum <= c) {
    return { start: (periodNum - 1) * p * 60, end: periodNum * p * 60 };
  }
  
  return { start: 0, end: 0 };
};

export const calculatePeriodFromTime = (seconds, pLen, otLen, pCount = 3) => {
  const p = parseInt(pLen, 10) || 20;
  const o = isNaN(parseInt(otLen, 10)) ? 5 : parseInt(otLen, 10);
  const c = parseInt(pCount, 10) || 3;
  
  if (seconds === null || seconds === undefined) return '1';
  
  for (let i = 1; i <= c; i++) {
    if (seconds <= i * p * 60) return String(i);
  }

  const regTime = p * c * 60;
  const otTime = regTime + (o * 60);

  if (o > 0 && seconds <= otTime) return 'OT';
  return 'SO';
};

// ─── ВИДЫ ШТРАФОВ ────────────────────────────────────────────────────────────
// Секретарь выбирает вид, а строк протокола получается столько, сколько у вида:
// «4» — две строки по 2, «2+10» — двойка и десятка, «5+20» — пятёрка и двадцатка.
// Каждая строка — своё событие со своей причиной, началом и окончанием; вместе их
// держит penalty_group_id (id первой строки) и penalty_group_seq. Зеркало
// LMS-Backend/utils/penaltyGroups.js — набор строк и классы должны совпадать.
//
// Строки группы идут цепочкой: следующая начинается, когда закончилась предыдущая.
// onIce — строка занимает слот меньшинства (малый, большой); дисциплинарные 10 и 20
// на лёд не влияют. needsServer — в этой строке может сидеть партнёр за нарушителя:
// сам он на десятке или удалён, а у малого и двойного малого — нарушил вратарь,
// нарушитель травмирован, штраф командный или представителя. Отбывающий из формы
// пишется только в такие строки.
//
// Причина у штрафа ОДНА: секретарь выбирает её для строк меньшинства (у «4» — одна на
// обе двойки). fixedReason — строка получает свою причину сама, выбрать нельзя: десятка
// в «2+10» и «4+10», двадцатка в «5+20». defaultReason — у одиночных «10» и «20» та же
// дисциплинарная причина стоит предвыбором, секретарь может сменить.

// Дисциплинарные причины — всегда эти, какой бы ни был справочник причин лиги.
// Формулировки совпадают со встроенным справочником (PENALTY_REASONS ниже).
export const MISCONDUCT_REASON = { title: 'Дисциплинарный штраф', code: 'ДИСЦ' };
export const GAME_MISCONDUCT_REASON = { title: 'Дисциплинарный до конца матча штраф', code: 'ДИС-КН' };
export const AUTO_PENALTY_REASONS = [MISCONDUCT_REASON, GAME_MISCONDUCT_REASON];

export const PENALTY_KINDS = {
  minor:                   { label: '2',    title: 'Малый штраф', rows: [{ minutes: 2, cls: 'minor', needsServer: true }] },
  double_minor:            { label: '4',    title: 'Двойной малый штраф', rows: [{ minutes: 2, cls: 'minor', needsServer: true }, { minutes: 2, cls: 'minor', needsServer: true }] },
  misconduct:              { label: '10',   title: 'Дисциплинарный штраф', rows: [{ minutes: 10, cls: 'misconduct' }], defaultReason: MISCONDUCT_REASON },
  minor_misconduct:        { label: '2+10', title: 'Малый + дисциплинарный штраф', rows: [{ minutes: 2, cls: 'minor', needsServer: true }, { minutes: 10, cls: 'misconduct', fixedReason: MISCONDUCT_REASON }] },
  double_minor_misconduct: { label: '4+10', title: 'Двойной малый + дисциплинарный штраф', rows: [{ minutes: 2, cls: 'minor', needsServer: true }, { minutes: 2, cls: 'minor', needsServer: true }, { minutes: 10, cls: 'misconduct', fixedReason: MISCONDUCT_REASON }] },
  game_misconduct:         { label: '20',   title: 'Дисциплинарный штраф до конца матча', rows: [{ minutes: 20, cls: 'game_misconduct' }], defaultReason: GAME_MISCONDUCT_REASON },
  major:                   { label: '5+20', title: 'Большой штраф + дисцип. до конца матча', rows: [{ minutes: 5, cls: 'major', needsServer: true }, { minutes: 20, cls: 'game_misconduct', fixedReason: GAME_MISCONDUCT_REASON }] },
  penalty_shot:            { label: 'ШБ',   title: 'Штрафной бросок', rows: [{ minutes: 0, cls: 'penalty_shot' }] },
};
export const PENALTY_KIND_ORDER = ['minor', 'double_minor', 'misconduct', 'minor_misconduct', 'double_minor_misconduct', 'game_misconduct', 'major', 'penalty_shot'];
// label — минуты (в поле и в списке жирно), description — пояснение бледнее
export const penaltyKindOptions = PENALTY_KIND_ORDER.map(k => ({ value: k, label: PENALTY_KINDS[k].label, shortLabel: PENALTY_KINDS[k].label, description: PENALTY_KINDS[k].title }));

// Классы строк, занимающие слот меньшинства. Старые записи (одна строка на 4 или 25
// минут, класс double_minor/match) — тоже слот: там вся группа лежала в одной строке.
const ON_ICE_CLASSES = ['minor', 'major', 'double_minor', 'match'];
export const isOnIceRow = (p) => {
  if (p?.penalty_class) return ON_ICE_CLASSES.includes(p.penalty_class);
  return [2, 4, 5, 25].includes(parseInt(p?.penalty_minutes, 10));
};
// Малый штраф — единственный, который закрывается голом соперника
export const isMinorRow = (p) => p?.penalty_class === 'minor' || p?.penalty_class === 'double_minor'
  || (!p?.penalty_class && [2, 4].includes(parseInt(p?.penalty_minutes, 10)));
// Старая запись двойного малого: 4 минуты одной строкой (до появления групп)
export const isLegacyDoubleMinor = (p) => p?.penalty_class === 'double_minor' || (!p?.penalty_class && parseInt(p?.penalty_minutes, 10) === 4);

// Вид старой записи — по классу и минутам (зеркало legacyPenaltyKind на бэке)
export const penaltyKindOf = (p) => {
  if (!p) return 'minor';
  if (p.penalty_kind) return p.penalty_kind;
  const m = parseInt(p.penalty_minutes, 10);
  if (p.penalty_class === 'penalty_shot') return 'penalty_shot';
  if (p.penalty_class === 'double_minor' || m === 4) return 'double_minor';
  if (p.penalty_class === 'match' || m === 25) return 'match';
  if (p.penalty_class === 'major' || m === 5) return 'legacy_major';
  if (p.penalty_class === 'misconduct' || m === 10) return 'misconduct';
  if (p.penalty_class === 'game_misconduct' || m === 20) return 'game_misconduct';
  return 'minor';
};
// Подпись вида для списков: старые записи без группы подписываются как раньше
const LEGACY_KIND_LABEL = { match: '5+20', legacy_major: '5' };
export const penaltyKindLabel = (p) => {
  const kind = penaltyKindOf(p);
  return PENALTY_KINDS[kind]?.label ?? LEGACY_KIND_LABEL[kind] ?? String(p?.penalty_minutes ?? '');
};

// Ключ группы: id группы, а у старой одиночной записи — её собственный id
export const penaltyGroupKey = (p) => p?.penalty_group_id ?? p?.id;
/**
 * Порядок строк штрафов в протоколе: по времени первой строки группы, а строки одной
 * группы — подряд, по seq. Вторая двойка у 2+2 начинается позже, и без этого между
 * строками одной группы вклинивалось бы чужое удаление, начавшееся в промежутке.
 */
export const sortPenaltyRows = (penalties) => {
  const key = (p) => p.penalty_group_id ?? p.id;
  const seqOf = (p) => Number(p.penalty_group_seq) || 1;
  const first = new Map();
  penalties.forEach(p => {
    const k = key(p);
    const cur = first.get(k);
    if (!cur || seqOf(p) < cur.seq) first.set(k, { seq: seqOf(p), time: parseInt(p.time_seconds, 10) || 0, id: p.id });
  });
  return [...penalties].sort((a, b) => {
    const fa = first.get(key(a)), fb = first.get(key(b));
    return fa.time - fb.time || fa.id - fb.id || seqOf(a) - seqOf(b) || a.id - b.id;
  });
};

export const isContinuationRow = (p) => p?.penalty_group_id != null && Number(p?.penalty_group_seq) > 1;

/**
 * Фактические начало и окончание каждой строки штрафа с учётом слотов меньшинства
 * и цепочек внутри группы.
 *
 * Слотов два на команду: третий малый штраф не начинается, пока не освободится
 * слот (стоит в очереди). Слоты считаются по каждой команде отдельно — раньше
 * список обеих команд делил одни слоты, и штраф гостей мог «ждать» штраф хозяев.
 *
 * Внутри группы строки идут цепочкой: следующая начинается, когда закончилась
 * предыдущая, — так вторая двойка у 2+2 стартует после первой (или после гола,
 * который первую закрыл), а десятка после всех двоек. Двадцатка у 5+20 стоит
 * особняком: начало = время нарушения, окончания нет (effEnd = null).
 *
 * Возвращает те же строки в исходном порядке с полями effStart, effEnd, onIce,
 * chainStart, chainEnd (границы отрезка меньшинства всей группы — для табло).
 */
export const calculatePenaltyTimelines = (penalties) => {
  const byId = new Map();
  const teams = new Map();
  penalties.forEach(p => {
    const teamKey = p.team_id ?? 'x';
    if (!teams.has(teamKey)) teams.set(teamKey, []);
    teams.get(teamKey).push(p);
  });

  teams.forEach(list => {
    // Группы в порядке начала первой строки; внутри группы — по seq
    const groups = new Map();
    list.forEach(p => {
      const key = penaltyGroupKey(p);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    const ordered = [...groups.values()]
      .map(rows => rows.sort((a, b) => (Number(a.penalty_group_seq) || 1) - (Number(b.penalty_group_seq) || 1) || a.id - b.id))
      .sort((a, b) => parseInt(a[0].time_seconds, 10) - parseInt(b[0].time_seconds, 10) || a[0].id - b[0].id);

    const slots = [0, 0];
    ordered.forEach(rows => {
      let cursor = parseInt(rows[0].time_seconds, 10);
      if (isNaN(cursor)) cursor = 0;
      let chainStart = null;
      let chainEnd = null;
      let slotTaken = false;

      rows.forEach(p => {
        const start = parseInt(p.time_seconds, 10);
        const storedEnd = parseInt(p.penalty_end_time, 10);
        const onIce = isOnIceRow(p);

        if (p.penalty_class === 'penalty_shot') {
          const s = isNaN(start) ? 0 : start;
          byId.set(p.id, { ...p, effStart: s, effEnd: s, onIce: false, chainStart: null, chainEnd: null });
          return;
        }
        if (p.penalty_class === 'game_misconduct' || isNaN(storedEnd)) {
          // Удалён до конца матча: считается с момента нарушения, окончания нет
          byId.set(p.id, { ...p, effStart: isNaN(start) ? cursor : start, effEnd: null, onIce: false, chainStart: null, chainEnd: null });
          return;
        }

        const duration = Math.max(0, storedEnd - (isNaN(start) ? cursor : start));
        let effStart = cursor;
        if (onIce && !slotTaken) {
          // Первая строка меньшинства ждёт свободный слот, остальные идут за ней цепочкой
          slots.sort((a, b) => a - b);
          if (slots[0] > effStart) effStart = slots[0];
          slotTaken = true;
        }
        const effEnd = effStart + duration;
        if (onIce) {
          if (chainStart === null) chainStart = effStart;
          // У старого матч-штрафа одной строкой на 25 минут слот занят только 5
          chainEnd = p.penalty_class === 'match' || parseInt(p.penalty_minutes, 10) === 25
            ? effStart + Math.min(duration, 300)
            : effEnd;
        }
        cursor = effEnd;
        byId.set(p.id, { ...p, effStart, effEnd, onIce, chainStart, chainEnd });
      });

      if (chainStart !== null) {
        slots.sort((a, b) => a - b);
        slots[0] = chainEnd;
        // Границы цепочки — одни на всю группу
        rows.forEach(p => {
          const r = byId.get(p.id);
          if (r && r.onIce) byId.set(p.id, { ...r, chainStart, chainEnd });
        });
      }
    });
  });

  return penalties.map(p => byId.get(p.id) || { ...p, effStart: 0, effEnd: 0, onIce: false, chainStart: null, chainEnd: null });
};

/**
 * Позиции табло: одна на группу — отрезок меньшинства целиком (у 2+2 это 4 минуты
 * одним отсчётом, у 2+10 — 2, у 5+20 — 5). Дисциплинарные на табло не выводятся.
 * Возвращает первую строку меньшинства каждой группы с effStart/effEnd = границы цепочки.
 */
export const calculateOnIcePenalties = (penalties) => {
  const rows = calculatePenaltyTimelines(penalties);
  const seen = new Set();
  return rows.filter(p => {
    if (!p.onIce || p.chainStart === null) return false;
    const key = penaltyGroupKey(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(p => ({ ...p, effStart: p.chainStart, effEnd: p.chainEnd }));
};

// --- Справочники ---
// Справочник причин штрафа: номер, сокращение и полное наименование.
// Где что показывается:
//   - модалка выбора — номер + полное наименование (по ним же ищем);
//   - поле секретаря и PDF-протокол — только сокращение (code);
//   - в БД (game_events.penalty_violation) пишется ПОЛНОЕ наименование.
// Полные наименования менять нельзя «просто так»: их читает вслух диктор трансляции
// (PENALTY_REASON_ACCUSATIVE в ttsShared.js) и показывает веб-графика, а в PDF по ним
// подбирается сокращение (PENALTY_REASON_MAP в src/protocols/*). Правка формулировки —
// это правка сразу в четырёх местах плюс миграция уже сохранённых событий.
export const PENALTY_REASONS = [
  { num: 1,  code: 'АГРЕС',    title: 'Агрессор в драке' },
  { num: 2,  code: 'АТ-ГОЛ',   title: 'Атака в голову или шею' },
  { num: 3,  code: 'БЛОК',     title: 'Блокировка' },
  { num: 4,  code: 'БР-КЛ',    title: 'Бросок клюшки и снаряжения' },
  { num: 5,  code: 'ВБ-ШБ',    title: 'Выброс шайбы' },
  { num: 6,  code: 'ГРУБ',     title: 'Грубость' },
  { num: 7,  code: 'ДИС-КН',   title: 'Дисциплинарный до конца матча штраф' },
  { num: 8,  code: 'ДИСЦ',     title: 'Дисциплинарный штраф' },
  { num: 9,  code: 'ДРКА',     title: 'Драка' },
  { num: 10, code: 'ЗД-ИГ',    title: 'Задержка игры' },
  { num: 11, code: 'ЗД-КЛ-СП', title: 'Задержка клюшки соперника' },
  { num: 12, code: 'ЗД-КЛ',    title: 'Задержка клюшкой' },
  { num: 13, code: 'ЗД-СП',    title: 'Задержка соперника' },
  { num: 14, code: 'ЗД-ШБ',    title: 'Задержка шайбы руками' },
  { num: 15, code: 'ЗЧ-ДР',    title: 'Зачинщик драки' },
  { num: 16, code: 'ВП-КЛ',    title: 'Игра высоко поднятой клюшкой' },
  { num: 17, code: 'СЛ-КЛ',    title: 'Игра со сломанной клюшкой' },
  { num: 18, code: 'КЛ-УД',    title: 'Колющий удар' },
  { num: 19, code: 'СК-ШТ',    title: 'Малый скамеечный штраф' },
  { num: 20, code: 'ЧС-СТ',    title: 'Нарушение численного состава' },
  { num: 21, code: 'НП-АТ',    title: 'Неправильная атака' },
  { num: 22, code: 'НС-СН',    title: 'Нестандартное снаряжение' },
  { num: 23, code: 'ОП-СН',    title: 'Опасное снаряжение' },
  { num: 24, code: 'ОП-ДСТ',   title: 'Опасные действия' },
  { num: 25, code: 'НС-ПВ',    title: 'Оскорбление судей и неспортивное поведение' },
  { num: 26, code: 'ОТ-ИГ',    title: 'Отказ начать игру' },
  { num: 27, code: 'ОТСЧ',     title: 'Отсечение' },
  { num: 28, code: 'ПОДЖ',     title: 'Подножка' },
  { num: 29, code: 'ПК-СК',    title: 'Покидание скамейки штрафников / запасных / во время конфликта' },
  { num: 30, code: 'СД-ВР',    title: 'Сдвиг ворот' },
  { num: 31, code: 'СМЛЦ',     title: 'Симуляция' },
  { num: 32, code: 'ТЛ-КЛ',    title: 'Толчок клюшкой' },
  { num: 33, code: 'ТЛ-БР',    title: 'Толчок на борт' },
  { num: 34, code: 'УД-ГОЛ',   title: 'Удар головой' },
  { num: 35, code: 'УД-КЛ',    title: 'Удар клюшкой' },
  { num: 36, code: 'УКС',      title: 'Укус' },
  { num: 37, code: 'УД-К-КЛ',  title: 'Удар концом клюшки' },
  { num: 38, code: 'УД-ЛОК',   title: 'Удар локтем' },
  { num: 39, code: 'УД-НГ',    title: 'Удар ногой' },
  { num: 40, code: 'ФД-ЗРТ',   title: 'Физический контакт со зрителем' },
  // 41 и 42 намеренно делят одно сокращение ШТ-ВР — так в исходном справочнике
  { num: 41, code: 'ШТ-ВР',    title: 'Штрафы вратаря: игра за красной линией, покидание площади ворот в конфликте' },
  { num: 42, code: 'ШТ-ВР',    title: 'Помещающий шайбу на сетку ворот, отправляющийся к скамейке в остановке' },
];

// ОБНОВЛЕННЫЕ СТАТУСЫ ВЗЯТИЯ ВОРОТ
// «Равные составы» в протоколе не пишут — в базе значение остаётся 'equal'
// (стата и PDF на него завязаны), а в панели оно показывается прочерком.
export const GOAL_STRENGTH_DISPLAY = { 
  'equal': '-', 
  'pp1': '+1', 
  'pp2': '+2', 
  'sh1': '-1', 
  'sh2': '-2', 
  'en': 'ПВ', 
  'ps': 'ШБ' 
};

// ШБ здесь намеренно НЕТ: реализованный штрафной бросок — это не ситуация,
// которую секретарь выбирает руками, а исход строки ШБ во «Взятии ворот».
// Оставь его в списке — и появится второй путь ввода, мимо штрафа и мимо
// счётчика назначенных бросков, после чего «% реализации ШБ» начнёт врать.
// Показывать ШБ в уже сохранённой строке всё равно надо, поэтому в
// GOAL_STRENGTH_DISPLAY выше он остаётся.
// Прочерк (равные составы) — последним: это «ничего не отмечать», а не ситуация.
export const goalStrengthOptions = [
  { value: 'pp1', label: '+1' },
  { value: 'pp2', label: '+2' },
  { value: 'sh1', label: '-1' },
  { value: 'sh2', label: '-2' },
  { value: 'en', label: 'ПВ' },
  { value: 'equal', label: '-' }
];

// PENALTY_SHOT_MINS — псевдозначение поля «Шт»: штрафной бросок вместо минут.
// Игрок на скамейку не садится, команда в меньшинстве не остаётся; если по тому
// же эпизоду назначено ещё и удаление, секретарь заводит его отдельной строкой.
export const PENALTY_SHOT_MINS = 'ps';

// Виды штрафа в поле «Шт» — см. PENALTY_KINDS выше (penaltyKindOptions)

// ─── ШТРАФНОЙ БРОСОК ПО ХОДУ МАТЧА ───────────────────────────────────────────
// Три состояния одной строки во «Взятии ворот», и все три — разные типы события:
//   pending_ps — бросок назначен, но ещё не пробит (или секретарь не отметил исход);
//   goal + goal_strength='ps' — реализован, шайба идёт в счёт матча;
//   failed_ps — не реализован, счёт не меняется.
// Неисполненные переписываются в нереализованные при завершении матча —
// висящий pending_ps в статистику уйти не должен.
export const PS_PENDING = 'pending_ps';
export const PS_FAILED  = 'failed_ps';

export const isPenaltyShotEvent = (ev) =>
  !!ev && (ev.event_type === PS_PENDING
        || ev.event_type === PS_FAILED
        || (ev.event_type === 'goal' && ev.goal_strength === 'ps'));

// Гол с назначенного буллита не отменяет чужое удаление и не даёт +/-:
// эпизод разыгрывается один на один, остальные на льду к нему отношения не имеют.
export const isScoredFromPlay = (ev) =>
  !!ev && ev.event_type === 'goal' && ev.goal_strength !== 'ps';

// value — полное наименование (именно оно уходит в БД), label — оно же для модалки,
// shortLabel — сокращение для поля секретаря, num — номер для модалки и поиска.
export const penaltyReasonOptions = PENALTY_REASONS.map(r => ({
  value: r.title,
  label: r.title,
  shortLabel: r.code,
  num: r.num,
}));

// Полное наименование -> сокращение. Нужно там, где причина уже сохранена и выводится
// текстом, а не выбирается из справочника (таблица «Удаления» в протоколе секретаря).
// Нижний блок — формулировки прежнего справочника: они остались в уже сыгранных матчах
// и сведены к ближайшему действующему сокращению.
const PENALTY_CODE_BY_TITLE = {
  ...Object.fromEntries(PENALTY_REASONS.map(r => [r.title, r.code])),
  'Покид. скамейки штрафников во время конфл.': 'ПК-СК',
  'Покид. скамейки запасных во время конфл.': 'ПК-СК',
  'Штр. вр: игра за красной линией': 'ШТ-ВР',
  'Штр. вр: покидание площади ворот в конфликте': 'ШТ-ВР',
  'Штр. вр: помещающий шайбу на сетку ворот': 'ШТ-ВР',
  'Штр. вр: отправился к скамейке в остановке': 'ШТ-ВР',
};

// Незнакомую причину (например, снятую из справочника) возвращаем как есть —
// лучше длинный текст, чем пустая ячейка.
export const getPenaltyReasonCode = (title) => {
  if (!title) return '';
  const trimmed = String(title).trim();
  return PENALTY_CODE_BY_TITLE[trimmed] || trimmed;
};

export const shootoutOptions = [
  { value: 'shootout_goal', label: 'Гол' },
  { value: 'shootout_miss', label: 'Мимо/Вр.' }
];

// --- Device-aware приватные хелперы ---

// Кнопка-триггер, открывающая модалку выбора (десктоп). Серая, слегка скруглённая, лёгкая —
// ширина всегда 100% (диктуется шириной ячейки таблицы). Пусто -> "-".
// dim=true (строка открыта на правку) -> белое поле с оранжевой рамкой: вместе с подсветкой
// ячеек (bg-orange/10) сразу видно, что это режим редактирования, а не просто заполненная строка.
// warn=true (обязательное поле не заполнено — время при выключенной подстановке с таймера)
// -> красноватая рамка и плейсхолдер.
// ghost=true (поле формы нового события) -> белое поле с тонкой рамкой: форма стоит на
// тонированном фоне, и обычное серое поле на нём сливалось бы.
// placeholder — подстановка, которая уйдёт в запись, если ничего не выбрать (время с
// таймера, «Пустые ворота»): рисуется как значение. hint — просто подсказка, что здесь
// вводить («Автор», «Причина»): бледная, в запись не идёт.
export const TriggerButton = ({ onClick, value, options = [], placeholder = '', hint = '', className = '', dim = false, warn = false, ghost = false }) => {
  const selected = options.find(o => String(o.value) === String(value));
  // В самом поле показываем сокращение, если оно задано (причина штрафа), иначе обычный label.
  // Полное наименование при этом остаётся в подсказке при наведении.
  const displayValue = selected ? (selected.shortLabel || selected.label) : (value || '');
  const fullValue = selected ? selected.label : (value || '');
  const hasValue = Boolean(displayValue || placeholder);
  const tone = warn
    ? 'bg-status-rejected/5 ring-1 ring-inset ring-status-rejected/50 hover:bg-status-rejected/10'
    : dim
      ? 'bg-white ring-1 ring-inset ring-orange/50 hover:bg-orange/5'
      : ghost
        ? 'bg-white ring-1 ring-inset ring-graphite/15 hover:ring-orange/50 hover:bg-orange/5'
        : 'bg-graphite/[0.08] hover:bg-graphite/10';
  return (
    <button
      type="button"
      onClick={onClick}
      title={hasValue ? (fullValue || displayValue) : undefined}
      className={`${className} w-full rounded-md overflow-hidden ${tone} transition-colors duration-150 cursor-pointer text-center`}
    >
      {/* span должен быть блочным и с ограниченной шириной — иначе truncate (text-overflow:
          ellipsis) не работает на строчных элементах, и длинная причина штрафа просто
          вылезает за пределы кнопки вместо многоточия. */}
      <span className={`block w-full truncate text-[13px] font-semibold ${warn && !displayValue ? 'text-status-rejected/70' : hasValue ? 'text-graphite' : 'text-graphite/40'}`}>
        {displayValue || placeholder || hint || '-'}
      </span>
    </button>
  );
};

// Настоящий <select> (открывает системный пикер ОС при тапе), но стилизован под ту же
// серую кнопку, что и TriggerButton на десктопе — appearance-none убирает стандартный
// вид браузера (рамку, стрелку), сама выпадашка остаётся нативной.
const NativeSelect = ({ options = [], value, onChange, className = '', placeholder = '', hideEmpty = false }) => (
  <select
    value={value ?? ''}
    onChange={onChange}
    className={`${className} w-full h-[30px] rounded-md border-none bg-graphite/[0.08] px-1 text-[13px] font-semibold text-graphite text-center outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-orange/30`}
  >
    {!hideEmpty && <option value="">{placeholder || '-'}</option>}
    {options.map(opt => (
      <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.description ? `${opt.label} — ${opt.description}` : opt.label}</option>
    ))}
  </select>
);

// --- Компоненты UI ---
// StylishSelect/CustomSelect/StylishInput сохраняют прежний внешний контракт пропсов
// (value/onChange/options|roster/exclude), но внутри рендерят разное в зависимости от устройства:
// мобильный (≤850px + touch) -> системный <select>/ввод, десктоп -> кастомная модалка на базе Modal.jsx.
// taken — номера, занятые в этом же событии другой ролью ({ '7': 'Автор' }): в модалке они
// гаснут с подписью роли под номером, в системном <select> — выключены с подписью.
// Пустые ключи (роль ещё не выбрана) отбрасываются.
export const StylishSelect = ({ value, onChange, exclude = [], taken = {}, className, roster, title, isEditing = false, ghost = false, hint = '' }) => {
  const isMobile = useIsMobile();
  // useState вызывается безусловно (Rules of Hooks) — даже если он не понадобится в мобильной ветке,
  // isMobile может измениться на лету при ресайзе окна через границу 850px.
  const [isOpen, setIsOpen] = useState(false);

  const takenClean = Object.fromEntries(Object.entries(taken).filter(([k]) => k && k !== 'undefined' && k !== 'null'));

  const options = sortRosterByNumber(roster)
    .filter(p => !exclude.includes(String(p.jersey_number)))
    .map(p => {
      const num = String(p.jersey_number);
      const badge = takenClean[num];
      return badge
        ? { value: num, label: `${num} · ${badge}`, disabled: true }
        : { value: num, label: num };
    });

  const mergedClassName = `h-[30px] !py-0 !px-2 ${className || ''}`;

  if (isMobile) {
    return <NativeSelect options={options} value={value} onChange={onChange} className={mergedClassName} />;
  }

  return (
    <>
      <TriggerButton onClick={() => setIsOpen(true)} value={value} options={options} className={mergedClassName} dim={isEditing} ghost={ghost} hint={hint} />
      <NumberPickerModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={title || 'Номер игрока'}
        options={options.map(o => ({ value: o.value, label: o.value }))}
        value={value}
        onSelect={(val) => onChange({ target: { value: val } })}
        taken={takenClean}
      />
    </>
  );
};

// Графа «#» таблицы «Удаления»: нарушитель (номер, «К» или «ОПК») и отбывающий за него.
// value — объект { type, jersey, server } (см. PenaltyOffenderModal), onChange получает
// такой же объект. Модалка одна и на десктопе, и на телефоне: системный <select>
// два значения выбрать не даёт.
export const PenaltyOffenderSelect = ({ value, onChange, roster = [], className, title, isEditing = false, ghost = false, hint = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const options = sortRosterByNumber(roster).map(p => ({ value: String(p.jersey_number), label: String(p.jersey_number) }));
  const label = formatPenaltyOffender(value);

  return (
    <>
      <TriggerButton onClick={() => setIsOpen(true)} value={label} className={`h-[30px] !py-0 !px-2 ${className || ''}`} dim={isEditing} ghost={ghost} hint={hint} />
      <PenaltyOffenderModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={title || 'Нарушитель'}
        options={options}
        value={value}
        onSelect={onChange}
      />
    </>
  );
};

// dense — плотные строки в модалке выбора (длинный справочник причин удаления)
export const CustomSelect = ({ value, onChange, options, className, placeholder = "", hint = '', emptyLabel, title, isEditing = false, hideEmpty = false, dense = false, ghost = false }) => {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const mergedClassName = `h-[30px] !py-0 !px-2 ${className || ''}`;

  if (isMobile) {
    return <NativeSelect options={options} value={value} onChange={onChange} className={mergedClassName} placeholder={placeholder} hideEmpty={hideEmpty} />;
  }

  return (
    <>
      <TriggerButton onClick={() => setIsOpen(true)} value={value} options={options} className={mergedClassName} placeholder={placeholder} hint={hint} dim={isEditing} ghost={ghost} />
      <OptionListModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={title || 'Выбор'}
        options={options}
        value={value}
        onSelect={(val) => onChange({ target: { value: val } })}
        hideEmpty={hideEmpty}
        emptyLabel={emptyLabel || placeholder || undefined}
        dense={dense}
      />
    </>
  );
};

// isTimeField=true -> поле хранит время в формате ММ:СС (formatTimeMask применяется вызывающей
// стороной как и раньше). isTimeField=false (по умолчанию) -> обычное текстовое/числовое поле
// (например счетчик бросков в SummaryTablesAccordion) — рендерится как и раньше, без модалок.
// isRequired=true -> пустое поле подсвечивается как незаполненное (время события при выключенной
// подстановке с таймера: без него событие не сохранить).
// hint — бледная подсказка в поле («Время»); placeholder при этом в поле не показывается,
// но по-прежнему уходит в модалку как значение по умолчанию (время с таймера).
export const StylishInput = ({ value, onChange, placeholder, hint = '', onBlur, className, isTimeField = false, title, isEditing = false, isRequired = false, ghost = false }) => {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const warn = isRequired && !value;
  const plainClassName = `w-full h-[30px] text-center bg-white border border-graphite/20 hover:border-orange focus:bg-white focus:border-orange focus:ring-2 focus:ring-orange/20 shadow-sm rounded-md outline-none placeholder-graphite/40 transition-all text-sm font-mono font-semibold text-graphite ${className || ''}`;
  // Тот же серый стиль, что у NativeSelect/TriggerButton — визуально единообразные "кнопки" в таблице.
  // Настоящего системного пикера для формата ММ:СС (в отличие от ЧЧ:ММ у <input type="time">) не
  // существует — вызов цифровой клавиатуры телефона через inputMode="numeric" и есть системный ввод.
  const mobileTimeClassName = `w-full h-[30px] text-center rounded-md border-none outline-none text-[13px] font-mono font-semibold text-graphite focus:ring-2 focus:ring-orange/30 ${
    warn ? 'bg-status-rejected/5 ring-1 ring-inset ring-status-rejected/50 placeholder-status-rejected/70' : 'bg-graphite/[0.08] placeholder-graphite/40'
  } ${className || ''}`;

  if (isTimeField && isMobile) {
    return (
      <input
        inputMode="numeric"
        pattern="[0-9:]*"
        className={mobileTimeClassName}
        value={value} placeholder={placeholder} onChange={onChange} onBlur={onBlur}
      />
    );
  }

  if (isTimeField && !isMobile) {
    return (
      <>
        <TriggerButton onClick={() => setIsOpen(true)} value={value} placeholder={hint ? '' : placeholder} hint={hint} className={`h-[30px] !py-0 !px-2 ${className || ''}`} dim={isEditing} warn={warn} ghost={ghost} />
        <TimeInputModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title={title || 'Время'}
          value={value}
          // Обязательное время: подсказки «мм:сс» в поле ввода быть не должно — оно не время
          defaultValue={isRequired ? '' : placeholder}
          onSave={(val) => onChange({ target: { value: val } })}
        />
      </>
    );
  }

  return (
    <input
      className={plainClassName}
      value={value} placeholder={placeholder} onChange={onChange} onBlur={onBlur}
    />
  );
};