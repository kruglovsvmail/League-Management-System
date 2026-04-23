import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import {
    getSeasonDisqualifications,
    createDisqualification,
    updateDisqualificationStatus
} from '../controllers/disqualificationController.js';

const router = express.Router();

// Защита всех эндпоинтов токеном
router.use(verifyToken);

// Получить все штрафы в сезоне
router.get('/seasons/:seasonId/disqualifications', requirePermission('DISQUALIFICATIONS_VIEW'), getSeasonDisqualifications);

// Создать новый штраф
router.post('/disqualifications', requirePermission('DISQUALIFICATIONS_CREATE'), createDisqualification);

// Обновить статус штрафа (отменить или отметить как отбытый)
router.patch('/disqualifications/:id/status', requirePermission('DISQUALIFICATIONS_STATUS_CHANGE'), updateDisqualificationStatus);

export default router;