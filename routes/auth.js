const express = require('express');
const { body, validationResult } = require('express-validator');
const admin = require('firebase-admin');
const firebaseAuth = require('../middleware/firebaseAuth');
const User = require('../models/User');
const VerificationCode = require('../models/VerificationCode');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const { deleteImageByURL } = require('../services/storageCleanupService');
const { Op } = require('sequelize');
const crypto = require('crypto');

const router = express.Router();
const { authLimiter, writeLimiter, loginLimiter, accountCreationLimiter } = require('../middleware/rateLimiter');

// Notification service (will be set by server.js)
let notificationService;
const setNotificationService = (service) => {
  notificationService = service;
};

const { rateLimit } = require('express-rate-limit');

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Veuillez réessayer dans 15 minutes.' }
});

const verificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Veuillez réessayer dans 1 heure.' }
});

// @route   GET /api/auth/user
// @desc    Get user by Firebase UID
// @access  Private
router.get('/user', firebaseAuth, async (req, res) => {
  try {
    const firebaseUid = req.firebaseUser.uid;
    const user = await User.findOne({ where: { firebaseUid } });
    
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
    console.error('❌ Error getting user:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de l\'utilisateur'
    });
  }
});

// @route   POST /api/auth/register-firebase
// @desc    Register user from Firebase (sync with database)
// @access  Private (Firebase authenticated)
router.post('/register-firebase', accountCreationLimiter, firebaseAuth, [
  body('clientType').optional({ nullable: true }).isIn(['particulier', 'professionnel']).withMessage('Type de client invalide'),
  body('companyName').optional({ nullable: true }).trim(),
  body('siret').optional({ nullable: true }).trim().isLength({ min: 14, max: 14 }).withMessage('Le SIRET doit contenir 14 chiffres'),
  body('vatNumber').optional({ nullable: true }).trim(),
  body('billingAddress').optional({ nullable: true }).trim(),
  body('billingCity').optional({ nullable: true }).trim(),
  body('billingPostalCode').optional({ nullable: true }).trim(),
  body('billingCountry').optional({ nullable: true }).trim()
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

    const firebaseUid = req.firebaseUser.uid;
    const { 
      email, 
      firstName, 
      lastName, 
      photoURL, 
      emailVerified, 
      phone,
      clientType = 'particulier',
      companyName,
      siret,
      vatNumber,
      billingAddress,
      billingCity,
      billingPostalCode,
      billingCountry
    } = req.body;

    // Validate professional fields if clientType is professionnel
    if (clientType === 'professionnel') {
      if (!companyName || !companyName.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Le nom de l\'entreprise est requis pour les clients professionnels'
        });
      }
      if (!siret || siret.length !== 14) {
        return res.status(400).json({
          success: false,
          error: 'Le numéro SIRET est requis et doit contenir 14 chiffres'
        });
      }
    }

    // Check if user already exists
    let user = await User.findOne({ where: { firebaseUid } });
    
    if (user) {
      // Update existing user
      const updateData = {
        email,
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        photoURL: photoURL || user.photoURL,
        emailVerified: emailVerified !== undefined ? emailVerified : user.emailVerified,
        phone: phone || user.phone,
        clientType: clientType || user.clientType
      };

      // Add business fields if professionnel
      if (clientType === 'professionnel') {
        updateData.companyName = companyName || user.companyName;
        updateData.siret = siret || user.siret;
        updateData.vatNumber = vatNumber || user.vatNumber;
        updateData.billingAddress = billingAddress || user.billingAddress;
        updateData.billingCity = billingCity || user.billingCity;
        updateData.billingPostalCode = billingPostalCode || user.billingPostalCode;
        updateData.billingCountry = billingCountry || user.billingCountry || 'France';
      }

      await user.update(updateData);
    } else {
      // Create new user
      const userData = {
        firebaseUid,
        email,
        firstName: firstName || '',
        lastName: lastName || '',
        photoURL: photoURL || null,
        emailVerified: emailVerified || false,
        phone: phone || null,
        role: 'client',
        clientType: clientType || 'particulier',
        isActive: true
      };

      // Add business fields if professionnel
      if (clientType === 'professionnel') {
        userData.companyName = companyName;
        userData.siret = siret;
        userData.vatNumber = vatNumber || null;
        userData.billingAddress = billingAddress || null;
        userData.billingCity = billingCity || null;
        userData.billingPostalCode = billingPostalCode || null;
        userData.billingCountry = billingCountry || 'France';
      }

      user = await User.create(userData);

      // Send welcome email to new user
      try {
        await emailService.sendWelcomeEmail(user.email, user.firstName || user.displayName || 'Client');
      } catch (emailError) {
        console.error('❌ Error sending welcome email:', emailError);
      }

      // Notify admin of new user registration
      if (notificationService) {
        try {
          await notificationService.notifyUserRegistration(user.id);
          await notificationService.createDefaultPreferences(user.id);
        } catch (notifError) {
          console.error('❌ Error sending registration notification:', notifError);
        }
      }
    }

    res.json({
      success: true,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('❌ Error registering Firebase user:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement de l\'utilisateur'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', firebaseAuth, async (req, res) => {
  try {
    const firebaseUid = req.firebaseUser.uid;
    const user = await User.findOne({ where: { firebaseUid } });
    
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
    console.error('❌ Error getting user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du profil'
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', firebaseAuth, [
  body('displayName').optional().trim(),
  body('photoURL').optional({ checkFalsy: true }).trim().isURL({ require_tld: false }).withMessage('URL de photo invalide'),
  body('firstName').optional().trim(),
  body('lastName').optional().trim(),
  body('phone').optional().trim(),
  body('clientType').optional().isIn(['particulier', 'professionnel']).withMessage('Type de client invalide'),
  body('companyName').optional().trim(),
  body('siret').optional({ checkFalsy: true }).trim().isLength({ min: 14, max: 14 }).withMessage('Le SIRET doit contenir 14 chiffres'),
  body('vatNumber').optional().trim(),
  body('billingAddress').optional().trim(),
  body('billingCity').optional().trim(),
  body('billingPostalCode').optional().trim(),
  body('billingCountry').optional().trim()
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

    const firebaseUid = req.firebaseUser.uid;
    const user = await User.findOne({ where: { firebaseUid } });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Prepare update data
    const updateData = { ...req.body };

    // Handle phone number updates - REMOVED: Phone numbers now require SMS verification
    // Phone numbers should be added/changed through dedicated verification routes
    if (req.body.phone) {
      if (!user.phone) {
        // First-time phone addition requires SMS verification
        return res.status(400).json({
          success: false,
          error: 'L\'ajout d\'un numéro de téléphone nécessite une vérification par SMS. Entrez votre numéro et cliquez sur "Vérifier" pour recevoir un code.'
        });
      } else if (req.body.phone !== user.phone) {
        // Phone number change requires SMS verification
        return res.status(400).json({
          success: false,
          error: 'Le changement de numéro de téléphone nécessite une vérification par SMS. Utilisez l\'option "Changer" dans votre profil.'
        });
      }
      // If phone is the same, remove it from updateData (no change needed)
      delete updateData.phone;
    }

    // Validate professional fields if changing to professionnel
    if (updateData.clientType === 'professionnel') {
      if (!updateData.companyName || !updateData.companyName.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Le nom de l\'entreprise est requis pour les clients professionnels'
        });
      }
      if (!updateData.siret || updateData.siret.length !== 14) {
        return res.status(400).json({
          success: false,
          error: 'Le numéro SIRET est requis et doit contenir 14 chiffres'
        });
      }
    }

    // If photoURL is being replaced or cleared, remember the old one so we
    // can purge it from S3 after the DB write succeeds.
    const previousPhotoURL =
      Object.prototype.hasOwnProperty.call(req.body, 'photoURL') &&
      user.photoURL && user.photoURL !== updateData.photoURL
        ? user.photoURL
        : null;

    // Update user in database
    await user.update(updateData);

    if (previousPhotoURL) {
      deleteImageByURL(previousPhotoURL).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      user: user.toJSON()
    });

  } catch (error) {
    console.error('❌ Error updating profile:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du profil'
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', loginLimiter, firebaseAuth, [
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis'),
  body('newPassword').isLength({ min: 8 }).withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
    .matches(/[A-Z]/).withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[0-9]/).withMessage('Le mot de passe doit contenir au moins un chiffre')
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

    const firebaseUid = req.firebaseUser.uid;
    const { currentPassword, newPassword } = req.body;

    // Verify current password via Firebase REST API (Admin SDK cannot verify passwords)
    const firebaseUser = await admin.auth().getUser(firebaseUid);
    const firebaseApiKey = process.env.FIREBASE_API_KEY;

    if (!firebaseApiKey) {
      return res.status(500).json({
        success: false,
        error: 'Configuration serveur incomplète'
      });
    }

    try {
      const fetch = (await import('node-fetch')).default;
      const verifyResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: firebaseUser.email,
            password: currentPassword,
            returnSecureToken: false
          })
        }
      );

      if (!verifyResponse.ok) {
        return res.status(401).json({
          success: false,
          error: 'Mot de passe actuel incorrect'
        });
      }
    } catch (verifyError) {
      return res.status(401).json({
        success: false,
        error: 'Mot de passe actuel incorrect'
      });
    }

    // Current password verified — update to new password
    await admin.auth().updateUser(firebaseUid, {
      password: newPassword
    });

    res.json({
      success: true,
      message: 'Mot de passe modifié avec succès'
    });
  } catch (error) {
    console.error('Error changing password:', error.code || error.message);

    if (error.code === 'auth/weak-password') {
      return res.status(400).json({
        success: false,
        error: 'Le mot de passe est trop faible.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Erreur lors du changement de mot de passe'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', passwordResetLimiter, [
  body('email').isEmail().withMessage('Email invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: 'Email invalide',
        details: errors.array() 
      });
    }

    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) {
      // Don't reveal if user exists (security)
      return res.json({
        success: true,
        message: 'Si cet email existe, un lien de réinitialisation a été envoyé.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await user.update({
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetTokenExpiry
    });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
    const emailResult = await emailService.sendPasswordResetEmail(
      user.email,
      `${user.firstName} ${user.lastName}`,
      resetToken,
      resetUrl
    );

    if (!emailResult.success) {
      console.warn('⚠️ Failed to send password reset email, but token was generated');
    }

    res.json({
      success: true,
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé.'
    });
  } catch (error) {
    console.error('❌ Error in forgot password:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi de l\'email de réinitialisation'
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', passwordResetLimiter, [
  body('token').notEmpty().withMessage('Token requis'),
  body('password').isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/[A-Z]/).withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[0-9]/).withMessage('Le mot de passe doit contenir au moins un chiffre')
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

    const { token, password } = req.body;
    const user = await User.findOne({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: {
          [Op.gt]: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Token invalide ou expiré'
      });
    }

    // Note: Password reset is handled by Firebase Auth on the frontend
    // This endpoint is kept for consistency but may not be used
    
    await user.update({
      resetPasswordToken: null,
      resetPasswordExpires: null
    });

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });
  } catch (error) {
    console.error('❌ Error resetting password:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la réinitialisation du mot de passe'
    });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email address with token
