import express from 'express';
import { 
    verifyToken, 
    requireRoleBySeason, 
    requireRoleByGame,
    requireGameStatusAccess,
    requireGameProtocolAccess
} from '../controllers/authController.js';
import { 
    getGames, getArenas, createGame, getGameById,
    updateGameInfo, updateGameStatus, getGameRoster, saveGameRoster,
    getGameStaff, updateGameOfficials
} from '../controllers/gameController.js';

const router = express.Router();

// ========================================================
// 1. ПУБЛИЧНЫЕ МАРШРУТЫ (ДОСТУПНЫ БЕЗ ТОКЕНА АВТОРИЗАЦИИ)
// ========================================================

// Этот эндпоинт должен быть ДО router.use(verifyToken);
// Тогда зрители смогут получать полную информацию о матче без авторизации
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

// Работа со списком матчей (Создавать могут только менеджеры и админы)
router.get('/seasons/:seasonId/games', getGames);
router.post('/seasons/:seasonId/games', requireRoleBySeason(['top_manager', 'league_admin']), createGame);

// РЕДАКТИРОВАНИЕ ИНФОРМАЦИИ МАТЧА (Только админы лиги)
router.put('/games/:gameId/info', requireRoleByGame(['top_manager', 'league_admin']), updateGameInfo);

// ИЗМЕНЕНИЕ СТАТУСА МАТЧА (Админы лиги + Главные судьи + Секретарь)
router.put('/games/:gameId/status', requireGameStatusAccess, updateGameStatus);

// Работа с составами на матч (Редактирование: Админы лиги + Секретарь)
router.get('/games/:gameId/roster/:teamId', getGameRoster);
router.post('/games/:gameId/roster/:teamId', requireGameProtocolAccess, saveGameRoster);

// Судейская бригада матча (Назначение судей: Админы лиги)
router.get('/games/:gameId/staff', getGameStaff);
router.put('/games/:gameId/officials', requireRoleByGame(['top_manager', 'league_admin']), updateGameOfficials);

export default router;