const IncidentLog = require('../models/IncidentLog');

// ─── Log any action on an incident ───────────────────────────────────────────
const logAction = async ({ incidentId, userId, role, action, summary, metadata = {} }) => {
  try {
    await IncidentLog.create({
      incident:    incidentId,
      performedBy: userId,
      role,
      action,
      summary,
      metadata,
      actionAt:    new Date(),
    });
  } catch (err) {
    // Never crash the main flow if logging fails
    console.error('IncidentLog error:', err.message);
  }
};

// ─── Get full timeline for an incident ───────────────────────────────────────
const getIncidentTimeline = async (incidentId) => {
  return await IncidentLog.find({ incident: incidentId })
    .populate('performedBy', 'name role email')
    .sort({ actionAt: 1 })
    .lean();
};

module.exports = { logAction, getIncidentTimeline };