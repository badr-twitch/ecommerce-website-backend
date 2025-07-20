const express = require('express');
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const Order = require('../models/Order');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users (admin only)
// @access  Private (Admin)
router.get('/', adminAuth, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('role').optional().isIn(['client', 'admin']),
  query('isActive').optional().isBoolean()
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
      limit = 20,
      search,
      role,
      isActive
    } = req.query;

    const whereClause = {};

    if (search) {
      whereClause[require('sequelize').Op.or] = [
        { firstName: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { lastName: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { email: { [require('sequelize').Op.iLike]: `%${search}%` } }
      ];
    }

    if (role) {
      whereClause.role = role;
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    const offset = (page - 1) * limit;

    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['password', 'emailVerificationToken', 'passwordResetToken', 'passwordResetExpires'] },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération des utilisateurs' 
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID (admin or own profile)
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only access their own profile unless they're admin
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ 
        error: 'Accès refusé' 
      });
    }

    const user = await User.findByPk(id, {
      attributes: { exclude: ['password', 'emailVerificationToken', 'passwordResetToken', 'passwordResetExpires'] }
    });

    if (!user) {
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé' 
      });
    }

    res.json({ user });

  } catch (error) {
    console.error('Erreur lors de la récupération de l\'utilisateur:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération de l\'utilisateur' 
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user (admin or own profile)
// @access  Private
router.put('/:id', auth, [
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }),
  body('lastName').optional().trim().isLength({ min: 2, max: 50 }),
  body('phone').optional().isMobilePhone('fr-FR'),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('postalCode').optional().trim(),
  body('isActive').optional().isBoolean(),
  body('role').optional().isIn(['client', 'admin'])
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

    // Users can only update their own profile unless they're admin
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ 
        error: 'Accès refusé' 
      });
    }

    // Only admins can change role and isActive
    if (req.user.role !== 'admin') {
      delete req.body.role;
      delete req.body.isActive;
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé' 
      });
    }

    await user.update(req.body);

    res.json({
      message: 'Utilisateur mis à jour avec succès',
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'utilisateur:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la mise à jour de l\'utilisateur' 
    });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user (admin only)
// @access  Private (Admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé' 
      });
    }

    // Check if user has orders
    const orderCount = await Order.count({ where: { userId: id } });
    if (orderCount > 0) {
      return res.status(400).json({ 
        error: 'Impossible de supprimer un utilisateur qui a des commandes' 
      });
    }

    // Soft delete
    await user.update({ isActive: false });

    res.json({
      message: 'Utilisateur supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la suppression de l\'utilisateur:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la suppression de l\'utilisateur' 
    });
  }
});

// @route   GET /api/users/:id/orders
// @desc    Get user orders (admin or own orders)
// @access  Private
router.get('/:id/orders', auth, [
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

    const { id } = req.params;
    const {
      page = 1,
      limit = 10,
      status
    } = req.query;

    // Users can only access their own orders unless they're admin
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ 
        error: 'Accès refusé' 
      });
    }

    const whereClause = { userId: id };
    if (status) {
      whereClause.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows: orders } = await Order.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: require('../models/OrderItem'),
          as: 'orderItems',
          include: [
            {
              model: require('../models/Product'),
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
    console.error('Erreur lors de la récupération des commandes de l\'utilisateur:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération des commandes de l\'utilisateur' 
    });
  }
});

// @route   POST /api/users/:id/verify-email
// @desc    Verify user email
// @access  Public
router.post('/:id/verify-email', [
  body('token').notEmpty().withMessage('Token requis')
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
    const { token } = req.body;

    const user = await User.findOne({
      where: {
        id,
        emailVerificationToken: token
      }
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Token de vérification invalide' 
      });
    }

    await user.update({
      emailVerified: true,
      emailVerificationToken: null
    });

    res.json({
      message: 'Email vérifié avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la vérification de l\'email:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la vérification de l\'email' 
    });
  }
});

module.exports = router; 