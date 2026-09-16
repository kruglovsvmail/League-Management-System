// Обозначения обязательной экипировки рядом с фамилией игрока в составах.
//
// Два правила, оба включаются в настройках лиги («Параметры») и оба настраиваются:
//   «ушк» — моложе N лет: нужна защита ушей и шеи плюс капа. Порог в годах.
//   «к»   — родившимся после указанной даты: нужна капа. Порог датой, а не возрастом,
//           потому что в регламенте он записан именно так — «после 31.12.1998».
//
// Возраст считается на сегодня, одинаково во всех экранах: и в составе дивизиона, и в
// заявке на матч, и в панели секретаря. На дату матча не считаем намеренно — иначе один
// и тот же человек был бы помечен по-разному в соседних окнах.
//
// Значок один: «ушк» уже включает капу, поэтому у тех, кто моложе N лет, «к» не показываем.
//
// Вратарям значков нет вовсе: они и так играют в полной защитной маске, ей отдельные
// уши, шея и капа не нужны. Позиция — свойство заявки или расстановки, а не человека,
// поэтому один и тот же игрок, вратарь в одной команде и полевой в другой, помечается
// в каждом окне по тому, кем он играет именно там.

export const EQUIPMENT_MARKS = {
  ushk: {
    code: 'ушк',
    title: 'Уши, шея, капа',
    text: 'Игроку нужна защита ушей и шеи, а также капа.',
  },
  mouthguard: {
    code: 'к',
    title: 'Капа',
    text: 'Игроку нужна капа.',
  },
};

// Полных лет на сегодня. Дата приходит строкой 'YYYY-MM-DD' — разбираем её сами,
// чтобы не создавать Date и не ловить сдвиг на день из-за часового пояса.
export const fullYearsOld = (birthDate) => {
  const iso = String(birthDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;

  const [year, month, day] = iso.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - year;
  const hadBirthday = (now.getMonth() + 1 > month) || (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!hadBirthday) age -= 1;
  return age;
};

// Позиция приходит в двух кодировках: в составах — 'goalie'/'defense'/'forward',
// в расстановке на матч и протоколе — линии 'G'/'LD'/'RD'/'LW'/'C'/'RW'. Неизвестная
// (человек ещё ни в одной команде, представитель штаба) вратарём не считается.
export const isGoaliePosition = (position) => {
  const p = String(position || '').toUpperCase();
  return p === 'GOALIE' || p === 'G';
};

/**
 * Какое обозначение показать игроку. null — никакого: правила выключены в лиге,
 * даты рождения нет, игрок вратарь или ни под одно правило не подпадает.
 */
export const getEquipmentMark = (birthDate, league, position) => {
  if (!league) return null;
  if (isGoaliePosition(position)) return null;

  const iso = String(birthDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;

  if (league.equip_mark_ushk_enabled) {
    const age = fullYearsOld(iso);
    const maxAge = Number(league.equip_mark_ushk_max_age ?? 20);
    if (age !== null && age < maxAge) {
      return { ...EQUIPMENT_MARKS.ushk, text: `${EQUIPMENT_MARKS.ushk.text} Правило действует до ${maxAge} лет.` };
    }
  }

  if (league.equip_mark_mouthguard_enabled) {
    // Строки 'YYYY-MM-DD' сравниваются лексикографически — это то же, что сравнение дат
    const bornAfter = String(league.equip_mark_mouthguard_born_after || '').slice(0, 10);
    if (bornAfter && iso > bornAfter) {
      const [y, m, d] = bornAfter.split('-');
      return { ...EQUIPMENT_MARKS.mouthguard, text: `${EQUIPMENT_MARKS.mouthguard.text} Правило действует для родившихся после ${d}.${m}.${y}.` };
    }
  }

  return null;
};
