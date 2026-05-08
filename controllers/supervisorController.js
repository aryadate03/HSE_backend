const Incident = require('../models/Incident');
const User = require('../models/User');
const { logAction } = require('../services/incidentLogService');
const { AppError } = require('../middleware/errorhandler');

// ── Priority helpers ──────────────────────────────────────────────────────────
const toModelPriority   = (p) => ({ critical: 'urgent', high: 'high', medium: 'normal', low: 'low' }[p] || p);
const toDisplayPriority = (p) => ({ urgent: 'critical', high: 'high', normal: 'medium', low: 'low' }[p] || p);

// ── Status display map ────────────────────────────────────────────────────────
const toDisplayStatus = (s) => ({
  draft:                       'draft',
  submitted:                   'new',
  under_review:                'pending',
  forwarded_to_safety_officer: 'forwarded',
  rejected:                    'rejected',
  investigating:               'investigating',
  resolved:                    'resolved',
  closed:                      'closed',
}[s] || s);

// ── Format location ───────────────────────────────────────────────────────────
const formatLocation = (loc) => {
  if (!loc) return '—';
  if (typeof loc === 'string') return loc;
  return loc.manualAddress || loc.building || loc.zone || '—';
};

// ── Normalize for frontend ────────────────────────────────────────────────────
const normalize = (inc) => ({
  ...inc,
  title:    inc.description?.substring(0, 60) || 'Untitled Incident',
  type:     inc.incidentType || '—',
  status:   toDisplayStatus(inc.status),
  priority: toDisplayPriority(inc.priority),
  location: formatLocation(inc.location),
});

// ── Build filters ─────────────────────────────────────────────────────────────
const buildFilters = (query) => {
  const filters = { isDraft: false };
  const statusMap = {
    new: 'submitted', pending: 'under_review', forwarded: 'forwarded_to_safety_officer',
    rejected: 'rejected', investigating: 'investigating', resolved: 'resolved', closed: 'closed',
  };
  if (query.status && query.status !== 'all') filters.status = statusMap[query.status] || query.status;

  const priorityMap = { critical: 'urgent', high: 'high', medium: 'normal', low: 'low' };
  if (query.priority && query.priority !== 'all') filters.priority = priorityMap[query.priority] || query.priority;

  if (query.search) {
    filters.$or = [
      { description:              { $regex: query.search, $options: 'i' } },
      { incidentType:             { $regex: query.search, $options: 'i' } },
      { 'location.manualAddress': { $regex: query.search, $options: 'i' } },
      { 'location.building':      { $regex: query.search, $options: 'i' } },
    ];
  }
  if (query.dateFrom || query.dateTo) {
    filters.createdAt = {};
    if (query.dateFrom) filters.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) {
      const to = new Date(query.dateTo);
      to.setHours(23, 59, 59, 999);
      filters.createdAt.$lte = to;
    }
  }
  return filters;
};

