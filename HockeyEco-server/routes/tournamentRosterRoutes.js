import express from 'express';
import upload from '../config/upload.js';

import { verifyToken, requirePermission } from '../controllers/authController.js';

import { 
    updateTournamentRosterStatus,
    updateTournamentRosterQualification,
    updateTournamentRosterFee,
    uploadTournamentRosterDocs,
    updateTournamentRosterInline
} from '../controllers/tournamentRosterController.js';

const router = express.Router();

router.use(verifyToken);

router.patch('/tournament-rosters/:id/status', requirePermission('DIVISIONS_PLAYER_ADMIT_TOGGLE'), updateTournamentRosterStatus);
router.patch('/tournament-rosters/:id/qualification', requirePermission('DIVISIONS_TEAM_QUAL_MODAL'), updateTournamentRosterQualification);
router.patch('/tournament-rosters/:id/fee', requirePermission('DIVISIONS_TEAM_FEE_MODAL'), updateTournamentRosterFee);

router.post('/tournament-rosters/:id/docs', upload.fields([
    { name: 'insurance', maxCount: 1 },
    { name: 'medical', maxCount: 1 },
    { name: 'consent', maxCount: 1 }
]), requirePermission('DIVISIONS_TEAM_DOCS_MODAL'), uploadTournamentRosterDocs);

// ЭНДПОИНТ ДЛЯ ИНЛАЙН-РЕДАКТИРОВАНИЯ ВНУТРИ ЗАЯВКИ
router.patch('/tournament-rosters/:id', requirePermission('DIVISIONS_PLAYER_ADMIT_TOGGLE'), updateTournamentRosterInline);

export default router;