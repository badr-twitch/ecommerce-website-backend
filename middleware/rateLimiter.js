const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Strict limiter for auth endpoints (login, register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Veuillez réessayer dans 15 minutes.' }
});

// Moderate limiter for sensitive write operations (orders, reviews, membership)
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Veuillez réessayer plus tard.' }
});

// Public endpoint limiter (order tracking, product search)
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Veuillez réessayer plus tard.' }
});

// Admin action limiter (bulk operations, broadcasts)
const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop d\'actions admin. Veuillez réessayer plus tard.' }
});

// General API limiter (applied globally)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de requêtes atteinte. Veuillez réessayer plus tard.' }
});

// Strict login limiter — keyed by IP + email to prevent credential stuffing
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = req.body?.email || 'unknown';
    return `${ipKeyGenerator(req.ip)}-${email}`;
  },
  message: { error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.' }
});

// Account creation limiter — 3 accounts per hour per IP
const accountCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de créations de compte. Veuillez réessayer dans 1 heure.' }
});

// Anti-scraping limiter for public browsing endpoints
const scrapingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Veuillez réessayer plus tard.' }
});

module.exports = {
  authLimiter,
  writeLimiter,
  publicLimiter,
  adminActionLimiter,
  globalLimiter,
  loginLimiter,
  accountCreationLimiter,
  scrapingLimiter
};
