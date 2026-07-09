import express from 'express';
import upload from '../config/upload.js';

import { uploadFile } from '../controllers/uploadController.js';
import { verifyToken } from '../controllers/authController.js';

const router = express.Router();

// Маршрут для загрузки одного файла в S3 (Защищен токеном!)
router.post('/upload', verifyToken, upload.single('file'), uploadFile);

export default router;