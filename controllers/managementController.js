const Incident = require('../models/Incident');
const User = require('../models/User');
const { logAction } = require('../services/incidentLogService');

// ── Helper ────────────────────────────────────────────────────────────────────
const formatLocation = (loc) => {
  if (!loc) return '—';
  if (typeof loc === 'string') return loc;
  return loc.manualAddress || loc.building || loc.zone || '—';
};

const normalizeIncident = (inc) => {
  const obj = inc.toObject ? inc.toObject() : inc;
  return {
    ...obj,
    title:    obj.description?.substring(0, 60) || 'Untitled',
    type:     obj.incidentType?.replace(/_/g, ' ') || '—',
    location: formatLocation(obj.location),
    reportedByName: obj.reportedBy?.name || '—',
  };
};

// Status display mapping
const STATUS_DISPLAY = {
  draft:                       'Draft',
  submitted:                   'Submitted',
  under_review:                'Under Review',
  forwarded_to_safety_officer: 'Forwarded to Safety Officer',
  investigating:               'Investigating',
  resolved:                    'Resolved',
  closed:                      'Closed',
  rejected:                    'Rejected',
};

// @route GET /api/management/dashboard
exports.getDashboard = async (req, res) => {
  try {
    const [totalIncidents, resolved, investigating, critical, forwarded, rejected] = await Promise.all([
      Incident.countDocuments({ isDraft: false }),
      Incident.countDocuments({ isDraft: false, status: { $in: ['resolved', 'closed'] } }),
      Incident.countDocuments({ isDraft: false, status: 'investigating' }),
      Incident.countDocuments({ isDraft: false, severity: 'critical' }),
      Incident.countDocuments({ isDraft: false, status: 'forwarded_to_safety_officer' }),
      Incident.countDocuments({ isDraft: false, status: 'rejected' }),
    ]);

    const complianceRate = totalIncidents > 0
      ? Math.round(((resolved) / totalIncidents) * 100)
      : 0;

    const recentIncidents = await Incident.find({ isDraft: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('reportedBy', 'name email department')
      .lean();

    // Trends — last 6 months
    const trends = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.toLocaleString('default', { month: 'short' });
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end   = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const count = await Incident.countDocuments({ isDraft: false, createdAt: { $gte: start, $lte: end } });
      trends.push({ month, incidents: count });
    }

    // By severity for pie chart
    const bySeverityRaw = await Incident.aggregate([
      { $match: { isDraft: false } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]);
    const bySeverity = bySeverityRaw.map(s => ({ name: s._id, value: s.count }));

    res.status(200).json({
      success: true,
      data: {
        stats: { totalIncidents, resolved, inProgress: investigating, critical, complianceRate, forwarded, rejected },
        recentIncidents: recentIncidents.map(normalizeIncident),
        trends,
        bySeverity,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route GET /api/management/incidents
exports.getAllIncidents = async (req, res) => {
  try {
    const { status, severity, type, startDate, endDate, search, page = 1, limit = 20 } = req.query;

    const filter = { isDraft: false };
    if (status && status !== 'all')   filter.status   = status;
    if (severity && severity !== 'all') filter.severity = severity;
    if (type && type !== 'all')       filter.incidentType = type;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate)   filter.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { incidentId:  { $regex: search, $options: 'i' } },
        { 'location.manualAddress': { $regex: search, $options: 'i' } },
        { 'location.building':      { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Incident.countDocuments(filter);
    const incidentsRaw = await Incident.find(filter)
      .populate('reportedBy', 'name email department')
      .populate('assignedTo', 'name email')
      .populate('supervisorReview.reviewedBy', 'name')
      .populate('forwardInfo.forwardedBy', 'name')
      .populate('investigation.assignedTo', 'name')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    res.status(200).json({
      success: true,
      data: incidentsRaw.map(normalizeIncident),
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route GET /api/management/incidents/:id
exports.getIncidentById = async (req, res) => {
  try {
    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false })
      .populate('reportedBy',               'name email department phone')
      .populate('assignedTo',               'name email')
      .populate('supervisorReview.reviewedBy','name email')
      .populate('forwardInfo.forwardedBy',  'name email')
      .populate('rejectionInfo.rejectedBy', 'name email')
      .populate('investigation.assignedTo', 'name email')
      .populate('reports.sentBy',           'name role')
      .lean();

    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    res.status(200).json({ success: true, data: normalizeIncident(incident) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route PUT /api/management/incidents/:id/close
exports.closeIncident = async (req, res) => {
  try {
    const { notes } = req.body;
    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    incident.status = 'closed';
    incident.managementNotes = notes?.trim() || '';
    incident.closedBy = req.user._id;
    incident.closedAt = new Date();
    await incident.save();

    const { sendClosedNotification } = require('../services/notificationService');
    const supervisor = await User.findOne({ role: 'supervisor', isActive: true });
    const recipients = [incident.reportedBy, supervisor?._id, incident.investigation?.assignedTo].filter(Boolean);
    await sendClosedNotification(incident, recipients, req.user._id);

    await logAction({
      incidentId: incident._id,
      userId:     req.user._id,
      role:       'management',
      action:     'closed',
      summary:    'Management closed the incident',
      metadata:   { notes: req.body.notes },
    });

    res.status(200).json({ success: true, message: 'Incident closed.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route GET /api/management/analytics
exports.getAnalytics = async (req, res) => {
  try {
    const base = { isDraft: false };

    const [byType, bySeverity, byStatus] = await Promise.all([
      Incident.aggregate([
        { $match: base },
        { $group: { _id: '$incidentType', count: { $sum: 1 } } },
        { $project: { type: '$_id', count: 1, _id: 0 } },
      ]),
      Incident.aggregate([
        { $match: base },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
        { $project: { severity: '$_id', count: 1, _id: 0 } },
      ]),
      Incident.aggregate([
        { $match: base },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
      ]),
    ]);

    // Monthly — last 6 months
    const byMonth = [];
    for (let i = 5; i >= 0; i--) {
      const date  = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.toLocaleString('default', { month: 'short' });
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end   = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const count = await Incident.countDocuments({ ...base, createdAt: { $gte: start, $lte: end } });
      byMonth.push({ month, count });
    }

    res.status(200).json({
      success: true,
      data: { byType, bySeverity, byStatus, byMonth },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route GET /api/management/reports
// All supervisor + safety officer reports sent to management
exports.getReports = async (req, res) => {
  try {
    const incidentsWithReports = await Incident.find({
      isDraft: false,
      'reports.0': { $exists: true }, // has at least one report
    })
      .populate('reportedBy', 'name department')
      .populate('reports.sentBy', 'name role')
      .sort({ 'reports.sentAt': -1 })
      .lean();

    // Flatten reports with incident context
    const reports = [];
    incidentsWithReports.forEach(inc => {
      inc.reports.forEach(report => {
        reports.push({
          _id:        report._id,
          incidentId: inc.incidentId,
          incidentDescription: inc.description?.substring(0, 60),
          severity:   inc.severity,
          sentBy:     report.sentBy,
          sentAt:     report.sentAt,
          reportType: report.reportType,
          summary:    report.summary,
          content:    report.content,
        });
      });
    });

    // Sort by sentAt descending
    reports.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

    res.status(200).json({ success: true, data: reports, total: reports.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route GET /api/management/compliance
// @route GET /api/management/compliance
exports.getComplianceRate = async (req, res) => {
  try {
    const base = { isDraft: false };
    const total    = await Incident.countDocuments(base);
    const resolved = await Incident.countDocuments({ ...base, status: { $in: ['resolved', 'closed'] } });
    const overall  = total > 0 ? Math.round((resolved / total) * 100) : 0;

    const byDepartment = await Incident.aggregate([
      { $match: base },
      {
        $lookup: {
          from: 'users',
          localField: 'reportedBy',
          foreignField: '_id',
          as: 'reporter',
        },
      },
      // ✅ preserveNullAndEmpty was wrong field name — use this instead
      {
        $unwind: {
          path: '$reporter',
          preserveNullAndEmptyArrays: true,  // ← was 'preserveNullAndEmpty' (wrong)
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$reporter.department', 'Unknown'] },
          total:    { $sum: 1 },
          resolved: {
            $sum: {
              $cond: [{ $in: ['$status', ['resolved', 'closed']] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          department: '$_id',
          total: 1,
          resolved: 1,
          rate: {
            $cond: [
              { $eq: ['$total', 0] },
              0,
              {
                $round: [
                  { $multiply: [{ $divide: ['$resolved', '$total'] }, 100] },
                  0,
                ],
              },
            ],
          },
        },
      },
      { $sort: { rate: -1 } },
    ]);

    res.status(200).json({
      success: true,
      data: { overall, byDepartment, total, resolved },
    });
  } catch (error) {
    console.error('Compliance error:', error); // ← will show exact crash reason
    res.status(500).json({ success: false, message: error.message });
  }
};