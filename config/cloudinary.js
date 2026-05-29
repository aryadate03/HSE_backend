const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// ─── Cloudinary Config ────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Cloudinary Storage for Incident Photos ───────────────────────────────────
const incidentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'hse/incidents',       // Cloudinary folder
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, quality: 'auto' }], // auto optimize
  },
});

// ─── Multer Upload Middleware ─────────────────────────────────────────────────
const uploadIncidentPhotos = multer({
  storage: incidentStorage,
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5MB max per file
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpg, png, webp)'), false);
    }
  },
});

module.exports = { cloudinary, uploadIncidentPhotos };
