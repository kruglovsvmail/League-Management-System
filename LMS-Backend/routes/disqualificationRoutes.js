import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import {
    getLeagueDisqualifications,
    getPersonDisqualificationHistory,
    createDisqualification,
    deleteDisqualification,
    toggleDisqualificationPaid
} from '../controllers/disqualificationController.js';

const router = express.Router();

// Защита всех эндпоинтов токеном
router.use(verifyToken);

// Получить все штрафы в лиге (дисквалификация переживает смену сезона — список не сезонный)
router.get('/leagues/:leagueId/disqualifications', requirePermission('DISQUALIFICATIONS_VIEW'), getLeagueDisqualifications);

// История дисквалификаций конкретного человека/команды в лиге (для шторки назначения наказания)
router.get('/disqualifications/history', requirePermission('DISQUALIFICATIONS_VIEW'), getPersonDisqualificationHistory);

// Создать новый штраф
router.post('/disqualifications', requirePermission('DISQUALIFICATIONS_CREATE'), createDisqualification);

// Удалить штраф
router.delete('/disqualifications/:id', requirePermission('DISQUALIFICATIONS_STATUS_CHANGE'), deleteDisqualification);

// Отметить/снять отметку об оплате штрафа
router.patch('/disqualifications/:id/toggle-paid', requirePermission('DISQUALIFICATIONS_STATUS_CHANGE'), toggleDisqualificationPaid);

export default router;