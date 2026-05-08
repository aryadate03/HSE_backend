const CreditPoints = require('../models/CreditPoints');
const User = require('../models/User');

// ─── Badge definitions ────────────────────────────────────────────────────────
const BADGES = {
  FIRST_VERIFY:  { name: 'First Verify',  icon: '🤝', description: 'Completed your first Joint Safety Verify' },
  PERFECT_WEEK:  { name: 'Perfect Week',  icon: '⭐', description: '7 consecutive days of completed verifies' },
  HAZARD_HUNTER: { name: 'Hazard Hunter', icon: '🔍', description: 'Reported 5 or more hazards' },
  SAFETY_STAR:   { name: 'Safety Star',   icon: '🌟', description: 'Reached 500 credit points' },
  IRON_WORKER:   { name: 'Iron Worker',   icon: '🏆', description: '30-day verify streak' },
  INCIDENT_FREE: { name: 'Incident Free', icon: '🛡️', description: '30 consecutive incident-free days' },
  TOP_PERFORMER: { name: 'Top Performer', icon: '👑', description: 'Ranked #1 on site leaderboard' },
};

// ─── Award points for completing Joint Safety Verify ─────────────────────────
const awardVerifyPoints = async (userId, buddyPairId, isOnTime = true, streak = 0) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const verifyPoints = 10;
    const onTimeBonus  = isOnTime ? 5 : 0;
    const streakBonus  = Math.min(streak, 10) * 2; // max +20 for streak
    const totalPoints  = verifyPoints + onTimeBonus + streakBonus;

    // Upsert daily record
    await CreditPoints.findOneAndUpdate(
      { worker: userId, date: today },
      {
        $inc: {
          verifyPoints,
          onTimeBonus,
          streakBonus,
          totalPoints,
        },
        $set: { buddyPair: buddyPairId },
      },
      { upsert: true, new: true }
    );

    // Add to user total
    const user = await User.findById(userId);
    await user.addCreditPoints(totalPoints);

    // Check and award badges
    await checkAndAwardBadges(user);

    return totalPoints;
  } catch (err) {
    console.error('Credit points error:', err.message);
    return 0;
  }
};

// ─── Award points for reporting a hazard/incident ─────────────────────────────
const awardHazardPoints = async (userId) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const hazardPoints = 15;

    await CreditPoints.findOneAndUpdate(
      { worker: userId, date: today },
      { $inc: { hazardPoints, totalPoints: hazardPoints } },
      { upsert: true, new: true }
    );

    const user = await User.findById(userId);
    await user.addCreditPoints(hazardPoints);
    await checkAndAwardBadges(user);

    return hazardPoints;
  } catch (err) {
    console.error('Hazard points error:', err.message);
    return 0;
  }
};

// ─── Award incident-free day bonus (called by cron at end of day) ─────────────
const awardIncidentFreeBonus = async (userId) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const incidentFree = 5;

    await CreditPoints.findOneAndUpdate(
      { worker: userId, date: today },
      { $inc: { incidentFree, totalPoints: incidentFree } },
      { upsert: true, new: true }
    );

    const user = await User.findById(userId);
    await user.addCreditPoints(incidentFree);

    return incidentFree;
  } catch (err) {
    console.error('Incident free points error:', err.message);
    return 0;
  }
};

// ─── Check and award badges ───────────────────────────────────────────────────
const checkAndAwardBadges = async (user) => {
  const newBadges = [];

  // First verify
  if (user.totalVerifies === 1) {
    const awarded = await user.awardBadge(BADGES.FIRST_VERIFY);
    if (awarded) newBadges.push(BADGES.FIRST_VERIFY);
  }

  // Perfect week — 7 day streak
  if (user.verifyStreak >= 7) {
    const awarded = await user.awardBadge(BADGES.PERFECT_WEEK);
    if (awarded) newBadges.push(BADGES.PERFECT_WEEK);
  }

  // Iron worker — 30 day streak
  if (user.verifyStreak >= 30) {
    const awarded = await user.awardBadge(BADGES.IRON_WORKER);
    if (awarded) newBadges.push(BADGES.IRON_WORKER);
  }

  // Safety star — 500 points
  if (user.totalCreditPoints >= 500) {
    const awarded = await user.awardBadge(BADGES.SAFETY_STAR);
    if (awarded) newBadges.push(BADGES.SAFETY_STAR);
  }

  return newBadges;
};

// ─── Get leaderboard ──────────────────────────────────────────────────────────
const getLeaderboard = async (type = 'monthly', limit = 10) => {
  const sortField = type === 'weekly' ? 'weeklyPoints' : type === 'all_time' ? 'totalCreditPoints' : 'monthlyPoints';

  const workers = await User.find({ role: 'worker', isActive: true })
    .select(`name department ${sortField} totalCreditPoints verifyStreak badges experienceLevel`)
    .sort({ [sortField]: -1 })
    .limit(limit);

  return workers.map((w, i) => ({
    rank: i + 1,
    name: w.name,
    department: w.department,
    points: w[sortField] || 0,
    totalPoints: w.totalCreditPoints,
    streak: w.verifyStreak,
    badges: w.badges,
    experienceLevel: w.experienceLevel,
    isTopPerformer: i === 0,
  }));
};

// ─── Reset weekly/monthly points (called by cron) ────────────────────────────
const resetWeeklyPoints = async () => {
  await User.updateMany({ role: 'worker' }, { $set: { weeklyPoints: 0 } });
};

const resetMonthlyPoints = async () => {
  await User.updateMany({ role: 'worker' }, { $set: { monthlyPoints: 0 } });
};

module.exports = {
  awardVerifyPoints,
  awardHazardPoints,
  awardIncidentFreeBonus,
  getLeaderboard,
  resetWeeklyPoints,
  resetMonthlyPoints,
  BADGES,
};