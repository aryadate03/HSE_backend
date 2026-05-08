// Standard success response
const successResponse = (res, statusCode, message, data = {}) => {
  res.status(statusCode).json({
    success: true,
    message,
    ...data,
  });
};

// Standard error response
const errorResponse = (res, statusCode, message) => {
  res.status(statusCode).json({
    success: false,
    message,
  });
};

module.exports = { successResponse, errorResponse };