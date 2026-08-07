import express from 'express';

import { verifyToken, requirePermission } from '../controllers/authController.js';
import {
    searchClubs,
    getClubDetails,
    setClubOwner,
    addClubMember,
    removeClubMember,
    setClubMemberRoles,
    searchTeamsForClub,
    attachTeamToClub,
    detachTeamFromClub
} from '../controllers/clubManagementController.js';

const router = express.Router();

// Клубы живут во вкладке раздела «Команды» и защищены тем же правом
router.use('/clubs-manage', verifyToken, requirePermission('TEAM_MANAGEMENT_ACCESS'));

// Конкретные пути объявляем раньше параметрических, чтобы «teams» не был прочитан как :clubId
router.get('/clubs-manage/search', searchClubs);
router.get('/clubs-manage/teams/search', searchTeamsForClub);

router.get('/clubs-manage/:clubId/details', getClubDetails);

// Владелец клуба (clubs.owner_id). Текущий приходит в ответе /details, здесь только запись
router.put('/clubs-manage/:clubId/owner', setClubOwner);

// Общая база клуба
router.post('/clubs-manage/:clubId/members', addClubMember);
router.delete('/clubs-manage/:clubId/members/:userId', removeClubMember);

// Клубные роли (штаб)
router.put('/clubs-manage/:clubId/members/:userId/roles', setClubMemberRoles);

// Команды клуба
router.post('/clubs-manage/:clubId/teams', attachTeamToClub);
router.delete('/clubs-manage/:clubId/teams/:teamId', detachTeamFromClub);

export default router;
