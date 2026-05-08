const Notification = require('../models/Notification');

// ── Base function ─────────────────────────────────────────────────────────────
const sendNotification = async ({ recipient, sender, type, title, message, relatedIncident }) => {
  try {
    await Notification.create({
      recipient,
      sender:          sender || null,
      type,
      title,
      message,
      relatedIncident: relatedIncident || null,
    });
  } catch (error) {
    console.error('Notification create error:', error.message);
  }
};

// ── Worker submits incident → notify supervisor ───────────────────────────────
const sendIncidentSubmittedNotification = async (incident, supervisorId) => {
  await sendNotification({
    recipient:       supervisorId,
    sender:          incident.reportedBy,
    type:            'incident_submitted',
    title:           '🆕 New Incident Reported',
    message:         `A new ${incident.severity} severity incident has been submitted. ID: ${incident.incidentId}`,
    relatedIncident: incident._id,
  });
};

// ── Supervisor forwards → notify safety officer ───────────────────────────────
const sendIncidentAssignedNotification = async (incident, safetyOfficerId, assignedBy) => {
  await sendNotification({
    recipient:       safetyOfficerId,
    sender:          assignedBy,
    type:            'incident_assigned',
    title:           '📋 Incident Assigned to You',
    message:         `Incident ${incident.incidentId} (${incident.severity} severity) has been forwarded to you for investigation.`,
    relatedIncident: incident._id,
  });
};

// ── Supervisor rejects → notify worker ───────────────────────────────────────
const sendRejectionNotification = async (incident, reason) => {
  await sendNotification({
    recipient:       incident.reportedBy,
    sender:          incident.rejectionInfo?.rejectedBy || null,
    type:            'incident_rejected',
    title:           '❌ Your Report Was Rejected',
    message:         `Your incident ${incident.incidentId} was rejected. Reason: ${reason || 'No reason provided.'}`,
    relatedIncident: incident._id,
  });
};

// ── Incident escalated → notify management ────────────────────────────────────
const sendEscalationNotification = async (incident, managementIds, escalatedBy) => {
  for (const managerId of managementIds) {
    await sendNotification({
      recipient:       managerId,
      sender:          escalatedBy,
      type:            'incident_escalated',
      title:           '🚨 Incident Escalated to Management',
      message:         `Incident ${incident.incidentId} (${incident.severity} severity) has been escalated. Reason: ${incident.escalation?.reason || '—'}`,
      relatedIncident: incident._id,
    });
  }
};

// ── Safety officer starts investigation → notify worker ───────────────────────
const sendInvestigationStartedNotification = async (incident, safetyOfficerId) => {
  await sendNotification({
    recipient:       incident.reportedBy,
    sender:          safetyOfficerId,
    type:            'status_update',
    title:           '🔬 Investigation Started',
    message:         `A safety officer has started investigating your incident ${incident.incidentId}.`,
    relatedIncident: incident._id,
  });
};

// ── Safety officer resolves → notify worker + supervisor ─────────────────────
const sendResolvedNotification = async (incident, recipientIds, resolvedBy) => {
  for (const recipientId of recipientIds) {
    await sendNotification({
      recipient:       recipientId,
      sender:          resolvedBy,
      type:            'incident_resolved',
      title:           '✅ Incident Resolved',
      message:         `Incident ${incident.incidentId} has been resolved by the Safety Officer.`,
      relatedIncident: incident._id,
    });
  }
};

// ── Management closes → notify worker + supervisor + safety officer ───────────
const sendClosedNotification = async (incident, recipientIds, closedBy) => {
  for (const recipientId of recipientIds) {
    await sendNotification({
      recipient:       recipientId,
      sender:          closedBy,
      type:            'incident_closed',
      title:           '🔒 Incident Closed',
      message:         `Incident ${incident.incidentId} has been officially closed by management.`,
      relatedIncident: incident._id,
    });
  }
};

// ── Status update (generic) → notify worker ───────────────────────────────────
const sendStatusUpdateNotification = async (incident, recipientId, newStatus) => {
  await sendNotification({
    recipient:       recipientId,
    sender:          null,
    type:            'status_update',
    title:           '📢 Incident Status Updated',
    message:         `Your incident ${incident.incidentId} status has been updated to: ${newStatus.replace(/_/g, ' ')}.`,
    relatedIncident: incident._id,
  });
};

// ── Comment added → notify relevant parties ───────────────────────────────────
const sendCommentNotification = async (incident, recipientId, commenterName) => {
  await sendNotification({
    recipient:       recipientId,
    sender:          null,
    type:            'comment_added',
    title:           '💬 New Comment Added',
    message:         `${commenterName} commented on incident ${incident.incidentId}.`,
    relatedIncident: incident._id,
  });
};

module.exports = {
  sendNotification,
  sendIncidentSubmittedNotification,
  sendIncidentAssignedNotification,
  sendRejectionNotification,
  sendEscalationNotification,
  sendInvestigationStartedNotification,
  sendResolvedNotification,
  sendClosedNotification,
  sendStatusUpdateNotification,
  sendCommentNotification,
};