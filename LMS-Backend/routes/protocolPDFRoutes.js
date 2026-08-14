import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import { 
    getProtocolData, 
    signProtocol, 
    downloadProtocolPDF, 
    getProtocolHtmlView 
} from '../controllers/ProtocolPDFController.js';

const router = express.Router();

// Глобальный охранник: доступ только авторизованным пользователям
router.use(verifyToken);

// Одной авторизации мало: протокол содержит поимённые составы, фамилии судей и
// ЭЦП-подписи. Без проверки прав его мог скачать по номеру матча любой пользователь
// системы — игрок чужой команды, медиа другой лиги. Право то же, что и на панель
// секретаря: протокол открывают и подписывают именно там (ProtocolViewerModal).
const requireProtocolAccess = requirePermission('MATCH_SECRETARY_PANEL_ENTER');

// Эндпоинт для получения готовых данных протокола матча (JSON)
router.get('/protocol/:gameId', requireProtocolAccess, getProtocolData);

// НОВЫЙ ЭНДПОИНТ: Получение HTML-кода протокола для iframe на клиенте
router.get('/protocol/:gameId/html', requireProtocolAccess, getProtocolHtmlView);

// Эндпоинт для электронной и ручной подписи протокола.
// Окно управления матчем здесь НЕ проверяем: подписи собирают уже после финальной
// сирены, и жёсткая отсечка на +3 ч оставила бы протокол неподписанным. Подписант
// проверяется внутри обработчика (заявка команды, дисквалификации, PIN судьи).
router.post('/protocol/:gameId/sign', requireProtocolAccess, signProtocol);

// Эндпоинт: Скачивание PDF-файла напрямую с сервера
router.get('/protocol/:gameId/download', requireProtocolAccess, downloadProtocolPDF);

export default router;