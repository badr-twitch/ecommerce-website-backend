const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const User = require('../models/User');
const firebaseAuth = require('../middleware/firebaseAuth');
const adminAuth = require('../middleware/adminAuth');
const OrderStatusLog = require('../models/OrderStatusLog');
const paymentProcessor = require('../services/paymentProcessor');
const emailService = require('../services/emailService');
const reorderService = require('../services/reorderService');
const loyaltyService = require('../services/loyaltyService');
const { isValidS3Reference } = require('../utils/validateS3Url');
const {
  CANONICAL_COUNTRY,
  isMoroccanCountry,
  normalizeMoroccanPhone,
} = require('../utils/morocco');

const router = express.Router();
const { publicLimiter, writeLimiter } = require('../middleware/rateLimiter');
const { validateId, validatePagination, handleValidationErrors } = require('../middleware/validateInput');
const { param } = require('express-validator');

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

// Log order status change
const logStatusChange = async (orderId, previousStatus, newStatus, changedBy, role, reason, metadata) => {
  try {
    await OrderStatusLog.create({
      orderId,
      previousStatus,
      newStatus,
      changedBy: changedBy || null,
      changedByRole: role || 'system',
      reason: reason || null,
      metadata: metadata || {}
    });
  } catch (error) {
    console.error('Error logging status change:', error);
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
router.get('/', firebaseAuth, async (req, res, next) => {
  console.log('🔍 Orders Route - Firebase user:', req.firebaseUser?.uid);
  console.log('🔍 Orders Route - Database user:', req.user?.id);
  next();
}, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('status').optional().isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refund_requested', 'refunded'])
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
    if (req.user && req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    } else if (req.firebaseUser) {
      // Use Firebase UID to find user in database
      const user = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
      if (user) {
        whereClause.userId = user.id;
      }
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
      success: true,
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

// @route   GET /api/orders/track/:orderNumber
// @desc    Public order tracking by order number + email
// @access  Public
router.get('/track/:orderNumber', publicLimiter, [
  param('orderNumber').trim().isLength({ min: 1, max: 50 }).matches(/^[A-Za-z0-9-]+$/).withMessage('Numéro de commande invalide'),
  query('email').isEmail().withMessage('Email invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { orderNumber } = req.params;
    const { email } = req.query;

    const order = await Order.findOne({
      where: {
        orderNumber,
        customerEmail: email.toLowerCase()
      },
      include: [{
        model: OrderItem,
        as: 'orderItems',
        include: [{
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'mainImage']
        }]
      }],
      attributes: [
        'id', 'orderNumber', 'status', 'totalAmount', 'shippingAmount',
        'trackingNumber', 'estimatedDeliveryDate', 'shippingMethod',
        'shippingCity', 'shippingCountry',
        'createdAt', 'confirmedAt', 'shippedAt', 'deliveredAt', 'cancelledAt'
      ]
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Aucune commande trouvée avec ce numéro et cet email'
      });
    }

    res.json({
      success: true,
      order: order.toJSON()
    });
  } catch (error) {
    console.error('Error tracking order:', error);
    res.status(500).json({ success: false, error: 'Erreur lors du suivi de la commande' });
  }
});

// @route   GET /api/orders/reorder-suggestions
// @desc    Get smart reorder suggestions based on purchase history
// @access  Private
router.get('/reorder-suggestions', firebaseAuth, async (req, res) => {
  try {
    const user = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    const suggestions = await reorderService.getReorderSuggestions(user.id);

    res.json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('Error getting reorder suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des suggestions'
    });
  }
});

// @route   GET /api/orders/:id
// @desc    Get single order
// @access  Private
router.get('/:id', validateId, firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const whereClause = { id };
    
    // If not admin, only show user's orders
    if (req.user && req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    } else if (req.firebaseUser) {
      // Use Firebase UID to find user in database
      const user = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
      if (user) {
        whereClause.userId = user.id;
      }
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
              attributes: ['id', 'name', 'mainImage', 'price', 'salePercentage']
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

    res.json({ 
      success: true, 
      order 
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de la commande:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération de la commande' 
    });
  }
});

