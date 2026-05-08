const { verifyToken } = require('../services/tokenService');
const User = require('../models/User');
const { AppError } = require('./errorhandler');

// ── protect: verify JWT + attach user ────────────────────────────────────────
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('No token provided. Please log in.', 401));
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new AppError('User no longer exists.', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated.', 401));
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

// ── authorize: check role ─────────────────────────────────────────────────────
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError(`Access denied. Required role: ${roles.join(' or ')}`, 403));
    }
    next();
  };
};

// ── requireApproved: check approval status ────────────────────────────────────
const requireApproved = (req, res, next) => {
  if (req.user.approvalStatus !== 'approved') {
    return next(new AppError('Your account is pending approval by management.', 403));
  }
  next();
};

module.exports = { protect, authorize, requireApproved };