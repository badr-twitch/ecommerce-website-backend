const express = require('express');
const { body, validationResult } = require('express-validator');
const PaymentMethod = require('../models/PaymentMethod');
const User = require('../models/User');
const firebaseAuth = require('../middleware/firebaseAuth');
const paymentProcessor = require('../services/paymentProcessor');

const router = express.Router();

// @route   GET /api/payment-methods
// @desc    Get user's payment methods
// @access  Private
router.get('/', firebaseAuth, async (req, res) => {
  try {
    const user = await User.findOne({ 
      where: { firebaseUid: req.firebaseUser.uid } 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const paymentMethods = await PaymentMethod.findAll({
      where: { userId: user.id, isActive: true },
      order: [['isDefault', 'DESC'], ['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      paymentMethods: paymentMethods.map(pm => pm.toJSON())
    });

  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la récupération des méthodes de paiement' 
    });
  }
});

// @route   POST /api/payment-methods
// @desc    Add new payment method
// @access  Private
router.post('/', [
  firebaseAuth,
  body('cardNumber').notEmpty().withMessage('Numéro de carte requis'),
  body('expiry').matches(/^\d{2}\/\d{2}$/).withMessage('Format de date invalide (MM/YY)'),
  body('cardholderName').notEmpty().withMessage('Nom du titulaire requis'),
  body('cvv').isLength({ min: 3, max: 4 }).withMessage('Code CVV requis')
], async (req, res) => {
  try {
    console.log('🔍 Payment Method - Request body:', req.body);
    console.log('🔍 Payment Method - Validation errors:', validationResult(req).array());
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Payment Method - Validation failed:', errors.array());
      return res.status(400).json({ 
        success: false,
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const user = await User.findOne({ 
      where: { firebaseUid: req.firebaseUser.uid } 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const { cardNumber, expiry, cardholderName, cvv } = req.body;

    // Use payment processor to securely handle card data
    const processorResult = await paymentProcessor.createPaymentMethod({
      cardNumber,
      expiry,
      cardholderName,
      cvv
    });

    // If this is the first payment method, make it default
    const existingMethods = await PaymentMethod.count({
      where: { userId: user.id, isActive: true }
    });

    // Store only safe information in database
    const paymentMethod = await PaymentMethod.create({
      userId: user.id,
      processorId: processorResult.processorId,
      processorType: 'stripe', // or your chosen processor
      type: processorResult.type,
      last4: processorResult.last4,
      expiry: processorResult.expiry,
      cardholderName: processorResult.cardholderName,
      brand: processorResult.brand,
      isDefault: existingMethods === 0
    });

    res.status(201).json({
      success: true,
      message: 'Méthode de paiement ajoutée avec succès',
      paymentMethod: paymentMethod.toJSON()
    });

  } catch (error) {
    console.error('Error adding payment method:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Erreur lors de l\'ajout de la méthode de paiement' 
    });
  }
});

// @route   PUT /api/payment-methods/:id
// @desc    Update payment method
// @access  Private
router.put('/:id', [
  firebaseAuth,
  body('type').notEmpty().withMessage('Type de carte requis'),
  body('last4').isLength({ min: 4, max: 4 }).withMessage('Les 4 derniers chiffres sont requis'),
  body('expiry').matches(/^\d{2}\/\d{2}$/).withMessage('Format de date invalide (MM/YY)'),
  body('cardholderName').notEmpty().withMessage('Nom du titulaire requis')
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

    const user = await User.findOne({ 
      where: { firebaseUid: req.firebaseUser.uid } 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const paymentMethod = await PaymentMethod.findOne({
      where: { id: req.params.id, userId: user.id }
    });

    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Méthode de paiement non trouvée'
      });
    }

    const { type, last4, expiry, cardholderName } = req.body;

    await paymentMethod.update({
      type,
      last4,
      expiry,
      cardholderName
    });

    res.json({
      success: true,
      message: 'Méthode de paiement mise à jour avec succès',
      paymentMethod: paymentMethod.toJSON()
    });

  } catch (error) {
    console.error('Error updating payment method:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la mise à jour de la méthode de paiement' 
    });
  }
});

// @route   DELETE /api/payment-methods/:id
// @desc    Delete payment method
// @access  Private
router.delete('/:id', firebaseAuth, async (req, res) => {
  try {
    const user = await User.findOne({ 
      where: { firebaseUid: req.firebaseUser.uid } 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const paymentMethod = await PaymentMethod.findOne({
      where: { id: req.params.id, userId: user.id }
    });

    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Méthode de paiement non trouvée'
      });
    }

    const isDefault = paymentMethod.isDefault;

    // Delete from payment processor first
    if (paymentMethod.processorId) {
      await paymentProcessor.deletePaymentMethod(paymentMethod.processorId);
    }

    // Then mark as inactive in our database
    await paymentMethod.update({ isActive: false });

    // If we deleted the default method, set the first remaining one as default
    if (isDefault) {
      const nextDefault = await PaymentMethod.findOne({
        where: { userId: user.id, isActive: true },
        order: [['createdAt', 'ASC']]
      });

      if (nextDefault) {
        await nextDefault.update({ isDefault: true });
      }
    }

    res.json({
      success: true,
      message: 'Méthode de paiement supprimée avec succès'
    });

  } catch (error) {
    console.error('Error deleting payment method:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la suppression de la méthode de paiement' 
    });
  }
});

// @route   PUT /api/payment-methods/:id/default
// @desc    Set payment method as default
// @access  Private
router.put('/:id/default', firebaseAuth, async (req, res) => {
  try {
    const user = await User.findOne({ 
      where: { firebaseUid: req.firebaseUser.uid } 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Remove default from all payment methods
    await PaymentMethod.update(
      { isDefault: false },
      { where: { userId: user.id, isActive: true } }
    );

    // Set the selected one as default
    const paymentMethod = await PaymentMethod.findOne({
      where: { id: req.params.id, userId: user.id, isActive: true }
    });

    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Méthode de paiement non trouvée'
      });
    }

    await paymentMethod.update({ isDefault: true });

    res.json({
      success: true,
      message: 'Méthode de paiement par défaut mise à jour'
    });

  } catch (error) {
    console.error('Error setting default payment method:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la mise à jour de la méthode de paiement par défaut' 
    });
  }
});

module.exports = router; 