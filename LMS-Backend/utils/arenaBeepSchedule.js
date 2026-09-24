// LMS-Backend/utils/arenaBeepSchedule.js
// Сценарий бипа диктора арены (leagues.arena_beep_schedule): отметки времени от начала
// периода, в секундах, по номеру периода — {"1": [300, 600, 900], "2": [630, 720]}.
//
// Сценарий один на все дивизионы лиги. У дивизиона с двумя периодами строка третьего
// просто не срабатывает, а отметка позже конца периода не наступает — таймер
// останавливается раньше.

export const BEEP_SCHEDULE_PERIODS = ['1', '2', '3'];

const MAX_MARK_SECONDS = 99 * 60 + 59; // потолок поля «мм:сс»

// Только число или строка с числом: Number(null) и Number('') дают 0, и пустое
// значение превратилось бы в бип на 0:00.
const toSeconds = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN);

// Приводит что угодно к виду {"1": [...], "2": [...], "3": [...]}: целые секунды без
// повторов, по возрастанию. Мусор отбрасываем молча — колонку можно поправить и руками.
export const normalizeBeepSchedule = (raw) => {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(BEEP_SCHEDULE_PERIODS.map((period) => {
    const list = Array.isArray(src[period]) ? src[period] : [];
    const marks = [...new Set(list.map(toSeconds))]
      .filter((s) => Number.isInteger(s) && s >= 0 && s <= MAX_MARK_SECONDS)
      .sort((a, b) => a - b);
    return [period, marks];
  }));
};

// ─── БИП ПЕРЕД КОНЦОМ ПЕРИОДА И УДАЛЕНИЯ ─────────────────────────────────────
// Кроме отметок сценария бип подаётся за заданное время до конца периода и до конца
// удаления. Всё в секундах «до конца», NULL — такого бипа нет:
//   arena_beep_before_period_end      — 1-й и 2-й период (все, кроме последнего);
//   arena_beep_before_last_period_end — последний: у дивизиона с двумя периодами это 2-й;
//   arena_beep_before_penalty_end     — удаления, при которых команда в меньшинстве, —
//                                       те же, что бейджи под таймером у секретаря.
// arena_beep_always — режим обоих бипов: true — звучат всегда; false — молчат, если в
// матче включён голос диктора. На отметки сценария режим не действует.
//
// Ноль перед концом периода — это уже сирена, поэтому там минимум секунда. Удаление
// можно отметить и в сам момент окончания: игровое время после него идёт дальше.
export const BEEP_LEAD_FIELDS = {
  beforePeriodEnd:     { column: 'arena_beep_before_period_end',      min: 1, label: 'до конца периода' },
  beforeLastPeriodEnd: { column: 'arena_beep_before_last_period_end', min: 1, label: 'до конца последнего периода' },
  beforePenaltyEnd:    { column: 'arena_beep_before_penalty_end',     min: 0, label: 'до конца удаления' },
};

const toLead = (v, min) => {
  const s = toSeconds(v);
  return Number.isInteger(s) && s >= min && s <= MAX_MARK_SECONDS ? s : null;
};

// Строка leagues → настройки для панели и тикера диктора. Мусор в колонке значит
// «бипа нет» — как и с отметками сценария.
export const normalizeBeepLeads = (row) => ({
  ...Object.fromEntries(Object.entries(BEEP_LEAD_FIELDS).map(([key, f]) => [key, toLead(row?.[f.column], f.min)])),
  always: row?.arena_beep_always === true,
});

// Тело запроса из карточки лиги → значения колонок. В отличие от чтения здесь мусор не
// глотаем: администратор ввёл время и должен узнать, что оно не сохранилось.
// Возвращает { values } или { error }.
export const parseBeepLeads = (body) => {
  const values = {};
  for (const [key, f] of Object.entries(BEEP_LEAD_FIELDS)) {
    const raw = body?.[key];
    if (raw === null || raw === undefined || raw === '') { values[f.column] = null; continue; }
    const lead = toLead(raw, f.min);
    if (lead === null) return { error: `Некорректное время бипа ${f.label}` };
    values[f.column] = lead;
  }
  if (typeof body?.always !== 'boolean') return { error: 'Не указан режим бипа' };
  values.arena_beep_always = body.always;
  return { values };
};
