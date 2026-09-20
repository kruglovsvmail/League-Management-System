import express from 'express';

import { verifyToken, requirePermission } from '../controllers/authController.js';
import {
    searchCommunities,
    getCommunityDetails,
    setCommunityOwner
} from '../controllers/communityManagementController.js';

const router = express.Router();

// Сообщества живут во вкладке раздела «Команды» и защищены тем же правом, что команды и клубы
router.use('/communities-manage', verifyToken, requirePermission('TEAM_MANAGEMENT_ACCESS'));

// Конкретный путь объявляем раньше параметрического, чтобы «search» не был прочитан как :communityId
router.get('/communities-manage/search', searchCommunities);

// Всё сообщество разом: настройки, владелец, участники, штаб, группы, инфо-блоки — только чтение
router.get('/communities-manage/:communityId/details', getCommunityDetails);

// Владелец сообщества (communities.owner_id) — единственная запись из LMS.
// Текущий приходит в ответе /details, здесь только назначение и снятие
router.put('/communities-manage/:communityId/owner', setCommunityOwner);

export default router;
