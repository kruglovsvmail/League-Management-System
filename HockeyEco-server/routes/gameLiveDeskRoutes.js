// HockeyEco-server/routes/gameLiveDeskRoutes.js
import express from 'express';
import { verifyToken, requireGameProtocolAccess } from '../controllers/authController.js';
import { 
    getGameEvents, 
    createGameEvent,
    updateGameEvent,
    deleteGameEvent,
    updateTimerSettings,
    getEventPlusMinus,
    saveEventPlusMinus,
    saveGoalieLog,
    deleteGoalieLog,
    saveShotsSummary,
    finishShootout,
    reopenShootout,
    updateShootoutStatus // <-- ДОБАВЛЕН ИМПОРТ
} from '../controllers/GameLiveDeskController.js';

const router = express.Router();

router.use(verifyToken);

router.get('/games/:gameId/events', getGameEvents);
router.post('/games/:gameId/events', express.json(), requireGameProtocolAccess, createGameEvent);
router.put('/games/:gameId/events/:eventId', express.json(), requireGameProtocolAccess, updateGameEvent);
router.delete('/games/:gameId/events/:eventId', requireGameProtocolAccess, deleteGameEvent);

router.get('/games/:gameId/events/:eventId/plus-minus', getEventPlusMinus);
router.post('/games/:gameId/events/:eventId/plus-minus', express.json(), requireGameProtocolAccess, saveEventPlusMinus);

router.put('/games/:gameId/timer-settings', express.json(), requireGameProtocolAccess, updateTimerSettings);

// === УПРАВЛЕНИЕ СЕРИЕЙ БУЛЛИТОВ ===
router.put('/games/:gameId/shootout-status', express.json(), requireGameProtocolAccess, updateShootoutStatus); // <-- НОВЫЙ РОУТ СМЕНЫ СТАТУСОВ
router.post('/games/:gameId/finish-shootout', express.json(), requireGameProtocolAccess, finishShootout);
router.post('/games/:gameId/reopen-shootout', express.json(), requireGameProtocolAccess, reopenShootout);

router.post('/games/:gameId/goalie-log', express.json(), requireGameProtocolAccess, saveGoalieLog);
router.delete('/games/:gameId/goalie-log/:logId', requireGameProtocolAccess, deleteGoalieLog);

router.post('/games/:gameId/shots-summary', express.json(), requireGameProtocolAccess, saveShotsSummary);

export default router;