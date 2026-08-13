import { PERMISSIONS, ROLES } from './permissions';

/**
 * Единый реестр пунктов бокового меню LMS.
 *
 * По нему рисуется сам Sidebar и список настройки в шторке профиля — чтобы
 * «доступно по роли» считалось в одном месте и два списка не разъезжались.
 *
 * Раскладка пользователя хранится ключами (key), а не индексами: перестановка
 * пунктов в этом файле её не ломает, а удалённый отсюда пункт просто
 * выбрасывается при сборке.
 *
 * permission: null — пункт виден всем (Справочник).
 * requiresSdkMode — пункт живёт только в лигах, где дисквалификации ведутся
 * через СДК; одного права роли для него мало.
 */
export const SIDEBAR_ITEMS = [
  { key: 'games',              name: 'Расписание',       path: '/games',              icon: 'matches',            permission: 'SCHEDULE_VIEW' },
  { key: 'divisions',          name: 'Дивизионы',        path: '/divisions',          icon: 'divisions',          permission: 'DIVISIONS_VIEW' },
  { key: 'transfers',          name: 'Трансферы',        path: '/transfers',          icon: 'transfers',          permission: 'TRANSFERS_VIEW' },
  { key: 'disqualifications',  name: 'Дисквалификации',  path: '/disqualifications',  icon: 'disqualifications',  permission: 'DISQUALIFICATIONS_VIEW' },
  { key: 'sdk_meetings',       name: 'Заседания СДК',    path: '/sdk-meetings',       icon: 'roster',             permission: 'SDK_MEETINGS_VIEW', requiresSdkMode: true },
  { key: 'handbook',           name: 'Справочник',       path: '/handbook',           icon: 'handbook',           permission: null },
  { key: 'settings',           name: 'Управление лигой', path: '/settings',           icon: 'settings',           permission: 'SETTINGS_STAFF_VIEW' },

  // Разделы глобального админа. Отдельной группой в коде больше не выделены:
  // это те же пункты списка, а черта перед «Реестром» стоит в раскладке по
  // умолчанию — её можно передвинуть или убрать, как любой другой разделитель.
  // Право у каждого своё, как и в роутере App.jsx: у всех четырёх это пустой
  // список ролей, то есть доступ только у глобального админа.
  { key: 'registry',           name: 'Реестр',           path: '/registry',           icon: 'registry',           permission: 'GLOBAL_REGISTRY_ACCESS' },
  { key: 'teams',              name: 'Команды',          path: '/teams',              icon: 'users',              permission: 'TEAM_MANAGEMENT_ACCESS' },
  { key: 'metrics',            name: 'Метрика',          path: '/metrics',            icon: 'metrics',            permission: 'METRICS_ACCESS' },
  { key: 'leagueless_matches', name: 'Товарки',          path: '/leagueless-matches', icon: 'handshake',          permission: 'LEAGUELESS_MATCHES_ACCESS' },
];

// Перед этим пунктом в раскладке по умолчанию стоит разделитель — та самая черта,
// что раньше отделяла блок глобального админа.
const DEFAULT_DIVIDER_BEFORE = 'registry';

const itemByKey = Object.fromEntries(SIDEBAR_ITEMS.map(i => [i.key, i]));

/**
 * Право на пункт меню. Повторяет проверку из App.jsx: глобальный админ видит всё,
 * остальным нужно совпадение роли в выбранной лиге.
 */
export const hasMenuAccess = (user, league, permission) => {
  if (!permission) return true;
  if (!user) return false;
  if (user.globalRole === ROLES.GLOBAL_ADMIN) return true;

  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles || allowedRoles.length === 0) return false;

  const userRoles = league?.role ? league.role.split(',').map(r => r.trim()).filter(Boolean) : [];
  return userRoles.some(role => allowedRoles.includes(role));
};

/** Пункты, доступные пользователю в текущей лиге, в порядке реестра. */
export const getAvailableSidebarItems = (user, league) => SIDEBAR_ITEMS.filter(item => {
  if (item.requiresSdkMode && league?.disqualification_mode !== 'sdk') return false;
  return hasMenuAccess(user, league, item.permission);
});

let dividerSeq = 0;
const makeDivider = () => ({ type: 'divider', id: `divider-${++dividerSeq}` });

/**
 * Сводит сохранённую раскладку с тем, что пользователю реально доступно.
 *
 * - пункт без доступа (или выброшенный из реестра) в результат не попадает;
 * - доступный пункт, которого в сохранённой раскладке нет, дописывается в конец:
 *   так новый раздел системы не пропадёт у тех, кто уже настроил меню под себя;
 * - пустая раскладка означает «настроек нет» — отдаём порядок по умолчанию.
 *
 * Возвращает массив записей: { type: 'item', key, hidden, item } либо
 * { type: 'divider', id }. id разделителя живёт только в текущей сессии —
 * он нужен для React и перетаскивания, в базу не уезжает.
 */
export const resolveSidebarLayout = (storedLayout, availableItems) => {
  const availableKeys = availableItems.map(i => i.key);
  const stored = Array.isArray(storedLayout) ? storedLayout : [];

  if (stored.length === 0) {
    return availableItems.flatMap(item => (
      item.key === DEFAULT_DIVIDER_BEFORE
        ? [makeDivider(), { type: 'item', key: item.key, hidden: false, item }]
        : [{ type: 'item', key: item.key, hidden: false, item }]
    ));
  }

  const seen = new Set();
  const entries = [];

  for (const entry of stored) {
    if (entry?.type === 'divider') {
      entries.push(makeDivider());
      continue;
    }
    const key = entry?.key;
    if (!key || seen.has(key) || !availableKeys.includes(key)) continue;
    seen.add(key);
    entries.push({ type: 'item', key, hidden: !!entry.hidden, item: itemByKey[key] });
  }

  for (const item of availableItems) {
    if (!seen.has(item.key)) {
      entries.push({ type: 'item', key: item.key, hidden: false, item });
    }
  }

  return entries;
};

/**
 * Готовит раскладку к отрисовке в сайдбаре: убирает скрытые пункты и приводит
 * разделители в порядок — без задвоений, без черты в самом верху и в самом низу.
 */
export const layoutForRender = (entries) => {
  const visible = entries.filter(e => e.type === 'divider' || !e.hidden);
  const result = [];

  for (const entry of visible) {
    if (entry.type !== 'divider') { result.push(entry); continue; }
    if (result.length === 0) continue;
    if (result[result.length - 1].type === 'divider') continue;
    result.push(entry);
  }
  while (result.length > 0 && result[result.length - 1].type === 'divider') result.pop();

  return result;
};

/** То, что уходит в базу: ключ, флаг скрытия и позиции разделителей. */
export const serializeSidebarLayout = (entries) => entries.map(entry => (
  entry.type === 'divider'
    ? { type: 'divider' }
    : { type: 'item', key: entry.key, hidden: !!entry.hidden }
));

export const createDividerEntry = makeDivider;
