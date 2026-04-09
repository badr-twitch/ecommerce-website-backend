// Progressive penalty middleware for repeat rate-limit offenders
// Tracks IPs that receive 429 responses and escalates block duration

// In-memory store: IP -> { hits, firstHitAt, blockedUntil }
const offenders = new Map();

const THRESHOLDS = [
  { hits: 10, blockMs: 24 * 60 * 60 * 1000 }, // 10+ hits: block 24 hours
  { hits: 5,  blockMs: 60 * 60 * 1000 },       // 5+ hits: block 1 hour
  { hits: 3,  blockMs: 30 * 60 * 1000 },        // 3+ hits: block 30 minutes
];

const TRACKING_WINDOW_MS = 60 * 60 * 1000; // 1 hour tracking window

// Cleanup expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of offenders) {
    const windowExpired = now - data.firstHitAt > TRACKING_WINDOW_MS;
    const blockExpired = !data.blockedUntil || now > data.blockedUntil;
    if (windowExpired && blockExpired) {
      offenders.delete(ip);
    }
  }
}, 10 * 60 * 1000).unref();

/**
 * Middleware that checks if an IP is currently blocked due to repeat offenses.
 * Must be placed BEFORE rate limiters in the middleware stack.
 */
function progressivePenalty(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const entry = offenders.get(ip);

  // Check if IP is currently blocked
  if (entry && entry.blockedUntil && now < entry.blockedUntil) {
    const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Accès temporairement bloqué suite à des abus répétés.',
      retryAfter
    });
  }

  // Intercept 429 responses to track offenders
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (res.statusCode === 429) {
      recordOffense(ip, now);
    }
    return originalJson(body);
  };

  next();
}

function recordOffense(ip, now) {
  let entry = offenders.get(ip);

  if (!entry || now - entry.firstHitAt > TRACKING_WINDOW_MS) {
    // Start new tracking window
    entry = { hits: 1, firstHitAt: now, blockedUntil: null };
    offenders.set(ip, entry);
    return;
  }

  entry.hits++;

  // Apply the highest matching threshold
  for (const threshold of THRESHOLDS) {
    if (entry.hits >= threshold.hits) {
      entry.blockedUntil = now + threshold.blockMs;
      break;
    }
  }
}

module.exports = progressivePenalty;
