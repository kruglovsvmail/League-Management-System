// HockeyEco-server/routes/protocolPDFRoutes.js
import express from 'express';
import { verifyToken } from '../controllers/authController.js';
import { getProtocolData, signProtocol } from '../controllers/ProtocolPDFController.js';

const router = express.Router();

// Глобальный охранник: доступ только авторизованным пользователям
router.use(verifyToken);

// Эндпоинт для получения готовых данных протокола матча
router.get('/protocol/:gameId', getProtocolData);

// Эндпоинт для электронной и ручной подписи протокола
router.post('/protocol/:gameId/sign', signProtocol);

export default router;