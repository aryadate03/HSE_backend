const express = require('express');
const router = express.Router();
const {
  register,
  login,
  logout,
  getMe,
  verifyEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  approveUser,
  rejectUser,
  getPendingUsers,
} = require('../controllers/authController');
const { protect: auth, authorize } = require('../middleware/auth');

// ── Public Routes ─────────────────────────────────────────────────────────────
router.post('/register',                    register);
router.post('/login',                       login);
router.post('/forgot-password',             forgotPassword);
router.patch('/reset-password/:token',      resetPassword);
router.get('/verify-email/:token',          verifyEmail);

// ── Protected Routes ──────────────────────────────────────────────────────────
router.get('/me',                           auth, getMe);
router.post('/logout',                      auth, logout);
router.patch('/change-password',            auth, changePassword);

// ── Management Only — Approval Routes ────────────────────────────────────────
router.get('/pending-users',                auth, authorize('management'), getPendingUsers);
router.put('/approve/:userId',              auth, authorize('management'), approveUser);
router.put('/reject/:userId',               auth, authorize('management'), rejectUser);

module.exports = router;