const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const router = express.Router();

// Import models
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const ShippingAddress = require('../models/ShippingAddress');
const PaymentMethod = require('../models/PaymentMethod');
const StockHistory = require('../models/StockHistory');
const inventoryService = require('../services/inventoryService');
const { deleteProductImages, deleteCategoryImage } = require('../services/storageCleanupService');

// Import models index to ensure associations are loaded
require('../models/index');

// Import middleware
const firebaseAuth = require('../middleware/firebaseAuth');
const adminAuth = require('../middleware/adminAuth');
const auditLog = require('../middleware/auditLog');

// Apply Firebase auth and admin auth to all admin routes
router.use(firebaseAuth, adminAuth);

// ==================== DASHBOARD ====================

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics with real analytics
// @access  Admin
router.get('/dashboard', async (req, res) => {
  try {
    // Basic statistics
    const totalUsers = await User.count({ where: { role: 'client' } });
    const totalProducts = await Product.count();
    const totalCategories = await Category.count();
    const totalOrders = await Order.count();
    
    // Enhanced revenue calculation
    const completedOrders = await Order.findAll({
      where: { status: { [Op.in]: ['delivered', 'shipped'] } },
      attributes: ['totalAmount', 'createdAt']
    });
    
    const totalRevenue = completedOrders.reduce((sum, order) => sum + parseFloat(order.totalAmount), 0);
    const averageOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
    
    // Build a full 7-day date array (YYYY-MM-DD strings, oldest first)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });

    // Real revenue trends (last 7 days)
    const revenueData = await Order.findAll({
      where: {
        status: { [Op.in]: ['delivered', 'shipped'] },
        createdAt: {
          [Op.gte]: sevenDaysAgo
        }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'revenue']
      ],
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
    });

    const revenueByDate = {};
    revenueData.forEach(item => {
      const key = typeof item.dataValues.date === 'string'
        ? item.dataValues.date
        : new Date(item.dataValues.date).toISOString().slice(0, 10);
      revenueByDate[key] = parseFloat(item.dataValues.revenue || 0);
    });

    // Real user registration trends (last 7 days)
    const userRegistrationData = await User.findAll({
      where: {
        role: 'client',
        createdAt: {
          [Op.gte]: sevenDaysAgo
        }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'registrations']
      ],
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
    });

    const registrationsByDate = {};
    userRegistrationData.forEach(item => {
      const key = typeof item.dataValues.date === 'string'
        ? item.dataValues.date
        : new Date(item.dataValues.date).toISOString().slice(0, 10);
      registrationsByDate[key] = parseInt(item.dataValues.registrations || 0);
    });
    
    // Real order status distribution
    const orderStatusDistribution = await Order.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status']
    });
    
    // Real top selling products (by order items) - only from completed orders
    const topProducts = await OrderItem.findAll({
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'mainImage', 'price']
        },
        {
          model: Order,
          as: 'order',
          where: { status: { [Op.in]: ['delivered', 'shipped'] } },
          attributes: []
        }
      ],
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalSold'],
        [sequelize.fn('SUM', sequelize.literal('quantity * "product"."price"')), 'totalRevenue']
      ],
      group: ['productId', 'product.id', 'product.name', 'product.mainImage', 'product.price'],
      order: [[sequelize.fn('SUM', sequelize.col('quantity')), 'DESC']],
      limit: 5
    });
    
    // Low stock products count
    const lowStockProducts = await Product.count({
      where: {
        stockQuantity: {
          [Op.lte]: 10 // Count products with stock <= 10
        }
      }
    });
    
    // Conversion rate (orders per user)
    const conversionRate = totalUsers > 0 ? (totalOrders / totalUsers * 100).toFixed(2) : 0;
    
    // Monthly growth rates
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const currentMonthOrders = await Order.count({
      where: {
        createdAt: {
          [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    });
    
    const lastMonthOrders = await Order.count({
      where: {
        createdAt: {
          [Op.gte]: lastMonth,
          [Op.lt]: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    });
    
    const orderGrowthRate = lastMonthOrders > 0 
      ? ((currentMonthOrders - lastMonthOrders) / lastMonthOrders * 100).toFixed(2)
      : 0;

    // Recent orders with user info
    const recentOrders = await Order.findAll({
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    // === TODAY'S STATS ===
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const todayOrders = await Order.findAll({
      where: { createdAt: { [Op.gte]: todayStart } },
      attributes: ['totalAmount', 'status']
    });
    const todayRevenue = todayOrders
      .filter(o => ['delivered', 'shipped', 'confirmed', 'processing'].includes(o.status))
      .reduce((sum, o) => sum + parseFloat(o.totalAmount), 0);
    const todayOrderCount = todayOrders.length;

    const yesterdayOrders = await Order.findAll({
      where: { createdAt: { [Op.gte]: yesterdayStart, [Op.lt]: todayStart } },
      attributes: ['totalAmount', 'status']
    });
    const yesterdayRevenue = yesterdayOrders
      .filter(o => ['delivered', 'shipped', 'confirmed', 'processing'].includes(o.status))
      .reduce((sum, o) => sum + parseFloat(o.totalAmount), 0);
    const yesterdayOrderCount = yesterdayOrders.length;

    // This week vs last week
    const thisWeekStart = new Date(todayStart);
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay() + 1); // Monday
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeekRevenue = await Order.sum('totalAmount', {
      where: {
        createdAt: { [Op.gte]: thisWeekStart },
        status: { [Op.in]: ['delivered', 'shipped', 'confirmed', 'processing'] }
      }
    }) || 0;

    const lastWeekRevenue = await Order.sum('totalAmount', {
      where: {
        createdAt: { [Op.gte]: lastWeekStart, [Op.lt]: thisWeekStart },
        status: { [Op.in]: ['delivered', 'shipped', 'confirmed', 'processing'] }
      }
    }) || 0;

    // Pending actions
    const pendingOrders = await Order.count({ where: { status: 'pending' } });
    const confirmedOrders = await Order.count({ where: { status: 'confirmed' } });
    const processingOrders = await Order.count({ where: { status: 'processing' } });

    // New users today
    const newUsersToday = await User.count({
      where: { role: 'client', createdAt: { [Op.gte]: todayStart } }
    });

    // Recent activity feed (last 20 events)
    const recentActivity = [];

    // Recent new orders (last 24h)
    const recentNewOrders = await Order.findAll({
      where: { createdAt: { [Op.gte]: yesterdayStart } },
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }],
      order: [['createdAt', 'DESC']],
      limit: 10,
      attributes: ['id', 'orderNumber', 'totalAmount', 'status', 'createdAt']
    });
    recentNewOrders.forEach(o => {
      recentActivity.push({
        type: 'new_order',
        message: `Nouvelle commande #${o.orderNumber} de ${o.user?.firstName || 'Client'} ${o.user?.lastName || ''} — ${parseFloat(o.totalAmount).toFixed(2)} DH`,
        timestamp: o.createdAt,
        orderId: o.id
      });
    });

    // Recent new users (last 24h)
    const recentNewUsers = await User.findAll({
      where: { role: 'client', createdAt: { [Op.gte]: yesterdayStart } },
      order: [['createdAt', 'DESC']],
      limit: 5,
      attributes: ['id', 'firstName', 'lastName', 'email', 'createdAt']
    });
    recentNewUsers.forEach(u => {
      recentActivity.push({
        type: 'new_user',
        message: `Nouvel utilisateur: ${u.firstName || ''} ${u.lastName || ''} (${u.email})`,
        timestamp: u.createdAt,
        userId: u.id
      });
    });

    // Low stock alerts
    const lowStockItems = await Product.findAll({
      where: { stockQuantity: { [Op.lte]: 5 }, isActive: true },
      attributes: ['id', 'name', 'stockQuantity'],
      limit: 5,
      order: [['stockQuantity', 'ASC']]
    });
    lowStockItems.forEach(p => {
      recentActivity.push({
        type: 'low_stock',
        message: `Stock faible: ${p.name} — ${p.stockQuantity} restant(s)`,
        timestamp: new Date(),
        productId: p.id
      });
    });

    // Sort activity by timestamp
    recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      data: {
        statistics: {
          totalUsers,
          totalProducts,
          totalCategories,
          totalOrders,
          totalRevenue: totalRevenue.toFixed(2),
          averageOrderValue: averageOrderValue.toFixed(2),
          conversionRate: parseFloat(conversionRate),
          orderGrowthRate: parseFloat(orderGrowthRate),
          lowStockProducts
        },
        today: {
          revenue: todayRevenue.toFixed(2),
          orders: todayOrderCount,
          yesterdayRevenue: yesterdayRevenue.toFixed(2),
          yesterdayOrders: yesterdayOrderCount,
          thisWeekRevenue: parseFloat(thisWeekRevenue).toFixed(2),
          lastWeekRevenue: parseFloat(lastWeekRevenue).toFixed(2),
          newUsers: newUsersToday
        },
        pendingActions: {
          pendingOrders,
          confirmedOrders,
          processingOrders,
          lowStockProducts
        },
        charts: {
          revenueTrend: last7Days.map(date => ({
            date,
            revenue: revenueByDate[date] || 0
          })),
          userRegistrations: last7Days.map(date => ({
            date,
            registrations: registrationsByDate[date] || 0
          })),
          orderStatusDistribution: orderStatusDistribution.map(item => ({
            status: item.status,
            count: parseInt(item.dataValues.count)
          }))
        },
        topProducts: topProducts.map(item => ({
          id: item.product.id,
          name: item.product.name,
          imageUrl: item.product.mainImage,
          price: item.product.price,
          totalSold: parseInt(item.dataValues.totalSold || 0),
          totalRevenue: parseFloat(item.dataValues.totalRevenue || 0).toFixed(2)
        })),
        recentOrders,
        recentActivity: recentActivity.slice(0, 15)
      }
    });

  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement du tableau de bord'
    });
  }
});

