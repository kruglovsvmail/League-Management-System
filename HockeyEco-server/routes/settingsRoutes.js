import express from 'express';
import { 
  lookupUserByPhone, getLeagueStaff, updateLeagueStaff,
  getSettingsQualifications, createQualification, deleteQualification
} from '../controllers/settingsController.js';
import { verifyToken, requireLeagueRole } from '../controllers/authController.js'; // <-- Защита

const router = express.Router();
router.use(verifyToken);

router.get('/users/lookup', lookupUserByPhone);

// ПЕРСОНАЛ (Менять могут только top_manager)
router.get('/leagues/:leagueId/settings-staff', getLeagueStaff);
router.post('/leagues/:leagueId/settings-staff', express.json(), requireLeagueRole(['top_manager']), updateLeagueStaff);

// КВАЛИФИКАЦИИ
router.get('/leagues/:leagueId/settings-qualifications', getSettingsQualifications);

// Добавлять могут top_manager и league_admin
router.post('/leagues/:leagueId/settings-qualifications', express.json(), requireLeagueRole(['top_manager', 'league_admin']), createQualification);

// Удалять может ТОЛЬКО top_manager
router.delete('/leagues/:leagueId/settings-qualifications/:id', requireLeagueRole(['top_manager']), deleteQualification);

export default router;