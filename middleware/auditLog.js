const AdminAuditLog = require('../models/AdminAuditLog');

/**
 * Middleware factory that logs admin actions to the audit log.
 * @param {string} action - The action being performed (e.g., 'CREATE', 'UPDATE', 'DELETE')
 * @param {string} resource - The resource type (e.g., 'product', 'order', 'user')
 * @param {function} [getResourceId] - Optional function(req) to extract resource ID
 * @param {function} [getDetails] - Optional function(req, res) to extract additional details
 */
const auditLog = (action, resource, getResourceId, getDetails) => {
  return async (req, res, next) => {
    // Store original end to intercept response
    const originalEnd = res.end;
    const originalJson = res.json;
    let responseBody;

    res.json = function (body) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    res.end = function (...args) {
      // Only log successful mutations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const adminUser = req.user || req.firebaseUser;
        const adminId = adminUser?.id || adminUser?.localUser?.id;

        if (adminId) {
          const resourceId = getResourceId ? getResourceId(req) : req.params.id || null;
          const details = getDetails ? getDetails(req, responseBody) : {};

          AdminAuditLog.create({
            adminId,
            action,
            resource,
            resourceId: resourceId ? String(resourceId) : null,
            details,
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.get('User-Agent')
          }).catch(err => {
            console.error('Audit log error:', err.message);
          });
        }
      }

      return originalEnd.apply(this, args);
    };

    next();
  };
};

module.exports = auditLog;
