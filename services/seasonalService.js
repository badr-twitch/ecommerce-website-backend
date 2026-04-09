const campaigns = require('../config/seasonalOffers');

class SeasonalService {
  /**
   * Get currently active seasonal offers.
   */
  getActiveOffers() {
    const now = new Date();
    return campaigns.filter(c => {
      const start = new Date(c.startDate);
      const end = new Date(c.endDate);
      return now >= start && now <= end;
    });
  }

  /**
   * Get total extra discount for Prime members during active seasonal campaigns.
   */
  getMemberExtraDiscount() {
    const active = this.getActiveOffers();
    if (active.length === 0) return 0;
    // Use the highest extra discount among active campaigns
    return Math.max(...active.map(c => c.memberExtraDiscount || 0));
  }

  /**
   * Get all campaigns (for admin or preview).
   */
  getAllCampaigns() {
    return campaigns;
  }
}

module.exports = new SeasonalService();
