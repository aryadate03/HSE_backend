const express = require('express');
const router = express.Router();
const { protect: auth, authorize } = require('../middleware/auth');
const {
  createDailyPairs,
  getMyBuddyPair,
  answerChecklistItem,
  confirmVerify,
  getBuddyHistory,
  getMySafetyScore,
  getLeaderboardHandler,
  getAllTodayPairs,
} = require('../controllers/buddyController');

// ─── Worker routes ────────────────────────────────────────────────────────────
router.get('/my-pair',                   auth, authorize('worker'), getMyBuddyPair);
router.get('/my-score',                  auth, authorize('worker'), getMySafetyScore);
router.get('/history',                   auth, authorize('worker'), getBuddyHistory);
router.put('/:pairId/confirm',           auth, authorize('worker'), confirmVerify);
router.put('/:pairId/checklist/:itemId', auth, authorize('worker'), answerChecklistItem);

// ─── Leaderboard — all authenticated users can see ───────────────────────────
router.get('/leaderboard', auth, getLeaderboardHandler);

// ─── Supervisor routes ────────────────────────────────────────────────────────
router.get('/today',         auth, authorize('supervisor', 'safety_officer', 'management'), getAllTodayPairs);
router.post('/create-pairs', auth, authorize('supervisor', 'safety_officer'), createDailyPairs);

module.exports = router;