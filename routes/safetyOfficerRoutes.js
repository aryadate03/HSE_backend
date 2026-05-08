const express = require('express');
const router = express.Router();
const { protect, authorize, requireApproved } = require('../middleware/auth');
const { uploadInspection } = require('../middleware/upload');
const {
  getDashboard,
  getAssignedCases,
  getOverdueCases,
  getCaseById,
  startInvestigation,
  logSiteVisit,
  uploadInspectionPhotos,
  deleteInspectionPhoto,
  addRootCause,
  addCorrectiveActions,
  addPreventiveMeasures,
  updateCost,
  updateInvestigationStatus,
  resolveCase,
  closeCase,
  sendReport,
  getAnalytics,
} = require('../controllers/safetyOfficerController');

const guard = [protect, authorize('safety_officer', 'admin'), requireApproved];

router.get('/dashboard',                                    ...guard, getDashboard);
router.get('/cases',                                        ...guard, getAssignedCases);
router.get('/cases/overdue',                                ...guard, getOverdueCases);
router.get('/cases/:id',                                    ...guard, getCaseById);
router.put('/cases/:id/start',                              ...guard, startInvestigation);       // ⭐ NEW
router.post('/cases/:id/site-visit',                        ...guard, logSiteVisit);
router.post('/cases/:id/inspection-photos',                 ...guard, uploadInspection, uploadInspectionPhotos);
router.delete('/cases/:id/inspection-photos/:photoId',      ...guard, deleteInspectionPhoto);
router.post('/cases/:id/root-cause',                        ...guard, addRootCause);
router.post('/cases/:id/corrective-actions',                ...guard, addCorrectiveActions);
router.post('/cases/:id/preventive-measures',               ...guard, addPreventiveMeasures);
router.put('/cases/:id/cost',                               ...guard, updateCost);
router.put('/cases/:id/status',                             ...guard, updateInvestigationStatus);
router.post('/cases/:id/resolve',                           ...guard, resolveCase);              // ⭐ NEW
router.post('/cases/:id/close',                             ...guard, closeCase);
router.post('/cases/:id/report',                            ...guard, sendReport);               // ⭐ NEW
router.get('/analytics',                                    ...guard, getAnalytics);

module.exports = router;