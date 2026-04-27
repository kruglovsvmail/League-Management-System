import express from 'express';
import { getPublicGameById } from '../controllers/gameController.js';

const router = express.Router();

// Маршрут для публичного получения данных матча (для OBS)
router.get('/games/:gameId', getPublicGameById);

export default router;