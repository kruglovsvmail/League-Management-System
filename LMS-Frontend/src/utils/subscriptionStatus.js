// Подписка Team Room по дате окончания — для раздела «Подписки».
//
// Пороги те же, что видит человек в самом TR (TR-Frontend/src/utils/subscription.js) и что
// считает сервер (subscriptionsController, STATUS_WHERE): меньше недели до конца —
// «истекает», это всё ещё действующая подписка.
export const EXPIRING_DAYS = 7;
const DAY_MS = 86400000;

export const subscriptionStatus = (expiresAt) => {
  if (!expiresAt) return 'never';
  const left = new Date(expiresAt).getTime() - Date.now();
  if (left <= 0) return 'expired';
  if (left <= EXPIRING_DAYS * DAY_MS) return 'expiring';
  return 'active';
};

export const STATUS_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Действуют' },
  { value: 'expiring', label: `Истекают за ${EXPIRING_DAYS} дней` },
  { value: 'expired', label: 'Истекли' },
  { value: 'never', label: 'Не было' },
];

export const pluralRu = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

export const peopleLabel = (n) => `${n} ${pluralRu(n, 'человек', 'человека', 'человек')}`;
export const daysLabel = (n) => `${n} ${pluralRu(n, 'день', 'дня', 'дней')}`;
export const monthsLabel = (n) => `${n} ${pluralRu(n, 'месяц', 'месяца', 'месяцев')}`;

// Даты — по часам браузера: так же их показывает и сам TR, по часам устройства
const pad = (n) => String(n).padStart(2, '0');

export const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export const formatDateTime = (value) => {
  const date = formatDate(value);
  if (!date) return '';
  const d = new Date(value);
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// «До 31.12» — конец выбранного дня по часам того, кто ставит дату. Игроки в том же
// часовом поясе увидят в TR ровно эту дату; московский конец дня у игрока в +5 выглядел
// бы как «до 01.01».
export const endOfDayIso = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
};

// Короткая подпись даты окончания для таблицы и шторок
export const describeExpiry = (expiresAt) => {
  const status = subscriptionStatus(expiresAt);
  if (status === 'never') return { status, text: 'Не было' };
  const date = formatDate(expiresAt);
  if (status === 'expired') return { status, text: `Истекла ${date}` };
  if (status === 'expiring') {
    const days = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));
    return { status, text: `до ${date}`, hint: `через ${daysLabel(days)}` };
  }
  return { status, text: `до ${date}` };
};

export const EXPIRY_TONE = {
  active: 'text-graphite',
  expiring: 'text-status-pending',
  expired: 'text-status-rejected',
  never: 'text-graphite/40',
};

// ── Журнал: что сделала операция и кому — словами ─────────────────────────────
const USER_TYPE_LABELS = { 1: 'реальные', 2: 'виртуальные' };
const STATUS_LABELS = Object.fromEntries(STATUS_FILTERS.map(s => [s.value, s.label.toLowerCase()]));

export const describeAction = (op) => {
  const p = op?.params || {};
  if (op?.action === 'extend') return `Продление на ${p.unit === 'days' ? daysLabel(p.amount) : monthsLabel(p.amount)}`;
  if (op?.action === 'set') return `Дата окончания ${formatDate(p.until)}${p.noShorten ? ', без сокращения' : ''}`;
  if (op?.action === 'disable') return 'Отключение';
  if (op?.action === 'undo') return `Отмена операции №${op.undo_of}`;
  return op?.action || '';
};

export const describeTarget = (target) => {
  if (!target) return '';
  if (target.type === 'users') return `Отмеченные: ${peopleLabel(target.count)}`;
  if (target.type === 'teams') {
    const who = target.includeStaff ? 'игроки, штаб и владельцы' : 'только игроки';
    return `Команды: ${(target.teamNames || []).join(', ') || '—'} · ${who}`;
  }
  const f = target.filter || {};
  const parts = [];
  if (f.status && f.status !== 'all') parts.push(STATUS_LABELS[f.status]);
  if (target.teamName) parts.push(`команда «${target.teamName}»`);
  if (USER_TYPE_LABELS[f.type]) parts.push(USER_TYPE_LABELS[f.type]);
  if (f.q) parts.push(`поиск «${f.q}»`);
  return parts.length ? `По фильтру: ${parts.join(', ')}` : 'Все пользователи';
};
