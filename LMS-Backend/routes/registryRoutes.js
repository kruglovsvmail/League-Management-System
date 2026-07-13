import express from 'express';
import upload from '../config/upload.js';

import { verifyToken, requirePermission } from '../controllers/authController.js';
import {
    getArenas, createArena, updateArena,
    getLeagues, createLeague, updateLeague,
    getSeasons, createSeason, updateSeason,
    getTeams, createTeam, updateTeam,
    getUsers, createUser, updateUser,
    uploadRegistryFile, deleteRegistryFile,
    checkUserNameDuplicates, previewUserImport, confirmUserImport,
    getNextVirtualPhone
} from '../controllers/registryController.js';

const router = express.Router();

// Защищаем все маршруты реестра токеном авторизации И проверкой на глобального админа
router.use('/registry', verifyToken, requirePermission('GLOBAL_REGISTRY_ACCESS'));

// --- АРЕНЫ ---
router.get('/registry/arenas', getArenas);
router.post('/registry/arenas', createArena);
router.put('/registry/arenas/:id', updateArena);

// --- ЛИГИ ---
router.get('/registry/leagues', getLeagues);
router.post('/registry/leagues', createLeague);
router.put('/registry/leagues/:id', updateLeague);

// --- СЕЗОНЫ ---
router.get('/registry/seasons', getSeasons);
router.post('/registry/seasons', createSeason);
router.put('/registry/seasons/:id', updateSeason);

// --- КОМАНДЫ ---
router.get('/registry/teams', getTeams);
router.post('/registry/teams', createTeam);
router.put('/registry/teams/:id', updateTeam);

// --- ПОЛЬЗОВАТЕЛИ ---
router.get('/registry/users', getUsers);
router.get('/registry/users/next-virtual-phone', getNextVirtualPhone);
router.post('/registry/users', createUser);
router.post('/registry/users/check-duplicates', checkUserNameDuplicates);
router.post('/registry/users/import/preview', upload.single('file'), previewUserImport);
router.post('/registry/users/import/confirm', confirmUserImport);
router.put('/registry/users/:id', updateUser);

// --- ФАЙЛЫ (Универсальные маршруты для всех сущностей) ---
// Загрузка/перезапись файла (logo, avatar, jersey_light, jersey_dark)
router.post('/registry/:entity/:id/upload/:type', upload.single('file'), uploadRegistryFile);
// Удаление файла (зануление колонки в БД)
router.delete('/registry/:entity/:id/upload/:type', deleteRegistryFile);

export default router;