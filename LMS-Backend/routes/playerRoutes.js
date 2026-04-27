import express from 'express';
import { getPlayerProfile } from '../controllers/playerController.js';
import { verifyToken } from '../controllers/authController.js';

const router = express.Router();

// Маршрут получения полного профиля игрока (Защищен токеном!)
router.get('/players/:id/profile', verifyToken, getPlayerProfile);

export default router;