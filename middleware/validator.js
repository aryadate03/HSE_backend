const { validationResult } = require('express-validator');

// Runs after express-validator checks and returns errors if any
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg);
    return res.status(400).json({
      success: false,
      message: messages[0], // show first error
      errors: messages,
    });
  }
  next();
};

module.exports = validate;