import express from 'express';
import multer from 'multer';
import { verifyToken } from '../controllers/authController.js';
import {
    updateTournamentTeamStatus,
    updateTournamentTeamCustomData,
    uploadTournamentTeamFile,
    getTournamentTeamRoster // <-- НОВЫЙ ИМПОРТ
} from '../controllers/tournamentTeamController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(verifyToken);

// НОВЫЙ ЭНДПОИНТ: Получение заявки (ростера) конкретной команды турнира
router.get('/tournament-teams/:id/roster', getTournamentTeamRoster);

// Управление командами внутри турнира
router.patch('/tournament-teams/:id/status', updateTournamentTeamStatus);
router.patch('/tournament-teams/:id/custom-data', updateTournamentTeamCustomData);

// Загрузка кастомных файлов турнирной команды (экипировка, фото)
router.post('/tournament-teams/:id/upload/:type', upload.single('file'), uploadTournamentTeamFile);

export default router;