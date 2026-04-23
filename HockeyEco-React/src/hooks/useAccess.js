// HockeyEco/src/hooks/useAccess.js
import { useOutletContext } from 'react-router-dom';
import { PERMISSIONS, ROLES } from '../utils/permissions';
import dayjs from 'dayjs';

export function useAccess(customUser = null, customLeague = null) {
  let context = {};
  try {
    context = useOutletContext() || {};
  } catch (e) {}

  const user = customUser || context.user || null;
  const selectedLeague = customLeague || context.selectedLeague || null;
  
  const checkAccess = (action, options = {}) => {
    if (!user) return false;
    if (user.globalRole === ROLES.GLOBAL_ADMIN) return true;

    const allowedRoles = PERMISSIONS[action];
    if (!allowedRoles || allowedRoles.length === 0) return false;

    const userRolesStr = selectedLeague?.role || '';
    let currentUserRoles = userRolesStr.split(',').map(r => r.trim()).filter(Boolean);

    const gameStaff = Array.isArray(options) ? options : (options.gameStaff || []);
    
    if (gameStaff.length > 0) {
      const myGameStaffRoles = gameStaff.filter(staff => staff.user_id === user.id);
      myGameStaffRoles.forEach(staff => {
        if (['head_1', 'head_2'].includes(staff.role)) currentUserRoles.push(ROLES.GAME_HEAD);
        if (['linesman_1', 'linesman_2'].includes(staff.role)) currentUserRoles.push(ROLES.GAME_LINESMAN);
        if (staff.role === 'scorekeeper') currentUserRoles.push(ROLES.GAME_SECRETARY);
        if (staff.role === 'media' || staff.type === 'media') currentUserRoles.push(ROLES.GAME_MEDIA);
      });
    }

    return currentUserRoles.some(role => allowedRoles.includes(role));
  };

  // ============================================================================
  // СПЕЦИАЛЬНАЯ ПРОВЕРКА ДЛЯ ПАНЕЛИ СЕКРЕТАРЯ (С УЧЕТОМ ВРЕМЕНИ И ПОДПИСИ)
  // ============================================================================
  const checkMatchEditAccess = (game, gameStaff = []) => {
    if (!user || !game) return { hasAccess: false, reason: 'Нет данных' };
    
    // Админы и менеджеры лиги могут редактировать всегда
    if (user.globalRole === ROLES.GLOBAL_ADMIN) return { hasAccess: true };
    const userRolesStr = selectedLeague?.role || '';
    const roles = userRolesStr.split(',').map(r => r.trim()).filter(Boolean);
    if (roles.includes(ROLES.TOP_MANAGER) || roles.includes(ROLES.LEAGUE_ADMIN)) {
        return { hasAccess: true };
    }

    // Проверяем, является ли пользователь персоналом матча
    const isStaff = gameStaff.some(staff => staff.user_id === user.id && ['scorekeeper', 'head_1', 'head_2', 'linesman_1', 'linesman_2'].includes(staff.role));
    
    if (isStaff) {
        // Проверка 1: Дата матча
        if (!game.game_date) {
            return { hasAccess: false, reason: 'Дата и время матча не назначены' };
        }

        // Проверка 2: Окно 18 часов
        const gameTime = dayjs(game.game_date);
        const now = dayjs();
        const hoursDiff = gameTime.diff(now, 'hour', true);

        if (hoursDiff > 18) {
            return { 
                hasAccess: false, 
                reason: `Панель откроется за 18 часов (осталось: ${Math.floor(hoursDiff - 18)} ч.)` 
            };
        }

        // Проверка 3: Подпись протокола
        if (game.is_protocol_signed) {
            return { hasAccess: false, reason: 'Протокол подписан. Режим чтения.' };
        }

        return { hasAccess: true };
    }

    // Если вообще не имеет отношения к матчу
    return { hasAccess: false, reason: 'Нет доступа' };
  };

  return { user, selectedLeague, checkAccess, checkMatchEditAccess };
}