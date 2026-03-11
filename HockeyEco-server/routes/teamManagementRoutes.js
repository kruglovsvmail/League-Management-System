import express from 'express';
import multer from 'multer';
import { verifyToken } from '../controllers/authController.js';
import {
    searchTeams,
    searchUsers,
    getTeamMembers,
    addTeamMember,
    uploadMemberPhoto,
    deleteMemberPhoto,
    // --- НОВЫЕ ИМПОРТЫ ДЛЯ ЗАЯВОК ---
    getAvailableLeaguesAndDivisions,
    getTeamApplications,
    createTeamApplication,
    deleteTeamApplication,
    sendApplicationForReview,
    addPlayerToApplication,
    removePlayerFromApplication
} from '../controllers/teamManagementController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(verifyToken);

router.get('/teams-manage/search', searchTeams);
router.get('/teams-manage/users/search', searchUsers);
router.get('/teams-manage/:teamId/members', getTeamMembers);
router.post('/teams-manage/:teamId/members', addTeamMember);

// Эндпоинты для фото члена команды
router.post('/teams-manage/:teamId/members/:userId/photo', upload.single('file'), uploadMemberPhoto);
router.delete('/teams-manage/:teamId/members/:userId/photo', deleteMemberPhoto);

// --- НОВЫЕ ЭНДПОИНТЫ ДЛЯ ЗАЯВОК (ТУРНИРОВ) ---
// Получение доступных лиг и дивизионов для заявочной кампании
router.get('/teams-manage/available-divisions', getAvailableLeaguesAndDivisions);

// Управление заявками конкретной команды
router.get('/teams-manage/:teamId/applications', getTeamApplications);
router.post('/teams-manage/:teamId/applications', createTeamApplication);
router.delete('/teams-manage/:teamId/applications/:appId', deleteTeamApplication);
router.post('/teams-manage/:teamId/applications/:appId/send-review', sendApplicationForReview);

// Управление составом внутри заявки
router.post('/teams-manage/:teamId/applications/:appId/roster', addPlayerToApplication);
router.delete('/teams-manage/:teamId/applications/:appId/roster/:rosterId', removePlayerFromApplication);

export default router;