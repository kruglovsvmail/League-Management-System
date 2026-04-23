import express from 'express';
import { getUsers, getTeams, getArenas } from '../controllers/handbookController.js';
import { verifyToken } from '../controllers/authController.js';

const router = express.Router();

router.use(verifyToken);

router.get('/handbook/users', getUsers);
router.get('/handbook/teams', getTeams);
router.get('/handbook/arenas', getArenas);

export default router;