const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const firebaseAuth = require('../middleware/firebaseAuth');
const User = require('../models/User');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// @route   POST /api/auth/register
// @desc    Register a new user (traditional)
// @access  Public
router.post('/register', [
  body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  body('phone').optional().isMobilePhone('fr-FR').withMessage('Numéro de téléphone invalide')
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

    const { firstName, lastName, email, password, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'Un compte avec cet email existe déjà' 
      });
    }

    // Create new user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone
    });

    // Generate token
    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      token,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la création du compte' 
    });
  }
});

// @route   POST /api/auth/register-firebase
// @desc    Register a new user from Firebase
// @access  Private (Firebase token required)
router.post('/register-firebase', firebaseAuth, async (req, res) => {
  try {
    console.log('🔍 Register Firebase - Route reached');
    console.log('🔍 Register Firebase - Request body:', req.body);
    console.log('🔍 Register Firebase - Request headers:', req.headers);
    console.log('🔍 Register Firebase - Content-Type:', req.headers['content-type']);
    console.log('🔍 Register Firebase - Firebase user:', req.firebaseUser);
    
    const { firstName, lastName, email, emailVerified, photoURL } = req.body;
    const firebaseUid = req.firebaseUser.uid;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      where: { firebaseUid } 
    });

    if (existingUser) {
      console.log('🔍 Register Firebase - User already exists');
      return res.status(200).json({
        success: true,
        message: 'Utilisateur déjà existant',
        user: existingUser.toJSON()
      });
    }

    console.log('🔍 Register Firebase - Creating new user...');
    // Create new user
    const user = await User.create({
      firebaseUid,
      firstName: firstName || req.firebaseUser.name?.split(' ')[0] || '',
      lastName: lastName || req.firebaseUser.name?.split(' ').slice(1).join(' ') || '',
      email,
      emailVerified: emailVerified || false,
      photoURL,
      displayName: `${firstName || ''} ${lastName || ''}`.trim()
    });

    console.log('🔍 Register Firebase - User created successfully:', user.id);
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      user: user.toJSON()
    });

  } catch (error) {
    console.error('❌ Erreur lors de l\'inscription Firebase:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la création du compte' 
    });
  }
});

// @route   GET /api/auth/user
// @desc    Get current user from Firebase
// @access  Private (Firebase token required)
router.get('/user', firebaseAuth, async (req, res) => {
  try {
    console.log('🔍 Get User - Route reached');
    console.log('🔍 Get User - Firebase UID:', req.firebaseUser.uid);
    
    const user = await User.findOne({ 
      where: { firebaseUid: req.firebaseUser.uid } 
    });

    if (!user) {
      console.log('🔍 Get User - User not found in database');
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé dans la base de données'
      });
    }

    console.log('🔍 Get User - User found:', user.id);
    res.json({
      success: true,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération de l\'utilisateur:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la récupération de l\'utilisateur' 
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user (traditional)
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis')
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

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'Email ou mot de passe incorrect' 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ 
        success: false,
        error: 'Compte désactivé' 
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        error: 'Email ou mot de passe incorrect' 
      });
    }

    // Update last login
    await user.update({ lastLogin: new Date() });

    // Generate token
    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Connexion réussie',
      token,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la connexion' 
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user (traditional)
// @access  Private
router.get('/me', firebaseAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.firebaseUser.uid);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'Utilisateur non trouvé' 
      });
    }

    res.json({ 
      success: true,
      user: user.toJSON() 
    });

  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la récupération du profil' 
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile (Firebase)
// @access  Private
router.put('/profile', firebaseAuth, [
  body('displayName').optional().trim().custom((value) => {
    if (value !== undefined && value !== null && value !== '' && value.length < 2) {
      throw new Error('Le nom d\'affichage doit contenir au moins 2 caractères');
    }
    return true;
  }),
  body('photoURL').optional().trim(),
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }),
  body('lastName').optional().trim().isLength({ min: 2, max: 50 }),
  body('phone').optional().isMobilePhone('fr-FR'),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('postalCode').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Profile Update - Validation errors:', errors.array());
      console.log('❌ Profile Update - Request body:', req.body);
      return res.status(400).json({ 
        success: false,
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    // Find user by Firebase UID
    const user = await User.findOne({ 
      where: { firebaseUid: req.firebaseUser.uid } 
    });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'Utilisateur non trouvé' 
      });
    }

    // Update user
    await user.update(req.body);

    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la mise à jour du profil' 
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password (Firebase handles this)
// @access  Private
router.post('/change-password', firebaseAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Changement de mot de passe géré par Firebase',
      note: 'Utilisez l\'interface Firebase pour changer votre mot de passe'
    });
  } catch (error) {
    console.error('Erreur lors du changement de mot de passe:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors du changement de mot de passe' 
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Email invalide')
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

    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'Aucun compte trouvé avec cette adresse email' 
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    // Save reset token to user
    await user.update({
      passwordResetToken: resetToken,
      passwordResetExpires: new Date(Date.now() + 3600000) // 1 hour
    });

    // TODO: Send email with reset link
    // For now, just return success
    res.json({
      success: true,
      message: 'Email de réinitialisation envoyé'
    });

  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email de réinitialisation:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de l\'envoi de l\'email de réinitialisation' 
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token requis'),
  body('newPassword').isLength({ min: 6 }).withMessage('Le nouveau mot de passe doit contenir au moins 6 caractères')
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

    const { token, newPassword } = req.body;

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const user = await User.findOne({
      where: {
        id: decoded.userId,
        passwordResetToken: token,
        passwordResetExpires: { [require('sequelize').Op.gt]: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false,
        error: 'Token invalide ou expiré' 
      });
    }

    // Update password and clear reset token
    await user.update({
      password: newPassword,
      passwordResetToken: null,
      passwordResetExpires: null
    });

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la réinitialisation du mot de passe' 
    });
  }
});

