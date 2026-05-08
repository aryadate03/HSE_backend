const mongoose = require('mongoose');

const creditPointsSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ─── Daily Points Log ─────────────────────────────────────────────────────
    date: {
      type: Date,
      required: true,
    },

    // Points breakdown
    verifyPoints: { type: Number, default: 0 },      // +10 for completing verify
    onTimeBonus:  { type: Number, default: 0 },      // +5 if done before shift start
    hazardPoints: { type: Number, default: 0 },      // +15 per hazard reported
    incidentFree: { type: Number, default: 0 },      // +5 if no incident that day
    streakBonus:  { type: Number, default: 0 },      // +2 per day streak
    totalPoints:  { type: Number, default: 0 },      // sum of all above

    // Reference
    buddyPair: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuddyPair',
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Compound index — one record per worker per day ──────────────────────────
creditPointsSchema.index({ worker: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('CreditPoints', creditPointsSchema);