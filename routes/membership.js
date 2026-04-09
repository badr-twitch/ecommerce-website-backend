const express = require('express');
const { Op } = require('sequelize');
const firebaseAuth = require('../middleware/firebaseAuth');
const User = require('../models/User');
const { plans, sharedConfig, getPlan, getDefaultPlan } = require('../config/membershipPlan');
const membershipService = require('../services/membershipService');

const router = express.Router();
const { writeLimiter } = require('../middleware/rateLimiter');

let notificationService = null;
const setNotificationService = (ns) => {
  notificationService = ns;
  membershipService.setNotificationService(ns);
};

const getUserFromRequest = async (req) => {
  if (req.user) return req.user;
  if (req.firebaseUser?.uid) {
    return User.findOne({
      where: {
        [Op.or]: [
          { firebaseUid: req.firebaseUser.uid },
          { email: req.firebaseUser.email },
        ],
      },
    });
  }
  return null;
};

// GET /membership/plan — Public (returns all plans + shared config)
router.get('/plan', (req, res) => {
  res.json({ success: true, data: { plans, ...sharedConfig } });
});

// GET /membership/status — Authenticated
router.get('/status', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    res.json({
      success: true,
      data: {
        membershipStatus: user.membershipStatus,
        membershipPlan: user.membershipPlan,
        membershipActivatedAt: user.membershipActivatedAt,
        membershipExpiresAt: user.membershipExpiresAt,
        membershipAutoRenew: user.membershipAutoRenew,
        membershipPrice: user.membershipPrice,
        membershipCurrency: user.membershipCurrency,
        membershipBenefitsSnapshot: user.membershipBenefitsSnapshot,
      },
    });
  } catch (error) {
    console.error('❌ Membership status error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération du statut' });
  }
});

// POST /membership/subscribe — Authenticated
router.post('/subscribe', writeLimiter, firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    if (user.membershipStatus === 'active') {
      return res.status(400).json({
        success: false,
        error: 'Un abonnement UMOD Prime est déjà actif sur ce compte.',
      });
    }

    const { paymentMethodId, autoRenew = true, planId } = req.body || {};

    // Resolve selected plan or default to monthly
    const selectedPlan = planId ? getPlan(planId) : getDefaultPlan();
    if (!selectedPlan) {
      return res.status(400).json({ success: false, error: 'Plan invalide.' });
    }

    const result = await membershipService.subscribe(user, paymentMethodId, selectedPlan, autoRenew);

    // Reload user to get updated fields
    await user.reload();

    res.json({
      success: true,
      message: 'Bienvenue dans UMOD Prime !',
      data: {
        membershipStatus: user.membershipStatus,
        membershipPlan: user.membershipPlan,
        membershipActivatedAt: user.membershipActivatedAt,
        membershipExpiresAt: user.membershipExpiresAt,
        membershipAutoRenew: user.membershipAutoRenew,
        membershipPrice: user.membershipPrice,
        membershipCurrency: user.membershipCurrency,
        chargedPaymentMethod: {
          id: result.paymentMethod.id,
          last4: result.paymentMethod.last4,
          brand: result.paymentMethod.brand,
        },
        payment: result.paymentResult,
      },
    });
  } catch (error) {
    console.error('❌ Membership subscription error:', error);

    // Distinguish payment errors from other errors
    if (error.type === 'StripeCardError' || error.code?.startsWith('card_')) {
      return res.status(402).json({
        success: false,
        error: error.message || 'Le paiement a échoué. Vérifiez votre carte.',
      });
    }

    res.status(error.message?.includes('méthode de paiement') ? 400 : 500).json({
      success: false,
      error: error.message || 'Impossible d\'activer l\'abonnement pour le moment',
    });
  }
});

// POST /membership/cancel — Authenticated
router.post('/cancel', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    if (user.membershipStatus === 'none') {
      return res.status(400).json({ success: false, error: 'Aucun abonnement actif à annuler' });
    }

    await membershipService.cancel(user);

    res.json({
      success: true,
      message: 'Votre abonnement UMOD Prime sera désactivé à la fin de la période en cours.',
      data: {
        membershipStatus: user.membershipStatus,
        membershipExpiresAt: user.membershipExpiresAt,
        membershipAutoRenew: user.membershipAutoRenew,
      },
    });
  } catch (error) {
    console.error('❌ Membership cancellation error:', error);
    res.status(500).json({ success: false, error: 'Impossible d\'annuler l\'abonnement' });
  }
});

