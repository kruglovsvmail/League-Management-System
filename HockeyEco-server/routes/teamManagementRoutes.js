import express from 'express';
import multer from 'multer';
import { verifyToken } from '../controllers/authController.js';
import {
    searchTeams,
    searchUsers,
    getTeamMembers,
    addTeamMember,
    uploadMemberPhoto,
    deleteMemberPhoto
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

export default router;