// @access  Public
router.post('/verify-email', verificationLimiter, [
  body('token').notEmpty().withMessage('Token requis')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: 'Token requis',
        details: errors.array() 
      });
    }

    const { token } = req.body;
    
    // Find verification code
    const codeRecord = await VerificationCode.findOne({
      where: {
        code: token,
        type: 'email_verification',
        used: false,
        expiresAt: {
          [Op.gt]: new Date()
        }
      }
    });

    if (!codeRecord) {
      return res.status(400).json({
        success: false,
        error: 'Token invalide ou expiré'
      });
    }

    // Get user
    const user = await User.findByPk(codeRecord.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Mark code as used
    await codeRecord.update({ used: true });

    // Update user email verification status
    await user.update({ emailVerified: true });

    res.json({
      success: true,
      message: 'Email vérifié avec succès'
    });
  } catch (error) {
    console.error('❌ Error verifying email:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification de l\'email'
    });
  }
});

// @route   POST /api/auth/send-phone-verification
// @desc    Send verification SMS for current phone number (required before any changes)
// @access  Private
router.post('/send-phone-verification', verificationLimiter, firebaseAuth, async (req, res) => {
  try {
    const firebaseUid = req.firebaseUser.uid;

    // Get user from database
    const user = await User.findOne({ where: { firebaseUid } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Check if user has a phone number
    if (!user.phone) {
      return res.status(400).json({
        success: false,
        error: 'Vous devez d\'abord ajouter un numéro de téléphone'
      });
    }

    // Generate 6-digit verification code
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    
    // Set expiration time (10 minutes from now)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // For debugging - show verification code in console
    console.log('🔐 Generated verification code:', verificationCode);
    console.log('⏰ Code expires at:', expiresAt);

    // Save verification code to database (no newPhoneNumber yet)
    await VerificationCode.create({
      userId: user.id,
      email: user.email,
      code: verificationCode,
      type: 'phone_verification',
      expiresAt: expiresAt,
      newPhoneNumber: null
    });

    // Send verification SMS for current phone number
    console.log('📱 Attempting to send verification SMS to:', user.phone);
    console.log('📱 User details:', {
      email: user.email,
      name: user.displayName || user.firstName,
      phone: user.phone
    });
    
    const smsResult = await smsService.sendVerificationSMS(
      user.phone,
      verificationCode
    );

    console.log('📱 Current phone verification SMS result:', smsResult);

    // Check if SMS was sent successfully
    if (!smsResult.success) {
      console.error('❌ SMS sending failed:', smsResult.error);
      console.error('❌ SMS error details:', smsResult);
      
      // Return error so user knows SMS wasn't sent
      // In development, show the actual error
      return res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' 
          ? `Erreur SMS: ${smsResult.error}` 
          : 'Impossible d\'envoyer le SMS. Vérifiez votre configuration Twilio.',
        debug: process.env.NODE_ENV === 'development' ? {
          error: smsResult.error,
          code: verificationCode,
          phone: user.phone
        } : undefined
      });
    }

    res.json({
      success: true,
      message: 'SMS de vérification envoyé avec succès',
      expiresIn: '10 minutes'
    });

  } catch (error) {
    console.error('❌ Error sending phone verification SMS:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi du SMS de vérification'
    });
  }
});