// POST /membership/reactivate — Re-subscribe after cancellation/expiry
router.post('/reactivate', writeLimiter, firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    if (user.membershipStatus === 'active') {
      return res.status(400).json({ success: false, error: 'L\'abonnement est déjà actif.' });
    }

    const { paymentMethodId, planId } = req.body || {};
    const selectedPlan = planId ? getPlan(planId) : getDefaultPlan();
    if (!selectedPlan) {
      return res.status(400).json({ success: false, error: 'Plan invalide.' });
    }
    await membershipService.reactivate(user, paymentMethodId, selectedPlan);
    await user.reload();

    res.json({
      success: true,
      message: 'Votre abonnement UMOD Prime est réactivé !',
      data: {
        membershipStatus: user.membershipStatus,
        membershipExpiresAt: user.membershipExpiresAt,
        membershipAutoRenew: user.membershipAutoRenew,
      },
    });
  } catch (error) {
    console.error('❌ Membership reactivation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Impossible de réactiver l\'abonnement' });
  }
});

// POST /membership/toggle-auto-renew — Toggle without full cancel
router.post('/toggle-auto-renew', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    if (user.membershipStatus === 'none') {
      return res.status(400).json({ success: false, error: 'Aucun abonnement actif.' });
    }

    const newValue = await membershipService.toggleAutoRenew(user);
    await user.reload();

    res.json({
      success: true,
      message: newValue ? 'Renouvellement automatique activé.' : 'Renouvellement automatique désactivé.',
      data: {
        membershipAutoRenew: user.membershipAutoRenew,
        membershipStatus: user.membershipStatus,
      },
    });
  } catch (error) {
    console.error('❌ Toggle auto-renew error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la modification' });
  }
});

// GET /membership/transactions — User's payment history
router.get('/transactions', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    const transactions = await membershipService.getTransactionHistory(user.id);
    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('❌ Membership transactions error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération de l\'historique' });
  }
});

// POST /membership/refund — 30-day guarantee
router.post('/refund', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    await membershipService.refundMembership(user);

    res.json({
      success: true,
      message: 'Remboursement effectué. Le montant sera crédité sous 5 à 10 jours ouvrés.',
    });
  } catch (error) {
    console.error('❌ Membership refund error:', error);
    res.status(400).json({ success: false, error: error.message || 'Impossible de rembourser' });
  }
});

// ─── Seasonal Offers ───────────────────────────────────────────

const seasonalService = require('../services/seasonalService');

// GET /membership/seasonal-offers — Public
router.get('/seasonal-offers', (req, res) => {
  const activeOffers = seasonalService.getActiveOffers();
  res.json({ success: true, data: activeOffers });
});

// ─── Loyalty Points ────────────────────────────────────────────

const loyaltyService = require('../services/loyaltyService');

// GET /membership/loyalty — Get loyalty info
router.get('/loyalty', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    const info = loyaltyService.getLoyaltyInfo(user);
    res.json({ success: true, data: info });
  } catch (error) {
    console.error('❌ Loyalty info error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des points' });
  }
});

// POST /membership/loyalty/redeem — Redeem points for voucher
router.post('/loyalty/redeem', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    const { points } = req.body || {};
    if (!points || points < 1000) {
      return res.status(400).json({ success: false, error: 'Minimum 1000 points requis.' });
    }

    const result = await loyaltyService.redeemPoints(user, points);
    res.json({
      success: true,
      message: `Bon de ${result.voucherAmount} DH généré !`,
      data: result
    });
  } catch (error) {
    console.error('❌ Loyalty redeem error:', error);
    res.status(400).json({ success: false, error: error.message || 'Impossible de convertir les points' });
  }
});

// ─── Gift Membership ───────────────────────────────────────────

const MembershipGift = require('../models/MembershipGift');
const crypto = require('crypto');

function generateGiftCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 char code
}

