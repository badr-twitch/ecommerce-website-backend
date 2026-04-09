const xss = require('xss');

/**
 * Middleware that recursively sanitizes all string values in req.body
 * to prevent stored XSS attacks.
 */
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};

function sanitizeObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  if (typeof obj === 'string') {
    return xss(obj);
  }
  return obj;
}

module.exports = sanitizeBody;
