import express from 'express';
import { lookupPhone, lookupLogin, login, resetPassword, getMe, verifyToken, updateProfile, regCheckPhone, regVerifyCode, register } from '../controllers/authController.js';

const router = express.Router();

router.post('/lookup-phone', lookupPhone);
router.post('/lookup-login', lookupLogin);
router.post('/login', login);
router.get('/me', verifyToken, getMe);

// НОВЫЙ маршрут для обновления профиля
router.put('/profile', verifyToken, updateProfile);

router.post('/reset-password', resetPassword);

// Активация аккаунта со страницы входа (легализация виртуального профиля).
// Все три шага публичные — человек по определению ещё не может войти в систему.
router.post('/reg-check-phone', regCheckPhone);
router.post('/reg-verify-code', regVerifyCode);
router.post('/register', register);

export default router;