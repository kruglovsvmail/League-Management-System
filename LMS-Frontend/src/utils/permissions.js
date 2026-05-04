// ============================================================================ 
// Единая матрица прав доступа (Role-Based Access Control)                      
// ============================================================================ 

// Справочник всех системных ролей для удобного переиспользования              
export const ROLES = {                                                          // Экспортируем объект ROLES, где ключи используются в коде, а значения - в базе данных
  GLOBAL_ADMIN: 'admin',                                                        // Глобальный администратор всей платформы (имеет неограниченный доступ)
  TOP_MANAGER: 'top_manager',                                                   // Руководитель лиги (высший уровень доступа в рамках одной лиги)
  LEAGUE_ADMIN: 'league_admin',                                                 // Администратор лиги (операционное управление лигой)
  REFEREE: 'referee',                                                           // Судья лиги (общая должность в штате лиги, без привязки к конкретному матчу)
  MEDIA: 'media',                                                               // Медиа-сотрудник лиги (общая должность в штате лиги)
  GAME_MAIN: 'game_main',                                                       // Главный судья на льду (заменил старую роль GAME_HEAD, маппится с main-1, main-2)
  GAME_LINESMAN: 'game_linesman',                                               // Линейный судья на льду (маппится с linesman-1, linesman-2)
  GAME_SECRETARY: 'game_secretary',                                             // Секретарь матча (главный за судейским столиком, маппится с secretary)
  GAME_TIMEKEEPER: 'game_timekeeper',                                           // Хронометрист / Судья времени (маппится с timekeeper)
  GAME_INFORMANT: 'game_informant',                                             // Диктор-информатор на арене (маппится с informant)
  GAME_BROADCASTER: 'game_broadcaster',                                         // Режиссер трансляции или оператор (заменил старую роль GAME_MEDIA, маппится с broadcaster)
  GAME_COMMENTATOR: 'game_commentator',                                         // Комментатор матча (маппится с commentator-1, commentator-2)
};                                                                             

