import express from 'express';
import { verifyToken, requirePermission } from '../controllers/authController.js';
import upload from '../config/upload.js';
import {
  getSdkVenues, createSdkVenue, deleteSdkVenue,
  getSdkCommissionMembers, createSdkCommissionMember, setSdkCommissionMemberPermanent, deleteSdkCommissionMember,
  getSdkViolationTypes, createSdkViolationType, updateSdkViolationType, reorderSdkViolationTypes, deleteSdkViolationType, copySdkViolationTypes,
  getSdkMeetings, getSdkMeeting, createSdkMeeting, updateSdkMeeting, deleteSdkMeeting,
  getSdkMeetingMembers, addSdkMeetingMember, removeSdkMeetingMember,
  getSdkMeetingDocuments, uploadSdkMeetingDocuments, deleteSdkMeetingDocument,
  getSdkMeetingDecisions, createSdkMeetingDecision, updateSdkMeetingDecision, togglePaidSdkMeetingDecision, deleteSdkMeetingDecision,
  togglePaidSdkDecisionMember
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
router.patch('/sdk/commission-members/:id/permanent', requirePermission('SDK_REFERENCES_MANAGE'), setSdkCommissionMemberPermanent);
router.delete('/sdk/commission-members/:id', requirePermission('SDK_REFERENCES_MANAGE'), deleteSdkCommissionMember);

// СПРАВОЧНИК НАРУШЕНИЙ (по сезонам)
router.get('/seasons/:seasonId/sdk/violation-types', requirePermission('SDK_REFERENCES_VIEW'), getSdkViolationTypes);
router.post('/seasons/:seasonId/sdk/violation-types', requirePermission('SDK_REFERENCES_MANAGE'), createSdkViolationType);
router.post('/seasons/:seasonId/sdk/violation-types/copy', requirePermission('SDK_REFERENCES_MANAGE'), copySdkViolationTypes);
router.put('/seasons/:seasonId/sdk/violation-types/reorder', requirePermission('SDK_REFERENCES_MANAGE'), reorderSdkViolationTypes);
router.put('/sdk/violation-types/:id', requirePermission('SDK_REFERENCES_MANAGE'), updateSdkViolationType);
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
router.patch('/sdk/decision-members/:id/toggle-paid', requirePermission('SDK_MEETINGS_MANAGE'), togglePaidSdkDecisionMember);

export default router;
