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