// ==================== PRODUCT MANAGEMENT ====================

// @route   GET /api/admin/products
// @desc    Get all products with pagination
// @access  Admin
router.get('/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const products = await Product.findAndCountAll({
      include: [{ model: Category, as: 'category' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: {
        products: products.rows,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(products.count / limit),
          totalItems: products.count,
          itemsPerPage: limit
        }
      }
    });

  } catch (error) {
    console.error('❌ Get products error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des produits'
    });
  }
});

// @route   POST /api/admin/products
// @desc    Create a new product
// @access  Admin
router.post('/products', auditLog('CREATE', 'product', null, (req) => ({ name: req.body.name })), [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('description').trim().isLength({ min: 10 }).withMessage('La description doit contenir au moins 10 caractères'),
  body('price').isFloat({ min: 0 }).withMessage('Le prix doit être un nombre positif'),
  body('stockQuantity').isInt({ min: 0 }).withMessage('Le stock doit être un nombre entier positif'),
  body('categoryId').isUUID().withMessage('Catégorie invalide'),
  body('imageUrl').optional().isString(),
  body('mainImage').optional().isString(),
  body('images').optional().isArray(),
  body('images.*').optional().isString()
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

    // Map imageUrl to mainImage for backward compatibility
    const data = { ...req.body };
    if (data.imageUrl && !data.mainImage) {
      data.mainImage = data.imageUrl;
    }

    const product = await Product.create(data);

    // Get product with category
    const productWithCategory = await Product.findByPk(product.id, {
      include: [{ model: Category, as: 'category' }]
    });

    res.status(201).json({
      success: true,
      message: 'Produit créé avec succès',
      data: productWithCategory
    });

  } catch (error) {
    console.error('❌ Create product error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du produit'
    });
  }
});

