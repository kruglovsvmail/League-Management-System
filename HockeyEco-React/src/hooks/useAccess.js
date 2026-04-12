import { useOutletContext } from 'react-router-dom';
import { PERMISSIONS } from '../utils/permissions';

export function useAccess() {
  const context = useOutletContext() || {};
  const user = context.user || null;
  const selectedLeague = context.selectedLeague || null;
  
  const checkAccess = (action, options = {}) => {
    // Поддерживаем формат вызова с gameStaff для совместимости
    const gameStaff = Array.isArray(options) ? options : (options.gameStaff || []);

    if (!user) return false;
    if (user.globalRole === 'admin') return true; 

    const allowedRoles = PERMISSIONS[action] || [];
    
    const userRolesStr = selectedLeague?.role || '';
    const userRolesArr = userRolesStr.split(',').map(r => r.trim());

    // Базовая проверка прав (если роль пользователя есть в списке PERMISSIONS)
    const hasLeagueAccess = userRolesArr.some(role => allowedRoles.includes(role));

    // ДИНАМИЧЕСКИЕ ПРАВА ДЛЯ МАТЧЕЙ (Судьи и Медиа)
    if (!hasLeagueAccess && gameStaff.length > 0) {
      const isCurrentlyRefereeOrMedia = userRolesArr.includes('referee') || userRolesArr.includes('media');
      
      if (isCurrentlyRefereeOrMedia) {
        const myGameRoles = gameStaff
          .filter(staff => staff.user_id === user.id)
          .map(staff => staff.role);
        
        if (myGameRoles.length > 0) {
          if (action === 'MANAGE_GAME_STATUS' || action === 'MANAGE_GAME_ROSTER' || action === 'MANAGE_PROTOCOL') {
            return myGameRoles.includes('scorekeeper');
          }
          if (action === 'MANAGE_GRAPHICS') {
            return myGameRoles.includes('media');
          }
        }
      }
    }

    return hasLeagueAccess;
  };

  return { checkAccess, user, selectedLeague };
}