import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import {
  getPenaltyTypes,
  getPenaltyTypesForGame,
  createPenaltyType,
  updatePenaltyType,
  deletePenaltyType,
  copyPenaltyTypes
} from '../controllers/penaltyTypeController.js';

const router = express.Router();
router.use(verifyToken);

// Справочник причин удаления ведёт лига в настройках — права те же, что у остальных
// справочников (SDK_REFERENCES_*), они исторически названы по СДК, но охватывают
// всю вкладку «Справочники».
router.get('/seasons/:seasonId/penalty-types', requirePermission('SDK_REFERENCES_VIEW'), getPenaltyTypes);
router.post('/seasons/:seasonId/penalty-types', requirePermission('SDK_REFERENCES_MANAGE'), createPenaltyType);
router.post('/seasons/:seasonId/penalty-types/copy', requirePermission('SDK_REFERENCES_MANAGE'), copyPenaltyTypes);
router.put('/penalty-types/:id', requirePermission('SDK_REFERENCES_MANAGE'), updatePenaltyType);
router.delete('/penalty-types/:id', requirePermission('SDK_REFERENCES_MANAGE'), deletePenaltyType);

// Читает панель секретаря — здесь нужен доступ к матчу, а не к настройкам лиги,
// поэтому проверки прав на справочники нет: это просто чтение списка причин.
router.get('/games/:gameId/penalty-types', getPenaltyTypesForGame);

export default router;
