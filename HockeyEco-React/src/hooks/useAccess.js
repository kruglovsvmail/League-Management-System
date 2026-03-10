import { useOutletContext } from 'react-router-dom';
import { PERMISSIONS } from '../utils/permissions';

export function useAccess() {
  const { user, selectedLeague } = useOutletContext(); 
  
  const checkAccess = (action) => {
    // 1. Если нет юзера — доступа нет
    if (!user) return false;
    
    // 2. Глобальному суперадмину можно всё
    if (user.globalRole === 'admin') return true; 

    // 3. Получаем список разрешенных ролей для этого действия
    const allowedRoles = PERMISSIONS[action] || [];
    
    // 4. Берем роли юзера в текущей лиге и делаем из строки массив
    const userRolesStr = selectedLeague?.role || '';
    const userRolesArr = userRolesStr.split(',').map(r => r.trim());

    // 5. Проверяем, есть ли пересечение (есть ли у юзера хотя бы одна подходящая роль)
    return userRolesArr.some(role => allowedRoles.includes(role));
  };

  return { checkAccess };
}