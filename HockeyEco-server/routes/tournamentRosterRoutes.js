import express from 'express';
import upload from '../config/upload.js';

import { 
    verifyToken,
    requireRoleByTournamentRoster // <-- НОВЫЙ ИМПОРТ
} from '../controllers/authController.js';

import { 
    updateTournamentRosterStatus,
    updateTournamentRosterQualification,
    updateTournamentRosterFee,
    uploadTournamentRosterDocs,
    updateTournamentRosterInline
} from '../controllers/tournamentRosterController.js';

const router = express.Router();

router.use(verifyToken);

const allowedRoles = ['top_manager', 'league_admin'];

// Все эндпоинты редактирования игроков в заявке закрыты правами менеджеров/админов
router.patch('/tournament-rosters/:id/status', requireRoleByTournamentRoster(allowedRoles), updateTournamentRosterStatus);
router.patch('/tournament-rosters/:id/qualification', requireRoleByTournamentRoster(allowedRoles), updateTournamentRosterQualification);
router.patch('/tournament-rosters/:id/fee', requireRoleByTournamentRoster(allowedRoles), updateTournamentRosterFee);

router.post('/tournament-rosters/:id/docs', upload.fields([
    { name: 'insurance', maxCount: 1 },
    { name: 'medical', maxCount: 1 }
]), requireRoleByTournamentRoster(allowedRoles), uploadTournamentRosterDocs);

// ЭНДПОИНТ ДЛЯ ИНЛАЙН-РЕДАКТИРОВАНИЯ ВНУТРИ ЗАЯВКИ
router.patch('/tournament-rosters/:id', requireRoleByTournamentRoster(allowedRoles), updateTournamentRosterInline);

export default router;