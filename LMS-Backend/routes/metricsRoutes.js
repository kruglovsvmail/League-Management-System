import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import { getSummary, getTopUsers, getUserDetail, getDaily, getPushStats } from '../controllers/metricsController.js';

const router = express.Router();

// Доступ строго для global_role = 'admin' (пустой массив ролей в PERMISSIONS.METRICS_ACCESS)
router.use('/metrics', verifyToken, requirePermission('METRICS_ACCESS'));

router.get('/metrics/summary', getSummary);
router.get('/metrics/top-users', getTopUsers);
router.get('/metrics/user/:userId', getUserDetail);
router.get('/metrics/daily', getDaily);
router.get('/metrics/push', getPushStats);

export default router;
