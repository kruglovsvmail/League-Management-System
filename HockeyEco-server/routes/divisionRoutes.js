import express from 'express';
import multer from 'multer';
import { verifyToken } from '../controllers/authController.js';
import {
    getSeasons,
    getDivisions,
    createDivision,
    updateDivision,
    deleteDivision,
    updateDivisionPublish,
    uploadDivisionFile,
    getDivisionTeams // <-- ДОБАВИЛИ ИМПОРТ СЮДА
} from '../controllers/divisionController.js';

const router = express.Router();
// Храним файл в памяти перед отправкой в S3
const upload = multer({ storage: multer.memoryStorage() });

// Глобальный охранник для всех эндпоинтов дивизионов
router.use(verifyToken);

// Сезоны для выпадающего списка
router.get('/leagues/:leagueId/seasons', getSeasons);

// Управление дивизионами
router.get('/seasons/:seasonId/divisions', getDivisions);
router.post('/seasons/:seasonId/divisions', createDivision);
router.put('/divisions/:id', updateDivision);
router.delete('/divisions/:id', deleteDivision);
router.patch('/divisions/:id/publish', updateDivisionPublish);

// Загрузка команд дивизиона (для модалки трансферов)
router.get('/divisions/:id/teams', getDivisionTeams);

// Загрузка файлов (type = 'logo' или 'regulations')
router.post('/divisions/:id/upload/:type', upload.single('file'), uploadDivisionFile);

export default router;