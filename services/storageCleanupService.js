const s3Service = require('./s3Service');
const logger = require('./logger');

/**
 * Normalize a stored media reference to an S3 key.
 * Accepts either a bare key or a full S3 URL (virtual-hosted or path-style).
 */
function toKey(ref) {
  if (typeof ref !== 'string' || !ref) return null;
  if (!ref.includes('://')) return ref;
  // Backend proxy URL: .../api/media/public/{key}
  const proxyMatch = ref.match(/\/api\/media\/public\/(.+)$/);
  if (proxyMatch) return decodeURIComponent(proxyMatch[1]);
  return s3Service.parseKeyFromUrl(ref);
}

async function deleteImageByURL(ref) {
  const key = toKey(ref);
  if (!key) return;
  try {
    await s3Service.deleteObject(key);
  } catch (error) {
    logger.warn('Storage cleanup: delete failed', { key, error: error.message });
  }
}

async function deleteProductImages(product) {
  const refs = [];
  if (product.mainImage) refs.push(product.mainImage);
  if (Array.isArray(product.images)) refs.push(...product.images);
  await Promise.allSettled(refs.map(deleteImageByURL));
}

async function deleteCategoryImage(category) {
  if (category.image) await deleteImageByURL(category.image);
  if (category.imageUrl) await deleteImageByURL(category.imageUrl);
}

module.exports = {
  deleteImageByURL,
  deleteProductImages,
  deleteCategoryImage,
};
