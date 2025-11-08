const express = require('express');
const { Op } = require('sequelize');
const firebaseAuth = require('../middleware/firebaseAuth');
const User = require('../models/User');
const membershipPlan = require('../config/membershipPlan');

const router = express.Router();

const getUserFromRequest = async (req) => {
  if (req.user) {
    return req.user;
  }

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

router.get('/plan', (req, res) => {
  return res.json({
    success: true,
    data: membershipPlan,
  });
});

router.get('/status', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur introuvable',
      });
    }

    const {
      membershipStatus,
      membershipPlan: plan,
      membershipActivatedAt,
      membershipExpiresAt,
      membershipAutoRenew,
      membershipPrice,
      membershipCurrency,
      membershipBenefitsSnapshot,
    } = user;

    res.json({
      success: true,
      data: {
        membershipStatus,
        membershipPlan: plan,
        membershipActivatedAt,
        membershipExpiresAt,
        membershipAutoRenew,
        membershipPrice,
        membershipCurrency,
        membershipBenefitsSnapshot,
      },
    });
  } catch (error) {
    console.error('❌ Membership status error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du statut d’abonnement',
    });
  }
});

router.post('/subscribe', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur introuvable',
      });
    }

    const autoRenew = req.body?.autoRenew ?? true;

    const activationDate = new Date();
    const expirationDate = new Date(
      activationDate.getTime() + membershipPlan.billingCycleDays * 24 * 60 * 60 * 1000,
    );

    user.membershipStatus = 'active';
    user.membershipPlan = membershipPlan.id;
    user.membershipActivatedAt = activationDate;
    user.membershipExpiresAt = expirationDate;
    user.membershipAutoRenew = autoRenew;
    user.membershipPrice = membershipPlan.price;
    user.membershipCurrency = membershipPlan.currency;
    user.membershipBenefitsSnapshot = {
      perks: membershipPlan.perks,
      bonuses: membershipPlan.bonuses,
      highlight: membershipPlan.highlight,
    };

    await user.save();

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
      },
    });
  } catch (error) {
    console.error('❌ Membership subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Impossible d’activer l’abonnement pour le moment',
    });
  }
});

router.post('/cancel', firebaseAuth, async (req, res) => {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur introuvable',
      });
    }

    if (user.membershipStatus === 'none') {
      return res.status(400).json({
        success: false,
        error: 'Aucun abonnement actif à annuler',
      });
    }

    user.membershipAutoRenew = false;
    user.membershipStatus = 'cancelled';

    await user.save();

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
    res.status(500).json({
      success: false,
      error: 'Impossible d’annuler l’abonnement pour le moment',
    });
  }
});

module.exports = router;

