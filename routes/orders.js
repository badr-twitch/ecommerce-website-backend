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

const router = express.Router();
const { publicLimiter, writeLimiter } = require('../middleware/rateLimiter');

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
router.get('/:id', firebaseAuth, async (req, res) => {
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
      billingCountry,
      shippingAddress,
      shippingCity,
      shippingPostalCode,
      shippingCountry,
      paymentMethod,
      paymentIntentId,
      customerNotes
    } = req.body;

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
      paymentStatus: 'paid',
      paymentTransactionId: paymentIntentId,
      customerNotes,
      estimatedDeliveryDate: new Date(Date.now() + (
        (shippingCountry === 'Maroc' || shippingCountry === 'Morocco' || shippingCountry === 'France') ? 5 : 14
      ) * 24 * 60 * 60 * 1000)
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
router.put('/:id/status', firebaseAuth, adminAuth, [
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
        if (!order.estimatedDeliveryDate) {
          const country = order.shippingCountry;
          const days = (country === 'Maroc' || country === 'Morocco' || country === 'France') ? 5 : 14;
          updateData.estimatedDeliveryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
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
router.post('/:id/cancel', firebaseAuth, async (req, res) => {
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

// @route   POST /api/orders/:id/refund
// @desc    Request refund for a delivered order
// @access  Private
router.post('/:id/refund', firebaseAuth, [
  body('reason').notEmpty().withMessage('Raison du remboursement requise')
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
    const { reason } = req.body;

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

    // Only allow refund on delivered or shipped orders
    if (!['delivered', 'shipped'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: 'Seules les commandes livrées ou expédiées peuvent être remboursées'
      });
    }

    // Already refunded
    if (order.paymentStatus === 'refunded') {
      return res.status(400).json({
        success: false,
        error: 'Cette commande a déjà été remboursée'
      });
    }

    // Must have a Stripe payment to refund
    if (!order.paymentTransactionId) {
      return res.status(400).json({
        success: false,
        error: 'Aucun paiement Stripe associé à cette commande'
      });
    }

    // Process refund via Stripe
    const refund = await paymentProcessor.refundPayment(order.paymentTransactionId);

    const oldStatus = order.status;
    await order.update({
      status: 'refunded',
      paymentStatus: 'refunded',
      internalNotes: `${order.internalNotes || ''}\n[Remboursement] ${new Date().toISOString()} - Raison: ${reason}`.trim()
    });

    // Log status change
    await logStatusChange(order.id, oldStatus, 'refunded', user?.id, 'customer', reason, { refundId: refund.id });

    // Restore stock
    const orderItems = await OrderItem.findAll({ where: { orderId: order.id } });
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

    // Trigger notifications
    if (notificationService) {
      await safeNotify(notificationService.notifyOrderStatusChange, order.id, oldStatus, 'refunded');
    }

    // Send refund email
    try {
      if (user) {
        await emailService.sendOrderStatusUpdateEmail(order, user, oldStatus, 'refunded');
      }
    } catch (emailError) {
      console.error('Error sending refund email:', emailError);
    }

    res.json({
      success: true,
      message: 'Remboursement effectué avec succès',
      order: order.toJSON(),
      refundId: refund.id
    });

  } catch (error) {
    console.error('Error processing refund:', error);

    // Handle specific Stripe errors
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        error: 'Erreur Stripe: ' + error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Erreur lors du remboursement'
    });
  }
});

// @route   GET /api/orders/:id/history
// @desc    Get order status change history
// @access  Private
router.get('/:id/history', firebaseAuth, async (req, res) => {
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