import express from 'express';
import { 
  lookupUserByPhone, getLeagueStaff, updateLeagueStaff,
  getSettingsQualifications, createQualification, deleteQualification, reorderQualifications, updateQualificationsDisplay,
  getAllSettingsArenas, getLeagueSettingsArenas, toggleLeagueArena,
  getLeagueServiceAccounts, createLeagueServiceAccount, updateLeagueServiceAccount, deleteLeagueServiceAccount,
  getLeaguePreferences, updateLeaguePreferences
} from '../controllers/settingsController.js';
import {
  getBroadcastAssets, uploadBroadcastAsset, deleteBroadcastAsset, updateBumperTitles
} from '../controllers/broadcastAssetsController.js';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import upload from '../config/upload.js'; // ИМПОРТИРУЕМ НАШ UPLOAD
import uploadBroadcast from '../config/uploadBroadcast.js';

const router = express.Router();
router.use(verifyToken);

router.get('/users/lookup', lookupUserByPhone);

// ОБЩИЕ ПАРАМЕТРЫ ЛИГИ
router.get('/leagues/:leagueId/preferences', requirePermission('SETTINGS_DIVISIONS_VIEW'), getLeaguePreferences);
router.put('/leagues/:leagueId/preferences', express.json(), requirePermission('SETTINGS_DIVISIONS_EDIT'), updateLeaguePreferences);

// ЭФИРНЫЕ ФАЙЛЫ ЛИГИ (Параметры → Трансляции): интро и три видео-заставки.
// Права те же, что у остальных параметров лиги — это её общая настройка.
router.get('/leagues/:leagueId/broadcast-assets', requirePermission('SETTINGS_DIVISIONS_VIEW'), getBroadcastAssets);
router.post('/leagues/:leagueId/broadcast-assets/:kind', requirePermission('SETTINGS_DIVISIONS_EDIT'), uploadBroadcast.single('file'), uploadBroadcastAsset);
router.delete('/leagues/:leagueId/broadcast-assets/:kind', requirePermission('SETTINGS_DIVISIONS_EDIT'), deleteBroadcastAsset);
router.put('/leagues/:leagueId/broadcast-assets/titles', express.json(), requirePermission('SETTINGS_DIVISIONS_EDIT'), updateBumperTitles);

// ПЕРСОНАЛ
router.get('/leagues/:leagueId/settings-staff', requirePermission('SETTINGS_STAFF_VIEW'), getLeagueStaff);
router.post('/leagues/:leagueId/settings-staff', express.json(), requirePermission('SETTINGS_STAFF_MANAGE'), updateLeagueStaff);

// КВАЛИФИКАЦИИ
router.get('/leagues/:leagueId/settings-qualifications', requirePermission('SETTINGS_QUAL_VIEW'), getSettingsQualifications);
router.post('/leagues/:leagueId/settings-qualifications', express.json(), requirePermission('SETTINGS_QUAL_CREATE'), createQualification);
router.put('/leagues/:leagueId/settings-qualifications/reorder', express.json(), requirePermission('SETTINGS_QUAL_CREATE'), reorderQualifications);
router.put('/leagues/:leagueId/settings-qualifications/display', express.json(), requirePermission('SETTINGS_QUAL_CREATE'), updateQualificationsDisplay);
router.delete('/leagues/:leagueId/settings-qualifications/:id', requirePermission('SETTINGS_QUAL_DELETE'), deleteQualification);

// АРЕНЫ ЛИГИ
router.get('/leagues/:leagueId/settings-arenas/all', requirePermission('SETTINGS_ARENAS_VIEW'), getAllSettingsArenas);
router.get('/leagues/:leagueId/settings-arenas', requirePermission('SETTINGS_ARENAS_VIEW'), getLeagueSettingsArenas);
router.post('/leagues/:leagueId/settings-arenas/toggle', express.json(), requirePermission('SETTINGS_ARENAS_MANAGE'), toggleLeagueArena);

// СЕРВИСНЫЕ АККАУНТЫ (Добавляем upload.single('photo') вместо express.json())
router.get('/leagues/:leagueId/service-accounts', requirePermission('SETTINGS_SERVICE_ACCOUNTS_VIEW'), getLeagueServiceAccounts);
router.post('/leagues/:leagueId/service-accounts', upload.single('photo'), requirePermission('SETTINGS_SERVICE_ACCOUNTS_MANAGE'), createLeagueServiceAccount);
router.put('/leagues/:leagueId/service-accounts/:id', upload.single('photo'), requirePermission('SETTINGS_SERVICE_ACCOUNTS_MANAGE'), updateLeagueServiceAccount);
router.delete('/leagues/:leagueId/service-accounts/:id', requirePermission('SETTINGS_SERVICE_ACCOUNTS_MANAGE'), deleteLeagueServiceAccount);

export default router;