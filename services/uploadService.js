const deleteFromCloudinary = async (publicId) => {
  const { cloudinary } = require('../config/cloudinary');
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId);
};

const uploadToCloudinary = (file) => {
  return {
    url:        file.path,
    publicId:   file.filename,
    filename:   file.originalname,
    uploadedAt: new Date(),
  };
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };
