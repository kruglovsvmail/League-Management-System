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
    getDivisionTeams,
    getDivisionStandings,
    getPlayoffBracket,
    savePlayoffConstructor,
    updatePlayoffMatchup
} from '../controllers/divisionController.js';

const router = express.Router();

// Глобальный охранник для всех эндпоинтов дивизионов (пользователь должен быть авторизован)
router.use(verifyToken);

// Сезоны для выпадающего списка (могут читать все авторизованные)
router.get('/leagues/:leagueId/seasons', getSeasons);

// --- УПРАВЛЕНИЕ ДИВИЗИОНАМИ ---
router.get('/seasons/:seasonId/divisions', requireRoleBySeason(['top_manager', 'league_admin']), getDivisions);
router.post('/seasons/:seasonId/divisions', requireRoleBySeason(['top_manager', 'league_admin']), createDivision);

router.put('/divisions/:id', requireRoleByDivision(['top_manager', 'league_admin']), updateDivision);
router.patch('/divisions/:id/publish', requireRoleByDivision(['top_manager', 'league_admin']), updateDivisionPublish);
router.post('/divisions/:id/upload/:type', upload.single('file'), requireRoleByDivision(['top_manager', 'league_admin']), uploadDivisionFile);

// Удаление дивизиона (ТОЛЬКО ДЛЯ ГЛОБАЛЬНОГО АДМИНА)
router.delete('/divisions/:id', requireGlobalAdmin, deleteDivision);

// Загрузка команд дивизиона
router.get('/divisions/:id/teams', getDivisionTeams);

// --- ТУРНИРНАЯ ТАБЛИЦА ---
router.get('/divisions/:id/standings', getDivisionStandings);

// --- ПЛЕЙ-ОФФ ---
router.get('/divisions/:id/playoff', getPlayoffBracket);

// Сохранение конструктора сеток доступно top_manager и league_admin
router.post('/divisions/:id/playoff/save-constructor', requireRoleByDivision(['top_manager', 'league_admin']), savePlayoffConstructor);

// Ручная замена команд в сетке доступна ТОЛЬКО top_manager
router.put('/divisions/:id/playoff/:matchupId', requireRoleByDivision(['top_manager']), updatePlayoffMatchup);

export default router;