// @route   POST /api/auth/verify-current-phone
// @desc    Verify current phone number with code (required before any changes)
// @access  Private
router.post('/verify-current-phone', firebaseAuth, [
  body('verificationCode').isLength({ min: 6, max: 6 }).withMessage('Code de vérification invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: 'Code de vérification invalide',
        details: errors.array() 
      });
    }

    const { verificationCode } = req.body;
    const firebaseUid = req.firebaseUser.uid;

    // Get user from database
    const user = await User.findOne({ where: { firebaseUid } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Find valid verification code
    const codeRecord = await VerificationCode.findOne({
      where: {
        userId: user.id,
        code: verificationCode,
        type: 'phone_verification',
        used: false,
        expiresAt: {
          [Op.gt]: new Date()
        },
        newPhoneNumber: null // Current phone verification
      }
    });

    if (!codeRecord) {
      return res.status(400).json({
        success: false,
        error: 'Code de vérification invalide ou expiré'
      });
    }

    // Mark code as used
    await codeRecord.update({ used: true });

    res.json({
      success: true,
      message: 'Numéro de téléphone actuel vérifié avec succès',
      verified: true
    });

  } catch (error) {
    console.error('❌ Error verifying current phone:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification du numéro actuel'
    });
  }
});

// @route   POST /api/auth/set-new-phone
// @desc    Send verification OTP to new phone number (requires current phone verified)
// @access  Private
router.post('/set-new-phone', firebaseAuth, [
  body('newPhoneNumber').custom((value) => {
    // Accept international phone numbers
    if (!value || value.length < 10) {
      throw new Error('Le numéro de téléphone doit contenir au moins 10 chiffres');
    }
    // Basic validation for international format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(value)) {
      throw new Error('Le numéro de téléphone doit être au format international (ex: +33678398091)');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Numéro de téléphone invalide',
        details: errors.array()
      });
    }

    const { newPhoneNumber } = req.body;
    const firebaseUid = req.firebaseUser.uid;

    // Get user from database
    const user = await User.findOne({ where: { firebaseUid } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Check if user has a phone number
    if (!user.phone) {
      return res.status(400).json({
        success: false,
        error: 'Vous devez d\'abord ajouter un numéro de téléphone'
      });
    }

    if (user.phone === newPhoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Le nouveau numéro de téléphone doit être différent de l\'actuel'
      });
    }

    // Check if new phone number is already used by another user
    const existingUser = await User.findOne({
      where: {
        phone: newPhoneNumber,
        id: { [Op.ne]: user.id }
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Ce numéro de téléphone est déjà utilisé par un autre compte'
      });
    }

    // Generate 6-digit verification code and send to NEW number
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save verification code with the new phone number
    await VerificationCode.create({
      userId: user.id,
      email: user.email,
      code: verificationCode,
      type: 'phone_verification',
      expiresAt: expiresAt,
      newPhoneNumber: newPhoneNumber
    });

    // Send OTP to the new phone number
    const smsResult = await smsService.sendVerificationSMS(
      newPhoneNumber,
      verificationCode
    );

    if (!smsResult.success) {
      return res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development'
          ? `Erreur SMS: ${smsResult.error}`
          : 'Impossible d\'envoyer le SMS de vérification.',
        debug: process.env.NODE_ENV === 'development' ? {
          error: smsResult.error,
          code: verificationCode
        } : undefined
      });
    }

    // Do NOT update phone yet — wait for verify-new-phone to confirm the OTP
    res.json({
      success: true,
      message: 'Un code de vérification a été envoyé au nouveau numéro',
      requiresVerification: true,
      expiresIn: '10 minutes'
    });

  } catch (error) {
    console.error('Error sending new phone verification:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi du code de vérification'
    });
  }
});

