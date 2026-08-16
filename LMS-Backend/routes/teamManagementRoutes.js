import express from 'express';
import upload from '../config/upload.js';

import { verifyToken, requirePermission } from '../controllers/authController.js'; 
import {
    searchTeams,
    searchUsers,
    getTeamMembers,
    setTeamOwner,
    addTeamMember,
    uploadMemberPhoto,
    deleteMemberPhoto,
    getAvailableLeaguesAndDivisions,
    getTeamApplications,
    getQualificationEligibility,
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

// Владелец команды. Текущий владелец приходит в ответе /members, здесь только запись
router.put('/teams-manage/:teamId/owner', setTeamOwner);

// Эндпоинты для фото члена команды
router.post('/teams-manage/:teamId/members/:userId/photo', upload.single('file'), uploadMemberPhoto);
router.delete('/teams-manage/:teamId/members/:userId/photo', deleteMemberPhoto);

// --- НОВЫЕ ЭНДПОИНТЫ ДЛЯ ЗАЯВОК (ТУРНИРОВ) ---
router.get('/teams-manage/available-divisions', getAvailableLeaguesAndDivisions);

// Управление заявками конкретной команды
router.get('/teams-manage/:teamId/applications', getTeamApplications);
router.get('/teams-manage/:teamId/qual-eligibility', getQualificationEligibility);
router.post('/teams-manage/:teamId/applications', upload.single('file'), createTeamApplication);
router.delete('/teams-manage/:teamId/applications/:appId', deleteTeamApplication);
router.post('/teams-manage/:teamId/applications/:appId/send-review', sendApplicationForReview);

// Управление ИГРОКАМИ внутри заявки
router.post('/teams-manage/:teamId/applications/:appId/roster', addPlayerToApplication);
router.delete('/teams-manage/:teamId/applications/:appId/roster/:rosterId', removePlayerFromApplication);

// Управление ПЕРСОНАЛОМ внутри заявки
router.post('/teams-manage/:teamId/applications/:appId/staff', addStaffToApplication);
// Без :role — человек убирается из заявки целиком, с :role — снимается только эта его роль
router.delete('/teams-manage/:teamId/applications/:appId/staff/:userId', removeStaffFromApplication);
router.delete('/teams-manage/:teamId/applications/:appId/staff/:userId/:role', removeStaffFromApplication);

export default router;