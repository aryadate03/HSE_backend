const User = require('../models/User');
const crypto = require('crypto');
const generateToken = require('../utils/generateToken');
const { sendVerificationEmail, sendPasswordResetEmail, sendApprovalEmail, sendRejectionEmail } = require('../services/emailService');
const { successResponse } = require('../utils/errorResponse');
const { AppError } = require('../middleware/errorhandler');

// ─── Management secret token (set in .env) ───────────────────────────────────
const MANAGEMENT_SECRET = process.env.MANAGEMENT_SECRET_TOKEN || 'HSE@MGMT2026';

// ─── Helper: auto generate employee ID ───────────────────────────────────────
const generateEmployeeId = async () => {
  const lastUser = await User.findOne({}, { employeeId: 1 })
    .sort({ createdAt: -1 })
    .lean();

  if (!lastUser?.employeeId) return 'EMP0001';

  const num = parseInt(lastUser.employeeId.replace('EMP', ''), 10);
  const padded = String(num + 1).padStart(4, '0');
  return `EMP${padded}`;
};

// ─── REGISTER ─────────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    // ✅ CHANGE 1: destructure specialization from req.body
    const { name, email, password, role, phone, department, managementToken, specialization } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return next(new AppError('Email already registered', 400));

    // ─── Only 1 supervisor allowed system-wide ────────────────────────────────
    if (role === 'supervisor') {
      const existingSupervisor = await User.findOne({
        role: 'supervisor',
        approvalStatus: { $in: ['approved', 'pending'] },
      });
      if (existingSupervisor) {
        return next(new AppError('A supervisor already exists in the system. Only one supervisor is allowed.', 400));
      }
    }

    // Role-based approval logic
    let approvalStatus = 'approved';

    if (role === 'management') {
      if (!managementToken || managementToken !== MANAGEMENT_SECRET) {
        return next(new AppError('Invalid management token. Please contact your administrator.', 403));
      }
      approvalStatus = 'approved';
    }

    if (role === 'supervisor' || role === 'safety_officer') {
      approvalStatus = 'pending';
    }

    const employeeId = await generateEmployeeId();

    // ✅ CHANGE 2: save specialization only for safety_officer
    const user = new User({
      name, email, password, role, employeeId, phone, department,
      approvalStatus,
      isActive: approvalStatus === 'approved',
      specialization: role === 'safety_officer' ? specialization : null,
    });

    const emailVerifyToken = user.generateEmailVerificationToken();
    await user.save();

    try {
      await sendVerificationEmail(email, name, emailVerifyToken);
    } catch (emailErr) {
      console.error('Email send failed:', emailErr.message);
    }

    let message = 'Registration successful. Please verify your email.';
    if (role === 'supervisor' || role === 'safety_officer') {
      message = 'Registration submitted! Your account is pending management approval. You will be notified via email once approved.';
    }

    successResponse(res, 201, message, {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        isEmailVerified: user.isEmailVerified,
        approvalStatus: user.approvalStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) return next(new AppError('Invalid email or password', 401));

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return next(new AppError('Invalid email or password', 401));

    if (!user.isActive) {
      if (user.approvalStatus === 'pending') {
        return next(new AppError('Your account is pending management approval. Please wait.', 403));
      }
      if (user.approvalStatus === 'rejected') {
        return next(new AppError(`Your account has been rejected. Reason: ${user.rejectionReason || 'Contact administrator.'}`, 403));
      }
      return next(new AppError('Your account has been deactivated', 401));
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);

    successResponse(res, 200, 'Login successful', {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        phone: user.phone,
        department: user.department,
        isEmailVerified: user.isEmailVerified,
        approvalStatus: user.approvalStatus,
        experienceLevel: user.experienceLevel,
        safetyScore: user.safetyScore,
        verifyStreak: user.verifyStreak,
        totalVerifies: user.totalVerifies,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET PENDING USERS (management only) ─────────────────────────────────────
const getPendingUsers = async (req, res, next) => {
  try {
    const pendingUsers = await User.find({
      approvalStatus: 'pending',
      role: { $in: ['supervisor', 'safety_officer'] },
    }).select('name email role department phone employeeId createdAt');

    successResponse(res, 200, 'Pending users fetched', { users: pendingUsers });
  } catch (error) {
    next(error);
  }
};

// ─── APPROVE USER (management only) ──────────────────────────────────────────
const approveUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return next(new AppError('User not found', 404));

    if (user.approvalStatus !== 'pending') {
      return next(new AppError('User is not in pending state', 400));
    }

    user.approvalStatus = 'approved';
    user.isActive = true;
    user.approvedBy = req.user._id;
    user.approvedAt = new Date();
    await user.save({ validateBeforeSave: false });

    try {
      await sendApprovalEmail(user.email, user.name, user.role);
    } catch (emailErr) {
      console.error('Approval email failed:', emailErr.message);
    }

    successResponse(res, 200, `${user.name} has been approved successfully.`, {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── REJECT USER (management only) ───────────────────────────────────────────
const rejectUser = async (req, res, next) => {
  try {
    const { reason } = req.body;

    const user = await User.findById(req.params.userId);
    if (!user) return next(new AppError('User not found', 404));

    user.approvalStatus = 'rejected';
    user.isActive = false;
    user.rejectionReason = reason || 'No reason provided';
    await user.save({ validateBeforeSave: false });

    try {
      await sendRejectionEmail(user.email, user.name, user.role, reason);
    } catch (emailErr) {
      console.error('Rejection email failed:', emailErr.message);
    }

    successResponse(res, 200, `${user.name} has been rejected.`);
  } catch (error) {
    next(error);
  }
};

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
const logout = async (req, res, next) => {
  try {
    successResponse(res, 200, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

// ─── GET ME ───────────────────────────────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      'name email role employeeId phone department isEmailVerified approvalStatus experienceLevel safetyScore verifyStreak totalVerifies skippedVerifies joiningDate'
    );
    successResponse(res, 200, 'User fetched', { user });
  } catch (error) {
    next(error);
  }
};

// ─── VERIFY EMAIL ─────────────────────────────────────────────────────────────
const verifyEmail = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) return next(new AppError('Invalid or expired verification link', 400));

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    successResponse(res, 200, 'Email verified successfully');
  } catch (error) {
    next(error);
  }
};

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
const forgotPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return next(new AppError('No account found with this email', 404));

    const resetToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      await sendPasswordResetEmail(user.email, user.name, resetToken);
    } catch (emailErr) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return next(new AppError('Failed to send reset email', 500));
    }

    successResponse(res, 200, 'Password reset link sent to your email');
  } catch (error) {
    next(error);
  }
};

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
const resetPassword = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) return next(new AppError('Invalid or expired reset link', 400));

    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    successResponse(res, 200, 'Password reset successful. Please login.');
  } catch (error) {
    next(error);
  }
};

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
const changePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    const { currentPassword, newPassword } = req.body;

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return next(new AppError('Current password is incorrect', 401));

    user.password = newPassword;
    await user.save();

    successResponse(res, 200, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register, login, logout, getMe,
  verifyEmail, forgotPassword, resetPassword, changePassword,
  approveUser, rejectUser, getPendingUsers,
};