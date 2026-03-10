import express from 'express';
import multer from 'multer';
import { uploadFile } from '../controllers/uploadController.js';
import { verifyToken } from '../controllers/authController.js'; // <-- Импортируем охранника

const router = express.Router();

// Настройка временного хранилища для загрузки
const upload = multer({ storage: multer.memoryStorage() });

// Маршрут для загрузки одного файла в S3 (Теперь защищен токеном!)
router.post('/upload', verifyToken, upload.single('file'), uploadFile);

export default router;