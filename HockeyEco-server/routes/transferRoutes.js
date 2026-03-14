import express from 'express';
import { 
  verifyToken, 
  requireRoleBySeason, 
  requireRoleByTransfer, 
  requireRoleForTransferCreate 
} from '../controllers/authController.js';
import { 
    getTransfers, 
    handleTransferAction,
    getTransferPlayers, // Исправленный импорт
    createTransferRequest
} from '../controllers/transferController.js';

const router = express.Router();

router.use(verifyToken);

// Маршруты для модалки создания заявки
router.get('/transfers/available-players', getTransferPlayers); // Исправленный вызов функции

// ЗАЩИТА: Создавать трансфер может только top_manager
router.post('/transfers', requireRoleForTransferCreate(['top_manager']), createTransferRequest);

// ЗАЩИТА: Просмотр страницы трансферов (Все кроме media)
router.get('/seasons/:seasonId/transfers', requireRoleBySeason(['top_manager', 'league_admin', 'referee']), getTransfers);

// ЗАЩИТА: Принятие / Отклонение / Возврат заявки (Только руководители)
router.put('/transfers/:id/action', requireRoleByTransfer(['top_manager', 'league_admin']), handleTransferAction);

export default router;