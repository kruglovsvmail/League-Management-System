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
    updatePlayoffMatchup,
    distributePlayoffTeams,
    resetPlayoffGrid
} from '../controllers/divisionController.js';

import {
    getNominations,
    getNominationResults,
    createNomination,
    updateNomination,
    deleteNomination,
    copyNominationsToSeason
} from '../controllers/nominationController.js';

import {
    getReserveGoalies,
    getReserveGoalieCandidates,
    addReserveGoalie,
    updateReserveGoalie,
    deleteReserveGoalie
} from '../controllers/reserveGoalieController.js';

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

// Маршруты для распределения и сброса сетки Плеф-офф
router.post('/divisions/:id/playoff/distribute', requirePermission('PLAYOFF_DISTRIBUTE'), distributePlayoffTeams);
router.post('/divisions/:id/playoff/reset', requirePermission('PLAYOFF_RESET'), resetPlayoffGrid);

// --- НОМИНАЦИИ ---
// Параметр назван :divisionId, а не :id — по нему getLeagueIdFromContext находит
// лигу для RBAC. Изменение и удаление тоже вложены в дивизион: права выдаются
// на него, и контроллер сверяет, что номинация принадлежит именно ему.
// Витрина результатов — без отдельного права: кто видит дивизион, тот видит и
// его номинации. Правом закрыт конструктор, а не награды.
router.get('/divisions/:divisionId/nominations/results', getNominationResults);

router.get('/divisions/:divisionId/nominations', requirePermission('SETTINGS_NOMINATIONS_VIEW'), getNominations);
router.post('/divisions/:divisionId/nominations', requirePermission('SETTINGS_NOMINATIONS_MANAGE'), createNomination);
router.post('/divisions/:divisionId/nominations/copy-to-season', requirePermission('SETTINGS_NOMINATIONS_MANAGE'), copyNominationsToSeason);
router.put('/divisions/:divisionId/nominations/:nominationId', requirePermission('SETTINGS_NOMINATIONS_MANAGE'), updateNomination);
router.delete('/divisions/:divisionId/nominations/:nominationId', requirePermission('SETTINGS_NOMINATIONS_MANAGE'), deleteNomination);

// --- РЕЗЕРВНЫЕ ВРАТАРИ ---
// Параметр назван :divisionId по той же причине, что и у номинаций — по нему
// getLeagueIdFromContext находит лигу для RBAC. Поиск кандидатов идёт по общей
// базе пользователей, поэтому закрыт правом на управление списком, а не на
// просмотр: это подбор, а не витрина.
// Маршрут поиска объявлен ДО :reserveId — иначе "candidates" уедет в параметр.
router.get('/divisions/:divisionId/reserve-goalies/candidates', requirePermission('SETTINGS_RESERVE_GOALIES_MANAGE'), getReserveGoalieCandidates);

router.get('/divisions/:divisionId/reserve-goalies', requirePermission('SETTINGS_RESERVE_GOALIES_VIEW'), getReserveGoalies);
router.post('/divisions/:divisionId/reserve-goalies', requirePermission('SETTINGS_RESERVE_GOALIES_MANAGE'), addReserveGoalie);
router.put('/divisions/:divisionId/reserve-goalies/:reserveId', requirePermission('SETTINGS_RESERVE_GOALIES_MANAGE'), updateReserveGoalie);
router.delete('/divisions/:divisionId/reserve-goalies/:reserveId', requirePermission('SETTINGS_RESERVE_GOALIES_MANAGE'), deleteReserveGoalie);

export default router;