const express = require('express');
const { validationResult } = require('express-validator');
const PaymentMethod = require('../models/PaymentMethod');
const User = require('../models/User');
const firebaseAuth = require('../middleware/firebaseAuth');
const paymentProcessor = require('../services/paymentProcessor');

const router = express.Router();

// Helper: find user from Firebase UID
async function findUser(req, res) {
  const user = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    return null;
  }
  return user;
}

// @route   GET /api/payment-methods
// @desc    Get user's saved payment methods
// @access  Private
router.get('/', firebaseAuth, async (req, res) => {
  try {
    const user = await findUser(req, res);
    if (!user) return;

    // If user has a Stripe customer, fetch fresh data from Stripe
    if (user.stripeCustomerId) {
      const stripeMethods = await paymentProcessor.listPaymentMethods(user.stripeCustomerId);

      const paymentMethods = stripeMethods.map(pm => ({
        id: pm.id,
        type: 'card',
        brand: pm.card.brand,
        last4: pm.card.last4,
        expiry: `${String(pm.card.exp_month).padStart(2, '0')}/${String(pm.card.exp_year).slice(-2)}`,
        cardholderName: pm.billing_details.name || '',
        isDefault: false
      }));

      return res.json({ success: true, paymentMethods });
    }

    // Fallback: return from local DB (for cards saved before Stripe migration)
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

// @route   POST /api/payment-methods/setup-intent
// @desc    Create a Stripe SetupIntent so frontend can save a card
// @access  Private
router.post('/setup-intent', firebaseAuth, async (req, res) => {
  try {
    const user = await findUser(req, res);
    if (!user) return;

    // Ensure user has a Stripe customer
    const customer = await paymentProcessor.getOrCreateCustomer(user);

    const { clientSecret } = await paymentProcessor.createSetupIntent(customer.id);

    res.json({ success: true, clientSecret });
  } catch (error) {
    console.error('Error creating setup intent:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors de la création du setup intent'
    });
  }
});

// @route   DELETE /api/payment-methods/:id
// @desc    Remove a saved payment method
// @access  Private
router.delete('/:id', firebaseAuth, async (req, res) => {
  try {
    const user = await findUser(req, res);
    if (!user) return;

    const { id } = req.params;

    // Try to detach from Stripe first (id is a Stripe PaymentMethod ID like pm_xxx)
    if (id.startsWith('pm_')) {
      await paymentProcessor.detachPaymentMethod(id);
      return res.json({ success: true, message: 'Méthode de paiement supprimée avec succès' });
    }

    // Fallback: local DB record
    const paymentMethod = await PaymentMethod.findOne({
      where: { id, userId: user.id }
    });

    if (!paymentMethod) {
      return res.status(404).json({ success: false, message: 'Méthode de paiement non trouvée' });
    }

    if (paymentMethod.processorId) {
      try {
        await paymentProcessor.detachPaymentMethod(paymentMethod.processorId);
      } catch (e) {
        // Stripe method may already be detached
        console.warn('Could not detach from Stripe:', e.message);
      }
    }

    await paymentMethod.update({ isActive: false });

    // If deleted the default, promote the next one
    if (paymentMethod.isDefault) {
      const nextDefault = await PaymentMethod.findOne({
        where: { userId: user.id, isActive: true },
        order: [['createdAt', 'ASC']]
      });
      if (nextDefault) {
        await nextDefault.update({ isDefault: true });
      }
    }

    res.json({ success: true, message: 'Méthode de paiement supprimée avec succès' });
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
    const user = await findUser(req, res);
    if (!user) return;

    // If user has Stripe customer, update default payment method there
    if (user.stripeCustomerId && req.params.id.startsWith('pm_')) {
      await paymentProcessor.getStripe().customers.update(user.stripeCustomerId, {
        invoice_settings: { default_payment_method: req.params.id }
      });
      return res.json({ success: true, message: 'Méthode de paiement par défaut mise à jour' });
    }

    // Fallback: local DB
    await PaymentMethod.update(
      { isDefault: false },
      { where: { userId: user.id, isActive: true } }
    );

    const paymentMethod = await PaymentMethod.findOne({
      where: { id: req.params.id, userId: user.id, isActive: true }
    });

    if (!paymentMethod) {
      return res.status(404).json({ success: false, message: 'Méthode de paiement non trouvée' });
    }

    await paymentMethod.update({ isDefault: true });

    res.json({ success: true, message: 'Méthode de paiement par défaut mise à jour' });
  } catch (error) {
    console.error('Error setting default payment method:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour de la méthode de paiement par défaut'
    });
  }
});

module.exports = router;
