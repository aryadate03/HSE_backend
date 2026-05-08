const { body } = require('express-validator');

// ─── Auth Validators ──────────────────────────────────────────────────────────
const registerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['worker', 'supervisor', 'safety_officer', 'management'])
    .withMessage('Invalid role'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
];

const loginValidator = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotPasswordValidator = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
];

const resetPasswordValidator = [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
];

// ─── Incident Validators ──────────────────────────────────────────────────────
const incidentValidator = [
  body('incidentType')
    .isIn(['near_miss', 'injury', 'property_damage', 'environmental', 'fire', 'chemical_spill', 'other'])
    .withMessage('Invalid incident type'),
  body('description')
    .trim()
    .isLength({ min: 50 })
    .withMessage('Description must be at least 50 characters'),
  body('severity')
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid severity level'),
];

module.exports = {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  changePasswordValidator,
  incidentValidator,
};