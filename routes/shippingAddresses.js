const express = require('express');
const { body, validationResult } = require('express-validator');
const ShippingAddress = require('../models/ShippingAddress');
const User = require('../models/User');
const firebaseAuth = require('../middleware/firebaseAuth');

const router = express.Router();

// @route   GET /api/shipping-addresses
// @desc    Get user's shipping addresses
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

    const shippingAddresses = await ShippingAddress.findAll({
      where: { userId: user.id, isActive: true },
      order: [['isDefault', 'DESC'], ['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      shippingAddresses: shippingAddresses.map(addr => addr.toJSON())
    });

  } catch (error) {
    console.error('Error fetching shipping addresses:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la récupération des adresses de livraison' 
    });
  }
});

// @route   POST /api/shipping-addresses
// @desc    Add new shipping address
// @access  Private
router.post('/', [
  firebaseAuth,
  body('name').notEmpty().withMessage('Nom de l\'adresse requis'),
  body('firstName').notEmpty().withMessage('Prénom requis'),
  body('lastName').notEmpty().withMessage('Nom de famille requis'),
  body('address').notEmpty().withMessage('Adresse requise'),
  body('city').notEmpty().withMessage('Ville requise'),
  body('postalCode').notEmpty().withMessage('Code postal requis'),
  body('phone').notEmpty().withMessage('Téléphone requis')
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

    const { name, firstName, lastName, address, city, postalCode, country, phone } = req.body;

    // If this is the first address, make it default
    const existingAddresses = await ShippingAddress.count({
      where: { userId: user.id, isActive: true }
    });

    const shippingAddress = await ShippingAddress.create({
      userId: user.id,
      name,
      firstName,
      lastName,
      address,
      city,
      postalCode,
      country: country || 'France',
      phone,
      isDefault: existingAddresses === 0
    });

    res.status(201).json({
      success: true,
      message: 'Adresse de livraison ajoutée avec succès',
      shippingAddress: shippingAddress.toJSON()
    });

  } catch (error) {
    console.error('Error adding shipping address:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de l\'ajout de l\'adresse de livraison' 
    });
  }
});

// @route   PUT /api/shipping-addresses/:id
// @desc    Update shipping address
// @access  Private
router.put('/:id', [
  firebaseAuth,
  body('name').notEmpty().withMessage('Nom de l\'adresse requis'),
  body('firstName').notEmpty().withMessage('Prénom requis'),
  body('lastName').notEmpty().withMessage('Nom de famille requis'),
  body('address').notEmpty().withMessage('Adresse requise'),
  body('city').notEmpty().withMessage('Ville requise'),
  body('postalCode').notEmpty().withMessage('Code postal requis'),
  body('phone').notEmpty().withMessage('Téléphone requis')
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

    const shippingAddress = await ShippingAddress.findOne({
      where: { id: req.params.id, userId: user.id }
    });

    if (!shippingAddress) {
      return res.status(404).json({
        success: false,
        message: 'Adresse de livraison non trouvée'
      });
    }

    const { name, firstName, lastName, address, city, postalCode, country, phone } = req.body;

    await shippingAddress.update({
      name,
      firstName,
      lastName,
      address,
      city,
      postalCode,
      country: country || 'France',
      phone
    });

    res.json({
      success: true,
      message: 'Adresse de livraison mise à jour avec succès',
      shippingAddress: shippingAddress.toJSON()
    });

  } catch (error) {
    console.error('Error updating shipping address:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la mise à jour de l\'adresse de livraison' 
    });
  }
});

// @route   DELETE /api/shipping-addresses/:id
// @desc    Delete shipping address
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

    const shippingAddress = await ShippingAddress.findOne({
      where: { id: req.params.id, userId: user.id }
    });

    if (!shippingAddress) {
      return res.status(404).json({
        success: false,
        message: 'Adresse de livraison non trouvée'
      });
    }

    const isDefault = shippingAddress.isDefault;

    await shippingAddress.update({ isActive: false });

    // If we deleted the default address, set the first remaining one as default
    if (isDefault) {
      const nextDefault = await ShippingAddress.findOne({
        where: { userId: user.id, isActive: true },
        order: [['createdAt', 'ASC']]
      });

      if (nextDefault) {
        await nextDefault.update({ isDefault: true });
      }
    }

    res.json({
      success: true,
      message: 'Adresse de livraison supprimée avec succès'
    });

  } catch (error) {
    console.error('Error deleting shipping address:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la suppression de l\'adresse de livraison' 
    });
  }
});

// @route   PUT /api/shipping-addresses/:id/default
// @desc    Set shipping address as default
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

    // Remove default from all shipping addresses
    await ShippingAddress.update(
      { isDefault: false },
      { where: { userId: user.id, isActive: true } }
    );

    // Set the selected one as default
    const shippingAddress = await ShippingAddress.findOne({
      where: { id: req.params.id, userId: user.id, isActive: true }
    });

    if (!shippingAddress) {
      return res.status(404).json({
        success: false,
        message: 'Adresse de livraison non trouvée'
      });
    }

    await shippingAddress.update({ isDefault: true });

    res.json({
      success: true,
      message: 'Adresse de livraison par défaut mise à jour'
    });

  } catch (error) {
    console.error('Error setting default shipping address:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la mise à jour de l\'adresse de livraison par défaut' 
    });
  }
});

module.exports = router; 