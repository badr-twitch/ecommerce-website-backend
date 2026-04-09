const { Op } = require('sequelize');
const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');
const MembershipTransaction = require('../models/MembershipTransaction');
const paymentProcessor = require('./paymentProcessor');

class MembershipService {
  constructor(notificationService = null) {
    this.notificationService = notificationService;
  }

  setNotificationService(ns) {
    this.notificationService = ns;
  }

  /**
   * Check if a user has an active membership.
   */
  isMemberActive(user) {
    return (
      user.membershipStatus === 'active' &&
      user.membershipExpiresAt &&
      new Date(user.membershipExpiresAt) > new Date()
    );
  }

  /**
   * Subscribe a user to a membership plan.
   */
  async subscribe(user, paymentMethodId, planConfig, autoRenew = true) {
    // Get or create Stripe customer
    const customer = await paymentProcessor.getOrCreateCustomer(user);

    // Find the payment method
    let paymentMethod;
    if (paymentMethodId) {
      paymentMethod = await PaymentMethod.findOne({
        where: { id: paymentMethodId, userId: user.id, isActive: true }
      });
    } else {
      paymentMethod = await PaymentMethod.findOne({
        where: { userId: user.id, isActive: true, isDefault: true }
      });
      if (!paymentMethod) {
        paymentMethod = await PaymentMethod.findOne({
          where: { userId: user.id, isActive: true },
          order: [['createdAt', 'DESC']]
        });
      }
    }

    if (!paymentMethod) {
      throw new Error('Ajoutez une méthode de paiement pour activer UMOD Prime.');
    }

    // Charge the payment method
    const amountInCentimes = Math.round(planConfig.price * 100);
    const stripePaymentMethodId = paymentMethod.processorId || paymentMethod.stripePaymentMethodId;

    const paymentResult = await paymentProcessor.chargePaymentMethod(
      amountInCentimes,
      planConfig.currency,
      stripePaymentMethodId,
      customer.id,
      { type: 'membership', planId: planConfig.id, userId: user.id }
    );

    // Calculate dates
    const activationDate = new Date();
    const expirationDate = new Date(
      activationDate.getTime() + planConfig.billingCycleDays * 24 * 60 * 60 * 1000
    );

    // Update user
    await user.update({
      membershipStatus: 'active',
      membershipPlan: planConfig.id,
      membershipActivatedAt: activationDate,
      membershipExpiresAt: expirationDate,
      membershipAutoRenew: autoRenew,
      membershipPrice: planConfig.price,
      membershipCurrency: planConfig.currency,
      membershipBenefitsSnapshot: {
        perks: planConfig.perks,
        bonuses: planConfig.bonuses,
        highlight: planConfig.highlight,
        chargedPaymentMethod: {
          id: paymentMethod.id,
          last4: paymentMethod.last4,
          brand: paymentMethod.brand,
          cardholderName: paymentMethod.cardholderName
        },
        lastTransaction: paymentResult
      }
    });

    // Log transaction
    await MembershipTransaction.create({
      userId: user.id,
      type: 'subscription',
      amount: planConfig.price,
      currency: planConfig.currency,
      stripePaymentIntentId: paymentResult.paymentIntentId,
      status: 'succeeded',
      planId: planConfig.id,
      billingPeriodStart: activationDate,
      billingPeriodEnd: expirationDate,
      metadata: { paymentMethodLast4: paymentMethod.last4 }
    });

    // Notify
    if (this.notificationService) {
      try {
        await this.notificationService.createNotification({
          userId: user.id,
          type: 'membership',
          title: 'Bienvenue dans UMOD Prime !',
          message: `Votre abonnement UMOD Prime est actif jusqu'au ${expirationDate.toLocaleDateString('fr-FR')}.`,
          data: { membershipStatus: 'active' }
        });
      } catch (e) {
        console.error('Notification error:', e.message);
      }
    }

    return { paymentResult, activationDate, expirationDate, paymentMethod };
  }

  /**
   * Cancel auto-renewal (membership stays active until expiry).
   */
  async cancel(user) {
    await user.update({
      membershipAutoRenew: false,
      membershipStatus: 'cancelled'
    });

    await MembershipTransaction.create({
      userId: user.id,
      type: 'cancellation',
      amount: 0,
      currency: user.membershipCurrency || 'MAD',
      status: 'succeeded',
      planId: user.membershipPlan,
      billingPeriodStart: user.membershipActivatedAt,
      billingPeriodEnd: user.membershipExpiresAt
    });

    if (this.notificationService) {
      try {
        await this.notificationService.createNotification({
          userId: user.id,
          type: 'membership',
          title: 'Renouvellement désactivé',
          message: `Votre abonnement restera actif jusqu'au ${new Date(user.membershipExpiresAt).toLocaleDateString('fr-FR')}.`,
          data: { membershipStatus: 'cancelled' }
        });
      } catch (e) {
        console.error('Notification error:', e.message);
      }
    }
  }

  /**
   * Reactivate a cancelled or expired membership.
   */
  async reactivate(user, paymentMethodId, planConfig) {
    return this.subscribe(user, paymentMethodId, planConfig, true);
  }

