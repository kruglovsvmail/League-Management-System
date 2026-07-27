import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import upload from '../config/upload.js';
import {
  getSdkVenues, createSdkVenue, deleteSdkVenue,
  getSdkCommissionMembers, createSdkCommissionMember, deleteSdkCommissionMember,
  getSdkViolationTypes, createSdkViolationType, deleteSdkViolationType,
  getSdkMeetings, getSdkMeeting, createSdkMeeting, updateSdkMeeting, deleteSdkMeeting,
  getSdkMeetingMembers, addSdkMeetingMember, removeSdkMeetingMember,
  getSdkMeetingRepresentatives, addSdkMeetingRepresentative, removeSdkMeetingRepresentative,
  getSdkMeetingDocuments, uploadSdkMeetingDocuments, deleteSdkMeetingDocument,
  getSdkMeetingDecisions, createSdkMeetingDecision, updateSdkMeetingDecision, togglePaidSdkMeetingDecision, deleteSdkMeetingDecision
} from '../controllers/sdkController.js';

const router = express.Router();
router.use(verifyToken);

// МЕСТА ПРОВЕДЕНИЯ (по сезонам)
router.get('/seasons/:seasonId/sdk/venues', requirePermission('SDK_REFERENCES_VIEW'), getSdkVenues);
router.post('/seasons/:seasonId/sdk/venues', requirePermission('SDK_REFERENCES_MANAGE'), createSdkVenue);
router.delete('/sdk/venues/:id', requirePermission('SDK_REFERENCES_MANAGE'), deleteSdkVenue);

// УЧАСТНИКИ КОМИССИИ (по сезонам)
router.get('/seasons/:seasonId/sdk/commission-members', requirePermission('SDK_REFERENCES_VIEW'), getSdkCommissionMembers);
router.post('/seasons/:seasonId/sdk/commission-members', requirePermission('SDK_REFERENCES_MANAGE'), createSdkCommissionMember);
router.delete('/sdk/commission-members/:id', requirePermission('SDK_REFERENCES_MANAGE'), deleteSdkCommissionMember);

// СПРАВОЧНИК НАРУШЕНИЙ (по сезонам)
router.get('/seasons/:seasonId/sdk/violation-types', requirePermission('SDK_REFERENCES_VIEW'), getSdkViolationTypes);
router.post('/seasons/:seasonId/sdk/violation-types', requirePermission('SDK_REFERENCES_MANAGE'), createSdkViolationType);
router.delete('/sdk/violation-types/:id', requirePermission('SDK_VIOLATION_TYPES_DELETE'), deleteSdkViolationType);

// ЗАСЕДАНИЯ
router.get('/leagues/:leagueId/sdk/meetings', requirePermission('SDK_MEETINGS_VIEW'), getSdkMeetings);
router.post('/leagues/:leagueId/sdk/meetings', requirePermission('SDK_MEETINGS_MANAGE'), createSdkMeeting);
router.get('/sdk/meetings/:id', requirePermission('SDK_MEETINGS_VIEW'), getSdkMeeting);
router.put('/sdk/meetings/:id', requirePermission('SDK_MEETINGS_MANAGE'), updateSdkMeeting);
router.delete('/sdk/meetings/:id', requirePermission('SDK_MEETINGS_MANAGE'), deleteSdkMeeting);

// ЯВКА ЧЛЕНОВ КОМИССИИ
router.get('/sdk/meetings/:meetingId/members', requirePermission('SDK_MEETINGS_VIEW'), getSdkMeetingMembers);
router.post('/sdk/meetings/:meetingId/members', requirePermission('SDK_MEETINGS_MANAGE'), addSdkMeetingMember);
router.delete('/sdk/meeting-members/:id', requirePermission('SDK_MEETINGS_MANAGE'), removeSdkMeetingMember);

// ПРЕДСТАВИТЕЛИ КОМАНД
router.get('/sdk/meetings/:meetingId/representatives', requirePermission('SDK_MEETINGS_VIEW'), getSdkMeetingRepresentatives);
router.post('/sdk/meetings/:meetingId/representatives', requirePermission('SDK_MEETINGS_MANAGE'), addSdkMeetingRepresentative);
router.delete('/sdk/meeting-representatives/:id', requirePermission('SDK_MEETINGS_MANAGE'), removeSdkMeetingRepresentative);

// ДОКУМЕНТЫ И СКАНЫ
router.get('/sdk/meetings/:meetingId/documents', requirePermission('SDK_MEETINGS_VIEW'), getSdkMeetingDocuments);
router.post('/sdk/meetings/:meetingId/documents', upload.array('files', 10), requirePermission('SDK_MEETINGS_MANAGE'), uploadSdkMeetingDocuments);
router.delete('/sdk/meeting-documents/:id', requirePermission('SDK_MEETINGS_MANAGE'), deleteSdkMeetingDocument);

// РЕШЕНИЯ
router.get('/sdk/meetings/:meetingId/decisions', requirePermission('SDK_MEETINGS_VIEW'), getSdkMeetingDecisions);
router.post('/sdk/meetings/:meetingId/decisions', requirePermission('SDK_MEETINGS_MANAGE'), createSdkMeetingDecision);
router.put('/sdk/meeting-decisions/:id', requirePermission('SDK_MEETINGS_MANAGE'), updateSdkMeetingDecision);
router.patch('/sdk/meeting-decisions/:id/toggle-paid', requirePermission('SDK_MEETINGS_MANAGE'), togglePaidSdkMeetingDecision);
router.delete('/sdk/meeting-decisions/:id', requirePermission('SDK_MEETINGS_MANAGE'), deleteSdkMeetingDecision);

export default router;
