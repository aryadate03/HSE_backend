const Incident = require('../models/Incident');
const User = require('../models/User');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/uploadService');
const { sendIncidentSubmittedNotification } = require('../services/notificationService');
const { successResponse } = require('../utils/errorResponse');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/incidentLogService');

// ─── CREATE INCIDENT ──────────────────────────────────────────────────────────
const createIncident = async (req, res, next) => {
  try {
    const {
      incidentType,
      dateTime,
      location,
      description,
      severity,
      hasInjury,
      witnesses,
      isDraft,
    } = req.body;

    // Parse FormData nested fields
    const parsedLocation = {
      building:      req.body['location[building]']      || location?.building      || '',
      floor:         req.body['location[floor]']         || location?.floor         || '',
      zone:          req.body['location[zone]']          || location?.zone          || '',
      manualAddress: req.body['location[manualAddress]'] || location?.manualAddress || '',
    };

    const parsedWitnesses = [];

    // Case 1: JSON body — witnesses as array directly
    if (Array.isArray(witnesses) && witnesses.length > 0) {
      witnesses.forEach((w) => {
        if (w.name?.trim()) {
          parsedWitnesses.push({ name: w.name.trim(), contact: w.contact || '' });
        }
      });
    }
    // Case 2: FormData — witnesses[0][name] format
    else {
      let wi = 0;
      while (req.body[`witnesses[${wi}][name]`]) {
        parsedWitnesses.push({
          name:    req.body[`witnesses[${wi}][name]`],
          contact: req.body[`witnesses[${wi}][contact]`] || '',
        });
        wi++;
      }
    }

    const incident = new Incident({
      reportedBy: req.user._id,
      incidentType,
      dateTime: dateTime || new Date(),
      location: parsedLocation,
      description,
      severity,
      hasInjury: hasInjury === true || hasInjury === 'true',
      witnesses: parsedWitnesses,
      isDraft: isDraft === true || isDraft === 'true',
      status: (isDraft === true || isDraft === 'true') ? 'draft' : 'submitted',
    });

    // Upload photos to local storage
    if (req.files && req.files.length > 0) {
      const uploaded = await Promise.all(req.files.map((f) => uploadToCloudinary(f)));
      incident.photos = uploaded;
    }

    await incident.save();

    await logAction({
      incidentId: incident._id,
      userId:     req.user._id,
      role:       'worker',
      action:     incident.isDraft ? 'draft_saved' : 'submitted',
      summary:    incident.isDraft ? 'Worker saved a draft' : 'Worker submitted incident report',
      metadata:   { severity: incident.severity, incidentType: incident.incidentType },
    });

    // Notify supervisors if submitted
    if (incident.status === 'submitted') {
      try {
        const supervisors = await User.find({ role: 'supervisor', isActive: true });
        for (const supervisor of supervisors) {
          await sendIncidentSubmittedNotification(incident, supervisor._id);
        }
      } catch {
        // Non-fatal — notification failure should not block incident creation
      }
    }

    return successResponse(res, 201, incident.isDraft ? 'Draft saved' : 'Incident submitted successfully', {
      incident,
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET MY REPORTS ───────────────────────────────────────────────────────────
const getMyReports = async (req, res, next) => {
  try {
    const {
      status, severity, startDate, endDate,
      page = 1, limit = 10, sort = '-createdAt',
    } = req.query;

    const filter = { reportedBy: req.user._id };
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (startDate || endDate) {
      filter.dateTime = {};
      if (startDate) filter.dateTime.$gte = new Date(startDate);
      if (endDate) filter.dateTime.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Incident.countDocuments(filter);
    const incidents = await Incident.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .populate('reportedBy', 'name email');

    return successResponse(res, 200, 'Reports fetched', {
      incidents,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
        limit: Number(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET INCIDENT BY ID ───────────────────────────────────────────────────────
const getIncidentById = async (req, res, next) => {
  try {
    const incident = await Incident.findOne({
      _id: req.params.id,
      reportedBy: req.user._id,
    }).populate('reportedBy', 'name email');

    if (!incident) return next(new AppError('Incident not found', 404));

    return successResponse(res, 200, 'Incident fetched', { incident });
  } catch (error) {
    next(error);
  }
};

// ─── UPDATE DRAFT ─────────────────────────────────────────────────────────────
const updateDraft = async (req, res, next) => {
  try {
    const incident = await Incident.findOne({
      _id: req.params.id,
      reportedBy: req.user._id,
      isDraft: true,
    });

    if (!incident) return next(new AppError('Draft not found', 404));

    const fields = ['incidentType', 'dateTime', 'location', 'description', 'severity', 'hasInjury', 'witnesses'];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) incident[f] = req.body[f];
    });

    await incident.save();
    return successResponse(res, 200, 'Draft updated', { incident });
  } catch (error) {
    next(error);
  }
};

// ─── SUBMIT DRAFT ─────────────────────────────────────────────────────────────
const submitIncident = async (req, res, next) => {
  try {
    const incident = await Incident.findOne({
      _id: req.params.id,
      reportedBy: req.user._id,
      isDraft: true,
    });

    if (!incident) return next(new AppError('Draft not found', 404));

    incident.isDraft = false;
    incident.status = 'submitted';
    await incident.save();

    try {
      const supervisors = await User.find({ role: 'supervisor', isActive: true });
      for (const supervisor of supervisors) {
        await sendIncidentSubmittedNotification(incident, supervisor._id);
      }
    } catch {
      // Non-fatal — notification failure should not block draft submission
    }

    return successResponse(res, 200, 'Incident submitted', { incident });
  } catch (error) {
    next(error);
  }
};

// ─── UPLOAD PHOTOS ────────────────────────────────────────────────────────────
const uploadPhotos = async (req, res, next) => {
  try {
    const incident = await Incident.findOne({
      _id: req.params.id,
      reportedBy: req.user._id,
    });

    if (!incident) return next(new AppError('Incident not found', 404));
    if (!req.files || req.files.length === 0) return next(new AppError('No photos provided', 400));
    if (incident.photos.length + req.files.length > 5)
      return next(new AppError('Maximum 5 photos allowed', 400));

    const uploaded = await Promise.all(
      req.files.map((f) => uploadToCloudinary(f))
    );
    incident.photos.push(...uploaded);
    await incident.save();

    return successResponse(res, 200, 'Photos uploaded', { photos: incident.photos });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE PHOTO ─────────────────────────────────────────────────────────────
const deletePhoto = async (req, res, next) => {
  try {
    const incident = await Incident.findOne({
      _id: req.params.id,
      reportedBy: req.user._id,
    });

    if (!incident) return next(new AppError('Incident not found', 404));

    const photo = incident.photos.id(req.params.photoId);
    if (!photo) return next(new AppError('Photo not found', 404));

    await deleteFromCloudinary(photo.publicId);
    incident.photos.pull(req.params.photoId);
    await incident.save();

    return successResponse(res, 200, 'Photo deleted', { photos: incident.photos });
  } catch (error) {
    next(error);
  }
};

// ─── WORKER DASHBOARD ─────────────────────────────────────────────────────────
const getWorkerDashboard = async (req, res, next) => {
  try {
    const workerId = req.user._id;

    const [total, submitted, underReview, resolved, drafts] = await Promise.all([
      Incident.countDocuments({ reportedBy: workerId, isDraft: false }),
      Incident.countDocuments({ reportedBy: workerId, status: 'submitted' }),
      Incident.countDocuments({ reportedBy: workerId, status: 'under_review' }),
      Incident.countDocuments({ reportedBy: workerId, status: 'resolved' }),
      Incident.countDocuments({ reportedBy: workerId, isDraft: true }),
    ]);

    const recentReports = await Incident.find({ reportedBy: workerId })
      .sort('-createdAt')
      .limit(5)
      .select('incidentId incidentType severity status createdAt isDraft dateTime location hasInjury photos description witnesses');

    return successResponse(res, 200, 'Dashboard fetched', {
      stats: { total, submitted, underReview, resolved, drafts },
      recentReports,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createIncident,
  getMyReports,
  getIncidentById,
  updateDraft,
  submitIncident,
  uploadPhotos,
  deletePhoto,
  getWorkerDashboard,
};