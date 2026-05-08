const express = require('express');
const router = express.Router();

const {
  createIncident,
  getMyReports,
  getIncidentById,
  updateDraft,
  submitIncident,
  uploadPhotos,
  deletePhoto,
  getWorkerDashboard,
} = require('../controllers/workerController');

const { protect: auth, authorize } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');

// All routes protected — worker role only
router.use(auth);
router.use(authorize('worker'));

// Dashboard
router.get('/dashboard', getWorkerDashboard);

// Incidents — uploadMultiple handles both JSON fields and photos
router.post('/incidents', uploadMultiple, createIncident);
router.get('/incidents', getMyReports);
router.get('/incidents/:id', getIncidentById);
router.put('/incidents/:id/draft', updateDraft);
router.put('/incidents/:id/submit', submitIncident);

// Photos
router.post('/incidents/:id/photos', uploadMultiple, uploadPhotos);
router.delete('/incidents/:id/photos/:photoId', deletePhoto);

module.exports = router;