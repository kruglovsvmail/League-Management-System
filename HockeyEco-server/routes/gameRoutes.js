import express from 'express';
import { verifyToken } from '../controllers/authController.js';
import { 
    getGames, 
    getArenas, 
    createGame, 
    getGameById,
    updateGameInfo,
    updateGameStatus,
    getGameRoster, 
    saveGameRoster,
    getGameStaff,        // <-- Добавлено
    updateGameOfficials  // <-- Добавлено
} from '../controllers/gameController.js';

const router = express.Router();

router.use(verifyToken);

// Справочник арен
router.get('/arenas', getArenas);

// Работа со списком матчей
router.get('/seasons/:seasonId/games', getGames);
router.post('/seasons/:seasonId/games', createGame);

// Работа с конкретным матчем
router.get('/games/:gameId', getGameById);
router.put('/games/:gameId/info', updateGameInfo);
router.put('/games/:gameId/status', updateGameStatus);

// Работа с составами на матч
router.get('/games/:gameId/roster/:teamId', getGameRoster);
router.post('/games/:gameId/roster/:teamId', saveGameRoster);

// Судейская бригада матча
router.get('/games/:gameId/staff', getGameStaff);
router.put('/games/:gameId/officials', updateGameOfficials);

export default router;