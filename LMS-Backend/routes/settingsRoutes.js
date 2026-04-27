import express from 'express';
import { 
  lookupUserByPhone, getLeagueStaff, updateLeagueStaff,
  getSettingsQualifications, createQualification, deleteQualification
} from '../controllers/settingsController.js';
import { verifyToken, requirePermission } from '../controllers/authController.js';

const router = express.Router();
router.use(verifyToken);

router.get('/users/lookup', lookupUserByPhone);

// ПЕРСОНАЛ
router.get('/leagues/:leagueId/settings-staff', requirePermission('SETTINGS_STAFF_VIEW'), getLeagueStaff);
router.post('/leagues/:leagueId/settings-staff', express.json(), requirePermission('SETTINGS_STAFF_MANAGE'), updateLeagueStaff);

// КВАЛИФИКАЦИИ
router.get('/leagues/:leagueId/settings-qualifications', requirePermission('SETTINGS_QUAL_VIEW'), getSettingsQualifications);
router.post('/leagues/:leagueId/settings-qualifications', express.json(), requirePermission('SETTINGS_QUAL_CREATE'), createQualification);
router.delete('/leagues/:leagueId/settings-qualifications/:id', requirePermission('SETTINGS_QUAL_DELETE'), deleteQualification);

export default router;