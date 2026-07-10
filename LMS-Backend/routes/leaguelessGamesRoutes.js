import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import { getLeaguelessGames, getLeaguelessStats } from '../controllers/leaguelessGamesController.js';

const router = express.Router();

// Доступ строго для global_role = 'admin' (пустой массив ролей в PERMISSIONS.LEAGUELESS_MATCHES_ACCESS)
router.use('/leagueless-games', verifyToken, requirePermission('LEAGUELESS_MATCHES_ACCESS'));

router.get('/leagueless-games', getLeaguelessGames);
router.get('/leagueless-games/stats', getLeaguelessStats);

export default router;
