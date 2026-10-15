import express from 'express';
import { getUsers, getTeams, getArenas } from '../controllers/handbookController.js';
import { findSimilarUsers, createLeagueVirtualUser } from '../controllers/leagueVirtualUsersController.js';
import { verifyToken } from '../controllers/authController.js';

const router = express.Router();

router.use(verifyToken);

router.get('/handbook/users', getUsers);
router.get('/handbook/teams', getTeams);
router.get('/handbook/arenas', getArenas);

// Виртуальный аккаунт от владельца лиги. Права проверяет сам контроллер: владелец
// выбранной лиги (или глобальный админ) и включённый лиге тумблер.
router.post('/handbook/virtual-users/similar', findSimilarUsers);
router.post('/handbook/virtual-users', createLeagueVirtualUser);

export default router;
