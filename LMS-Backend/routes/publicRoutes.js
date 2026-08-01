import express from 'express';
import { getPublicGameById } from '../controllers/gameController.js';
import { getCurrentPolicy } from '../controllers/policyController.js';

const router = express.Router();

// Маршрут для публичного получения данных матча (для OBS)
router.get('/games/:gameId', getPublicGameById);

// Текст актуальной политики обработки ПД — читается со страницы входа (шторка согласия)
router.get('/policy/current', getCurrentPolicy);

export default router;