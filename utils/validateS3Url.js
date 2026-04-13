/**
 * Validate that a string references an S3 object in our bucket with the
 * expected key prefix. Accepts either:
 *   - Bare S3 key: "refund-proofs/{orderId}/file.jpg"
 *   - Virtual-hosted URL: https://{bucket}.s3.{region}.amazonaws.com/{key}
 *   - Path-style URL:     https://s3.{region}.amazonaws.com/{bucket}/{key}
 *
 * @param {string} value
 * @param {object} opts
 * @param {string} opts.expectedPrefix - key must start with this
 * @param {string} opts.expectedBucket - bucket name to enforce
 * @param {string} [opts.expectedRegion] - optional region to enforce
 * @returns {boolean}
 */
function isValidS3Reference(value, { expectedPrefix, expectedBucket, expectedRegion } = {}) {
  if (typeof value !== 'string' || !expectedPrefix || !expectedBucket) return false;

  if (!value.includes('://')) {
    return value.startsWith(expectedPrefix) && !value.includes('..');
  }

  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;

  const virtualHost = expectedRegion
    ? new RegExp(`^${escapeRegex(expectedBucket)}\\.s3(\\.${escapeRegex(expectedRegion)})?\\.amazonaws\\.com$`)
    : new RegExp(`^${escapeRegex(expectedBucket)}\\.s3(\\.[a-z0-9-]+)?\\.amazonaws\\.com$`);
  const pathHost = expectedRegion
    ? new RegExp(`^s3\\.${escapeRegex(expectedRegion)}\\.amazonaws\\.com$`)
    : /^s3(\.[a-z0-9-]+)?\.amazonaws\.com$/;

  let key;
  if (virtualHost.test(parsed.hostname)) {
    key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } else if (pathHost.test(parsed.hostname)) {
    const rest = parsed.pathname.replace(/^\//, '');
    if (!rest.startsWith(`${expectedBucket}/`)) return false;
    key = decodeURIComponent(rest.slice(expectedBucket.length + 1));
  } else {
    return false;
  }

  if (!key || key.includes('..')) return false;
  return key.startsWith(expectedPrefix);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { isValidS3Reference };