// @route   PUT /api/admin/products/:id
// @desc    Update a product
// @access  Admin
router.put('/products/:id', auditLog('UPDATE', 'product', req => req.params.id), [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('description').optional().trim().isLength({ min: 10 }).withMessage('La description doit contenir au moins 10 caractères'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Le prix doit être un nombre positif'),
  body('stockQuantity').optional().isInt({ min: 0 }).withMessage('Le stock doit être un nombre entier positif'),
  body('categoryId').optional().isUUID().withMessage('Catégorie invalide'),
  body('imageUrl').optional().isString(),
  body('mainImage').optional().isString(),
  body('images').optional().isArray(),
  body('images.*').optional().isString()
], async (req, res) => {
  try {
    console.log('🔍 Product update request body:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Product update validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Produit non trouvé'
      });
    }

    // Map imageUrl to mainImage for backward compatibility
    if (req.body.imageUrl && !req.body.mainImage) {
      req.body.mainImage = req.body.imageUrl;
    }

    console.log('🔍 Updating product with data:', req.body);

    // Clean up date fields - convert empty strings to null
    const updateData = { ...req.body };
    if (updateData.saleStartDate === '' || updateData.saleStartDate === 'Invalid date') {
      updateData.saleStartDate = null;
    }
    if (updateData.saleEndDate === '' || updateData.saleEndDate === 'Invalid date') {
      updateData.saleEndDate = null;
    }
    
    // Validate dates if they exist
    if (updateData.saleStartDate && isNaN(new Date(updateData.saleStartDate).getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Date de début de promotion invalide'
      });
    }
    if (updateData.saleEndDate && isNaN(new Date(updateData.saleEndDate).getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Date de fin de promotion invalide'
      });
    }
    
    await product.update(updateData);
    console.log('✅ Product updated successfully');

    // Get updated product with category
    const updatedProduct = await Product.findByPk(product.id, {
      include: [{ model: Category, as: 'category' }]
    });
    console.log('🔍 Updated product data:', updatedProduct.toJSON());

    res.json({
      success: true,
      message: 'Produit mis à jour avec succès',
      data: updatedProduct
    });

  } catch (error) {
    console.error('❌ Update product error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du produit'
    });
  }
});

// @route   DELETE /api/admin/products/:id
// @desc    Delete a product
// @access  Admin
router.delete('/products/:id', auditLog('DELETE', 'product', req => req.params.id), async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Produit non trouvé'
      });
    }

    // Clean up Firebase Storage images
    await deleteProductImages(product);

    await product.destroy();

    res.json({
      success: true,
      message: 'Produit supprimé avec succès'
    });

  } catch (error) {
    console.error('❌ Delete product error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du produit'
    });
  }
});

// ==================== CATEGORY MANAGEMENT ====================

// @route   GET /api/admin/categories
// @desc    Get all categories
// @access  Admin
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.findAll({
      include: [{ model: Product, as: 'products' }],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('❌ Get categories error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des catégories'
    });
  }
});

