import express from 'express';
import upload from '../config/upload.js';

import { verifyToken, requirePermission } from '../controllers/authController.js';

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
router.get('/seasons/:seasonId/divisions', requirePermission('DIVISIONS_VIEW'), getDivisions);
router.post('/seasons/:seasonId/divisions', requirePermission('SETTINGS_DIVISIONS_CREATE'), createDivision);

router.put('/divisions/:id', requirePermission('SETTINGS_DIVISIONS_EDIT'), updateDivision);
router.patch('/divisions/:id/publish', requirePermission('DIVISIONS_PUBLISH'), updateDivisionPublish);
router.post('/divisions/:id/upload/:type', upload.single('file'), requirePermission('SETTINGS_DIVISIONS_EDIT'), uploadDivisionFile);

// Удаление дивизиона (ТОЛЬКО ДЛЯ ГЛОБАЛЬНОГО АДМИНА)
router.delete('/divisions/:id', requirePermission('DIVISIONS_DELETE'), deleteDivision);

// Загрузка команд дивизиона
router.get('/divisions/:id/teams', getDivisionTeams);

// --- ТУРНИРНАЯ ТАБЛИЦА ---
router.get('/divisions/:id/standings', getDivisionStandings);

// --- ПЛЕЙ-ОФФ ---
router.get('/divisions/:id/playoff', getPlayoffBracket);

// Сохранение конструктора сеток
router.post('/divisions/:id/playoff/save-constructor', requirePermission('SETTINGS_PLAYOFF_CONSTRUCTOR'), savePlayoffConstructor);

// Ручная замена команд в сетке
router.put('/divisions/:id/playoff/:matchupId', requirePermission('SETTINGS_PLAYOFF_CONSTRUCTOR'), updatePlayoffMatchup);

export default router;