// @route   DELETE /api/auth/remove-phone
// @desc    Remove user's phone number (requires previous verification)
// @access  Private
router.delete('/remove-phone', firebaseAuth, async (req, res) => {
  try {
    const firebaseUid = req.firebaseUser.uid;

    // Get user from database
    const user = await User.findOne({ where: { firebaseUid } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Check if user has a phone number
    if (!user.phone) {
      return res.status(400).json({
        success: false,
        error: 'Aucun numéro de téléphone à supprimer'
      });
    }

    // Remove phone number
    await user.update({ phone: null });

    // Update Firebase custom claims
    try {
      await admin.auth().setCustomUserClaims(firebaseUid, {
        phone: null
      });
      console.log('✅ Firebase custom claims updated (phone removed)');
    } catch (firebaseError) {
      console.error('❌ Error updating Firebase custom claims:', firebaseError);
    }

    res.json({
      success: true,
      message: 'Numéro de téléphone supprimé avec succès'
    });

  } catch (error) {
    console.error('❌ Error removing phone number:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du numéro de téléphone'
    });
  }
});

// @route   POST /api/auth/send-new-phone-verification
// @desc    Send verification SMS to a new phone number (for first-time addition)
// @access  Private
router.post('/send-new-phone-verification', verificationLimiter, firebaseAuth, [
  body('newPhoneNumber').custom((value) => {
    if (!value || value.length < 10) {
      throw new Error('Le numéro de téléphone doit contenir au moins 10 chiffres');
    }
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(value)) {
      throw new Error('Le numéro de téléphone doit être au format international (ex: +33678398091)');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: 'Numéro de téléphone invalide',
        details: errors.array() 
      });
    }

    const { newPhoneNumber } = req.body;
    const firebaseUid = req.firebaseUser.uid;

    // Get user from database
    const user = await User.findOne({ where: { firebaseUid } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Check if phone number already exists for another user
    const existingUser = await User.findOne({ 
      where: { 
        phone: newPhoneNumber,
        id: { [require('sequelize').Op.ne]: user.id }
      } 
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Ce numéro de téléphone est déjà utilisé par un autre compte'
      });
    }

    // Generate 6-digit verification code
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    console.log('🔐 Generated verification code for new phone:', verificationCode);
    console.log('📱 New phone number:', newPhoneNumber);
    console.log('⏰ Code expires at:', expiresAt);

    // Save verification code to database with new phone number
    await VerificationCode.create({
      userId: user.id,
      email: user.email,
      code: verificationCode,
      type: 'phone_verification',
      expiresAt: expiresAt,
      newPhoneNumber: newPhoneNumber
    });

    // Send verification SMS to the new phone number
    console.log('📱 Attempting to send verification SMS to new phone:', newPhoneNumber);
    
    const smsResult = await smsService.sendVerificationSMS(
      newPhoneNumber,
      verificationCode
    );

    console.log('📱 New phone verification SMS result:', smsResult);

    // Check if SMS was sent successfully
    if (!smsResult.success) {
      console.error('❌ SMS sending failed:', smsResult.error);
      return res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' 
          ? `Erreur SMS: ${smsResult.error}` 
          : 'Impossible d\'envoyer le SMS. Vérifiez votre configuration Twilio.',
        debug: process.env.NODE_ENV === 'development' ? {
          error: smsResult.error,
          code: verificationCode
        } : undefined
      });
    }

    res.json({
      success: true,
      message: 'SMS de vérification envoyé avec succès',
      expiresIn: '10 minutes'
    });

  } catch (error) {
    console.error('❌ Error sending new phone verification SMS:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi du SMS de vérification'
    });
  }
});