// Справочник доступов: Ключ = Действие/Раздел, Значение = Массив разрешенных ролей // Комментарий, описывающий структуру матрицы PERMISSIONS
export const PERMISSIONS = {                                                    // Экспортируем основной объект PERMISSIONS, связывающий действия с ролями
  // -------------------------------------------------------------------------- 
  // РАЗДЕЛ: ДИВИЗИОНЫ                                                          
  // -------------------------------------------------------------------------- 
  DIVISIONS_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.REFEREE, ROLES.MEDIA],  // Доступ к разделу дивизионов (согласно уточнениям, судьи и медиа сюда доступа НЕ имеют)
  DIVISIONS_PUBLISH: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                           // Право переключать видимость (публикацию) дивизиона на сайте
  DIVISIONS_DELETE: [ROLES.TOP_MANAGER],                                                // Право на полное удаление дивизиона (доступно исключительно руководителю лиги)
  DIVISIONS_TEAM_STATUS: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                       // Право изменять статус заявки команды (например, одобрить для участия)
  DIVISIONS_TEAM_ROSTERS_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                // Открытие модального окна просмотра ростеров (заявочных листов)
  DIVISIONS_TEAM_UNIFORM_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                // Открытие модального окна для редактирования цветов и фото экипировки
  DIVISIONS_TEAM_DESC_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                   // Открытие модального окна для изменения текстового описания команды
  DIVISIONS_TEAM_PHOTO_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                  // Открытие модального окна загрузки общекомандной фотографии
  DIVISIONS_TEAM_QUAL_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                   // Открытие модального окна для изменения квалификации игроков/команды
  DIVISIONS_TEAM_DOCS_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                   // Открытие модального окна работы с документами (страховки, справки)
  DIVISIONS_TEAM_FEE_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                    // Открытие модального окна для фиксации оплаты турнирных взносов
  DIVISIONS_PLAYER_ADMIT_TOGGLE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],               // Право вручную допускать конкретного игрока к матчам (тумблер "Допуск")

  // -------------------------------------------------------------------------- 
  // РАЗДЕЛ: РАСПИСАНИЕ                                                         
  // -------------------------------------------------------------------------- 
  SCHEDULE_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.REFEREE, ROLES.MEDIA],   // Доступ к просмотру общего расписания матчей лиги
  SCHEDULE_EDIT: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                               // Право на редактирование даты, времени и арены у существующих матчей
  SCHEDULE_CREATE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                             // Право на ручное создание новых карточек матчей в расписании
  SCHEDULE_DELETE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                             // Право на удаление матча из расписания (если он еще не начался)

  // -------------------------------------------------------------------------- 
  // РАЗДЕЛ: СТРАНИЦА МАТЧА                                                     
  // -------------------------------------------------------------------------- 
  MATCH_PAGE_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.REFEREE, ROLES.MEDIA],       // Доступ к странице конкретного матча (интерфейс просмотра)
  MATCH_STATUS_CHANGE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.GAME_SECRETARY],         // Право менять статус матча (перевод в Live, Завершен и т.д.)
  MATCH_EDIT_INFO: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                                   // Право редактировать метаданные (ссылки YouTube/VK, выбор цветов формы)
  MATCH_WEB_GRAPHICS_PANEL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.GAME_BROADCASTER],  // Право на открытие панели управления титрами (расширено на новых комментаторов)
  MATCH_ASSIGN_STAFF: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                                // Право назначать на матч судейскую бригаду и медиа-персонал
  MATCH_ROSTER_FILL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.GAME_SECRETARY],           // Право заполнять пятерки и утверждать составы перед игрой
  MATCH_SECRETARY_PANEL_ENTER: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.GAME_SECRETARY], // Доступ в live-панель (расширено на время и информатора для помощи секретарю)

  // -------------------------------------------------------------------------- 
  // РАЗДЕЛ: УПРАВЛЕНИЕ ЛИГОЙ (НАСТРОЙКИ)                                       
  // -------------------------------------------------------------------------- 
  SETTINGS_DIVISIONS_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],             // Право на просмотр раздела управления дивизионами
  SETTINGS_DIVISIONS_EDIT: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],             // Право на изменение параметров дивизионов
  SETTINGS_DIVISIONS_CREATE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],           // Право на создание новых дивизионов в текущем сезоне
  SETTINGS_STAFF_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                 // Право на просмотр штата сотрудников лиги
  SETTINGS_STAFF_MANAGE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],               // Право на приглашение, увольнение сотрудников и выдачу им ролей
  SETTINGS_QUAL_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                  // Право на просмотр справочника квалификаций
  SETTINGS_QUAL_CREATE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                // Право на создание новой квалификации (например, СПШ или Любитель)
  SETTINGS_QUAL_DELETE: [ROLES.TOP_MANAGER],                                    // Удаление квалификаций
  SETTINGS_PLAYOFF_CONSTRUCTOR: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],        // Право на доступ к drag-and-drop конструктору сетки плей-офф
  PLAYOFF_DISTRIBUTE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                  // Право на запуск автоматического распределения команд по сетке
  PLAYOFF_RESET: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                       // Право на сброс текущей сетки плей-офф
  SETTINGS_ARENAS_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                // Право на просмотр списка арен лиги
  SETTINGS_ARENAS_MANAGE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],              // Право на добавление и удаление арен из лиги

  // -------------------------------------------------------------------------- 
  // РАЗДЕЛ: ТРАНСФЕРЫ                                                          
  // -------------------------------------------------------------------------- 
  TRANSFERS_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                      // Право на просмотр раздела входящих заявок на переходы игроков
  TRANSFERS_CREATE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                    // Право на инициацию трансферного запроса от лица лиги
  TRANSFERS_ACTION: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                    // Право на одобрение или отклонение заявки на переход
  TRANSFERS_REVERT: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],                    // Право на откат уже принятого решения по трансферу

  // -------------------------------------------------------------------------- 
  // РАЗДЕЛ: ДИСКВАЛИФИКАЦИИ                                                    
  // -------------------------------------------------------------------------- 
  DISQUALIFICATIONS_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],              // Право на просмотр СДК (спортивно-дисциплинарного комитета)
  DISQUALIFICATIONS_CREATE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],            // Право на выписку матчевого или временного штрафа (бана) игроку
  DISQUALIFICATIONS_STATUS_CHANGE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN],     // Право на изменение статуса бана (например, досрочное погашение)

  // -------------------------------------------------------------------------- 
  // ГЛОБАЛЬНЫЕ РАЗДЕЛЫ (Только для users.global_role = 'admin')                
  // -------------------------------------------------------------------------- 
  GLOBAL_REGISTRY_ACCESS: [],                                                   // Пустой массив означает, что никто из ролей лиги сюда не зайдет (только Суперадмин)
  TEAM_MANAGEMENT_ACCESS: [],                                                   // Пустой массив защищает прямой доступ к управлению любой командой в обход лиги
};