import express from 'express';
import upload from '../config/upload.js';

import { verifyToken, requirePermission } from '../controllers/authController.js';

import {
    updateTournamentTeamStatus,
    updateTournamentTeamCustomData,
    uploadTournamentTeamFile,
    deleteTournamentTeamLeaguePaper,
    getTournamentTeamRoster
} from '../controllers/tournamentTeamController.js';

const router = express.Router();

router.use(verifyToken);

// Получение заявки (ростера) конкретной команды турнира (доступно всем)
router.get('/tournament-teams/:id/roster', getTournamentTeamRoster);

// Управление командами внутри турнира
router.patch('/tournament-teams/:id/status', requirePermission('DIVISIONS_TEAM_STATUS'), updateTournamentTeamStatus);
router.patch('/tournament-teams/:id/custom-data', requirePermission('DIVISIONS_TEAM_DESC_MODAL'), updateTournamentTeamCustomData);

// Загрузка кастомных файлов турнирной команды (экипировка, фото, скан)
router.post('/tournament-teams/:id/upload/:type', upload.single('file'), requirePermission('DIVISIONS_TEAM_PHOTO_MODAL'), uploadTournamentTeamFile);

// Удаление (сброс) бумажной заявки, которую загрузила Лига
router.delete('/tournament-teams/:id/paper_league', requirePermission('DIVISIONS_TEAM_DOCS_MODAL'), deleteTournamentTeamLeaguePaper);

export default router;