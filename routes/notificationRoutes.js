const express = require('express');
const router = express.Router();

const {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require('../controllers/notificationController');

const { protect: auth, authorize } = require('../middleware/auth');

// All routes protected — any logged in role
router.use(auth);

router.get('/', getUserNotifications);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);
router.delete('/:id', deleteNotification);

module.exports = router;