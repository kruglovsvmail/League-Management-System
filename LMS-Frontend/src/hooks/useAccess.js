// HockeyEco/src/hooks/useAccess.js
import { useOutletContext } from 'react-router-dom';
import { PERMISSIONS, ROLES } from '../utils/permissions';

export function useAccess(customUser = null, customLeague = null) {
  let context = {};
  try {
    context = useOutletContext() || {};
  } catch (e) {}

  const user = customUser || context.user || null;
  const selectedLeague = customLeague || context.selectedLeague || null;
  
  const checkAccess = (action, options = {}) => {
    if (!user) return false;
    
    // Глобальный админ имеет доступ ко всему
    if (user.globalRole === ROLES.GLOBAL_ADMIN) return true;

    const allowedRoles = PERMISSIONS[action];
    if (!allowedRoles || allowedRoles.length === 0) return false;

    // Извлекаем роли пользователя в текущей лиге
    const userRolesStr = selectedLeague?.role || '';
    let currentUserRoles = userRolesStr.split(',').map(r => r.trim()).filter(Boolean);

    // Если это сервисный аккаунт, его основная роль уже заложена в selectedLeague.role 
    // (например, 'service_secretary' или 'service_broadcaster')

    const gameStaff = Array.isArray(options) ? options : (options.gameStaff || []);
    
    // Маппинг ролей из назначений на конкретный матч (game_staff)
    if (gameStaff.length > 0) {
      const myGameStaffRoles = gameStaff.filter(staff => staff.user_id === user.id);
      myGameStaffRoles.forEach(staff => {
        if (['main-1', 'main-2'].includes(staff.role)) currentUserRoles.push(ROLES.GAME_MAIN);
        if (['linesman-1', 'linesman-2'].includes(staff.role)) currentUserRoles.push(ROLES.GAME_LINESMAN);
        if (staff.role === 'secretary') currentUserRoles.push(ROLES.GAME_SECRETARY);
        if (staff.role === 'timekeeper') currentUserRoles.push(ROLES.GAME_TIMEKEEPER);
        if (staff.role === 'informant') currentUserRoles.push(ROLES.GAME_INFORMANT);
        if (staff.role === 'broadcaster') currentUserRoles.push(ROLES.GAME_BROADCASTER);
        if (['commentator-1', 'commentator-2'].includes(staff.role)) currentUserRoles.push(ROLES.GAME_COMMENTATOR);
      });
    }

    return currentUserRoles.some(role => allowedRoles.includes(role));
  };

  /**
   * Специальная проверка для доступа к редактированию матча
   */
  const checkMatchEditAccess = (game, gameStaff = []) => {
    if (!user || !game) return { hasAccess: false, reason: 'Нет данных' };
    
    // 1. Глобальные админы
    if (user.globalRole === ROLES.GLOBAL_ADMIN) return { hasAccess: true };

    const userRolesStr = selectedLeague?.role || '';
    const roles = userRolesStr.split(',').map(r => r.trim()).filter(Boolean);

    // 2. Руководство лиги (Доступ всегда)
    if (roles.includes(ROLES.TOP_MANAGER) || roles.includes(ROLES.LEAGUE_ADMIN)) {
        return { hasAccess: true };
    }

    // 3. СЕРВИСНЫЙ СЕКРЕТАРЬ ИЛИ СПОРТИВНЫЙ ПЕРСОНАЛ МАТЧА
    const isAssignedStaff = gameStaff.some(staff => staff.user_id === user.id && 
        ['secretary', 'timekeeper', 'informant', 'main-1', 'main-2', 'linesman-1', 'linesman-2'].includes(staff.role)
    );

    if (roles.includes(ROLES.SERVICE_SECRETARY) || isAssignedStaff) {
        if (!game.game_date) return { hasAccess: false, reason: 'Дата и время матча не назначены' };

        // ИЗМЕНЕНИЕ: Проверка временных окон
        const beforeHours = selectedLeague?.sec_access_before_hours ?? 12;
        const afterHours = selectedLeague?.sec_access_after_hours ?? 3;

        const now = new Date();
        const gameDate = new Date(game.game_date);
        const beforeLimit = new Date(gameDate.getTime() - (beforeHours * 60 * 60 * 1000));
        const afterLimit = new Date(gameDate.getTime() + (afterHours * 60 * 60 * 1000));

        if (now < beforeLimit) {
            return { hasAccess: false, reason: `Управление матчем откроется за ${beforeHours} ч. до начала.` };
        }
        if (now > afterLimit) {
            return { hasAccess: false, reason: `Время управления матчем истекло (${afterHours} ч. после начала).` };
        }

        return { hasAccess: true };
    }

    return { hasAccess: false, reason: 'Нет доступа' };
  };

  return { user, selectedLeague, checkAccess, checkMatchEditAccess };
}