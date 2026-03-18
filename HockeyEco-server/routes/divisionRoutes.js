import express from 'express';
import upload from '../config/upload.js';

import { 
    verifyToken, 
    requireGlobalAdmin, 
    requireRoleBySeason, 
    requireRoleByDivision 
} from '../controllers/authController.js';

import {
    getSeasons,
    getDivisions,
    createDivision,
    updateDivision,
    deleteDivision,
    updateDivisionPublish,
    uploadDivisionFile,
    getDivisionTeams
} from '../controllers/divisionController.js';

const router = express.Router();

// Глобальный охранник для всех эндпоинтов дивизионов (пользователь должен быть авторизован)
router.use(verifyToken);

// Сезоны для выпадающего списка (могут читать все авторизованные)
router.get('/leagues/:leagueId/seasons', getSeasons);

// --- УПРАВЛЕНИЕ ДИВИЗИОНАМИ ---

// Просмотр и создание дивизионов (требуются права менеджера/админа лиги в конкретном сезоне)
router.get('/seasons/:seasonId/divisions', requireRoleBySeason(['top_manager', 'league_admin']), getDivisions);
router.post('/seasons/:seasonId/divisions', requireRoleBySeason(['top_manager', 'league_admin']), createDivision);

// Редактирование, публикация и загрузка файлов (требуются права менеджера/админа лиги для конкретного дивизиона)
router.put('/divisions/:id', requireRoleByDivision(['top_manager', 'league_admin']), updateDivision);
router.patch('/divisions/:id/publish', requireRoleByDivision(['top_manager', 'league_admin']), updateDivisionPublish);
router.post('/divisions/:id/upload/:type', upload.single('file'), requireRoleByDivision(['top_manager', 'league_admin']), uploadDivisionFile);

// Удаление дивизиона (ТОЛЬКО ДЛЯ ГЛОБАЛЬНОГО АДМИНА)
router.delete('/divisions/:id', requireGlobalAdmin, deleteDivision);

// Загрузка команд дивизиона (используется для модалки трансферов, доступно авторизованным)
router.get('/divisions/:id/teams', getDivisionTeams);

export default router;