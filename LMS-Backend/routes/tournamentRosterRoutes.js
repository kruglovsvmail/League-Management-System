import express from 'express';
import upload from '../config/upload.js';

import { verifyToken, requirePermission } from '../controllers/authController.js';

import {
    updateTournamentRosterStatus,
    updateTournamentStaffStatus,
    updateTournamentRosterFee,
    uploadTournamentRosterDocs,
    bulkUploadTournamentRosterDocs,
    updateTournamentRosterInline
} from '../controllers/tournamentRosterController.js';

const router = express.Router();

router.use(verifyToken);

router.patch('/tournament-rosters/:id/status', requirePermission('DIVISIONS_PERSON_ADMIT_TOGGLE'), updateTournamentRosterStatus);
// Тумблер допуска представителя. Адрес — «заявка + человек», а не строка роли: ролей у
// человека может быть несколько, а допуск один (tournament_staff_admission). Путь через
// /tournament-teams/:id ещё и резолвит лигу для проверки прав (getLeagueIdFromContext).
router.patch('/tournament-teams/:id/staff/:userId/status', requirePermission('DIVISIONS_PERSON_ADMIT_TOGGLE'), updateTournamentStaffStatus);

router.patch('/tournament-rosters/:id/fee', requirePermission('DIVISIONS_TEAM_FEE_MODAL'), updateTournamentRosterFee);

// Документы допуска — на человека в заявке, а не на строку состава: представитель может
// быть и игроком, и документы у него одни (см. tournament_person_docs).
router.post('/tournament-teams/:id/person-docs/:userId', upload.fields([
    { name: 'insurance', maxCount: 1 },
    { name: 'medical', maxCount: 1 },
    { name: 'consent', maxCount: 1 }
]), requirePermission('DIVISIONS_TEAM_DOCS_MODAL'), uploadTournamentRosterDocs);

// Один файл сразу нескольким игрокам заявки — командная справка со списком внутри.
// Путь через /tournament-teams/:id, а не /tournament-rosters/:id: операция идёт по всей заявке,
// и по нему же резолвится лига для проверки прав (getLeagueIdFromContext).
router.post('/tournament-teams/:id/roster-docs/bulk', upload.single('file'), requirePermission('DIVISIONS_TEAM_DOCS_MODAL'), bulkUploadTournamentRosterDocs);

// ЭНДПОИНТ ДЛЯ ИНЛАЙН-РЕДАКТИРОВАНИЯ ВНУТРИ ЗАЯВКИ
router.patch('/tournament-rosters/:id', requirePermission('DIVISIONS_PERSON_ADMIT_TOGGLE'), updateTournamentRosterInline);

export default router;