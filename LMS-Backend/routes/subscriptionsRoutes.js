import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import {
  getSubscriptionUsers, getSubscriptionTeams, previewSubscriptionChange, applySubscriptionChange,
  getSubscriptionOperations, previewUndoOperation, undoSubscriptionOperation, getSubscriptionUserHistory,
} from '../controllers/subscriptionsController.js';

const router = express.Router();

// Доступ строго для global_role = 'admin' (пустой массив ролей в PERMISSIONS.SUBSCRIPTIONS_ACCESS)
router.use('/subscriptions', verifyToken, requirePermission('SUBSCRIPTIONS_ACCESS'));

router.get('/subscriptions/users', getSubscriptionUsers);
router.get('/subscriptions/users/:userId/history', getSubscriptionUserHistory);
router.get('/subscriptions/teams', getSubscriptionTeams);
router.post('/subscriptions/preview', previewSubscriptionChange);
router.post('/subscriptions/apply', applySubscriptionChange);
router.get('/subscriptions/operations', getSubscriptionOperations);
router.get('/subscriptions/operations/:id/undo-preview', previewUndoOperation);
router.post('/subscriptions/operations/:id/undo', undoSubscriptionOperation);

export default router;
