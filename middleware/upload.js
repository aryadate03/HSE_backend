const { AppError } = require('./errorhandler');
const { uploadIncidentPhotos } = require('../config/cloudinary');
const multer = require('multer');

// ─── Cloudinary Storage (replaces memory storage) ─────────────────────────────
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('../config/cloudinary');

const inspectionStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'hse/inspections',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, quality: 'auto' }],
  },
});

const uploadInspectionPhotos = multer({
  storage: inspectionStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new AppError('Only JPG and PNG images are allowed', 400), false);
  },
});

// ─── Exports ──────────────────────────────────────────────────────────────────
const uploadSingle = uploadIncidentPhotos.single('photo');
const uploadMultiple = uploadIncidentPhotos.array('photos', 5);
const uploadInspection = uploadInspectionPhotos.array('photos', 10);

module.exports = { uploadSingle, uploadMultiple, uploadInspection };
