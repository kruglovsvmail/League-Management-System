import express from 'express';
import { verifyToken } from '../controllers/authController.js';
import { 
    getProtocolData, 
    signProtocol, 
    downloadProtocolPDF, 
    getProtocolHtmlView 
} from '../controllers/ProtocolPDFController.js';

const router = express.Router();

// Глобальный охранник: доступ только авторизованным пользователям
router.use(verifyToken);

// Эндпоинт для получения готовых данных протокола матча (JSON)
router.get('/protocol/:gameId', getProtocolData);

// НОВЫЙ ЭНДПОИНТ: Получение HTML-кода протокола для iframe на клиенте
router.get('/protocol/:gameId/html', getProtocolHtmlView);

// Эндпоинт для электронной и ручной подписи протокола
router.post('/protocol/:gameId/sign', signProtocol);

// Эндпоинт: Скачивание PDF-файла напрямую с сервера
router.get('/protocol/:gameId/download', downloadProtocolPDF);

export default router;