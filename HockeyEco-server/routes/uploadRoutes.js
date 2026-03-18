import express from 'express';
import upload from '../config/upload.js';

import { uploadFile } from '../controllers/uploadController.js';
import { verifyToken } from '../controllers/authController.js'; // <-- Импортируем охранника

const router = express.Router();

// Настройка временного хранилища для загрузки


// Маршрут для загрузки одного файла в S3 (Теперь защищен токеном!)
router.post('/upload', verifyToken, upload.single('file'), uploadFile);

export default router;