// @route   POST /api/admin/categories
// @desc    Create a new category
// @access  Admin
router.post('/categories', [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  body('description').optional().trim().custom((value) => {
    if (value && value.length > 0 && value.length < 5) {
      throw new Error('La description doit contenir au moins 5 caractères');
    }
    return true;
  }),
  body('imageUrl').optional().custom((value) => {
    if (value && value.trim() !== '') {
      // Check if it's a valid URL
      try {
        new URL(value);
        return true;
      } catch {
        throw new Error('URL d\'image invalide');
      }
    }
    return true;
  })
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

    const slug = req.body.slug || req.body.name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const category = await Category.create({ ...req.body, slug });

    res.status(201).json({
      success: true,
      message: 'Catégorie créée avec succès',
      data: category
    });

  } catch (error) {
    console.error('❌ Create category error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de la catégorie'
    });
  }
});

// @route   PUT /api/admin/categories/:id
// @desc    Update a category
// @access  Admin
router.put('/categories/:id', [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  body('description').optional().trim().custom((value) => {
    if (value && value.length > 0 && value.length < 5) {
      throw new Error('La description doit contenir au moins 5 caractères');
    }
    return true;
  }),
  body('imageUrl').optional().custom((value) => {
    if (value && value.trim() !== '') {
      // Check if it's a valid URL
      try {
        new URL(value);
        return true;
      } catch {
        throw new Error('URL d\'image invalide');
      }
    }
    return true;
  })
], async (req, res) => {
  try {
    console.log('🔍 Category update request body:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Category update validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Catégorie non trouvée'
      });
    }

    await category.update(req.body);

    res.json({
      success: true,
      message: 'Catégorie mise à jour avec succès',
      data: category
    });

  } catch (error) {
    console.error('❌ Update category error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour de la catégorie'
    });
  }
});

