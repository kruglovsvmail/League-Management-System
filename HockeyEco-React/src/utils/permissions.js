export const PERMISSIONS = {
  // Персонал
  VIEW_STAFF: ['top_manager', 'league_admin', 'referee'], // Просмотр
  MANAGE_STAFF: ['top_manager'],                          // Добавлять/менять роли
  
  // Квалификации
  VIEW_QUALIFICATIONS: ['top_manager', 'league_admin', 'referee', 'media'], // Просмотр
  ADD_QUALIFICATIONS: ['top_manager', 'league_admin'],             // Добавлять
  DELETE_QUALIFICATIONS: ['top_manager'],                           // Удалять

  // Трансферы
  VIEW_TRANSFERS: ['top_manager', 'league_admin', 'referee', 'media'], // Просмотр
  CREATE_TRANSFER: ['top_manager'],                           // Создавать запросы
  ACTION_TRANSFER: ['top_manager', 'league_admin'],            // Одобрять/отклонять

  // Дисквалификации
  VIEW_DISQUALIFICATIONS: ['top_manager', 'league_admin', 'referee'], // Просмотр
  CREATE_DISQUALIFICATION: ['top_manager', 'league_admin'],           // Назначать
  ACTION_DISQUALIFICATION: ['top_manager', 'league_admin'],            // Отменять / Отбыл
};

