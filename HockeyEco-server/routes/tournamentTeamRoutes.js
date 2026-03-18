import express from 'express';
import upload from '../config/upload.js';

import { 
    verifyToken,
    requireRoleByTournamentTeam // <-- НОВЫЙ ИМПОРТ
} from '../controllers/authController.js';

import {
    updateTournamentTeamStatus,
    updateTournamentTeamCustomData,
    uploadTournamentTeamFile,
    getTournamentTeamRoster
} from '../controllers/tournamentTeamController.js';

const router = express.Router();

router.use(verifyToken);

// НОВЫЙ ЭНДПОИНТ: Получение заявки (ростера) конкретной команды турнира (доступно всем)
router.get('/tournament-teams/:id/roster', getTournamentTeamRoster);

// Управление командами внутри турнира (Только админы/менеджеры лиги)
router.patch('/tournament-teams/:id/status', requireRoleByTournamentTeam(['top_manager', 'league_admin']), updateTournamentTeamStatus);
router.patch('/tournament-teams/:id/custom-data', requireRoleByTournamentTeam(['top_manager', 'league_admin']), updateTournamentTeamCustomData);

// Загрузка кастомных файлов турнирной команды (экипировка, фото) (Только админы/менеджеры лиги)
router.post('/tournament-teams/:id/upload/:type', upload.single('file'), requireRoleByTournamentTeam(['top_manager', 'league_admin']), uploadTournamentTeamFile);

export default router;