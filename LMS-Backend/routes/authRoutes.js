import express from 'express';
import { lookupPhone, lookupLogin, login, resetPassword, getMe, verifyToken, updateProfile } from '../controllers/authController.js';

const router = express.Router();

router.post('/lookup-phone', lookupPhone);
router.post('/lookup-login', lookupLogin);
router.post('/login', login);
router.get('/me', verifyToken, getMe);

// НОВЫЙ маршрут для обновления профиля
router.put('/profile', verifyToken, updateProfile);

router.post('/reset-password', resetPassword);

export default router;