// @route   GET /api/auth/debug/users
// @desc    Get all users (debug endpoint)
// @access  Private
router.get('/debug/users', async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'firebaseUid', 'createdAt']
    });
    
    res.json({
      success: true,
      count: users.length,
      users: users.map(user => user.toJSON())
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la récupération des utilisateurs' 
    });
  }
});

// @route   DELETE /api/auth/delete-account
// @desc    Delete user account and all related data
// @access  Private (Firebase token required)
router.delete('/delete-account', firebaseAuth, async (req, res) => {
  try {
    console.log('🔍 Delete Account - Route reached');
    console.log('🔍 Delete Account - Firebase user:', req.firebaseUser);
    
    const firebaseUid = req.firebaseUser.uid;

    // Find user in database
    const user = await User.findOne({ 
      where: { firebaseUid } 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Import related models for cleanup
    const PaymentMethod = require('../models/PaymentMethod');
    const ShippingAddress = require('../models/ShippingAddress');
    const Order = require('../models/Order');
    const OrderItem = require('../models/OrderItem');

    // Start transaction for data consistency
    const transaction = await require('../config/database').transaction();

    try {
      // Delete related data in order (respecting foreign key constraints)
      
      // 1. Delete order items first
      await OrderItem.destroy({
        where: { orderId: { [require('sequelize').Op.in]: 
          await Order.findAll({ 
            where: { userId: user.id },
            attributes: ['id'],
            transaction 
          }).then(orders => orders.map(o => o.id))
        }},
        transaction
      });

      // 2. Delete orders
      await Order.destroy({
        where: { userId: user.id },
        transaction
      });

      // 3. Delete payment methods
      await PaymentMethod.destroy({
        where: { userId: user.id },
        transaction
      });

      // 4. Delete shipping addresses
      await ShippingAddress.destroy({
        where: { userId: user.id },
        transaction
      });

      // 5. Finally delete the user
      await user.destroy({ transaction });

      // Commit transaction
      await transaction.commit();

      console.log('✅ User account and all related data deleted successfully');

      res.json({
        success: true,
        message: 'Compte et toutes les données associées supprimés avec succès'
      });

    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Error deleting user account:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du compte'
    });
  }
});

// @route   POST /api/auth/export-data
// @desc    Export user data before deletion
// @access  Private (Firebase token required)
router.post('/export-data', firebaseAuth, async (req, res) => {
  try {
    console.log('🔍 Export Data - Route reached');
    
    const firebaseUid = req.firebaseUser.uid;

    // Find user in database
    const user = await User.findOne({ 
      where: { firebaseUid } 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Import related models
    const PaymentMethod = require('../models/PaymentMethod');
    const ShippingAddress = require('../models/ShippingAddress');
    const Order = require('../models/Order');
    const OrderItem = require('../models/OrderItem');

    // Gather all user data
    const userData = {
      profile: user.toJSON(),
      paymentMethods: await PaymentMethod.findAll({ where: { userId: user.id } }),
      shippingAddresses: await ShippingAddress.findAll({ where: { userId: user.id } }),
      orders: await Order.findAll({ 
        where: { userId: user.id },
        include: [{ model: OrderItem }]
      })
    };

    res.json({
      success: true,
      message: 'Données exportées avec succès',
      data: userData
    });

  } catch (error) {
    console.error('❌ Error exporting user data:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'exportation des données'
    });
  }
});

module.exports = router; 