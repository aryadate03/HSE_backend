// ─── Date Formatters ──────────────────────────────────────────────────────────
const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const formatDateTime = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// ─── String Formatters ────────────────────────────────────────────────────────
const formatRole = (role) => {
  const map = {
    worker: 'Worker',
    supervisor: 'Supervisor',
    safety_officer: 'Safety Officer',
    management: 'Management',
  };
  return map[role] || role;
};

const formatIncidentType = (type) => {
  const map = {
    near_miss: 'Near Miss',
    injury: 'Injury',
    property_damage: 'Property Damage',
    environmental: 'Environmental',
    fire: 'Fire',
    chemical_spill: 'Chemical Spill',
    other: 'Other',
  };
  return map[type] || type;
};

const formatStatus = (status) => {
  const map = {
    draft: 'Draft',
    submitted: 'Submitted',
    under_review: 'Under Review',
    assigned: 'Assigned',
    investigating: 'Investigating',
    resolved: 'Resolved',
    closed: 'Closed',
    rejected: 'Rejected',
  };
  return map[status] || status;
};

const formatSeverity = (severity) => {
  const map = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  };
  return map[severity] || severity;
};

module.exports = {
  formatDate,
  formatDateTime,
  formatRole,
  formatIncidentType,
  formatStatus,
  formatSeverity,
};