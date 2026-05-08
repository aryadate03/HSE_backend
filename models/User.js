const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true },
    password: { type: String, required: [true, 'Password is required'], minlength: [6, 'Password must be at least 6 characters'], select: false },
    role: { type: String, enum: ['worker', 'supervisor', 'safety_officer', 'management'], default: 'worker' },
    employeeId: { type: String, unique: true, sparse: true, trim: true },
    phone: { type: String, trim: true },
    department: { type: String, trim: true },
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false },

    // ── Approval System ───────────────────────────────────────────────────────
    // worker        → approved immediately
    // supervisor    → needs management approval
    // safety_officer→ needs management approval
    // management    → approved via secret token
    approvalStatus: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'approved', // overridden in authController based on role
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },

    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    lastLogin: Date,

    // Safety Officer specialization
specialization: {
  type: String,
  enum: ['near_miss', 'injury', 'property_damage', 'environmental', 'fire', 'chemical_spill', 'other'],
  default: null,
},

    // ── Safety Buddy Fields ───────────────────────────────────────────────────
    safetyScore: { type: Number, default: 50, min: 0, max: 100 },
    verifyStreak: { type: Number, default: 0 },
    totalVerifies: { type: Number, default: 0 },
    skippedVerifies: { type: Number, default: 0 },
    experienceLevel: { type: String, enum: ['junior', 'mid', 'senior', 'expert'], default: 'junior' },
    joiningDate: { type: Date, default: Date.now },

    // ── Credit Points & Gamification ──────────────────────────────────────────
    totalCreditPoints: { type: Number, default: 0 },
    weeklyPoints:      { type: Number, default: 0 },
    monthlyPoints:     { type: Number, default: 0 },
    siteRank:          { type: Number, default: 0 },
    badges: [
      {
        name:        { type: String },
        icon:        { type: String },
        earnedAt:    { type: Date, default: Date.now },
        description: { type: String },
      },
    ],
  },
  { timestamps: true }
);

// ─── Hash password before save ────────────────────────────────────────────────
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// ─── Compare password ─────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Generate email verification token ───────────────────────────────────────
userSchema.methods.generateEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  return token;
};

// ─── Generate password reset token ───────────────────────────────────────────
userSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  return token;
};

// ─── Update safety score ──────────────────────────────────────────────────────
userSchema.methods.updateSafetyScore = async function (completed) {
  if (completed) {
    this.totalVerifies += 1;
    this.verifyStreak += 1;
    const bonus = this.verifyStreak >= 5 ? 2 : 0;
    this.safetyScore = Math.min(100, this.safetyScore + 3 + bonus);
  } else {
    this.skippedVerifies += 1;
    this.verifyStreak = 0;
    this.safetyScore = Math.max(0, this.safetyScore - 5);
  }
  await this.save();
};

// ─── Award badge if not already earned ───────────────────────────────────────
userSchema.methods.awardBadge = async function (badge) {
  const alreadyHas = this.badges.some((b) => b.name === badge.name);
  if (!alreadyHas) {
    this.badges.push({ ...badge, earnedAt: new Date() });
    await this.save();
    return true;
  }
  return false;
};


// ─── Add credit points ────────────────────────────────────────────────────────
userSchema.methods.addCreditPoints = async function (points) {
  this.totalCreditPoints += points;
  this.weeklyPoints += points;
  this.monthlyPoints += points;
  await this.save();
};

module.exports = mongoose.model('User', userSchema);