const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Import models
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');

// Import middleware
const firebaseAuth = require('../middleware/firebaseAuth');
const adminAuth = require('../middleware/adminAuth');

// Apply Firebase auth and admin auth to all admin routes
router.use(firebaseAuth, adminAuth);

// ==================== DASHBOARD ====================

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Admin
router.get('/dashboard', async (req, res) => {
  try {
    // Get statistics
    const totalUsers = await User.count({ where: { role: 'client' } });
    const totalProducts = await Product.count();
    const totalCategories = await Category.count();
    const totalOrders = await Order.count();
    
    // Get recent orders
    const recentOrders = await Order.findAll({
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] },
        { model: OrderItem, as: 'orderItems', include: [{ model: Product, as: 'product' }] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    // Get top selling products
    const topProducts = await Product.findAll({
      include: [
        { model: OrderItem, as: 'orderItems' }
      ],
      order: [[{ model: OrderItem, as: 'orderItems' }, 'quantity', 'DESC']],
      limit: 5
    });

    res.json({
      success: true,
      data: {
        statistics: {
          totalUsers,
          totalProducts,
          totalCategories,
          totalOrders
        },
        recentOrders,
        topProducts
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
router.post('/products', [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('description').trim().isLength({ min: 10 }).withMessage('La description doit contenir au moins 10 caractères'),
  body('price').isFloat({ min: 0 }).withMessage('Le prix doit être un nombre positif'),
  body('stock').isInt({ min: 0 }).withMessage('Le stock doit être un nombre entier positif'),
  body('categoryId').isUUID().withMessage('Catégorie invalide'),
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

    const product = await Product.create(req.body);

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
router.put('/products/:id', [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('description').optional().trim().isLength({ min: 10 }).withMessage('La description doit contenir au moins 10 caractères'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Le prix doit être un nombre positif'),
  body('stock').optional().isInt({ min: 0 }).withMessage('Le stock doit être un nombre entier positif'),
  body('categoryId').optional().isUUID().withMessage('Catégorie invalide'),
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

    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Produit non trouvé'
      });
    }

    await product.update(req.body);

    // Get updated product with category
    const updatedProduct = await Product.findByPk(product.id, {
      include: [{ model: Category, as: 'category' }]
    });

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
router.delete('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Produit non trouvé'
      });
    }

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

    const category = await Category.create(req.body);

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
// @desc    Get all orders with pagination
// @access  Admin
router.get('/orders', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const orders = await Order.findAndCountAll({
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] },
        { model: OrderItem, as: 'orderItems', include: [{ model: Product, as: 'product' }] }
      ],
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
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des commandes'
    });
  }
});

// @route   PUT /api/admin/orders/:id/status
// @desc    Update order status
// @access  Admin
router.put('/orders/:id/status', [
  body('status').isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Statut invalide')
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

    await order.update({ status: req.body.status });

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
router.put('/users/:id/status', async (req, res) => {
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
router.put('/users/:id/role', [
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

module.exports = router; 