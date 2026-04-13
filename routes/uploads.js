const express = require('express');
const { body, validationResult } = require('express-validator');
const firebaseAuth = require('../middleware/firebaseAuth');
const adminAuth = require('../middleware/adminAuth');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Category = require('../models/Category');
const s3Service = require('../services/s3Service');
const { writeLimiter } = require('../middleware/rateLimiter');
const logger = require('../services/logger');

const router = express.Router();

async function authorizeCategory({ category, entityId, req }) {
  if (!req.firebaseUser) return { ok: false, status: 401, error: 'Authentification requise' };
  const user = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
  if (!user) return { ok: false, status: 404, error: 'Utilisateur non trouvé' };

  if (category === 'profile-photos') {
    if (entityId !== req.firebaseUser.uid) {
      return { ok: false, status: 403, error: 'Vous ne pouvez uploader que votre propre photo' };
    }
    return { ok: true, user };
  }

  if (category === 'products') {
    if (user.role !== 'admin') return { ok: false, status: 403, error: 'Réservé aux administrateurs' };
    if (entityId !== 'new') {
      const product = await Product.findByPk(entityId);
      if (!product) return { ok: false, status: 404, error: 'Produit non trouvé' };
    }
    return { ok: true, user };
  }

  if (category === 'categories') {
    if (user.role !== 'admin') return { ok: false, status: 403, error: 'Réservé aux administrateurs' };
    if (entityId !== 'new') {
      const cat = await Category.findByPk(entityId);
      if (!cat) return { ok: false, status: 404, error: 'Catégorie non trouvée' };
    }
    return { ok: true, user };
  }

  if (category === 'refund-proofs') {
    const order = await Order.findByPk(entityId);
    if (!order) return { ok: false, status: 404, error: 'Commande non trouvée' };
    if (user.role !== 'admin' && order.userId !== user.id) {
      return { ok: false, status: 403, error: 'Accès refusé' };
    }
    return { ok: true, user, order };
  }

  if (category === 'reviews') {
    // Review media: any authenticated buyer may upload; entityId = productId so the
    // object is namespaced per product. The review submission endpoint applies the
    // purchase + duplicate gates before persisting these URLs.
    const Product = require('../models/Product');
    const product = await Product.findByPk(entityId);
    if (!product) return { ok: false, status: 404, error: 'Produit non trouvé' };
    return { ok: true, user };
  }

  return { ok: false, status: 400, error: 'Catégorie invalide' };
}

// POST /api/uploads/presign
// Body: { category, entityId, filename, contentType, size }
router.post(
  '/presign',
  writeLimiter,
  firebaseAuth,
  [
    body('category').isIn(s3Service.ALLOWED_CATEGORIES),
    body('entityId').isString().isLength({ min: 1, max: 128 }),
    body('filename').isString().isLength({ min: 1, max: 200 }),
    body('contentType').isString().matches(s3Service.ALLOWED_CONTENT_TYPE),
    body('size').isInt({ min: 1, max: s3Service.MAX_UPLOAD_BYTES }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Données invalides', details: errors.array() });
    }
    const { category, entityId, filename, contentType, size } = req.body;

    const auth = await authorizeCategory({ category, entityId, req });
    if (!auth.ok) {
      return res.status(auth.status).json({ success: false, error: auth.error });
    }

    try {
      const key = s3Service.buildKey({ category, entityId, filename });
      const uploadUrl = await s3Service.presignPut({ key, contentType, contentLength: size });
      return res.json({ success: true, uploadUrl, key });
    } catch (err) {
      logger.error('Presign PUT failed', { error: err.message, category, entityId });
      return res.status(500).json({ success: false, error: 'Erreur de génération de l\'URL' });
    }
  }
);

// POST /api/uploads/sign-get
// Body: { key } — returns short-lived GET URL. Used for refund-proofs (admin) and public media delivery.
router.post(
  '/sign-get',
  firebaseAuth,
  [body('key').isString().isLength({ min: 1, max: 512 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Clé invalide' });
    }
    const { key } = req.body;

    const user = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });

    if (key.startsWith('refund-proofs/')) {
      const orderId = key.split('/')[1];
      const order = await Order.findByPk(orderId);
      if (!order) return res.status(404).json({ success: false, error: 'Commande non trouvée' });
      if (user.role !== 'admin' && order.userId !== user.id) {
        return res.status(403).json({ success: false, error: 'Accès refusé' });
      }
    } else if (!['profile-photos/', 'products/', 'categories/', 'reviews/'].some((p) => key.startsWith(p))) {
      return res.status(400).json({ success: false, error: 'Chemin non autorisé' });
    }

    try {
      const url = await s3Service.presignGet(key);
      return res.json({ success: true, url });
    } catch (err) {
      logger.error('Presign GET failed', { error: err.message, key });
      return res.status(500).json({ success: false, error: 'Erreur de signature' });
    }
  }
);

module.exports = router;
