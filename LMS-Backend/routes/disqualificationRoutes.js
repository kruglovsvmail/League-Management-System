import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import {
    getSeasonDisqualifications,
    createDisqualification,
    deleteDisqualification,
    toggleDisqualificationPaid
} from '../controllers/disqualificationController.js';

const router = express.Router();

// Защита всех эндпоинтов токеном
router.use(verifyToken);

// Получить все штрафы в сезоне
router.get('/seasons/:seasonId/disqualifications', requirePermission('DISQUALIFICATIONS_VIEW'), getSeasonDisqualifications);

// Создать новый штраф
router.post('/disqualifications', requirePermission('DISQUALIFICATIONS_CREATE'), createDisqualification);

// Удалить штраф
router.delete('/disqualifications/:id', requirePermission('DISQUALIFICATIONS_STATUS_CHANGE'), deleteDisqualification);

// Отметить/снять отметку об оплате штрафа
router.patch('/disqualifications/:id/toggle-paid', requirePermission('DISQUALIFICATIONS_STATUS_CHANGE'), toggleDisqualificationPaid);

export default router;