// @route   POST /api/auth/verify-new-phone
// @desc    Verify new phone number with code and save it
// @access  Private
router.post('/verify-new-phone', firebaseAuth, [
  body('verificationCode').isLength({ min: 6, max: 6 }).withMessage('Code de vérification invalide'),
  body('newPhoneNumber').custom((value) => {
    if (!value || value.length < 10) {
      throw new Error('Le numéro de téléphone doit contenir au moins 10 chiffres');
    }
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(value)) {
      throw new Error('Le numéro de téléphone doit être au format international (ex: +33678398091)');
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

    const { verificationCode, newPhoneNumber } = req.body;
    const firebaseUid = req.firebaseUser.uid;

    // Get user from database
    const user = await User.findOne({ where: { firebaseUid } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Find valid verification code for this new phone number
    const { Op } = require('sequelize');
    const codeRecord = await VerificationCode.findOne({
      where: {
        userId: user.id,
        code: verificationCode,
        newPhoneNumber: newPhoneNumber,
        type: 'phone_verification',
        used: false,
        expiresAt: {
          [Op.gt]: new Date()
        }
      }
    });

    if (!codeRecord) {
      return res.status(400).json({
        success: false,
        error: 'Code de vérification invalide ou expiré'
      });
    }

    // Mark code as used
    await codeRecord.update({ used: true });

    // Delete all verification codes for this user
    await VerificationCode.destroy({
      where: {
        userId: user.id,
        type: 'phone_verification'
      }
    });

    // Update user's phone number
    await user.update({ phone: newPhoneNumber });

    // Update Firebase custom claims
    try {
      await admin.auth().setCustomUserClaims(firebaseUid, {
        phone: newPhoneNumber
      });
      console.log('✅ Firebase custom claims updated with new phone number');
    } catch (firebaseError) {
      console.error('❌ Error updating Firebase custom claims:', firebaseError);
    }

    res.json({
      success: true,
      message: 'Numéro de téléphone vérifié et enregistré avec succès',
      phone: newPhoneNumber
    });

  } catch (error) {
    console.error('❌ Error verifying new phone:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification du numéro de téléphone'
    });
  }
});

// @route   PUT /api/auth/notification-preferences
// @desc    Update notification preferences
// @access  Private
router.put('/notification-preferences', firebaseAuth, async (req, res) => {
  try {
    const firebaseUid = req.firebaseUser.uid;
    const user = await User.findOne({ where: { firebaseUid } });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const { emailNotifications, marketingEmails, orderUpdates, newsletter } = req.body;

    const preferences = {
      ...(user.notificationSettings || {}),
      emailNotifications: emailNotifications !== undefined ? Boolean(emailNotifications) : true,
      marketingEmails: marketingEmails !== undefined ? Boolean(marketingEmails) : false,
      orderUpdates: orderUpdates !== undefined ? Boolean(orderUpdates) : true,
      newsletter: newsletter !== undefined ? Boolean(newsletter) : false
    };

    await user.update({ notificationSettings: preferences });

    res.json({
      success: true,
      message: 'Préférences de notification mises à jour',
      notificationSettings: preferences
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour des préférences'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Server-side logout — revoke all Firebase refresh tokens
// @access  Private
router.post('/logout', firebaseAuth, async (req, res) => {
  try {
    const firebaseUid = req.firebaseUser.uid;

    // Revoke all refresh tokens for this user
    await admin.auth().revokeRefreshTokens(firebaseUid);

    // Reset failed login attempts on explicit logout
    if (req.user) {
      await req.user.update({ failedLoginAttempts: 0, accountLockedUntil: null });
    }

    res.json({ success: true, message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la déconnexion' });
  }
});

module.exports = { router, setNotificationService };
