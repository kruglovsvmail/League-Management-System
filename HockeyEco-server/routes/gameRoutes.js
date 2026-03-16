import express from 'express';
import { verifyToken, requireRoleBySeason, requireRoleByGame } from '../controllers/authController.js';
import { 
    getGames, getArenas, createGame, getGameById,
    updateGameInfo, updateGameStatus, getGameRoster, saveGameRoster,
    getGameStaff, updateGameOfficials
} from '../controllers/gameController.js';

const router = express.Router();

router.use(verifyToken);

// Справочник арен (доступен всем авторизованным)
router.get('/arenas', getArenas);

// Работа со списком матчей (Создавать могут только менеджеры и админы)
router.get('/seasons/:seasonId/games', getGames);
router.post('/seasons/:seasonId/games', requireRoleBySeason(['top_manager', 'league_admin']), createGame);

// Работа с конкретным матчем
router.get('/games/:gameId', getGameById);

// РЕДАКТИРОВАНИЕ ИНФОРМАЦИИ МАТЧА (Только админы лиги)
router.put('/games/:gameId/info', requireRoleByGame(['top_manager', 'league_admin']), updateGameInfo);
router.put('/games/:gameId/status', requireRoleByGame(['top_manager', 'league_admin']), updateGameStatus);

// Работа с составами на матч
router.get('/games/:gameId/roster/:teamId', getGameRoster);
router.post('/games/:gameId/roster/:teamId', requireRoleByGame(['top_manager', 'league_admin']), saveGameRoster);

// Судейская бригада матча
router.get('/games/:gameId/staff', getGameStaff);
router.put('/games/:gameId/officials', requireRoleByGame(['top_manager', 'league_admin']), updateGameOfficials);

export default router;