const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/database');
const { errorHandler } = require('./middleware/errorhandler'); 

const app = express();

connectDB();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Static uploads ───────────────────────────────────────────────────────────
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',           require('./routes/authRoutes'));
app.use('/api/worker',         require('./routes/workerRoutes'));
app.use('/api/notifications',  require('./routes/notificationRoutes'));
app.use('/api/safety-officer', require('./routes/safetyOfficerRoutes'));
app.use('/api/management',     require('./routes/managementRoutes'));
app.use('/api/buddy',          require('./routes/buddyRoutes'));
app.use('/api/supervisor',     require('./routes/supervisorRoutes'));

// DEBUG — Reset all worker stats (testing only)
app.get('/api/debug/reset-worker-stats', async (req, res) => {
  try {
    const User = require('./models/User');
    const CreditPoints = require('./models/CreditPoints');
    const BuddyPair = require('./models/BuddyPair');

    // Reset all worker fields to default
    await User.updateMany(
      { role: 'worker' },
      {
        $set: {
          safetyScore:       0,
          verifyStreak:      0,
          totalVerifies:     0,
          skippedVerifies:   0,
          totalCreditPoints: 0,
          weeklyPoints:      0,
          monthlyPoints:     0,
          siteRank:          0,
          badges:            [],
        },
      }
    );

    // Delete all credit point logs
    await CreditPoints.deleteMany({});

    // Delete all buddy pairs
    await BuddyPair.deleteMany({});

    res.json({ success: true, message: 'All worker stats, points, badges, and pairs reset.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Debug Routes (remove before production) ──────────────────────────────────
app.get('/api/debug/incidents', async (req, res) => {
  const Incident = require('./models/Incident');
  const all = await Incident.find({}).select('incidentId status isDraft severity').lean();
  res.json(all);
});

app.get('/api/debug/workers', async (req, res) => {
  const User = require('./models/User');
  const BuddyPair = require('./models/BuddyPair');
  const workers = await User.find({ role: 'worker' })
    .select('name isActive approvalStatus experienceLevel safetyScore');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const existing = await BuddyPair.countDocuments({ pairedDate: today });
  res.json({ workerCount: workers.length, workers, existingPairsToday: existing });
});

// ⭐ Reset today's buddy pairs (use when testing)
app.get('/api/debug/reset-pairs', async (req, res) => {
  const BuddyPair = require('./models/BuddyPair');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result = await BuddyPair.deleteMany({ pairedDate: { $gte: today } });
  res.json({ deleted: result.deletedCount, message: 'Today pairs reset successfully' });
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'HSE Backend is running ✅',
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 HSE Server running in [${process.env.NODE_ENV}] mode on port ${PORT}`);
});

module.exports = app;