// @route   DELETE /api/admin/categories/:id
// @desc    Delete a category
// @access  Admin
router.delete('/categories/:id', async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Catégorie non trouvée'
      });
    }

    // Check if category has products
    const productCount = await Product.count({ where: { categoryId: req.params.id } });
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Impossible de supprimer la catégorie. Elle contient ${productCount} produit(s).`
      });
    }

    // Clean up Firebase Storage image
    await deleteCategoryImage(category);

    await category.destroy();

    res.json({
      success: true,
      message: 'Catégorie supprimée avec succès'
    });

  } catch (error) {
    console.error('❌ Delete category error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression de la catégorie'
    });
  }
});

// ==================== ORDER MANAGEMENT ====================

// @route   GET /api/admin/orders
// @desc    Get all orders with pagination and filtering
// @access  Admin
router.get('/orders', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Filter parameters
    const { status, search, startDate, endDate, minAmount, maxAmount } = req.query;
    
    // Build where clause
    const whereClause = {};
    if (status && status !== 'all') {
      whereClause.status = status;
    }
    if (startDate) {
      whereClause.createdAt = { [Op.gte]: new Date(startDate) };
    }
    if (endDate) {
      if (whereClause.createdAt) {
        whereClause.createdAt[Op.lte] = new Date(endDate);
      } else {
        whereClause.createdAt = { [Op.lte]: new Date(endDate) };
      }
    }
    if (minAmount) {
      whereClause.totalAmount = { [Op.gte]: parseFloat(minAmount) };
    }
    if (maxAmount) {
      if (whereClause.totalAmount) {
        whereClause.totalAmount[Op.lte] = parseFloat(maxAmount);
      } else {
        whereClause.totalAmount = { [Op.lte]: parseFloat(maxAmount) };
      }
    }

    const includeOptions = [
      { 
        model: User, 
        as: 'user', 
        attributes: ['firstName', 'lastName', 'email']
      },
      { 
        model: OrderItem, 
        as: 'orderItems', 
        include: [{ model: Product, as: 'product' }] 
      }
    ];

    // Add search filter to user include if search is provided
    if (search) {
      includeOptions[0].where = {
        [Op.or]: [
          { firstName: { [Op.like]: `%${search}%` } },
          { lastName: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } }
        ]
      };
    }

    const orders = await Order.findAndCountAll({
      where: whereClause,
      include: includeOptions,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: {
        orders: orders.rows,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(orders.count / limit),
          totalItems: orders.count,
          itemsPerPage: limit
        }
      }
    });

  } catch (error) {
    console.error('❌ Get orders error:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des commandes',
      details: error.message
    });
  }
});

// @route   GET /api/admin/orders/:id
// @desc    Get detailed order information
// @access  Admin
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id, {
      include: [
        { 
          model: User, 
          as: 'user', 
          attributes: ['firstName', 'lastName', 'email', 'phone', 'createdAt']
        },
        { 
          model: OrderItem, 
          as: 'orderItems', 
          include: [{ 
            model: Product, 
            as: 'product',
            attributes: ['id', 'name', 'price', 'imageUrl', 'sku']
          }] 
        },
        { model: ShippingAddress, as: 'shippingAddress' },
        { model: PaymentMethod, as: 'paymentMethod' }
      ]
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('❌ Get order details error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des détails de la commande'
    });
  }
});

// ==================== BULK ORDER OPERATIONS ====================

// @route   PUT /api/admin/orders/bulk/status
// @desc    Update status for multiple orders
// @access  Admin
// NOTE: must be registered BEFORE /orders/:id/status to avoid :id catching "bulk"
router.put('/orders/bulk/status', [
  body('orderIds').isArray({ min: 1 }).withMessage('Au moins une commande doit être sélectionnée'),
  body('orderIds.*').isUUID().withMessage('ID de commande invalide'),
  body('status').isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).withMessage('Statut invalide'),
  body('comment').optional().trim().isLength({ max: 500 }).withMessage('Le commentaire ne doit pas dépasser 500 caractères')
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

    const { orderIds, status, comment } = req.body;

    // Update all orders
    const updateResult = await Order.update(
      { 
        status,
        statusComment: comment || null,
        statusUpdatedAt: new Date()
      },
      { 
        where: { id: orderIds },
        returning: true
      }
    );

    // Get updated orders for response
    const updatedOrders = await Order.findAll({
      where: { id: orderIds },
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }]
    });

    res.json({
      success: true,
      message: `${updatedOrders.length} commande(s) mise(s) à jour avec succès`,
      data: {
        updatedCount: updatedOrders.length,
        orders: updatedOrders
      }
    });

  } catch (error) {
    console.error('❌ Bulk update order status error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour en masse des commandes'
    });
  }
});

// @route   PUT /api/admin/orders/:id/status
// @desc    Update order status with comments
// @access  Admin
router.put('/orders/:id/status', auditLog('UPDATE_STATUS', 'order', req => req.params.id, (req) => ({ newStatus: req.body.status })), [
  body('status').isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).withMessage('Statut invalide'),
  body('comment').optional().trim().isLength({ max: 500 }).withMessage('Le commentaire ne doit pas dépasser 500 caractères')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Statut invalide',
        details: errors.array()
      });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    const oldStatus = order.status;
    await order.update({
      status: req.body.status,
      statusComment: req.body.comment || null,
      statusUpdatedAt: new Date()
    });

    // TODO: Send email notification to customer about status change
    // await sendOrderStatusEmail(order.user.email, order, oldStatus, req.body.status);

    res.json({
      success: true,
      message: 'Statut de commande mis à jour avec succès',
      data: order
    });

  } catch (error) {
    console.error('❌ Update order status error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du statut'
    });
  }
});

// @route   POST /api/admin/orders/:id/refund
// @desc    Process full or partial refund for an order
// @access  Admin
router.post('/orders/:id/refund', auditLog('REFUND', 'order', req => req.params.id, (req) => ({ amount: req.body.amount, reason: req.body.reason })), [
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('Montant invalide'),
  body('reason').trim().isLength({ min: 1, max: 500 }).withMessage('La raison est requise (max 500 caractères)')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Données invalides', details: errors.array() });
    }

    const order = await Order.findByPk(req.params.id, {
      include: [{ model: OrderItem, as: 'orderItems', include: [{ model: Product, as: 'product' }] }]
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }

    if (['cancelled', 'refunded'].includes(order.status)) {
      return res.status(400).json({ success: false, error: 'Cette commande est déjà annulée ou remboursée' });
    }

    const refundAmount = req.body.amount || parseFloat(order.totalAmount);
    const isPartial = req.body.amount && req.body.amount < parseFloat(order.totalAmount);

    // Attempt Stripe refund if payment exists
    if (order.paymentTransactionId) {
      try {
        const paymentProcessor = require('../services/paymentProcessor');
        await paymentProcessor.refundPayment(order.paymentTransactionId, isPartial ? Math.round(refundAmount * 100) : undefined);
      } catch (stripeErr) {
        console.error('Stripe refund error:', stripeErr);
        return res.status(500).json({ success: false, error: 'Erreur lors du remboursement Stripe: ' + stripeErr.message });
      }
    }

    const oldStatus = order.status;
    await order.update({
      status: 'refunded',
      paymentStatus: isPartial ? 'partially_refunded' : 'refunded',
      statusComment: `Remboursement ${isPartial ? 'partiel' : 'total'} de ${refundAmount} DH — ${req.body.reason}`
    });

    // Restore stock
    for (const item of order.orderItems || []) {
      if (item.product) {
        await item.product.increment('stock', { by: item.quantity });
      }
    }

    // Log status change
    const OrderStatusLog = require('../models/OrderStatusLog');
    await OrderStatusLog.create({
      orderId: order.id,
      previousStatus: oldStatus,
      newStatus: 'refunded',
      changedBy: req.user.id,
      changedByRole: 'admin',
      reason: `${isPartial ? 'Remboursement partiel' : 'Remboursement total'}: ${req.body.reason}`,
      metadata: { refundAmount, isPartial }
    });

    res.json({
      success: true,
      message: `Remboursement ${isPartial ? 'partiel' : 'total'} de ${refundAmount} DH effectué`,
      data: { refundAmount, isPartial }
    });
  } catch (error) {
    console.error('Admin refund error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors du remboursement' });
  }
});

// @route   POST /api/admin/orders/bulk/export
// @desc    Export selected orders to CSV
// @access  Admin
router.post('/orders/bulk/export', [
  body('orderIds').isArray({ min: 1 }).withMessage('Au moins une commande doit être sélectionnée'),
  body('orderIds.*').isUUID().withMessage('ID de commande invalide')
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

    const { orderIds } = req.body;

    // Get orders with all related data
    const orders = await Order.findAll({
      where: { id: orderIds },
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] },
        { model: OrderItem, as: 'orderItems', include: [{ model: Product, as: 'product' }] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Generate CSV data
    const csvData = orders.map(order => ({
      'Order ID': order.id,
      'Order Number': order.orderNumber,
      'Customer Name': `${order.user?.firstName || ''} ${order.user?.lastName || ''}`,
      'Customer Email': order.user?.email || '',
      'Status': order.status,
      'Total Amount': order.totalAmount,
      'Items Count': order.orderItems?.length || 0,
      'Created Date': new Date(order.createdAt).toLocaleDateString('fr-FR'),
      'Updated Date': new Date(order.updatedAt).toLocaleDateString('fr-FR')
    }));

    res.json({
      success: true,
      message: `${orders.length} commande(s) exportée(s)`,
      data: {
        csvData,
        orderCount: orders.length
      }
    });

  } catch (error) {
    console.error('❌ Bulk export orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'export des commandes'
    });
  }
});

// @route   POST /api/admin/orders/bulk/notify
// @desc    Send bulk email notifications to customers
// @access  Admin
router.post('/orders/bulk/notify', [
  body('orderIds').isArray({ min: 1 }).withMessage('Au moins une commande doit être sélectionnée'),
  body('orderIds.*').isUUID().withMessage('ID de commande invalide'),
  body('notificationType').isIn(['status_update', 'shipping_update', 'custom']).withMessage('Type de notification invalide'),
  body('customMessage').optional().trim().isLength({ max: 1000 }).withMessage('Le message ne doit pas dépasser 1000 caractères')
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

    const { orderIds, notificationType, customMessage } = req.body;

    // Get orders with customer information
    const orders = await Order.findAll({
      where: { id: orderIds },
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }]
    });

    // Send notifications (placeholder for now)
    const notificationResults = orders.map(order => ({
      orderId: order.id,
      customerEmail: order.user?.email,
      status: 'sent', // In real implementation, this would be the actual email sending result
      message: `Notification ${notificationType} sent to ${order.user?.email}`
    }));

    res.json({
      success: true,
      message: `${orders.length} notification(s) envoyée(s)`,
      data: {
        sentCount: orders.length,
        results: notificationResults
      }
    });

  } catch (error) {
    console.error('❌ Bulk notify orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi des notifications'
    });
  }
});

// ==================== USER MANAGEMENT ====================

// @route   GET /api/admin/users
// @desc    Get all users with pagination
// @access  Admin
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const users = await User.findAndCountAll({
      // Get all users (both clients and admins)
      attributes: { exclude: ['password', 'emailVerificationToken', 'passwordResetToken'] },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: {
        users: users.rows,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(users.count / limit),
          totalItems: users.count,
          itemsPerPage: limit
        }
      }
    });

  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des utilisateurs'
    });
  }
});

// @route   PUT /api/admin/users/:id/status
// @desc    Toggle user active status
// @access  Admin
router.put('/users/:id/status', auditLog('UPDATE_STATUS', 'user', req => req.params.id, (req) => ({ isActive: req.body.isActive })), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Prevent deactivating admin accounts
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Impossible de désactiver un compte administrateur'
      });
    }

    await user.update({ isActive: !user.isActive });

    res.json({
      success: true,
      message: `Utilisateur ${user.isActive ? 'activé' : 'désactivé'} avec succès`,
      data: { isActive: user.isActive }
    });

  } catch (error) {
    console.error('❌ Toggle user status error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la modification du statut utilisateur'
    });
  }
});

// @route   PUT /api/admin/users/:id/role
// @desc    Change user role (client/admin)
// @access  Admin
router.put('/users/:id/role', auditLog('UPDATE_ROLE', 'user', req => req.params.id, (req) => ({ newRole: req.body.role })), [
  body('role').isIn(['client', 'admin']).withMessage('Rôle invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Rôle invalide',
        details: errors.array()
      });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Prevent changing your own role
    if (user.id === req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Impossible de modifier votre propre rôle'
      });
    }

    const oldRole = user.role;
    await user.update({ role: req.body.role });

    res.json({
      success: true,
      message: `Rôle utilisateur changé de ${oldRole} à ${req.body.role} avec succès`,
      data: { role: req.body.role }
    });

  } catch (error) {
    console.error('❌ Change user role error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du changement de rôle utilisateur'
    });
  }
});

// ==================== INVENTORY MANAGEMENT ====================

// @route   GET /api/admin/inventory/alerts
// @desc    Get low stock alerts
// @access  Admin
router.get('/inventory/alerts', async (req, res) => {
  try {
    const lowStockProducts = await inventoryService.getLowStockProducts();
    const stats = await inventoryService.getInventoryStats();

    res.json({
      success: true,
      data: {
        lowStockProducts,
        stats
      }
    });

  } catch (error) {
    console.error('❌ Get inventory alerts error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des alertes d\'inventaire'
    });
  }
});

// @route   GET /api/admin/inventory/history/:productId
// @desc    Get stock history for a product
// @access  Admin
router.get('/inventory/history/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const history = await inventoryService.getStockHistory(productId, limit);

    res.json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('❌ Get stock history error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de l\'historique des stocks'
    });
  }
});

// @route   POST /api/admin/inventory/update-stock
// @desc    Update product stock
// @access  Admin
router.post('/inventory/update-stock', [
  body('productId').isUUID().withMessage('ID de produit invalide'),
  body('quantity').isInt().withMessage('Quantité invalide'),
  body('changeType').isIn(['in', 'out', 'adjustment']).withMessage('Type de changement invalide'),
  body('reason').trim().isLength({ min: 1 }).withMessage('Raison requise'),
  body('notes').optional().trim()
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

    const { productId, quantity, changeType, reason, notes } = req.body;
    const performedBy = req.user.id;

    const result = await inventoryService.updateStock(
      productId,
      quantity,
      changeType,
      reason,
      null,
      'manual',
      notes,
      performedBy
    );

    res.json({
      success: true,
      message: 'Stock mis à jour avec succès',
      data: result
    });

  } catch (error) {
    console.error('❌ Update stock error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors de la mise à jour du stock'
    });
  }
});

// @route   POST /api/admin/inventory/bulk-update
// @desc    Bulk update stock levels
// @access  Admin
router.post('/inventory/bulk-update', [
  body('updates').isArray().withMessage('Mises à jour invalides'),
  body('updates.*.productId').isUUID().withMessage('ID de produit invalide'),
  body('updates.*.quantity').isInt().withMessage('Quantité invalide'),
  body('updates.*.changeType').isIn(['in', 'out', 'adjustment']).withMessage('Type de changement invalide'),
  body('updates.*.reason').trim().isLength({ min: 1 }).withMessage('Raison requise')
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

    const { updates } = req.body;
    const performedBy = req.user.id;

    const results = await inventoryService.bulkUpdateStock(updates, performedBy);

    res.json({
      success: true,
      message: 'Mise à jour en masse terminée',
      data: results
    });

  } catch (error) {
    console.error('❌ Bulk update stock error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour en masse'
    });
  }
});

// @route   PUT /api/admin/inventory/reorder-point/:productId
// @desc    Set reorder point for a product
// @access  Admin
router.put('/inventory/reorder-point/:productId', [
  body('reorderPoint').isInt({ min: 0 }).withMessage('Point de réapprovisionnement invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Point de réapprovisionnement invalide',
        details: errors.array()
      });
    }

    const { productId } = req.params;
    const { reorderPoint } = req.body;

    const result = await inventoryService.setReorderPoint(productId, reorderPoint);

    res.json({
      success: true,
      message: 'Point de réapprovisionnement mis à jour avec succès',
      data: result
    });

  } catch (error) {
    console.error('❌ Set reorder point error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors de la mise à jour du point de réapprovisionnement'
    });
  }
});

// ==================== ORDER NOTES ====================

const OrderNote = require('../models/OrderNote');

// @route   GET /api/admin/orders/:id/notes
// @desc    Get all notes for an order
// @access  Admin
router.get('/orders/:id/notes', async (req, res) => {
  try {
    const notes = await OrderNote.findAll({
      where: { orderId: req.params.id },
      include: [{ model: User, as: 'author', attributes: ['firstName', 'lastName'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: notes });
  } catch (error) {
    console.error('Get order notes error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des notes' });
  }
});

// @route   POST /api/admin/orders/:id/notes
// @desc    Add a note to an order
// @access  Admin
router.post('/orders/:id/notes', [
  body('content').trim().isLength({ min: 1, max: 2000 }).withMessage('Contenu requis (max 2000 caractères)'),
  body('isInternal').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Données invalides', details: errors.array() });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }

    const note = await OrderNote.create({
      orderId: req.params.id,
      userId: req.user.id,
      content: req.body.content,
      isInternal: req.body.isInternal !== false
    });

    const noteWithAuthor = await OrderNote.findByPk(note.id, {
      include: [{ model: User, as: 'author', attributes: ['firstName', 'lastName'] }]
    });

    res.status(201).json({ success: true, data: noteWithAuthor });
  } catch (error) {
    console.error('Create order note error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la création de la note' });
  }
});

// @route   DELETE /api/admin/orders/:orderId/notes/:noteId
// @desc    Delete an order note
// @access  Admin
router.delete('/orders/:orderId/notes/:noteId', async (req, res) => {
  try {
    const note = await OrderNote.findOne({
      where: { id: req.params.noteId, orderId: req.params.orderId }
    });
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note non trouvée' });
    }
    await note.destroy();
    res.json({ success: true, message: 'Note supprimée' });
  } catch (error) {
    console.error('Delete order note error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la suppression de la note' });
  }
});

// ==================== MEMBERSHIP MANAGEMENT ====================

const MembershipTransaction = require('../models/MembershipTransaction');
const membershipService = require('../services/membershipService');

// GET /admin/memberships/stats — Dashboard stats
router.get('/memberships/stats', async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [activeCount, cancelledCount, expiredCount, newThisMonth, revenue] = await Promise.all([
      User.count({ where: { membershipStatus: 'active' } }),
      User.count({ where: { membershipStatus: 'cancelled' } }),
      User.count({ where: { membershipStatus: 'expired' } }),
      User.count({
        where: {
          membershipStatus: { [Op.in]: ['active', 'cancelled'] },
          membershipActivatedAt: { [Op.gte]: thirtyDaysAgo }
        }
      }),
      MembershipTransaction.sum('amount', {
        where: {
          type: { [Op.in]: ['subscription', 'renewal'] },
          status: 'succeeded',
          createdAt: { [Op.gte]: thirtyDaysAgo }
        }
      })
    ]);

    const totalMembers = activeCount + cancelledCount;
    const churnRate = totalMembers > 0 ? Math.round((cancelledCount / totalMembers) * 100) : 0;

    res.json({
      success: true,
      data: {
        active: activeCount,
        cancelled: cancelledCount,
        expired: expiredCount,
        newThisMonth,
        monthlyRevenue: revenue || 0,
        churnRate
      }
    });
  } catch (error) {
    console.error('Admin membership stats error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des statistiques' });
  }
});

// GET /admin/memberships/users — Paginated member list
router.get('/memberships/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status && status !== 'all') {
      where.membershipStatus = status;
    } else {
      where.membershipStatus = { [Op.ne]: 'none' };
    }

    if (search) {
      where[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: [
        'id', 'firstName', 'lastName', 'email',
        'membershipStatus', 'membershipPlan', 'membershipActivatedAt',
        'membershipExpiresAt', 'membershipAutoRenew', 'membershipPrice',
        'membershipCurrency', 'loyaltyPoints', 'loyaltyTier'
      ],
      order: [['membershipActivatedAt', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: {
        members: rows,
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Admin membership users error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des membres' });
  }
});

// PUT /admin/memberships/users/:userId — Manually manage a user's membership
router.put('/memberships/users/:userId', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    const { action, daysToExtend } = req.body;

    switch (action) {
      case 'activate': {
        const activationDate = new Date();
        const expirationDate = new Date(activationDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        await user.update({
          membershipStatus: 'active',
          membershipPlan: user.membershipPlan || 'umod-prime-monthly',
          membershipActivatedAt: activationDate,
          membershipExpiresAt: expirationDate,
          membershipAutoRenew: false
        });
        await MembershipTransaction.create({
          userId: user.id,
          type: 'subscription',
          amount: 0,
          currency: 'MAD',
          status: 'succeeded',
          planId: user.membershipPlan,
          billingPeriodStart: activationDate,
          billingPeriodEnd: expirationDate,
          metadata: { adminAction: true, adminId: req.user?.id || req.firebaseUser?.uid }
        });
        break;
      }

      case 'extend': {
        const days = parseInt(daysToExtend) || 30;
        const currentExpiry = user.membershipExpiresAt ? new Date(user.membershipExpiresAt) : new Date();
        const newExpiry = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
        await user.update({
          membershipStatus: 'active',
          membershipExpiresAt: newExpiry
        });
        await MembershipTransaction.create({
          userId: user.id,
          type: 'renewal',
          amount: 0,
          currency: 'MAD',
          status: 'succeeded',
          planId: user.membershipPlan,
          billingPeriodStart: new Date(),
          billingPeriodEnd: newExpiry,
          metadata: { adminAction: true, adminId: req.user?.id || req.firebaseUser?.uid, daysExtended: days }
        });
        break;
      }

      case 'cancel': {
        await membershipService.cancel(user);
        break;
      }

      case 'expire': {
        await membershipService.expireMembership(user);
        break;
      }

      default:
        return res.status(400).json({ success: false, error: 'Action invalide' });
    }

    await user.reload();
    res.json({
      success: true,
      message: `Action "${action}" effectuée avec succès`,
      data: {
        membershipStatus: user.membershipStatus,
        membershipExpiresAt: user.membershipExpiresAt,
        membershipAutoRenew: user.membershipAutoRenew
      }
    });
  } catch (error) {
    console.error('Admin membership action error:', error);
    res.status(500).json({ success: false, error: error.message || 'Erreur lors de l\'action' });
  }
});

// GET /admin/memberships/transactions — Paginated transaction log
router.get('/memberships/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 30, type, userId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (type) where.type = type;
    if (userId) where.userId = userId;

    const { count, rows } = await MembershipTransaction.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'email']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: {
        transactions: rows,
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Admin membership transactions error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des transactions' });
  }
});

// ============================================
// AUDIT LOG ENDPOINTS
// ============================================

router.get('/audit-logs', async (req, res) => {
  try {
    const { limit = 50, offset = 0, action, resource, adminId } = req.query;
    const AdminAuditLog = require('../models/AdminAuditLog');

    const where = {};
    if (action) where.action = action;
    if (resource) where.resource = resource;
    if (adminId) where.adminId = adminId;

    const { count, rows } = await AdminAuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'admin', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des logs' });
  }
});

module.exports = router;