  /**
   * Auto-renew: charge the saved payment method and extend expiration.
   */
  async renewMembership(user, planConfig) {
    // Find the payment method used for the original subscription
    const snapshot = user.membershipBenefitsSnapshot || {};
    const savedPmId = snapshot.chargedPaymentMethod?.id;

    let paymentMethod;
    if (savedPmId) {
      paymentMethod = await PaymentMethod.findOne({
        where: { id: savedPmId, userId: user.id, isActive: true }
      });
    }
    if (!paymentMethod) {
      paymentMethod = await PaymentMethod.findOne({
        where: { userId: user.id, isActive: true, isDefault: true }
      });
    }
    if (!paymentMethod) {
      paymentMethod = await PaymentMethod.findOne({
        where: { userId: user.id, isActive: true },
        order: [['createdAt', 'DESC']]
      });
    }

    if (!paymentMethod) {
      throw new Error('NO_PAYMENT_METHOD');
    }

    const customer = await paymentProcessor.getOrCreateCustomer(user);
    const amountInCentimes = Math.round(planConfig.price * 100);
    const stripePaymentMethodId = paymentMethod.processorId || paymentMethod.stripePaymentMethodId;

    const paymentResult = await paymentProcessor.chargePaymentMethod(
      amountInCentimes,
      planConfig.currency,
      stripePaymentMethodId,
      customer.id,
      { type: 'membership_renewal', planId: planConfig.id, userId: user.id }
    );

    const newStart = new Date();
    const newExpiry = new Date(newStart.getTime() + planConfig.billingCycleDays * 24 * 60 * 60 * 1000);

    await user.update({
      membershipStatus: 'active',
      membershipExpiresAt: newExpiry,
      membershipAutoRenew: true,
      membershipBenefitsSnapshot: {
        ...snapshot,
        lastTransaction: paymentResult
      }
    });

    await MembershipTransaction.create({
      userId: user.id,
      type: 'renewal',
      amount: planConfig.price,
      currency: planConfig.currency,
      stripePaymentIntentId: paymentResult.paymentIntentId,
      status: 'succeeded',
      planId: planConfig.id,
      billingPeriodStart: newStart,
      billingPeriodEnd: newExpiry,
      metadata: { paymentMethodLast4: paymentMethod.last4 }
    });

    if (this.notificationService) {
      try {
        await this.notificationService.createNotification({
          userId: user.id,
          type: 'membership',
          title: 'Abonnement renouvelé',
          message: `Votre UMOD Prime a été renouvelé jusqu'au ${newExpiry.toLocaleDateString('fr-FR')}.`,
          data: { membershipStatus: 'active' }
        });
      } catch (e) {
        console.error('Notification error:', e.message);
      }
    }

    return paymentResult;
  }

  /**
   * Expire a membership (called by cron when auto-renew is off).
   */
  async expireMembership(user) {
    await user.update({ membershipStatus: 'expired' });

    await MembershipTransaction.create({
      userId: user.id,
      type: 'expiration',
      amount: 0,
      currency: user.membershipCurrency || 'MAD',
      status: 'succeeded',
      planId: user.membershipPlan
    });

    if (this.notificationService) {
      try {
        await this.notificationService.createNotification({
          userId: user.id,
          type: 'membership',
          title: 'Abonnement expiré',
          message: 'Votre abonnement UMOD Prime a expiré. Réactivez-le pour retrouver vos avantages.',
          data: { membershipStatus: 'expired' }
        });
      } catch (e) {
        console.error('Notification error:', e.message);
      }
    }
  }

  /**
   * Refund a membership (30-day guarantee).
   */
  async refundMembership(user) {
    if (!user.membershipActivatedAt) {
      throw new Error('Aucun abonnement à rembourser.');
    }

    const daysSinceActivation = (Date.now() - new Date(user.membershipActivatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActivation > 30) {
      throw new Error('La période de remboursement de 30 jours est dépassée.');
    }

    // Find the original payment intent
    const originalTx = await MembershipTransaction.findOne({
      where: {
        userId: user.id,
        type: { [Op.in]: ['subscription', 'renewal'] },
        status: 'succeeded'
      },
      order: [['createdAt', 'DESC']]
    });

    if (originalTx?.stripePaymentIntentId) {
      await paymentProcessor.refundPayment(originalTx.stripePaymentIntentId);
      await originalTx.update({ status: 'refunded' });
    }

    await user.update({
      membershipStatus: 'none',
      membershipPlan: null,
      membershipActivatedAt: null,
      membershipExpiresAt: null,
      membershipAutoRenew: true,
      membershipPrice: null,
      membershipBenefitsSnapshot: null
    });

    await MembershipTransaction.create({
      userId: user.id,
      type: 'refund',
      amount: user.membershipPrice || 0,
      currency: user.membershipCurrency || 'MAD',
      stripePaymentIntentId: originalTx?.stripePaymentIntentId,
      status: 'refunded',
      planId: originalTx?.planId
    });

    if (this.notificationService) {
      try {
        await this.notificationService.createNotification({
          userId: user.id,
          type: 'membership',
          title: 'Remboursement effectué',
          message: 'Votre abonnement UMOD Prime a été remboursé. Le montant sera crédité sous 5 à 10 jours ouvrés.',
          data: { membershipStatus: 'none' }
        });
      } catch (e) {
        console.error('Notification error:', e.message);
      }
    }
  }

  /**
   * Toggle auto-renew without full cancellation.
   */
  async toggleAutoRenew(user) {
    const newValue = !user.membershipAutoRenew;
    await user.update({ membershipAutoRenew: newValue });

    // If turning off auto-renew, also set status to cancelled
    if (!newValue && user.membershipStatus === 'active') {
      await user.update({ membershipStatus: 'cancelled' });
    }
    // If turning on, set back to active (if not expired)
    if (newValue && user.membershipStatus === 'cancelled' && new Date(user.membershipExpiresAt) > new Date()) {
      await user.update({ membershipStatus: 'active' });
    }

    return newValue;
  }

  /**
   * Get transaction history for a user.
   */
  async getTransactionHistory(userId) {
    return MembershipTransaction.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 50
    });
  }
}

module.exports = new MembershipService();
