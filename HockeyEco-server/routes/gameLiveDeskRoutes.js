import express from 'express';
import { verifyToken, requireGameProtocolAccess } from '../controllers/authController.js';
import { 
    getGameEvents, 
    createGameEvent,
    deleteGameEvent 
} from '../controllers/GameLiveDeskController.js';

const router = express.Router();

router.use(verifyToken);

// Получить ход игры могут все зрители
router.get('/games/:gameId/events', getGameEvents);

// А ВОТ ДОБАВЛЯТЬ СОБЫТИЯ МОГУТ ТОЛЬКО СЕКРЕТАРЬ ИЛИ АДМИН ЛИГИ
router.post('/games/:gameId/events', express.json(), requireGameProtocolAccess, createGameEvent);
router.delete('/games/:gameId/events/:eventId', requireGameProtocolAccess, deleteGameEvent);

export default router;