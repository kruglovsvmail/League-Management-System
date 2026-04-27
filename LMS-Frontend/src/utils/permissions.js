// ============================================================================
// Единая матрица прав доступа (Role-Based Access Control)
// ============================================================================

// Справочник всех системных ролей для удобного переиспользования
export const ROLES = {
  GLOBAL_ADMIN: 'admin',           // Глобальный администратор (доступ ко всему)
  TOP_MANAGER: 'top_manager',      // Руководитель лиги
  LEAGUE_ADMIN: 'league_admin',    // Администратор лиги
  REFEREE: 'referee',              // Судья лиги (общая роль)
  MEDIA: 'media',                  // Медиа лиги (общая роль)
  GAME_HEAD: 'game_head_referee',  // Главный судья (контекст матча)
  GAME_LINESMAN: 'game_linesman',  // Линейный судья (контекст матча)
  GAME_SECRETARY: 'game_scorekeeper',// Секретарь матча (контекст матча)
  GAME_MEDIA: 'game_media',        // Медиа матча (контекст матча)
};

// Справочник доступов: Ключ = Действие/Раздел, Значение = Массив разрешенных ролей
export const PERMISSIONS = {
  // --------------------------------------------------------------------------
  // РАЗДЕЛ: ДИВИЗИОНЫ
  // --------------------------------------------------------------------------
  DIVISIONS_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.REFEREE, ROLES.MEDIA], // Просмотр страницы дивизионов и фильтров
  DIVISIONS_PUBLISH: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Публикация/Скрытие дивизиона
  DIVISIONS_DELETE: [ROLES.TOP_MANAGER], // Удаление дивизиона
  DIVISIONS_TEAM_STATUS: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Смена статуса команды
  DIVISIONS_TEAM_ROSTERS_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Открытие модалки "Заявочные листы"
  DIVISIONS_TEAM_UNIFORM_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Открытие модалки "Экипировка команды"
  DIVISIONS_TEAM_DESC_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Открытие модалки "Описание команды"
  DIVISIONS_TEAM_PHOTO_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Открытие модалки "Общее фото команды"
  DIVISIONS_TEAM_QUAL_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Открытие модалки "Выбор квалификации"
  DIVISIONS_TEAM_DOCS_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Открытие модалки "ДОКУМЕНТЫ"
  DIVISIONS_TEAM_FEE_MODAL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Открытие модалки "Оплата взноса"
  DIVISIONS_PLAYER_ADMIT_TOGGLE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Переключение тумблера "Допуск" игрока

  // --------------------------------------------------------------------------
  // РАЗДЕЛ: РАСПИСАНИЕ
  // --------------------------------------------------------------------------
  SCHEDULE_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.REFEREE, ROLES.MEDIA], // Просмотр страницы расписания
  SCHEDULE_EDIT: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Редактирование карточек матчей
  SCHEDULE_CREATE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Создание новых матчей
  SCHEDULE_DELETE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Удаление матча

  // --------------------------------------------------------------------------
  // РАЗДЕЛ: СТРАНИЦА МАТЧА
  // --------------------------------------------------------------------------
  MATCH_PAGE_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.REFEREE, ROLES.MEDIA], // Просмотр страницы матча
  MATCH_STATUS_CHANGE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.GAME_SECRETARY], // Смена статуса матча
  MATCH_EDIT_INFO: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Редактирование "Цвета формы и ссылок на трансляции"
  MATCH_WEB_GRAPHICS_PANEL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.GAME_MEDIA], // Переход в панель трансляции и блок "Веб-Графика"
  MATCH_ASSIGN_STAFF: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Назначение судей и медиа на матч
  MATCH_ROSTER_FILL: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.GAME_SECRETARY], // Открытие модалки "Состав на матч" и заполнение
  MATCH_SECRETARY_PANEL_ENTER: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.GAME_SECRETARY], // Переход в панель секретаря

  // --------------------------------------------------------------------------
  // РАЗДЕЛ: УПРАВЛЕНИЕ ЛИГОЙ (НАСТРОЙКИ)
  // --------------------------------------------------------------------------
  SETTINGS_DIVISIONS_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.REFEREE, ROLES.MEDIA], // Просмотр подраздела ДИВИЗИОНЫ
  SETTINGS_DIVISIONS_EDIT: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Редактирование подраздела ДИВИЗИОНЫ
  SETTINGS_DIVISIONS_CREATE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Создание нового дивизиона
  SETTINGS_STAFF_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.REFEREE, ROLES.MEDIA], // Просмотр подраздела ПЕРСОНАЛ
  SETTINGS_STAFF_MANAGE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Добавление/снятие ролей пользователей
  SETTINGS_QUAL_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.REFEREE, ROLES.MEDIA], // Просмотр подраздела КВАЛИФИКАЦИЯ
  SETTINGS_QUAL_CREATE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Создание новых квалификаций
  SETTINGS_QUAL_DELETE: [ROLES.TOP_MANAGER], // Удаление квалификаций
  SETTINGS_PLAYOFF_CONSTRUCTOR: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Доступ к конструктору сетки плей-офф
  PLAYOFF_DISTRIBUTE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Распределение команд в плей-офф
  PLAYOFF_RESET: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Сброс сетки плей-офф

  // --------------------------------------------------------------------------
  // РАЗДЕЛ: ТРАНСФЕРЫ
  // --------------------------------------------------------------------------
  TRANSFERS_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.REFEREE, ROLES.MEDIA], // Просмотр раздела трансферов
  TRANSFERS_CREATE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Создание запроса на трансфер
  TRANSFERS_ACTION: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Утверждение / Отклонение трансфера
  TRANSFERS_REVERT: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Возврат трансфера на доработку

  // --------------------------------------------------------------------------
  // РАЗДЕЛ: ДИСКВАЛИФИКАЦИИ
  // --------------------------------------------------------------------------
  DISQUALIFICATIONS_VIEW: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN, ROLES.REFEREE, ROLES.MEDIA], // Просмотр списка дисквалификаций
  DISQUALIFICATIONS_CREATE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Выписка новой дисквалификации
  DISQUALIFICATIONS_STATUS_CHANGE: [ROLES.TOP_MANAGER, ROLES.LEAGUE_ADMIN], // Изменение статуса (списание/отбыл)

  // --------------------------------------------------------------------------
  // ГЛОБАЛЬНЫЕ РАЗДЕЛЫ (Только для users.global_role = 'admin')
  // --------------------------------------------------------------------------
  GLOBAL_REGISTRY_ACCESS: [], // Глобальный реестр (пустой массив = доступно только глобальному админу)
  TEAM_MANAGEMENT_ACCESS: [], // Управление командой (пустой массив = доступно только глобальному админу)
};