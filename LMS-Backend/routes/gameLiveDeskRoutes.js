import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
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
    updateShootoutStatus
} from '../controllers/GameLiveDeskController.js';

const router = express.Router();

router.use(verifyToken);

router.get('/games/:gameId/events', getGameEvents);
router.post('/games/:gameId/events', express.json(), requirePermission('MATCH_SECRETARY_PANEL_ENTER'), createGameEvent);
router.put('/games/:gameId/events/:eventId', express.json(), requirePermission('MATCH_SECRETARY_PANEL_ENTER'), updateGameEvent);
router.delete('/games/:gameId/events/:eventId', requirePermission('MATCH_SECRETARY_PANEL_ENTER'), deleteGameEvent);

router.get('/games/:gameId/events/:eventId/plus-minus', getEventPlusMinus);
router.post('/games/:gameId/events/:eventId/plus-minus', express.json(), requirePermission('MATCH_SECRETARY_PANEL_ENTER'), saveEventPlusMinus);

router.put('/games/:gameId/timer-settings', express.json(), requirePermission('MATCH_SECRETARY_PANEL_ENTER'), updateTimerSettings);

// === УПРАВЛЕНИЕ СЕРИЕЙ БУЛЛИТОВ ===
router.put('/games/:gameId/shootout-status', express.json(), requirePermission('MATCH_SECRETARY_PANEL_ENTER'), updateShootoutStatus);
router.post('/games/:gameId/finish-shootout', express.json(), requirePermission('MATCH_SECRETARY_PANEL_ENTER'), finishShootout);
router.post('/games/:gameId/reopen-shootout', express.json(), requirePermission('MATCH_SECRETARY_PANEL_ENTER'), reopenShootout);

router.post('/games/:gameId/goalie-log', express.json(), requirePermission('MATCH_SECRETARY_PANEL_ENTER'), saveGoalieLog);
router.delete('/games/:gameId/goalie-log/:logId', requirePermission('MATCH_SECRETARY_PANEL_ENTER'), deleteGoalieLog);

router.post('/games/:gameId/shots-summary', express.json(), requirePermission('MATCH_SECRETARY_PANEL_ENTER'), saveShotsSummary);

export default router;