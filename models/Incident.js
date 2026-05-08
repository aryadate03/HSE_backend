const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema(
  {
    incidentId: {
      type: String,
      unique: true,
    },

    // ── Reporter ──────────────────────────────────────────────────────────────
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Incident Info ─────────────────────────────────────────────────────────
    incidentType: {
      type: String,
      enum: ['near_miss', 'injury', 'property_damage', 'environmental', 'fire', 'chemical_spill', 'other'],
      required: [true, 'Incident type is required'],
    },
    dateTime: {
      type: Date,
      default: Date.now,
      required: true,
    },
    location: {
      building:      { type: String, trim: true },
      floor:         { type: String, trim: true },
      zone:          { type: String, trim: true },
      manualAddress: { type: String, trim: true },
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      minlength: [10, 'Description must be at least 10 characters'],
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: [true, 'Severity is required'],
    },
    photos: [
      {
        url:        String,
        publicId:   String,
        filename:   String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    hasInjury: {
      type: Boolean,
      default: false,
    },
    witnesses: [
      {
        name:    { type: String, trim: true },
        contact: { type: String, trim: true },
      },
    ],

    // ── Status Flow ───────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'under_review',
        'forwarded_to_safety_officer',
        'rejected',
        'investigating',
        'resolved',
        'closed',
      ],
      default: 'draft',
    },

    isDraft: {
      type: Boolean,
      default: true,
    },

    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ── Supervisor Review ─────────────────────────────────────────────────────
    supervisorReview: {
      reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reviewedAt:  { type: Date, default: null },
      assessment:  { type: String, trim: true },
      priority:    { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    },

    // ── Rejection Info ────────────────────────────────────────────────────────
    rejectionInfo: {
      isRejected: { type: Boolean, default: false },
      rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      rejectedAt: { type: Date, default: null },
      reason:     { type: String, trim: true },
    },

    // ── Escalation Tracking ⭐ NEW ─────────────────────────────────────────────
    escalation: {
      isEscalated:  { type: Boolean, default: false },
      escalatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      escalatedAt:  { type: Date, default: null },
      reason:       { type: String, trim: true },
      escalatedTo:  { type: String, trim: true }, // e.g. 'management', 'safety_officer'
    },

    // ── Forward to Safety Officer ─────────────────────────────────────────────
    forwardInfo: {
      forwardedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      forwardedAt:  { type: Date, default: null },
      note:         { type: String, trim: true },
    },

    // ── Safety Officer Investigation ──────────────────────────────────────────
    investigation: {
      assignedTo:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      assignedAt:          { type: Date, default: null },
      rootCause:           { type: String, trim: true },
      correctiveActions:   { type: String, trim: true },
      preventiveMeasures:  { type: String, trim: true },
      resolvedBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      resolvedAt:          { type: Date, default: null },
      resolutionNote:      { type: String, trim: true },
    },

    // ── Comments ⭐ NEW ────────────────────────────────────────────────────────
    comments: [
      {
        commentedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        role:        { type: String, enum: ['worker', 'supervisor', 'safety_officer', 'management'] },
        message:     { type: String, trim: true, required: true },
        createdAt:   { type: Date, default: Date.now },
      },
    ],

    // ── Reports (sent to management) ──────────────────────────────────────────
    reports: [
      {
        sentBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        sentAt:     { type: Date, default: Date.now },
        reportType: { type: String, enum: ['supervisor_report', 'safety_officer_report'] },
        content:    { type: String, trim: true },
        summary:    { type: String, trim: true },
      },
    ],

    // ── Management ────────────────────────────────────────────────────────────
    managementNotes: { type: String, trim: true },
    closedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedAt:        { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Auto-generate incidentId ──────────────────────────────────────────────────
incidentSchema.pre('save', async function () {
  if (!this.incidentId) {
    const count = await mongoose.model('Incident').countDocuments();
    const date  = new Date();
    const year  = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    this.incidentId = `HSE-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
incidentSchema.index({ status: 1 });
incidentSchema.index({ reportedBy: 1 });
incidentSchema.index({ 'investigation.assignedTo': 1 });
incidentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Incident', incidentSchema);