import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import {
    getGames, getArenas, createGame, getGameById,
    updateGameInfo, updateGameStatus, getGameRoster, saveGameRoster,
    getGameStaff, updateGameOfficials, deleteGame, recalculateGameStats,
    getGameStats, getGameReserveGoalies
} from '../controllers/gameController.js';
import { requireGameEditWindow } from '../utils/gameEditWindow.js';

const router = express.Router();

// ========================================================
// 1. ПУБЛИЧНЫЕ МАРШРУТЫ (ДОСТУПНЫ БЕЗ ТОКЕНА АВТОРИЗАЦИИ)
// ========================================================
router.get('/games/:gameId', getGameById);

// ========================================================
// 2. ВКЛЮЧАЕМ ПРОВЕРКУ ТОКЕНА ДЛЯ ВСЕХ ОСТАЛЬНЫХ МАРШРУТОВ
// ========================================================
router.use(verifyToken);

// ========================================================
// 3. ЗАЩИЩЕННЫЕ МАРШРУТЫ (ТОЛЬКО ДЛЯ АВТОРИЗОВАННЫХ)
// ========================================================

// Справочник арен (доступен всем авторизованным)
router.get('/arenas', getArenas);

// Работа со списком матчей
router.get('/seasons/:seasonId/games', getGames);
router.post('/seasons/:seasonId/games', requirePermission('SCHEDULE_CREATE'), createGame);

// РЕДАКТИРОВАНИЕ ИНФОРМАЦИИ МАТЧА
router.put('/games/:gameId/info', requirePermission('MATCH_EDIT_INFO'), updateGameInfo);

// УДАЛЕНИЕ МАТЧА
router.delete('/games/:gameId', requirePermission('SCHEDULE_DELETE'), deleteGame);

// ИЗМЕНЕНИЕ СТАТУСА МАТЧА
router.put('/games/:gameId/status', requirePermission('MATCH_STATUS_CHANGE'), updateGameStatus);

// ПРИНУДИТЕЛЬНЫЙ ПЕРЕСЧЕТ СТАТИСТИКИ
router.post('/games/:gameId/recalculate', requirePermission('MATCH_STATUS_CHANGE'), recalculateGameStats);

// Статистика матча (командная + по игрокам)
router.get('/games/:gameId/stats', getGameStats);

// Работа с составами на матч
router.get('/games/:gameId/roster/:teamId', getGameRoster);
router.post('/games/:gameId/roster/:teamId', requirePermission('MATCH_ROSTER_FILL'), saveGameRoster);

// Резервные вратари из протокола матча — для выбора нарушителя при назначении
// дисквалификации (в составах команд их нет, своей заявки у них не бывает)
router.get('/games/:gameId/reserve-goalies', getGameReserveGoalies);

// Судейская бригада матча.
// Окно обязательно: смена подписывающей роли стирает подпись под протоколом
// (см. updateGameOfficials), и без окна бригаду можно было переписать спустя месяц
// после игры, распечатав уже подписанный протокол. Руководство лиги окном не ограничено
// и по-прежнему назначает бригады заранее — окно связывает только сервисного секретаря
// и саму бригаду матча.
router.get('/games/:gameId/staff', getGameStaff);
router.put('/games/:gameId/officials', requirePermission('MATCH_ASSIGN_STAFF'), requireGameEditWindow, updateGameOfficials);

export default router;