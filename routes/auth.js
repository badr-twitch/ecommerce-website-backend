const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

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
// @desc    Register a new user
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
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const { firstName, lastName, email, password, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ 
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
      message: 'Compte créé avec succès',
      token,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la création du compte' 
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ 
        error: 'Email ou mot de passe incorrect' 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ 
        error: 'Compte désactivé' 
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: 'Email ou mot de passe incorrect' 
      });
    }

    // Update last login
    await user.update({ lastLogin: new Date() });

    // Generate token
    const token = generateToken(user.id);

    res.json({
      message: 'Connexion réussie',
      token,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la connexion' 
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé' 
      });
    }

    res.json({ user: user.toJSON() });

  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération du profil' 
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, [
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
      return res.status(400).json({ 
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé' 
      });
    }

    // Update user
    await user.update(req.body);

    res.json({
      message: 'Profil mis à jour avec succès',
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la mise à jour du profil' 
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', auth, [
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis'),
  body('newPassword').isLength({ min: 6 }).withMessage('Le nouveau mot de passe doit contenir au moins 6 caractères')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé' 
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ 
        error: 'Mot de passe actuel incorrect' 
      });
    }

    // Update password
    await user.update({ password: newPassword });

    res.json({
      message: 'Mot de passe modifié avec succès'
    });

  } catch (error) {
    console.error('Erreur lors du changement de mot de passe:', error);
    res.status(500).json({ 
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
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const { email } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Don't reveal if user exists or not
      return res.json({
        message: 'Si un compte avec cet email existe, un email de réinitialisation a été envoyé'
      });
    }

    // Generate reset token
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await user.update({
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires
    });

    // TODO: Send email with reset link
    // For now, just return success
    res.json({
      message: 'Si un compte avec cet email existe, un email de réinitialisation a été envoyé'
    });

  } catch (error) {
    console.error('Erreur lors de la demande de réinitialisation:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la demande de réinitialisation' 
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
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const { token, newPassword } = req.body;

    const user = await User.findOne({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { [require('sequelize').Op.gt]: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ 
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
      message: 'Mot de passe réinitialisé avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la réinitialisation du mot de passe' 
    });
  }
});

module.exports = router; 