const User = require('../models/User');

const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 5000,
  gold: 20000,
  platinum: 50000
};

const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum'];

const POINTS_PER_DH = 1; // Base: 1 point per DH spent
const MEMBER_MULTIPLIER = 2; // Prime members earn 2x
const REDEMPTION_RATE = 50; // 1000 points = 50 DH

class LoyaltyService {
  /**
   * Award points after an order is placed.
   * @param {object} user - User instance
   * @param {number} orderAmount - Order total in DH
   * @param {boolean} isMember - Whether user has active Prime membership
   * @returns {object} - { pointsEarned, newBalance, newTier, tierUpgrade }
   */
  async awardPoints(user, orderAmount, isMember = false) {
    const multiplier = isMember ? MEMBER_MULTIPLIER : POINTS_PER_DH;
    const pointsEarned = Math.floor(orderAmount * multiplier);

    if (pointsEarned <= 0) return { pointsEarned: 0, newBalance: user.loyaltyPoints, newTier: user.loyaltyTier, tierUpgrade: false };

    const newBalance = (user.loyaltyPoints || 0) + pointsEarned;
    const newTotal = (user.totalLoyaltyPointsEarned || 0) + pointsEarned;
    const oldTier = user.loyaltyTier || 'bronze';
    const newTier = this.calculateTier(newTotal);
    const tierUpgrade = TIER_ORDER.indexOf(newTier) > TIER_ORDER.indexOf(oldTier);

    await user.update({
      loyaltyPoints: newBalance,
      totalLoyaltyPointsEarned: newTotal,
      loyaltyTier: newTier
    });

    return { pointsEarned, newBalance, newTier, tierUpgrade, oldTier };
  }

  /**
   * Redeem points for a voucher.
   * @param {object} user - User instance
   * @param {number} pointsToRedeem - Must be multiple of 1000
   * @returns {object} - { voucherAmount, remainingPoints }
   */
  async redeemPoints(user, pointsToRedeem) {
    if (pointsToRedeem < 1000 || pointsToRedeem % 1000 !== 0) {
      throw new Error('Le nombre de points doit être un multiple de 1000.');
    }

    if ((user.loyaltyPoints || 0) < pointsToRedeem) {
      throw new Error('Points insuffisants.');
    }

    const voucherAmount = (pointsToRedeem / 1000) * REDEMPTION_RATE;
    const remainingPoints = user.loyaltyPoints - pointsToRedeem;

    await user.update({ loyaltyPoints: remainingPoints });

    return { voucherAmount, remainingPoints, pointsRedeemed: pointsToRedeem };
  }

  /**
   * Calculate tier based on total lifetime points.
   */
  calculateTier(totalPoints) {
    if (totalPoints >= TIER_THRESHOLDS.platinum) return 'platinum';
    if (totalPoints >= TIER_THRESHOLDS.gold) return 'gold';
    if (totalPoints >= TIER_THRESHOLDS.silver) return 'silver';
    return 'bronze';
  }

  /**
   * Get loyalty info for a user.
   */
  getLoyaltyInfo(user) {
    const currentTier = user.loyaltyTier || 'bronze';
    const currentTierIndex = TIER_ORDER.indexOf(currentTier);
    const nextTier = currentTierIndex < TIER_ORDER.length - 1 ? TIER_ORDER[currentTierIndex + 1] : null;
    const nextTierThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : null;
    const totalEarned = user.totalLoyaltyPointsEarned || 0;
    const progressToNextTier = nextTierThreshold
      ? Math.min(100, Math.round(((totalEarned - TIER_THRESHOLDS[currentTier]) / (nextTierThreshold - TIER_THRESHOLDS[currentTier])) * 100))
      : 100;

    return {
      points: user.loyaltyPoints || 0,
      tier: currentTier,
      totalEarned,
      nextTier,
      nextTierThreshold,
      progressToNextTier,
      redeemableVouchers: Math.floor((user.loyaltyPoints || 0) / 1000),
      voucherValue: REDEMPTION_RATE,
      tiers: TIER_THRESHOLDS
    };
  }
}

module.exports = new LoyaltyService();