// POST /membership/gift — Purchase a gift membership
router.post('/gift', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    const { recipientEmail, recipientName, personalMessage, planId, paymentMethodId } = req.body || {};
    if (!recipientEmail || !planId) {
      return res.status(400).json({ success: false, error: 'Email du destinataire et plan requis.' });
    }

    const { getPlan } = require('../config/membershipPlan');
    const selectedPlan = getPlan(planId);
    if (!selectedPlan) {
      return res.status(400).json({ success: false, error: 'Plan invalide.' });
    }

    // Charge sender's payment method
    const PaymentMethod = require('../models/PaymentMethod');
    const paymentProcessor = require('../services/paymentProcessor');

    let pm;
    if (paymentMethodId) {
      pm = await PaymentMethod.findOne({ where: { id: paymentMethodId, userId: user.id, isActive: true } });
    } else {
      pm = await PaymentMethod.findOne({ where: { userId: user.id, isActive: true, isDefault: true } });
    }
    if (!pm) {
      return res.status(400).json({ success: false, error: 'Méthode de paiement introuvable.' });
    }

    const customer = await paymentProcessor.getOrCreateCustomer(user);
    const amountInCentimes = Math.round(selectedPlan.price * 100);
    const stripePaymentMethodId = pm.processorId || pm.stripePaymentMethodId;

    const paymentResult = await paymentProcessor.chargePaymentMethod(
      amountInCentimes,
      selectedPlan.currency,
      stripePaymentMethodId,
      customer.id,
      { type: 'membership_gift', planId: selectedPlan.id, recipientEmail }
    );

    const gift = await MembershipGift.create({
      code: generateGiftCode(),
      senderUserId: user.id,
      recipientEmail,
      recipientName: recipientName || '',
      personalMessage: personalMessage || '',
      planId: selectedPlan.id,
      durationDays: selectedPlan.billingCycleDays,
      amount: selectedPlan.price,
      currency: selectedPlan.currency,
      stripePaymentIntentId: paymentResult.paymentIntentId,
      status: 'paid',
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days to redeem
    });

    res.json({
      success: true,
      message: 'Carte cadeau créée avec succès !',
      data: {
        code: gift.code,
        recipientEmail: gift.recipientEmail,
        amount: gift.amount,
        currency: gift.currency,
        expiresAt: gift.expiresAt
      }
    });
  } catch (error) {
    console.error('❌ Gift membership error:', error);
    res.status(500).json({ success: false, error: error.message || 'Erreur lors de la création du cadeau' });
  }
});

// POST /membership/gift/redeem — Redeem a gift code
router.post('/gift/redeem', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    const { code } = req.body || {};
    if (!code) {
      return res.status(400).json({ success: false, error: 'Code cadeau requis.' });
    }

    const gift = await MembershipGift.findOne({ where: { code: code.toUpperCase(), status: 'paid' } });
    if (!gift) {
      return res.status(404).json({ success: false, error: 'Code cadeau invalide ou déjà utilisé.' });
    }

    if (new Date(gift.expiresAt) < new Date()) {
      await gift.update({ status: 'expired' });
      return res.status(400).json({ success: false, error: 'Ce code cadeau a expiré.' });
    }

    if (user.membershipStatus === 'active') {
      return res.status(400).json({ success: false, error: 'Vous avez déjà un abonnement actif.' });
    }

    // Activate membership for recipient
    const activationDate = new Date();
    const expirationDate = new Date(activationDate.getTime() + gift.durationDays * 24 * 60 * 60 * 1000);

    await user.update({
      membershipStatus: 'active',
      membershipPlan: gift.planId,
      membershipActivatedAt: activationDate,
      membershipExpiresAt: expirationDate,
      membershipAutoRenew: false,
      membershipPrice: gift.amount,
      membershipCurrency: gift.currency
    });

    await gift.update({
      status: 'redeemed',
      redeemedByUserId: user.id,
      redeemedAt: new Date()
    });

    const MembershipTransaction = require('../models/MembershipTransaction');
    await MembershipTransaction.create({
      userId: user.id,
      type: 'subscription',
      amount: gift.amount,
      currency: gift.currency,
      stripePaymentIntentId: gift.stripePaymentIntentId,
      status: 'succeeded',
      planId: gift.planId,
      billingPeriodStart: activationDate,
      billingPeriodEnd: expirationDate,
      metadata: { giftCode: gift.code, giftId: gift.id }
    });

    res.json({
      success: true,
      message: 'Code cadeau activé ! Bienvenue dans UMOD Prime.',
      data: {
        membershipStatus: 'active',
        membershipExpiresAt: expirationDate
      }
    });
  } catch (error) {
    console.error('❌ Gift redeem error:', error);
    res.status(500).json({ success: false, error: error.message || 'Erreur lors de l\'activation du cadeau' });
  }
});

module.exports = { router, setNotificationService };
