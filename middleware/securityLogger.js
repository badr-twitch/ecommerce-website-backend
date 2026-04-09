const logger = require('../services/logger');

function securityLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const meta = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      duration,
    };

    // Auth failures (401/403)
    if (res.statusCode === 401 || res.statusCode === 403) {
      logger.security('auth_failure', {
        ...meta,
        userId: req.user?.id || null,
        firebaseUid: req.firebaseUser?.uid || null,
      });
      return;
    }

    // Rate limit hit (429)
    if (res.statusCode === 429) {
      logger.security('rate_limit_hit', meta);
      return;
    }

    // Server errors (5xx)
    if (res.statusCode >= 500) {
      logger.error('server_error', meta);
      return;
    }

    // Successful auth events on auth routes
    if (req.originalUrl.startsWith('/api/auth') && res.statusCode >= 200 && res.statusCode < 300) {
      logger.info('auth_success', {
        ...meta,
        userId: req.user?.id || null,
      });
    }
  });

  next();
}

module.exports = securityLogger;
