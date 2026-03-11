import express from 'express';
import multer from 'multer';
import { verifyToken } from '../controllers/authController.js';
import { 
    updateTournamentRosterStatus,
    updateTournamentRosterQualification,
    updateTournamentRosterFee,
    uploadTournamentRosterDocs,
    updateTournamentRosterInline // <-- НОВЫЙ ИМПОРТ
} from '../controllers/tournamentRosterController.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });
router.use(verifyToken);

router.patch('/tournament-rosters/:id/status', updateTournamentRosterStatus);
router.patch('/tournament-rosters/:id/qualification', updateTournamentRosterQualification);
router.patch('/tournament-rosters/:id/fee', updateTournamentRosterFee);
router.post('/tournament-rosters/:id/docs', upload.fields([
    { name: 'insurance', maxCount: 1 },
    { name: 'medical', maxCount: 1 }
]), uploadTournamentRosterDocs);

// ЭНДПОИНТ ДЛЯ ИНЛАЙН-РЕДАКТИРОВАНИЯ ВНУТРИ ЗАЯВКИ
router.patch('/tournament-rosters/:id', updateTournamentRosterInline);

export default router;