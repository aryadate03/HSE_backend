const express = require('express');
const router = express.Router();
const { protect, authorize, requireApproved } = require('../middleware/auth');
const {
  getDashboard,
  getAllIncidents,
  getIncidentById,
  addAssessment,
  updatePriority,
  assignIncident,
  addComment,
  markReviewed,
  rejectIncident,
  forwardToSafetyOfficer,
  getSuggestedOfficer,       // ✅ NEW
  sendReport,
  getTeamMembers,
  getSafetyOfficers,
  getStatistics,
  escalateIncident,
} = require('../controllers/supervisorController');

const supervisorGuard = [protect, authorize('supervisor', 'admin'), requireApproved];

router.get('/dashboard',                          ...supervisorGuard, getDashboard);
router.get('/incidents',                          ...supervisorGuard, getAllIncidents);
router.get('/incidents/:id',                      ...supervisorGuard, getIncidentById);
router.put('/incidents/:id/assessment',           ...supervisorGuard, addAssessment);
router.put('/incidents/:id/priority',             ...supervisorGuard, updatePriority);
router.put('/incidents/:id/assign',               ...supervisorGuard, assignIncident);
router.post('/incidents/:id/comments',            ...supervisorGuard, addComment);
router.put('/incidents/:id/review',               ...supervisorGuard, markReviewed);
router.put('/incidents/:id/reject',               ...supervisorGuard, rejectIncident);
router.put('/incidents/:id/forward',              ...supervisorGuard, forwardToSafetyOfficer);
router.get('/incidents/:id/suggested-officer',    ...supervisorGuard, getSuggestedOfficer); // ✅ NEW
router.post('/incidents/:id/report',              ...supervisorGuard, sendReport);
router.put('/incidents/:id/escalate',             ...supervisorGuard, escalateIncident);
router.get('/team/safety-officers',               ...supervisorGuard, getSafetyOfficers);
router.get('/team',                               ...supervisorGuard, getTeamMembers);
router.get('/statistics',                         ...supervisorGuard, getStatistics);

module.exports = router;