import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import { 
    getTransfers, 
    handleTransferAction,
    getTransferPlayers,
    createTransferRequest
} from '../controllers/transferController.js';

const router = express.Router();

router.use(verifyToken);

// Маршруты для модалки создания заявки
router.get('/transfers/available-players', getTransferPlayers);

// ЗАЩИТА: Создавать трансфер может только top_manager
router.post('/transfers', requirePermission('TRANSFERS_CREATE'), createTransferRequest);

// ЗАЩИТА: Просмотр страницы трансферов
router.get('/seasons/:seasonId/transfers', requirePermission('TRANSFERS_VIEW'), getTransfers);

// ЗАЩИТА: Принятие / Отклонение / Возврат заявки
router.put('/transfers/:id/action', requirePermission('TRANSFERS_ACTION'), handleTransferAction);

export default router;