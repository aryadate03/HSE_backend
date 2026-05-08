const mongoose = require('mongoose');

const verifyChecklistSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  answeredAt: { type: Date, default: null },
  answer: { type: Boolean, default: null },
});

const buddyPairSchema = new mongoose.Schema(
  {
    // ─── Pair Info ──────────────────────────────────────────────────────────
    seniorWorker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    juniorWorker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    pairedDate: {
      type: Date,
      required: true,
      default: () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
      },
    },
    taskType: {
      type: String,
      enum: ['scaffolding', 'electrical', 'excavation', 'welding', 'heavy_machinery', 'chemical_handling', 'general'],
      default: 'general',
    },

    // ─── Verify Status ──────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'skipped'],
      default: 'pending',
    },
    seniorConfirmed: { type: Boolean, default: false },
    seniorConfirmedAt: { type: Date, default: null },
    juniorConfirmed: { type: Boolean, default: false },
    juniorConfirmedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // ─── Checklist ──────────────────────────────────────────────────────────
    checklist: [verifyChecklistSchema],

    // ─── Notes ──────────────────────────────────────────────────────────────
    notes: { type: String, trim: true, default: '' },

    // ─── Supervisor alert sent? ─────────────────────────────────────────────
    alertSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ─── Index for fast daily lookup ─────────────────────────────────────────────
buddyPairSchema.index({ pairedDate: 1, seniorWorker: 1 });
buddyPairSchema.index({ pairedDate: 1, juniorWorker: 1 });

module.exports = mongoose.model('BuddyPair', buddyPairSchema);