// @route   POST /api/orders/create-payment-intent
// @desc    Create a Stripe PaymentIntent for checkout
// @access  Private
router.post('/create-payment-intent', firebaseAuth, [
  body('amount').isFloat({ min: 0.01 }).withMessage('Montant invalide'),
  body('currency').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Données invalides', details: errors.array() });
    }

    const { amount, currency = 'mad' } = req.body;

    // Find the user
    const user = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Get or create Stripe customer
    const customer = await paymentProcessor.getOrCreateCustomer(user);

    // Amount should be in centimes (smallest currency unit)
    const amountInCentimes = Math.round(amount * 100);

    const { clientSecret, paymentIntentId } = await paymentProcessor.createPaymentIntent(
      amountInCentimes,
      currency,
      { userId: user.id },
      customer.id
    );

    res.json({
      success: true,
      clientSecret,
      paymentIntentId
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      error: error.message || 'Erreur lors de la création du paiement'
    });
  }
});

// @route   POST /api/orders
// @desc    Create new order (after Stripe payment confirmed)
// @access  Private
router.post('/', writeLimiter, firebaseAuth, [
  body('items').isArray({ min: 1 }).withMessage('Au moins un produit est requis'),
  body('items.*.productId').isUUID().withMessage('ID de produit invalide'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantité invalide'),
  body('customerFirstName').trim().notEmpty().withMessage('Prénom requis'),
  body('customerLastName').trim().notEmpty().withMessage('Nom requis'),
  body('customerEmail').isEmail().withMessage('Email invalide'),
  body('customerPhone')
    .trim()
    .notEmpty().withMessage('Téléphone requis')
    .bail()
    .custom((value) => {
      if (!normalizeMoroccanPhone(value).valid) {
        throw new Error('Numéro de téléphone marocain invalide (ex. 06 12 34 56 78 ou +212 6 12 34 56 78)');
      }
      return true;
    }),
  body('billingAddress').trim().notEmpty().withMessage('Adresse de facturation requise'),
  body('billingCity').trim().notEmpty().withMessage('Ville de facturation requise'),
  body('billingPostalCode').trim().notEmpty().withMessage('Code postal de facturation requis'),
  body('billingCountry')
    .optional({ checkFalsy: true })
    .custom((value) => {
      if (!isMoroccanCountry(value)) {
        throw new Error('Facturation disponible uniquement au Maroc');
      }
      return true;
    }),
  body('shippingAddress').trim().notEmpty().withMessage('Adresse de livraison requise'),
  body('shippingCity').trim().notEmpty().withMessage('Ville de livraison requise'),
  body('shippingPostalCode').trim().notEmpty().withMessage('Code postal de livraison requis'),
  body('shippingCountry')
    .optional({ checkFalsy: true })
    .custom((value) => {
      if (!isMoroccanCountry(value)) {
        throw new Error('Livraison disponible uniquement au Maroc');
      }
      return true;
    }),
  body('paymentMethod').trim().notEmpty().withMessage('Méthode de paiement requise'),
  body('paymentIntentId').trim().notEmpty().withMessage('ID de paiement Stripe requis'),
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
      shippingAddress,
      shippingCity,
      shippingPostalCode,
      paymentMethod,
      paymentIntentId,
      customerNotes
    } = req.body;

    // Normalise the phone to +212… and pin billing/shipping countries to the
    // canonical Moroccan value regardless of what the client sent.
    const normalizedPhone = normalizeMoroccanPhone(customerPhone).normalized;
    const billingCountry = CANONICAL_COUNTRY;
    const shippingCountry = CANONICAL_COUNTRY;

    // Verify Stripe payment succeeded
    const paymentIntent = await paymentProcessor.retrievePaymentIntent(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        error: `Le paiement n'a pas été confirmé (statut: ${paymentIntent.status})`
      });
    }

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

    // Get user from Firebase UID if not already set
    let userId = req.user?.id;
    let orderUser = req.user;
    if (!userId && req.firebaseUser) {
      orderUser = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
      if (orderUser) {
        userId = orderUser.id;
      }
    } else if (userId && !orderUser) {
      orderUser = await User.findByPk(userId);
    }

    if (!userId) {
      return res.status(400).json({
        error: 'Utilisateur non trouvé'
      });
    }

    // Check if user is an active UMOD Prime member
    const isMember = orderUser &&
      orderUser.membershipStatus === 'active' &&
      orderUser.membershipExpiresAt &&
      new Date(orderUser.membershipExpiresAt) > new Date();

    // Calculate taxes and shipping
    const taxAmount = subtotal * 0.20; // 20% VAT
    const shippingAmount = isMember ? 0 : (subtotal > 536 ? 0 : 64.2);
    const discountAmount = isMember ? Math.round(subtotal * 0.05 * 100) / 100 : 0; // 5% Prime discount
    const totalAmount = subtotal + taxAmount + shippingAmount - discountAmount;

    // Create order with verified payment
    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      userId: userId,
      totalAmount,
      subtotal,
      taxAmount,
      shippingAmount,
      discountAmount,
      customerFirstName,
      customerLastName,
      customerEmail,
      customerPhone: normalizedPhone,
      billingAddress,
      billingCity,
      billingPostalCode,
      billingCountry,
      shippingAddress,
      shippingCity,
      shippingPostalCode,
      shippingCountry,
      paymentMethod,
      paymentStatus: 'paid',
      paymentTransactionId: paymentIntentId,
      customerNotes,
      // Morocco-only delivery: ~5 days across the kingdom.
      estimatedDeliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    });

    // Create order items
    await OrderItem.bulkCreate(
      orderItems.map(item => ({
        ...item,
        orderId: order.id
      }))
    );

    // Update product stock and check for low/out-of-stock
    for (const item of orderItems) {
      await Product.decrement('stockQuantity', {
        by: item.quantity,
        where: { id: item.productId }
      });

      // Check stock levels after decrement for notifications
      if (notificationService) {
        const updatedProduct = await Product.findByPk(item.productId);
        if (updatedProduct) {
          const stock = updatedProduct.stockQuantity;
          const reorderPoint = updatedProduct.reorderPoint || 10;
          if (stock <= 0) {
            await safeNotify(notificationService.notifyOutOfStock, item.productId);
          } else if (stock <= reorderPoint) {
            await safeNotify(notificationService.notifyLowStock, item.productId);
          }
        }
      }
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

    // Send order confirmation email
    try {
      const user = await User.findByPk(order.userId);
      if (user && user.email) {
        await emailService.sendOrderConfirmationEmail(order, orderWithItems.orderItems, user);
      }
    } catch (emailError) {
      console.error('❌ Error sending order confirmation email:', emailError);
    }

    // Award loyalty points
    try {
      const loyaltyUser = await User.findByPk(order.userId);
      if (loyaltyUser) {
        const loyaltyResult = await loyaltyService.awardPoints(loyaltyUser, subtotal, isMember);
        console.log(`🎯 Loyalty: awarded ${loyaltyResult.pointsEarned} points to user ${order.userId} (${isMember ? '2x Prime' : '1x'})`);
      }
    } catch (loyaltyError) {
      console.error('❌ Error awarding loyalty points:', loyaltyError);
    }

    res.status(201).json({
      success: true,
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
router.put('/:id/status', validateId, firebaseAuth, adminAuth, [
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refund_requested', 'refunded']).withMessage('Statut invalide'),
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
        if (!order.estimatedDeliveryDate) {
          // Morocco-only delivery: ~5 days across the kingdom.
          updateData.estimatedDeliveryDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
        }
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

    // Log status change (admin action)
    if (oldStatus !== status) {
      const adminUser = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
      await logStatusChange(order.id, oldStatus, status, adminUser?.id, 'admin', internalNotes, { trackingNumber });
    }

    // Trigger notification for status change
    if (notificationService && oldStatus !== status) {
      await safeNotify(notificationService.notifyOrderStatusChange, order.id, oldStatus, status);
    }

    // Send status update email
    if (oldStatus !== status) {
      try {
        const user = await User.findByPk(order.userId);
        if (user && user.email) {
          await emailService.sendOrderStatusUpdateEmail(order, user, oldStatus, status);
        }
      } catch (emailError) {
        console.error('❌ Error sending order status update email:', emailError);
      }
    }

    res.json({
      success: true,
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
router.post('/:id/cancel', validateId, firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const whereClause = { id };
    if (req.user && req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    } else if (req.firebaseUser) {
      // Use Firebase UID to find user in database
      const user = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
      if (user) {
        whereClause.userId = user.id;
      }
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

    // Auto-refund via Stripe if payment was captured
    let refundId = null;
    if (order.paymentTransactionId && order.paymentStatus === 'paid') {
      try {
        const refund = await paymentProcessor.refundPayment(order.paymentTransactionId);
        refundId = refund.id;
      } catch (refundError) {
        console.error('❌ Stripe refund failed on cancel:', refundError);
        return res.status(500).json({
          error: 'Le remboursement a échoué. Veuillez réessayer ou contacter le support.'
        });
      }
    }

    await order.update({
      status: 'cancelled',
      cancelledAt: new Date(),
      ...(refundId && { paymentStatus: 'refunded' })
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

      // Check if stock was restored from 0
      if (notificationService) {
        const updatedProduct = await Product.findByPk(item.productId);
        if (updatedProduct && updatedProduct.stockQuantity > 0 && updatedProduct.stockQuantity <= item.quantity) {
          await safeNotify(notificationService.notifyStockRestored, item.productId);
        }
      }
    }

    // Log status change
    const cancelUser = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
    await logStatusChange(order.id, oldStatus, 'cancelled', cancelUser?.id, 'customer', 'Annulation par le client');

    // Trigger notification for status change
    if (notificationService && oldStatus !== 'cancelled') {
      await safeNotify(notificationService.notifyOrderStatusChange, order.id, oldStatus, 'cancelled');
    }

    // Send cancellation email
    try {
      const user = await User.findByPk(order.userId);
      if (user && user.email) {
        await emailService.sendOrderStatusUpdateEmail(order, user, oldStatus, 'cancelled');
      }
    } catch (emailError) {
      console.error('❌ Error sending cancellation email:', emailError);
    }

    res.json({
      success: true,
      message: refundId
        ? 'Commande annulée et remboursement effectué'
        : 'Commande annulée avec succès',
      order: order.toJSON(),
      ...(refundId && { refundId })
    });

  } catch (error) {
    console.error('Erreur lors de l\'annulation de la commande:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'annulation de la commande' 
    });
  }
});

// @route   POST /api/orders/:id/refund
// @desc    Request refund for a delivered order (admin reviews before processing)
// @access  Private
router.post('/:id/refund', writeLimiter, validateId, firebaseAuth, [
  body('reason')
    .isIn(['defective', 'wrong_item', 'damaged_in_shipping', 'not_as_described', 'missing_parts'])
    .withMessage('Catégorie de remboursement invalide'),
  body('description')
    .isString()
    .isLength({ min: 20, max: 2000 })
    .withMessage('Description requise (entre 20 et 2000 caractères)'),
  body('proofImages')
    .isArray({ min: 1, max: 5 })
    .withMessage('Entre 1 et 5 photos de preuve sont requises'),
  body('proofImages.*')
    .isString()
    .isLength({ min: 1, max: 512 })
    .withMessage('Référence d\'image invalide'),
  body('affectedItems')
    .optional()
    .isArray({ max: 50 })
    .withMessage('Les articles affectés doivent être un tableau (max 50)')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { reason, description, proofImages, affectedItems } = req.body;

    // Find order and verify ownership
    const whereClause = { id };
    const user = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
    if (user && user.role !== 'admin') {
      whereClause.userId = user.id;
    }

    const order = await Order.findOne({ where: whereClause });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    // Only allow refund on delivered orders
    if (order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        error: 'Seules les commandes livrées peuvent faire l\'objet d\'une demande de remboursement'
      });
    }

    // 30-day refund window
    if (order.deliveredAt) {
      const daysSinceDelivery = (Date.now() - new Date(order.deliveredAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDelivery > 30) {
        return res.status(400).json({
          success: false,
          error: 'Le délai de remboursement de 30 jours est dépassé'
        });
      }
    }

    // Already refunded or request pending
    if (order.paymentStatus === 'refunded') {
      return res.status(400).json({
        success: false,
        error: 'Cette commande a déjà été remboursée'
      });
    }

    if (order.status === 'refund_requested') {
      return res.status(400).json({
        success: false,
        error: 'Une demande de remboursement est déjà en cours pour cette commande'
      });
    }

    // Must have a Stripe payment to refund
    if (!order.paymentTransactionId) {
      return res.status(400).json({
        success: false,
        error: 'Aucun paiement Stripe associé à cette commande'
      });
    }

    const expectedPrefix = `refund-proofs/${order.id}/`;
    const expectedBucket = process.env.AWS_S3_BUCKET;
    const expectedRegion = process.env.AWS_REGION;
    const allProofsValid = proofImages.every((ref) =>
      isValidS3Reference(ref, { expectedPrefix, expectedBucket, expectedRegion })
    );
    if (!allProofsValid) {
      return res.status(400).json({
        success: false,
        error: 'Référence de preuve invalide : les images doivent être uploadées sur cette commande'
      });
    }

    const oldStatus = order.status;
    await order.update({
      status: 'refund_requested',
      refundRequestedAt: new Date(),
      refundReason: reason,
      refundDescription: description,
      refundProofImages: proofImages,
      refundAffectedItems: affectedItems || null,
      internalNotes: `${order.internalNotes || ''}\n[Demande de remboursement] ${new Date().toISOString()} - Catégorie: ${reason}`.trim()
    });

    // Log status change
    await logStatusChange(order.id, oldStatus, 'refund_requested', user?.id, 'customer', description);

    // Notify admin of refund request
    if (notificationService) {
      await safeNotify(notificationService.notifyOrderStatusChange, order.id, oldStatus, 'refund_requested');
    }

    res.json({
      success: true,
      message: 'Demande de remboursement envoyée. Elle sera examinée par notre équipe sous 48h.',
      order: order.toJSON()
    });

  } catch (error) {
    console.error('Error processing refund request:', error);

    res.status(500).json({
      success: false,
      error: 'Erreur lors du remboursement'
    });
  }
});

// @route   GET /api/orders/:id/history
// @desc    Get order status change history
// @access  Private
router.get('/:id/history', validateId, firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Find user and verify ownership
    const user = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
    const whereClause = { id };
    if (user && user.role !== 'admin') {
      whereClause.userId = user.id;
    }

    const order = await Order.findOne({ where: whereClause });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    const logs = await OrderStatusLog.findAll({
      where: { orderId: id },
      include: [{
        model: User,
        as: 'changedByUser',
        attributes: ['id', 'firstName', 'lastName', 'role']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      history: logs.map(log => ({
        id: log.id,
        previousStatus: log.previousStatus,
        newStatus: log.newStatus,
        changedByRole: log.changedByRole,
        changedByName: log.changedByUser
          ? `${log.changedByUser.firstName} ${log.changedByUser.lastName}`
          : 'Système',
        reason: log.reason,
        metadata: log.metadata,
        createdAt: log.createdAt
      }))
    });

  } catch (error) {
    console.error('Error fetching order history:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de l\'historique'
    });
  }
});

module.exports = { router, setNotificationService };