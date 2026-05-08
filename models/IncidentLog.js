const mongoose = require('mongoose');

// ─── Every action taken on an incident by any role is logged here ─────────────
const incidentLogSchema = new mongoose.Schema(
  {
    // Which incident this log belongs to
    incident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      required: true,
    },

    // Who performed the action
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Their role at the time of action
    role: {
      type: String,
      enum: ['worker', 'supervisor', 'safety_officer', 'management'],
      required: true,
    },

    // What action was taken
    action: {
      type: String,
      enum: [
        // Worker actions
        'submitted',
        'draft_saved',
        'photo_uploaded',

        // Supervisor actions
        'reviewed',
        'forwarded_to_safety_officer',
        'rejected',
        'priority_updated',
        'assessment_added',
        'supervisor_report_sent',

        // Safety Officer actions
        'investigation_started',
        'investigation_updated',
        'resolved',
        'safety_officer_report_sent',

        // Management actions
        'closed',
        'management_note_added',
        'viewed',
      ],
      required: true,
    },

    // Human-readable summary of what happened
    summary: {
      type: String,
      trim: true,
    },

    // Any extra structured data (rejection reason, report content, etc.)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Timestamp of the action (separate from createdAt for clarity)
    actionAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ─── Indexes for fast lookup ──────────────────────────────────────────────────
incidentLogSchema.index({ incident: 1, actionAt: -1 });
incidentLogSchema.index({ performedBy: 1 });
incidentLogSchema.index({ action: 1 });

module.exports = mongoose.model('IncidentLog', incidentLogSchema);