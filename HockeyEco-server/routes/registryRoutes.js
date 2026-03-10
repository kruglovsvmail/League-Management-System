import express from 'express';
import multer from 'multer';
import { verifyToken } from '../controllers/authController.js';
import {
    getArenas, createArena, updateArena,
    getLeagues, createLeague, updateLeague,
    getSeasons, createSeason, updateSeason,
    getTeams, createTeam, updateTeam,
    getUsers, createUser, updateUser,
    uploadRegistryFile, deleteRegistryFile
} from '../controllers/registryController.js';

const router = express.Router();

// Храним загружаемые файлы в оперативной памяти перед отправкой в S3
const upload = multer({ storage: multer.memoryStorage() });

// Защищаем все маршруты реестра токеном администратора
router.use('/registry', verifyToken);

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
router.post('/registry/users', createUser);
router.put('/registry/users/:id', updateUser);

// --- ФАЙЛЫ (Универсальные маршруты для всех сущностей) ---
// Загрузка/перезапись файла (logo, avatar, jersey_light, jersey_dark)
router.post('/registry/:entity/:id/upload/:type', upload.single('file'), uploadRegistryFile);
// Удаление файла (зануление колонки в БД)
router.delete('/registry/:entity/:id/upload/:type', deleteRegistryFile);

export default router;