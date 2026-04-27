import express from 'express';
import upload from '../config/upload.js';

import { verifyToken, requirePermission } from '../controllers/authController.js'; 
import {
    searchTeams,
    searchUsers,
    getTeamMembers,
    addTeamMember,
    uploadMemberPhoto,
    deleteMemberPhoto,
    getAvailableLeaguesAndDivisions,
    getTeamApplications,
    createTeamApplication,
    deleteTeamApplication,
    sendApplicationForReview,
    addPlayerToApplication,
    removePlayerFromApplication,
    addStaffToApplication,
    removeStaffFromApplication
} from '../controllers/teamManagementController.js';

const router = express.Router();

// Защищаем весь раздел "Управление командой" проверкой на глобального админа
router.use('/teams-manage', verifyToken, requirePermission('TEAM_MANAGEMENT_ACCESS'));

router.get('/teams-manage/search', searchTeams);
router.get('/teams-manage/users/search', searchUsers);
router.get('/teams-manage/:teamId/members', getTeamMembers);
router.post('/teams-manage/:teamId/members', addTeamMember);

// Эндпоинты для фото члена команды
router.post('/teams-manage/:teamId/members/:userId/photo', upload.single('file'), uploadMemberPhoto);
router.delete('/teams-manage/:teamId/members/:userId/photo', deleteMemberPhoto);

// --- НОВЫЕ ЭНДПОИНТЫ ДЛЯ ЗАЯВОК (ТУРНИРОВ) ---
router.get('/teams-manage/available-divisions', getAvailableLeaguesAndDivisions);

// Управление заявками конкретной команды
router.get('/teams-manage/:teamId/applications', getTeamApplications);
router.post('/teams-manage/:teamId/applications', upload.single('file'), createTeamApplication);
router.delete('/teams-manage/:teamId/applications/:appId', deleteTeamApplication);
router.post('/teams-manage/:teamId/applications/:appId/send-review', sendApplicationForReview);

// Управление ИГРОКАМИ внутри заявки
router.post('/teams-manage/:teamId/applications/:appId/roster', addPlayerToApplication);
router.delete('/teams-manage/:teamId/applications/:appId/roster/:rosterId', removePlayerFromApplication);

// Управление ПЕРСОНАЛОМ внутри заявки
router.post('/teams-manage/:teamId/applications/:appId/staff', addStaffToApplication);
router.delete('/teams-manage/:teamId/applications/:appId/staff/:userId', removeStaffFromApplication);

export default router;