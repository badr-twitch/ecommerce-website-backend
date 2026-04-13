const express = require('express');
const s3Service = require('../services/s3Service');
const { publicLimiter } = require('../middleware/rateLimiter');
const logger = require('../services/logger');

const router = express.Router();
const PUBLIC_PREFIXES = ['profile-photos/', 'products/', 'categories/'];

// GET /api/media/public/:keyPath(*)
// Redirects <img src> to a short-lived presigned S3 URL.
// Public categories only — no auth required, browsers can fetch directly.
router.get('/public/*', publicLimiter, async (req, res) => {
  const key = req.params[0];
  if (!key || key.includes('..') || !PUBLIC_PREFIXES.some((p) => key.startsWith(p))) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  try {
    const url = await s3Service.presignGet(key, { expiresIn: 900 });
    res.set('Cache-Control', 'public, max-age=60');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.redirect(302, url);
  } catch (err) {
    logger.error('media/public redirect failed', { key, error: err.message });
    return res.status(500).json({ success: false, error: 'Signing failed' });
  }
});

module.exports = router;
