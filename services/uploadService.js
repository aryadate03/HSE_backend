const fs = require('fs');
const path = require('path');

// ─── Get public URL for a file ────────────────────────────────────────────────
const getFileUrl = (filename) => {
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:5000';
  return `${baseUrl}/uploads/${filename}`;
};

// ─── Save file info (replaces uploadToCloudinary) ────────────────────────────
const uploadToCloudinary = async (file) => {
  // file is the multer file object from disk storage
  return {
    url: getFileUrl(file.filename),
    publicId: file.filename,
    filename: file.filename,
    uploadedAt: new Date(),
  };
};

// ─── Delete file from local storage ──────────────────────────────────────────
const deleteFromCloudinary = async (publicId) => {
  try {
    const filePath = path.join(__dirname, '..', 'uploads', publicId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('File delete error:', err.message);
  }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };