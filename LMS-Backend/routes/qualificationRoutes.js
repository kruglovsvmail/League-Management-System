import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import { getUserQualification, setUserQualification, deleteUserQualificationEntry } from '../controllers/qualificationController.js';

const router = express.Router();

router.use(verifyToken);

// Квалификация человека в лиге: действующая + история + заявки, на которые повлияет смена.
// Точек входа две — справочник (там же присваивают тем, кто ещё нигде не заявлен) и
// состав дивизиона, — поэтому эндпоинт лиговый, а не привязанный к заявке.
router.get('/leagues/:leagueId/users/:userId/qualification', requirePermission('SETTINGS_QUAL_VIEW'), getUserQualification);

router.put('/leagues/:leagueId/users/:userId/qualification', express.json(), requirePermission('QUAL_ASSIGN'), setUserQualification);

// Удаление одной ошибочной записи истории (действующую квалификацию удалить нельзя)
router.delete('/leagues/:leagueId/users/:userId/qualification/:entryId', requirePermission('QUAL_ASSIGN'), deleteUserQualificationEntry);

export default router;
