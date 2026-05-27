const BuddyPair = require('../models/BuddyPair');
const User = require('../models/User');
const { successResponse } = require('../utils/errorResponse');
const { AppError } = require('../middleware/errorhandler');
const { awardVerifyPoints, getLeaderboard } = require('../services/creditPointsService');

// ─── Notification helper — safe fallback if service missing ──────────────────
let sendNotification;
try {
  sendNotification = require('../services/notificationService').sendNotification;
} catch {
  sendNotification = async () => {};
}

// ─── Checklist questions per task type ───────────────────────────────────────
const CHECKLIST_QUESTIONS = {
  scaffolding: [
    'Have you both inspected the scaffold for damage or loose parts?',
    'Are all safety harnesses worn and properly clipped?',
    'Is the work area below clear of people?',
    'Have you checked today\'s wind speed is within safe limits?',
  ],
  electrical: [
    'Has the circuit been locked out / tagged out?',
    'Are both of you wearing insulated gloves and boots?',
    'Have you verified the panel is de-energized with a tester?',
    'Is a fire extinguisher accessible within 5 meters?',
  ],
  excavation: [
    'Have you checked for underground utilities before digging?',
    'Is the trench properly shored or sloped?',
    'Are both of you wearing high-visibility vests?',
    'Is there a safe exit route from the excavation?',
  ],
  welding: [
    'Are fire-resistant barriers in place around the welding area?',
    'Are both of you wearing proper welding helmets and gloves?',
    'Is the ventilation adequate to remove fumes?',
    'Is a fire watch person assigned?',
  ],
  heavy_machinery: [
    'Have you both done a walk-around inspection of the machine?',
    'Are all bystanders at a safe distance?',
    'Has the operator shown a valid certification today?',
    'Are all safety guards in place and functional?',
  ],
  chemical_handling: [
    'Have you both read the MSDS for the chemicals involved?',
    'Are proper PPE (gloves, goggles, apron) being worn?',
    'Is an eyewash station accessible nearby?',
    'Is the spill kit nearby and ready for use?',
  ],
  general: [
    'Have you both reviewed today\'s task and potential hazards?',
    'Is all required PPE being worn correctly?',
    'Have you identified the nearest first-aid kit and emergency exit?',
    'Are you both feeling fit and alert to work today?',
  ],
};

