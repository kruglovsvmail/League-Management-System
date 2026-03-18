import { useOutletContext } from 'react-router-dom';
import { PERMISSIONS } from '../utils/permissions';

export function useAccess() {
  const context = useOutletContext() || {};
  const user = context.user || null;
  const selectedLeague = context.selectedLeague || null;
  
  const checkAccess = (action, gameStaff = []) => {
    if (!user) return false;
    if (user.globalRole === 'admin') return true; 

    const allowedRoles = PERMISSIONS[action] || [];
    
    const userRolesStr = selectedLeague?.role || '';
    const userRolesArr = userRolesStr.split(',').map(r => r.trim());

    // Базовые права по лиге (руководители, админы)
    const hasLeagueAccess = userRolesArr.some(role => allowedRoles.includes(role));

    // ДИНАМИЧЕСКИЕ ПРАВА ДЛЯ МАТЧЕЙ
    if (!hasLeagueAccess && gameStaff.length > 0) {
      
      // ЗАЩИТА: Проверяем, есть ли у пользователя АКТИВНАЯ роль судьи или медиа в лиге прямо сейчас.
      const isCurrentlyRefereeOrMedia = userRolesArr.includes('referee') || userRolesArr.includes('media');
      
      if (isCurrentlyRefereeOrMedia) {
        const myGameRoles = gameStaff
          .filter(staff => staff.user_id === user.id)
          .map(staff => staff.role);
        
        if (myGameRoles.length > 0) {
          if (action === 'MANAGE_GAME_STATUS') {
            return myGameRoles.some(role => ['head_1', 'head_2', 'scorekeeper'].includes(role));
          }
          if (action === 'MANAGE_GAME_ROSTER' || action === 'MANAGE_PROTOCOL') {
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

  return { checkAccess };
}