const Incident = require('../models/Incident');
const Investigation = require('../models/Investigation');
const User = require('../models/User');
const { AppError } = require('../middleware/errorhandler');
const path = require('path');
const fs = require('fs');
const { logAction } = require('../services/incidentLogService');
const { sendInvestigationStartedNotification } = require('../services/notificationService');

// ── Helper ────────────────────────────────────────────────────────────────────
const getOrCreateInvestigation = async (incidentId, investigatorId) => {
  let inv = await Investigation.findOne({ incident: incidentId });
  if (!inv) {
    inv = await Investigation.create({
      incident: incidentId,
      investigator: investigatorId,
      status: 'not_started',
    });
  }
  return inv;
};

// ── Format location ───────────────────────────────────────────────────────────
const formatLocation = (loc) => {
  if (!loc) return '—';
  if (typeof loc === 'string') return loc;
  return loc.manualAddress || loc.building || loc.zone || '—';
};

// ── Normalize incident ────────────────────────────────────────────────────────
const normalize = (inc) => ({
  ...inc,
  title:    inc.description?.substring(0, 60) || 'Untitled',
  type:     inc.incidentType || '—',
  location: formatLocation(inc.location),
});

// @route GET /api/safety-officer/dashboard
exports.getDashboard = async (req, res, next) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Safety officer sees ALL forwarded + investigating + resolved incidents
    const baseFilter = {
      status: { $in: ['forwarded_to_safety_officer', 'investigating', 'resolved', 'closed'] },
      isDraft: false,
    };

    const [active, overdue, resolved, critical, recentCases] = await Promise.all([
      Incident.countDocuments({ ...baseFilter, status: { $in: ['forwarded_to_safety_officer', 'investigating'] } }),
      Incident.countDocuments({ ...baseFilter, status: { $in: ['forwarded_to_safety_officer', 'investigating'] }, createdAt: { $lt: sevenDaysAgo } }),
      Incident.countDocuments({ status: { $in: ['resolved', 'closed'] }, isDraft: false }),
      Incident.countDocuments({ ...baseFilter, severity: 'critical', status: { $nin: ['resolved', 'closed'] } }),
      Incident.find({ status: { $in: ['forwarded_to_safety_officer', 'investigating'] }, isDraft: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('reportedBy', 'name department')
        .lean(),
    ]);

    // Monthly trend for chart
    const monthlyTrend = await Incident.aggregate([
      { $match: { isDraft: false, createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // By severity
    const bySeverity = await Incident.aggregate([
      { $match: { status: { $in: ['forwarded_to_safety_officer', 'investigating'] }, isDraft: false } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]);

    // By status
    const byStatus = await Incident.aggregate([
      { $match: { status: { $in: ['forwarded_to_safety_officer', 'investigating', 'resolved', 'closed'] }, isDraft: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: { active, overdue, resolved, critical },
        recentCases: recentCases.map(normalize),
        monthlyData: monthlyTrend.map(m => ({
          month: new Date(m._id.year, m._id.month - 1).toLocaleDateString('en-US', { month: 'short' }),
          incidents: m.count,
        })),
        bySeverity: bySeverity.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {}),
        byStatus:   byStatus.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {}),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route GET /api/safety-officer/cases
// Shows ALL forwarded_to_safety_officer + investigating incidents
exports.getAssignedCases = async (req, res, next) => {
  try {
    const { status, severity, page = 1, limit = 10 } = req.query;

    // Base: show forwarded + investigating incidents (not just assigned to this officer)
    const filter = {
      isDraft: false,
      status: { $in: ['forwarded_to_safety_officer', 'investigating', 'resolved', 'closed'] },
    };

    // Allow filtering by specific status
    if (status && status !== 'all') {
      const statusMap = {
        not_started: 'forwarded_to_safety_officer',
        in_progress:  'investigating',
        completed:    'resolved',
      };
      filter.status = statusMap[status] || status;
    }

    if (severity && severity !== 'all') filter.severity = severity;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [total, cases] = await Promise.all([
      Incident.countDocuments(filter),
      Incident.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('reportedBy', 'name department phone')
        .populate('forwardInfo.forwardedBy', 'name')
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      count: cases.length,
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      data: cases.map(normalize),
    });
  } catch (error) {
    next(error);
  }
};

// @route GET /api/safety-officer/cases/overdue
exports.getOverdueCases = async (req, res, next) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cases = await Incident.find({
      isDraft: false,
      status: { $in: ['forwarded_to_safety_officer', 'investigating'] },
      createdAt: { $lt: sevenDaysAgo },
    })
      .sort({ createdAt: 1 })
      .populate('reportedBy', 'name department')
      .lean();

    res.status(200).json({ success: true, count: cases.length, data: cases.map(normalize) });
  } catch (error) {
    next(error);
  }
};

// @route GET /api/safety-officer/cases/:id
exports.getCaseById = async (req, res, next) => {
  try {
    const incident = await Incident.findOne({
      _id: req.params.id,
      isDraft: false,
      status: { $in: ['forwarded_to_safety_officer', 'investigating', 'resolved', 'closed'] },
    })
      .populate('reportedBy', 'name department phone')
      .populate('forwardInfo.forwardedBy', 'name')
      .populate('supervisorReview.reviewedBy', 'name')
      .lean();

    if (!incident) return next(new AppError('Case not found.', 404));

    const investigation = await Investigation.findOne({ incident: incident._id })
      .populate('investigator', 'name')
      .populate('closure.closedBy', 'name')
      .lean();

    res.status(200).json({
      success: true,
      data: { incident: normalize(incident), investigation: investigation || null },
    });
  } catch (error) {
    next(error);
  }
};

// @route PUT /api/safety-officer/cases/:id/start
// Safety officer starts investigation
exports.startInvestigation = async (req, res, next) => {
  try {
    const incident = await Incident.findOne({
      _id: req.params.id,
      isDraft: false,
      status: 'forwarded_to_safety_officer',
    });
    if (!incident) return next(new AppError('Case not found or already being investigated.', 404));

    incident.status = 'investigating';
    incident.investigation = {
      assignedTo: req.user._id,
      assignedAt: new Date(),
    };
    await incident.save();

    await sendInvestigationStartedNotification(incident, req.user._id);

    await logAction({
      incidentId: incident._id,
      userId:     req.user._id,
      role:       'safety_officer',
      action:     'investigation_started',
      summary:    'Safety Officer started investigation',
    });

    await getOrCreateInvestigation(incident._id, req.user._id);

    res.status(200).json({ success: true, message: 'Investigation started.' });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/safety-officer/cases/:id/site-visit
exports.logSiteVisit = async (req, res, next) => {
  try {
    const { visitDate, findings, done } = req.body;
    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return next(new AppError('Case not found.', 404));

    const inv = await getOrCreateInvestigation(incident._id, req.user._id);
    inv.siteVisit = {
      done: done !== undefined ? Boolean(done) : true,
      visitDate: visitDate ? new Date(visitDate) : new Date(),
      findings: findings || '',
    };

    if (inv.status === 'not_started') {
      inv.status = 'in_progress';
      await Incident.findByIdAndUpdate(incident._id, { status: 'investigating' });
    }
    await inv.save();

    res.status(200).json({ success: true, message: 'Site visit logged.', data: inv.siteVisit });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/safety-officer/cases/:id/inspection-photos
exports.uploadInspectionPhotos = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) return next(new AppError('No photos uploaded.', 400));

    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return next(new AppError('Case not found.', 404));

    const inv = await getOrCreateInvestigation(incident._id, req.user._id);
    const captions = req.body.captions
      ? Array.isArray(req.body.captions) ? req.body.captions : [req.body.captions]
      : [];

    inv.inspectionPhotos.push(...req.files.map((file, i) => ({
      url: `/uploads/${file.filename}`,
      filename: file.filename,
      caption: captions[i] || '',
      uploadedAt: new Date(),
    })));
    await inv.save();

    res.status(200).json({ success: true, message: `${req.files.length} photo(s) uploaded.`, data: inv.inspectionPhotos });
  } catch (error) {
    next(error);
  }
};

// @route DELETE /api/safety-officer/cases/:id/inspection-photos/:photoId
exports.deleteInspectionPhoto = async (req, res, next) => {
  try {
    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return next(new AppError('Case not found.', 404));

    const inv = await Investigation.findOne({ incident: incident._id });
    if (!inv) return next(new AppError('Investigation not found.', 404));

    const photo = inv.inspectionPhotos.id(req.params.photoId);
    if (!photo) return next(new AppError('Photo not found.', 404));

    if (photo.filename) {
      const filePath = path.join(__dirname, '..', 'uploads', photo.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    photo.deleteOne();
    await inv.save();

    res.status(200).json({ success: true, message: 'Photo deleted.', data: inv.inspectionPhotos });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/safety-officer/cases/:id/root-cause
exports.addRootCause = async (req, res, next) => {
  try {
    const { primaryCause, contributingFactors } = req.body;
    if (!primaryCause) return next(new AppError('Primary cause is required.', 400));

    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return next(new AppError('Case not found.', 404));

    const inv = await getOrCreateInvestigation(incident._id, req.user._id);
    inv.rootCause = {
      primaryCause,
      contributingFactors: Array.isArray(contributingFactors) ? contributingFactors : contributingFactors ? [contributingFactors] : [],
      analysisDate: new Date(),
    };
    if (inv.status === 'not_started') {
      inv.status = 'in_progress';
      await Incident.findByIdAndUpdate(incident._id, { status: 'investigating' });
    }
    await inv.save();

    res.status(200).json({ success: true, message: 'Root cause saved.', data: inv.rootCause });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/safety-officer/cases/:id/corrective-actions
exports.addCorrectiveActions = async (req, res, next) => {
  try {
    const { correctiveActions } = req.body;
    if (!correctiveActions || !Array.isArray(correctiveActions) || correctiveActions.length === 0)
      return next(new AppError('At least one corrective action is required.', 400));

    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return next(new AppError('Case not found.', 404));

    const inv = await getOrCreateInvestigation(incident._id, req.user._id);
    inv.correctiveActions = correctiveActions.map(ca => ({
      action: ca.action || '',
      completedDate: ca.completedDate ? new Date(ca.completedDate) : null,
      verifiedBy: ca.verifiedBy || '',
    }));
    await inv.save();

    res.status(200).json({ success: true, message: 'Corrective actions saved.', data: inv.correctiveActions });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/safety-officer/cases/:id/preventive-measures
exports.addPreventiveMeasures = async (req, res, next) => {
  try {
    const { description, implementationDate } = req.body;
    if (!description) return next(new AppError('Description is required.', 400));

    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return next(new AppError('Case not found.', 404));

    const inv = await getOrCreateInvestigation(incident._id, req.user._id);
    inv.preventiveMeasures = { description, implementationDate: implementationDate ? new Date(implementationDate) : null };
    await inv.save();

    res.status(200).json({ success: true, message: 'Preventive measures saved.', data: inv.preventiveMeasures });
  } catch (error) {
    next(error);
  }
};

// @route PUT /api/safety-officer/cases/:id/cost
exports.updateCost = async (req, res, next) => {
  try {
    const { estimatedCost, actualCost, breakdown } = req.body;
    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return next(new AppError('Case not found.', 404));

    const inv = await getOrCreateInvestigation(incident._id, req.user._id);
    if (estimatedCost !== undefined) inv.costAnalysis.estimatedCost = estimatedCost;
    if (actualCost !== undefined)    inv.costAnalysis.actualCost    = actualCost;
    if (breakdown !== undefined)     inv.costAnalysis.breakdown     = breakdown;
    await inv.save();

    res.status(200).json({ success: true, message: 'Cost updated.', data: inv.costAnalysis });
  } catch (error) {
    next(error);
  }
};

// @route PUT /api/safety-officer/cases/:id/status
exports.updateInvestigationStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['not_started','in_progress','completed'].includes(status))
      return next(new AppError('Invalid status.', 400));

    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return next(new AppError('Case not found.', 404));

    const inv = await getOrCreateInvestigation(incident._id, req.user._id);
    inv.status = status;
    await inv.save();

    res.status(200).json({ success: true, message: 'Status updated.', data: { status: inv.status } });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/safety-officer/cases/:id/resolve
// Safety officer resolves the incident
exports.resolveCase = async (req, res, next) => {
  try {
    const { resolutionNote } = req.body;
    if (!resolutionNote?.trim()) return next(new AppError('Resolution note is required.', 400));

    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return next(new AppError('Case not found.', 404));

    incident.status = 'resolved';
    incident.investigation = {
      ...incident.investigation,
      resolvedBy: req.user._id,
      resolvedAt: new Date(),
      resolutionNote: resolutionNote.trim(),
    };
    await incident.save();
    const { sendResolvedNotification } = require('../services/notificationService');
    const supervisor = await User.findOne({ role: 'supervisor', isActive: true });
    const recipients = [incident.reportedBy, supervisor?._id].filter(Boolean);
    await sendResolvedNotification(incident, recipients, req.user._id);

    await logAction({
      incidentId: incident._id,
      userId:     req.user._id,
      role:       'safety_officer',
      action:     'resolved',
      summary:    'Safety Officer resolved the incident',
      metadata:   {
        rootCause:          req.body.rootCause,
        correctiveActions:  req.body.correctiveActions,
        preventiveMeasures: req.body.preventiveMeasures,
      },
    });

    res.status(200).json({ success: true, message: 'Case resolved.' });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/safety-officer/cases/:id/close
exports.closeCase = async (req, res, next) => {
  try {
    const { finalSummary, lessonsLearned } = req.body;
    if (!finalSummary) return next(new AppError('Final summary is required.', 400));

    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return next(new AppError('Case not found.', 404));

    const inv = await Investigation.findOne({ incident: incident._id });
    if (!inv) return next(new AppError('Investigation not found.', 400));

    inv.closure = { closedBy: req.user._id, closedAt: new Date(), finalSummary, lessonsLearned: lessonsLearned || '' };
    inv.status = 'completed';
    await inv.save();

    await Incident.findByIdAndUpdate(incident._id, { status: 'closed' });

    res.status(200).json({ success: true, message: 'Case closed.' });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/safety-officer/cases/:id/report
// Send report to management
exports.sendReport = async (req, res, next) => {
  try {
    const { content, summary } = req.body;
    if (!content?.trim()) return next(new AppError('Report content is required.', 400));

    const incident = await Incident.findOne({ _id: req.params.id, isDraft: false });
    if (!incident) return next(new AppError('Case not found.', 404));

    incident.reports.push({
      sentBy: req.user._id,
      sentAt: new Date(),
      reportType: 'safety_officer_report',
      content: content.trim(),
      summary: summary?.trim() || '',
    });
    await incident.save();

    res.status(201).json({ success: true, message: 'Report sent to management.' });
  } catch (error) {
    next(error);
  }
};

// @route GET /api/safety-officer/analytics
exports.getAnalytics = async (req, res, next) => {
  try {
    const filter = { isDraft: false, status: { $in: ['forwarded_to_safety_officer','investigating','resolved','closed'] } };

    const [byStatus, bySeverity, byType] = await Promise.all([
      Incident.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Incident.aggregate([{ $match: filter }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
      Incident.aggregate([{ $match: filter }, { $group: { _id: '$incidentType', count: { $sum: 1 } } }]),
    ]);

    const toObj = (arr) => arr.reduce((acc, cur) => { acc[cur._id] = cur.count; return acc; }, {});

    res.status(200).json({
      success: true,
      data: { byStatus: toObj(byStatus), bySeverity: toObj(bySeverity), byType: toObj(byType) },
    });
  } catch (error) {
    next(error);
  }
};