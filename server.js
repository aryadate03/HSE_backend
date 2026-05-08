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
