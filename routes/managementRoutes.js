const express = require('express');
const router  = express.Router();
const { protect, authorize, requireApproved } = require('../middleware/auth');
const { getIncidentTimeline } = require('../services/incidentLogService');
const {
  getDashboard,
  getAllIncidents,
  getIncidentById,
  closeIncident,
  getAnalytics,
  getReports,
  getComplianceRate,
} = require('../controllers/managementController');

const guard = [protect, authorize('management', 'admin'), requireApproved];

router.get('/dashboard',           ...guard, getDashboard);
router.get('/incidents',           ...guard, getAllIncidents);
router.get('/incidents/:id',       ...guard, getIncidentById);
router.put('/incidents/:id/close', ...guard, closeIncident);
router.get('/analytics',           ...guard, getAnalytics);
router.get('/reports',             ...guard, getReports);       
router.get('/compliance',          ...guard, getComplianceRate);
router.get('/incidents/:id/timeline', ...guard, async (req, res) => {
  try {
    const timeline = await getIncidentTimeline(req.params.id);
    res.status(200).json({ success: true, data: timeline });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;