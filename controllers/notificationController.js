const Notification = require('../models/Notification');
const { successResponse } = require('../utils/errorResponse');
const { AppError } = require('../middleware/errorHandler');

// ─── GET USER NOTIFICATIONS ───────────────────────────────────────────────────
const getUserNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, isRead } = req.query;
    const filter = { recipient: req.user._id };

    if (isRead !== undefined) filter.isRead = isRead === 'true';

    const skip = (page - 1) * limit;
    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });

    const notifications = await Notification.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(Number(limit))
      .populate('sender', 'name')
      .populate('relatedIncident', 'incidentId incidentType');

    successResponse(res, 200, 'Notifications fetched', {
      notifications,
      unreadCount,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── MARK AS READ ─────────────────────────────────────────────────────────────
const markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user._id,
    });

    if (!notification) {
      return next(new AppError('Notification not found', 404));
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    successResponse(res, 200, 'Notification marked as read', { notification });
  } catch (error) {
    next(error);
  }
};

// ─── MARK ALL AS READ ─────────────────────────────────────────────────────────
const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    successResponse(res, 200, 'All notifications marked as read');
  } catch (error) {
    next(error);
  }
};

// ─── DELETE NOTIFICATION ──────────────────────────────────────────────────────
const deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user._id,
    });

    if (!notification) {
      return next(new AppError('Notification not found', 404));
    }

    successResponse(res, 200, 'Notification deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};