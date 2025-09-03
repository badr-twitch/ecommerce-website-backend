const axios = require('axios');
const { Review } = require('../models');

class TrustpilotService {
  constructor() {
    this.apiKey = process.env.TRUSTPILOT_API_KEY;
    this.businessUnitId = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
    this.baseUrl = 'https://api.trustpilot.com/v1';
    this.webhookSecret = process.env.TRUSTPILOT_WEBHOOK_SECRET;
    
    if (!this.apiKey || !this.businessUnitId) {
      console.warn('⚠️ Trustpilot API credentials not configured. Reviews will not sync to Trustpilot.');
    }
  }

  // Check if Trustpilot is configured
  isConfigured() {
    return !!(this.apiKey && this.businessUnitId);
  }

  // Get Trustpilot API headers
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  // Submit a review to Trustpilot
  async submitReview(reviewData) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Trustpilot not configured');
      }

      const payload = {
        stars: reviewData.rating,
        title: reviewData.title,
        text: reviewData.content,
        referenceId: reviewData.id.toString(),
        consumer: {
          email: reviewData.userEmail,
          name: reviewData.userName
        },
        locale: 'fr-FR', // French locale for French market
        tags: reviewData.tags || []
      };

      const response = await axios.post(
        `${this.baseUrl}/business-units/${this.businessUnitId}/reviews`,
        payload,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        trustpilotId: response.data.id,
        data: response.data
      };

    } catch (error) {
      console.error('❌ Trustpilot review submission failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        statusCode: error.response?.status
      };
    }
  }

  // Update an existing review on Trustpilot
  async updateReview(trustpilotId, reviewData) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Trustpilot not configured');
      }

      const payload = {
        stars: reviewData.rating,
        title: reviewData.title,
        text: reviewData.content,
        tags: reviewData.tags || []
      };

      const response = await axios.put(
        `${this.baseUrl}/reviews/${trustpilotId}`,
        payload,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('❌ Trustpilot review update failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        statusCode: error.response?.status
      };
    }
  }

  // Delete a review from Trustpilot
  async deleteReview(trustpilotId) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Trustpilot not configured');
      }

      await axios.delete(
        `${this.baseUrl}/reviews/${trustpilotId}`,
        { headers: this.getHeaders() }
      );

      return { success: true };

    } catch (error) {
      console.error('❌ Trustpilot review deletion failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        statusCode: error.response?.status
      };
    }
  }

  // Get reviews from Trustpilot
  async getReviews(options = {}) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Trustpilot not configured');
      }

      const params = new URLSearchParams({
        stars: options.stars || '',
        language: options.language || 'fr',
        perPage: options.perPage || 20,
        page: options.page || 1
      });

      const response = await axios.get(
        `${this.baseUrl}/business-units/${this.businessUnitId}/reviews?${params}`,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        reviews: response.data.reviews,
        pagination: response.data.pagination
      };

    } catch (error) {
      console.error('❌ Trustpilot reviews fetch failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        statusCode: error.response?.status
      };
    }
  }

  // Get business unit statistics
  async getBusinessStats() {
    try {
      if (!this.isConfigured()) {
        throw new Error('Trustpilot not configured');
      }

      const response = await axios.get(
        `${this.baseUrl}/business-units/${this.businessUnitId}`,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('❌ Trustpilot business stats fetch failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        statusCode: error.response?.status
      };
    }
  }

  // Sync a review to Trustpilot
  async syncReviewToTrustpilot(reviewId) {
    try {
      const review = await Review.findByPk(reviewId, {
        include: [
          {
            model: require('../models').User,
            as: 'user',
            attributes: ['firstName', 'lastName', 'email']
          },
          {
            model: require('../models').Product,
            as: 'product',
            attributes: ['name', 'id']
          }
        ]
      });

      if (!review) {
        throw new Error('Review not found');
      }

      if (review.status !== 'approved') {
        throw new Error('Only approved reviews can be synced to Trustpilot');
      }

      // Prepare review data for Trustpilot
      const reviewData = {
        id: review.id,
        rating: review.rating,
        title: review.title,
        content: review.content,
        userEmail: review.user?.email,
        userName: `${review.user?.firstName || ''} ${review.user?.lastName || ''}`.trim(),
        tags: review.tags || [],
        productName: review.product?.name
      };

      // Submit to Trustpilot
      const result = await this.submitReview(reviewData);

      if (result.success) {
        // Mark as synced in our database
        await review.markTrustpilotSynced(result.trustpilotId);
        console.log(`✅ Review ${reviewId} synced to Trustpilot successfully`);
        
        return {
          success: true,
          trustpilotId: result.trustpilotId,
          message: 'Review synced to Trustpilot successfully'
        };
      } else {
        // Mark as failed
        await review.markTrustpilotFailed();
        console.log(`❌ Review ${reviewId} failed to sync to Trustpilot:`, result.error);
        
        return {
          success: false,
          error: result.error,
          message: 'Failed to sync review to Trustpilot'
        };
      }

    } catch (error) {
      console.error('❌ Review sync to Trustpilot failed:', error.message);
      
      // Mark as failed
      const review = await Review.findByPk(reviewId);
      if (review) {
        await review.markTrustpilotFailed();
      }
      
      return {
        success: false,
        error: error.message,
        message: 'Review sync to Trustpilot failed'
      };
    }
  }

  // Process Trustpilot webhook
  async processWebhook(webhookData, signature) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(webhookData, signature)) {
        throw new Error('Invalid webhook signature');
      }

      const { event, data } = webhookData;

      switch (event) {
        case 'review.created':
          await this.handleReviewCreated(data);
          break;
        case 'review.updated':
          await this.handleReviewUpdated(data);
          break;
        case 'review.deleted':
          await this.handleReviewDeleted(data);
          break;
        default:
          console.log(`ℹ️ Unhandled Trustpilot webhook event: ${event}`);
      }

      return { success: true, message: 'Webhook processed successfully' };

    } catch (error) {
      console.error('❌ Trustpilot webhook processing failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Handle review created webhook
  async handleReviewCreated(data) {
    try {
      const { review } = data;
      
      // Check if we already have this review
      const existingReview = await Review.findOne({
        where: { trustpilotId: review.id }
      });

      if (existingReview) {
        console.log(`ℹ️ Review ${review.id} already exists in our system`);
        return;
      }

      // Create new review from Trustpilot
      const newReview = await Review.create({
        title: review.title || 'Review from Trustpilot',
        content: review.text || '',
        rating: review.stars,
        status: 'approved', // Trustpilot reviews are pre-moderated
        trustpilotId: review.id,
        trustpilotStatus: 'synced',
        verifiedPurchase: false, // We don't know if it's verified
        createdAt: new Date(review.createdAt),
        updatedAt: new Date(review.updatedAt)
      });

      console.log(`✅ Created review from Trustpilot: ${review.id}`);
      
      return newReview;

    } catch (error) {
      console.error('❌ Failed to create review from Trustpilot:', error.message);
      throw error;
    }
  }

  // Handle review updated webhook
  async handleReviewUpdated(data) {
    try {
      const { review } = data;
      
      const existingReview = await Review.findOne({
        where: { trustpilotId: review.id }
      });

      if (!existingReview) {
        console.log(`ℹ️ Review ${review.id} not found in our system, creating new one`);
        return await this.handleReviewCreated(data);
      }

      // Update existing review
      await existingReview.update({
        title: review.title || existingReview.title,
        content: review.text || existingReview.content,
        rating: review.stars,
        updatedAt: new Date(review.updatedAt)
      });

      console.log(`✅ Updated review from Trustpilot: ${review.id}`);
      
      return existingReview;

    } catch (error) {
      console.error('❌ Failed to update review from Trustpilot:', error.message);
      throw error;
    }
  }

  // Handle review deleted webhook
  async handleReviewDeleted(data) {
    try {
      const { review } = data;
      
      const existingReview = await Review.findOne({
        where: { trustpilotId: review.id }
      });

      if (!existingReview) {
        console.log(`ℹ️ Review ${review.id} not found in our system`);
        return;
      }

      // Mark as rejected (soft delete)
      await existingReview.update({
        status: 'rejected',
        moderationNotes: 'Review deleted on Trustpilot'
      });

      console.log(`✅ Marked review as rejected: ${review.id}`);
      
      return existingReview;

    } catch (error) {
      console.error('❌ Failed to handle review deletion from Trustpilot:', error.message);
      throw error;
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(webhookData, signature) {
    if (!this.webhookSecret) {
      console.warn('⚠️ Trustpilot webhook secret not configured, skipping signature verification');
      return true;
    }

    // Implement HMAC signature verification
    // This is a simplified version - you should implement proper HMAC verification
    return true; // Placeholder for now
  }

  // Get Trustpilot business rating
  async getBusinessRating() {
    try {
      const stats = await this.getBusinessStats();
      
      if (!stats.success) {
        throw new Error(stats.error);
      }

      return {
        success: true,
        rating: stats.data.score,
        totalReviews: stats.data.numberOfReviews,
        trustScore: stats.data.trustScore
      };

    } catch (error) {
      console.error('❌ Failed to get Trustpilot business rating:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Sync all pending reviews to Trustpilot
  async syncPendingReviews() {
    try {
      const pendingReviews = await Review.findAll({
        where: {
          status: 'approved',
          trustpilotStatus: 'not_synced'
        },
        limit: 50 // Process in batches
      });

      console.log(`🔄 Syncing ${pendingReviews.length} pending reviews to Trustpilot...`);

      const results = [];
      for (const review of pendingReviews) {
        const result = await this.syncReviewToTrustpilot(review.id);
        results.push({ reviewId: review.id, ...result });
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      console.log(`✅ Sync completed: ${successCount} successful, ${failureCount} failed`);

      return {
        success: true,
        total: pendingReviews.length,
        successful: successCount,
        failed: failureCount,
        results
      };

    } catch (error) {
      console.error('❌ Bulk review sync failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = TrustpilotService;
