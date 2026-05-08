const mongoose = require('mongoose');

const investigationSchema = new mongoose.Schema(
  {
    // Link to the Incident (one investigation per incident)
    incident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      required: true,
      unique: true,
    },
    investigator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── PART 1: Site Visit ────────────────────────────────────────────────────
    siteVisit: {
      done: { type: Boolean, default: false },
      visitDate: { type: Date, default: null },
      findings: { type: String, trim: true, default: '' },
    },

    // ── PART 1: Inspection Photos ─────────────────────────────────────────────
    inspectionPhotos: [
      {
        url: { type: String, required: true },
        filename: { type: String },
        caption: { type: String, trim: true, default: '' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // ── PART 1: Root Cause Analysis ───────────────────────────────────────────
    rootCause: {
      primaryCause: { type: String, trim: true, default: '' },
      contributingFactors: [{ type: String, trim: true }],
      analysisDate: { type: Date, default: null },
    },

    // ── PART 2: Corrective Actions ────────────────────────────────────────────
    correctiveActions: [
      {
        action: { type: String, trim: true },
        completedDate: { type: Date, default: null },
        verifiedBy: { type: String, trim: true, default: '' },
      },
    ],

    // ── PART 2: Preventive Measures ───────────────────────────────────────────
    preventiveMeasures: {
      description: { type: String, trim: true, default: '' },
      implementationDate: { type: Date, default: null },
    },

    // ── PART 2: Cost Analysis ─────────────────────────────────────────────────
    costAnalysis: {
      estimatedCost: { type: Number, default: 0 },
      actualCost: { type: Number, default: 0 },
      breakdown: { type: String, trim: true, default: '' },
    },

    // ── PART 2: Case Closure ──────────────────────────────────────────────────
    closure: {
      closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      closedAt: { type: Date, default: null },
      finalSummary: { type: String, trim: true, default: '' },
      lessonsLearned: { type: String, trim: true, default: '' },
    },

    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Investigation', investigationSchema);