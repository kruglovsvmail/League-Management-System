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
    
    // ============================================================================
    // Маппинг новых ролей из единой таблицы game_staff
    // ============================================================================
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

  // ============================================================================
  // СПЕЦИАЛЬНАЯ ПРОВЕРКА ДЛЯ ПАНЕЛИ СЕКРЕТАРЯ 
  // (Ограничения по времени и подписи сняты)
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

    // Проверяем, является ли пользователь спортивным персоналом матча
    const isStaff = gameStaff.some(staff => staff.user_id === user.id && 
        ['secretary', 'timekeeper', 'informant', 'main-1', 'main-2', 'linesman-1', 'linesman-2'].includes(staff.role)
    );
    
    if (isStaff) {
        // Оставляем только базовую техническую проверку на наличие даты матча,
        // так как без даты система таймеров и статистики не сможет функционировать.
        // Все остальные логические ограничения (18 часов, ЭЦП) полностью удалены.
        if (!game.game_date) {
            return { hasAccess: false, reason: 'Дата и время матча не назначены' };
        }

        return { hasAccess: true };
    }

    // Если вообще не имеет отношения к матчу
    return { hasAccess: false, reason: 'Нет доступа' };
  };

  return { user, selectedLeague, checkAccess, checkMatchEditAccess };
}