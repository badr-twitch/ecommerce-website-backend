// Bot detection and anti-scraping middleware

const BOT_UA_PATTERNS = [
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /scrapy/i,
  /httpclient/i,
  /java\//i,
  /libwww-perl/i,
  /go-http-client/i,
  /node-fetch/i,
  /axios\//i,
  /postman/i,
  /insomnia/i,
  /httpie/i,
  /phantomjs/i,
  /headlesschrome/i,
];

// In-memory burst tracker: IP -> { count, windowStart }
const burstTracker = new Map();
const BURST_WINDOW_MS = 1000; // 1 second
const BURST_MAX = 20; // max 20 requests per second per IP (SPAs fire batches on navigation)

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of burstTracker) {
    if (now - data.windowStart > BURST_WINDOW_MS * 10) {
      burstTracker.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Block requests with missing/empty User-Agent and known bot patterns.
 * In development, allows requests without User-Agent for API testing tools.
 */
function botProtection(req, res, next) {
  const ua = req.headers['user-agent'];

  // Block missing User-Agent in production
  if (!ua || ua.trim() === '') {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Accès refusé.' });
    }
    // Allow in development for testing tools
    return next();
  }

  // Block known bot/scraper User-Agents
  for (const pattern of BOT_UA_PATTERNS) {
    if (pattern.test(ua)) {
      return res.status(403).json({ error: 'Accès refusé.' });
    }
  }

  // Burst speed detection
  const ip = req.ip;
  const now = Date.now();
  const entry = burstTracker.get(ip);

  if (entry) {
    if (now - entry.windowStart < BURST_WINDOW_MS) {
      entry.count++;
      if (entry.count > BURST_MAX) {
        return res.status(429).json({ error: 'Trop de requêtes. Ralentissez.' });
      }
    } else {
      // Reset window
      entry.count = 1;
      entry.windowStart = now;
    }
  } else {
    burstTracker.set(ip, { count: 1, windowStart: now });
  }

  next();
}

module.exports = botProtection;
