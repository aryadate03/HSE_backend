const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { AppError } = require('./errorhandler');

// ─── Create uploads folder if not exists ─────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Disk Storage ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `photo-${unique}${ext}`);
  },
});

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