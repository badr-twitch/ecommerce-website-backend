const crypto = require('crypto');
const { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('./logger');

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.AWS_S3_BUCKET;
const PUT_TTL = parseInt(process.env.AWS_PRESIGNED_URL_TTL || '300', 10);
const GET_TTL = parseInt(process.env.AWS_PRESIGNED_GET_TTL || '900', 10);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPE = /^image\/(jpeg|png|webp|gif)$/;
const ALLOWED_CATEGORIES = ['profile-photos', 'products', 'categories', 'refund-proofs', 'reviews'];

let client = null;
function getClient() {
  if (!client) {
    if (!REGION || !BUCKET) {
      throw new Error('AWS_REGION and AWS_S3_BUCKET must be set');
    }
    client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      // SDK v3.729+ defaults to baking x-amz-sdk-checksum-algorithm into presigned URLs.
      // Browser PUT can't supply the matching CRC32 header → S3 401s with no CORS headers.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return client;
}

function sanitizeFilename(name) {
  const dotIdx = name.lastIndexOf('.');
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx + 1).toLowerCase() : '';
  const safeBase = base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'file';
  const safeExt = ext.replace(/[^a-z0-9]/g, '').slice(0, 5);
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

function buildKey({ category, entityId, filename }) {
  if (!ALLOWED_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }
  if (!entityId || typeof entityId !== 'string') {
    throw new Error('entityId required');
  }
  const safeEntity = entityId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeEntity) throw new Error('entityId invalid');
  const safeName = sanitizeFilename(filename || 'upload');
  const unique = crypto.randomBytes(8).toString('hex');
  return `${category}/${safeEntity}/${Date.now()}-${unique}-${safeName}`;
}

async function presignPut({ key, contentType, contentLength }) {
  if (!ALLOWED_CONTENT_TYPE.test(contentType)) {
    throw new Error(`Content-Type not allowed: ${contentType}`);
  }
  if (!Number.isInteger(contentLength) || contentLength <= 0 || contentLength > MAX_UPLOAD_BYTES) {
    throw new Error(`Invalid size (max ${MAX_UPLOAD_BYTES} bytes)`);
  }
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(getClient(), command, { expiresIn: PUT_TTL });
}

async function presignGet(key, { expiresIn = GET_TTL } = {}) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn });
}

async function deleteObject(key) {
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err) {
    logger.warn('S3 deleteObject failed', { key, error: err.message });
    return false;
  }
}

// Production-safe deletion. Gated by S3_DELETE_ENABLED env var.
// Validates key shape, never throws, returns { success }.
// When disabled, logs '[S3 CLEANUP SKIPPED] key=...' so flows can be exercised
// in production before deletion is enabled.
async function deleteObjectByKey(key) {
  if (!key || typeof key !== 'string' || !key.trim()) {
    logger.warn('[S3 CLEANUP] invalid key', { key });
    return { success: false };
  }

  const trimmed = key.trim();

  if (trimmed.includes('..') || trimmed.startsWith('/')) {
    logger.warn('[S3 CLEANUP] unsafe key rejected', { key: trimmed });
    return { success: false };
  }

  if (!ALLOWED_CATEGORIES.some((c) => trimmed.startsWith(`${c}/`))) {
    logger.warn('[S3 CLEANUP] key outside allowed prefixes', { key: trimmed });
    return { success: false };
  }

  if (process.env.S3_DELETE_ENABLED !== 'true') {
    logger.info(`[S3 CLEANUP SKIPPED] key=${trimmed}`);
    return { success: false };
  }

  logger.info('[S3 CLEANUP] deletion attempted', { key: trimmed });

  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: trimmed }));
    logger.info('[S3 CLEANUP] success', { key: trimmed });
    return { success: true };
  } catch (err) {
    if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) {
      logger.info('[S3 CLEANUP] object missing, treating as success', { key: trimmed });
      return { success: true };
    }
    logger.warn('[S3 CLEANUP] failure', { key: trimmed, error: err.message });
    return { success: false };
  }
}

// Best-effort, fire-and-forget deletion of S3 objects referenced by their public URLs.
// Skips entries that don't resolve to a key in our bucket. Never throws.
async function deleteObjectsByUrls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return { attempted: 0, deleted: 0 };
  let deleted = 0;
  for (const url of urls) {
    const key = parseKeyFromUrl(url);
    if (!key) continue;
    const ok = await deleteObject(key);
    if (ok) deleted += 1;
  }
  return { attempted: urls.length, deleted };
}

function parseKeyFromUrl(url) {
  if (typeof url !== 'string') return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const hostPath = `https://${parsed.hostname}${parsed.pathname}`;
  const virtualHost = `${BUCKET}.s3.${REGION}.amazonaws.com`;
  const pathStyle = `s3.${REGION}.amazonaws.com/${BUCKET}/`;
  if (parsed.hostname === virtualHost) {
    return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  }
  if (hostPath.includes(pathStyle)) {
    return decodeURIComponent(parsed.pathname.split(`/${BUCKET}/`)[1] || '');
  }
  return null;
}

module.exports = {
  buildKey,
  presignPut,
  presignGet,
  deleteObject,
  deleteObjectByKey,
  deleteObjectsByUrls,
  parseKeyFromUrl,
  sanitizeFilename,
  MAX_UPLOAD_BYTES,
  ALLOWED_CONTENT_TYPE,
  ALLOWED_CATEGORIES,
  BUCKET,
  REGION,
};
