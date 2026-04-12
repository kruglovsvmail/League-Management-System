import express from 'express';
import upload from '../config/upload.js';

import { 
    verifyToken,
    requireRoleByTournamentTeam
} from '../controllers/authController.js';

import {
    updateTournamentTeamStatus,
    updateTournamentTeamCustomData,
    uploadTournamentTeamFile,
    deleteTournamentTeamLeaguePaper, // <-- ДОБАВЛЕН
    getTournamentTeamRoster
} from '../controllers/tournamentTeamController.js';

const router = express.Router();

router.use(verifyToken);

// Получение заявки (ростера) конкретной команды турнира (доступно всем)
router.get('/tournament-teams/:id/roster', getTournamentTeamRoster);

// Управление командами внутри турнира (Только админы/менеджеры лиги)
router.patch('/tournament-teams/:id/status', requireRoleByTournamentTeam(['top_manager', 'league_admin']), updateTournamentTeamStatus);
router.patch('/tournament-teams/:id/custom-data', requireRoleByTournamentTeam(['top_manager', 'league_admin']), updateTournamentTeamCustomData);

// Загрузка кастомных файлов турнирной команды (экипировка, фото, скан)
router.post('/tournament-teams/:id/upload/:type', upload.single('file'), requireRoleByTournamentTeam(['top_manager', 'league_admin']), uploadTournamentTeamFile);

// НОВЫЙ РОУТ: Удаление (сброс) бумажной заявки, которую загрузила Лига
router.delete('/tournament-teams/:id/paper_league', requireRoleByTournamentTeam(['top_manager', 'league_admin']), deleteTournamentTeamLeaguePaper);

export default router;