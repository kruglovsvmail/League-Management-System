import express from 'express';
import { verifyToken, requireGameProtocolAccess } from '../controllers/authController.js';
import { 
    getGameEvents, 
    createGameEvent,
    updateGameEvent,
    deleteGameEvent,
    updateTimerSettings,
    getEventPlusMinus,
    saveEventPlusMinus
} from '../controllers/GameLiveDeskController.js';

const router = express.Router();

router.use(verifyToken);

// Получить ход игры могут все зрители
router.get('/games/:gameId/events', getGameEvents);

// А ВОТ УПРАВЛЯТЬ СОБЫТИЯМИ МОГУТ ТОЛЬКО СЕКРЕТАРЬ ИЛИ АДМИН ЛИГИ
router.post('/games/:gameId/events', express.json(), requireGameProtocolAccess, createGameEvent);
router.put('/games/:gameId/events/:eventId', express.json(), requireGameProtocolAccess, updateGameEvent);
router.delete('/games/:gameId/events/:eventId', requireGameProtocolAccess, deleteGameEvent);

// Управление показателем полезности (+/-)
router.get('/games/:gameId/events/:eventId/plus-minus', getEventPlusMinus);
router.post('/games/:gameId/events/:eventId/plus-minus', express.json(), requireGameProtocolAccess, saveEventPlusMinus);

// Сохранение настроек таймера (период, овертайм)
router.put('/games/:gameId/timer-settings', express.json(), requireGameProtocolAccess, updateTimerSettings);

export default router;