const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const User = require('../models/User');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Generate order number
const generateOrderNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `ORD-${timestamp}-${random}`;
};

// @route   GET /api/orders
// @desc    Get user orders or all orders (admin)
// @access  Private
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('status').optional().isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Paramètres invalides',
        details: errors.array() 
      });
    }

    const {
      page = 1,
      limit = 10,
      status
    } = req.query;

    const whereClause = {};
    
    // If not admin, only show user's orders
    if (req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    }

    if (status) {
      whereClause.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows: orders } = await Order.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: OrderItem,
          as: 'orderItems',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'mainImage']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des commandes:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération des commandes' 
    });
  }
});

// @route   GET /api/orders/:id
// @desc    Get single order
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const whereClause = { id };
    
    // If not admin, only allow access to own orders
    if (req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    }

    const order = await Order.findOne({
      where: whereClause,
      include: [
        {
          model: OrderItem,
          as: 'orderItems',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'mainImage', 'sku']
            }
          ]
        }
      ]
    });

    if (!order) {
      return res.status(404).json({ 
        error: 'Commande non trouvée' 
      });
    }

    res.json({ order });

  } catch (error) {
    console.error('Erreur lors de la récupération de la commande:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération de la commande' 
    });
  }
});

// @route   POST /api/orders
// @desc    Create a new order
// @access  Private
router.post('/', auth, [
  body('items').isArray({ min: 1 }).withMessage('Au moins un article requis'),
  body('items.*.productId').isUUID().withMessage('Product ID invalide'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantité invalide'),
  body('customerFirstName').trim().isLength({ min: 2, max: 50 }),
  body('customerLastName').trim().isLength({ min: 2, max: 50 }),
  body('customerEmail').isEmail().normalizeEmail(),
  body('billingAddress').trim().notEmpty(),
  body('billingCity').trim().notEmpty(),
  body('billingPostalCode').trim().notEmpty(),
  body('shippingAddress').trim().notEmpty(),
  body('shippingCity').trim().notEmpty(),
  body('shippingPostalCode').trim().notEmpty(),
  body('paymentMethod').isIn(['card', 'paypal', 'bank_transfer', 'cash_on_delivery']),
  body('customerNotes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const {
      items,
      customerFirstName,
      customerLastName,
      customerEmail,
      customerPhone,
      billingAddress,
      billingCity,
      billingPostalCode,
      billingCountry = 'France',
      shippingAddress,
      shippingCity,
      shippingPostalCode,
      shippingCountry = 'France',
      paymentMethod,
      customerNotes
    } = req.body;

    // Validate and calculate order totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findByPk(item.productId);
      if (!product) {
        return res.status(400).json({ 
          error: `Produit non trouvé: ${item.productId}` 
        });
      }

      if (!product.isInStock()) {
        return res.status(400).json({ 
          error: `Produit en rupture de stock: ${product.name}` 
        });
      }

      if (product.stockQuantity < item.quantity) {
        return res.status(400).json({ 
          error: `Stock insuffisant pour ${product.name}` 
        });
      }

      const unitPrice = product.getDiscountedPrice();
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        productName: product.name,
        productSku: product.sku,
        productImage: product.mainImage
      });
    }

    // Calculate taxes and shipping (simplified)
    const taxAmount = subtotal * 0.20; // 20% VAT for France
    const shippingAmount = subtotal > 50 ? 0 : 5.99; // Free shipping over €50
    const totalAmount = subtotal + taxAmount + shippingAmount;

    // Create order
    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      userId: req.user.id,
      totalAmount,
      subtotal,
      taxAmount,
      shippingAmount,
      discountAmount: 0,
      customerFirstName,
      customerLastName,
      customerEmail,
      customerPhone,
      billingAddress,
      billingCity,
      billingPostalCode,
      billingCountry,
      shippingAddress,
      shippingCity,
      shippingPostalCode,
      shippingCountry,
      paymentMethod,
      customerNotes
    });

    // Create order items
    await OrderItem.bulkCreate(
      orderItems.map(item => ({
        ...item,
        orderId: order.id
      }))
    );

    // Update product stock
    for (const item of orderItems) {
      await Product.decrement('stockQuantity', {
        by: item.quantity,
        where: { id: item.productId }
      });
    }

    // Get order with items
    const orderWithItems = await Order.findByPk(order.id, {
      include: [
        {
          model: OrderItem,
          as: 'orderItems'
        }
      ]
    });

    res.status(201).json({
      message: 'Commande créée avec succès',
      order: orderWithItems
    });

  } catch (error) {
    console.error('Erreur lors de la création de la commande:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la création de la commande' 
    });
  }
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status (admin only)
// @access  Private (Admin)
router.put('/:id/status', adminAuth, [
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).withMessage('Statut invalide'),
  body('trackingNumber').optional().trim(),
  body('internalNotes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const { id } = req.params;
    const { status, trackingNumber, internalNotes } = req.body;

    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ 
        error: 'Commande non trouvée' 
      });
    }

    const updateData = { status };
    
    // Update timestamps based on status
    switch (status) {
      case 'confirmed':
        updateData.confirmedAt = new Date();
        break;
      case 'shipped':
        updateData.shippedAt = new Date();
        updateData.trackingNumber = trackingNumber;
        break;
      case 'delivered':
        updateData.deliveredAt = new Date();
        break;
      case 'cancelled':
        updateData.cancelledAt = new Date();
        break;
    }

    if (internalNotes) {
      updateData.internalNotes = internalNotes;
    }

    await order.update(updateData);

    res.json({
      message: 'Statut de la commande mis à jour avec succès',
      order: order.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la mise à jour du statut' 
    });
  }
});

// @route   POST /api/orders/:id/cancel
// @desc    Cancel order
// @access  Private
router.post('/:id/cancel', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const whereClause = { id };
    if (req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    }

    const order = await Order.findOne({ where: whereClause });
    if (!order) {
      return res.status(404).json({ 
        error: 'Commande non trouvée' 
      });
    }

    if (!order.canBeCancelled()) {
      return res.status(400).json({ 
        error: 'Cette commande ne peut plus être annulée' 
      });
    }

    await order.update({
      status: 'cancelled',
      cancelledAt: new Date()
    });

    // Restore product stock
    const orderItems = await OrderItem.findAll({
      where: { orderId: order.id }
    });

    for (const item of orderItems) {
      await Product.increment('stockQuantity', {
        by: item.quantity,
        where: { id: item.productId }
      });
    }

    res.json({
      message: 'Commande annulée avec succès',
      order: order.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de l\'annulation de la commande:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'annulation de la commande' 
    });
  }
});

module.exports = router; 