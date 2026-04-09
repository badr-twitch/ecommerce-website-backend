const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, security: 3 };

const isProduction = process.env.NODE_ENV === 'production';
const minLevel = isProduction ? 'info' : 'debug';

function log(level, message, meta = {}) {
  if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const output = isProduction
    ? JSON.stringify(entry)
    : `[${entry.timestamp}] ${level.toUpperCase()}: ${message}${Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''}`;

  if (level === 'error' || level === 'security') {
    console.error(output);
  } else {
    console.log(output);
  }
}

module.exports = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  security: (msg, meta) => log('security', msg, meta),
};
