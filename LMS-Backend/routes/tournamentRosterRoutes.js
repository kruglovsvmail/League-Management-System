import express from 'express';
import upload from '../config/upload.js';

import { verifyToken, requirePermission } from '../controllers/authController.js';

import {
    updateTournamentRosterStatus,
    updateTournamentRosterFee,
    uploadTournamentRosterDocs,
    bulkUploadTournamentRosterDocs,
    updateTournamentRosterInline
} from '../controllers/tournamentRosterController.js';

const router = express.Router();

router.use(verifyToken);

router.patch('/tournament-rosters/:id/status', requirePermission('DIVISIONS_PLAYER_ADMIT_TOGGLE'), updateTournamentRosterStatus);
router.patch('/tournament-rosters/:id/fee', requirePermission('DIVISIONS_TEAM_FEE_MODAL'), updateTournamentRosterFee);

router.post('/tournament-rosters/:id/docs', upload.fields([
    { name: 'insurance', maxCount: 1 },
    { name: 'medical', maxCount: 1 },
    { name: 'consent', maxCount: 1 }
]), requirePermission('DIVISIONS_TEAM_DOCS_MODAL'), uploadTournamentRosterDocs);

// Один файл сразу нескольким игрокам заявки — командная справка со списком внутри.
// Путь через /tournament-teams/:id, а не /tournament-rosters/:id: операция идёт по всей заявке,
// и по нему же резолвится лига для проверки прав (getLeagueIdFromContext).
router.post('/tournament-teams/:id/roster-docs/bulk', upload.single('file'), requirePermission('DIVISIONS_TEAM_DOCS_MODAL'), bulkUploadTournamentRosterDocs);

// ЭНДПОИНТ ДЛЯ ИНЛАЙН-РЕДАКТИРОВАНИЯ ВНУТРИ ЗАЯВКИ
router.patch('/tournament-rosters/:id', requirePermission('DIVISIONS_PLAYER_ADMIT_TOGGLE'), updateTournamentRosterInline);

export default router;