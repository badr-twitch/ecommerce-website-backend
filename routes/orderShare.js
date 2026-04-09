const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const firebaseAuth = require('../middleware/firebaseAuth');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const OrderShare = require('../models/OrderShare');

// POST /api/orders/:id/share — Generate a share link
router.post('/:id/share', firebaseAuth, async (req, res) => {
  try {
    const { shareType = 'products' } = req.body;
    const order = await Order.findByPk(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    if (order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Expire in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const share = await OrderShare.create({
      orderId: order.id,
      shareType,
      expiresAt
    });

    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/orders/shared/${share.token}`;

    res.json({
      token: share.token,
      shareUrl,
      shareType,
      expiresAt
    });
  } catch (error) {
    console.error('Error creating order share:', error);
    res.status(500).json({ error: 'Erreur lors de la création du lien de partage' });
  }
});

// GET /api/orders/shared/:token — Public endpoint, no auth required
router.get('/shared/:token', async (req, res) => {
  try {
    const share = await OrderShare.findOne({
      where: { token: req.params.token }
    });

    if (!share) {
      return res.status(404).json({ error: 'Lien de partage invalide' });
    }

    if (new Date() > share.expiresAt) {
      return res.status(410).json({ error: 'Ce lien de partage a expiré' });
    }

    const order = await Order.findByPk(share.orderId, {
      include: [{
        model: OrderItem,
        as: 'orderItems',
        include: [{
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'images', 'slug']
        }]
      }]
    });

    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    // Build response based on shareType
    const response = {
      orderNumber: order.orderNumber,
      shareType: share.shareType,
      createdAt: order.createdAt
    };

    if (share.shareType === 'status') {
      // Status only — no product details, no prices
      response.status = order.status;
      response.estimatedDeliveryDate = order.estimatedDeliveryDate;
      response.itemCount = order.orderItems?.length || 0;
    } else if (share.shareType === 'products') {
      // Products + status, but no prices or addresses
      response.status = order.status;
      response.estimatedDeliveryDate = order.estimatedDeliveryDate;
      response.items = (order.orderItems || []).map(item => ({
        name: item.product?.name || item.productName,
        image: item.product?.images?.[0] || null,
        quantity: item.quantity,
        price: item.price
      }));
      response.totalAmount = order.totalAmount;
    } else if (share.shareType === 'gift') {
      // Gift receipt — product names + images, no prices at all
      response.items = (order.orderItems || []).map(item => ({
        name: item.product?.name || item.productName,
        image: item.product?.images?.[0] || null,
        quantity: item.quantity
      }));
      response.message = 'Un cadeau pour vous !';
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching shared order:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la commande partagée' });
  }
});

module.exports = router;
