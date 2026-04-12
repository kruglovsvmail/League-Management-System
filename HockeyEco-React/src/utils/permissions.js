export const PERMISSIONS = {
  // --- ДИВИЗИОНЫ ---
  VIEW_DIVISIONS: ['top_manager', 'league_admin'],         // Просмотр раздела (вкладка в сайдбаре)
  MANAGE_DIVISIONS: ['top_manager', 'league_admin'],       // Настройки, публикация, составы, статусы, допуски, взносы
  CHANGE_TEAM_STATUS: ['top_manager', 'league_admin'],     // Смена статуса заявки команды (В ЛЮБОЕ ВРЕМЯ, без ограничений по датам)
  GENERATE_PLAYOFF: ['top_manager', 'league_admin'],       // Создание/обновление сетки
  

  // --- МАТЧИ И ПРОТОКОЛ ---
  // Примечание: VIEW_GAMES не делаем, так как смотреть матчи могут все авторизованные пользователи
  CREATE_GAMES: ['top_manager', 'league_admin'],           // Создание матча
  EDIT_GAMES: ['top_manager', 'league_admin'],             // Редактирование времени/арены (настроек)
  MANAGE_GAME_STATUS: ['top_manager', 'league_admin'],     // Смена статуса матча (плюс динамически главный судья и секретарь матча)
  MANAGE_GAME_ROSTER: ['top_manager', 'league_admin'],     // Изменение составов на матч (плюс динамически секретарь матча)
  MANAGE_GAME_REFEREES: ['top_manager', 'league_admin'],   // Назначение судейской бригады
  MANAGE_PROTOCOL: ['top_manager', 'league_admin'],        // Доступ в панель Live Desk (плюс динамически секретарь матча)
  MANAGE_GRAPHICS: ['top_manager', 'league_admin'],        // Управление ТВ-графикой (плюс динамически media)

  // --- ПЕРСОНАЛ ---
  VIEW_STAFF: ['top_manager', 'league_admin'],            // Просмотр
  MANAGE_STAFF: ['top_manager'],                          // Добавлять/менять роли
  
  // --- КВАЛИФИКАЦИИ ---
  VIEW_QUALIFICATIONS: ['top_manager', 'league_admin'],   // Просмотр
  ADD_QUALIFICATIONS: ['top_manager', 'league_admin'],    // Добавлять
  DELETE_QUALIFICATIONS: ['top_manager'],                 // Удалять

  // --- ТРАНСФЕРЫ ---
  VIEW_TRANSFERS: ['top_manager', 'league_admin'],        // Просмотр
  CREATE_TRANSFER: ['top_manager'],                       // Создавать запросы
  ACTION_TRANSFER: ['top_manager', 'league_admin'],       // Одобрять/отклонять

  // --- ДИСКВАЛИФИКАЦИИ ---
  VIEW_DISQUALIFICATIONS: ['top_manager', 'league_admin'], // Просмотр
  CREATE_DISQUALIFICATION: ['top_manager', 'league_admin'],// Назначать
  ACTION_DISQUALIFICATION: ['top_manager', 'league_admin'],// Отменять / Отбыл
};