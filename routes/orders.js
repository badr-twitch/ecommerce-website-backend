const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const User = require('../models/User');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Initialize notification service (will be set by server.js)
let notificationService;

// Set notification service instance
const setNotificationService = (service) => {
  notificationService = service;
};

// Helper function to safely trigger notifications
const safeNotify = async (notificationFunction, ...args) => {
  if (notificationService) {
    try {
      await notificationFunction.apply(notificationService, args);
    } catch (error) {
      console.error('❌ Error triggering notification:', error);
    }
  }
};

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
    
    // If not admin, only show user's orders
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
              attributes: ['id', 'name', 'mainImage', 'price', 'discountPercentage']
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
// @desc    Create new order
// @access  Private
router.post('/', auth, [
  body('items').isArray({ min: 1 }).withMessage('Au moins un produit est requis'),
  body('items.*.productId').isUUID().withMessage('ID de produit invalide'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantité invalide'),
  body('customerFirstName').trim().notEmpty().withMessage('Prénom requis'),
  body('customerLastName').trim().notEmpty().withMessage('Nom requis'),
  body('customerEmail').isEmail().withMessage('Email invalide'),
  body('customerPhone').optional().trim(),
  body('billingAddress').trim().notEmpty().withMessage('Adresse de facturation requise'),
  body('billingCity').trim().notEmpty().withMessage('Ville de facturation requise'),
  body('billingPostalCode').trim().notEmpty().withMessage('Code postal de facturation requis'),
  body('billingCountry').trim().notEmpty().withMessage('Pays de facturation requis'),
  body('shippingAddress').trim().notEmpty().withMessage('Adresse de livraison requise'),
  body('shippingCity').trim().notEmpty().withMessage('Ville de livraison requise'),
  body('shippingPostalCode').trim().notEmpty().withMessage('Code postal de livraison requis'),
  body('shippingCountry').trim().notEmpty().withMessage('Pays de livraison requis'),
  body('paymentMethod').trim().notEmpty().withMessage('Méthode de paiement requise'),
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
      billingCountry,
      shippingAddress,
      shippingCity,
      shippingPostalCode,
      shippingCountry,
      paymentMethod,
      customerNotes
    } = req.body;

    // Validate products and calculate totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findByPk(item.productId);
      if (!product) {
        return res.status(400).json({ 
          error: `Produit ${item.productId} non trouvé` 
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

    // Trigger notification for new order
    await safeNotify(notificationService.notifyNewOrder, order.id);

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

    const oldStatus = order.status;
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

    // Trigger notification for status change
    if (notificationService && oldStatus !== status) {
      await safeNotify(notificationService.notifyOrderStatusChange, order.id, oldStatus, status);
    }

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

    const oldStatus = order.status;
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

    // Trigger notification for status change
    if (notificationService && oldStatus !== 'cancelled') {
      await safeNotify(notificationService.notifyOrderStatusChange, order.id, oldStatus, 'cancelled');
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

module.exports = { router, setNotificationService }; 