// @route GET /api/supervisor/dashboard
const getDashboard = async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const base = { isDraft: false };

    const [submitted, underReview, forwarded, rejected, investigating, resolved] = await Promise.all([
      Incident.countDocuments({ ...base, status: 'submitted' }),
      Incident.countDocuments({ ...base, status: 'under_review' }),
      Incident.countDocuments({ ...base, status: 'forwarded_to_safety_officer' }),
      Incident.countDocuments({ ...base, status: 'rejected' }),
      Incident.countDocuments({ ...base, status: 'investigating' }),
      Incident.countDocuments({ ...base, status: { $in: ['resolved', 'closed'] } }),
    ]);

    const [urgentCount, highCount, normalCount, lowCount] = await Promise.all([
      Incident.countDocuments({ ...base, priority: 'urgent' }),
      Incident.countDocuments({ ...base, priority: 'high' }),
      Incident.countDocuments({ ...base, priority: 'normal' }),
      Incident.countDocuments({ ...base, priority: 'low' }),
    ]);

    const recentRaw = await Incident.find({ ...base, createdAt: { $gte: sevenDaysAgo } })
      .populate('reportedBy', 'name email department')
      .sort({ createdAt: -1 }).limit(10).lean();

    const dailyCounts = [];
    for (let i = 6; i >= 0; i--) {
      const start = new Date();
      start.setDate(start.getDate() - i);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      const count = await Incident.countDocuments({ ...base, createdAt: { $gte: start, $lte: end } });
      dailyCounts.push({
        date: start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        count,
      });
    }

    const myReviewedCount = await Incident.countDocuments({ 'supervisorReview.reviewedBy': req.user._id });
    const teamCount = await User.countDocuments({ role: 'worker' });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          new: submitted, pending: underReview, forwarded, rejected,
          investigating, resolved,
          total: submitted + underReview + forwarded + rejected + investigating + resolved,
        },
        priorities: { critical: urgentCount, high: highCount, medium: normalCount, low: lowCount },
        recentIncidents: recentRaw.map(normalize),
        charts: { dailyCounts },
        myStats: { reviewed: myReviewedCount, teamMembers: teamCount },
      },
    });
  } catch (error) {
    console.error('getDashboard:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route GET /api/supervisor/incidents
const getAllIncidents = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortField = ['priority', 'status', 'createdAt'].includes(req.query.sortField) ? req.query.sortField : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const filters = buildFilters(req.query);

    const [incidentsRaw, total] = await Promise.all([
      Incident.find(filters)
        .populate('reportedBy', 'name email department phone')
        .populate('assignedTo', 'name email')
        .populate('supervisorReview.reviewedBy', 'name')
        .sort({ [sortField]: sortOrder }).skip(skip).limit(limit).lean(),
      Incident.countDocuments(filters),
    ]);

    res.status(200).json({
      success: true,
      data: {
        incidents: incidentsRaw.map(normalize),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('getAllIncidents:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route GET /api/supervisor/incidents/:id
const getIncidentById = async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .populate('reportedBy',                'name email department phone')
      .populate('assignedTo',                'name email department')
      .populate('supervisorReview.reviewedBy','name email')
      .populate('forwardInfo.forwardedBy',   'name email')
      .populate('rejectionInfo.rejectedBy',  'name email')
      .populate('investigation.assignedTo',  'name email')
      .lean();
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });
    res.status(200).json({ success: true, data: normalize(incident) });
  } catch (error) {
    console.error('getIncidentById:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route PUT /api/supervisor/incidents/:id/assessment
const addAssessment = async (req, res) => {
  try {
    const { initialAssessment } = req.body;
    if (!initialAssessment) return res.status(400).json({ success: false, message: 'Assessment is required.' });

    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    incident.supervisorReview = {
      reviewedBy:  req.user._id,
      reviewedAt:  new Date(),
      assessment:  initialAssessment,
    };
    if (incident.status === 'submitted') incident.status = 'under_review';
    await incident.save();

    const updated = await Incident.findById(req.params.id)
      .populate('reportedBy', 'name email department')
      .populate('supervisorReview.reviewedBy', 'name email').lean();

    res.status(200).json({ success: true, message: 'Assessment saved.', data: normalize(updated) });
  } catch (error) {
    console.error('addAssessment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route PUT /api/supervisor/incidents/:id/priority
const updatePriority = async (req, res) => {
  try {
    const modelPriority = toModelPriority(req.body.priority);
    if (!['low', 'normal', 'high', 'urgent'].includes(modelPriority))
      return res.status(400).json({ success: false, message: 'Invalid priority.' });

    const incident = await Incident.findByIdAndUpdate(
      req.params.id, { priority: modelPriority }, { new: true }
    ).populate('reportedBy', 'name email department').lean();
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    res.status(200).json({ success: true, message: 'Priority updated.', data: normalize(incident) });
  } catch (error) {
    console.error('updatePriority:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route PUT /api/supervisor/incidents/:id/review
const markReviewed = async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    incident.status = 'under_review';
    incident.supervisorReview = {
      reviewedBy:  req.user._id,
      reviewedAt:  new Date(),
      assessment:  req.body.initialAssessment || incident.supervisorReview?.assessment || '',
    };
    await incident.save();

    const updated = await Incident.findById(req.params.id)
      .populate('reportedBy', 'name email department')
      .populate('supervisorReview.reviewedBy', 'name email').lean();

    res.status(200).json({ success: true, message: 'Incident marked as reviewed.', data: normalize(updated) });
  } catch (error) {
    console.error('markReviewed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route GET /api/supervisor/incidents/:id/suggested-officer
// ✅ NEW: Returns specialization-matched officer + full officer list for dropdown
const getSuggestedOfficer = async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id).lean();
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    const incidentType = incident.incidentType; // e.g. 'injury', 'chemical_spill'

    // Try exact specialization match first
    let suggested = await User.findOne({
      role: 'safety_officer',
      isActive: true,
      specialization: incidentType,
    }).select('name email department specialization').lean();

    // Fallback: officer with 'other' specialization
    if (!suggested) {
      suggested = await User.findOne({
        role: 'safety_officer',
        isActive: true,
        specialization: 'other',
      }).select('name email department specialization').lean();
    }

    // All active safety officers for manual override dropdown
    const allOfficers = await User.find({ role: 'safety_officer', isActive: true })
      .select('name email department specialization').lean();

    res.status(200).json({ success: true, suggested, allOfficers });
  } catch (error) {
    console.error('getSuggestedOfficer:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route PUT /api/supervisor/incidents/:id/forward
// ✅ UPDATED: accepts assignedOfficerId to store on incident.investigation
const forwardToSafetyOfficer = async (req, res) => {
  try {
    const { note, assessment, assignedOfficerId } = req.body; // ✅ destructure assignedOfficerId
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });
    if (incident.status === 'rejected')
      return res.status(400).json({ success: false, message: 'Cannot forward a rejected incident.' });

    incident.status = 'forwarded_to_safety_officer';
    incident.forwardInfo = {
      forwardedBy: req.user._id,
      forwardedAt: new Date(),
      note:        note?.trim() || '',
    };
    if (!incident.supervisorReview?.reviewedBy) {
      incident.supervisorReview = {
        reviewedBy:  req.user._id,
        reviewedAt:  new Date(),
        assessment:  assessment?.trim() || 'Approved and forwarded to Safety Officer.',
      };
    }

    // ✅ Store assigned officer on investigation sub-doc if provided
    if (assignedOfficerId) {
      incident.investigation = {
        ...incident.investigation,
        assignedTo: assignedOfficerId,
        assignedAt: new Date(),
      };
    }

    await incident.save();

    await logAction({
      incidentId: incident._id,
      userId:     req.user._id,
      role:       'supervisor',
      action:     'forwarded_to_safety_officer',
      summary:    'Supervisor reviewed and forwarded to Safety Officer',
      metadata:   { note, assignedOfficerId },
    });

    // Notify: if specific officer assigned, notify only them; else notify all
    try {
      const { sendIncidentAssignedNotification } = require('../services/notificationService');
      if (assignedOfficerId) {
        await sendIncidentAssignedNotification(incident, assignedOfficerId, req.user._id);
      } else {
        const officers = await User.find({ role: 'safety_officer', isActive: true });
        for (const officer of officers) {
          await sendIncidentAssignedNotification(incident, officer._id, req.user._id);
        }
      }
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }

    const updated = await Incident.findById(req.params.id)
      .populate('reportedBy', 'name email department')
      .populate('forwardInfo.forwardedBy', 'name email')
      .populate('investigation.assignedTo', 'name email').lean();

    res.status(200).json({ success: true, message: 'Incident forwarded to Safety Officer.', data: normalize(updated) });
  } catch (error) {
    console.error('forwardToSafetyOfficer:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route PUT /api/supervisor/incidents/:id/reject
const rejectIncident = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason?.trim())
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });

    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    incident.status = 'rejected';
    incident.rejectionInfo = {
      isRejected: true,
      rejectedBy: req.user._id,
      rejectedAt: new Date(),
      reason:     rejectionReason.trim(),
    };
    incident.supervisorReview = {
      reviewedBy:  req.user._id,
      reviewedAt:  new Date(),
      assessment:  incident.supervisorReview?.assessment || 'Rejected.',
    };
    await incident.save();

    try {
      const { sendRejectionNotification } = require('../services/notificationService');
      await sendRejectionNotification(incident, rejectionReason.trim());
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }

    await logAction({
      incidentId: incident._id,
      userId:     req.user._id,
      role:       'supervisor',
      action:     'rejected',
      summary:    'Supervisor rejected the incident report',
      metadata:   { reason: rejectionReason.trim() },
    });

    res.status(200).json({ success: true, message: 'Incident rejected.', data: normalize(incident.toObject()) });
  } catch (error) {
    console.error('rejectIncident:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route PUT /api/supervisor/incidents/:id/assign
const assignIncident = async (req, res) => {
  try {
    const { assignedTo } = req.body;
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    if (assignedTo) {
      const assignee = await User.findById(assignedTo);
      if (!assignee) return res.status(404).json({ success: false, message: 'Assignee not found.' });
      incident.assignedTo = assignedTo;
    } else {
      incident.assignedTo = null;
    }
    await incident.save();

    const updated = await Incident.findById(req.params.id)
      .populate('reportedBy', 'name email department')
      .populate('assignedTo', 'name email department').lean();

    res.status(200).json({ success: true, message: 'Assigned.', data: normalize(updated) });
  } catch (error) {
    console.error('assignIncident:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route POST /api/supervisor/incidents/:id/report
const sendReport = async (req, res) => {
  try {
    const { content, summary } = req.body;
    if (!content?.trim())
      return res.status(400).json({ success: false, message: 'Report content is required.' });

    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    incident.reports.push({
      sentBy:     req.user._id,
      sentAt:     new Date(),
      reportType: 'supervisor_report',
      content:    content.trim(),
      summary:    summary?.trim() || '',
    });
    await incident.save();

    await logAction({
      incidentId: incident._id,
      userId:     req.user._id,
      role:       'supervisor',
      action:     'supervisor_report_sent',
      summary:    'Supervisor sent report to management',
      metadata:   { summary },
    });

    res.status(201).json({ success: true, message: 'Report sent to management.' });
  } catch (error) {
    console.error('sendReport:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route GET /api/supervisor/team
const getTeamMembers = async (req, res) => {
  try {
    const workers = await User.find({ role: 'worker' })
      .select('name email department phone createdAt lastLogin').lean();

    const withStats = await Promise.all(workers.map(async (w) => {
      const [total, open, resolved] = await Promise.all([
        Incident.countDocuments({ reportedBy: w._id, isDraft: false }),
        Incident.countDocuments({ reportedBy: w._id, isDraft: false, status: { $in: ['submitted', 'under_review'] } }),
        Incident.countDocuments({ reportedBy: w._id, isDraft: false, status: { $in: ['resolved', 'closed'] } }),
      ]);
      return { ...w, incidentStats: { total, open, resolved } };
    }));

    res.status(200).json({ success: true, data: withStats });
  } catch (error) {
    console.error('getTeamMembers:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route GET /api/supervisor/team/safety-officers
// ✅ UPDATED: include specialization in select
const getSafetyOfficers = async (req, res) => {
  try {
    const officers = await User.find({ role: 'safety_officer' })
      .select('name email department phone specialization createdAt lastLogin').lean();
    res.status(200).json({ success: true, data: officers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route GET /api/supervisor/statistics
const getStatistics = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const base = { isDraft: false };

    const [statusBreakdown, priorityBreakdown, typeBreakdown, monthlyTrend, avgRes] = await Promise.all([
      Incident.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Incident.aggregate([{ $match: base }, { $group: { _id: '$priority', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Incident.aggregate([
        { $match: { ...base, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$incidentType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Incident.aggregate([
        { $match: { ...base, createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      Incident.aggregate([
        { $match: { ...base, 'supervisorReview.reviewedAt': { $exists: true } } },
        { $project: { days: { $divide: [{ $subtract: ['$supervisorReview.reviewedAt', '$createdAt'] }, 86400000] } } },
        { $group: { _id: null, avg: { $avg: '$days' } } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        statusBreakdown:   statusBreakdown.map(s => ({ ...s, _id: toDisplayStatus(s._id) })),
        priorityBreakdown: priorityBreakdown.map(p => ({ ...p, _id: toDisplayPriority(p._id) })),
        typeBreakdown,
        monthlyTrend: monthlyTrend.map(m => ({
          label: new Date(m._id.year, m._id.month - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          count: m.count,
        })),
        avgResolutionDays: avgRes.length > 0 ? Math.round(avgRes[0].avg * 10) / 10 : 0,
      },
    });
  } catch (error) {
    console.error('getStatistics:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route POST /api/supervisor/incidents/:id/comments
const addComment = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return next(new AppError('Comment message is required.', 400));

    const incident = await Incident.findById(req.params.id);
    if (!incident) return next(new AppError('Incident not found.', 404));

    incident.comments.push({
      commentedBy: req.user._id,
      role:        req.user.role,
      message:     message.trim(),
      createdAt:   new Date(),
    });
    await incident.save();

    try {
      const { sendNotification } = require('../services/notificationService');
      await sendNotification({
        recipient:       incident.reportedBy,
        type:            'comment_added',
        title:           '💬 New Comment on Your Report',
        message:         `Supervisor commented on incident ${incident.incidentId}`,
        relatedIncident: incident._id,
      });
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }

    res.status(201).json({ success: true, message: 'Comment added.', data: incident.comments });
  } catch (error) {
    next(error);
  }
};

// @route PUT /api/supervisor/incidents/:id/escalate
const escalateIncident = async (req, res, next) => {
  try {
    const { reason, escalateTo = 'management' } = req.body;
    if (!reason?.trim()) return next(new AppError('Escalation reason is required.', 400));

    const incident = await Incident.findById(req.params.id);
    if (!incident) return next(new AppError('Incident not found.', 404));

    incident.escalation = {
      isEscalated: true,
      escalatedBy: req.user._id,
      escalatedAt: new Date(),
      reason:      reason.trim(),
      escalatedTo: escalateTo,
    };
    await incident.save();

    try {
      const { sendEscalationNotification } = require('../services/notificationService');
      const managers = await User.find({ role: 'management', isActive: true }).select('_id');
      await sendEscalationNotification(incident, managers.map(m => m._id), req.user._id);
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }

    await logAction({
      incidentId: incident._id,
      userId:     req.user._id,
      role:       'supervisor',
      action:     'reviewed',
      summary:    `Incident escalated to ${escalateTo}`,
      metadata:   { reason, escalateTo },
    });

    res.status(200).json({ success: true, message: 'Incident escalated.' });
  } catch (error) {
    next(error);
  }
};

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  getDashboard,
  getAllIncidents,
  getIncidentById,
  addAssessment,
  updatePriority,
  markReviewed,
  forwardToSafetyOfficer,
  getSuggestedOfficer,       // ✅ NEW
  rejectIncident,
  assignIncident,
  getSafetyOfficers,
  sendReport,
  getTeamMembers,
  getStatistics,
  addComment,
  escalateIncident,
};