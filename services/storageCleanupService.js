const admin = require('firebase-admin');

/**
 * Extract Firebase Storage path from a download URL.
 * Returns null for non-Firebase URLs.
 */
function getPathFromURL(url) {
  try {
    if (!url || !url.includes('firebasestorage.googleapis.com')) {
      return null;
    }
    const parsed = new URL(url);
    const encoded = parsed.pathname.split('/o/')[1]?.split('?')[0];
    return encoded ? decodeURIComponent(encoded) : null;
  } catch {
    return null;
  }
}

/**
 * Delete a single image from Firebase Storage by its download URL.
 * Silently ignores non-Firebase URLs and deletion errors.
 */
async function deleteImageByURL(url) {
  const path = getPathFromURL(url);
  if (!path) return;

  try {
    const bucket = admin.storage().bucket();
    await bucket.file(path).delete();
  } catch (error) {
    // File may already be deleted or URL may be external — don't block
    console.warn('Storage cleanup: could not delete', path, error.message);
  }
}

/**
 * Delete all Firebase Storage images associated with a product.
 */
async function deleteProductImages(product) {
  const urls = [];
  if (product.mainImage) urls.push(product.mainImage);
  if (Array.isArray(product.images)) urls.push(...product.images);

  await Promise.allSettled(urls.map(deleteImageByURL));
}

/**
 * Delete the Firebase Storage image associated with a category.
 */
async function deleteCategoryImage(category) {
  if (category.image) {
    await deleteImageByURL(category.image);
  }
  if (category.imageUrl) {
    await deleteImageByURL(category.imageUrl);
  }
}

module.exports = {
  deleteImageByURL,
  deleteProductImages,
  deleteCategoryImage,
};