// ─── Seeded shuffle — same date = same shuffle (consistent within a day) ─────
// But different date = different shuffle (different pairs every day)
const seededShuffle = (array, seed) => {
  const arr = [...array];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff; // LCG random
    const j = Math.abs(s) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// ─── Get date seed — unique number per day ────────────────────────────────────
const getDateSeed = (date) => {
  const d = new Date(date);
  // e.g. 20250527 → unique number every day
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};

// ─── Matching Algorithm — random pairs every day ──────────────────────────────
const matchWorkers = (workers, date) => {
  const LEVEL_RANK = { junior: 1, mid: 2, senior: 3, expert: 4 };
  const pairs = [];

  // ✅ Split into seniors and juniors
  const seniors = workers.filter(w => (LEVEL_RANK[w.experienceLevel] || 1) >= 3); // senior + expert
  const juniors = workers.filter(w => (LEVEL_RANK[w.experienceLevel] || 1) < 3);  // junior + mid

  const seed = getDateSeed(date);

  // ✅ Shuffle both groups using today's date as seed — different every day
  const shuffledSeniors = seededShuffle(seniors, seed);
  const shuffledJuniors = seededShuffle(juniors, seed + 1);

  // ✅ Pair senior[i] with junior[i]
  const minLen = Math.min(shuffledSeniors.length, shuffledJuniors.length);
  for (let i = 0; i < minLen; i++) {
    pairs.push({ senior: shuffledSeniors[i], junior: shuffledJuniors[i] });
  }

  // ✅ Leftover workers (if uneven senior/junior split) — pair among themselves randomly
  const leftoverSeniors = shuffledSeniors.slice(minLen);
  const leftoverJuniors = shuffledJuniors.slice(minLen);
  const leftovers = seededShuffle([...leftoverSeniors, ...leftoverJuniors], seed + 2);

  for (let i = 0; i < leftovers.length - 1; i += 2) {
    const a = leftovers[i];
    const b = leftovers[i + 1];
    const rankA = LEVEL_RANK[a.experienceLevel] || 1;
    const rankB = LEVEL_RANK[b.experienceLevel] || 1;
    if (rankA >= rankB) {
      pairs.push({ senior: a, junior: b });
    } else {
      pairs.push({ senior: b, junior: a });
    }
  }

  // ✅ Odd leftover — add to first pair's junior slot
  if (leftovers.length % 2 !== 0) {
    const lastWorker = leftovers[leftovers.length - 1];
    if (pairs[0]) {
      const rankL = LEVEL_RANK[lastWorker.experienceLevel] || 1;
      const rankJ = LEVEL_RANK[pairs[0].junior.experienceLevel] || 1;
      if (rankL >= rankJ) {
        pairs.push({ senior: lastWorker, junior: pairs[0].junior });
      } else {
        pairs.push({ senior: pairs[0].junior, junior: lastWorker });
      }
    }
  }

  return pairs;
};

// ─── CREATE TODAY'S PAIRS ─────────────────────────────────────────────────────
const createDailyPairs = async (req, res, next) => {
  try {
    const { taskType = 'general', department } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingCount = await BuddyPair.countDocuments({ pairedDate: today });

    if (existingCount > 0) {
      return next(new AppError(
        `Pairs already created for today (${existingCount} pairs exist).`,
        400
      ));
    }

    const query = { role: 'worker', isActive: true };
    if (department) query.department = department;
    const workers = await User.find(query)
      .select('name safetyScore experienceLevel department totalCreditPoints');

    if (workers.length < 2) {
      return next(new AppError(
        `Need at least 2 active workers to create pairs. Found: ${workers.length} worker(s).`,
        400
      ));
    }

    // ✅ Pass today's date to matchWorkers for daily randomness
    const pairs = matchWorkers(workers, today);
    const questions = CHECKLIST_QUESTIONS[taskType] || CHECKLIST_QUESTIONS.general;
    const createdPairs = [];

    for (const { senior, junior } of pairs) {
      const checklist = questions.map((q) => ({ question: q }));
      const pair = new BuddyPair({
        seniorWorker: senior._id,
        juniorWorker: junior._id,
        pairedDate:   today,
        taskType,
        checklist,
      });
      await pair.save();
      createdPairs.push(pair);

      await sendNotification({
        recipient: senior._id,
        type:      'general',
        title:     '🤝 Safety Buddy Assigned',
        message:   `You are paired with ${junior.name} today for ${taskType.replace('_', ' ')} work. Complete your Joint Safety Verify to earn points!`,
      });
      await sendNotification({
        recipient: junior._id,
        type:      'general',
        title:     '🤝 Safety Buddy Assigned',
        message:   `You are paired with ${senior.name} today for ${taskType.replace('_', ' ')} work. Complete your Joint Safety Verify to earn points!`,
      });
    }

    return successResponse(res, 201, `${createdPairs.length} buddy pairs created for today`, {
      pairs:        createdPairs,
      totalWorkers: workers.length,
      totalPairs:   createdPairs.length,
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET MY TODAY'S BUDDY PAIR ────────────────────────────────────────────────
const getMyBuddyPair = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const pair = await BuddyPair.findOne({
      pairedDate: { $gte: today, $lt: tomorrow },
      $or: [{ seniorWorker: req.user._id }, { juniorWorker: req.user._id }],
    })
      .populate('seniorWorker', 'name email department safetyScore verifyStreak experienceLevel totalCreditPoints badges')
      .populate('juniorWorker', 'name email department safetyScore verifyStreak experienceLevel totalCreditPoints badges');

    if (!pair) {
      return successResponse(res, 200, 'No buddy pair assigned for today', {
        pair:        null,
        buddy:       null,
        myRole:      null,
        myConfirmed: false,
      });
    }

    const isSenior    = pair.seniorWorker._id.toString() === req.user._id.toString();
    const myRole      = isSenior ? 'senior' : 'junior';
    const buddy       = isSenior ? pair.juniorWorker : pair.seniorWorker;
    const myConfirmed = isSenior ? pair.seniorConfirmed : pair.juniorConfirmed;

    return successResponse(res, 200, 'Buddy pair fetched', {
      pair,
      myRole,
      buddy,
      myConfirmed,
    });
  } catch (error) {
    next(error);
  }
};

// ─── ANSWER CHECKLIST ITEM ────────────────────────────────────────────────────
const answerChecklistItem = async (req, res, next) => {
  try {
    const { pairId, itemId } = req.params;
    const { answer } = req.body;

    const pair = await BuddyPair.findOne({
      _id: pairId,
      $or: [{ seniorWorker: req.user._id }, { juniorWorker: req.user._id }],
      status: { $in: ['pending', 'in_progress'] },
    });

    if (!pair) return next(new AppError('Buddy pair not found or already completed', 404));

    const item = pair.checklist.id(itemId);
    if (!item) return next(new AppError('Checklist item not found', 404));

    item.answeredBy = req.user._id;
    item.answeredAt = new Date();
    item.answer     = answer;
    pair.status     = 'in_progress';
    await pair.save();

    return successResponse(res, 200, 'Checklist item answered', { checklist: pair.checklist });
  } catch (error) {
    next(error);
  }
};

// ─── CONFIRM VERIFY ───────────────────────────────────────────────────────────
const confirmVerify = async (req, res, next) => {
  try {
    const { pairId } = req.params;
    const { notes }  = req.body;

    const pair = await BuddyPair.findOne({
      _id: pairId,
      $or: [{ seniorWorker: req.user._id }, { juniorWorker: req.user._id }],
      status: { $in: ['pending', 'in_progress'] },
    });

    if (!pair) return next(new AppError('Buddy pair not found or already completed', 404));

    const isSenior = pair.seniorWorker.toString() === req.user._id.toString();
    if (isSenior) {
      pair.seniorConfirmed   = true;
      pair.seniorConfirmedAt = new Date();
    } else {
      pair.juniorConfirmed   = true;
      pair.juniorConfirmedAt = new Date();
    }

    if (notes) pair.notes = notes;

    if (pair.seniorConfirmed && pair.juniorConfirmed) {
      pair.status      = 'completed';
      pair.completedAt = new Date();

      const [senior, junior] = await Promise.all([
        User.findById(pair.seniorWorker),
        User.findById(pair.juniorWorker),
      ]);

      await senior.updateSafetyScore(true);
      await junior.updateSafetyScore(true);

      const hour     = new Date().getHours();
      const isOnTime = hour < 9;

      const seniorPoints = await awardVerifyPoints(senior._id, pair._id, isOnTime, senior.verifyStreak);
      const juniorPoints = await awardVerifyPoints(junior._id, pair._id, isOnTime, junior.verifyStreak);

      await sendNotification({
        recipient: pair.seniorWorker,
        type:      'general',
        title:     '✅ Joint Safety Verify Complete!',
        message:   `Great job! You earned ${seniorPoints} credit points today. Keep the streak going!`,
      });
      await sendNotification({
        recipient: pair.juniorWorker,
        type:      'general',
        title:     '✅ Joint Safety Verify Complete!',
        message:   `Great job! You earned ${juniorPoints} credit points today. Keep the streak going!`,
      });
    }

    await pair.save();
    return successResponse(res, 200, 'Confirmation recorded', {
      pair,
      bothConfirmed: pair.seniorConfirmed && pair.juniorConfirmed,
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET MY SAFETY SCORE + POINTS ────────────────────────────────────────────
const getMySafetyScore = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('name safetyScore verifyStreak totalVerifies skippedVerifies experienceLevel totalCreditPoints weeklyPoints monthlyPoints badges');

    const betterCount  = await User.countDocuments({ role: 'worker', totalCreditPoints: { $gt: user.totalCreditPoints } });
    const totalWorkers = await User.countDocuments({ role: 'worker' });
    const percentile   = totalWorkers > 0
      ? Math.round(((totalWorkers - betterCount) / totalWorkers) * 100)
      : 0;

    return successResponse(res, 200, 'Safety score fetched', {
      safetyScore:       user.safetyScore,
      verifyStreak:      user.verifyStreak,
      totalVerifies:     user.totalVerifies,
      skippedVerifies:   user.skippedVerifies,
      experienceLevel:   user.experienceLevel,
      totalCreditPoints: user.totalCreditPoints,
      weeklyPoints:      user.weeklyPoints,
      monthlyPoints:     user.monthlyPoints,
      badges:            user.badges,
      percentile,
      rank:              betterCount + 1,
      totalWorkers,
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET LEADERBOARD ──────────────────────────────────────────────────────────
const getLeaderboardHandler = async (req, res, next) => {
  try {
    const { type = 'monthly', limit = 10 } = req.query;
    const leaderboard = await getLeaderboard(type, Number(limit));
    return successResponse(res, 200, 'Leaderboard fetched', { leaderboard, type });
  } catch (error) {
    next(error);
  }
};

// ─── GET BUDDY HISTORY ────────────────────────────────────────────────────────
const getBuddyHistory = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip   = (page - 1) * limit;
    const filter = { $or: [{ seniorWorker: req.user._id }, { juniorWorker: req.user._id }] };

    const total   = await BuddyPair.countDocuments(filter);
    const history = await BuddyPair.find(filter)
      .sort('-pairedDate')
      .skip(skip)
      .limit(Number(limit))
      .populate('seniorWorker', 'name safetyScore experienceLevel totalCreditPoints')
      .populate('juniorWorker', 'name safetyScore experienceLevel totalCreditPoints');

    return successResponse(res, 200, 'History fetched', {
      history,
      pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// ─── SUPERVISOR: Get all today's pairs ───────────────────────────────────────
const getAllTodayPairs = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const pairs = await BuddyPair.find({ pairedDate: { $gte: today, $lt: tomorrow } })
      .populate('seniorWorker', 'name department safetyScore experienceLevel totalCreditPoints')
      .populate('juniorWorker', 'name department safetyScore experienceLevel totalCreditPoints');

    const stats = {
      total:      pairs.length,
      completed:  pairs.filter(p => p.status === 'completed').length,
      pending:    pairs.filter(p => p.status === 'pending').length,
      inProgress: pairs.filter(p => p.status === 'in_progress').length,
      skipped:    pairs.filter(p => p.status === 'skipped').length,
    };

    return successResponse(res, 200, "Today's pairs fetched", { pairs, stats });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDailyPairs,
  getMyBuddyPair,
  answerChecklistItem,
  confirmVerify,
  getMySafetyScore,
  getLeaderboardHandler,
  getBuddyHistory,
  getAllTodayPairs,
};
