import express from 'express';
import multer from 'multer';
import { verifyToken } from '../controllers/authController.js';
import { 
    updateTournamentRosterStatus,
    updateTournamentRosterQualification,
    updateTournamentRosterFee,
    uploadTournamentRosterDocs
} from '../controllers/tournamentRosterController.js';

const router = express.Router();

// Настройка multer для приема файлов в память перед отправкой в S3
const upload = multer({ storage: multer.memoryStorage() });

// Проверка токена для всех роутов
router.use(verifyToken);

// Управление статусом заявки игрока
router.patch('/tournament-rosters/:id/status', updateTournamentRosterStatus);

// Управление квалификацией
router.patch('/tournament-rosters/:id/qualification', updateTournamentRosterQualification);

// Управление оплатой индивидуального взноса
router.patch('/tournament-rosters/:id/fee', updateTournamentRosterFee);

// Загрузка документов (медицина и страховка)
// Принимаем два поля: insurance и medical
router.post('/tournament-rosters/:id/docs', upload.fields([
    { name: 'insurance', maxCount: 1 },
    { name: 'medical', maxCount: 1 }
]), uploadTournamentRosterDocs);

export default router;