import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import { 
    getGames, getArenas, createGame, getGameById,
    updateGameInfo, updateGameStatus, getGameRoster, saveGameRoster,
    getGameStaff, updateGameOfficials, deleteGame, recalculateGameStats
} from '../controllers/gameController.js';

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

// Работа с составами на матч
router.get('/games/:gameId/roster/:teamId', getGameRoster);
router.post('/games/:gameId/roster/:teamId', requirePermission('MATCH_ROSTER_FILL'), saveGameRoster);

// Судейская бригада матча
router.get('/games/:gameId/staff', getGameStaff);
router.put('/games/:gameId/officials', requirePermission('MATCH_ASSIGN_STAFF'), updateGameOfficials);

export default router;