const multer = require('multer');
const path = require('path');
const { AppError } = require('./errorhandler');

// ─── Memory Storage (Vercel compatible — no local filesystem writes) ──────────
const storage = multer.memoryStorage();

// ─── File Filter ──────────────────────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPG and PNG images are allowed', 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ─── Single photo upload (used by safety officer inspection photos) ───────────
const uploadSingle = upload.single('photo');

// ─── Multiple photos upload (max 5 for worker, max 10 for safety officer) ─────
const uploadMultiple = upload.array('photos', 5);
const uploadInspection = upload.array('photos', 10);

module.exports = { uploadSingle, uploadMultiple, uploadInspection };
