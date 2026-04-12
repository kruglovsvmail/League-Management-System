import express from 'express';
import { 
    verifyToken,
    requireRoleBySeason,
    requireRoleByDisqualification,
    requireRoleForDisqualificationCreate
} from '../controllers/authController.js';
import {
    getSeasonDisqualifications,
    createDisqualification,
    updateDisqualificationStatus
} from '../controllers/disqualificationController.js';

const router = express.Router();

// Защита всех эндпоинтов токеном
router.use(verifyToken);

// Получить все штрафы в сезоне (все кроме media)
router.get('/seasons/:seasonId/disqualifications', requireRoleBySeason(['top_manager', 'league_admin']), getSeasonDisqualifications);

// Создать новый штраф (только руководство)
router.post('/disqualifications', requireRoleForDisqualificationCreate(['top_manager', 'league_admin']), createDisqualification);

// Обновить статус штрафа (отменить или отметить как отбытый)
router.patch('/disqualifications/:id/status', requireRoleByDisqualification(['top_manager', 'league_admin']), updateDisqualificationStatus);

export default router;