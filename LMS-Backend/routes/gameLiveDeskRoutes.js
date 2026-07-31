import express from 'express';
import rateLimit from 'express-rate-limit';
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
    saveGoalieShotsSummary,
    getGoalieShotsSummary,
    finishShootout,
    reopenShootout,
    updateShootoutStatus,
    getGameAudioUrl,
    getArenaAudioFiles
} from '../controllers/GameLiveDeskController.js';
import { generateRosterAnnouncement, generateEventAnnouncement, testPronunciation } from '../controllers/ttsArenaController.js';
import { broadcastRosterAnnouncement, broadcastEventAnnouncement } from '../controllers/ttsBroadcastController.js';
import { createTimerLogEntry, exportTimerLog } from '../controllers/gameTimerLogController.js';

const router = express.Router();

router.use(verifyToken);

// Журнал работы с таймером: пишет панель секретаря, выгружает шторка «Настройки матча».
// Запись доступна тем же, кто ведёт матч; выгрузка — всем, кто пустили на страницу матча.
//
// Потолок на запись. Живой секретарь даже в самом суматошном отрезке делает от силы
// 20-30 действий в минуту; 60 — заведомо выше потолка человека, но обрубает залипшую
// кнопку или цикл в клиенте, который иначе насыпал бы тысячи строк.
// Ключ — пара «матч + пользователь», а не IP: на арене несколько секретарей могут сидеть
// за одним NAT, и общий счётчик резал бы их друг об друга.
const timerLogLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.params.gameId}:${req.user?.id || 'anon'}`,
    // Панель ответ не читает — просто молча пропустит лишнее нажатие
    message: { success: false, error: 'Слишком много действий с таймером за минуту' },
});

router.post('/games/:gameId/timer-log', timerLogLimiter, express.json(), requirePermission('MATCH_SECRETARY_PANEL_ENTER'), createTimerLogEntry);
// Выгрузка — тем же, кто имеет доступ в панель секретаря: журнал поимённо называет,
// кто и когда трогал таймер, и посторонним авторизованным пользователям не предназначен.
router.get('/games/:gameId/timer-log/export', requirePermission('MATCH_SECRETARY_PANEL_ENTER'), exportTimerLog);

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

// === БРОСКИ В СТВОР ПО ВРАТАРЮ ===
// Командные броски в створ — производная величина, секретарь её не вводит.
router.get('/games/:gameId/goalie-shots-summary', getGoalieShotsSummary);
router.post('/games/:gameId/goalie-shots-summary', express.json(), requirePermission('MATCH_SECRETARY_PANEL_ENTER'), saveGoalieShotsSummary);

// === АУДИО URL ДЛЯ ЛИГИ ===
router.get('/games/:gameId/audio-url', getGameAudioUrl);
router.get('/games/:gameId/arena-audio-files', getArenaAudioFiles);

// === TTS: ДИКТОР АРЕНЫ (панель секретаря) ===
router.post('/games/:gameId/tts/roster', generateRosterAnnouncement);
router.post('/games/:gameId/tts/event', express.json(), generateEventAnnouncement);
router.get('/tts/test', testPronunciation);

// === TTS: КОММЕНТАТОР (панель трансляции) ===
router.post('/games/:gameId/broadcast/tts/roster', broadcastRosterAnnouncement);
router.post('/games/:gameId/broadcast/tts/event', express.json(), broadcastEventAnnouncement);

export default router;
